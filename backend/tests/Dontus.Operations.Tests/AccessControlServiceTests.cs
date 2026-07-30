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
        Assert.Single(await db.AccessGroups.ToListAsync());
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
}
