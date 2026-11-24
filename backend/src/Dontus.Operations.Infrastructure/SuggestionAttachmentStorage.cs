using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.Extensions.Logging;

namespace Dontus.Operations.Infrastructure;

public sealed partial class SuggestionService
{
    private async Task<Guid> PersistAttachmentAsync(UploadSuggestionAttachmentCommand command, Guid userId, string fileName,
        ActorContext actor, CancellationToken cancellationToken)
    {
        var attachment = new SuggestionAttachment
        {
            SuggestionId = command.SuggestionId, UploadedByUserId = userId, FileName = fileName,
            ContentType = string.IsNullOrWhiteSpace(command.ContentType) ? "application/octet-stream" : command.ContentType.Trim().ToLowerInvariant(),
            SizeBytes = command.SizeBytes,
            StorageKey = $"suggestions/{command.SuggestionId:N}/{Guid.NewGuid():N}{Path.GetExtension(fileName).ToLowerInvariant()}",
        };
        await using var buffered=await AttachmentSpool.ReadAsync(command.Content,command.SizeBytes,cancellationToken);
        var storedExternally = false;
        if (fileStorage is not null)
        {
            try
            {
                buffered.Position = 0;
                await fileStorage.StoreAsync(attachment.StorageKey, buffered, attachment.ContentType, attachment.SizeBytes, cancellationToken);
                storedExternally = true;
            }
            catch (DomainException exception) when (exception.StatusCode == 503 && !cancellationToken.IsCancellationRequested)
            {
                logger?.LogWarning(exception, "External storage unavailable for suggestion attachment {AttachmentId}; persisting privately in the database.", attachment.Id);
            }
        }
        try
        {
            db.SuggestionAttachments.Add(attachment);
            if (!storedExternally) { if(command.SizeBytes<=AttachmentSpool.DatabaseFallbackBytes)db.SuggestionAttachmentContents.Add(new SuggestionAttachmentContent { AttachmentId = attachment.Id, Content = await AttachmentSpool.BytesAsync(buffered,cancellationToken) });else attachment.StorageKey=await AttachmentSpool.PersistAsync(buffered,cancellationToken); }
            AddAudit(actor, "Attach", "suggestion", command.SuggestionId, new { attachment.Id, attachment.FileName });
            await db.SaveChangesAsync(cancellationToken);
            return attachment.Id;
        }
        catch
        {
            if(AttachmentSpool.Resolve(attachment.StorageKey) is not null)AttachmentSpool.Delete(attachment.StorageKey);
            if (storedExternally)
            {
                try { await fileStorage!.DeleteAsync(attachment.StorageKey, cancellationToken); }
                catch (Exception exception) { logger?.LogWarning(exception, "Could not remove uncommitted suggestion attachment {AttachmentId}.", attachment.Id); }
            }
            throw;
        }
    }
}
