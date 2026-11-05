using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Dontus.Operations.Tests;

public sealed class EmployeeAccessScheduleTests
{
    private static string Schedule(params EmployeeAccessWindow[] windows) => EmployeeAccessPolicy.ValidateAndSerialize(new(true, windows));

    [Theory]
    [InlineData("2026-11-05T11:59:59Z", false)]
    [InlineData("2026-11-05T12:00:00Z", true)]
    [InlineData("2026-11-05T20:59:59Z", true)]
    [InlineData("2026-11-05T21:00:00Z", false)]
    [InlineData("2026-11-06T12:00:00Z", false)]
    public void Applies_Brasilia_weekday_and_exact_start_and_end_boundaries(string instant, bool allowed)
    {
        var json = Schedule(new EmployeeAccessWindow(4, "09:00", "18:00"));
        if (allowed) Assert.Equal(DateTimeOffset.Parse("2026-11-05T21:00:00Z"), EmployeeAccessPolicy.RequireAllowed(json, DateTimeOffset.Parse(instant)));
        else { var error = Assert.Throws<DomainException>(() => EmployeeAccessPolicy.RequireAllowed(json, DateTimeOffset.Parse(instant))); Assert.Equal(401, error.StatusCode); Assert.Equal("access_outside_hours", error.Code); }
    }

    [Fact]
    public void Lunch_breaks_overnight_shifts_and_overlapping_intervals_have_the_correct_cutoff()
    {
        var lunch = Schedule(new(4, "09:00", "12:00"), new(4, "13:00", "18:00"));
        Assert.Throws<DomainException>(() => EmployeeAccessPolicy.RequireAllowed(lunch, DateTimeOffset.Parse("2026-11-05T15:30:00Z")));
        var overnight = Schedule(new EmployeeAccessWindow(5, "22:00", "02:00"));
        Assert.Equal(DateTimeOffset.Parse("2026-11-07T05:00:00Z"), EmployeeAccessPolicy.RequireAllowed(overnight, DateTimeOffset.Parse("2026-11-07T03:30:00Z")));
        Assert.Throws<DomainException>(() => EmployeeAccessPolicy.RequireAllowed(overnight, DateTimeOffset.Parse("2026-11-07T05:00:00Z")));
        var overlapping = Schedule(new(4, "09:00", "12:00"), new(4, "11:00", "18:00"));
        Assert.Equal(DateTimeOffset.Parse("2026-11-05T21:00:00Z"), EmployeeAccessPolicy.RequireAllowed(overlapping, DateTimeOffset.Parse("2026-11-05T13:00:00Z")));
    }

    [Fact]
    public void Existing_users_remain_unrestricted_and_invalid_enabled_schedules_cannot_open_access()
    {
        Assert.Null(EmployeeAccessPolicy.RequireAllowed("", DateTimeOffset.UtcNow));
        Assert.Null(EmployeeAccessPolicy.RequireAllowed(EmployeeAccessPolicy.ValidateAndSerialize(new(false, [])), DateTimeOffset.UtcNow));
        Assert.Throws<DomainException>(() => EmployeeAccessPolicy.ValidateAndSerialize(new(true, [])));
        Assert.Throws<DomainException>(() => Schedule(new EmployeeAccessWindow(7, "09:00", "18:00")));
        Assert.Throws<DomainException>(() => Schedule(new EmployeeAccessWindow(1, "25:00", "18:00")));
        Assert.Throws<DomainException>(() => Schedule(new EmployeeAccessWindow(1, "09:00", "09:00")));
        Assert.Throws<DomainException>(() => EmployeeAccessPolicy.RequireAllowed("invalid-json", DateTimeOffset.UtcNow));
    }

    [Fact]
    public async Task Enforces_schedule_on_password_login_open_sessions_and_actor_resolution_including_full_access()
    {
        await using var db = new OperationsDbContext(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>()).Build();
        var clock = new MutableClock(DateTimeOffset.Parse("2026-11-05T12:00:00Z"));
        var access = new AccessControlService(db, config, new RecordingPasswordEmailSender(), clock);
        await access.InitializeAsync();
        var user = await db.Users.SingleAsync();
        user.AccessScheduleJson = Schedule(new EmployeeAccessWindow(4, "09:00", "18:00"));
        await db.SaveChangesAsync();
        var auth = new LocalAuthenticationService(db, new RecordingPasswordEmailSender(), clock);
        var login = await auth.LoginAsync(user.Email, "dontus_teste_2026");
        Assert.NotNull(await auth.ResolveSessionAsync(login.Token));
        var actor = await access.ResolveActorAsync(new(user.Email, user.DisplayName));
        Assert.True(actor.FullAccess);
        Assert.NotNull(actor.AccessAllowedUntil);
        clock.Now = DateTimeOffset.Parse("2026-11-05T21:00:00Z");
        Assert.Equal("access_outside_hours", (await Assert.ThrowsAsync<DomainException>(() => auth.LoginAsync(user.Email, "dontus_teste_2026"))).Code);
        Assert.Equal("access_outside_hours", (await Assert.ThrowsAsync<DomainException>(() => auth.ResolveSessionAsync(login.Token))).Code);
        Assert.Equal("access_outside_hours", (await Assert.ThrowsAsync<DomainException>(() => access.ResolveActorAsync(new(user.Email, user.DisplayName)))).Code);
        Assert.Single(db.LocalAuthSessions);
    }

    [Fact]
    public async Task Employee_registration_roundtrips_schedule_and_unrelated_edits_preserve_it()
    {
        await using var db = new OperationsDbContext(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>()).Build();
        var access = new AccessControlService(db, config, new RecordingPasswordEmailSender());
        await access.InitializeAsync();
        var admin = await access.ResolveActorAsync(new("gestor@dontus.local", "Gestor"));
        var department = new TaskDepartment { Name = "Suporte" };
        var level = new EmployeeLevel { Name = "Analista" };
        db.TaskDepartments.Add(department); db.EmployeeLevels.Add(level); await db.SaveChangesAsync();
        var schedule = new EmployeeAccessSchedule(true, [new(1, "08:00", "12:00"), new(1, "13:00", "18:00")]);
        var created = await access.CreateEmployeeAsync(new("Pessoa teste", "schedule@test.local", new(1990, 1, 1), new(2025, 1, 1), [department.Id], level.Id,
            null, "Analista", false, [], AccessSchedule: schedule), admin);
        var employee = (await access.GetManagementAsync(admin)).Employees.Single(entry => entry.Id == created.Id);
        Assert.True(employee.AccessSchedule!.Enabled); Assert.Equal(2, employee.AccessSchedule.Windows.Count);
        await access.UpdateEmployeeAsync(new(created.Id, "Nome atualizado", employee.Email, employee.BirthDate, employee.StartedAt,
            [department.Id], level.Id, null, "Analista", false, [], true), admin);
        var preserved = (await access.GetManagementAsync(admin)).Employees.Single(entry => entry.Id == created.Id);
        Assert.True(preserved.AccessSchedule!.Enabled); Assert.Equal(2, preserved.AccessSchedule.Windows.Count);
        await access.UpdateEmployeeAsync(new(created.Id, preserved.DisplayName, preserved.Email, preserved.BirthDate, preserved.StartedAt,
            [department.Id], level.Id, null, "Analista", false, [], true, AccessSchedule: new(false, [])), admin);
        Assert.False((await access.GetManagementAsync(admin)).Employees.Single(entry => entry.Id == created.Id).AccessSchedule!.Enabled);
    }

    private sealed class MutableClock(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now;
        public override DateTimeOffset GetUtcNow() => Now;
    }
}
