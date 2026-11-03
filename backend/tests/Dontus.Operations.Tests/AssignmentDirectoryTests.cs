using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class AssignmentDirectoryTests
{
    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    [Theory]
    [InlineData("support")]
    [InlineData("commercial")]
    [InlineData("customers")]
    [InlineData("cs")]
    [InlineData("cancellations")]
    [InlineData("lia")]
    [InlineData("marketing")]
    [InlineData("ti")]
    [InlineData("goals")]
    [InlineData("surveys")]
    [InlineData("serviceRequests")]
    [InlineData("serviceFollowup")]
    [InlineData("reminders")]
    [InlineData("waitingQueue")]
    [InlineData("finance")]
    [InlineData("procurement")]
    [InlineData("work")]
    public async Task Module_only_users_receive_active_assignment_choices_without_administrative_access(string module)
    {
        await using var db = Context();
        var self = new AppUser { Email = "ana@test.local", DisplayName = "Ana", Department = "Suporte", CreatedBy = "test" };
        var peer = new AppUser { Email = "bia@test.local", DisplayName = "Bia", Department = "Comercial", IsCoordinator = true, CreatedBy = "test" };
        var inactive = new AppUser { Email = "inactive@test.local", DisplayName = "Inativo", Active = false, CreatedBy = "test" };
        var blocked = new AppUser { Email = "blocked@test.local", DisplayName = "Bloqueado", BlockedAt = DateTimeOffset.UtcNow, CreatedBy = "test" };
        var support = new TaskDepartment { Name = "Suporte" };
        var sales = new TaskDepartment { Name = "Comercial" };
        var retired = new TaskDepartment { Name = "Desativado", Active = false };
        db.Users.AddRange(self, peer, inactive, blocked);
        db.TaskDepartments.AddRange(support, sales, retired);
        db.UserDepartments.AddRange(new UserDepartment { UserId = peer.Id, DepartmentId = sales.Id, IsPrimary = true },
            new UserDepartment { UserId = peer.Id, DepartmentId = support.Id },
            new UserDepartment { UserId = peer.Id, DepartmentId = retired.Id });
        await db.SaveChangesAsync();
        var actor = new ActorContext(self.Email, self.DisplayName, "Colaborador", self.Department,
            [new(module, true, true, true, false, false)]);
        var snapshot = await new OperationsService(db).GetSnapshotAsync(actor);

        Assert.Null(snapshot.Access);
        Assert.Null(snapshot.TaskModule);
        var directory = Assert.IsType<WaitingQueueDirectoryDto>(snapshot.AssignmentDirectory);
        Assert.Equal(2, directory.Employees.Count);
        Assert.Equal(2, directory.Departments.Count);
        var ownChoice = Assert.Single(directory.Employees, person => person.Id == self.Id);
        Assert.Equal(support.Id, ownChoice.DepartmentId);
        var peerChoice = Assert.Single(directory.Employees, person => person.Id == peer.Id);
        Assert.True(peerChoice.IsCoordinator);
        Assert.Equal(sales.Id, peerChoice.DepartmentId);
        Assert.Contains(support.Id, peerChoice.DepartmentIds);
        Assert.DoesNotContain(retired.Id, peerChoice.DepartmentIds);
        Assert.False(actor.HasPermission("admin", "manage"));
        var json = JsonSerializer.Serialize(directory);
        Assert.DoesNotContain("Password", json);
        Assert.DoesNotContain("BirthDate", json);
        Assert.DoesNotContain("GroupIds", json);
    }

    [Theory]
    [InlineData("support")]
    [InlineData("commercial")]
    [InlineData("lia")]
    [InlineData("waitingQueue")]
    [InlineData("marketing")]
    [InlineData("goals")]
    [InlineData("surveys")]
    public async Task Module_only_users_can_load_catalogs_used_by_their_forms(string module)
    {
        await using var db = Context();
        db.CustomerCatalogOptions.Add(new CustomerCatalogOption { Catalog = "serviceStatus", Name = "Resolvido", Active = true });
        await db.SaveChangesAsync();
        var actor = new ActorContext("ana@test.local", "Ana", "Colaborador", "Suporte", [new(module, true, false, false, false, false)]);
        Assert.True(OperationsProjectionPolicy.CanViewCustomerCatalogs(actor));
        var catalogs = await new OperationsService(db).GetCustomerModuleAsync(actor);
        Assert.Contains(catalogs.Catalogs, option => option.Name == "Resolvido");
    }

    [Fact]
    public async Task Support_only_user_receives_customers_for_the_attendance_form()
    {
        await using var db = Context();
        db.Customers.Add(new Customer { TradeName = "Clínica", LegalName = "Clínica Ltda", CreatedBy = "test" });
        await db.SaveChangesAsync();
        var actor = new ActorContext("ana@test.local", "Ana", "Colaborador", "Suporte", [new("support", true, true, false, false, false)]);
        var snapshot = await new OperationsService(db).GetSnapshotAsync(actor);
        Assert.Equal("Clínica", Assert.Single(snapshot.Customers).TradeName);
    }

    [Fact]
    public async Task Support_only_user_can_save_and_reassign_attendance_using_directory_choices()
    {
        await using var db = Context();
        var self = new AppUser { Email = "ana@test.local", DisplayName = "Ana", Department = "Suporte", CreatedBy = "test" };
        var peer = new AppUser { Email = "bia@test.local", DisplayName = "Bia", Department = "Suporte", CreatedBy = "test" };
        db.Users.AddRange(self, peer);
        await db.SaveChangesAsync();
        var actor = new ActorContext(self.Email, self.DisplayName, "Colaborador", self.Department,
            [new("support", true, true, true, false, false)]);
        var service = new OperationsService(db);
        var directory = (await service.GetSnapshotAsync(actor)).AssignmentDirectory!;
        var selected = Assert.Single(directory.Employees, person => person.Id == self.Id);
        var detail = JsonSerializer.Serialize(new { kind = "serviceRecord", responsibleId = selected.Id, responsible = selected.DisplayName });
        var id = await service.CreateWorkItemAsync(new("support", "Atendimento", "Atendimento · Clínica", null, "Clínica",
            selected.DisplayName, selected.DepartmentName, "P3", null, null, 0, detail, null, null, null, "Novo"), actor);
        var created = Assert.Single((await service.GetSnapshotAsync(actor)).Items);
        Assert.Equal(self.DisplayName, created.Owner);
        Assert.Equal(self.Id, JsonDocument.Parse(created.Description).RootElement.GetProperty("responsibleId").GetGuid());

        var replacement = Assert.Single(directory.Employees, person => person.Id == peer.Id);
        detail = JsonSerializer.Serialize(new { kind = "serviceRecord", responsibleId = replacement.Id, responsible = replacement.DisplayName });
        await service.UpdateWorkItemAsync(new(id, created.Title, replacement.DisplayName, 0, detail, null, "Clínica", created.Version), actor);
        var updated = await service.GetSnapshotAsync(actor);
        Assert.Equal(peer.DisplayName, Assert.Single(updated.Items).Owner);
        Assert.Equal(2, updated.AssignmentDirectory!.Employees.Count);
        Assert.Null(updated.Access);
    }

    [Fact]
    public async Task Unrelated_permissions_do_not_expose_directories_or_catalogs()
    {
        await using var db = Context();
        var actor = new ActorContext("ana@test.local", "Ana", "Colaborador", "Suporte", [new("notes", true, false, false, false, false)]);
        var service = new OperationsService(db);
        Assert.Null((await service.GetSnapshotAsync(actor)).AssignmentDirectory);
        Assert.False(OperationsProjectionPolicy.CanViewCustomerCatalogs(actor));
        var error = await Assert.ThrowsAsync<DomainException>(() => service.GetCustomerModuleAsync(actor));
        Assert.Equal(403, error.StatusCode);
    }
}
