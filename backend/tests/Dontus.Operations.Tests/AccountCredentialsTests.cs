using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Dontus.Operations.Tests;

public sealed class AccountCredentialsTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Creation_emails_a_working_password_without_returning_or_auditing_it(bool employee)
    {
        await using var db = CreateContext();
        var sender = new RecordingPasswordEmailSender();
        var (access, actor, departmentId, levelId) = await InitializeAsync(db, sender);

        var id = await CreateAsync(access, actor, departmentId, levelId, employee);

        var message = Assert.Single(sender.Messages);
        Assert.Equal("new.user@example.com", message.Email);
        Assert.Equal("Novo usuário", message.Name);
        Assert.True(message.Password.Length >= 10);
        var saved = await db.Users.SingleAsync(user => user.Id == id);
        Assert.NotEqual(message.Password, saved.PasswordHash);
        var authentication = new LocalAuthenticationService(db, sender);
        Assert.Equal(saved.Email, (await authentication.LoginAsync(saved.Email, message.Password)).Email);
        Assert.DoesNotContain(message.Password, JsonSerializer.Serialize(await access.GetManagementAsync(actor)));
        Assert.DoesNotContain(message.Password, JsonSerializer.Serialize(await db.AuditEvents.ToListAsync()));
        Assert.DoesNotContain(typeof(CreateEmployeeResult).GetProperties(), property => property.Name.Contains("Password"));
        Assert.DoesNotContain(typeof(OperationsSnapshot).GetProperties(), property => property.Name.Contains("Password"));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Email_failure_does_not_create_partial_records_and_allows_retry(bool employee)
    {
        await using var db = CreateContext();
        var sender = new RecordingPasswordEmailSender { Fail = true };
        var (access, actor, departmentId, levelId) = await InitializeAsync(db, sender);
        var usersBefore = await db.Users.CountAsync();
        var auditBefore = await db.AuditEvents.CountAsync();
        var hrBefore = await db.WorkItems.CountAsync();
        var membershipsBefore = await db.UserDepartments.CountAsync();

        var error = await Assert.ThrowsAsync<DomainException>(() => CreateAsync(access, actor, departmentId, levelId, employee));

        Assert.Equal(503, error.StatusCode);
        Assert.Equal(usersBefore, await db.Users.CountAsync());
        Assert.Equal(auditBefore, await db.AuditEvents.CountAsync());
        Assert.Equal(hrBefore, await db.WorkItems.CountAsync());
        Assert.Equal(membershipsBefore, await db.UserDepartments.CountAsync());
        Assert.DoesNotContain(db.ChangeTracker.Entries(), entry => entry.State == EntityState.Added);
        sender.Fail = false;
        await CreateAsync(access, actor, departmentId, levelId, employee);
        Assert.Equal(usersBefore + 1, await db.Users.CountAsync());
        Assert.Single(sender.Messages);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Creation_checks_permissions_and_duplicates_before_sending_email(bool employee)
    {
        await using var db = CreateContext();
        var sender = new RecordingPasswordEmailSender();
        var (access, actor, departmentId, levelId) = await InitializeAsync(db, sender);
        var denied = new ActorContext("limited@example.com", "Limitado", "", "", []);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => CreateAsync(access, denied, departmentId, levelId, employee))).StatusCode);
        Assert.Empty(sender.Messages);
        await CreateAsync(access, actor, departmentId, levelId, employee);
        Assert.Equal(409, (await Assert.ThrowsAsync<DomainException>(() => CreateAsync(access, actor, departmentId, levelId, employee))).StatusCode);
        Assert.Single(sender.Messages);
    }

    [Fact]
    public async Task Password_change_persists_the_new_password_and_does_not_require_email()
    {
        await using var db = CreateContext();
        var sender = new RecordingPasswordEmailSender();
        var (access, actor, departmentId, levelId) = await InitializeAsync(db, sender);
        await CreateAsync(access, actor, departmentId, levelId, false);
        var originalPassword = Assert.Single(sender.Messages).Password;
        var authentication = new LocalAuthenticationService(db, sender);
        var session = await authentication.LoginAsync("new.user@example.com", originalPassword);
        sender.Fail = true;

        await authentication.ChangePasswordAsync(session.Email, originalPassword, "Changed-password-2026!");
        db.ChangeTracker.Clear();

        Assert.NotNull(await authentication.ResolveSessionAsync(session.Token));
        Assert.Equal(session.Email, (await authentication.LoginAsync(session.Email, "Changed-password-2026!")).Email);
        Assert.Equal(401, (await Assert.ThrowsAsync<DomainException>(() => authentication.LoginAsync(session.Email, originalPassword))).StatusCode);
        var storedHash = (await db.Users.SingleAsync(user => user.Email == session.Email)).PasswordHash;
        await Assert.ThrowsAsync<DomainException>(() => authentication.ChangePasswordAsync(session.Email, "wrong-password", "Another-password-2026!"));
        await Assert.ThrowsAsync<DomainException>(() => authentication.ChangePasswordAsync(session.Email, "Changed-password-2026!", "short"));
        Assert.Equal(storedHash, (await db.Users.SingleAsync(user => user.Email == session.Email)).PasswordHash);
        Assert.Single(sender.Messages);
    }

    private static async Task<Guid> CreateAsync(AccessControlService access, ActorContext actor, Guid departmentId, Guid levelId, bool employee) => employee
        ? (await access.CreateEmployeeAsync(new(" Novo usuário ", " New.User@Example.com ", new(1990, 1, 1), new(2025, 1, 1), [departmentId], levelId, null, "Analista", false, []), actor)).Id
        : await access.CreateUserAsync(new(" New.User@Example.com ", " Novo usuário ", "Suporte", true, []), actor);

    private static async Task<(AccessControlService Access, ActorContext Actor, Guid DepartmentId, Guid LevelId)> InitializeAsync(OperationsDbContext db, RecordingPasswordEmailSender sender)
    {
        var access = new AccessControlService(db, new ConfigurationBuilder().Build(), sender);
        await access.InitializeAsync();
        var admin = await db.Users.SingleAsync();
        var actor = await access.ResolveActorAsync(new(admin.Email, admin.DisplayName));
        var department = await access.SaveEmployeeDepartmentAsync(new(null, "Suporte", "Atendimento", true), actor);
        var level = await access.SaveEmployeeLevelAsync(new(null, "Analista", "Nível inicial", true), actor);
        return (access, actor, department, level);
    }

    private static OperationsDbContext CreateContext() => new(new DbContextOptionsBuilder<OperationsDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
}
