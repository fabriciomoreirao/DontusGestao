namespace Dontus.Operations.Domain;

public sealed class InternalChatRoom : Entity
{
    public string Name { get; set; } = "";
    public string PhotoDataUrl { get; set; } = "";
    public bool IsGroup { get; set; }
    public Guid CreatedByUserId { get; set; }
    public DateTimeOffset LastMessageAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class InternalChatRoomMember
{
    public Guid RoomId { get; set; }
    public Guid UserId { get; set; }
    public bool IsAdmin { get; set; }
    public DateTimeOffset JoinedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastReadAt { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }
}

public sealed class InternalChatMessage : Entity
{
    public Guid RoomId { get; set; }
    public Guid SenderUserId { get; set; }
    public string Type { get; set; } = "text";
    public string Body { get; set; } = "";
    public string FileName { get; set; } = "";
    public string ContentType { get; set; } = "";
    public string StorageKey { get; set; } = "";
}
