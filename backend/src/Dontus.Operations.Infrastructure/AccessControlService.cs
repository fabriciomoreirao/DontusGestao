using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Dontus.Operations.Infrastructure;

public sealed class AccessControlService(
    OperationsDbContext db,
    IConfiguration configuration) : IAccessControlService
{
    private const string AdministratorsGroup = "Administradores";

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        var adminGroup = await db.AccessGroups
            .Include(group => group.Permissions)
            .SingleOrDefaultAsync(group => group.Name == AdministratorsGroup, cancellationToken);

        if (adminGroup is null)
        {
            adminGroup = new AccessGroup
            {
                Name = AdministratorsGroup,
                Description = "Acesso total para administração técnica e segurança.",
                IsSystem = true,
                CreatedBy = "system@dontus.local",
            };
            db.AccessGroups.Add(adminGroup);
        }

        foreach (var screen in ScreenCatalog.All)
        {
            var existing = adminGroup.Permissions.FirstOrDefault(permission => permission.Screen == screen.Code);
            if (existing is not null)
            {
                if (screen.Code == "tasks")
                    existing.CapabilitiesJson = JsonSerializer.Serialize(TaskCapabilities.All);
                if (screen.Code == "chat")
                    existing.CapabilitiesJson = JsonSerializer.Serialize(ChatCapabilities.All);
                continue;
            }

            adminGroup.Permissions.Add(new GroupPermission
            {
                GroupId = adminGroup.Id,
                Screen = screen.Code,
                CanView = true,
                CanCreate = true,
                CanEdit = true,
                CanApprove = true,
                CanManage = true,
                CapabilitiesJson = screen.Code switch
                {
                    "tasks" => JsonSerializer.Serialize(TaskCapabilities.All),
                    "chat" => JsonSerializer.Serialize(ChatCapabilities.All),
                    _ => "[]",
                },
            });
        }

        var bootstrapEmail = NormalizeEmail(
            configuration["AccessControl:BootstrapAdminEmail"] ?? "gestor@dontus.local");
        var bootstrapName = configuration["AccessControl:BootstrapAdminName"] ?? "Gestor Dontus";
        var bootstrapUser = await db.Users
            .Include(user => user.Groups)
            .SingleOrDefaultAsync(user => user.Email == bootstrapEmail, cancellationToken);

        if (bootstrapUser is null)
        {
            bootstrapUser = new AppUser
            {
                Email = bootstrapEmail,
                DisplayName = bootstrapName,
                Department = "Gestão",
                CreatedBy = "system@dontus.local",
            };
            db.Users.Add(bootstrapUser);
        }

        if (bootstrapUser.Groups.All(membership => membership.GroupId != adminGroup.Id))
        {
            bootstrapUser.Groups.Add(new UserAccessGroup
            {
                UserId = bootstrapUser.Id,
                GroupId = adminGroup.Id,
            });
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<ActorContext> ResolveActorAsync(
        AuthenticatedIdentity identity,
        CancellationToken cancellationToken = default)
    {
        var email = NormalizeEmail(identity.Email);
        var user = await db.Users.AsNoTracking()
            .SingleOrDefaultAsync(entry => entry.Email == email, cancellationToken)
            ?? throw new DomainException(
                "Seu usuário ainda não foi cadastrado. Solicite acesso a um administrador.",
                403);

        if (!user.Active)
            throw new DomainException("Seu usuário está inativo. Solicite a reativação a um administrador.", 403);

        var groups = await db.UserAccessGroups.AsNoTracking()
            .Where(membership => membership.UserId == user.Id && membership.Group.Active)
            .Select(membership => new
            {
                membership.Group.Name,
                Permissions = membership.Group.Permissions,
            })
            .ToListAsync(cancellationToken);

        var permissions = groups
            .SelectMany(group => group.Permissions)
            .GroupBy(permission => permission.Screen, StringComparer.OrdinalIgnoreCase)
            .Select(group => new EffectivePermission(
                group.Key,
                group.Any(permission => permission.CanView),
                group.Any(permission => permission.CanCreate),
                group.Any(permission => permission.CanEdit),
                group.Any(permission => permission.CanApprove),
                group.Any(permission => permission.CanManage),
                group.SelectMany(permission => DeserializeCapabilities(permission.CapabilitiesJson))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .Order()
                    .ToArray()))
            .OrderBy(permission => permission.Screen)
            .ToArray();

        return new ActorContext(
            user.Email,
            string.IsNullOrWhiteSpace(user.DisplayName) ? identity.DisplayName : user.DisplayName,
            groups.Count == 0 ? "Sem grupo" : string.Join(", ", groups.Select(group => group.Name).Order()),
            user.Department,
            permissions);
    }

    public async Task<AccessManagementDto> GetManagementAsync(
        ActorContext actor,
        CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("admin", "manage");

        var users = await db.Users.AsNoTracking()
            .Include(user => user.Groups)
            .ThenInclude(membership => membership.Group)
            .OrderBy(user => user.DisplayName)
            .ToListAsync(cancellationToken);
        var groups = await db.AccessGroups.AsNoTracking()
            .Include(group => group.Users)
            .Include(group => group.Permissions)
            .OrderBy(group => group.Name)
            .ToListAsync(cancellationToken);

        return new AccessManagementDto(
            ScreenCatalog.All
                .OrderBy(screen => screen.Order)
                .Select(screen => new ScreenDto(screen.Code, screen.Label, screen.Area, screen.Order))
                .ToArray(),
            users.Select(user => new AccessUserDto(
                user.Id,
                user.Email,
                user.DisplayName,
                user.Department,
                user.Active,
                user.Groups.Select(membership => membership.GroupId).ToArray(),
                user.Groups.Select(membership => membership.Group.Name).Order().ToArray(),
                user.LastAccessAt,
                user.CreatedAt)).ToArray(),
            groups.Select(group => new AccessGroupDto(
                group.Id,
                group.Name,
                group.Description,
                group.Active,
                group.IsSystem,
                group.Users.Count,
                group.Permissions
                    .OrderBy(permission => ScreenOrder(permission.Screen))
                    .Select(ToDto)
                    .ToArray(),
                group.CreatedAt)).ToArray());
    }

    public async Task<Guid> CreateUserAsync(
        CreateAccessUserCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("admin", "manage");
        var email = NormalizeEmail(command.Email);
        ValidateUser(command.DisplayName, email);
        if (await db.Users.AnyAsync(user => user.Email == email, cancellationToken))
            throw new DomainException("Já existe um usuário cadastrado com este e-mail.", 409);

        var groupIds = await ValidateGroupsAsync(command.GroupIds, cancellationToken);
        var user = new AppUser
        {
            Email = email,
            DisplayName = command.DisplayName.Trim(),
            Department = CleanDepartment(command.Department),
            Active = command.Active,
            CreatedBy = actor.Email,
        };
        foreach (var groupId in groupIds)
            user.Groups.Add(new UserAccessGroup { UserId = user.Id, GroupId = groupId });

        db.Users.Add(user);
        AddAudit(actor, "Create", "user", user.Id.ToString(), new { user.Email, Groups = groupIds });
        await db.SaveChangesAsync(cancellationToken);
        return user.Id;
    }

    public async Task UpdateUserAsync(
        UpdateAccessUserCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("admin", "manage");
        var user = await db.Users
            .Include(entry => entry.Groups)
            .SingleOrDefaultAsync(entry => entry.Id == command.Id, cancellationToken)
            ?? throw new DomainException("Usuário não encontrado.", 404);
        var email = NormalizeEmail(command.Email);
        ValidateUser(command.DisplayName, email);
        if (await db.Users.AnyAsync(entry => entry.Email == email && entry.Id != user.Id, cancellationToken))
            throw new DomainException("Já existe outro usuário cadastrado com este e-mail.", 409);

        var groupIds = await ValidateGroupsAsync(command.GroupIds, cancellationToken);
        await EnsureAdministrationRemainsAsync(user, command.Active, groupIds, cancellationToken);

        user.Email = email;
        user.DisplayName = command.DisplayName.Trim();
        user.Department = CleanDepartment(command.Department);
        user.Active = command.Active;
        user.UpdatedAt = DateTimeOffset.UtcNow;
        user.Version++;
        db.UserAccessGroups.RemoveRange(user.Groups);
        user.Groups = groupIds
            .Select(groupId => new UserAccessGroup { UserId = user.Id, GroupId = groupId })
            .ToList();

        AddAudit(actor, "Update", "user", user.Id.ToString(), new { user.Email, user.Active, Groups = groupIds });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<Guid> CreateGroupAsync(
        CreateAccessGroupCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("admin", "manage");
        var name = CleanGroupName(command.Name);
        if (await db.AccessGroups.AnyAsync(group => group.Name == name, cancellationToken))
            throw new DomainException("Já existe um grupo com este nome.", 409);

        var group = new AccessGroup
        {
            Name = name,
            Description = command.Description?.Trim() ?? "",
            Active = command.Active,
            CreatedBy = actor.Email,
        };
        db.AccessGroups.Add(group);
        foreach (var screen in ScreenCatalog.All)
            group.Permissions.Add(new GroupPermission { GroupId = group.Id, Screen = screen.Code });

        AddAudit(actor, "Create", "access_group", group.Id.ToString(), new { group.Name });
        await db.SaveChangesAsync(cancellationToken);
        return group.Id;
    }

    public async Task UpdateGroupAsync(
        UpdateAccessGroupCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("admin", "manage");
        var group = await db.AccessGroups
            .Include(entry => entry.Permissions)
            .SingleOrDefaultAsync(entry => entry.Id == command.Id, cancellationToken)
            ?? throw new DomainException("Grupo não encontrado.", 404);
        var name = CleanGroupName(command.Name);
        if (await db.AccessGroups.AnyAsync(entry => entry.Name == name && entry.Id != group.Id, cancellationToken))
            throw new DomainException("Já existe outro grupo com este nome.", 409);

        var permissions = NormalizePermissions(command.Permissions);
        if (group.IsSystem &&
            (!command.Active || !permissions.Any(permission =>
                permission.Screen == "admin" && permission.CanManage)))
            throw new DomainException(
                "O grupo de administradores deve permanecer ativo e com permissão para administrar acessos.",
                409);

        group.Name = name;
        group.Description = command.Description?.Trim() ?? "";
        group.Active = group.IsSystem || command.Active;
        group.UpdatedAt = DateTimeOffset.UtcNow;
        group.Version++;
        db.GroupPermissions.RemoveRange(group.Permissions);
        group.Permissions = permissions
            .Select(permission => new GroupPermission
            {
                GroupId = group.Id,
                Screen = permission.Screen,
                CanView = permission.CanView,
                CanCreate = permission.CanCreate,
                CanEdit = permission.CanEdit,
                CanApprove = permission.CanApprove,
                CanManage = permission.CanManage,
                CapabilitiesJson = JsonSerializer.Serialize(
                    permission.Capabilities?.Distinct(StringComparer.OrdinalIgnoreCase).Order().ToArray() ?? []),
            })
            .ToList();

        AddAudit(actor, "UpdatePermissions", "access_group", group.Id.ToString(), new { group.Name });
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task<Guid[]> ValidateGroupsAsync(
        IReadOnlyCollection<Guid> requestedIds,
        CancellationToken cancellationToken)
    {
        var ids = requestedIds.Distinct().ToArray();
        var existing = await db.AccessGroups
            .Where(group => ids.Contains(group.Id) && group.Active)
            .Select(group => group.Id)
            .ToArrayAsync(cancellationToken);
        if (existing.Length != ids.Length)
            throw new DomainException("Um ou mais grupos selecionados não existem ou estão inativos.");
        return existing;
    }

    private async Task EnsureAdministrationRemainsAsync(
        AppUser user,
        bool nextActive,
        IReadOnlyCollection<Guid> nextGroupIds,
        CancellationToken cancellationToken)
    {
        var currentlyAdmin = await db.UserAccessGroups.AnyAsync(
            membership => membership.UserId == user.Id &&
                          membership.Group.Active &&
                          membership.Group.Permissions.Any(permission =>
                              permission.Screen == "admin" && permission.CanManage),
            cancellationToken);
        var remainsAdmin = nextActive && await db.GroupPermissions.AnyAsync(
            permission => nextGroupIds.Contains(permission.GroupId) &&
                          permission.Group.Active &&
                          permission.Screen == "admin" &&
                          permission.CanManage,
            cancellationToken);
        if (!currentlyAdmin || remainsAdmin)
            return;

        var anotherAdministrator = await db.Users.AnyAsync(
            candidate => candidate.Id != user.Id &&
                         candidate.Active &&
                         candidate.Groups.Any(membership =>
                             membership.Group.Active &&
                             membership.Group.Permissions.Any(permission =>
                                 permission.Screen == "admin" && permission.CanManage)),
            cancellationToken);
        if (!anotherAdministrator)
            throw new DomainException("Mantenha pelo menos um usuário ativo com permissão administrativa.", 409);
    }

    private static GroupPermissionDto[] NormalizePermissions(
        IReadOnlyCollection<GroupPermissionDto> requested)
    {
        var byScreen = requested
            .Where(permission => ScreenCatalog.Exists(permission.Screen))
            .GroupBy(permission => permission.Screen, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.Last(), StringComparer.OrdinalIgnoreCase);

        return ScreenCatalog.All.Select(screen =>
        {
            if (!byScreen.TryGetValue(screen.Code, out var permission))
                return new GroupPermissionDto(screen.Code, false, false, false, false, false, []);
            var view = permission.CanView || permission.CanCreate || permission.CanEdit ||
                       permission.CanApprove || permission.CanManage;
            return permission with
            {
                Screen = screen.Code,
                CanView = view,
                Capabilities = permission.Capabilities?
                    .Where(capability => !string.IsNullOrWhiteSpace(capability))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .Order()
                    .ToArray() ?? [],
            };
        }).ToArray();
    }

    private static GroupPermissionDto ToDto(GroupPermission permission) =>
        new(
            permission.Screen,
            permission.CanView,
            permission.CanCreate,
            permission.CanEdit,
            permission.CanApprove,
            permission.CanManage,
            DeserializeCapabilities(permission.CapabilitiesJson));

    private static string[] DeserializeCapabilities(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<string[]>(json) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static int ScreenOrder(string code) =>
        ScreenCatalog.All.FirstOrDefault(screen => screen.Code == code)?.Order ?? int.MaxValue;

    private static void ValidateUser(string displayName, string email)
    {
        if (string.IsNullOrWhiteSpace(displayName))
            throw new DomainException("Informe o nome do usuário.");
        if (string.IsNullOrWhiteSpace(email) || !email.Contains('@'))
            throw new DomainException("Informe um e-mail válido para o usuário.");
    }

    private static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();

    private static string CleanDepartment(string department) =>
        string.IsNullOrWhiteSpace(department) ? "Não informado" : department.Trim();

    private static string CleanGroupName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new DomainException("Informe o nome do grupo.");
        return name.Trim();
    }

    private void AddAudit(
        ActorContext actor,
        string action,
        string resource,
        string resourceId,
        object details) =>
        db.AuditEvents.Add(new AuditEvent
        {
            ActorEmail = actor.Email,
            Action = action,
            Resource = resource,
            ResourceId = resourceId,
            Module = "admin",
            DetailsJson = JsonSerializer.Serialize(details),
        });
}
