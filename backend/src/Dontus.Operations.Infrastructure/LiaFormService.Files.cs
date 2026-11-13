using System.Net.Http.Headers;
using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Dontus.Operations.Infrastructure;

public sealed partial class LiaFormService
{
    public const long MaximumFileBytes = 50L * 1024 * 1024;
    public const long MaximumSubmissionBytes = 100L * 1024 * 1024;

    private static string CleanFileName(string name) =>
        new((name ?? "").Replace('\\', '/').Split('/').Last().Where(c => !char.IsControl(c)).ToArray());

    private static void ValidateUploads(IReadOnlyList<LiaFormQuestion> questions, IReadOnlyList<UploadLiaFormFile> uploads)
    {
        if (uploads.Count > 20 || uploads.GroupBy(x => x.QuestionId).Any(x => x.Count() > 10))
            throw new DomainException("Envie até 10 arquivos por pergunta e até 20 arquivos no formulário.");
        foreach (var file in uploads)
        {
            if (!questions.Any(q => q.Id == file.QuestionId && q.Type == "file"))
                throw new DomainException("O anexo não corresponde a uma pergunta de envio de arquivos.");
            if (CleanFileName(file.FileName).Trim().Length is < 1 or > 240)
                throw new DomainException("O nome do arquivo deve ter de 1 a 240 caracteres.");
            if (file.SizeBytes <= 0 || file.SizeBytes > MaximumFileBytes)
                throw new DomainException("Cada arquivo deve estar preenchido e ter até 50 MB.");
        }
        if (uploads.Sum(x => x.SizeBytes) > MaximumSubmissionBytes)
            throw new DomainException("Os arquivos do formulário devem somar no máximo 100 MB.");
    }

    private async Task<DateTimeOffset> CompleteSubmissionAsync(LiaFormRequest entry, Dictionary<string, string> answers,
        IReadOnlyList<UploadLiaFormFile> uploads, CancellationToken ct)
    {
        var storedKeys = new List<string>();
        try
        {
            foreach (var file in uploads)
            {
                var attachment = new LiaFormAttachment
                {
                    RequestId = entry.Id, QuestionId = file.QuestionId, FileName = CleanFileName(file.FileName),
                    ContentType = file.ContentType?.Length <= 200 && MediaTypeHeaderValue.TryParse(file.ContentType, out var mediaType)
                        ? mediaType.MediaType ?? "application/octet-stream" : "application/octet-stream",
                    SizeBytes = file.SizeBytes,
                    StorageKey = $"lia-forms/{entry.Id:N}/{Guid.NewGuid():N}",
                };
                await using var buffered = new MemoryStream();
                var buffer = new byte[81920];
                int read;
                while ((read = await file.Content.ReadAsync(buffer, ct)) > 0)
                {
                    if (buffered.Length + read > file.SizeBytes)
                        throw new DomainException("O tamanho do arquivo recebido é inválido. Selecione o arquivo novamente.");
                    await buffered.WriteAsync(buffer.AsMemory(0, read), ct);
                }
                if (buffered.Length != file.SizeBytes)
                    throw new DomainException("O arquivo não foi recebido por completo. Tente novamente.");
                var stored = false;
                if (fileStorage is not null)
                {
                    try
                    {
                        buffered.Position = 0;
                        await fileStorage.StoreAsync(attachment.StorageKey, buffered, attachment.ContentType, attachment.SizeBytes, ct);
                        storedKeys.Add(attachment.StorageKey);
                        stored = true;
                    }
                    catch (DomainException exception) when (exception.StatusCode == 503 && !ct.IsCancellationRequested)
                    {
                        logger?.LogWarning(exception, "S3 unavailable for LIA attachment {AttachmentId}; using database storage.", attachment.Id);
                    }
                }
                if (!stored) attachment.Content = buffered.ToArray();
                db.LiaFormAttachments.Add(attachment);
            }
            entry.AnswersJson = JsonSerializer.Serialize(answers);
            entry.SubmittedAt = DateTimeOffset.UtcNow;
            entry.UpdatedAt = entry.SubmittedAt.Value;
            entry.Version++;
            Audit("formulario-publico", "SubmitForm", entry.Id);
            await db.SaveChangesAsync(ct);
            return entry.SubmittedAt.Value;
        }
        catch (Exception exception)
        {
            foreach (var key in storedKeys)
            {
                try { await fileStorage!.DeleteAsync(key, CancellationToken.None); }
                catch (Exception cleanupException) { logger?.LogWarning(cleanupException, "Could not remove uncommitted LIA attachment."); }
            }
            if (exception is DbUpdateConcurrencyException)
                throw new DomainException("Este formulário já foi respondido. Atualize a página.", 409);
            throw;
        }
    }

    public async Task<TaskAttachmentDownloadDto> GetAttachmentAsync(Guid id, ActorContext actor, CancellationToken ct)
    {
        actor.RequirePermission("lia", "view");
        var attachment = await db.LiaFormAttachments.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new DomainException("Anexo não encontrado.", 404);
        if (!await db.LiaFormRequests.AnyAsync(x => x.Id == attachment.RequestId && x.SubmittedAt != null, ct))
            throw new DomainException("Resposta do formulário não encontrada.", 404);
        if (attachment.Content is not null)
            return new TaskAttachmentDownloadDto("") { Content = attachment.Content, FileName = attachment.FileName, ContentType = attachment.ContentType };
        if (fileStorage is null) throw new DomainException("O armazenamento de arquivos está indisponível.", 503);
        return new TaskAttachmentDownloadDto(fileStorage.CreateDownloadUrl(attachment.StorageKey, attachment.FileName, attachment.ContentType));
    }
}
