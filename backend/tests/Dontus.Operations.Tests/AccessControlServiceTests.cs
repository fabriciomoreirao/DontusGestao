using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Dontus.Operations.Tests;

public sealed class AccessControlServiceTests
{
    [Fact]
    public async Task Initializes_bootstrap_administrator_with_all_screens()
    {
        await using var db = CreateContext();
        var service = CreateService(db);

        await service.InitializeAsync();
        var actor = await service.ResolveActorAsync(
            new AuthenticatedIdentity("gestor@dontus.local", "Gestor"));

        Assert.True(actor.HasPermission("admin", "manage"));
        Assert.Equal(ScreenCatalog.All.Count, actor.Permissions!.Count);
        Assert.Single(await db.Users.ToListAsync());
        var groups = await db.AccessGroups.OrderBy(group => group.Name).ToListAsync();
        Assert.Equal(2, groups.Count);
        Assert.Contains(groups, group => group.Name == "Administradores");
        Assert.Contains(groups, group => group.Name == "Colaboradores");
    }

    [Fact]
    public async Task Applies_group_permissions_to_registered_user()
    {
        await using var db = CreateContext();
        var service = CreateService(db);
        await service.InitializeAsync();
        var admin = await service.ResolveActorAsync(
            new AuthenticatedIdentity("gestor@dontus.local", "Gestor"));

        var groupId = await service.CreateGroupAsync(
            new CreateAccessGroupCommand("Suporte leitura", "Consulta de tickets", true),
            admin);
        await service.UpdateGroupAsync(
            new UpdateAccessGroupCommand(
                groupId,
                "Suporte leitura",
                "Consulta de tickets",
                true,
                [new GroupPermissionDto("support", true, false, false, false, false)]),
            admin);
        await service.CreateUserAsync(
            new CreateAccessUserCommand(
                "analista@dontus.local",
                "Analista Dontus",
                "Suporte",
                true,
                [groupId]),
            admin);

        var analyst = await service.ResolveActorAsync(
            new AuthenticatedIdentity("analista@dontus.local", "Analista"));

        Assert.True(analyst.HasPermission("support", "view"));
        Assert.False(analyst.HasPermission("support", "create"));
        Assert.False(analyst.HasPermission("finance", "view"));

        var operations = new OperationsService(db);
        await operations.CreateWorkItemAsync(
            WorkItemCommand("support", "Ticket autorizado"),
            admin);
        await operations.CreateWorkItemAsync(
            WorkItemCommand("commercial", "Oportunidade restrita"),
            admin);
        var snapshot = await operations.GetSnapshotAsync(analyst);
        Assert.Single(snapshot.Items);
        Assert.All(snapshot.Items, item => Assert.Equal("support", item.Module));

        var denied = await Assert.ThrowsAsync<DomainException>(() =>
            operations.CreateWorkItemAsync(
                WorkItemCommand("support", "Criação não autorizada"),
                analyst));
        Assert.Equal(403, denied.StatusCode);
    }

    [Fact]
    public async Task Rejects_identity_without_registered_user()
    {
        await using var db = CreateContext();
        var service = CreateService(db);
        await service.InitializeAsync();

        var exception = await Assert.ThrowsAsync<DomainException>(() =>
            service.ResolveActorAsync(new AuthenticatedIdentity("desconhecido@dontus.local", "Desconhecido")));

        Assert.Equal(403, exception.StatusCode);
    }

    [Fact]
    public async Task Persists_coordinator_hierarchy_and_blocks_login_with_the_current_date()
    {
        await using var db = CreateContext();
        var service = CreateService(db);
        await service.InitializeAsync();
        var admin = await service.ResolveActorAsync(new AuthenticatedIdentity("gestor@dontus.local", "Gestor"));
        var departmentId = await service.SaveEmployeeDepartmentAsync(
            new SaveEmployeeDepartmentCommand(null, "Suporte", "Atendimento e sucesso do cliente.", true), admin);
        var levelId = await service.SaveEmployeeLevelAsync(
            new SaveEmployeeLevelCommand(null, "Nível 1", "Entrada da trilha profissional.", true), admin);
        var subordinate = await service.CreateEmployeeAsync(new CreateEmployeeCommand(
            "Analista Dontus", "analista@dontus.local", new DateOnly(1995, 5, 12), new DateOnly(2025, 1, 10),
            [departmentId], levelId, null, "Analista de Suporte", false, []), admin);
        var coordinator = await service.CreateEmployeeAsync(new CreateEmployeeCommand(
            "Coordenador Dontus", "coordenador@dontus.local", new DateOnly(1990, 2, 20), new DateOnly(2024, 3, 15),
            [departmentId], levelId, null, "Coordenador de Suporte", true, [subordinate.Id]), admin);

        db.LocalAuthSessions.Add(new LocalAuthSession
        {
            UserId = coordinator.Id,
            TokenHash = "test-session",
            ExpiresAt = DateTimeOffset.UtcNow.AddHours(1),
        });
        await db.SaveChangesAsync();
        await service.UpdateEmployeeAsync(new UpdateEmployeeCommand(
            coordinator.Id, "Coordenador Dontus", "coordenador@dontus.local", new DateOnly(1990, 2, 20),
            new DateOnly(2024, 3, 15), [departmentId], levelId, null, "Coordenador de Suporte", true,
            [subordinate.Id], false), admin);

        var management = await service.GetManagementAsync(admin);
        var saved = management.Employees.Single(entry => entry.Id == coordinator.Id);
        Assert.True(saved.IsCoordinator);
        Assert.Contains(subordinate.Id, saved.SubordinateUserIds);
        Assert.False(saved.Active);
        Assert.NotNull(saved.BlockedAt);
        Assert.InRange(saved.BlockedAt!.Value, DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddMinutes(1));
        Assert.NotNull((await db.LocalAuthSessions.SingleAsync(entry => entry.UserId == coordinator.Id)).RevokedAt);
        await Assert.ThrowsAsync<DomainException>(() =>
            new LocalAuthenticationService(db, new NullPasswordRecoveryEmailSender())
                .LoginAsync("coordenador@dontus.local", coordinator.TemporaryPassword));
    }

    private static AccessControlService CreateService(OperationsDbContext db)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["AccessControl:BootstrapAdminEmail"] = "gestor@dontus.local",
                ["AccessControl:BootstrapAdminName"] = "Gestor Dontus",
            })
            .Build();
        return new AccessControlService(db, configuration);
    }

    private static CreateWorkItemCommand WorkItemCommand(string module, string title) =>
        new(
            module,
            "Registro",
            title,
            null,
            null,
            null,
            module,
            "P3",
            null,
            null,
            0,
            null,
            [],
            null,
            null);

    private static OperationsDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<OperationsDbContext>()
            .UseInMemoryDatabase($"dontus-access-tests-{Guid.NewGuid():N}")
            .Options;
        return new OperationsDbContext(options);
    }

    private sealed class NullPasswordRecoveryEmailSender : IPasswordRecoveryEmailSender
    {
        public Task SendAsync(
            string recipientEmail,
            string recipientName,
            string temporaryPassword,
            CancellationToken cancellationToken = default) => Task.CompletedTask;
    }
}
