using Dontus.Operations.Application;
using Dontus.Operations.Infrastructure;

public static class InternalChatTypingEndpoints
{
    public sealed record TypingRequest(Guid RoomId, Guid SessionId, bool IsTyping);
    public static void MapInternalChatTyping(this WebApplication app) => app.MapPost("/api/internal-chats/typing", async (
        TypingRequest request, HttpContext context, IAccessControlService access, InternalChatTypingService service, CancellationToken ct) =>
    {
        var actor = await access.ResolveActorAsync(context.User.ToIdentity(), ct);
        await service.PublishAsync(request.RoomId, request.SessionId, request.IsTyping, actor, ct);
        return Results.NoContent();
    }).RequireAuthorization().RequireRateLimiting("operations");
}
