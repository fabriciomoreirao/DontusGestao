namespace Dontus.Operations.Application;

public sealed record InternalChatUserDto(
    Guid Id, string Name, string Email, string DepartmentName, string PhotoDataUrl,
    string JobTitle, bool IsCoordinator, bool IsOnline = false, DateTimeOffset? LastSeenAt = null);
public sealed record UserPresenceDto(Guid UserId, bool IsOnline, DateTimeOffset? LastSeenAt);
public sealed record InternalChatReactionDto(string Emoji, int Count, IReadOnlyCollection<Guid> UserIds, IReadOnlyCollection<string> UserNames);
public sealed record InternalChatReplyDto(Guid Id, string SenderName, string Type, string Body, string FileName, DateTimeOffset? DeletedAt);

public sealed record InternalChatMessageDto(
    Guid Id, Guid RoomId, Guid SenderUserId, string SenderName, string SenderPhotoDataUrl,
    bool SenderIsCoordinator,
    string Type, string Body, string FileName, string ContentType, bool HasAttachment, bool IsPinned,
    string ReceiptState, DateTimeOffset CreatedAt, DateTimeOffset? EditedAt = null, DateTimeOffset? DeletedAt = null, long Version = 1)
{
    public InternalChatReplyDto? ReplyTo { get; init; }
    public DateTimeOffset? SeenAt { get; init; }
    public int SeenByCount { get; init; }
    public int RecipientCount { get; init; }
    public IReadOnlyCollection<InternalChatReactionDto> Reactions { get; init; } = [];
}

public sealed record InternalChatRoomDto(
    Guid Id, string Name, string PhotoDataUrl, bool IsGroup, Guid CreatedByUserId, bool CanManage,
    bool IsArchived, int UnreadCount,
    DateTimeOffset LastMessageAt, IReadOnlyCollection<Guid> MemberUserIds,
    IReadOnlyCollection<InternalChatMessageDto> Messages);

public sealed record InternalChatModuleDto(
    Guid CurrentUserId,
    IReadOnlyCollection<InternalChatUserDto> Users,
    IReadOnlyCollection<InternalChatRoomDto> Rooms)
{
    public bool IsPartial { get; init; }
    public DateTimeOffset SnapshotAt { get; init; }
    public IReadOnlyCollection<Guid> RemovedRoomIds { get; init; } = [];
}

public sealed record CreateInternalChatRoomCommand(
    string? Name, string? PhotoDataUrl, bool IsGroup, IReadOnlyCollection<Guid>? MemberUserIds);

public sealed record SendInternalChatMessageCommand(Guid RoomId, string? Body, string? Type, Guid? ReplyToMessageId = null);
public sealed record EditInternalChatMessageCommand(Guid RoomId, Guid MessageId, string Body, long Version);
public sealed record DeleteInternalChatMessageCommand(Guid RoomId, Guid MessageId, long Version);
public sealed record CreateInternalChatPollCommand(Guid RoomId, string? Question, IReadOnlyCollection<string>? Options, Guid? ReplyToMessageId = null);
public sealed record VoteInternalChatPollCommand(Guid RoomId, Guid MessageId, int OptionIndex);
public sealed record SetInternalChatMessagePinnedCommand(Guid RoomId, Guid MessageId, bool Pinned);
public sealed record SetInternalChatMessageReactionCommand(Guid RoomId, Guid MessageId, string Emoji, bool Reacted);
public sealed record SetInternalChatRoomArchivedCommand(Guid RoomId, bool Archived);
public sealed record MarkInternalChatRoomReadCommand(Guid RoomId, Guid? ReadThroughMessageId = null);
public sealed record UpdateInternalChatGroupCommand(Guid RoomId, string? Name, string? PhotoDataUrl);
public sealed record ChangeInternalChatMembersCommand(Guid RoomId, IReadOnlyCollection<Guid>? AddUserIds, Guid? RemoveUserId, bool Leave);

public sealed record UploadInternalChatAttachmentCommand(
    Guid RoomId, string FileName, string ContentType, long SizeBytes, Stream Content, Guid? ReplyToMessageId = null);

public sealed record InternalChatAttachmentDto(string FullPath, string FileName, string ContentType);

public interface IInternalChatService
{
    Task<InternalChatModuleDto> GetModuleAsync(ActorContext actor, CancellationToken cancellationToken = default, int historyDays = 30, Guid? roomId = null);
    Task<Guid> CreateRoomAsync(CreateInternalChatRoomCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> SendMessageAsync(SendInternalChatMessageCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task EditMessageAsync(EditInternalChatMessageCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task DeleteMessageAsync(DeleteInternalChatMessageCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> CreatePollAsync(CreateInternalChatPollCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task VotePollAsync(VoteInternalChatPollCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task SetMessagePinnedAsync(SetInternalChatMessagePinnedCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task SetMessageReactionAsync(SetInternalChatMessageReactionCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task SetArchivedAsync(SetInternalChatRoomArchivedCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task MarkReadAsync(MarkInternalChatRoomReadCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task UpdateGroupAsync(UpdateInternalChatGroupCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task ChangeMembersAsync(ChangeInternalChatMembersCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> UploadAttachmentAsync(UploadInternalChatAttachmentCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<InternalChatAttachmentDto> GetAttachmentAsync(Guid messageId, ActorContext actor, CancellationToken cancellationToken = default);
}
