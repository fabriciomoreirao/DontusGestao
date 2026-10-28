using System.Security.Claims;
using Dontus.Operations.Application;
using Dontus.Operations.Infrastructure;

public static class LiaFormEndpoints
{
    public static void MapLiaForms(this WebApplication app)
    {
        var group = app.MapGroup("/api/lia-forms").RequireAuthorization().RequireRateLimiting("operations");
        group.MapGet("", async (ClaimsPrincipal principal, IAccessControlService access, LiaFormService service, CancellationToken ct) =>
            Results.Ok(await service.ListFormsAsync(await access.ResolveActorAsync(principal.ToIdentity(), ct), ct)));
        group.MapPost("", async (SaveLiaFormCommand command, ClaimsPrincipal principal, IAccessControlService access, LiaFormService service, CancellationToken ct) =>
            Results.Ok(new { id = await service.SaveFormAsync(command, await access.ResolveActorAsync(principal.ToIdentity(), ct), ct) }));
        group.MapGet("/requests", async (Guid? workItemId, ClaimsPrincipal principal, IAccessControlService access, LiaFormService service, CancellationToken ct) =>
            Results.Ok(await service.ListRequestsAsync(workItemId, await access.ResolveActorAsync(principal.ToIdentity(), ct), ct)));
        group.MapPost("/requests", async (GenerateLiaFormCommand command, ClaimsPrincipal principal, IAccessControlService access, LiaFormService service, CancellationToken ct) =>
            Results.Ok(await service.GenerateAsync(command, await access.ResolveActorAsync(principal.ToIdentity(), ct), ct)));
        app.MapGet("/api/public-lia-forms/{token}", async (string token, HttpResponse response, LiaFormService service, CancellationToken ct) =>
        {
            response.Headers.CacheControl = "no-store";
            return Results.Ok(await service.GetPublicAsync(token, ct));
        }).RequireRateLimiting("operations");
        app.MapPost("/api/public-lia-forms/{token}", async (string token, SubmitLiaFormCommand command, LiaFormService service, CancellationToken ct) =>
            Results.Ok(new { submittedAt = await service.SubmitAsync(token, command, ct) })).RequireRateLimiting("public-service-requests");
    }
}
