namespace Dontus.Operations.Domain;

public sealed class WhatsAppTemplate : Entity
{
    public Guid NumberId { get; set; }
    public string MetaId { get; set; } = "";
    public string Name { get; set; } = "";
    public string Language { get; set; } = "pt_BR";
    public string Purpose { get; set; } = "Campanhas";
    public string Category { get; set; } = "UTILITY";
    public string Body { get; set; } = "";
    public string HeaderType { get; set; } = "NONE";
    public string HeaderHandle { get; set; } = "";
    public string MediaUrl { get; set; } = "";
    public string VariablesJson { get; set; } = "[]";
    public string ButtonsJson { get; set; } = "[]";
    public string Status { get; set; } = "PENDING";
    public string RejectionReason { get; set; } = "";
    public DateTimeOffset? SyncedAt { get; set; }
}

public sealed class WhatsAppCampaign : Entity
{
    public Guid NumberId { get; set; }
    public string Name { get; set; } = "";
    public string Category { get; set; } = "MARKETING";
    public string Status { get; set; } = "Aprovada";
    public string CreatedBy { get; set; } = "";
    public string ConsentSource { get; set; } = "";
    public DateTimeOffset? ScheduledAt { get; set; }
    public DateTimeOffset? FinishedAt { get; set; }
    public DateTimeOffset? LeaseUntil { get; set; }
}

public sealed class WhatsAppCampaignDelivery : Entity
{
    public Guid CampaignId { get; set; }
    public Guid TemplateId { get; set; }
    public string Name { get; set; } = "";
    public string Phone { get; set; } = "";
    public string ParametersJson { get; set; } = "[]";
    public string Status { get; set; } = "Pendente";
    public string ExternalId { get; set; } = "";
    public string Error { get; set; } = "";
}

public sealed class WhatsAppOptOut : Entity
{
    public string Phone { get; set; } = "";
}
