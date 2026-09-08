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
    private const string CollaboratorsGroup = "Colaboradores";

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

        var collaboratorsGroup = await db.AccessGroups
            .Include(group => group.Permissions)
            .SingleOrDefaultAsync(group => group.Name == CollaboratorsGroup, cancellationToken);
        if (collaboratorsGroup is null)
        {
            collaboratorsGroup = new AccessGroup
            {
                Name = CollaboratorsGroup,
                Description = "Acesso inicial dos colaboradores cadastrados.",
                CreatedBy = "system@dontus.local",
            };
            collaboratorsGroup.Permissions.Add(new GroupPermission
            {
                GroupId = collaboratorsGroup.Id,
                Screen = "dashboard",
                CanView = true,
            });
            db.AccessGroups.Add(collaboratorsGroup);
        }
        var collaboratorAgendaPermission = collaboratorsGroup.Permissions.FirstOrDefault(permission => permission.Screen == "work");
        if (collaboratorAgendaPermission is null)
        {
            collaboratorsGroup.Permissions.Add(new GroupPermission
            {
                GroupId = collaboratorsGroup.Id,
                Screen = "work",
                CanView = true,
                CanCreate = true,
            });
        }
        else
        {
            collaboratorAgendaPermission.CanView = true;
            collaboratorAgendaPermission.CanCreate = true;
        }

        var collaboratorDiaryPermission = collaboratorsGroup.Permissions.FirstOrDefault(permission => permission.Screen == "diary");
        if (collaboratorDiaryPermission is null)
        {
            collaboratorsGroup.Permissions.Add(new GroupPermission
            {
                GroupId = collaboratorsGroup.Id,
                Screen = "diary",
                CanView = true,
                CanCreate = true,
                CanEdit = true,
            });
        }
        else
        {
            collaboratorDiaryPermission.CanView = true;
            collaboratorDiaryPermission.CanCreate = true;
            collaboratorDiaryPermission.CanEdit = true;
        }

        var collaboratorNotesPermission = collaboratorsGroup.Permissions.FirstOrDefault(permission => permission.Screen == "notes");
        if (collaboratorNotesPermission is null)
        {
            collaboratorsGroup.Permissions.Add(new GroupPermission
            {
                GroupId = collaboratorsGroup.Id,
                Screen = "notes",
                CanView = true,
                CanCreate = true,
                CanEdit = true,
            });
        }
        else
        {
            collaboratorNotesPermission.CanView = true;
            collaboratorNotesPermission.CanCreate = true;
            collaboratorNotesPermission.CanEdit = true;
        }

        var collaboratorChatPermission = collaboratorsGroup.Permissions.FirstOrDefault(permission => permission.Screen == "internalChat");
        if (collaboratorChatPermission is null)
        {
            collaboratorsGroup.Permissions.Add(new GroupPermission
            {
                GroupId = collaboratorsGroup.Id,
                Screen = "internalChat",
                CanView = true,
                CanCreate = true,
                CanEdit = true,
            });
        }
        else
        {
            collaboratorChatPermission.CanView = true;
            collaboratorChatPermission.CanCreate = true;
            collaboratorChatPermission.CanEdit = true;
        }

        var collaboratorSuggestionPermission = collaboratorsGroup.Permissions.FirstOrDefault(permission => permission.Screen == "suggestions");
        if (collaboratorSuggestionPermission is null)
        {
            collaboratorsGroup.Permissions.Add(new GroupPermission
            {
                GroupId = collaboratorsGroup.Id,
                Screen = "suggestions",
                CanView = true,
                CanCreate = true,
                CanEdit = true,
            });
        }
        else
        {
            collaboratorSuggestionPermission.CanView = true;
            collaboratorSuggestionPermission.CanCreate = true;
            collaboratorSuggestionPermission.CanEdit = true;
        }

        var collaboratorNoticePermission = collaboratorsGroup.Permissions.FirstOrDefault(permission => permission.Screen == "notices");
        if (collaboratorNoticePermission is null)
        {
            collaboratorsGroup.Permissions.Add(new GroupPermission
            {
                GroupId = collaboratorsGroup.Id,
                Screen = "notices",
                CanView = true,
            });
        }
        else
        {
            collaboratorNoticePermission.CanView = true;
        }

        var collaboratorWaitingQueuePermission = collaboratorsGroup.Permissions.FirstOrDefault(permission => permission.Screen == "waitingQueue");
        if (collaboratorWaitingQueuePermission is null)
        {
            collaboratorsGroup.Permissions.Add(new GroupPermission
            {
                GroupId = collaboratorsGroup.Id,
                Screen = "waitingQueue",
                CanView = true,
                CanCreate = true,
                CanEdit = true,
            });
        }
        else
        {
            collaboratorWaitingQueuePermission.CanView = true;
            collaboratorWaitingQueuePermission.CanCreate = true;
            collaboratorWaitingQueuePermission.CanEdit = true;
        }

        var collaboratorReferralPermission = collaboratorsGroup.Permissions.FirstOrDefault(permission => permission.Screen == "referrals");
        if (collaboratorReferralPermission is null)
        {
            collaboratorsGroup.Permissions.Add(new GroupPermission
            {
                GroupId = collaboratorsGroup.Id,
                Screen = "referrals",
                CanView = true,
                CanCreate = true,
                CanEdit = true,
            });
        }
        else
        {
            collaboratorReferralPermission.CanView = true;
            collaboratorReferralPermission.CanCreate = true;
            collaboratorReferralPermission.CanEdit = true;
        }

        var collaboratorCommissionPermission = collaboratorsGroup.Permissions.FirstOrDefault(permission => permission.Screen == "commissions");
        if (collaboratorCommissionPermission is null)
        {
            collaboratorsGroup.Permissions.Add(new GroupPermission
            {
                GroupId = collaboratorsGroup.Id,
                Screen = "commissions",
                CanView = true,
                CanEdit = true,
            });
        }
        else
        {
            collaboratorCommissionPermission.CanView = true;
            collaboratorCommissionPermission.CanEdit = true;
        }

        var collaboratorGoalsPermission = collaboratorsGroup.Permissions.FirstOrDefault(permission => permission.Screen == "goals");
        if (collaboratorGoalsPermission is null)
        {
            collaboratorsGroup.Permissions.Add(new GroupPermission
            {
                GroupId = collaboratorsGroup.Id,
                Screen = "goals",
                CanView = true,
            });
        }
        else
        {
            collaboratorGoalsPermission.CanView = true;
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

        if (string.IsNullOrWhiteSpace(bootstrapUser.PasswordHash))
            bootstrapUser.PasswordHash = PasswordSecurity.Hash(
                configuration["Authentication:BootstrapPassword"] ?? "dontus_teste_2026");

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
        var departments = await db.TaskDepartments.AsNoTracking()
            .OrderBy(department => department.Name)
            .ToListAsync(cancellationToken);
        var levels = await db.EmployeeLevels.AsNoTracking()
            .OrderBy(level => level.Name)
            .ToListAsync(cancellationToken);
        var userDepartments = await db.UserDepartments.AsNoTracking()
            .ToListAsync(cancellationToken);
        var supervisions = await db.EmployeeSupervisions.AsNoTracking()
            .ToListAsync(cancellationToken);
        var departmentNames = departments.ToDictionary(department => department.Id, department => department.Name);
        var levelNames = levels.ToDictionary(level => level.Id, level => level.Name);
        var primaryDepartments = userDepartments
            .GroupBy(entry => entry.UserId)
            .ToDictionary(
                group => group.Key,
                group => group.OrderByDescending(entry => entry.IsPrimary).First().DepartmentId);

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
                user.PhotoDataUrl,
                user.JobTitle,
                user.IsCoordinator,
                user.Active,
                user.BlockedAt,
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
                group.CreatedAt)).ToArray(),
            users.Select(user =>
            {
                var departmentId = primaryDepartments.GetValueOrDefault(user.Id);
                var employeeDepartmentIds = userDepartments.Where(entry => entry.UserId == user.Id).Select(entry => entry.DepartmentId).Distinct().ToArray();
                var employeeDepartmentNames = employeeDepartmentIds.Select(id => departmentNames.GetValueOrDefault(id, "Setor não informado")).ToArray();
                return new EmployeeDto(
                    user.Id,
                    user.DisplayName,
                    user.Email,
                    user.BirthDate,
                    user.StartedAt,
                    departmentId == Guid.Empty ? null : departmentId,
                    departmentId == Guid.Empty ? user.Department : departmentNames.GetValueOrDefault(departmentId, user.Department),
                    employeeDepartmentIds,
                    employeeDepartmentNames,
                    user.EmployeeLevelId,
                    user.EmployeeLevelId is { } levelId ? levelNames.GetValueOrDefault(levelId, "Não informado") : "Não informado",
                    user.PhotoDataUrl,
                    user.JobTitle,
                    user.IsCoordinator,
                    supervisions.Where(entry => entry.CoordinatorUserId == user.Id).Select(entry => entry.SubordinateUserId).ToArray(),
                    user.Groups.Select(membership => membership.GroupId).ToArray(),
                    user.Groups.Select(membership => membership.Group.Name).Order().ToArray(),
                    user.Active,
                    user.BlockedAt);
            }).ToArray(),
            departments.Select(department => new EmployeeDepartmentDto(department.Id, department.Name, department.Description, department.Active)).ToArray(),
            levels.Select(level => new EmployeeLevelDto(level.Id, level.Name, level.Description, level.Active)).ToArray());
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
            BlockedAt = command.Active ? null : DateTimeOffset.UtcNow,
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
        user.BlockedAt = command.Active ? null : user.BlockedAt ?? DateTimeOffset.UtcNow;
        user.UpdatedAt = DateTimeOffset.UtcNow;
        user.Version++;
        db.UserAccessGroups.RemoveRange(user.Groups);
        user.Groups = groupIds
            .Select(groupId => new UserAccessGroup { UserId = user.Id, GroupId = groupId })
            .ToList();
        if (!command.Active)
        {
            var sessions = await db.LocalAuthSessions.Where(entry => entry.UserId == user.Id && entry.RevokedAt == null).ToListAsync(cancellationToken);
            foreach (var session in sessions) session.RevokedAt = DateTimeOffset.UtcNow;
        }

        AddAudit(actor, "Update", "user", user.Id.ToString(), new { user.Email, user.Active, Groups = groupIds });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<CreateEmployeeResult> CreateEmployeeAsync(
        CreateEmployeeCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("admin", "manage");
        var email = NormalizeEmail(command.Email);
        ValidateUser(command.DisplayName, email);
        if (await db.Users.AnyAsync(user => user.Email == email, cancellationToken))
            throw new DomainException("Já existe um colaborador cadastrado com este e-mail.", 409);
        if (command.BirthDate is null || command.StartedAt is null)
            throw new DomainException("Informe a data de nascimento e a data de início.");
        if (command.BirthDate >= DateOnly.FromDateTime(DateTime.UtcNow))
            throw new DomainException("Informe uma data de nascimento válida.");
        if (command.StartedAt > DateOnly.FromDateTime(DateTime.UtcNow).AddDays(1))
            throw new DomainException("A data de início não pode estar no futuro.");

        var departmentIds = await ValidateEmployeeDepartmentsAsync(command.DepartmentIds, cancellationToken);
        var departments = await db.TaskDepartments.Where(entry => departmentIds.Contains(entry.Id)).ToListAsync(cancellationToken);
        var primaryDepartment = departments.Single(entry => entry.Id == departmentIds[0]);
        var level = await db.EmployeeLevels.SingleOrDefaultAsync(
            entry => entry.Id == command.LevelId && entry.Active, cancellationToken)
            ?? throw new DomainException("Selecione um nível ativo.");
        var photo = ValidatePhoto(command.PhotoDataUrl);
        var subordinateIds = await ValidateSubordinatesAsync(command.IsCoordinator, command.SubordinateUserIds, null, cancellationToken);
        var temporaryPassword = PasswordSecurity.GenerateTemporaryPassword();
        var user = new AppUser
        {
            DisplayName = command.DisplayName.Trim(),
            Email = email,
            Department = primaryDepartment.Name,
            EmployeeLevelId = level.Id,
            BirthDate = command.BirthDate,
            StartedAt = command.StartedAt,
            PhotoDataUrl = photo,
            JobTitle = CleanJobTitle(command.JobTitle),
            IsCoordinator = command.IsCoordinator,
            PasswordHash = PasswordSecurity.Hash(temporaryPassword),
            CreatedBy = actor.Email,
        };
        var groupIds = command.GroupIds is { Count: > 0 }
            ? await ValidateGroupsAsync(command.GroupIds, cancellationToken)
            : [await db.AccessGroups.Where(group => group.Name == CollaboratorsGroup).Select(group => group.Id).SingleAsync(cancellationToken)];
        foreach (var groupId in groupIds)
            user.Groups.Add(new UserAccessGroup { UserId = user.Id, GroupId = groupId });
        db.Users.Add(user);
        foreach (var departmentId in departmentIds)
            db.UserDepartments.Add(new UserDepartment { UserId = user.Id, DepartmentId = departmentId, IsPrimary = departmentId == departmentIds[0], IsCoordinator = command.IsCoordinator });
        db.EmployeeSupervisions.AddRange(subordinateIds.Select(subordinateId => new EmployeeSupervision
        {
            CoordinatorUserId = user.Id,
            SubordinateUserId = subordinateId,
        }));
        AddAudit(actor, "Create", "employee", user.Id.ToString(), new { user.Email, Departments = departments.Select(item => item.Name), Level = level.Name });
        await db.SaveChangesAsync(cancellationToken);
        return new CreateEmployeeResult(user.Id, temporaryPassword);
    }

    public async Task UpdateEmployeeAsync(
        UpdateEmployeeCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("admin", "manage");
        var user = await db.Users.Include(entry => entry.Groups).SingleOrDefaultAsync(entry => entry.Id == command.Id, cancellationToken)
            ?? throw new DomainException("Colaborador não encontrado.", 404);
        var email = NormalizeEmail(command.Email);
        ValidateUser(command.DisplayName, email);
        if (await db.Users.AnyAsync(entry => entry.Email == email && entry.Id != user.Id, cancellationToken))
            throw new DomainException("Já existe outro colaborador cadastrado com este e-mail.", 409);
        if (command.BirthDate is null || command.StartedAt is null || command.BirthDate >= DateOnly.FromDateTime(DateTime.UtcNow) || command.StartedAt > DateOnly.FromDateTime(DateTime.UtcNow).AddDays(1))
            throw new DomainException("Informe datas de nascimento e início válidas.");
        var departmentIds = await ValidateEmployeeDepartmentsAsync(command.DepartmentIds, cancellationToken);
        var departments = await db.TaskDepartments.Where(entry => departmentIds.Contains(entry.Id)).ToListAsync(cancellationToken);
        var primaryDepartment = departments.Single(entry => entry.Id == departmentIds[0]);
        var level = await db.EmployeeLevels.SingleOrDefaultAsync(entry => entry.Id == command.LevelId && entry.Active, cancellationToken)
            ?? throw new DomainException("Selecione um nível ativo.");
        var subordinateIds = await ValidateSubordinatesAsync(command.IsCoordinator, command.SubordinateUserIds, user.Id, cancellationToken);
        var groupIds = command.GroupIds is { Count: > 0 }
            ? await ValidateGroupsAsync(command.GroupIds, cancellationToken)
            : user.Groups.Select(membership => membership.GroupId).ToArray();
        await EnsureAdministrationRemainsAsync(user, command.Active, groupIds, cancellationToken);

        user.DisplayName = command.DisplayName.Trim();
        user.Email = email;
        user.Department = primaryDepartment.Name;
        user.EmployeeLevelId = level.Id;
        user.BirthDate = command.BirthDate;
        user.StartedAt = command.StartedAt;
        user.JobTitle = CleanJobTitle(command.JobTitle);
        user.IsCoordinator = command.IsCoordinator;
        user.Active = command.Active;
        user.BlockedAt = command.Active ? null : user.BlockedAt ?? DateTimeOffset.UtcNow;
        if (command.PhotoDataUrl is not null) user.PhotoDataUrl = ValidatePhoto(command.PhotoDataUrl);
        user.UpdatedAt = DateTimeOffset.UtcNow;
        user.Version++;
        db.UserAccessGroups.RemoveRange(user.Groups);
        user.Groups = groupIds.Select(groupId => new UserAccessGroup { UserId = user.Id, GroupId = groupId }).ToList();
        db.UserDepartments.RemoveRange(await db.UserDepartments.Where(entry => entry.UserId == user.Id).ToListAsync(cancellationToken));
        foreach (var departmentId in departmentIds)
            db.UserDepartments.Add(new UserDepartment { UserId = user.Id, DepartmentId = departmentId, IsPrimary = departmentId == departmentIds[0], IsCoordinator = command.IsCoordinator });
        db.EmployeeSupervisions.RemoveRange(await db.EmployeeSupervisions.Where(entry => entry.CoordinatorUserId == user.Id).ToListAsync(cancellationToken));
        db.EmployeeSupervisions.AddRange(subordinateIds.Select(subordinateId => new EmployeeSupervision
        {
            CoordinatorUserId = user.Id,
            SubordinateUserId = subordinateId,
        }));
        if (!command.Active)
        {
            var sessions = await db.LocalAuthSessions.Where(entry => entry.UserId == user.Id && entry.RevokedAt == null).ToListAsync(cancellationToken);
            foreach (var session in sessions) session.RevokedAt = DateTimeOffset.UtcNow;
        }
        AddAudit(actor, "Update", "employee", user.Id.ToString(), new { user.Email, Departments = departments.Select(item => item.Name), Level = level.Name });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task DeleteEmployeeAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("admin", "manage");
        var user = await db.Users.SingleOrDefaultAsync(entry => entry.Id == id, cancellationToken)
            ?? throw new DomainException("Colaborador não encontrado.", 404);
        if (string.Equals(user.Email, actor.Email, StringComparison.OrdinalIgnoreCase))
            throw new DomainException("Você não pode excluir o próprio acesso.", 409);
        user.Active = false;
        user.BlockedAt ??= DateTimeOffset.UtcNow;
        user.UpdatedAt = DateTimeOffset.UtcNow;
        user.Version++;
        var sessions = await db.LocalAuthSessions.Where(entry => entry.UserId == user.Id && entry.RevokedAt == null).ToListAsync(cancellationToken);
        foreach (var session in sessions) session.RevokedAt = DateTimeOffset.UtcNow;
        AddAudit(actor, "Delete", "employee", user.Id.ToString(), new { user.Email, Mode = "access_revoked" });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task DeleteEmployeeDepartmentAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("admin", "manage");
        var department = await db.TaskDepartments.SingleOrDefaultAsync(entry => entry.Id == id, cancellationToken)
            ?? throw new DomainException("Setor não encontrado.", 404);
        department.Active = false;
        department.UpdatedAt = DateTimeOffset.UtcNow;
        AddAudit(actor, "Delete", "employee_department", id.ToString(), new { department.Name, Mode = "inactive" });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task DeleteEmployeeLevelAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("admin", "manage");
        var level = await db.EmployeeLevels.SingleOrDefaultAsync(entry => entry.Id == id, cancellationToken)
            ?? throw new DomainException("Nível não encontrado.", 404);
        level.Active = false;
        level.UpdatedAt = DateTimeOffset.UtcNow;
        AddAudit(actor, "Delete", "employee_level", id.ToString(), new { level.Name, Mode = "inactive" });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<Guid> SaveEmployeeDepartmentAsync(
        SaveEmployeeDepartmentCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("admin", "manage");
        var name = CleanCatalogName(command.Name, "setor");
        var department = command.Id.HasValue
            ? await db.TaskDepartments.SingleOrDefaultAsync(entry => entry.Id == command.Id.Value, cancellationToken)
                ?? throw new DomainException("Setor não encontrado.", 404)
            : new TaskDepartment { Name = name };
        var normalizedName = name.ToUpperInvariant();
        var existingWithName = await db.TaskDepartments
            .FirstOrDefaultAsync(entry => entry.Name.ToUpper() == normalizedName && entry.Id != department.Id, cancellationToken);
        if (existingWithName is not null)
        {
            if (existingWithName.Active)
                throw new DomainException("Já existe um setor ativo com este nome.", 409);
            existingWithName.Description = CleanCatalogDescription(command.Description);
            existingWithName.Active = true;
            existingWithName.UpdatedAt = DateTimeOffset.UtcNow;
            AddAudit(actor, "Reactivate", "employee_department", existingWithName.Id.ToString(), new { existingWithName.Name });
            await db.SaveChangesAsync(cancellationToken);
            return existingWithName.Id;
        }
        department.Name = name;
        department.Description = CleanCatalogDescription(command.Description);
        department.Active = command.Active;
        department.UpdatedAt = DateTimeOffset.UtcNow;
        if (!command.Id.HasValue) db.TaskDepartments.Add(department);
        AddAudit(actor, command.Id.HasValue ? "Update" : "Create", "employee_department", department.Id.ToString(), new { department.Name, department.Active });
        await db.SaveChangesAsync(cancellationToken);
        return department.Id;
    }

    public async Task<Guid> SaveEmployeeLevelAsync(
        SaveEmployeeLevelCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("admin", "manage");
        var name = CleanCatalogName(command.Name, "nível");
        var level = command.Id.HasValue
            ? await db.EmployeeLevels.SingleOrDefaultAsync(entry => entry.Id == command.Id.Value, cancellationToken)
                ?? throw new DomainException("Nível não encontrado.", 404)
            : new EmployeeLevel { Name = name };
        if (await db.EmployeeLevels.AnyAsync(entry => entry.Name == name && entry.Id != level.Id, cancellationToken))
            throw new DomainException("Já existe um nível com este nome.", 409);
        level.Name = name;
        level.Description = CleanCatalogDescription(command.Description);
        level.Active = command.Active;
        level.UpdatedAt = DateTimeOffset.UtcNow;
        if (!command.Id.HasValue) db.EmployeeLevels.Add(level);
        AddAudit(actor, command.Id.HasValue ? "Update" : "Create", "employee_level", level.Id.ToString(), new { level.Name, level.Active });
        await db.SaveChangesAsync(cancellationToken);
        return level.Id;
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

    public async Task DeleteGroupAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("admin", "manage");
        var group = await db.AccessGroups.SingleOrDefaultAsync(entry => entry.Id == id, cancellationToken)
            ?? throw new DomainException("Grupo não encontrado.", 404);
        if (group.IsSystem)
            throw new DomainException("Grupos de sistema não podem ser excluídos.", 409);
        group.Active = false;
        group.UpdatedAt = DateTimeOffset.UtcNow;
        group.Version++;
        AddAudit(actor, "Delete", "access_group", group.Id.ToString(), new { group.Name, Mode = "inactive" });
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

    private async Task<Guid[]> ValidateSubordinatesAsync(
        bool isCoordinator,
        IReadOnlyCollection<Guid>? requestedIds,
        Guid? coordinatorId,
        CancellationToken cancellationToken)
    {
        if (!isCoordinator) return [];
        var ids = (requestedIds ?? []).Where(id => id != coordinatorId).Distinct().ToArray();
        if (ids.Length == 0) return [];
        var valid = await db.Users.AsNoTracking()
            .Where(user => ids.Contains(user.Id) && user.Active)
            .Select(user => user.Id)
            .ToArrayAsync(cancellationToken);
        if (valid.Length != ids.Length)
            throw new DomainException("Um ou mais subordinados selecionados não existem ou estão inativos.");
        return valid;
    }

    private async Task<Guid[]> ValidateEmployeeDepartmentsAsync(
        IReadOnlyCollection<Guid>? requestedIds,
        CancellationToken cancellationToken)
    {
        var selected = (requestedIds ?? []).Where(id => id != Guid.Empty).Distinct().ToArray();
        if (selected.Length == 0)
            throw new DomainException("Selecione ao menos um setor ativo.");

        var activeIds = await db.TaskDepartments.AsNoTracking()
            .Where(entry => entry.Active && selected.Contains(entry.Id))
            .Select(entry => entry.Id)
            .ToArrayAsync(cancellationToken);
        if (activeIds.Length != selected.Length)
            throw new DomainException("Um ou mais setores selecionados estão inativos ou não existem.");

        return selected;
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

    private static string CleanCatalogName(string value, string label)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new DomainException($"Informe o nome do {label}.");
        return value.Trim();
    }

    private static string CleanCatalogDescription(string? value)
    {
        var description = value?.Trim() ?? "";
        if (description.Length > 600)
            throw new DomainException("A descrição deve ter no máximo 600 caracteres.");
        return description;
    }

    private static string CleanJobTitle(string? value)
    {
        var jobTitle = value?.Trim() ?? "";
        if (jobTitle.Length > 120)
            throw new DomainException("A função na empresa deve ter no máximo 120 caracteres.");
        return jobTitle;
    }

    private static string ValidatePhoto(string? photoDataUrl)
    {
        if (string.IsNullOrWhiteSpace(photoDataUrl)) return "";
        if (!photoDataUrl.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase) || photoDataUrl.Length > 2_800_000)
            throw new DomainException("Envie uma foto de até 2 MB em formato de imagem.");
        return photoDataUrl;
    }

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
