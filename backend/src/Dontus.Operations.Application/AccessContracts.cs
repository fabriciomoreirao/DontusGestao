namespace Dontus.Operations.Application;

public sealed record AuthenticatedIdentity(string Email, string DisplayName);

public sealed record ScreenDto(string Code, string Label, string Area, int Order);

public sealed record AccessUserDto(
    Guid Id,
    string Email,
    string DisplayName,
    string Department,
    string PhotoDataUrl,
    string JobTitle,
    bool IsCoordinator,
    bool Active,
    DateTimeOffset? BlockedAt,
    IReadOnlyCollection<Guid> GroupIds,
    IReadOnlyCollection<string> GroupNames,
    DateTimeOffset? LastAccessAt,
    DateTimeOffset CreatedAt);

public sealed record GroupPermissionDto(
    string Screen,
    bool CanView,
    bool CanCreate,
    bool CanEdit,
    bool CanApprove,
    bool CanManage,
    IReadOnlyCollection<string>? Capabilities = null);

public sealed record AccessGroupDto(
    Guid Id,
    string Name,
    string Description,
    bool Active,
    bool IsSystem,
    int UserCount,
    IReadOnlyCollection<GroupPermissionDto> Permissions,
    DateTimeOffset CreatedAt);

public sealed record AccessManagementDto(
    IReadOnlyCollection<ScreenDto> Screens,
    IReadOnlyCollection<AccessUserDto> Users,
    IReadOnlyCollection<AccessGroupDto> Groups,
    IReadOnlyCollection<EmployeeDto> Employees,
    IReadOnlyCollection<EmployeeDepartmentDto> Departments,
    IReadOnlyCollection<EmployeeLevelDto> Levels);

public sealed record EmployeeDto(
    Guid Id,
    string DisplayName,
    string Email,
    DateOnly? BirthDate,
    DateOnly? StartedAt,
    Guid? DepartmentId,
    string DepartmentName,
    IReadOnlyCollection<Guid> DepartmentIds,
    IReadOnlyCollection<string> DepartmentNames,
    Guid? LevelId,
    string LevelName,
    string PhotoDataUrl,
    string JobTitle,
    bool IsCoordinator,
    IReadOnlyCollection<Guid> SubordinateUserIds,
    IReadOnlyCollection<Guid> GroupIds,
    IReadOnlyCollection<string> GroupNames,
    bool Active,
    DateTimeOffset? BlockedAt);

public sealed record EmployeeDepartmentDto(Guid Id, string Name, string Description, bool Active);
public sealed record EmployeeLevelDto(Guid Id, string Name, string Description, bool Active);

public sealed record CreateEmployeeCommand(
    string DisplayName,
    string Email,
    DateOnly? BirthDate,
    DateOnly? StartedAt,
    IReadOnlyCollection<Guid>? DepartmentIds,
    Guid LevelId,
    string? PhotoDataUrl,
    string? JobTitle,
    bool IsCoordinator,
    IReadOnlyCollection<Guid>? SubordinateUserIds,
    IReadOnlyCollection<Guid>? GroupIds = null);

public sealed record UpdateEmployeeCommand(
    Guid Id,
    string DisplayName,
    string Email,
    DateOnly? BirthDate,
    DateOnly? StartedAt,
    IReadOnlyCollection<Guid>? DepartmentIds,
    Guid LevelId,
    string? PhotoDataUrl,
    string? JobTitle,
    bool IsCoordinator,
    IReadOnlyCollection<Guid>? SubordinateUserIds,
    bool Active,
    IReadOnlyCollection<Guid>? GroupIds = null);

public sealed record CreateEmployeeResult(Guid Id, string TemporaryPassword);
public sealed record SaveEmployeeDepartmentCommand(Guid? Id, string Name, string? Description, bool Active);
public sealed record SaveEmployeeLevelCommand(Guid? Id, string Name, string? Description, bool Active);

public sealed record CreateAccessUserCommand(
    string Email,
    string DisplayName,
    string Department,
    bool Active,
    IReadOnlyCollection<Guid> GroupIds);

public sealed record UpdateAccessUserCommand(
    Guid Id,
    string Email,
    string DisplayName,
    string Department,
    bool Active,
    IReadOnlyCollection<Guid> GroupIds);

public sealed record CreateAccessGroupCommand(
    string Name,
    string Description,
    bool Active);

public sealed record UpdateAccessGroupCommand(
    Guid Id,
    string Name,
    string Description,
    bool Active,
    IReadOnlyCollection<GroupPermissionDto> Permissions);

public interface IAccessControlService
{
    Task InitializeAsync(CancellationToken cancellationToken = default);
    Task<ActorContext> ResolveActorAsync(
        AuthenticatedIdentity identity,
        CancellationToken cancellationToken = default);
    Task<AccessManagementDto> GetManagementAsync(
        ActorContext actor,
        CancellationToken cancellationToken = default);
    Task<Guid> CreateUserAsync(
        CreateAccessUserCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default);
    Task UpdateUserAsync(
        UpdateAccessUserCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default);
    Task<CreateEmployeeResult> CreateEmployeeAsync(
        CreateEmployeeCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default);
    Task UpdateEmployeeAsync(
        UpdateEmployeeCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default);
    Task DeleteEmployeeAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> SaveEmployeeDepartmentAsync(
        SaveEmployeeDepartmentCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default);
    Task<Guid> SaveEmployeeLevelAsync(
        SaveEmployeeLevelCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default);
    Task DeleteEmployeeDepartmentAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default);
    Task DeleteEmployeeLevelAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> CreateGroupAsync(
        CreateAccessGroupCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default);
    Task UpdateGroupAsync(
        UpdateAccessGroupCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default);
    Task DeleteGroupAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default);
}
