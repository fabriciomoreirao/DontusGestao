namespace Dontus.Operations.Domain;

public sealed class ChatQueue : Entity
{
    public required string Name { get; set; }
    public string Description { get; set; } = "";
    public Guid DepartmentId { get; set; }
    public string DistributionStrategy { get; set; } = "Manual";
    public bool Active { get; set; } = true;
}

public sealed class ChatChannel : Entity
{
    public required string Name { get; set; }
    public string Type { get; set; } = "Interno";
    public Guid DepartmentId { get; set; }
    public Guid? DefaultQueueId { get; set; }
    public Guid? DefaultAssigneeUserId { get; set; }
    public bool Active { get; set; } = true;
    public bool AiEnabled { get; set; }
    public bool AllowTransfer { get; set; } = true;
    public bool AutoCreateTask { get; set; }
    public string GreetingMessage { get; set; } = "";
    public string AwayMessage { get; set; } = "";
}

public sealed class ChatWhatsAppNumber : Entity
{
    public Guid ChannelId { get; set; }
    public Guid DepartmentId { get; set; }
    public required string InternalName { get; set; }
    public required string DisplayName { get; set; }
    public required string PhoneNumber { get; set; }
    public string PhoneNumberId { get; set; } = "";
    public string WabaId { get; set; } = "";
    public string BusinessManagerId { get; set; } = "";
    public string ConnectionMode { get; set; } = "CloudApi";
    public string MetaAppId { get; set; } = "";
    public string EmbeddedSignupConfigId { get; set; } = "";
    public string AccessTokenProtected { get; set; } = "";
    public string VerifyTokenProtected { get; set; } = "";
    public string AppSecretProtected { get; set; } = "";
    public string ApiVersion { get; set; } = "v23.0";
    public string Status { get; set; } = "Pendente";
    public string CoexistenceStatus { get; set; } = "Não iniciado";
    public string CoexistenceError { get; set; } = "";
    public string Quality { get; set; } = "Desconhecida";
    public DateTimeOffset? LastSyncAt { get; set; }
    public DateTimeOffset? CoexistenceCompletedAt { get; set; }
    public bool Active { get; set; } = true;
}

public sealed class ChatContact : Entity
{
    public required string Name { get; set; }
    public string Phone { get; set; } = "";
    public string Email { get; set; } = "";
    public Guid? CustomerId { get; set; }
    public string CompanyName { get; set; } = "";
    public string Notes { get; set; } = "";
}

public sealed class ChatConversation : Entity
{
    public long Number { get; set; }
    public required string Protocol { get; set; }
    public Guid ContactId { get; set; }
    public Guid ChannelId { get; set; }
    public Guid DepartmentId { get; set; }
    public Guid QueueId { get; set; }
    public Guid? AssigneeUserId { get; set; }
    public string Subject { get; set; } = "";
    public string Status { get; set; } = "Aberta";
    public string Priority { get; set; } = "Normal";
    public bool Favorite { get; set; }
    public int UnreadCount { get; set; }
    public DateTimeOffset LastMessageAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? FirstResponseAt { get; set; }
    public DateTimeOffset? ClosedAt { get; set; }
    public DateTimeOffset? SlaDueAt { get; set; }
    public string AiSummary { get; set; } = "";
    public string Sentiment { get; set; } = "Neutro";
}

public sealed class ChatMessage : Entity
{
    public Guid ConversationId { get; set; }
    public string ExternalId { get; set; } = "";
    public string Direction { get; set; } = "Saida";
    public string Type { get; set; } = "Texto";
    public required string Body { get; set; }
    public bool Internal { get; set; }
    public Guid? SenderUserId { get; set; }
    public string SenderName { get; set; } = "";
    public string Status { get; set; } = "Enviada";
    public Guid? ReplyToMessageId { get; set; }
    public string MediaUrl { get; set; } = "";
    public string MediaStorageKey { get; set; } = "";
    public string MediaName { get; set; } = "";
    public string MediaContentType { get; set; } = "";
    public DateTimeOffset? DeliveredAt { get; set; }
    public DateTimeOffset? ReadAt { get; set; }
}

public sealed class ChatTag : Entity
{
    public required string Name { get; set; }
    public string Color { get; set; } = "#2563eb";
    public Guid? DepartmentId { get; set; }
    public bool Active { get; set; } = true;
}

public sealed class ChatConversationTag
{
    public Guid ConversationId { get; set; }
    public Guid TagId { get; set; }
}

public sealed class ChatTransfer : Entity
{
    public Guid ConversationId { get; set; }
    public Guid FromDepartmentId { get; set; }
    public Guid ToDepartmentId { get; set; }
    public Guid FromChannelId { get; set; }
    public Guid ToChannelId { get; set; }
    public Guid? FromQueueId { get; set; }
    public Guid ToQueueId { get; set; }
    public Guid? FromAssigneeUserId { get; set; }
    public Guid? ToAssigneeUserId { get; set; }
    public Guid ActorUserId { get; set; }
    public required string Reason { get; set; }
}

public sealed class ChatQuickReply : Entity
{
    public required string Shortcut { get; set; }
    public required string Title { get; set; }
    public required string Body { get; set; }
    public Guid? DepartmentId { get; set; }
    public bool Active { get; set; } = true;
}

public sealed class ChatWebhookEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string EventKey { get; set; }
    public string PhoneNumberId { get; set; } = "";
    public string PayloadJson { get; set; } = "{}";
    public string Status { get; set; } = "Recebido";
    public int Attempts { get; set; }
    public string LastError { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ProcessedAt { get; set; }
}
