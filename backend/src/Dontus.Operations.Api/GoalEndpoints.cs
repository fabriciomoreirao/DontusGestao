using System.Security.Claims;
using Dontus.Operations.Application;
using Dontus.Operations.Infrastructure;

public static class GoalEndpoints
{
    public static void MapGoals(this WebApplication app)
    {
        app.MapGet("/api/goals/progress", async (ClaimsPrincipal principal, HttpResponse response,
            IAccessControlService access, GoalProgressService service, CancellationToken ct) =>
        {
            response.Headers.CacheControl = "private, no-store";
            return Results.Ok(await service.GetAsync(await access.ResolveActorAsync(principal.ToIdentity(), ct), ct));
        }).RequireAuthorization().RequireRateLimiting("operations");
    }
}
