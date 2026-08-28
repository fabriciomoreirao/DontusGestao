namespace Dontus.Operations.Application;

public sealed record SuggestionPriorityDto(
    Guid Id, string Name, string Description, string Color, int DisplayOrder, bool Active);

public sealed record SuggestionStatusDto(
    Guid Id, string Name, string Description, string KanbanColumn, string Color, int DisplayOrder, bool IsInitial, bool Active);

public sealed record SuggestionCommentDto(
    Guid Id, Guid SuggestionId, Guid AuthorUserId, string AuthorName, string AuthorPhotoDataUrl,
    bool AuthorIsCoordinator, string Body, DateTimeOffset CreatedAt);

public sealed record SuggestionDto(
    Guid Id, long Number, string Protocol, string Name, string Description,
    Guid? CustomerId, string CustomerName, Guid ResponsibleUserId, string ResponsibleName,
    string ResponsibleEmail, string ResponsiblePhotoDataUrl, bool ResponsibleIsCoordinator, Guid PriorityId, string PriorityName,
    string PriorityColor, Guid StatusId, string StatusName, string StatusColor, string KanbanColumn,
    bool StrategicClient, bool CancellationRisk, string CreatedBy, DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt, long Version, IReadOnlyCollection<SuggestionCommentDto> Comments);

public sealed record SuggestionCurrentUserDto(Guid Id, string Name, string Email, string PhotoDataUrl, bool IsCoordinator);

public sealed record SuggestionModuleDto(
    IReadOnlyCollection<SuggestionPriorityDto> Priorities,
    IReadOnlyCollection<SuggestionStatusDto> Statuses,
    IReadOnlyCollection<SuggestionDto> Suggestions,
    SuggestionCurrentUserDto CurrentUser,
    bool CanManageCatalogs);

public sealed record SaveSuggestionPriorityCommand(
    Guid? Id, string Name, string? Description, string? Color, int DisplayOrder, bool Active);

public sealed record SaveSuggestionStatusCommand(
    Guid? Id, string Name, string? Description, string? KanbanColumn, string? Color, int DisplayOrder, bool IsInitial, bool Active);

public sealed record CreateSuggestionCommand(
    string Name, string? Description, Guid? CustomerId, Guid PriorityId,
    bool StrategicClient, bool CancellationRisk);

public sealed record ChangeSuggestionStatusCommand(Guid Id, Guid StatusId, long Version);
public sealed record AddSuggestionCommentCommand(Guid SuggestionId, string Body);
public sealed record CreateSuggestionResult(Guid Id, string Protocol);

public interface ISuggestionService
{
    Task InitializeAsync(CancellationToken cancellationToken = default);
    Task<SuggestionModuleDto> GetModuleAsync(ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> SavePriorityAsync(SaveSuggestionPriorityCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> SaveStatusAsync(SaveSuggestionStatusCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task DeletePriorityAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default);
    Task DeleteStatusAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default);
    Task<CreateSuggestionResult> CreateSuggestionAsync(CreateSuggestionCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task ChangeStatusAsync(ChangeSuggestionStatusCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> AddCommentAsync(AddSuggestionCommentCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task DeleteSuggestionAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default);
}
