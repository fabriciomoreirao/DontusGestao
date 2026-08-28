namespace Dontus.Operations.Application;

public sealed record AgendaCalendarDto(Guid Id, string Name, string Description, Guid DepartmentId, string DepartmentName, bool Active);
public sealed record AgendaDepartmentDto(Guid Id, string Name, bool Active);
public sealed record AgendaTypeDto(Guid Id, string Name, string Description, string Color, bool Active);
public sealed record AgendaStatusDto(Guid Id, string Name, string Description, string Color, bool Active);
public sealed record AgendaCollaboratorDto(
    Guid Id, string Name, string Email, Guid DepartmentId, string DepartmentName,
    DateOnly? BirthDate, DateOnly? StartedAt);
public sealed record AgendaCelebrantDto(Guid Id, string Name, DateOnly? BirthDate, DateOnly? StartedAt);
public sealed record AgendaCommitmentDto(
    Guid Id, Guid AgendaId, Guid AgendaTypeId, string Title, string Description,
    DateTimeOffset StartsAt, DateTimeOffset EndsAt, Guid ResponsibleUserId,
    string ResponsibleName, string TypeName, Guid AgendaStatusId, string StatusName, string StatusColor,
    string CreatedBy, IReadOnlyCollection<Guid> ParticipantUserIds);

public sealed record AgendaModuleDto(
    IReadOnlyCollection<AgendaCalendarDto> Calendars,
    IReadOnlyCollection<AgendaDepartmentDto> Departments,
    IReadOnlyCollection<AgendaTypeDto> Types,
    IReadOnlyCollection<AgendaStatusDto> Statuses,
    IReadOnlyCollection<AgendaCollaboratorDto> Collaborators,
    IReadOnlyCollection<AgendaCelebrantDto> Celebrants,
    IReadOnlyCollection<AgendaCommitmentDto> Commitments,
    bool CanManage);

public sealed record SaveAgendaCalendarCommand(Guid? Id, string Name, string? Description, Guid DepartmentId, bool Active);
public sealed record SaveAgendaTypeCommand(Guid? Id, string Name, string? Description, string? Color, bool Active);
public sealed record SaveAgendaStatusCommand(Guid? Id, string Name, string? Description, string? Color, bool Active);
public sealed record CreateAgendaCommitmentCommand(
    Guid AgendaId, Guid AgendaTypeId, Guid AgendaStatusId, Guid ResponsibleUserId, string Title, string? Description,
    DateTimeOffset StartsAt, DateTimeOffset EndsAt, IReadOnlyCollection<Guid>? ParticipantUserIds,
    string? Recurrence);
public sealed record UpdateAgendaCommitmentCommand(
    Guid Id, Guid AgendaId, Guid AgendaTypeId, Guid AgendaStatusId, Guid ResponsibleUserId,
    string Title, string? Description, DateTimeOffset StartsAt, DateTimeOffset EndsAt,
    IReadOnlyCollection<Guid>? ParticipantUserIds);
public sealed record ChangeAgendaCommitmentStatusCommand(Guid Id, Guid AgendaStatusId);

public interface IAgendaService
{
    Task<AgendaModuleDto> GetModuleAsync(ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> SaveCalendarAsync(SaveAgendaCalendarCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> SaveTypeAsync(SaveAgendaTypeCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> SaveStatusAsync(SaveAgendaStatusCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task DeleteCalendarAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default);
    Task DeleteTypeAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default);
    Task DeleteStatusAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<Guid>> CreateCommitmentAsync(CreateAgendaCommitmentCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task UpdateCommitmentAsync(UpdateAgendaCommitmentCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task ChangeCommitmentStatusAsync(ChangeAgendaCommitmentStatusCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task DeleteCommitmentAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default);
}
