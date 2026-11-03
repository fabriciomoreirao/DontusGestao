using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class WaitingQueueDirectoryTests
{
    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static AppUser User(string name, string department = "Suporte") => new() { Email = $"{name}@test.local", DisplayName = name, Department = department, CreatedBy = "teste" };
    private static ActorContext Actor(AppUser user, string module = "waitingQueue", bool edit = true) => new(user.Email, user.DisplayName,
        "Colaborador", user.Department, [new(module, true, false, edit, false, false)]);

    [Fact]
    public async Task Queue_only_user_receives_self_and_sector_members_without_administrative_access()
    {
        await using var db = Context(); var user = User("Ana"); var support = new TaskDepartment { Name = "Suporte" };
        var secondary = new TaskDepartment { Name = "Sucesso do Cliente" }; var inactive = User("Inativo"); inactive.Active = false;
        var blocked = User("Bloqueado"); blocked.BlockedAt = DateTimeOffset.UtcNow;
        db.Users.AddRange(user, User("Bia"), inactive, blocked); db.TaskDepartments.AddRange(support, secondary);
        db.UserDepartments.AddRange(new UserDepartment { UserId = user.Id, DepartmentId = support.Id, IsPrimary = true },
            new UserDepartment { UserId = user.Id, DepartmentId = secondary.Id }); await db.SaveChangesAsync();
        var snapshot = await new OperationsService(db).GetSnapshotAsync(Actor(user));
        Assert.Null(snapshot.Access); Assert.Null(snapshot.TaskModule);
        var directory = Assert.IsType<WaitingQueueDirectoryDto>(snapshot.WaitingQueueDirectory);
        var self = Assert.Single(directory.Employees, person => person.Id == user.Id);
        Assert.Equal("Ana", self.DisplayName); Assert.Equal(support.Id, self.DepartmentId);
        Assert.Contains(secondary.Id, self.DepartmentIds); Assert.Contains("Sucesso do Cliente", self.DepartmentNames);
        Assert.Equal(2, directory.Employees.Count); Assert.DoesNotContain(directory.Employees, person => person.Id == inactive.Id || person.Id == blocked.Id);
        var legacy = Assert.Single(directory.Employees, person => person.DisplayName == "Bia");
        Assert.Equal(support.Id, legacy.DepartmentId);
    }

    [Fact]
    public async Task Other_module_permissions_do_not_expose_the_queue_directory()
    {
        await using var db = Context(); var user = User("Ana"); db.Users.Add(user); await db.SaveChangesAsync();
        var snapshot = await new OperationsService(db).GetSnapshotAsync(Actor(user, "diary"));
        Assert.Null(snapshot.WaitingQueueDirectory);
        Assert.Null(snapshot.AssignmentDirectory);
    }

    [Fact]
    public async Task Reminder_creators_receive_assignment_choices_even_without_admin_or_queue_permissions()
    {
        await using var db = Context(); var user = User("Ana"); db.Users.AddRange(user, User("Bia")); await db.SaveChangesAsync();
        var actor = new ActorContext(user.Email, user.DisplayName, "Colaborador", "Suporte", [new("cs", true, false, true, false, false), new("reminders", false, true, false, false, false)]);
        var snapshot = await new OperationsService(db).GetSnapshotAsync(actor);
        Assert.Null(snapshot.Access); Assert.Null(snapshot.WaitingQueueDirectory);
        Assert.Contains(snapshot.AssignmentDirectory!.Employees, person => person.Id == user.Id);
        Assert.Equal(2, snapshot.AssignmentDirectory.Employees.Count);
    }

    [Fact]
    public async Task Claiming_the_shared_contact_preserves_waiting_state_until_contact_is_confirmed()
    {
        await using var db = Context(); var user = User("Ana"); db.Users.Add(user);
        var item = new WorkItem { Module = "waitingQueue", RecordType = "Encaminhamento", Title = "Clínica", Status = "Novo",
            Owner = "Fila compartilhada", CreatedBy = "portal", Description = "{\"kind\":\"waitingQueue\",\"state\":\"waiting\"}" };
        db.WorkItems.Add(item); await db.SaveChangesAsync(); var service = new OperationsService(db); var detail = JsonNode.Parse(item.Description)!;
        detail["responsibleUserId"] = user.Id.ToString(); detail["responsibleName"] = user.DisplayName;
        await service.UpdateWorkItemAsync(new(item.Id, item.Title, user.DisplayName, 0, detail.ToJsonString(), null, null, item.Version), Actor(user));
        Assert.Equal(user.DisplayName, item.Owner); Assert.Equal("waiting", JsonNode.Parse(item.Description)!["state"]!.ToString());
        Assert.Single(db.Activities.Where(activity => activity.Kind == "Responsável alterado"));
        detail["state"] = "contacted"; detail["contactedAt"] = DateTimeOffset.UtcNow.ToString("O");
        await service.UpdateWorkItemAsync(new(item.Id, item.Title, user.DisplayName, 0, detail.ToJsonString(), null, null, item.Version), Actor(user));
        Assert.Equal("contacted", JsonNode.Parse(item.Description)!["state"]!.ToString());
    }
}
