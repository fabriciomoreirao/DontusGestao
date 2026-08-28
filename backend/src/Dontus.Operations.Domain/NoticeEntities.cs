namespace Dontus.Operations.Domain;

public sealed class CompanyNotice : Entity
{
    public required string Title { get; set; }
    public string Body { get; set; } = "";
    public string Type { get; set; } = "Informativo";
    public string Kind { get; set; } = "Aviso";
    public string Audience { get; set; } = "Todos";
    public Guid? TargetUserId { get; set; }
    public Guid AuthorUserId { get; set; }
    public string ImageDataUrl { get; set; } = "";
    public DateTimeOffset PublishedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? EventAt { get; set; }
    public DateTimeOffset? ExpiresAt { get; set; }
    public bool Active { get; set; } = true;
}

public sealed class CompanyNoticeRead
{
    public Guid NoticeId { get; set; }
    public Guid UserId { get; set; }
    public DateTimeOffset? ViewedAt { get; set; }
    public DateTimeOffset? ReadAt { get; set; }
}
