namespace Dontus.Operations.Application;

public sealed record LiaFormQuestion(string Id, string Text, string Type, bool Required, IReadOnlyList<string>? Options);
public sealed record SaveLiaFormCommand(Guid? Id, string Name, string Description, bool Active, IReadOnlyList<LiaFormQuestion> Questions, long? Version);
public sealed record GenerateLiaFormCommand(Guid WorkItemId, Guid FormId);
public sealed record SubmitLiaFormCommand(Dictionary<string, string> Answers);
public sealed record LiaFormDto(Guid Id, string Name, string Description, bool Active, IReadOnlyList<LiaFormQuestion> Questions, long Version);
public sealed record LiaFormRequestDto(Guid Id, Guid WorkItemId, Guid FormId, string FormName, string FormDescription,
    IReadOnlyList<LiaFormQuestion> Questions, DateTimeOffset CreatedAt, DateTimeOffset? SubmittedAt, Dictionary<string, string> Answers, string Token, string ClientName);
