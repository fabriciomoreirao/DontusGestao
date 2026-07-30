namespace Dontus.Operations.Domain;

public sealed class TaskDepartment : Entity
{
    public required string Name { get; set; }
    public string Description { get; set; } = "";
    public bool Active { get; set; } = true;
    public bool RequiresAssigneeOnTransfer { get; set; }
}

public sealed class UserDepartment
{
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;
    public Guid DepartmentId { get; set; }
    public TaskDepartment Department { get; set; } = null!;
    public bool IsPrimary { get; set; }
    public bool IsCoordinator { get; set; }
}

public sealed class TaskPriority : Entity
{
    public required string Name { get; set; }
    public int SeverityOrder { get; set; }
    public string Color { get; set; } = "#64748b";
    public int? DefaultDueMinutes { get; set; }
    public bool Active { get; set; } = true;
}

public sealed class TaskStatus : Entity
{
    public required string Name { get; set; }
    public Guid? DepartmentId { get; set; }
    public int DisplayOrder { get; set; }
    public string KanbanColumn { get; set; } = "";
    public bool IsInitial { get; set; }
    public bool IsFinal { get; set; }
    public bool AcceptsNewTasks { get; set; } = true;
    public bool ManualMovement { get; set; } = true;
    public bool RequiresJustification { get; set; }
    public bool Active { get; set; } = true;
}

public sealed class TaskSlaPolicy : Entity
{
    public required string Name { get; set; }
    public Guid DepartmentId { get; set; }
    public Guid? TaskTypeId { get; set; }
    public Guid? PriorityId { get; set; }
    public int FirstResponseMinutes { get; set; }
    public int ServiceStartMinutes { get; set; }
    public int CompletionMinutes { get; set; }
    public string BusinessDaysJson { get; set; } = "[1,2,3,4,5]";
    public TimeOnly BusinessStart { get; set; } = new(8, 0);
    public TimeOnly BusinessEnd { get; set; } = new(18, 0);
    public int AlertBeforeMinutes { get; set; } = 60;
    public int EscalationMinutes { get; set; }
    public bool RecalculateOnTransfer { get; set; } = true;
    public bool Active { get; set; } = true;
}

public sealed class TaskSlaPauseStatus
{
    public Guid SlaPolicyId { get; set; }
    public Guid StatusId { get; set; }
}

public sealed class TaskType : Entity
{
    public required string Name { get; set; }
    public string Description { get; set; } = "";
    public Guid? DefaultPriorityId { get; set; }
    public Guid? DefaultSlaPolicyId { get; set; }
    public Guid InitialStatusId { get; set; }
    public bool Active { get; set; } = true;
}

public sealed class TaskTypeDepartment
{
    public Guid TaskTypeId { get; set; }
    public Guid DepartmentId { get; set; }
}

public sealed class TaskTypeStatus
{
    public Guid TaskTypeId { get; set; }
    public Guid StatusId { get; set; }
}

public sealed class CorporateTask : Entity
{
    public long Number { get; set; }
    public string Protocol { get; set; } = "";
    public required string Title { get; set; }
    public string Description { get; set; } = "";
    public Guid TypeId { get; set; }
    public Guid PriorityId { get; set; }
    public Guid StatusId { get; set; }
    public Guid? SlaPolicyId { get; set; }
    public Guid SourceDepartmentId { get; set; }
    public Guid CurrentDepartmentId { get; set; }
    public Guid CreatorUserId { get; set; }
    public Guid? AssigneeUserId { get; set; }
    public Guid? RequesterUserId { get; set; }
    public Guid? CustomerId { get; set; }
    public string CustomerCode { get; set; } = "";
    public string CustomerName { get; set; } = "";
    public string ExternalLink { get; set; } = "";
    public string InternalNotes { get; set; } = "";
    public DateTimeOffset? DueAt { get; set; }
    public DateTimeOffset? FirstResponseDueAt { get; set; }
    public DateTimeOffset? ServiceStartDueAt { get; set; }
    public DateTimeOffset? SlaDueAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public DateTimeOffset? SlaPausedAt { get; set; }
    public int AccumulatedPauseMinutes { get; set; }
    public bool Cancelled { get; set; }
}

public sealed class TaskParticipant
{
    public Guid TaskId { get; set; }
    public Guid UserId { get; set; }
    public string Role { get; set; } = "Observador";
}

public sealed class TaskComment : Entity
{
    public Guid TaskId { get; set; }
    public Guid AuthorUserId { get; set; }
    public required string Body { get; set; }
    public string MentionedUserIdsJson { get; set; } = "[]";
    public bool Internal { get; set; } = true;
}

public sealed class TaskAttachment : Entity
{
    public Guid TaskId { get; set; }
    public Guid UploadedByUserId { get; set; }
    public required string FileName { get; set; }
    public string ContentType { get; set; } = "application/octet-stream";
    public long SizeBytes { get; set; }
    public required string StorageKey { get; set; }
}

public sealed class TaskHistory
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TaskId { get; set; }
    public Guid ActorUserId { get; set; }
    public required string EventType { get; set; }
    public required string Summary { get; set; }
    public string PreviousValueJson { get; set; } = "{}";
    public string NewValueJson { get; set; } = "{}";
    public string Source { get; set; } = "Web";
    public string Justification { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class TaskTransfer
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TaskId { get; set; }
    public Guid FromDepartmentId { get; set; }
    public Guid ToDepartmentId { get; set; }
    public Guid? PreviousAssigneeUserId { get; set; }
    public Guid? NewAssigneeUserId { get; set; }
    public Guid ActorUserId { get; set; }
    public required string Reason { get; set; }
    public bool SlaRecalculated { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class TaskNotification
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TaskId { get; set; }
    public Guid RecipientUserId { get; set; }
    public Guid ActorUserId { get; set; }
    public required string EventType { get; set; }
    public required string Message { get; set; }
    public bool Read { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ReadAt { get; set; }
}

public sealed class TaskClientCommunication
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TaskId { get; set; }
    public Guid ActorUserId { get; set; }
    public required string Action { get; set; }
    public required string Channel { get; set; }
    public required string Message { get; set; }
    public required string Result { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
