namespace Dontus.Operations.Application;

public static class ChatCapabilities
{
    public static readonly IReadOnlyCollection<string> All =
    [
        "sendMessages", "internalNotes", "assign", "transfer", "viewOtherDepartments",
        "supervise", "manageChannels", "manageWhatsApp", "manageCatalogs", "createTask",
        "viewAllReports", "viewHistory", "editReports", "batchClose"
    ];
}

public sealed record ChatDepartmentDto(Guid Id, string Name, bool Active);
public sealed record ChatUserDto(Guid Id, string Name, string Email, IReadOnlyCollection<Guid> DepartmentIds, bool Active);
public sealed record ChatQueueDto(Guid Id, string Name, string Description, Guid DepartmentId, string DepartmentName, string DistributionStrategy, bool Active);
public sealed record ChatChannelDto(Guid Id, string Name, string Type, Guid DepartmentId, string DepartmentName, Guid? DefaultQueueId, Guid? DefaultAssigneeUserId, bool Active, bool AiEnabled, bool AllowTransfer, bool AutoCreateTask, string GreetingMessage, string AwayMessage, bool SendClosingMessage, string ClosingMessage);
public sealed record ChatWhatsAppNumberDto(
    Guid Id, Guid ChannelId, Guid DepartmentId, string DepartmentName, string InternalName,
    string DisplayName, string PhoneNumber, string PhoneNumberId, string WabaId,
    string BusinessManagerId, string ConnectionMode, string MetaAppId, string EmbeddedSignupConfigId,
    string ApiVersion, string Status, string CoexistenceStatus, string CoexistenceError,
    string Quality, DateTimeOffset? LastSyncAt, DateTimeOffset? CoexistenceCompletedAt,
    bool HasAccessToken, bool HasVerifyToken, bool HasAppSecret, bool Active);
public sealed record ChatContactDto(Guid Id, string Name, string Phone, string Email, Guid? CustomerId, string CompanyName, string Notes);
public sealed record ChatMessageDto(Guid Id, Guid ConversationId, string ExternalId, string Direction, string Type, string Body, bool Internal, Guid? SenderUserId, string SenderName, string Status, Guid? ReplyToMessageId, string MediaUrl, string MediaName, string MediaContentType, DateTimeOffset? DeliveredAt, DateTimeOffset? ReadAt, DateTimeOffset CreatedAt);
public sealed record ChatTagDto(Guid Id, string Name, string Color, Guid? DepartmentId, bool Active);
public sealed record ChatQuickReplyDto(Guid Id, string Shortcut, string Title, string Body, Guid? DepartmentId, bool Active);
public sealed record ChatTransferDto(Guid Id, Guid FromDepartmentId, Guid ToDepartmentId, Guid FromChannelId, Guid ToChannelId, string Reason, string ActorName, DateTimeOffset CreatedAt);
public sealed record ChatConversationDto(
    Guid Id, long Number, string Protocol, ChatContactDto Contact, Guid ChannelId, string ChannelName,
    Guid DepartmentId, string DepartmentName, Guid QueueId, string QueueName, Guid? AssigneeUserId,
    string AssigneeName, string Subject, bool IsGroup, string GroupName,
    IReadOnlyCollection<string> GroupParticipants, string Status, string Priority, bool Favorite, int UnreadCount,
    DateTimeOffset CreatedAt, DateTimeOffset LastMessageAt, DateTimeOffset? FirstResponseAt, DateTimeOffset? ClosedAt,
    DateTimeOffset? SlaDueAt, string AiSummary, string Sentiment, long Version,
    int? SatisfactionScore, string SatisfactionComment, DateTimeOffset? SatisfactionRespondedAt,
    IReadOnlyCollection<ChatMessageDto> Messages, IReadOnlyCollection<ChatTagDto> Tags,
    IReadOnlyCollection<ChatTransferDto> Transfers);
public sealed record ChatMetricsDto(int Open, int Waiting, int Unassigned, int ClosedToday, double AverageFirstResponseMinutes, double AverageResolutionMinutes);
public sealed record ChatModuleDto(
    IReadOnlyCollection<ChatConversationDto> Conversations,
    IReadOnlyCollection<ChatDepartmentDto> Departments,
    IReadOnlyCollection<ChatUserDto> Users,
    IReadOnlyCollection<ChatQueueDto> Queues,
    IReadOnlyCollection<ChatChannelDto> Channels,
    IReadOnlyCollection<ChatWhatsAppNumberDto> WhatsAppNumbers,
    IReadOnlyCollection<ChatTagDto> Tags,
    IReadOnlyCollection<ChatQuickReplyDto> QuickReplies,
    ChatMetricsDto Metrics,
    Guid CurrentUserId);

public sealed record CreateChatConversationCommand(string ContactName, string Phone, string Email, Guid? CustomerId,
    string CompanyName, Guid ChannelId, Guid? QueueId, Guid? AssigneeUserId, string Subject,
    string Priority, string? InitialMessage, bool IsGroup, string? GroupName,
    IReadOnlyCollection<string>? GroupParticipants);
public sealed record SendChatMessageCommand(Guid ConversationId, string Body, bool Internal, Guid? ReplyToMessageId);
public sealed record UpdateChatConversationCommand(Guid ConversationId, string? Status, string? Priority, bool? Favorite, bool? MarkRead, string? Subject, int? SatisfactionScore, string? SatisfactionComment, long Version);
public sealed record AssignChatConversationCommand(Guid ConversationId, Guid? AssigneeUserId, Guid? QueueId, long Version);
public sealed record TransferChatConversationCommand(Guid ConversationId, Guid ToDepartmentId, Guid ToChannelId, Guid ToQueueId, Guid? ToAssigneeUserId, string Reason, long Version);
public sealed record BatchCloseChatConversationsCommand(IReadOnlyCollection<Guid> ConversationIds);
public sealed record SaveChatQueueCommand(Guid? Id, string Name, string Description, Guid DepartmentId, string DistributionStrategy, bool Active);
public sealed record SaveChatChannelCommand(Guid? Id, string Name, string Type, Guid DepartmentId, Guid? DefaultQueueId, Guid? DefaultAssigneeUserId, bool Active, bool AiEnabled, bool AllowTransfer, bool AutoCreateTask, string GreetingMessage, string AwayMessage, bool SendClosingMessage, string ClosingMessage);
public sealed record SaveChatWhatsAppNumberCommand(
    Guid? Id, Guid ChannelId, Guid DepartmentId, string InternalName, string DisplayName,
    string PhoneNumber, string PhoneNumberId, string WabaId, string BusinessManagerId,
    string ConnectionMode, string MetaAppId, string EmbeddedSignupConfigId,
    string? AccessToken, string? VerifyToken, string? AppSecret, string ApiVersion, bool Active);
public sealed record CompleteWhatsAppCoexistenceCommand(Guid Id, string AuthorizationCode, string WabaId);
public sealed record SaveChatTagCommand(Guid? Id, string Name, string Color, Guid? DepartmentId, bool Active);
public sealed record SaveChatQuickReplyCommand(Guid? Id, string Shortcut, string Title, string Body, Guid? DepartmentId, bool Active);
public sealed record SetChatTagCommand(Guid ConversationId, Guid TagId, bool Remove);
public sealed record ReceiveWhatsAppWebhookCommand(
    string EventKey, string PhoneNumberId, string ExternalMessageId, string ContactPhone,
    string ContactName, string Direction, string Type, string Body, DateTimeOffset? OccurredAt,
    bool Historical, string PayloadJson);
public sealed record UploadChatAttachmentCommand(Guid ConversationId, string FileName, string ContentType, long SizeBytes, Stream Content, bool Internal);
public sealed record ChatAttachmentDownloadDto(string Url);

public interface IChatService
{
    Task InitializeAsync(CancellationToken cancellationToken = default);
    Task<ChatModuleDto> GetModuleAsync(ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> CreateConversationAsync(CreateChatConversationCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> SendMessageAsync(SendChatMessageCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task UpdateConversationAsync(UpdateChatConversationCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task AssignAsync(AssignChatConversationCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task TransferAsync(TransferChatConversationCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<int> BatchCloseAsync(BatchCloseChatConversationsCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> SaveQueueAsync(SaveChatQueueCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> SaveChannelAsync(SaveChatChannelCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> SaveWhatsAppNumberAsync(SaveChatWhatsAppNumberCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> CompleteWhatsAppCoexistenceAsync(CompleteWhatsAppCoexistenceCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> RetryWhatsAppCoexistenceAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> SaveTagAsync(SaveChatTagCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> SaveQuickReplyAsync(SaveChatQuickReplyCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task SetTagAsync(SetChatTagCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<bool> VerifyWebhookAsync(string verifyToken, CancellationToken cancellationToken = default);
    Task<bool> VerifyWebhookSignatureAsync(string phoneNumberId, string payload, string signature, CancellationToken cancellationToken = default);
    Task ReceiveWebhookAsync(ReceiveWhatsAppWebhookCommand command, CancellationToken cancellationToken = default);
    Task<Guid> UploadAttachmentAsync(UploadChatAttachmentCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<ChatAttachmentDownloadDto> GetAttachmentDownloadAsync(Guid messageId, ActorContext actor, CancellationToken cancellationToken = default);
}
