namespace Dontus.Operations.Domain;

public sealed class AgendaCalendar : Entity
{
    public required string Name { get; set; }
    public string Description { get; set; } = "";
    public Guid DepartmentId { get; set; }
    public bool Active { get; set; } = true;
}

public sealed class AgendaType : Entity
{
    public required string Name { get; set; }
    public string Description { get; set; } = "";
    public string Color { get; set; } = "#2563eb";
    public bool Active { get; set; } = true;
}

public sealed class AgendaStatus : Entity
{
    public required string Name { get; set; }
    public string Description { get; set; } = "";
    public string Color { get; set; } = "#2563eb";
    public bool Active { get; set; } = true;
}

public sealed class AgendaCommitment : Entity
{
    public Guid AgendaId { get; set; }
    public Guid AgendaTypeId { get; set; }
    public Guid AgendaStatusId { get; set; }
    public Guid ResponsibleUserId { get; set; }
    public required string Title { get; set; }
    public string Description { get; set; } = "";
    public DateTimeOffset StartsAt { get; set; }
    public DateTimeOffset EndsAt { get; set; }
    public required string CreatedBy { get; set; }
}

public sealed class AgendaCommitmentParticipant
{
    public Guid CommitmentId { get; set; }
    public Guid UserId { get; set; }
}
