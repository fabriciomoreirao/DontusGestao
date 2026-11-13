using System.Security.Claims;
using Dontus.Operations.Application;
using Dontus.Operations.Infrastructure;
using Dontus.Operations.Domain;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;

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
        group.MapGet("/attachments/{id:guid}", async (Guid id, ClaimsPrincipal principal, HttpResponse response,
            IAccessControlService access, LiaFormService service, CancellationToken ct) =>
        {
            var file = await service.GetAttachmentAsync(id, await access.ResolveActorAsync(principal.ToIdentity(), ct), ct);
            response.Headers.CacheControl = "private, no-store";
            response.Headers.XContentTypeOptions = "nosniff";
            return file.Content is not null ? Results.File(file.Content, file.ContentType, file.FileName) : Results.Redirect(file.Url);
        });
        app.MapGet("/api/public-lia-forms/{token}", async (string token, HttpResponse response, LiaFormService service, CancellationToken ct) =>
        {
            response.Headers.CacheControl = "no-store";
            return Results.Ok(await service.GetPublicAsync(token, ct));
        }).RequireRateLimiting("operations");
        app.MapPost("/api/public-lia-forms/{token}", SubmitPublicAsync)
            .WithMetadata(new RequestSizeLimitAttribute(LiaFormService.MaximumSubmissionBytes + 1024 * 1024))
            .RequireRateLimiting("public-service-requests");
    }

    private static async Task<IResult> SubmitPublicAsync(string token, HttpRequest request, LiaFormService service, CancellationToken ct)
    {
        // Validate the link before reading or buffering a public upload.
        await service.GetPublicAsync(token, ct);
        if (!request.HasFormContentType)
        {
            var command = await request.ReadFromJsonAsync<SubmitLiaFormCommand>(ct)
                ?? throw new DomainException("Informe as respostas do formulário.");
            return Results.Ok(new { submittedAt = await service.SubmitAsync(token, command, ct) });
        }
        var form = await request.ReadFormAsync(ct);
        SubmitLiaFormCommand submission;
        try
        {
            submission = JsonSerializer.Deserialize<SubmitLiaFormCommand>(form["answers"].ToString(), new JsonSerializerOptions(JsonSerializerDefaults.Web))
                ?? throw new JsonException();
        }
        catch (JsonException) { throw new DomainException("As respostas do formulário são inválidas."); }
        var uploads = new List<UploadLiaFormFile>();
        try
        {
            foreach (var file in form.Files)
            {
                if (!file.Name.StartsWith("file:", StringComparison.Ordinal)) throw new DomainException("Campo de anexo inválido.");
                uploads.Add(new(file.Name[5..], file.FileName, file.ContentType, file.Length, file.OpenReadStream()));
            }
            return Results.Ok(new { submittedAt = await service.SubmitAsync(token, submission, ct, uploads) });
        }
        finally { foreach (var file in uploads) await file.Content.DisposeAsync(); }
    }
}
