using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;

public static class PublicRecruitmentEndpoints
{
    public static void MapPublicRecruitment(this WebApplication app)
    {
        var group = app.MapGroup("/api/public-recruitment").AddEndpointFilter(async (context, next) =>
        {
            var expected = context.HttpContext.RequestServices.GetRequiredService<IConfiguration>()["PublicServiceRequests:ApiKey"];
            if (string.IsNullOrWhiteSpace(expected) || context.HttpContext.Request.Headers["X-API-Key"] != expected)
                throw new DomainException("Integração não autorizada.", 401);
            context.HttpContext.Response.Headers.CacheControl = "no-store";
            return await next(context);
        });
        group.MapGet("/", async (PublicRecruitmentService service, CancellationToken ct) => Results.Ok(await service.ListAsync(ct)));
        group.MapGet("/{id:guid}", async (Guid id, PublicRecruitmentService service, CancellationToken ct) => Results.Ok(await service.GetAsync(id, ct)));
        group.MapPost("/{id:guid}", async (Guid id, PublicRecruitmentSubmission input, PublicRecruitmentService service, CancellationToken ct) =>
            Results.Ok(new { id = await service.SubmitAsync(id, input, ct) })).RequireRateLimiting("public-service-requests");
    }
}
