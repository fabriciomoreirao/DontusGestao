using System.Security.Claims;
using Dontus.Operations.Application;
using Dontus.Operations.Infrastructure;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text;

public static class WorkspaceFileEndpoints
{
    public static void MapWorkspaceFiles(this WebApplication app)
    {
        var publicFiles = app.MapGroup("/api/public-workspace-files");
        publicFiles.MapPost("/", async (WorkspaceUpload upload, HttpRequest request, IConfiguration configuration, OperationsDbContext db, WorkspaceFileStorage storage, CancellationToken ct) =>
        {
            RequireGateway(request, configuration);
            if (upload.Module == "admin")
            {
                if (!upload.SourceId.HasValue || !await db.WorkItems.AnyAsync(item => item.Id == upload.SourceId && item.Module == "admin" && item.RecordType == "Processo seletivo" && item.Status == "Ativo", ct)) throw new DomainException("Processo seletivo indisponível.", 404);
            }
            else if (upload.Module != "waitingQueue" || upload.SourceId.HasValue) throw new DomainException("Destino de envio inválido.");
            var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
            var actor = PublicActor(token) with { Permissions = [new(upload.Module, true, true, true, false, false)] };
            var entry = await storage.BeginAsync(upload, actor, ct);
            return Results.Ok(new { entry.Id, token });
        }).RequireRateLimiting("public-service-requests");
        publicFiles.MapPut("/{id:guid}", async (Guid id, long offset, HttpRequest request, IConfiguration configuration, WorkspaceFileStorage storage, CancellationToken ct) =>
        {
            RequireGateway(request, configuration);
            return Results.Ok(new { offset = await storage.AppendAsync(id, offset, request.Body, PublicActor(request.Headers["X-Upload-Token"].ToString()), ct) });
        }).WithMetadata(new Microsoft.AspNetCore.Mvc.RequestSizeLimitAttribute(9L * 1024 * 1024));
        publicFiles.MapPost("/{id:guid}/complete", async (Guid id, HttpRequest request, IConfiguration configuration, WorkspaceFileStorage storage, CancellationToken ct) =>
        {
            RequireGateway(request, configuration);
            var entry = await storage.CompleteAsync(id, PublicActor(request.Headers["X-Upload-Token"].ToString()), ct);
            return Results.Ok(new { entry.Id, entry.Name, type = entry.ContentType, entry.Size, url = $"/api/workspace-files/{id}" });
        });
        var group = app.MapGroup("/api/workspace-files").RequireAuthorization();
        group.MapPost("/", async (WorkspaceUpload upload, ClaimsPrincipal principal, IAccessControlService access, WorkspaceFileStorage storage, CancellationToken ct) =>
            Results.Ok(await storage.BeginAsync(upload, await access.ResolveActorAsync(principal.ToIdentity(), ct), ct))).RequireRateLimiting("operations");
        group.MapPut("/{id:guid}", async (Guid id, long offset, HttpRequest request, ClaimsPrincipal principal, IAccessControlService access, WorkspaceFileStorage storage, CancellationToken ct) =>
            Results.Ok(new { offset = await storage.AppendAsync(id, offset, request.Body, await access.ResolveActorAsync(principal.ToIdentity(), ct), ct) }))
            .WithMetadata(new Microsoft.AspNetCore.Mvc.RequestSizeLimitAttribute(9L * 1024 * 1024));
        group.MapPost("/{id:guid}/complete", async (Guid id, ClaimsPrincipal principal, IAccessControlService access, WorkspaceFileStorage storage, CancellationToken ct) =>
        {
            var entry = await storage.CompleteAsync(id, await access.ResolveActorAsync(principal.ToIdentity(), ct), ct);
            return Results.Ok(new { entry.Id, entry.Name, type = entry.ContentType, entry.Size, url = $"/api/workspace-files/{id}" });
        });
        group.MapGet("/{id:guid}", async (Guid id, HttpResponse response, ClaimsPrincipal principal, IAccessControlService access, WorkspaceFileStorage storage, CancellationToken ct) =>
        {
            var (file, path) = await storage.DownloadAsync(id, await access.ResolveActorAsync(principal.ToIdentity(), ct), ct);
            response.Headers.XContentTypeOptions = "nosniff";
            response.Headers.CacheControl = "private, no-store";
            var inline = file.ContentType.StartsWith("video/") || file.ContentType.StartsWith("audio/") || file.ContentType is "image/png" or "image/jpeg" or "image/webp" or "image/gif" or "image/avif" or "application/pdf";
            response.Headers.ContentDisposition = $"{(inline ? "inline" : "attachment")}; filename*=UTF-8''{Uri.EscapeDataString(file.Name)}";
            return Results.File(path, file.ContentType, enableRangeProcessing: true);
        });
    }
    private static void RequireGateway(HttpRequest request, IConfiguration configuration)
    {
        var expected = configuration["PublicServiceRequests:ApiKey"];
        if (string.IsNullOrWhiteSpace(expected) || request.Headers["X-API-Key"] != expected) throw new DomainException("Integração não autorizada.", 401);
    }
    private static ActorContext PublicActor(string token)
    {
        if (token.Length != 64 || !token.All(Uri.IsHexDigit)) throw new DomainException("Envio não autorizado.", 403);
        return new("public-upload:" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))), "Envio público", "Público", "");
    }
}
