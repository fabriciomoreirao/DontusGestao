using System.Security.Claims;
using Dontus.Operations.Application;
using Dontus.Operations.Infrastructure;

public static class ChatInboxEndpoints
{
    public static void MapChatInbox(this WebApplication app)
    {
        var group = app.MapGroup("/api/chat").RequireAuthorization().RequireRateLimiting("operations");
        group.MapGet("/", async (int? page, string? search, string? status, Guid? departmentId,
            bool? isGroup, Guid? conversationId, ClaimsPrincipal principal, IAccessControlService access,
            IChatService service, CancellationToken cancellationToken) =>
        {
            var actor = await access.ResolveActorAsync(principal.ToIdentity(), cancellationToken);
            return Results.Ok(await service.GetModuleAsync(actor, cancellationToken,
                new ChatInboxQuery(page ?? 1, search, status, departmentId, isGroup ?? false, conversationId)));
        });
        group.MapGet("/messages", async (Guid conversationId, Guid? beforeMessageId,
            ClaimsPrincipal principal, IAccessControlService access, IChatService service, CancellationToken cancellationToken) =>
        {
            var actor = await access.ResolveActorAsync(principal.ToIdentity(), cancellationToken);
            return Results.Ok(await service.GetMessagesAsync(conversationId, beforeMessageId, actor, cancellationToken));
        });
        group.MapGet("/report", async (DateTimeOffset from, DateTimeOffset to,
            ClaimsPrincipal principal, IAccessControlService access, IChatService service, CancellationToken cancellationToken) =>
        {
            var actor = await access.ResolveActorAsync(principal.ToIdentity(), cancellationToken);
            return Results.Ok(await service.GetReportAsync(from, to, actor, cancellationToken));
        });
    }
}
