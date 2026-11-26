using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Infrastructure;

public sealed partial class ChatService
{
    public async Task<ChatMessagePageDto> GetMessagesAsync(Guid conversationId, Guid? beforeMessageId,
        ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("chat", "view");
        var all = actor.HasPermission("chat", "manage") || actor.HasCapability("chat", "viewOtherDepartments");
        var history = actor.HasPermission("chat", "manage") || actor.HasCapability("chat", "viewHistory");
        var departments = await VisibleDepartmentIdsAsync(actor, all, cancellationToken);
        if (!await db.ChatConversations.AsNoTracking().AnyAsync(x => x.Id == conversationId
            && (all || departments.Contains(x.DepartmentId)) && (history || x.Status != "Encerrada"), cancellationToken))
            throw new DomainException("Conversa não encontrada ou sem permissão de acesso.", 404);

        var messages = db.ChatMessages.AsNoTracking().Where(x => x.ConversationId == conversationId);
        if (beforeMessageId.HasValue)
        {
            var before = await messages.Where(x => x.Id == beforeMessageId.Value)
                .Select(x => new { x.CreatedAt, x.Id }).SingleOrDefaultAsync(cancellationToken)
                ?? throw new DomainException("Referência de mensagem inválida.", 404);
            messages = messages.Where(x => x.CreatedAt < before.CreatedAt
                || x.CreatedAt == before.CreatedAt && x.Id.CompareTo(before.Id) < 0);
        }

        var batch = await messages.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id)
            .Take(51).ToListAsync(cancellationToken);
        return new ChatMessagePageDto(batch.Take(50).Reverse().Select(ToMessageDto).ToArray(), batch.Count > 50);
    }

    // Reports load only when opened and carry no message bodies, media or contact notes.
    public async Task<IReadOnlyCollection<ChatConversationDto>> GetReportAsync(DateTimeOffset start, DateTimeOffset end,
        ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("chat", "view");
        if (end <= start || end - start > TimeSpan.FromDays(366))
            throw new DomainException("Selecione um período válido de até um ano.");
        var userId = await db.Users.AsNoTracking().Where(x => x.Email == actor.Email).Select(x => x.Id).SingleAsync(cancellationToken);
        var all = actor.HasPermission("chat", "manage") || actor.HasCapability("chat", "viewOtherDepartments");
        var allReports = actor.HasPermission("chat", "manage") || actor.HasCapability("chat", "viewAllReports");
        var history = actor.HasPermission("chat", "manage") || actor.HasCapability("chat", "viewHistory");
        var departments = await VisibleDepartmentIdsAsync(actor, all, cancellationToken);
        return await (from c in db.ChatConversations.AsNoTracking()
                      join contact in db.ChatContacts.AsNoTracking() on c.ContactId equals contact.Id
                      where (all || departments.Contains(c.DepartmentId)) && (history || c.Status != "Encerrada")
                          && (allReports || c.AssigneeUserId == userId) && c.CreatedAt >= start && c.CreatedAt < end
                      orderby c.CreatedAt descending, c.Id descending
                      select new ChatConversationDto(c.Id, c.Number, c.Protocol,
                          new ChatContactDto(contact.Id, contact.Name, contact.Phone, "", null, contact.CompanyName, ""),
                          c.ChannelId, "", c.DepartmentId, "", c.QueueId, "", c.AssigneeUserId, "", c.Subject,
                          c.IsGroup, c.GroupName, Array.Empty<string>(), c.Status, c.Priority, c.Favorite, c.UnreadCount,
                          c.CreatedAt, c.LastMessageAt, c.FirstResponseAt, c.ClosedAt, null, "", c.Sentiment, c.Version,
                          c.SatisfactionScore, c.SatisfactionComment, c.SatisfactionRespondedAt,
                          Array.Empty<ChatMessageDto>(), Array.Empty<ChatTagDto>(),
                          db.ChatTransfers.Where(t => t.ConversationId == c.Id)
                              .Select(t => new ChatTransferDto(t.Id, t.FromDepartmentId, t.ToDepartmentId,
                                  t.FromChannelId, t.ToChannelId, "", "", t.CreatedAt)).ToArray()))
            .ToListAsync(cancellationToken);
    }
}
