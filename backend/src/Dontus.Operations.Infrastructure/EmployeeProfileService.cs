using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Infrastructure;

public sealed class EmployeeProfileService(OperationsDbContext db)
{
    private const string RecordType = "Perfil de colaborador";
    private static readonly string[] ProfileScreens = ["internalChat", "tasks", "catalogs", "notices", "suggestions", "admin", "hr"];

    public async Task<EmployeeProfileDto> GetAsync(Guid? employeeId, ActorContext actor, CancellationToken ct = default)
    {
        var current = await CurrentUserAsync(actor, ct);
        var user = employeeId is null || employeeId == current.Id ? current
            : await db.Users.AsNoTracking().SingleOrDefaultAsync(user => user.Id == employeeId, ct)
                ?? throw new DomainException("Colaborador não encontrado.", 404);
        if (user.Id != current.Id && !ProfileScreens.Any(screen => actor.HasPermission(screen, "view")))
            throw new DomainException("Seu acesso não permite consultar este perfil.", 403);
        if ((!user.Active || user.BlockedAt.HasValue) && !actor.HasPermission("admin", "manage"))
            throw new DomainException("Colaborador não encontrado.", 404);
        return await DescribeAsync(user, current.Id, await FindRecordAsync(user.Id, ct), ct);
    }

    public async Task<EmployeeProfileDto> SaveAsync(SaveEmployeeProfileCommand command, ActorContext actor, CancellationToken ct = default)
    {
        var user = await CurrentUserAsync(actor, ct);
        var bio = command.Bio?.Trim() ?? "";
        var phrase = command.Phrase?.Trim() ?? "";
        var cover = command.CoverDataUrl ?? "";
        if (bio.Length > 900) throw new DomainException("A biografia deve ter no máximo 900 caracteres.");
        if (phrase.Length > 180) throw new DomainException("A frase deve ter no máximo 180 caracteres.");
        ValidateCover(cover);
        var record = await FindRecordAsync(user.Id, ct);
        if (command.Version != (record?.Version ?? 0))
            throw new DomainException("O perfil foi alterado em outra sessão. Reabra o perfil e tente novamente.", 409);
        var created = record is null;
        if (record is null)
        {
            record = new WorkItem {
                Module = "internalChat", RecordType = RecordType, Title = $"Perfil · {user.DisplayName}",
                Owner = user.DisplayName, CustomerName = user.DisplayName, Team = user.Department,
                Status = "Ativo", Priority = "P4", CreatedBy = actor.Email,
            };
            db.WorkItems.Add(record);
        }
        else record.Version++;
        record.UpdatedAt = DateTimeOffset.UtcNow;
        record.Description = JsonSerializer.Serialize(new {
            kind = "employeeProfile", employeeId = user.Id, coverDataUrl = cover, bio, phrase,
            updatedAt = record.UpdatedAt, updatedBy = user.DisplayName,
        });
        db.AuditEvents.Add(new AuditEvent {
            ActorEmail = actor.Email, Action = created ? "Create" : "Update", Resource = "employee_profile",
            ResourceId = user.Id.ToString(), Module = "profile", DetailsJson = JsonSerializer.Serialize(new { employeeId = user.Id }),
        });
        await db.SaveChangesAsync(ct);
        return await DescribeAsync(user, user.Id, record, ct);
    }

    private async Task<AppUser> CurrentUserAsync(ActorContext actor, CancellationToken ct) =>
        await db.Users.AsNoTracking().SingleOrDefaultAsync(user => user.Email == actor.Email && user.Active && !user.BlockedAt.HasValue, ct)
            ?? throw new DomainException("Sessão de usuário inválida.", 403);

    private async Task<WorkItem?> FindRecordAsync(Guid userId, CancellationToken ct)
    {
        var id = userId.ToString();
        var records = await db.WorkItems.Where(item => item.Module == "internalChat" && item.RecordType == RecordType
                && item.Description.Contains(id)).OrderByDescending(item => item.UpdatedAt).ToListAsync(ct);
        return records.FirstOrDefault(record => {
            try {
                using var json = JsonDocument.Parse(record.Description);
                return json.RootElement.TryGetProperty("employeeId", out var employeeId) && employeeId.GetString() == id;
            } catch (Exception error) when (error is JsonException or InvalidOperationException) { return false; }
        });
    }

    private async Task<EmployeeProfileDto> DescribeAsync(AppUser user, Guid currentId, WorkItem? record, CancellationToken ct)
    {
        var departmentNames = await db.UserDepartments.Where(link => link.UserId == user.Id)
            .OrderByDescending(link => link.IsPrimary).ThenBy(link => link.Department.Name)
            .Select(link => link.Department.Name).ToListAsync(ct);
        var departments = departmentNames.Distinct().ToArray();
        var supervisors = await db.EmployeeSupervisions.Where(link => link.SubordinateUserId == user.Id
                && link.CoordinatorUser.Active && !link.CoordinatorUser.BlockedAt.HasValue)
            .Select(link => link.CoordinatorUser.DisplayName).Distinct().Order().ToListAsync(ct);
        string Read(string name) {
            if (record is null) return "";
            try { using var json = JsonDocument.Parse(record.Description); return json.RootElement.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : ""; }
            catch (JsonException) { return ""; }
        }
        return new(new(user.Id, user.DisplayName, user.Department, departments, ProfilePhotoUrls.For(user),
            user.JobTitle, user.IsCoordinator, user.BirthDate?.Day, user.BirthDate?.Month, string.Join(", ", supervisors)),
            Read("coverDataUrl"), Read("bio"), Read("phrase"), record?.Version ?? 0, user.Id == currentId, record?.UpdatedAt);
    }

    private static void ValidateCover(string cover)
    {
        if (cover.Length == 0) return;
        const int maxBytes = 2 * 1024 * 1024;
        var prefix = new[] { "data:image/png;base64,", "data:image/jpeg;base64,", "data:image/webp;base64," }
            .FirstOrDefault(prefix => cover.StartsWith(prefix, StringComparison.Ordinal));
        if (prefix is null || cover.Length > (maxBytes + 2) / 3 * 4 + 40)
            throw new DomainException("Selecione uma capa PNG, JPEG ou WebP de até 2 MB.");
        try {
            var bytes = Convert.FromBase64String(cover[prefix.Length..]);
            if (bytes.Length == 0 || bytes.Length > maxBytes) throw new FormatException();
        } catch (FormatException) { throw new DomainException("Selecione uma capa PNG, JPEG ou WebP de até 2 MB."); }
    }

    internal static void RequireDedicatedEditor(string? recordType, string? description)
    {
        var profile = string.Equals(recordType, RecordType, StringComparison.OrdinalIgnoreCase);
        if (!profile && description?.Contains("employeeProfile", StringComparison.Ordinal) == true)
        {
            try { using var json = JsonDocument.Parse(description); profile = json.RootElement.TryGetProperty("kind", out var kind) && kind.GetString() == "employeeProfile"; }
            catch (Exception error) when (error is JsonException or InvalidOperationException) { }
        }
        if (profile) throw new DomainException("Edite o perfil pela opção Perfil da sua conta.", 403);
    }
}
