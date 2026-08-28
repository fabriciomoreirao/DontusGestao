namespace Dontus.Operations.Domain;

public sealed class SuggestionPriority : Entity
{
    public required string Name { get; set; }
    public string Description { get; set; } = "";
    public string Color { get; set; } = "#2563eb";
    public int DisplayOrder { get; set; }
    public bool Active { get; set; } = true;
}

public sealed class SuggestionStatus : Entity
{
    public required string Name { get; set; }
    public string Description { get; set; } = "";
    public required string KanbanColumn { get; set; }
    public string Color { get; set; } = "#2563eb";
    public int DisplayOrder { get; set; }
    public bool IsInitial { get; set; }
    public bool Active { get; set; } = true;
}

public sealed class Suggestion : Entity
{
    public long Number { get; set; }
    public required string Protocol { get; set; }
    public required string Name { get; set; }
    public string Description { get; set; } = "";
    public Guid? CustomerId { get; set; }
    public Guid ResponsibleUserId { get; set; }
    public Guid PriorityId { get; set; }
    public Guid StatusId { get; set; }
    public bool StrategicClient { get; set; }
    public bool CancellationRisk { get; set; }
    public required string CreatedBy { get; set; }
}

public sealed class SuggestionComment : Entity
{
    public Guid SuggestionId { get; set; }
    public Guid AuthorUserId { get; set; }
    public required string Body { get; set; }
}
