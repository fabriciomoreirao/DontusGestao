namespace Dontus.Operations.Application;

public sealed record InternalChatUserDto(
    Guid Id, string Name, string Email, string DepartmentName, string PhotoDataUrl,
    string JobTitle, bool IsCoordinator);

public sealed record InternalChatMessageDto(
    Guid Id, Guid RoomId, Guid SenderUserId, string SenderName, string SenderPhotoDataUrl,
    bool SenderIsCoordinator,
    string Type, string Body, string FileName, string ContentType, bool HasAttachment, bool IsPinned,
    DateTimeOffset CreatedAt);

public sealed record InternalChatRoomDto(
    Guid Id, string Name, string PhotoDataUrl, bool IsGroup, Guid CreatedByUserId, bool CanManage,
    bool IsArchived, int UnreadCount,
    DateTimeOffset LastMessageAt, IReadOnlyCollection<Guid> MemberUserIds,
    IReadOnlyCollection<InternalChatMessageDto> Messages);

public sealed record InternalChatModuleDto(
    Guid CurrentUserId,
    IReadOnlyCollection<InternalChatUserDto> Users,
    IReadOnlyCollection<InternalChatRoomDto> Rooms);

public sealed record CreateInternalChatRoomCommand(
    string? Name, string? PhotoDataUrl, bool IsGroup, IReadOnlyCollection<Guid>? MemberUserIds);

public sealed record SendInternalChatMessageCommand(Guid RoomId, string? Body, string? Type);
public sealed record CreateInternalChatPollCommand(Guid RoomId, string? Question, IReadOnlyCollection<string>? Options);
public sealed record VoteInternalChatPollCommand(Guid RoomId, Guid MessageId, int OptionIndex);
public sealed record SetInternalChatMessagePinnedCommand(Guid RoomId, Guid MessageId, bool Pinned);
public sealed record SetInternalChatRoomArchivedCommand(Guid RoomId, bool Archived);
public sealed record MarkInternalChatRoomReadCommand(Guid RoomId);
public sealed record UpdateInternalChatGroupCommand(Guid RoomId, string? Name, string? PhotoDataUrl);

public sealed record UploadInternalChatAttachmentCommand(
    Guid RoomId, string FileName, string ContentType, long SizeBytes, Stream Content);

public sealed record InternalChatAttachmentDto(string FullPath, string FileName, string ContentType);

public interface IInternalChatService
{
    Task<InternalChatModuleDto> GetModuleAsync(ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> CreateRoomAsync(CreateInternalChatRoomCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> SendMessageAsync(SendInternalChatMessageCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> CreatePollAsync(CreateInternalChatPollCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task VotePollAsync(VoteInternalChatPollCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task SetMessagePinnedAsync(SetInternalChatMessagePinnedCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task SetArchivedAsync(SetInternalChatRoomArchivedCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task MarkReadAsync(MarkInternalChatRoomReadCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task UpdateGroupAsync(UpdateInternalChatGroupCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> UploadAttachmentAsync(UploadInternalChatAttachmentCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<InternalChatAttachmentDto> GetAttachmentAsync(Guid messageId, ActorContext actor, CancellationToken cancellationToken = default);
}
