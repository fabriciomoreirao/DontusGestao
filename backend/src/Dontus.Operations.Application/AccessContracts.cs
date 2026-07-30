namespace Dontus.Operations.Application;

public sealed record AuthenticatedIdentity(string Email, string DisplayName);

public sealed record ScreenDto(string Code, string Label, string Area, int Order);

public sealed record AccessUserDto(
    Guid Id,
    string Email,
    string DisplayName,
    string Department,
    bool Active,
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
    IReadOnlyCollection<AccessGroupDto> Groups);

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
    Task<Guid> CreateGroupAsync(
        CreateAccessGroupCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default);
    Task UpdateGroupAsync(
        UpdateAccessGroupCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default);
}
