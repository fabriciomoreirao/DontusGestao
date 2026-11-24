using System.Collections.Concurrent;
using System.Net.Http.Headers;
using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Dontus.Operations.Infrastructure;

public sealed record WorkspaceUpload(string Name, string ContentType, long Size, string Module, Guid? SourceId = null);
public sealed record WorkspaceFile(Guid Id, string Name, string ContentType, long Size, string Module, Guid? SourceId, string Owner, DateTimeOffset CreatedAt, bool Complete);

/// <summary>Private, disk-backed files. Transfers grow by chunks rather than by a single in-memory body.</summary>
public sealed class WorkspaceFileStorage(IConfiguration configuration, OperationsDbContext db, ITaskService? taskService = null)
{
    private static readonly ConcurrentDictionary<Guid, SemaphoreSlim> Locks = new();
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly HashSet<string> Modules = ["marketing", "hr", "cancellations", "commercial", "cs", "lia", "support", "waitingQueue", "serviceRequests", "serviceFollowup", "notes", "reminders", "ti", "admin", "profile", "suggestions", "tasks", "goals", "referrals", "diary", "internalChat"];
    private string Root => configuration["WorkspaceFiles:Path"] ?? Path.Combine(AppContext.BaseDirectory, "workspace-files");
    private string PathFor(Guid id, string suffix) => Path.Combine(Root, id.ToString("N") + suffix);

    public async Task<WorkspaceFile> BeginAsync(WorkspaceUpload input, ActorContext actor, CancellationToken ct)
    {
        if (!Modules.Contains(input.Module) || input.Size <= 0) throw new DomainException("Arquivo ou funcionalidade inválidos.");
        if (input.Module != "profile" && !actor.HasPermission(input.Module, "edit") && !actor.HasPermission(input.Module, "create") && !actor.HasPermission(input.Module, "manage"))
            throw new DomainException("Seu acesso não permite enviar arquivos nesta funcionalidade.", 403);
        var name = Path.GetFileName(input.Name.Replace('\\', '/'));
        if (string.IsNullOrWhiteSpace(name) || name.Length > 255) throw new DomainException("Informe um nome de arquivo válido.");
        var mime = MediaTypeHeaderValue.TryParse(input.ContentType, out var parsed) ? parsed.MediaType ?? "application/octet-stream" : "application/octet-stream";
        if (input.Module == "profile" && !mime.StartsWith("image/", StringComparison.Ordinal)) throw new DomainException("Selecione um arquivo de imagem.");
        var entry = new WorkspaceFile(Guid.NewGuid(), name, mime, input.Size, input.Module, input.SourceId, actor.Email, DateTimeOffset.UtcNow, false);
        if (input.SourceId.HasValue) await RequireSourceAsync(entry, actor, ct);
        Directory.CreateDirectory(Root);
        await File.WriteAllTextAsync(PathFor(entry.Id, ".json"), JsonSerializer.Serialize(entry, Json), ct);
        await using var stream = new FileStream(PathFor(entry.Id, ".part"), FileMode.CreateNew);
        return entry;
    }

    public async Task<long> AppendAsync(Guid id, long offset, Stream content, ActorContext actor, CancellationToken ct)
    {
        var gate = Locks.GetOrAdd(id, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            var entry = await ReadAsync(id, ct);
            RequireOwner(entry, actor);
            if (entry.Complete) throw new DomainException("Este envio já foi concluído.", 409);
            await using var file = new FileStream(PathFor(id, ".part"), FileMode.Open, FileAccess.ReadWrite, FileShare.None, 81920, true);
            // A retry after a lost response must acknowledge a chunk already written.
            if (offset < file.Length) return file.Length;
            if (offset != file.Length) throw new DomainException("A posição do envio mudou. Tente novamente.", 409);
            file.Position = offset;
            try
            {
                var buffer = new byte[81920];
                int read;
                while ((read = await content.ReadAsync(buffer, ct)) > 0)
                {
                    if (file.Position > entry.Size - read) throw new DomainException("O envio excede o tamanho informado.");
                    await file.WriteAsync(buffer.AsMemory(0, read), ct);
                }
                return file.Length;
            }
            catch { file.SetLength(offset); throw; }
        }
        finally { gate.Release(); }
    }

    public async Task<WorkspaceFile> CompleteAsync(Guid id, ActorContext actor, CancellationToken ct)
    {
        var gate = Locks.GetOrAdd(id, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            var entry = await ReadAsync(id, ct);
            RequireOwner(entry, actor);
            if (entry.Complete) return entry;
            if (new FileInfo(PathFor(id, ".part")).Length != entry.Size) throw new DomainException("O arquivo ainda não foi recebido por completo.", 409);
            File.Move(PathFor(id, ".part"), PathFor(id, ".bin"));
            entry = entry with { Complete = true };
            await File.WriteAllTextAsync(PathFor(id, ".json"), JsonSerializer.Serialize(entry, Json), ct);
            return entry;
        }
        finally { gate.Release(); }
    }

    public async Task<(WorkspaceFile File, string Path)> DownloadAsync(Guid id, ActorContext actor, CancellationToken ct)
    {
        var entry = await ReadAsync(id, ct);
        if (!entry.Complete) throw new DomainException("Arquivo não encontrado.", 404);
        if (entry.Module != "profile") actor.RequirePermission(entry.Module, "view");
        if (!entry.SourceId.HasValue && entry.Module != "profile" && !string.Equals(entry.Owner, actor.Email, StringComparison.OrdinalIgnoreCase))
        {
            var reference = $"/api/workspace-files/{id}";
            var sources = await db.WorkItems.AsNoTracking().Where(item => item.Module == entry.Module && item.Description.Contains(reference)).Select(item => item.Id).ToListAsync(ct);
            var allowed = false;
            if (entry.Module == "suggestions") allowed = await db.SuggestionComments.AsNoTracking().AnyAsync(comment => comment.Body.Contains(reference), ct);
            if (entry.Module == "tasks" && taskService is not null)
            {
                var taskIds = await db.TaskComments.AsNoTracking().Where(comment => comment.Body.Contains(reference)).Select(comment => comment.TaskId).ToListAsync(ct);
                if(taskIds.Count>0)allowed=(await taskService.GetModuleAsync(actor,ct)).Tasks.Any(task=>taskIds.Contains(task.Id));
            }
            if(entry.Module=="internalChat")allowed=await db.InternalChatMessages.AsNoTracking().AnyAsync(message=>message.DeletedAt==null&&message.Body.Contains(reference)&&db.InternalChatRoomMembers.Any(member=>member.RoomId==message.RoomId&&db.Users.Any(user=>user.Id==member.UserId&&user.Email==actor.Email)&&message.CreatedAt>=member.JoinedAt),ct);
            foreach (var source in sources)
            {
                try { await RequireSourceAsync(entry with { SourceId = source }, actor, ct); allowed = true; break; }
                catch (DomainException) { /* Another source may independently grant access. */ }
            }
            if (!allowed) throw new DomainException("Sem acesso ao registro que contém este arquivo.", 403);
        }
        await RequireSourceAsync(entry, actor, ct);
        return (entry, PathFor(id, ".bin"));
    }

    private async Task RequireSourceAsync(WorkspaceFile entry, ActorContext actor, CancellationToken ct)
    {
        if (!entry.SourceId.HasValue) return;
        var item = await db.WorkItems.AsNoTracking().SingleOrDefaultAsync(i => i.Id == entry.SourceId && i.Module == entry.Module, ct)
            ?? throw new DomainException("Registro de origem não encontrado.", 404);
        if (FollowupValidationPolicy.IsValidation(item) && !actor.HasPermission(FollowupValidationPolicy.Screen, "view")) throw new DomainException("Sem acesso à validação deste acompanhamento.", 403);
        if (item.Module is "notes" or "reminders" or "diary" or "commissions" or "referrals" or "goals")
        {
            if (!actor.FullAccess && !actor.HasPermission(item.Module, "manage") && item.Owner != actor.DisplayName && item.CreatedBy != actor.Email && item.CustomerName != actor.Email)
                throw new DomainException("Sem acesso ao arquivo deste registro.", 403);
        }
    }

    private async Task<WorkspaceFile> ReadAsync(Guid id, CancellationToken ct)
    {
        var path = PathFor(id, ".json");
        if (!File.Exists(path)) throw new DomainException("Arquivo não encontrado.", 404);
        return JsonSerializer.Deserialize<WorkspaceFile>(await File.ReadAllTextAsync(path, ct), Json) ?? throw new DomainException("Arquivo não encontrado.", 404);
    }
    private static void RequireOwner(WorkspaceFile entry, ActorContext actor)
    {
        if (!string.Equals(entry.Owner, actor.Email, StringComparison.OrdinalIgnoreCase)) throw new DomainException("Este envio pertence a outro usuário.", 403);
    }
}
