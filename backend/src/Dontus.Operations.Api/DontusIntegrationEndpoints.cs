using System.Security.Claims;
using Dontus.Operations.Application;
using Dontus.Operations.Infrastructure;

public static class DontusIntegrationEndpoints
{
    public static void MapDontusIntegration(this WebApplication app)
    {
        var group = app.MapGroup("/api/dontus-integration").RequireAuthorization().RequireRateLimiting("operations");
        group.AddEndpointFilter(async (context, next) =>
        {
            context.HttpContext.Response.Headers.CacheControl = "no-store";
            return await next(context);
        });
        group.MapGet("/customers/{customerId:guid}", async (Guid customerId, ClaimsPrincipal principal, IAccessControlService access, DontusIntegrationService service, CancellationToken ct) =>
            Results.Ok(new { link = await service.GetLinkAsync(customerId, await access.ResolveActorAsync(principal.ToIdentity(), ct), ct) }));
        group.MapPost("/customers/{customerId:guid}", async (Guid customerId, LinkDontusCustomerCommand command, ClaimsPrincipal principal, IAccessControlService access, DontusIntegrationService service, CancellationToken ct) =>
            Results.Ok(await service.LinkAsync(customerId, command, await access.ResolveActorAsync(principal.ToIdentity(), ct), ct)));
        group.MapGet("/customers/{customerId:guid}/data", async (Guid customerId, ClaimsPrincipal principal, IAccessControlService access, DontusIntegrationService service, CancellationToken ct) =>
            Results.Ok(await service.GetDataAsync(customerId, await access.ResolveActorAsync(principal.ToIdentity(), ct), ct)));
        group.MapPost("/users", async (DontusIdentificationCommand command, ClaimsPrincipal principal, IAccessControlService access, DontusIntegrationService service, CancellationToken ct) =>
            Results.Ok(await service.ListUsersAsync(command.Identification, await access.ResolveActorAsync(principal.ToIdentity(), ct), ct)));
        group.MapPost("/users/login", async (DontusLoginCommand command, ClaimsPrincipal principal, IAccessControlService access, DontusIntegrationService service, CancellationToken ct) =>
            Results.Ok(await service.LoginAsync(command, await access.ResolveActorAsync(principal.ToIdentity(), ct), ct)));
    }
}
