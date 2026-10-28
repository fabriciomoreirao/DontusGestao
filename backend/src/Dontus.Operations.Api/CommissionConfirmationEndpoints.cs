using System.Security.Claims;
using Dontus.Operations.Application;
using Dontus.Operations.Infrastructure;

public static class CommissionConfirmationEndpoints
{
    public static void MapCommissionConfirmations(this WebApplication app)
    {
        var group = app.MapGroup("/api/commission-confirmations").RequireAuthorization().RequireRateLimiting("operations");
        group.MapGet("", async (string module, string scope, string competence, HttpContext context, ILocalAuthenticationService authentication, IAccessControlService access, CommissionConfirmationService service, CancellationToken ct) =>
            Results.Ok(await service.ListAsync(module, scope, competence, await Actor(context, authentication, access, ct), ct)));
        group.MapPost("", async (GenerateCommissionConfirmation command, HttpContext context, ILocalAuthenticationService authentication, IAccessControlService access, CommissionConfirmationService service, CancellationToken ct) =>
            Results.Ok(await service.GenerateAsync(command, await Actor(context, authentication, access, ct), ct)));
        var documents = app.MapGroup("/api/public-commission-confirmations").RequireAuthorization().RequireRateLimiting("operations");
        documents.MapGet("/{token}", async (string token, HttpContext context, ILocalAuthenticationService authentication, IAccessControlService access, CommissionConfirmationService service, CancellationToken ct) => {
            context.Response.Headers.CacheControl = "no-store";
            return Results.Ok(await service.GetPublicAsync(token, await Actor(context, authentication, access, ct), ct));
        });
        documents.MapPost("/{token}", async (string token, AgreeCommissionConfirmation command, HttpContext context, ILocalAuthenticationService authentication, IAccessControlService access, CommissionConfirmationService service, CancellationToken ct) => {
            context.Response.Headers.CacheControl = "no-store";
            return Results.Ok(new { agreedAt = await service.AgreeAsync(token, command, await Actor(context, authentication, access, ct), context.Request.Headers.UserAgent.ToString(), ct), status = "agreed" });
        });
        documents.MapGet("/{token}/pdf", async (string token, HttpContext context, ILocalAuthenticationService authentication, IAccessControlService access, CommissionConfirmationService service, CancellationToken ct) => {
            context.Response.Headers.CacheControl = "no-store";
            var file = await service.DownloadAsync(token, await Actor(context, authentication, access, ct), ct);
            return Results.File(file.Bytes, "application/pdf", file.FileName);
        });
    }

    // Documents require a real session, including when the development bypass is enabled.
    private static async Task<ActorContext> Actor(HttpContext context, ILocalAuthenticationService authentication, IAccessControlService access, CancellationToken ct)
    {
        var token = context.Request.Headers["X-Local-Session"].FirstOrDefault();
        var identity = string.IsNullOrWhiteSpace(token) ? null : await authentication.ResolveSessionAsync(token, ct);
        if (identity is null) throw new Dontus.Operations.Domain.DomainException("Entre com seu usuário para acessar o documento.", 401);
        return await access.ResolveActorAsync(identity, ct);
    }
}
