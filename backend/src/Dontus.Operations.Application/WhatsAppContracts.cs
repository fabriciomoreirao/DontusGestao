using System.Text.Json;

namespace Dontus.Operations.Application;

public sealed record TemplateVariable(string Key, string Example);
public sealed record TemplateButton(string Type, string Text, string Url);
public sealed record SaveWhatsAppTemplateCommand(Guid NumberId, string Name, string Language, string Purpose,
    string Category, string Body, string HeaderType, string HeaderHandle, string MediaUrl,
    TemplateVariable[] Variables, TemplateButton[] Buttons);
public sealed record CampaignRecipient(string Name, string Phone, Dictionary<string, string>? Values);
public sealed record SaveWhatsAppCampaignCommand(Guid? Id, Guid NumberId, string Name, string Category,
    Guid[] TemplateIds, CampaignRecipient[] Recipients, bool ConsentConfirmed, string ConsentSource);
public sealed record ScheduleWhatsAppCampaignCommand(DateTimeOffset? ScheduledAt);
public sealed record SendWhatsAppTemplateCommand(Guid ConversationId, Guid TemplateId, string[] Parameters, bool ConsentConfirmed);
public sealed record RegisterWhatsAppSuiteCommand(Guid NumberId, string ClinicId, string DontusId, string Base);

public interface IWhatsAppAdminService
{
    Task<object> GetWhatsAppAdminAsync(ActorContext actor, CancellationToken ct);
    Task<Guid> SubmitTemplateAsync(SaveWhatsAppTemplateCommand command, ActorContext actor, CancellationToken ct);
    Task RefreshTemplatesAsync(Guid numberId, ActorContext actor, CancellationToken ct);
    Task<string> UploadTemplateSampleAsync(Guid numberId, string name, string contentType, byte[] bytes, ActorContext actor, CancellationToken ct);
    Task<Guid> SaveCampaignAsync(SaveWhatsAppCampaignCommand command, ActorContext actor, CancellationToken ct);
    Task CampaignActionAsync(Guid id, string action, DateTimeOffset? scheduledAt, ActorContext actor, CancellationToken ct);
    Task<Guid> SendTemplateAsync(SendWhatsAppTemplateCommand command, ActorContext actor, CancellationToken ct);
    Task RegisterSuiteAsync(RegisterWhatsAppSuiteCommand command, ActorContext actor, CancellationToken ct);
    Task ProcessCampaignsAsync(CancellationToken ct);
    Task ProcessWhatsAppStatusAsync(JsonElement value, CancellationToken ct);
}
