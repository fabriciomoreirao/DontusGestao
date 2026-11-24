using Dontus.Operations.Application;
using Dontus.Operations.Infrastructure;

public static class RecordPageEndpoints
{
    public static void MapRecordPages(this WebApplication app) => app.MapPost("/api/record-pages",async(RecordPageQuery query,HttpContext context,IAccessControlService access,RecordPages pages,CancellationToken ct)=>
    {
        context.Response.Headers.CacheControl="private, no-store";
        return Results.Ok(await pages.ReadAsync(query,await access.ResolveActorAsync(context.User.ToIdentity(),ct),ct));
    }).RequireAuthorization().RequireRateLimiting("operations");
}
