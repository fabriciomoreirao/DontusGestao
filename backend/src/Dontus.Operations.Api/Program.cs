using System.Security.Claims;
using System.Text.Json;
using System.Text.Encodings.Web;
using System.Threading.RateLimiting;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();
builder.Services.AddOperationsInfrastructure(builder.Configuration);
builder.Services
    .AddAuthentication("DontusLocal")
    .AddScheme<AuthenticationSchemeOptions, LocalAuthenticationHandler>("DontusLocal", _ => { });
builder.Services.AddAuthorization();
builder.Services.AddHealthChecks();
builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = 250 * 1024 * 1024;
});
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("operations", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.User.FindFirstValue(ClaimTypes.Email) ?? context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 180,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));
    options.AddPolicy("password-recovery", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window = TimeSpan.FromMinutes(15),
                QueueLimit = 0,
            }));
});

var app = builder.Build();

app.UseExceptionHandler(errorApp => errorApp.Run(async context =>
{
    var exception = context.Features.Get<IExceptionHandlerFeature>()?.Error;
    var correlationId = context.TraceIdentifier;
    var (status, title, detail) = exception switch
    {
        DomainException domain => (domain.StatusCode, "Regra de negócio", domain.Message),
        DbUpdateConcurrencyException => (StatusCodes.Status409Conflict, "Conflito de concorrência", "O registro foi alterado por outro usuário."),
        _ => (StatusCodes.Status500InternalServerError, "Falha na operação", "Ocorreu um erro inesperado."),
    };
    context.Response.StatusCode = status;
    await context.Response.WriteAsJsonAsync(new ProblemDetails
    {
        Type = "https://dontus.local/problems/operation",
        Title = title,
        Status = status,
        Detail = detail,
        Instance = context.Request.Path,
        Extensions = { ["correlationId"] = correlationId },
    });
}));

app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapOpenApi();
app.MapGet("/health/live", () => Results.Ok(new { status = "ok" }));
app.MapGet("/health/ready", async (OperationsDbContext db, CancellationToken cancellationToken) =>
    await db.Database.CanConnectAsync(cancellationToken)
        ? Results.Ok(new { status = "ready" })
        : Results.Problem(statusCode: 503, title: "Banco indisponível"));

var localAuth = app.MapGroup("/api/auth");
localAuth.MapPost("/login", async (
    LocalLoginRequest request,
    IConfiguration configuration,
    ILocalAuthenticationService authentication,
    CancellationToken cancellationToken) =>
{
    if (!configuration.GetValue("Authentication:LocalPasswordEnabled", false))
        throw new DomainException("O login local está desabilitado.", 404);
    return Results.Ok(await authentication.LoginAsync(request.Email ?? "", request.Password ?? "", cancellationToken));
});
localAuth.MapPost("/forgot-password", async (
    LocalPasswordRecoveryRequest request,
    IConfiguration configuration,
    ILocalAuthenticationService authentication,
    CancellationToken cancellationToken) =>
{
    if (!configuration.GetValue("Authentication:LocalPasswordEnabled", false))
        throw new DomainException("O login local está desabilitado.", 404);
    await authentication.RequestPasswordRecoveryAsync(request.Email ?? "", cancellationToken);
    return Results.Accepted();
}).RequireRateLimiting("password-recovery");
localAuth.MapPost("/signout", async (
    HttpRequest request,
    ILocalAuthenticationService authentication,
    CancellationToken cancellationToken) =>
{
    await authentication.SignOutAsync(request.Headers["X-Local-Session"].FirstOrDefault() ?? "", cancellationToken);
    return Results.NoContent();
});
localAuth.MapPost("/change-password", async (
    LocalPasswordChangeRequest request,
    ClaimsPrincipal principal,
    ILocalAuthenticationService authentication,
    CancellationToken cancellationToken) =>
{
    await authentication.ChangePasswordAsync(
        principal.ToIdentity().Email,
        request.CurrentPassword ?? "",
        request.NewPassword ?? "",
        cancellationToken);
    return Results.NoContent();
}).RequireAuthorization();

var operations = app.MapGroup("/api/operations")
    .RequireAuthorization()
    .RequireRateLimiting("operations");

operations.MapGet("", async (
    ClaimsPrincipal principal,
    IOperationsService service,
    IAgendaService agendaService,
    ISuggestionService suggestionService,
    ITaskService taskService,
    IChatService chatService,
    IInternalChatService internalChatService,
    IAccessControlService accessControl,
    CancellationToken cancellationToken) =>
{
    var actor = await accessControl.ResolveActorAsync(principal.ToIdentity(), cancellationToken);
    var snapshot = await service.GetSnapshotAsync(actor, cancellationToken);
    if (actor.HasPermission("diary", "view"))
        snapshot = snapshot with { DiaryModule = await service.GetDiaryModuleAsync(actor, cancellationToken) };
    if (actor.HasPermission("notes", "view"))
        snapshot = snapshot with { NotesModule = await service.GetNotesModuleAsync(actor, cancellationToken) };
    if (actor.HasPermission("work", "view"))
        snapshot = snapshot with { AgendaModule = await agendaService.GetModuleAsync(actor, cancellationToken) };
    if (actor.HasPermission("suggestions", "view"))
        snapshot = snapshot with { SuggestionModule = await suggestionService.GetModuleAsync(actor, cancellationToken) };
    if (actor.HasPermission("tasks", "view") || actor.HasPermission("catalogs", "view"))
        snapshot = snapshot with { TaskModule = await taskService.GetModuleAsync(actor, cancellationToken) };
    if (actor.HasPermission("chat", "view"))
        snapshot = snapshot with { ChatModule = await chatService.GetModuleAsync(actor, cancellationToken) };
    if (actor.HasPermission("internalChat", "view"))
        snapshot = snapshot with { InternalChatModule = await internalChatService.GetModuleAsync(actor, cancellationToken) };
    if (actor.HasPermission("notices", "view"))
        snapshot = snapshot with { NoticesModule = await service.GetNoticesModuleAsync(actor, cancellationToken) };
    if (actor.HasPermission("customers", "view") || actor.HasPermission("catalogs", "view"))
        snapshot = snapshot with { CustomerModule = await service.GetCustomerModuleAsync(actor, cancellationToken) };
    if (actor.HasPermission("admin", "manage"))
        snapshot = snapshot with { Access = await accessControl.GetManagementAsync(actor, cancellationToken) };
    return Results.Ok(snapshot);
});

var taskFiles = app.MapGroup("/api/tasks")
    .RequireAuthorization()
    .RequireRateLimiting("operations");

taskFiles.MapPost("/{taskId:guid}/attachments", async (
    Guid taskId,
    Guid? commentId,
    HttpRequest request,
    ClaimsPrincipal principal,
    ITaskService taskService,
    IAccessControlService accessControl,
    CancellationToken cancellationToken) =>
{
    if (!request.HasFormContentType)
        throw new DomainException("Envie os anexos no formato multipart/form-data.");
    var actor = await accessControl.ResolveActorAsync(principal.ToIdentity(), cancellationToken);
    var form = await request.ReadFormAsync(cancellationToken);
    if (form.Files.Count == 0)
        throw new DomainException("Selecione ao menos um arquivo.");
    if (form.Files.Count > 10)
        throw new DomainException("É permitido enviar no máximo 10 arquivos por vez.");

    var ids = new List<Guid>(form.Files.Count);
    foreach (var file in form.Files)
    {
        await using var content = file.OpenReadStream();
        ids.Add(await taskService.UploadAttachmentAsync(new UploadTaskAttachmentCommand(
            taskId, commentId, file.FileName, file.ContentType, file.Length, content), actor, cancellationToken));
    }
    return Results.Created($"/api/tasks/{taskId}/attachments", new { ok = true, ids });
}).DisableAntiforgery();

taskFiles.MapGet("/attachments/{attachmentId:guid}", async (
    Guid attachmentId,
    ClaimsPrincipal principal,
    ITaskService taskService,
    IAccessControlService accessControl,
    CancellationToken cancellationToken) =>
{
    var actor = await accessControl.ResolveActorAsync(principal.ToIdentity(), cancellationToken);
    var download = await taskService.GetAttachmentDownloadAsync(attachmentId, actor, cancellationToken);
    return Results.Redirect(download.Url);
});

taskFiles.MapDelete("/attachments/{attachmentId:guid}", async (
    Guid attachmentId,
    ClaimsPrincipal principal,
    ITaskService taskService,
    IAccessControlService accessControl,
    CancellationToken cancellationToken) =>
{
    var actor = await accessControl.ResolveActorAsync(principal.ToIdentity(), cancellationToken);
    await taskService.DeleteAttachmentAsync(attachmentId, actor, cancellationToken);
    return Results.NoContent();
});

var chatFiles = app.MapGroup("/api/chats")
    .RequireAuthorization()
    .RequireRateLimiting("operations");

chatFiles.MapPost("/{conversationId:guid}/attachments", async (
    Guid conversationId,
    HttpRequest request,
    ClaimsPrincipal principal,
    IChatService chatService,
    IAccessControlService accessControl,
    CancellationToken cancellationToken) =>
{
    if (!request.HasFormContentType) throw new DomainException("Envie o arquivo no formato multipart/form-data.");
    var actor = await accessControl.ResolveActorAsync(principal.ToIdentity(), cancellationToken);
    var form = await request.ReadFormAsync(cancellationToken);
    if (form.Files.Count == 0) throw new DomainException("Selecione ao menos um arquivo.");
    if (form.Files.Count > 10) throw new DomainException("É permitido enviar no máximo 10 arquivos por vez.");
    var internalNote = bool.TryParse(form["internal"], out var parsed) && parsed;
    var ids = new List<Guid>();
    foreach (var file in form.Files)
    {
        await using var content = file.OpenReadStream();
        ids.Add(await chatService.UploadAttachmentAsync(new UploadChatAttachmentCommand(
            conversationId, file.FileName, file.ContentType, file.Length, content, internalNote), actor, cancellationToken));
    }
    return Results.Created($"/api/chats/{conversationId}/attachments", new { ok = true, ids });
}).DisableAntiforgery();

chatFiles.MapGet("/attachments/{messageId:guid}", async (
    Guid messageId,
    ClaimsPrincipal principal,
    IChatService chatService,
    IAccessControlService accessControl,
    CancellationToken cancellationToken) =>
{
    var actor = await accessControl.ResolveActorAsync(principal.ToIdentity(), cancellationToken);
    var download = await chatService.GetAttachmentDownloadAsync(messageId, actor, cancellationToken);
    return Results.Redirect(download.Url);
});

var internalChatFiles = app.MapGroup("/api/internal-chats")
    .RequireAuthorization()
    .RequireRateLimiting("operations");

internalChatFiles.MapGet("", async (
    ClaimsPrincipal principal,
    IInternalChatService internalChatService,
    IAccessControlService accessControl,
    CancellationToken cancellationToken) =>
{
    var actor = await accessControl.ResolveActorAsync(principal.ToIdentity(), cancellationToken);
    return Results.Ok(await internalChatService.GetModuleAsync(actor, cancellationToken));
});

internalChatFiles.MapPost("/{roomId:guid}/attachments", async (
    Guid roomId,
    HttpRequest request,
    ClaimsPrincipal principal,
    IInternalChatService internalChatService,
    IAccessControlService accessControl,
    CancellationToken cancellationToken) =>
{
    if (!request.HasFormContentType) throw new DomainException("Envie o arquivo no formato multipart/form-data.");
    var actor = await accessControl.ResolveActorAsync(principal.ToIdentity(), cancellationToken);
    var form = await request.ReadFormAsync(cancellationToken);
    if (form.Files.Count == 0) throw new DomainException("Selecione ao menos um arquivo.");
    if (form.Files.Count > 10) throw new DomainException("É permitido enviar no máximo 10 arquivos por vez.");
    var ids = new List<Guid>();
    foreach (var file in form.Files)
    {
        await using var content = file.OpenReadStream();
        ids.Add(await internalChatService.UploadAttachmentAsync(new UploadInternalChatAttachmentCommand(
            roomId, file.FileName, file.ContentType, file.Length, content), actor, cancellationToken));
    }
    return Results.Created($"/api/internal-chats/{roomId}/attachments", new { ok = true, ids });
}).DisableAntiforgery();

internalChatFiles.MapGet("/attachments/{messageId:guid}", async (
    Guid messageId,
    ClaimsPrincipal principal,
    IInternalChatService internalChatService,
    IAccessControlService accessControl,
    CancellationToken cancellationToken) =>
{
    var actor = await accessControl.ResolveActorAsync(principal.ToIdentity(), cancellationToken);
    var attachment = await internalChatService.GetAttachmentAsync(messageId, actor, cancellationToken);
    return Results.File(attachment.FullPath, attachment.ContentType, fileDownloadName: null, enableRangeProcessing: true);
});

app.MapGet("/api/integrations/whatsapp/webhook", async (
    HttpRequest request,
    IChatService chatService,
    CancellationToken cancellationToken) =>
{
    var mode = request.Query["hub.mode"].ToString();
    var token = request.Query["hub.verify_token"].ToString();
    var challenge = request.Query["hub.challenge"].ToString();
    if (mode == "subscribe" && await chatService.VerifyWebhookAsync(token, cancellationToken))
        return Results.Text(challenge, "text/plain");
    return Results.StatusCode(StatusCodes.Status403Forbidden);
});

app.MapPost("/api/integrations/whatsapp/webhook", async (
    HttpRequest request,
    IChatService chatService,
    CancellationToken cancellationToken) =>
{
    using var reader = new StreamReader(request.Body);
    var payload = await reader.ReadToEndAsync(cancellationToken);
    using var document = JsonDocument.Parse(payload);
    var root = document.RootElement;
    if (!root.TryGetProperty("entry", out var entries)) return Results.Ok();
    foreach (var entry in entries.EnumerateArray())
    foreach (var change in entry.GetProperty("changes").EnumerateArray())
    {
        var value = change.GetProperty("value");
        var field = change.TryGetProperty("field", out var fieldElement) ? fieldElement.GetString() ?? "" : "";
        var historicalField = field == "history";
        var phoneNumberId = value.TryGetProperty("metadata", out var metadata) &&
                            metadata.TryGetProperty("phone_number_id", out var phoneId)
            ? phoneId.GetString() ?? ""
            : "";
        var wabaId = entry.TryGetProperty("id", out var entryId) ? entryId.GetString() ?? "" : "";
        if (!await chatService.VerifyWebhookSignatureAsync(
                string.IsNullOrWhiteSpace(phoneNumberId) ? wabaId : phoneNumberId,
                payload,
                request.Headers["X-Hub-Signature-256"].ToString(),
                cancellationToken))
            return Results.StatusCode(StatusCodes.Status401Unauthorized);

        if (value.TryGetProperty("messages", out var messages))
        {
            var contactName = value.TryGetProperty("contacts", out var contacts) && contacts.GetArrayLength() > 0
                ? contacts[0].GetProperty("profile").GetProperty("name").GetString() ?? ""
                : "";
            foreach (var message in messages.EnumerateArray())
            {
                var externalId = message.GetProperty("id").GetString() ?? Guid.NewGuid().ToString("N");
                var type = message.GetProperty("type").GetString() ?? "unknown";
                await chatService.ReceiveWebhookAsync(new ReceiveWhatsAppWebhookCommand(
                    externalId, phoneNumberId, externalId,
                    message.GetProperty("from").GetString() ?? "", contactName, "Entrada", type,
                    WhatsAppMessageBody(message, type, "recebido"),
                    WhatsAppTimestamp(message), historicalField, payload), cancellationToken);
            }
        }

        JsonElement echoes;
        if (value.TryGetProperty("message_echoes", out echoes) ||
            value.TryGetProperty("smb_message_echoes", out echoes))
        {
            var echoContactName = value.TryGetProperty("contacts", out var echoContacts) &&
                                  echoContacts.GetArrayLength() > 0 &&
                                  echoContacts[0].TryGetProperty("profile", out var echoProfile) &&
                                  echoProfile.TryGetProperty("username", out var echoUsername)
                ? echoUsername.GetString() ?? ""
                : "";
            foreach (var message in echoes.EnumerateArray())
            {
                var externalId = message.GetProperty("id").GetString() ?? Guid.NewGuid().ToString("N");
                var type = message.GetProperty("type").GetString() ?? "unknown";
                var contactPhone = message.TryGetProperty("to", out var recipient)
                    ? recipient.GetString() ?? ""
                    : message.TryGetProperty("from", out var sender) ? sender.GetString() ?? "" : "";
                await chatService.ReceiveWebhookAsync(new ReceiveWhatsAppWebhookCommand(
                    $"echo:{externalId}", phoneNumberId, externalId,
                    contactPhone, echoContactName, "Saida", type,
                    WhatsAppMessageBody(message, type, "enviado pelo WhatsApp Business"),
                    WhatsAppTimestamp(message), historicalField, payload),
                    cancellationToken);
            }
        }

        if (value.TryGetProperty("history", out var historyChunks))
        {
            var businessPhone = metadata.ValueKind == JsonValueKind.Object &&
                                metadata.TryGetProperty("display_phone_number", out var displayPhone)
                ? new string((displayPhone.GetString() ?? "").Where(char.IsDigit).ToArray())
                : "";
            foreach (var chunk in historyChunks.EnumerateArray())
            {
                if (!chunk.TryGetProperty("threads", out var threads)) continue;
                foreach (var thread in threads.EnumerateArray())
                {
                    var contactPhone = thread.TryGetProperty("id", out var threadId) ? threadId.GetString() ?? "" : "";
                    var contactName = "";
                    if (thread.TryGetProperty("context", out var context))
                    {
                        if (context.TryGetProperty("wa_id", out var waId) && !string.IsNullOrWhiteSpace(waId.GetString()))
                            contactPhone = waId.GetString()!;
                        else if (string.IsNullOrWhiteSpace(contactPhone) &&
                                 context.TryGetProperty("user_id", out var userId))
                            contactPhone = userId.GetString() ?? "";
                        if (context.TryGetProperty("username", out var username))
                            contactName = username.GetString() ?? "";
                    }
                    if (!thread.TryGetProperty("messages", out var historyMessages)) continue;
                    foreach (var message in historyMessages.EnumerateArray())
                    {
                        var externalId = message.GetProperty("id").GetString() ?? Guid.NewGuid().ToString("N");
                        var type = message.GetProperty("type").GetString() ?? "unknown";
                        var from = message.TryGetProperty("from", out var fromElement)
                            ? new string((fromElement.GetString() ?? "").Where(char.IsDigit).ToArray())
                            : "";
                        var direction = !string.IsNullOrWhiteSpace(businessPhone) && from == businessPhone
                            ? "Saida"
                            : "Entrada";
                        await chatService.ReceiveWebhookAsync(new ReceiveWhatsAppWebhookCommand(
                            $"history:{externalId}", phoneNumberId, externalId, contactPhone, contactName,
                            direction, type, WhatsAppMessageBody(message, type, "importado"),
                            WhatsAppTimestamp(message), true, payload), cancellationToken);
                    }
                }
            }
        }
    }
    return Results.Ok();
}).DisableAntiforgery();

operations.MapPost("", async (
    OperationsRequest request,
    ClaimsPrincipal principal,
    IOperationsService service,
    IAgendaService agendaService,
    ISuggestionService suggestionService,
    ITaskService taskService,
    IChatService chatService,
    IInternalChatService internalChatService,
    IAccessControlService accessControl,
    CancellationToken cancellationToken) =>
{
    var actor = await accessControl.ResolveActorAsync(principal.ToIdentity(), cancellationToken);
    Guid? id = null;
    string? temporaryPassword = null;
    string? createdProtocol = null;

    switch (request.Action?.Trim())
    {
        case "createCustomer":
            id = await service.CreateCustomerAsync(new CreateCustomerCommand(
                request.LegalName ?? "",
                request.TradeName,
                request.DocumentMasked,
                request.Segment,
                request.Owner,
                request.CsOwner,
                request.ClinicsCount ?? 1,
                request.MonthlyRevenueCents ?? 0,
                request.Strategic ?? false,
                request.Status, request.Project, request.ProductVersion, request.DueDay,
                request.Server, request.PaymentMethod, request.InvoiceCompany, request.GraceDays,
                request.DueDays, request.Subscription, request.Email, request.Phone, request.Website,
                request.Notes, request.Address, request.City, request.State), actor, cancellationToken);
            break;

        case "saveCustomerCatalog":
            id = await service.SaveCustomerCatalogAsync(request.Id, request.Catalog ?? "", request.Name ?? "", request.CatalogDescription, request.Active ?? true, actor, cancellationToken);
            break;

        case "deleteCustomerCatalog":
            await service.DeleteCustomerCatalogAsync(request.Id ?? throw new DomainException("Cadastro obrigatório."), actor, cancellationToken);
            break;

        case "saveNote":
            id = await service.SaveNoteAsync(request.Id, request.Title ?? "", request.Description, request.Color, actor, cancellationToken);
            break;

        case "deleteNote":
            await service.DeleteNoteAsync(request.Id ?? throw new DomainException("Anotação obrigatória."), actor, cancellationToken);
            break;

        case "duplicateNote":
            id = await service.DuplicateNoteAsync(request.Id ?? throw new DomainException("Anotação obrigatória."), actor, cancellationToken);
            break;

        case "reorderNotes":
            await service.ReorderNotesAsync(request.NoteIds ?? [], actor, cancellationToken);
            break;

        case "createWorkItem":
            id = await service.CreateWorkItemAsync(new CreateWorkItemCommand(
                request.Module ?? "",
                request.RecordType ?? "",
                request.Title ?? "",
                request.CustomerId,
                request.CustomerName,
                request.Owner,
                request.Team,
                request.Priority,
                request.DueAt,
                request.SlaDueAt,
                request.AmountCents ?? 0,
                request.Description,
                request.Tags,
                request.OriginType,
                request.OriginId,
                request.Status), actor, cancellationToken);
            break;

        case "updateWorkItem":
            await service.UpdateWorkItemAsync(new UpdateWorkItemCommand(
                request.Id ?? throw new DomainException("ID obrigatório."),
                request.Title ?? "",
                request.Owner,
                request.AmountCents ?? 0,
                request.Description,
                request.RecordType,
                request.CustomerName,
                request.Version ?? 0), actor, cancellationToken);
            break;

        case "deleteWorkItem":
            await service.DeleteWorkItemAsync(
                request.Id ?? throw new DomainException("ID obrigatório."), actor, cancellationToken);
            break;

        case "transitionWorkItem":
            await service.TransitionWorkItemAsync(new TransitionWorkItemCommand(
                request.Id ?? throw new DomainException("ID obrigatório."),
                request.NextStatus ?? "",
                request.Version ?? 0,
                request.Confirmed ?? false), actor, cancellationToken);
            break;

        case "createAppointment":
            id = await service.CreateAppointmentAsync(new CreateAppointmentCommand(
                request.Title ?? "",
                request.Kind,
                request.CustomerId,
                request.CustomerName,
                request.Owner ?? actor.DisplayName,
                request.Team,
                request.StartsAt ?? throw new DomainException("Início obrigatório."),
                request.EndsAt ?? throw new DomainException("Término obrigatório."),
                request.MeetingUrl), actor, cancellationToken);
            break;

        case "decideApproval":
            await service.DecideApprovalAsync(new DecideApprovalCommand(
                request.Id ?? throw new DomainException("ID obrigatório."),
                request.Decision ?? "",
                request.Justification), actor, cancellationToken);
            break;

        case "seedDemo":
            await service.SeedDemoAsync(actor, cancellationToken);
            break;

        case "createAccessUser":
            id = await accessControl.CreateUserAsync(new CreateAccessUserCommand(
                request.Email ?? "",
                request.DisplayName ?? "",
                request.Department ?? "",
                request.Active ?? true,
                request.GroupIds ?? []), actor, cancellationToken);
            break;

        case "updateAccessUser":
            await accessControl.UpdateUserAsync(new UpdateAccessUserCommand(
                request.Id ?? throw new DomainException("ID obrigatório."),
                request.Email ?? "",
                request.DisplayName ?? "",
                request.Department ?? "",
                request.Active ?? true,
                request.GroupIds ?? []), actor, cancellationToken);
            break;

        case "saveAgendaCalendar":
            id = await agendaService.SaveCalendarAsync(new SaveAgendaCalendarCommand(
                request.Id, request.Name ?? "", request.Description,
                request.DepartmentId ?? throw new DomainException("Setor obrigatório."), request.Active ?? true), actor, cancellationToken);
            break;

        case "saveAgendaType":
            id = await agendaService.SaveTypeAsync(new SaveAgendaTypeCommand(
                request.Id, request.Name ?? "", request.Description, request.Color, request.Active ?? true), actor, cancellationToken);
            break;

        case "saveAgendaStatus":
            id = await agendaService.SaveStatusAsync(new SaveAgendaStatusCommand(
                request.Id, request.Name ?? "", request.Description, request.Color, request.Active ?? true), actor, cancellationToken);
            break;

        case "deleteAgendaCalendar":
            await agendaService.DeleteCalendarAsync(request.Id ?? throw new DomainException("Agenda obrigatória."), actor, cancellationToken);
            break;

        case "deleteAgendaType":
            await agendaService.DeleteTypeAsync(request.Id ?? throw new DomainException("Tipo obrigatório."), actor, cancellationToken);
            break;

        case "deleteAgendaStatus":
            await agendaService.DeleteStatusAsync(request.Id ?? throw new DomainException("Status obrigatório."), actor, cancellationToken);
            break;

        case "createAgendaCommitment":
            var commitments = await agendaService.CreateCommitmentAsync(new CreateAgendaCommitmentCommand(
                request.AgendaId ?? throw new DomainException("Agenda obrigatória."),
                request.AgendaTypeId ?? throw new DomainException("Tipo obrigatório."),
                request.AgendaStatusId ?? throw new DomainException("Status obrigatório."),
                request.ResponsibleUserId ?? throw new DomainException("Responsável obrigatório."),
                request.Title ?? "", request.Description,
                request.StartsAt ?? throw new DomainException("Início obrigatório."),
                request.EndsAt ?? throw new DomainException("Término obrigatório."),
                request.ParticipantUserIds, request.Recurrence), actor, cancellationToken);
            id = commitments.FirstOrDefault();
            break;

        case "updateAgendaCommitment":
            await agendaService.UpdateCommitmentAsync(new UpdateAgendaCommitmentCommand(
                request.Id ?? throw new DomainException("Compromisso obrigatório."),
                request.AgendaId ?? throw new DomainException("Agenda obrigatória."),
                request.AgendaTypeId ?? throw new DomainException("Tipo obrigatório."),
                request.AgendaStatusId ?? throw new DomainException("Status obrigatório."),
                request.ResponsibleUserId ?? throw new DomainException("Responsável obrigatório."),
                request.Title ?? "", request.Description,
                request.StartsAt ?? throw new DomainException("Início obrigatório."),
                request.EndsAt ?? throw new DomainException("Término obrigatório."), request.ParticipantUserIds), actor, cancellationToken);
            break;

        case "changeAgendaCommitmentStatus":
            await agendaService.ChangeCommitmentStatusAsync(new ChangeAgendaCommitmentStatusCommand(
                request.Id ?? throw new DomainException("Compromisso obrigatório."),
                request.AgendaStatusId ?? throw new DomainException("Status obrigatório.")), actor, cancellationToken);
            break;

        case "deleteAgendaCommitment":
            await agendaService.DeleteCommitmentAsync(request.Id ?? throw new DomainException("Compromisso obrigatório."), actor, cancellationToken);
            break;

        case "saveSuggestionPriority":
            id = await suggestionService.SavePriorityAsync(new SaveSuggestionPriorityCommand(
                request.Id, request.Name ?? "", request.Description, request.Color, request.DisplayOrder ?? 0, request.Active ?? true), actor, cancellationToken);
            break;

        case "saveSuggestionStatus":
            id = await suggestionService.SaveStatusAsync(new SaveSuggestionStatusCommand(
                request.Id, request.Name ?? "", request.Description, request.KanbanColumn, request.Color, request.DisplayOrder ?? 0,
                request.IsInitial ?? false, request.Active ?? true), actor, cancellationToken);
            break;

        case "deleteSuggestionPriority":
            await suggestionService.DeletePriorityAsync(
                request.Id ?? throw new DomainException("Prioridade obrigatória."), actor, cancellationToken);
            break;

        case "deleteSuggestionStatus":
            await suggestionService.DeleteStatusAsync(
                request.Id ?? throw new DomainException("Status obrigatório."), actor, cancellationToken);
            break;

        case "createSuggestion":
            var createdSuggestion = await suggestionService.CreateSuggestionAsync(new CreateSuggestionCommand(
                request.Name ?? "", request.Description, request.CustomerId,
                request.PriorityId ?? throw new DomainException("Prioridade obrigatória."),
                request.StrategicClient ?? false, request.CancellationRisk ?? false), actor, cancellationToken);
            id = createdSuggestion.Id;
            createdProtocol = createdSuggestion.Protocol;
            break;

        case "changeSuggestionStatus":
            await suggestionService.ChangeStatusAsync(new ChangeSuggestionStatusCommand(
                request.Id ?? throw new DomainException("Sugestão obrigatória."),
                request.StatusId ?? throw new DomainException("Status obrigatório."),
                request.Version ?? 0), actor, cancellationToken);
            break;

        case "addSuggestionComment":
            id = await suggestionService.AddCommentAsync(new AddSuggestionCommentCommand(
                request.Id ?? throw new DomainException("Sugestão obrigatória."), request.Body ?? ""), actor, cancellationToken);
            break;

        case "deleteSuggestion":
            await suggestionService.DeleteSuggestionAsync(
                request.Id ?? throw new DomainException("Sugestão obrigatória."), actor, cancellationToken);
            break;

        case "createEmployee":
            var createdEmployee = await accessControl.CreateEmployeeAsync(new CreateEmployeeCommand(
                request.DisplayName ?? "",
                request.Email ?? "",
                request.BirthDate,
                request.StartedAt,
                request.DepartmentIds ?? (request.DepartmentId is { } employeeDepartmentId ? [employeeDepartmentId] : []),
                request.EmployeeLevelId ?? throw new DomainException("Nível obrigatório."),
                request.PhotoDataUrl, request.JobTitle, request.IsCoordinator ?? false,
                request.SubordinateUserIds), actor, cancellationToken);
            id = createdEmployee.Id;
            temporaryPassword = createdEmployee.TemporaryPassword;
            break;

        case "updateEmployee":
            await accessControl.UpdateEmployeeAsync(new UpdateEmployeeCommand(
                request.Id ?? throw new DomainException("Colaborador obrigatório."),
                request.DisplayName ?? "", request.Email ?? "", request.BirthDate, request.StartedAt,
                request.DepartmentIds ?? (request.DepartmentId is { } departmentId ? [departmentId] : []),
                request.EmployeeLevelId ?? throw new DomainException("Nível obrigatório."),
                request.PhotoDataUrl, request.JobTitle, request.IsCoordinator ?? false,
                request.SubordinateUserIds, request.Active ?? true), actor, cancellationToken);
            break;

        case "deleteEmployee":
            await accessControl.DeleteEmployeeAsync(request.Id ?? throw new DomainException("Colaborador obrigatório."), actor, cancellationToken);
            break;

        case "saveEmployeeDepartment":
            id = await accessControl.SaveEmployeeDepartmentAsync(
                new SaveEmployeeDepartmentCommand(request.Id, request.Name ?? "", request.Description, request.Active ?? true), actor, cancellationToken);
            break;

        case "saveEmployeeLevel":
            id = await accessControl.SaveEmployeeLevelAsync(
                new SaveEmployeeLevelCommand(request.Id, request.Name ?? "", request.Description, request.Active ?? true), actor, cancellationToken);
            break;

        case "deleteEmployeeDepartment":
            await accessControl.DeleteEmployeeDepartmentAsync(request.Id ?? throw new DomainException("Setor obrigatório."), actor, cancellationToken);
            break;

        case "deleteEmployeeLevel":
            await accessControl.DeleteEmployeeLevelAsync(request.Id ?? throw new DomainException("Nível obrigatório."), actor, cancellationToken);
            break;

        case "createAccessGroup":
            id = await accessControl.CreateGroupAsync(new CreateAccessGroupCommand(
                request.Name ?? "",
                request.GroupDescription ?? "",
                request.Active ?? true), actor, cancellationToken);
            break;

        case "updateAccessGroup":
            await accessControl.UpdateGroupAsync(new UpdateAccessGroupCommand(
                request.Id ?? throw new DomainException("ID obrigatório."),
                request.Name ?? "",
                request.GroupDescription ?? "",
                request.Active ?? true,
                request.Permissions ?? []), actor, cancellationToken);
            break;

        case "deleteAccessGroup":
            await accessControl.DeleteGroupAsync(request.Id ?? throw new DomainException("Grupo obrigatório."), actor, cancellationToken);
            break;

        case "createTask":
            var createdTask = await taskService.CreateAsync(new CreateCorporateTaskCommand(
                request.Title ?? "", request.Description ?? "",
                request.TypeId ?? throw new DomainException("Tipo obrigatório."),
                request.PriorityId, request.StatusId,
                request.SourceDepartmentId ?? throw new DomainException("Setor de origem obrigatório."),
                request.CurrentDepartmentId ?? throw new DomainException("Setor atual obrigatório."),
                request.AssigneeUserId, request.CustomerId, request.CustomerCode,
                request.CustomerName, request.ClientWhatsApp ?? "", request.ExternalLink, request.InternalNotes,
                request.DueAt, request.SlaPolicyId, request.CancellationRequest ?? false,
                request.ParticipantUserIds, request.AttachmentLinks), actor, cancellationToken);
            id = createdTask.Id;
            createdProtocol = createdTask.Protocol;
            break;

        case "changeTaskStatus":
            await taskService.ChangeStatusAsync(new ChangeTaskStatusCommand(
                request.TaskId ?? request.Id ?? throw new DomainException("Tarefa obrigatória."),
                request.StatusId ?? throw new DomainException("Status obrigatório."),
                request.Justification, request.Version ?? 0), actor, cancellationToken);
            break;

        case "changeTaskPriority":
            await taskService.ChangePriorityAsync(new ChangeTaskPriorityCommand(
                request.TaskId ?? request.Id ?? throw new DomainException("Tarefa obrigatória."),
                request.PriorityId ?? throw new DomainException("Prioridade obrigatória."),
                request.Version ?? 0), actor, cancellationToken);
            break;

        case "changeTaskSla":
            await taskService.ChangeSlaAsync(new ChangeTaskSlaCommand(
                request.TaskId ?? request.Id ?? throw new DomainException("Tarefa obrigatória."),
                request.SlaPolicyId, request.Version ?? 0), actor, cancellationToken);
            break;

        case "transferTask":
            await taskService.TransferAsync(new TransferTaskCommand(
                request.TaskId ?? request.Id ?? throw new DomainException("Tarefa obrigatória."),
                request.DepartmentId ?? throw new DomainException("Setor de destino obrigatório."),
                request.AssigneeUserId, request.Reason ?? "", request.RecalculateSla ?? true,
                request.Version ?? 0), actor, cancellationToken);
            break;

        case "assignTask":
            await taskService.AssignAsync(new AssignTaskCommand(
                request.TaskId ?? request.Id ?? throw new DomainException("Tarefa obrigatória."),
                request.AssigneeUserId, request.Version ?? 0), actor, cancellationToken);
            break;

        case "updateTask":
            await taskService.UpdateAsync(new UpdateCorporateTaskCommand(
                request.TaskId ?? request.Id ?? throw new DomainException("Tarefa obrigatória."),
                request.Title ?? "", request.Description ?? "",
                request.TypeId ?? throw new DomainException("Tipo obrigatório."),
                request.CustomerId, request.CustomerCode, request.CustomerName,
                request.ClientWhatsApp ?? "", request.CancellationRequest ?? false,
                request.ParticipantUserIds, request.Version ?? 0), actor, cancellationToken);
            break;

        case "deleteTask":
            await taskService.DeleteAsync(new DeleteCorporateTaskCommand(
                request.TaskId ?? request.Id ?? throw new DomainException("Tarefa obrigatória."),
                request.Version ?? 0), actor, cancellationToken);
            break;

        case "saveNotice":
            id = await service.SaveNoticeAsync(
                request.Id, request.Title ?? "", request.Body ?? "",
                request.NoticeType ?? "Informativo", request.NoticeKind ?? "Aviso",
                request.Audience ?? "Todos", request.TargetUserId,
                request.EventAt, request.ExpiresAt, request.ImageDataUrl,
                request.Active ?? true, actor, cancellationToken);
            break;

        case "deleteNotice":
            await service.DeleteNoticeAsync(
                request.Id ?? throw new DomainException("Aviso obrigatório."), actor, cancellationToken);
            break;

        case "markNoticeRead":
            await service.MarkNoticeReadAsync(
                request.Id ?? throw new DomainException("Aviso obrigatório."), actor, cancellationToken);
            break;

        case "markNoticeViewed":
            await service.MarkNoticeViewedAsync(
                request.Id ?? throw new DomainException("Aviso obrigatório."), actor, cancellationToken);
            break;

        case "addTaskComment":
            id = await taskService.AddCommentAsync(new AddTaskCommentCommand(
                request.TaskId ?? request.Id ?? throw new DomainException("Tarefa obrigatória."),
                request.Body ?? "", request.MentionedUserIds), actor, cancellationToken);
            break;

        case "communicateWithClient":
            await taskService.CommunicateWithClientAsync(new ClientCommunicationCommand(
                request.TaskId ?? request.Id ?? throw new DomainException("Tarefa obrigatória."),
                request.ClientAction ?? "", request.Channel ?? "Interno", request.Message ?? ""), actor, cancellationToken);
            break;

        case "saveTaskDepartment":
            id = await taskService.SaveDepartmentAsync(new SaveTaskDepartmentCommand(
                request.Id, request.Name ?? "", request.CatalogDescription ?? "", request.Active ?? true,
                request.RequiresAssigneeOnTransfer ?? false, request.CoordinatorUserIds ?? []), actor, cancellationToken);
            break;

        case "saveTaskPriority":
            id = await taskService.SavePriorityAsync(new SaveTaskPriorityCommand(
                request.Id, request.Name ?? "", request.SeverityOrder ?? 0, request.Color ?? "#64748b",
                request.DefaultDueMinutes, request.Active ?? true), actor, cancellationToken);
            break;

        case "saveTaskStatus":
            id = await taskService.SaveStatusAsync(new SaveTaskStatusCommand(
                request.Id, request.Name ?? "", request.DepartmentId, request.DisplayOrder ?? 0,
                request.KanbanColumn ?? request.Name ?? "", request.IsInitial ?? false, request.IsFinal ?? false,
                request.AcceptsNewTasks ?? true, request.ManualMovement ?? true,
                request.RequiresJustification ?? false, request.Active ?? true), actor, cancellationToken);
            break;

        case "saveTaskSla":
            id = await taskService.SaveSlaPolicyAsync(new SaveTaskSlaPolicyCommand(
                request.Id, request.Name ?? "", request.DepartmentId ?? throw new DomainException("Setor obrigatório."),
                request.TypeId, request.PriorityId, request.FirstResponseMinutes ?? 0,
                request.ServiceStartMinutes ?? 0, request.CompletionMinutes ?? 0,
                request.BusinessDays ?? [1, 2, 3, 4, 5], request.BusinessStart ?? "08:00",
                request.BusinessEnd ?? "18:00", request.AlertBeforeMinutes ?? 60,
                request.EscalationMinutes ?? 0, request.RecalculateSla ?? true,
                request.PauseStatusIds ?? [], request.Active ?? true), actor, cancellationToken);
            break;

        case "saveTaskType":
            id = await taskService.SaveTypeAsync(new SaveTaskTypeCommand(
                request.Id, request.Name ?? "", request.CatalogDescription ?? "", request.DefaultPriorityId,
                request.DefaultSlaPolicyId, request.InitialStatusId ?? throw new DomainException("Status inicial obrigatório."),
                request.DepartmentIds ?? [], request.AllowedStatusIds ?? [], request.Active ?? true), actor, cancellationToken);
            break;

        case "saveTaskCollaborator":
            await taskService.SaveCollaboratorAsync(new SaveTaskCollaboratorCommand(
                request.UserId ?? throw new DomainException("Colaborador obrigatório."),
                request.Phone ?? "", request.JobTitle ?? "", request.Active ?? true,
                request.DepartmentIds ?? [], request.CoordinatorDepartmentIds ?? []), actor, cancellationToken);
            break;

        case "deleteTaskCatalog":
            await taskService.DeleteCatalogEntryAsync(
                request.Catalog ?? throw new DomainException("Cadastro obrigatório."),
                request.Id ?? request.UserId ?? throw new DomainException("Registro obrigatório."), actor, cancellationToken);
            break;

        case "createTaskCollaborator":
            id = await taskService.CreateCollaboratorAsync(new CreateTaskCollaboratorCommand(
                request.DisplayName ?? "", request.Email ?? "", request.Phone ?? "",
                request.JobTitle ?? "", request.Active ?? true, request.DepartmentIds ?? [],
                request.CoordinatorDepartmentIds ?? []), actor, cancellationToken);
            break;

        case "markTaskNotificationRead":
            await taskService.MarkNotificationReadAsync(
                request.NotificationId ?? throw new DomainException("Notificação obrigatória."), actor, cancellationToken);
            break;

        case "createInternalChatRoom":
            id = await internalChatService.CreateRoomAsync(new CreateInternalChatRoomCommand(
                request.Name, request.PhotoDataUrl, request.IsGroup ?? false, request.MemberUserIds), actor, cancellationToken);
            break;

        case "sendInternalChatMessage":
            id = await internalChatService.SendMessageAsync(new SendInternalChatMessageCommand(
                request.RoomId ?? throw new DomainException("Conversa obrigatória."),
                request.Body, request.MessageType), actor, cancellationToken);
            break;

        case "setInternalChatRoomArchived":
            await internalChatService.SetArchivedAsync(new SetInternalChatRoomArchivedCommand(
                request.RoomId ?? throw new DomainException("Conversa obrigatória."), request.Archived ?? true), actor, cancellationToken);
            break;

        case "markInternalChatRoomRead":
            await internalChatService.MarkReadAsync(new MarkInternalChatRoomReadCommand(
                request.RoomId ?? throw new DomainException("Conversa obrigatória.")), actor, cancellationToken);
            break;

        case "updateInternalChatGroup":
            await internalChatService.UpdateGroupAsync(new UpdateInternalChatGroupCommand(
                request.RoomId ?? throw new DomainException("Grupo obrigatório."), request.Name, request.PhotoDataUrl), actor, cancellationToken);
            break;

        case "createChatConversation":
            id = await chatService.CreateConversationAsync(new CreateChatConversationCommand(
                request.ContactName ?? "", request.Phone ?? "", request.Email ?? "", request.CustomerId,
                request.CompanyName ?? "", request.ChannelId ?? throw new DomainException("Canal obrigatório."),
                request.QueueId, request.AssigneeUserId, request.Subject ?? "", request.Priority ?? "Normal",
                request.InitialMessage, request.IsGroup ?? false, request.GroupName,
                request.GroupParticipants), actor, cancellationToken);
            break;

        case "sendChatMessage":
            id = await chatService.SendMessageAsync(new SendChatMessageCommand(
                request.ConversationId ?? throw new DomainException("Conversa obrigatória."),
                request.Body ?? "", request.Internal ?? false, request.ReplyToMessageId), actor, cancellationToken);
            break;

        case "updateChatConversation":
            await chatService.UpdateConversationAsync(new UpdateChatConversationCommand(
                request.ConversationId ?? throw new DomainException("Conversa obrigatória."),
                request.Status, request.Priority, request.Favorite, request.MarkRead, request.Subject,
                request.SatisfactionScore, request.SatisfactionComment, request.Version ?? 0), actor, cancellationToken);
            break;

        case "assignChatConversation":
            await chatService.AssignAsync(new AssignChatConversationCommand(
                request.ConversationId ?? throw new DomainException("Conversa obrigatória."),
                request.AssigneeUserId, request.QueueId, request.Version ?? 0), actor, cancellationToken);
            break;

        case "transferChatConversation":
            await chatService.TransferAsync(new TransferChatConversationCommand(
                request.ConversationId ?? throw new DomainException("Conversa obrigatória."),
                request.ToDepartmentId ?? throw new DomainException("Setor de destino obrigatório."),
                request.ToChannelId ?? throw new DomainException("Canal de destino obrigatório."),
                request.ToQueueId ?? throw new DomainException("Fila de destino obrigatória."),
                request.AssigneeUserId, request.Reason ?? "", request.Version ?? 0), actor, cancellationToken);
            break;

        case "batchCloseChatConversations":
            await chatService.BatchCloseAsync(new BatchCloseChatConversationsCommand(
                request.ConversationIds ?? []), actor, cancellationToken);
            break;

        case "saveChatQueue":
            id = await chatService.SaveQueueAsync(new SaveChatQueueCommand(
                request.Id, request.Name ?? "", request.CatalogDescription ?? "",
                request.DepartmentId ?? throw new DomainException("Setor obrigatório."),
                request.DistributionStrategy ?? "Manual", request.Active ?? true), actor, cancellationToken);
            break;

        case "saveChatChannel":
            id = await chatService.SaveChannelAsync(new SaveChatChannelCommand(
                request.Id, request.Name ?? "", request.ChannelType ?? "Interno",
                request.DepartmentId ?? throw new DomainException("Setor obrigatório."),
                request.QueueId, request.AssigneeUserId, request.Active ?? true,
                request.AiEnabled ?? false, request.AllowTransfer ?? true, request.AutoCreateTask ?? false,
                request.GreetingMessage ?? "", request.AwayMessage ?? "",
                request.SendClosingMessage ?? false, request.ClosingMessage ?? ""), actor, cancellationToken);
            break;

        case "saveChatWhatsAppNumber":
            id = await chatService.SaveWhatsAppNumberAsync(new SaveChatWhatsAppNumberCommand(
                request.Id, request.ChannelId ?? throw new DomainException("Canal obrigatório."),
                request.DepartmentId ?? throw new DomainException("Setor obrigatório."),
                request.InternalName ?? "", request.DisplayName ?? "", request.Phone ?? "",
                request.PhoneNumberId ?? "", request.WabaId ?? "", request.BusinessManagerId ?? "",
                request.ConnectionMode ?? "Coexistence", request.MetaAppId ?? "",
                request.EmbeddedSignupConfigId ?? "",
                request.AccessToken, request.VerifyToken, request.AppSecret, request.ApiVersion ?? "v23.0",
                request.Active ?? true), actor, cancellationToken);
            break;

        case "completeChatWhatsAppCoexistence":
            id = await chatService.CompleteWhatsAppCoexistenceAsync(
                new CompleteWhatsAppCoexistenceCommand(
                    request.Id ?? throw new DomainException("Número WhatsApp obrigatório."),
                    request.AuthorizationCode ?? "",
                    request.WabaId ?? ""),
                actor,
                cancellationToken);
            break;

        case "retryChatWhatsAppCoexistence":
            id = await chatService.RetryWhatsAppCoexistenceAsync(
                request.Id ?? throw new DomainException("Número WhatsApp obrigatório."),
                actor,
                cancellationToken);
            break;

        case "saveChatTag":
            id = await chatService.SaveTagAsync(new SaveChatTagCommand(
                request.Id, request.Name ?? "", request.Color ?? "#2563eb",
                request.DepartmentId, request.Active ?? true), actor, cancellationToken);
            break;

        case "saveChatQuickReply":
            id = await chatService.SaveQuickReplyAsync(new SaveChatQuickReplyCommand(
                request.Id, request.Shortcut ?? "", request.Title ?? "", request.Body ?? "",
                request.DepartmentId, request.Active ?? true), actor, cancellationToken);
            break;

        case "setChatTag":
            await chatService.SetTagAsync(new SetChatTagCommand(
                request.ConversationId ?? throw new DomainException("Conversa obrigatória."),
                request.TagId ?? throw new DomainException("Etiqueta obrigatória."),
                request.Remove ?? false), actor, cancellationToken);
            break;

        default:
            throw new DomainException("A operação solicitada não é suportada.");
    }

    actor = await accessControl.ResolveActorAsync(principal.ToIdentity(), cancellationToken);
    var snapshot = await service.GetSnapshotAsync(actor, cancellationToken);
    if (actor.HasPermission("diary", "view"))
        snapshot = snapshot with { DiaryModule = await service.GetDiaryModuleAsync(actor, cancellationToken) };
    if (actor.HasPermission("notes", "view"))
        snapshot = snapshot with { NotesModule = await service.GetNotesModuleAsync(actor, cancellationToken) };
    if (actor.HasPermission("work", "view"))
        snapshot = snapshot with { AgendaModule = await agendaService.GetModuleAsync(actor, cancellationToken) };
    if (actor.HasPermission("suggestions", "view"))
        snapshot = snapshot with { SuggestionModule = await suggestionService.GetModuleAsync(actor, cancellationToken) };
    if (actor.HasPermission("tasks", "view") || actor.HasPermission("catalogs", "view"))
        snapshot = snapshot with { TaskModule = await taskService.GetModuleAsync(actor, cancellationToken) };
    if (actor.HasPermission("chat", "view"))
        snapshot = snapshot with { ChatModule = await chatService.GetModuleAsync(actor, cancellationToken) };
    if (actor.HasPermission("internalChat", "view"))
        snapshot = snapshot with { InternalChatModule = await internalChatService.GetModuleAsync(actor, cancellationToken) };
    if (actor.HasPermission("notices", "view"))
        snapshot = snapshot with { NoticesModule = await service.GetNoticesModuleAsync(actor, cancellationToken) };
    if (actor.HasPermission("customers", "view") || actor.HasPermission("catalogs", "view"))
        snapshot = snapshot with { CustomerModule = await service.GetCustomerModuleAsync(actor, cancellationToken) };
    var access = actor.HasPermission("admin", "manage")
        ? await accessControl.GetManagementAsync(actor, cancellationToken)
        : null;
    var response = snapshot with { Ok = true, Id = id, TemporaryPassword = temporaryPassword, CreatedProtocol = createdProtocol, Access = access };
    return id.HasValue ? Results.Json(response, statusCode: StatusCodes.Status201Created) : Results.Ok(response);
});

await InitializeDatabaseAsync(app);
await app.RunAsync();

static string WhatsAppMessageBody(JsonElement message, string type, string fallback)
{
    if (type == "text" && message.TryGetProperty("text", out var text) &&
        text.TryGetProperty("body", out var body))
        return body.GetString() ?? "";
    if (message.TryGetProperty(type, out var content) &&
        content.TryGetProperty("caption", out var caption) &&
        !string.IsNullOrWhiteSpace(caption.GetString()))
        return caption.GetString()!;
    return $"[{type} {fallback}]";
}

static DateTimeOffset? WhatsAppTimestamp(JsonElement message)
{
    if (!message.TryGetProperty("timestamp", out var timestamp)) return null;
    var raw = timestamp.ValueKind == JsonValueKind.String ? timestamp.GetString() : timestamp.GetRawText();
    return long.TryParse(raw, out var unixSeconds)
        ? DateTimeOffset.FromUnixTimeSeconds(unixSeconds)
        : null;
}

static async Task InitializeDatabaseAsync(WebApplication app)
{
    for (var attempt = 1; attempt <= 10; attempt++)
    {
        try
        {
            await using var scope = app.Services.CreateAsyncScope();
            var service = scope.ServiceProvider.GetRequiredService<IOperationsService>();
            await service.InitializeAsync();
            var accessControl = scope.ServiceProvider.GetRequiredService<IAccessControlService>();
            await accessControl.InitializeAsync();
            var taskService = scope.ServiceProvider.GetRequiredService<ITaskService>();
            await taskService.InitializeAsync();
            var chatService = scope.ServiceProvider.GetRequiredService<IChatService>();
            await chatService.InitializeAsync();
            var suggestionService = scope.ServiceProvider.GetRequiredService<ISuggestionService>();
            await suggestionService.InitializeAsync();
            return;
        }
        catch when (attempt < 10)
        {
            await Task.Delay(TimeSpan.FromSeconds(Math.Min(attempt * 2, 10)));
        }
    }
}

public sealed class OperationsRequest
{
    public string? Action { get; init; }
    public Guid? Id { get; init; }
    public string? Module { get; init; }
    public string? RecordType { get; init; }
    public string? Title { get; init; }
    public Guid? CustomerId { get; init; }
    public Guid? AgendaId { get; init; }
    public Guid? AgendaTypeId { get; init; }
    public Guid? AgendaStatusId { get; init; }
    public Guid? ResponsibleUserId { get; init; }
    public string? CustomerName { get; init; }
    public string? LegalName { get; init; }
    public string? TradeName { get; init; }
    public string? DocumentMasked { get; init; }
    public string? Segment { get; init; }
    public string? Project { get; init; }
    public string? ProductVersion { get; init; }
    public string? DueDay { get; init; }
    public string? Server { get; init; }
    public string? PaymentMethod { get; init; }
    public string? InvoiceCompany { get; init; }
    public string? GraceDays { get; init; }
    public string? DueDays { get; init; }
    public string? Subscription { get; init; }
    public string? Website { get; init; }
    public string? Notes { get; init; }
    public string? Address { get; init; }
    public string? City { get; init; }
    public string? State { get; init; }
    public string? Owner { get; init; }
    public string? CsOwner { get; init; }
    public string? Team { get; init; }
    public int? ClinicsCount { get; init; }
    public long? MonthlyRevenueCents { get; init; }
    public bool? Strategic { get; init; }
    public bool? StrategicClient { get; init; }
    public bool? CancellationRisk { get; init; }
    public string? Priority { get; init; }
    public string? Status { get; init; }
    public DateTimeOffset? DueAt { get; init; }
    public DateTimeOffset? SlaDueAt { get; init; }
    public long? AmountCents { get; init; }
    public string? Description { get; init; }
    public IReadOnlyCollection<string>? Tags { get; init; }
    public string? OriginType { get; init; }
    public Guid? OriginId { get; init; }
    public string? NextStatus { get; init; }
    public long? Version { get; init; }
    public bool? Confirmed { get; init; }
    public string? Kind { get; init; }
    public DateTimeOffset? StartsAt { get; init; }
    public DateTimeOffset? EndsAt { get; init; }
    public string? MeetingUrl { get; init; }
    public string? Decision { get; init; }
    public string? Justification { get; init; }
    public string? Email { get; init; }
    public string? DisplayName { get; init; }
    public DateOnly? BirthDate { get; init; }
    public DateOnly? StartedAt { get; init; }
    public Guid? EmployeeLevelId { get; init; }
    public string? PhotoDataUrl { get; init; }
    public string? Department { get; init; }
    public bool? Active { get; init; }
    public bool? IsCoordinator { get; init; }
    public IReadOnlyCollection<Guid>? SubordinateUserIds { get; init; }
    public IReadOnlyCollection<Guid>? GroupIds { get; init; }
    public string? Name { get; init; }
    public string? GroupDescription { get; init; }
    public IReadOnlyCollection<GroupPermissionDto>? Permissions { get; init; }
    public Guid? TaskId { get; init; }
    public Guid? TypeId { get; init; }
    public Guid? PriorityId { get; init; }
    public Guid? StatusId { get; init; }
    public Guid? SourceDepartmentId { get; init; }
    public Guid? CurrentDepartmentId { get; init; }
    public Guid? DepartmentId { get; init; }
    public Guid? AssigneeUserId { get; init; }
    public Guid? SlaPolicyId { get; init; }
    public string? CustomerCode { get; init; }
    public string? ClientWhatsApp { get; init; }
    public string? ExternalLink { get; init; }
    public string? InternalNotes { get; init; }
    public IReadOnlyCollection<Guid>? ParticipantUserIds { get; init; }
    public IReadOnlyCollection<string>? AttachmentLinks { get; init; }
    public string? Reason { get; init; }
    public bool? RecalculateSla { get; init; }
    public bool? CancellationRequest { get; init; }
    public string? Body { get; init; }
    public string? NoticeType { get; init; }
    public string? NoticeKind { get; init; }
    public string? Audience { get; init; }
    public Guid? TargetUserId { get; init; }
    public DateTimeOffset? EventAt { get; init; }
    public DateTimeOffset? ExpiresAt { get; init; }
    public string? ImageDataUrl { get; init; }
    public IReadOnlyCollection<Guid>? MentionedUserIds { get; init; }
    public IReadOnlyCollection<Guid>? NoteIds { get; init; }
    public string? ClientAction { get; init; }
    public string? Channel { get; init; }
    public string? Message { get; init; }
    public string? CatalogDescription { get; init; }
    public string? Catalog { get; init; }
    public bool? RequiresAssigneeOnTransfer { get; init; }
    public IReadOnlyCollection<Guid>? CoordinatorUserIds { get; init; }
    public int? SeverityOrder { get; init; }
    public string? Color { get; init; }
    public string? Recurrence { get; init; }
    public int? DefaultDueMinutes { get; init; }
    public int? DisplayOrder { get; init; }
    public string? KanbanColumn { get; init; }
    public bool? IsInitial { get; init; }
    public bool? IsFinal { get; init; }
    public bool? AcceptsNewTasks { get; init; }
    public bool? ManualMovement { get; init; }
    public bool? RequiresJustification { get; init; }
    public int? FirstResponseMinutes { get; init; }
    public int? ServiceStartMinutes { get; init; }
    public int? CompletionMinutes { get; init; }
    public IReadOnlyCollection<int>? BusinessDays { get; init; }
    public string? BusinessStart { get; init; }
    public string? BusinessEnd { get; init; }
    public int? AlertBeforeMinutes { get; init; }
    public int? EscalationMinutes { get; init; }
    public IReadOnlyCollection<Guid>? PauseStatusIds { get; init; }
    public Guid? DefaultPriorityId { get; init; }
    public Guid? DefaultSlaPolicyId { get; init; }
    public Guid? InitialStatusId { get; init; }
    public IReadOnlyCollection<Guid>? DepartmentIds { get; init; }
    public IReadOnlyCollection<Guid>? AllowedStatusIds { get; init; }
    public Guid? UserId { get; init; }
    public string? Phone { get; init; }
    public string? JobTitle { get; init; }
    public IReadOnlyCollection<Guid>? CoordinatorDepartmentIds { get; init; }
    public Guid? NotificationId { get; init; }
    public Guid? ConversationId { get; init; }
    public IReadOnlyCollection<Guid>? ConversationIds { get; init; }
    public Guid? RoomId { get; init; }
    public bool? IsGroup { get; init; }
    public string? GroupName { get; init; }
    public IReadOnlyCollection<string>? GroupParticipants { get; init; }
    public bool? Archived { get; init; }
    public IReadOnlyCollection<Guid>? MemberUserIds { get; init; }
    public string? MessageType { get; init; }
    public string? ContactName { get; init; }
    public string? CompanyName { get; init; }
    public Guid? ChannelId { get; init; }
    public Guid? QueueId { get; init; }
    public string? Subject { get; init; }
    public string? InitialMessage { get; init; }
    public bool? Internal { get; init; }
    public Guid? ReplyToMessageId { get; init; }
    public bool? Favorite { get; init; }
    public bool? MarkRead { get; init; }
    public Guid? ToDepartmentId { get; init; }
    public Guid? ToChannelId { get; init; }
    public Guid? ToQueueId { get; init; }
    public string? DistributionStrategy { get; init; }
    public string? ChannelType { get; init; }
    public bool? AiEnabled { get; init; }
    public bool? AllowTransfer { get; init; }
    public bool? AutoCreateTask { get; init; }
    public string? GreetingMessage { get; init; }
    public string? AwayMessage { get; init; }
    public bool? SendClosingMessage { get; init; }
    public string? ClosingMessage { get; init; }
    public string? InternalName { get; init; }
    public string? PhoneNumberId { get; init; }
    public string? WabaId { get; init; }
    public string? BusinessManagerId { get; init; }
    public string? ConnectionMode { get; init; }
    public string? MetaAppId { get; init; }
    public string? EmbeddedSignupConfigId { get; init; }
    public string? AuthorizationCode { get; init; }
    public string? AccessToken { get; init; }
    public string? VerifyToken { get; init; }
    public string? AppSecret { get; init; }
    public string? ApiVersion { get; init; }
    public string? Shortcut { get; init; }
    public Guid? TagId { get; init; }
    public bool? Remove { get; init; }
    public int? SatisfactionScore { get; init; }
    public string? SatisfactionComment { get; init; }
}

public sealed class LocalLoginRequest
{
    public string? Email { get; init; }
    public string? Password { get; init; }
}

public sealed class LocalPasswordChangeRequest
{
    public string? CurrentPassword { get; init; }
    public string? NewPassword { get; init; }
}

public sealed class LocalPasswordRecoveryRequest
{
    public string? Email { get; init; }
}

internal static class ClaimsPrincipalExtensions
{
    public static AuthenticatedIdentity ToIdentity(this ClaimsPrincipal principal) =>
        new(
            principal.FindFirstValue(ClaimTypes.Email) ?? throw new DomainException("Usuário não autenticado.", 401),
            principal.FindFirstValue(ClaimTypes.Name) ?? "Usuário Dontus");
}

internal sealed class LocalAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    IConfiguration configuration,
    IServiceScopeFactory scopeFactory)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (configuration.GetValue("Authentication:LocalPasswordEnabled", false))
        {
            var token = Request.Headers["X-Local-Session"].FirstOrDefault();
            if (!string.IsNullOrWhiteSpace(token))
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                var authentication = scope.ServiceProvider.GetRequiredService<ILocalAuthenticationService>();
                var identity = await authentication.ResolveSessionAsync(token, Context.RequestAborted);
                if (identity is not null)
                    return Authenticate(identity.Email, identity.DisplayName, "Colaborador");
            }
        }

        if (!configuration.GetValue("Authentication:DevelopmentBypass", false))
            return AuthenticateResult.Fail("Autenticação necessária.");

        var email = DecodeHeader("X-User-Email", "gestor@dontus.local");
        var name = DecodeHeader("X-User-Name", "Gestor Dontus");
        var role = DecodeHeader("X-User-Role", "Administrador técnico");
        return Authenticate(email, name, role);
    }

    private AuthenticateResult Authenticate(string email, string name, string role)
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.Email, email),
            new Claim(ClaimTypes.Name, name),
            new Claim(ClaimTypes.Role, role),
            new Claim("department", "Gestão"),
        };
        var identity = new ClaimsIdentity(claims, Scheme.Name);
        var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name);
        return AuthenticateResult.Success(ticket);
    }

    private string DecodeHeader(string name, string fallback)
    {
        var encoded = Request.Headers[name].FirstOrDefault();
        return string.IsNullOrWhiteSpace(encoded) ? fallback : Uri.UnescapeDataString(encoded);
    }
}

public partial class Program;
