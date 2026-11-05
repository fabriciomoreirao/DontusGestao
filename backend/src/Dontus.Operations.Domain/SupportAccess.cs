namespace Dontus.Operations.Domain;

public sealed class SupportAccessReason : Entity
{
    public required string Name { get; set; }
    public bool Active { get; set; } = true;
    public Guid? DepartmentId { get; set; }
    public TaskDepartment? Department { get; set; }
}

public sealed class SupportAccessLog
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateTimeOffset AccessedAt { get; set; } = DateTimeOffset.UtcNow;
    public required string ActorEmail { get; set; }
    public required string ActorName { get; set; }
    public required string Identification { get; set; }
    public required string CustomerName { get; set; }
    public long TargetUserId { get; set; }
    public required string TargetUserName { get; set; }
    public Guid ReasonId { get; set; }
    public required string ReasonName { get; set; }
    public required string Justification { get; set; }
}
