namespace Dontus.Operations.Domain;

public sealed class LiaForm : Entity
{
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string QuestionsJson { get; set; } = "[]";
    public bool Active { get; set; } = true;
}

public sealed class LiaFormRequest : Entity
{
    public Guid WorkItemId { get; set; }
    public Guid FormId { get; set; }
    public string ProtectedToken { get; set; } = "";
    public string TokenHash { get; set; } = "";
    public string FormName { get; set; } = "";
    public string FormDescription { get; set; } = "";
    public string QuestionsJson { get; set; } = "[]";
    public string AnswersJson { get; set; } = "{}";
    public string CreatedBy { get; set; } = "";
    public DateTimeOffset? SubmittedAt { get; set; }
}
