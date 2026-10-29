using System.Security.Claims;
using Dontus.Operations.Application;
using Dontus.Operations.Infrastructure;

public static class EmployeeProfileEndpoints
{
    public static void MapEmployeeProfiles(this WebApplication app)
    {
        var group = app.MapGroup("/api/employee-profiles").RequireAuthorization().RequireRateLimiting("operations");
        group.MapGet("/me", async (ClaimsPrincipal principal, IAccessControlService access, EmployeeProfileService service, CancellationToken ct) =>
            Results.Ok(await service.GetAsync(null, await access.ResolveActorAsync(principal.ToIdentity(), ct), ct)));
        group.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, IAccessControlService access, EmployeeProfileService service, CancellationToken ct) =>
            Results.Ok(await service.GetAsync(id, await access.ResolveActorAsync(principal.ToIdentity(), ct), ct)));
        group.MapPut("/me", async (SaveEmployeeProfileCommand command, ClaimsPrincipal principal, IAccessControlService access, EmployeeProfileService service, CancellationToken ct) =>
            Results.Ok(await service.SaveAsync(command, await access.ResolveActorAsync(principal.ToIdentity(), ct), ct)));
    }
}
