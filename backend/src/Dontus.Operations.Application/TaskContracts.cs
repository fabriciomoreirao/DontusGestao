namespace Dontus.Operations.Application;

public static class TaskCapabilities
{
    public static readonly IReadOnlyCollection<string> All =
    [
        "cancel", "changeStatus", "changePriority", "changeSla", "forward",
        "assume", "transferAssignee", "viewOthers", "viewOtherDepartments",
        "manageCatalogs", "viewReports", "notifyClient", "overrideCreator"
    ];
}

public sealed record TaskDepartmentDto(
    Guid Id, string Name, string Description, bool Active, bool RequiresAssigneeOnTransfer,
    IReadOnlyCollection<Guid> CoordinatorUserIds);

public sealed record TaskPriorityDto(
    Guid Id, string Name, int SeverityOrder, string Color, int? DefaultDueMinutes, bool Active);

public sealed record TaskStatusDto(
    Guid Id, string Name, Guid? DepartmentId, int DisplayOrder, string KanbanColumn,
    bool IsInitial, bool IsFinal, bool AcceptsNewTasks, bool ManualMovement,
    bool RequiresJustification, bool Active);

public sealed record TaskSlaPolicyDto(
    Guid Id, string Name, Guid DepartmentId, Guid? TaskTypeId, Guid? PriorityId,
    int FirstResponseMinutes, int ServiceStartMinutes, int CompletionMinutes,
    IReadOnlyCollection<int> BusinessDays, string BusinessStart, string BusinessEnd,
    int AlertBeforeMinutes, int EscalationMinutes, bool RecalculateOnTransfer,
    IReadOnlyCollection<Guid> PauseStatusIds, bool Active);

public sealed record TaskTypeDto(
    Guid Id, string Name, string Description, Guid? DefaultPriorityId,
    Guid? DefaultSlaPolicyId, Guid InitialStatusId, IReadOnlyCollection<Guid> DepartmentIds,
    IReadOnlyCollection<Guid> AllowedStatusIds, bool Active);

public sealed record TaskCollaboratorDto(
    Guid Id, string Name, string Email, string Phone, string JobTitle, string PhotoDataUrl, bool Active,
    IReadOnlyCollection<Guid> DepartmentIds, IReadOnlyCollection<Guid> CoordinatorDepartmentIds);

public sealed record TaskCommentDto(
    Guid Id, Guid AuthorUserId, string AuthorName, string Body, bool Internal, DateTimeOffset CreatedAt,
    IReadOnlyCollection<TaskAttachmentDto> Attachments);

public sealed record TaskHistoryDto(
    Guid Id, string EventType, string Summary, string ActorName, string PreviousValue,
    string NewValue, string Source, string Justification, DateTimeOffset CreatedAt);
public sealed record TaskAttachmentDto(Guid Id, Guid? CommentId, string FileName, string Url, DateTimeOffset CreatedAt);

public sealed record TaskNotificationDto(
    Guid Id, Guid TaskId, long TaskNumber, string EventType, string Message,
    bool Read, DateTimeOffset CreatedAt);

public sealed record CorporateTaskDto(
    Guid Id, long Number, string Protocol, string Title, string Description,
    Guid TypeId, string TypeName, Guid PriorityId, string PriorityName, string PriorityColor,
    Guid StatusId, string StatusName, Guid? SlaPolicyId, Guid SourceDepartmentId, Guid CurrentDepartmentId,
    string DepartmentName, Guid CreatorUserId, string CreatorName, Guid? AssigneeUserId,
    string AssigneeName, Guid? CustomerId, string CustomerCode, string CustomerName,
    string ClientWhatsApp, string ClientNotificationState, DateTimeOffset? ClientNotificationRequestedAt,
    DateTimeOffset? ClientNotifiedAt, string ExternalLink, string InternalNotes, DateTimeOffset? DueAt,
    DateTimeOffset? FirstResponseDueAt, DateTimeOffset? ServiceStartDueAt,
    DateTimeOffset? SlaDueAt, string SlaState, DateTimeOffset? CompletedAt,
    bool Cancelled, bool CancellationRequest, long Version, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt,
    bool CanModify,
    IReadOnlyCollection<Guid> ParticipantUserIds, IReadOnlyCollection<TaskCommentDto> Comments,
    IReadOnlyCollection<TaskHistoryDto> History, IReadOnlyCollection<TaskAttachmentDto> Attachments);

public sealed record TaskModuleDto(
    IReadOnlyCollection<CorporateTaskDto> Tasks,
    IReadOnlyCollection<TaskDepartmentDto> Departments,
    IReadOnlyCollection<TaskTypeDto> Types,
    IReadOnlyCollection<TaskPriorityDto> Priorities,
    IReadOnlyCollection<TaskStatusDto> Statuses,
    IReadOnlyCollection<TaskSlaPolicyDto> SlaPolicies,
    IReadOnlyCollection<TaskCollaboratorDto> Collaborators,
    IReadOnlyCollection<TaskNotificationDto> Notifications);

public sealed record CreateCorporateTaskCommand(
    string Title, string Description, Guid TypeId, Guid? PriorityId,
    Guid? StatusId, Guid SourceDepartmentId, Guid CurrentDepartmentId, Guid? AssigneeUserId,
    Guid? CustomerId, string? CustomerCode, string? CustomerName, string ClientWhatsApp, string? ExternalLink,
    string? InternalNotes, DateTimeOffset? DueAt, Guid? SlaPolicyId, bool CancellationRequest,
    IReadOnlyCollection<Guid>? ParticipantUserIds, IReadOnlyCollection<string>? AttachmentLinks);

public sealed record ChangeTaskStatusCommand(
    Guid TaskId, Guid StatusId, string? Justification, long Version);
public sealed record ChangeTaskPriorityCommand(Guid TaskId, Guid PriorityId, long Version);
public sealed record ChangeTaskSlaCommand(Guid TaskId, Guid? SlaPolicyId, long Version);

public sealed record TransferTaskCommand(
    Guid TaskId, Guid DepartmentId, Guid? AssigneeUserId, string Reason,
    bool RecalculateSla, long Version);

public sealed record AssignTaskCommand(Guid TaskId, Guid? AssigneeUserId, long Version);
public sealed record UpdateCorporateTaskCommand(
    Guid TaskId, string Title, string Description, Guid TypeId, Guid? CustomerId,
    string? CustomerCode, string? CustomerName, string ClientWhatsApp,
    bool CancellationRequest, IReadOnlyCollection<Guid>? ParticipantUserIds, long Version);
public sealed record DeleteCorporateTaskCommand(Guid TaskId, long Version);
public sealed record AddTaskCommentCommand(Guid TaskId, string Body, IReadOnlyCollection<Guid>? MentionedUserIds);
public sealed record ClientCommunicationCommand(Guid TaskId, string Action, string Channel, string Message);

public sealed record CreatedCorporateTaskDto(Guid Id, string Protocol);

public sealed record SaveTaskDepartmentCommand(
    Guid? Id, string Name, string Description, bool Active, bool RequiresAssigneeOnTransfer,
    IReadOnlyCollection<Guid> CoordinatorUserIds);

public sealed record SaveTaskPriorityCommand(
    Guid? Id, string Name, int SeverityOrder, string Color, int? DefaultDueMinutes, bool Active);

public sealed record SaveTaskStatusCommand(
    Guid? Id, string Name, Guid? DepartmentId, int DisplayOrder, string KanbanColumn,
    bool IsInitial, bool IsFinal, bool AcceptsNewTasks, bool ManualMovement,
    bool RequiresJustification, bool Active);

public sealed record SaveTaskSlaPolicyCommand(
    Guid? Id, string Name, Guid DepartmentId, Guid? TaskTypeId, Guid? PriorityId,
    int FirstResponseMinutes, int ServiceStartMinutes, int CompletionMinutes,
    IReadOnlyCollection<int> BusinessDays, string BusinessStart, string BusinessEnd,
    int AlertBeforeMinutes, int EscalationMinutes, bool RecalculateOnTransfer,
    IReadOnlyCollection<Guid> PauseStatusIds, bool Active);

public sealed record SaveTaskTypeCommand(
    Guid? Id, string Name, string Description, Guid? DefaultPriorityId,
    Guid? DefaultSlaPolicyId, Guid InitialStatusId, IReadOnlyCollection<Guid> DepartmentIds,
    IReadOnlyCollection<Guid> AllowedStatusIds, bool Active);

public sealed record SaveTaskCollaboratorCommand(
    Guid UserId, string Phone, string JobTitle, bool Active,
    IReadOnlyCollection<Guid> DepartmentIds, IReadOnlyCollection<Guid> CoordinatorDepartmentIds);

public sealed record CreateTaskCollaboratorCommand(
    string DisplayName, string Email, string Phone, string JobTitle, bool Active,
    IReadOnlyCollection<Guid> DepartmentIds, IReadOnlyCollection<Guid> CoordinatorDepartmentIds);

public sealed record UploadTaskAttachmentCommand(
    Guid TaskId, Guid? CommentId, string FileName, string ContentType, long SizeBytes, Stream Content);

public sealed record TaskAttachmentDownloadDto(string Url);

public interface ITaskFileStorage
{
    Task StoreAsync(
        string key, Stream content, string contentType, long sizeBytes,
        CancellationToken cancellationToken = default);
    Task DeleteAsync(string key, CancellationToken cancellationToken = default);
    string CreateDownloadUrl(string key, string fileName, string contentType);
}

public interface ITaskService
{
    Task InitializeAsync(CancellationToken cancellationToken = default);
    Task<TaskModuleDto> GetModuleAsync(ActorContext actor, CancellationToken cancellationToken = default);
    Task<CreatedCorporateTaskDto> CreateAsync(CreateCorporateTaskCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task ChangeStatusAsync(ChangeTaskStatusCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task ChangePriorityAsync(ChangeTaskPriorityCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task ChangeSlaAsync(ChangeTaskSlaCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task TransferAsync(TransferTaskCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task AssignAsync(AssignTaskCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task UpdateAsync(UpdateCorporateTaskCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task DeleteAsync(DeleteCorporateTaskCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> AddCommentAsync(AddTaskCommentCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task CommunicateWithClientAsync(ClientCommunicationCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> SaveDepartmentAsync(SaveTaskDepartmentCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> SavePriorityAsync(SaveTaskPriorityCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> SaveStatusAsync(SaveTaskStatusCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> SaveSlaPolicyAsync(SaveTaskSlaPolicyCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> SaveTypeAsync(SaveTaskTypeCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> CreateCollaboratorAsync(CreateTaskCollaboratorCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task SaveCollaboratorAsync(SaveTaskCollaboratorCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task DeleteCatalogEntryAsync(string catalog, Guid id, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> UploadAttachmentAsync(UploadTaskAttachmentCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<TaskAttachmentDownloadDto> GetAttachmentDownloadAsync(Guid attachmentId, ActorContext actor, CancellationToken cancellationToken = default);
    Task DeleteAttachmentAsync(Guid attachmentId, ActorContext actor, CancellationToken cancellationToken = default);
    Task MarkNotificationReadAsync(Guid notificationId, ActorContext actor, CancellationToken cancellationToken = default);
}
