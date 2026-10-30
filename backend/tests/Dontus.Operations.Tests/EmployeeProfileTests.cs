using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class EmployeeProfileTests
{
    private const string Cover = "data:image/png;base64,AA==";
    private static ActorContext Actor(AppUser user, bool chat = false) => new(user.Email, "Nome da sessão", "Colaborador", user.Department,
        chat ? [new("internalChat", true, true, true, false, false)] : []);
    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static AppUser User(string email) => new() {
        Email = email, DisplayName = "Mesmo nome", Department = "Suporte", CreatedBy = "test",
        PasswordHash = "private-hash", BirthDate = new(1993, 10, 15), JobTitle = "Analista",
    };
    private static WorkItem Record(AppUser user, string bio = "Bio anterior") => new() {
        Module = "internalChat", RecordType = "Perfil de colaborador", Title = "Perfil", Status = "Ativo",
        Owner = user.DisplayName, CreatedBy = user.Email, Version = 4,
        Description = JsonSerializer.Serialize(new { kind = "employeeProfile", employeeId = user.Id, bio, phrase = "Frase anterior", coverDataUrl = Cover }),
    };

    [Fact]
    public async Task A_user_without_admin_or_chat_permissions_can_open_save_and_reopen_their_profile()
    {
        await using var db = Context();
        var own = User("own@example.com"); var other = User("other@example.com");
        db.Users.AddRange(own, other);
        var otherRecord = Record(other); db.WorkItems.Add(otherRecord);
        await db.SaveChangesAsync();
        var service = new EmployeeProfileService(db); var actor = Actor(own);
        var empty = await service.GetAsync(null, actor);
        Assert.True(empty.CanEdit); Assert.Equal(own.Id, empty.Employee.Id); Assert.Equal(0, empty.Version);

        var saved = await service.SaveAsync(new(Cover, "  Minha biografia  ", "  Minha frase  ", empty.Version), actor);
        Assert.Equal("Minha biografia", saved.Bio); Assert.Equal("Minha frase", saved.Phrase);
        Assert.Equal(1, saved.Version); Assert.Equal(Cover, saved.CoverDataUrl);
        db.ChangeTracker.Clear();
        var reopened = await service.GetAsync(own.Id, actor);
        Assert.Equal(saved.Bio, reopened.Bio); Assert.Equal(saved.Phrase, reopened.Phrase);
        Assert.Equal(Cover, reopened.CoverDataUrl); Assert.Equal(2, await db.WorkItems.CountAsync());
        Assert.Equal("Bio anterior", JsonDocument.Parse((await db.WorkItems.SingleAsync(item => item.Id == otherRecord.Id)).Description).RootElement.GetProperty("bio").GetString());
        Assert.Equal("private-hash", (await db.Users.SingleAsync(user => user.Id == own.Id)).PasswordHash);
        var snapshot = await new OperationsService(db).GetSnapshotAsync(Actor(own, true));
        Assert.DoesNotContain(snapshot.Items, item => item.RecordType == "Perfil de colaborador");
        var audit = await db.AuditEvents.SingleAsync();
        Assert.Equal(actor.Email, audit.ActorEmail); Assert.DoesNotContain(Cover, audit.DetailsJson);
        Assert.Equal("Mesmo nome", JsonDocument.Parse((await db.WorkItems.SingleAsync(item => item.CreatedBy == own.Email)).Description).RootElement.GetProperty("updatedBy").GetString());
    }

    [Fact]
    public async Task Existing_profiles_keep_their_content_and_record_when_updated_repeatedly()
    {
        await using var db = Context(); var user = User("own@example.com"); db.Users.Add(user);
        var record = Record(user); db.WorkItems.Add(record); await db.SaveChangesAsync();
        var service = new EmployeeProfileService(db); var actor = Actor(user);
        var original = await service.GetAsync(null, actor);
        Assert.Equal(4, original.Version); Assert.Equal(Cover, original.CoverDataUrl);
        var first = await service.SaveAsync(new(original.CoverDataUrl, "Nova bio", original.Phrase, original.Version), actor);
        var second = await service.SaveAsync(new("", first.Bio, "Nova frase", first.Version), actor);
        Assert.Equal(6, second.Version); Assert.Equal("", second.CoverDataUrl);
        Assert.Equal(record.Id, (await db.WorkItems.SingleAsync()).Id);
        Assert.Equal("Nova bio", (await service.GetAsync(null, actor)).Bio);
        Assert.Equal(409, (await Assert.ThrowsAsync<DomainException>(() => service.SaveAsync(new("", "Sobrescrever", "", first.Version), actor))).StatusCode);
        Assert.Equal("Nova bio", (await service.GetAsync(null, actor)).Bio);
    }

    [Fact]
    public async Task Colleague_profiles_are_read_only_and_do_not_disclose_private_employee_fields()
    {
        await using var db = Context(); var user = User("own@example.com"); var colleague = User("other@example.com");
        db.Users.AddRange(user, colleague);
        var department = new TaskDepartment { Name = "Comercial" }; db.TaskDepartments.Add(department);
        db.UserDepartments.Add(new() { UserId = colleague.Id, DepartmentId = department.Id });
        db.EmployeeSupervisions.Add(new() { CoordinatorUserId = user.Id, SubordinateUserId = colleague.Id });
        db.WorkItems.Add(Record(colleague)); await db.SaveChangesAsync();
        var service = new EmployeeProfileService(db);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.GetAsync(colleague.Id, Actor(user)))).StatusCode);
        var profile = await service.GetAsync(colleague.Id, Actor(user, true));
        Assert.False(profile.CanEdit); Assert.Equal("Bio anterior", profile.Bio);
        Assert.Equal(15, profile.Employee.BirthdayDay); Assert.Equal(10, profile.Employee.BirthdayMonth);
        Assert.Contains("Comercial", profile.Employee.DepartmentNames); Assert.Equal(user.DisplayName, profile.Employee.SupervisorName);
        var json = JsonSerializer.Serialize(profile);
        Assert.DoesNotContain("1993", json); Assert.DoesNotContain("private-hash", json); Assert.DoesNotContain(colleague.Email, json);
    }

    [Theory]
    [InlineData(false, false)]
    [InlineData(true, true)]
    public async Task Inactive_or_blocked_users_cannot_read_or_write_a_profile(bool active, bool blocked)
    {
        await using var db = Context(); var user = User("own@example.com");
        user.Active = active; user.BlockedAt = blocked ? DateTimeOffset.UtcNow : null;
        db.Users.Add(user); await db.SaveChangesAsync(); var service = new EmployeeProfileService(db);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.GetAsync(null, Actor(user, true)))).StatusCode);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.SaveAsync(new("", "Bio", "", 0), Actor(user, true)))).StatusCode);
        Assert.Empty(db.WorkItems);
    }

    [Theory]
    [InlineData("bio")]
    [InlineData("phrase")]
    [InlineData("svg")]
    [InlineData("invalid-base64")]
    [InlineData("oversize")]
    public async Task Invalid_fields_do_not_change_the_saved_profile(string invalid)
    {
        await using var db = Context(); var user = User("own@example.com"); db.Users.Add(user); db.WorkItems.Add(Record(user)); await db.SaveChangesAsync();
        var service = new EmployeeProfileService(db); var actor = Actor(user);
        var profile = await service.GetAsync(null, actor);
        var command = new SaveEmployeeProfileCommand(invalid switch {
            "svg" => "data:image/svg+xml;base64,AA==", "invalid-base64" => "data:image/png;base64,invalid!",
            "oversize" => "data:image/png;base64," + Convert.ToBase64String(new byte[2 * 1024 * 1024 + 1]), _ => Cover,
        }, invalid == "bio" ? new string('a', 901) : "Bio", invalid == "phrase" ? new string('a', 181) : "Frase", profile.Version);
        await Assert.ThrowsAsync<DomainException>(() => service.SaveAsync(command, actor));
        Assert.Equal("Bio anterior", (await service.GetAsync(null, actor)).Bio);
        Assert.Empty(db.AuditEvents);
    }

    [Fact]
    public async Task Generic_operations_cannot_modify_a_colleagues_profile_or_create_a_spoofed_one()
    {
        await using var db = Context(); var user = User("own@example.com"); var other = User("other@example.com");
        db.Users.AddRange(user, other); var record = Record(other); db.WorkItems.Add(record); await db.SaveChangesAsync();
        var service = new OperationsService(db); var actor = Actor(user, true);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.CreateWorkItemAsync(new("internalChat", "Perfil de colaborador", "Perfil", null, "", "", "", "P3", null, null, 0, record.Description, [], null, null), actor))).StatusCode);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.UpdateWorkItemAsync(new(record.Id, record.Title, record.Owner, 0, record.Description, null, null, record.Version), actor))).StatusCode);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.DeleteWorkItemAsync(record.Id, actor))).StatusCode);
        Assert.Single(db.WorkItems); Assert.Empty(db.AuditEvents);
    }
}
