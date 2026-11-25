using System.Security.Claims;
using Dontus.Operations.Application;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static class WhatsAppEndpoints
{
    public static void MapWhatsApp(this WebApplication app)
    {
        var group = app.MapGroup("/api/whatsapp").RequireAuthorization().RequireRateLimiting("operations");
        group.AddEndpointFilter(async (context, next) => { context.HttpContext.Response.Headers.CacheControl = "no-store"; return await next(context); });
        group.MapGet("/state", async (ClaimsPrincipal principal, IAccessControlService access, IWhatsAppAdminService service, CancellationToken ct) =>
            Results.Ok(await service.GetWhatsAppAdminAsync(await access.ResolveActorAsync(principal.ToIdentity(), ct), ct)));
        group.MapGet("/notifications", async (DateTimeOffset? since, Guid? afterId, ClaimsPrincipal principal, IAccessControlService access, OperationsDbContext db, CancellationToken ct) =>
        {
            var actor = await access.ResolveActorAsync(principal.ToIdentity(), ct); actor.RequirePermission("chat", "view");
            if (!since.HasValue) return Results.Ok(new { cursor = DateTimeOffset.UtcNow, afterId = Guid.Empty, hasMore = false, messages = Array.Empty<object>() });
            var all = actor.HasPermission("chat", "manage") || actor.HasCapability("chat", "viewOtherDepartments");
            var departments = db.UserDepartments.Where(x => db.Users.Any(u => u.Id == x.UserId && u.Email == actor.Email)).Select(x => x.DepartmentId);
            var rows = await (from message in db.ChatMessages.AsNoTracking()
                              join conversation in db.ChatConversations on message.ConversationId equals conversation.Id
                              join contact in db.ChatContacts on conversation.ContactId equals contact.Id
                              join channel in db.ChatChannels on conversation.ChannelId equals channel.Id
                              where message.Direction == "Entrada" && !message.Internal && message.Status != "Importada" &&
                                  (message.UpdatedAt > since || message.UpdatedAt == since && afterId.HasValue && message.Id.CompareTo(afterId.Value) > 0) &&
                                  channel.Type == "WhatsApp" && (all || departments.Contains(conversation.DepartmentId))
                              orderby message.UpdatedAt, message.Id
                              select new
                              {
                                  message.Id,
                                  message.ConversationId,
                                  ClientName = contact.Name,
                                  message.Body,
                                  message.Type,
                                  message.MediaName,
                                  message.UpdatedAt,
                                  Responsible = db.Users.Where(u => u.Id == conversation.AssigneeUserId).Select(u => u.DisplayName).FirstOrDefault() ?? "Fila compartilhada"
                              }).Take(200).ToArrayAsync(ct);
            return Results.Ok(new { cursor = rows.Length > 0 ? rows[^1].UpdatedAt : since.Value, afterId = rows.Length > 0 ? rows[^1].Id : afterId ?? Guid.Empty, hasMore = rows.Length == 200, messages = rows });
        });
        group.MapPost("/templates", async (SaveWhatsAppTemplateCommand command, ClaimsPrincipal principal, IAccessControlService access, IWhatsAppAdminService service, CancellationToken ct) =>
            Results.Ok(new { id = await service.SubmitTemplateAsync(command, await access.ResolveActorAsync(principal.ToIdentity(), ct), ct) }));
        group.MapPost("/templates/{numberId:guid}/refresh", async (Guid numberId, ClaimsPrincipal principal, IAccessControlService access, IWhatsAppAdminService service, CancellationToken ct) =>
        {
            await service.RefreshTemplatesAsync(numberId, await access.ResolveActorAsync(principal.ToIdentity(), ct), ct); return Results.Ok(new { ok = true });
        });
        group.MapPost("/media/{numberId:guid}", async (Guid numberId, HttpRequest request, ClaimsPrincipal principal, IAccessControlService access, IWhatsAppAdminService service, CancellationToken ct) =>
        {
            var actor = await access.ResolveActorAsync(principal.ToIdentity(), ct);
            actor.RequirePermission("chat", "manage"); actor.RequireCapability("chat", "manageWhatsApp");
            var form = await request.ReadFormAsync(ct); var file = form.Files.GetFile("file");
            if (file is null || file.Length < 1) return Results.BadRequest(new { detail = "Selecione um arquivo não vazio." });
            using var content = new MemoryStream(); await file.CopyToAsync(content, ct);
            return Results.Ok(new { handle = await service.UploadTemplateSampleAsync(numberId, Path.GetFileName(file.FileName), file.ContentType, content.ToArray(), actor, ct) });
        }).DisableAntiforgery().WithMetadata(new Microsoft.AspNetCore.Mvc.DisableRequestSizeLimitAttribute());
        group.MapPost("/suite", async (RegisterWhatsAppSuiteCommand command, ClaimsPrincipal principal, IAccessControlService access, IWhatsAppAdminService service, CancellationToken ct) =>
        {
            await service.RegisterSuiteAsync(command, await access.ResolveActorAsync(principal.ToIdentity(), ct), ct); return Results.Ok(new { ok = true });
        });
        group.MapPost("/send", async (SendWhatsAppTemplateCommand command, ClaimsPrincipal principal, IAccessControlService access, IWhatsAppAdminService service, CancellationToken ct) =>
            Results.Ok(new { id = await service.SendTemplateAsync(command, await access.ResolveActorAsync(principal.ToIdentity(), ct), ct) }));
        group.MapPost("/campaigns", async (SaveWhatsAppCampaignCommand command, ClaimsPrincipal principal, IAccessControlService access, IWhatsAppAdminService service, CancellationToken ct) =>
            Results.Ok(new { id = await service.SaveCampaignAsync(command, await access.ResolveActorAsync(principal.ToIdentity(), ct), ct) }));
        group.MapGet("/campaigns/{id:guid}", async (Guid id, ClaimsPrincipal principal, IAccessControlService access, OperationsDbContext db, CancellationToken ct) =>
        {
            var actor = await access.ResolveActorAsync(principal.ToIdentity(), ct); actor.RequirePermission("chat", "manage"); actor.RequireCapability("chat", "manageWhatsApp");
            var campaign = await db.WhatsAppCampaigns.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
            return campaign is null ? Results.NotFound() : Results.Ok(new { campaign, deliveries = await db.WhatsAppCampaignDeliveries.AsNoTracking().Where(x => x.CampaignId == id).ToListAsync(ct) });
        });
        group.MapPost("/campaigns/{id:guid}/{action}", async (Guid id, string action, ScheduleWhatsAppCampaignCommand command, ClaimsPrincipal principal, IAccessControlService access, IWhatsAppAdminService service, CancellationToken ct) =>
        {
            await service.CampaignActionAsync(id, action, command.ScheduledAt, await access.ResolveActorAsync(principal.ToIdentity(), ct), ct); return Results.Ok(new { ok = true });
        });
    }
}
