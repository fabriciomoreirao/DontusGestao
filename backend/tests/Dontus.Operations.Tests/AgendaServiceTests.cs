using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class AgendaServiceTests
{
    [Fact]
    public async Task Allows_meeting_room_reservations_only_for_marked_coordinators()
    {
        await using var db = CreateContext();
        var department = new TaskDepartment { Name = "Administrativo" };
        var user = new AppUser
        {
            Email = "colaborador@dontus.local",
            DisplayName = "Colaborador Dontus",
            Department = department.Name,
            CreatedBy = "teste",
            IsCoordinator = false,
        };
        var calendar = new AgendaCalendar
        {
            Name = "Sala de reunião",
            Description = "Agenda exclusiva para reservar a sala de reuniões.",
            DepartmentId = department.Id,
        };
        var type = new AgendaType { Name = "Reunião" };
        var status = new AgendaStatus { Name = "Reservado" };
        db.AddRange(department, user, calendar, type, status);
        db.UserDepartments.Add(new UserDepartment
        {
            UserId = user.Id,
            DepartmentId = department.Id,
            IsPrimary = true,
        });
        await db.SaveChangesAsync();

        var actor = new ActorContext(
            user.Email,
            user.DisplayName,
            "Colaborador",
            department.Name,
            [new EffectivePermission("work", true, true, true, false, false)]);
        var startsAt = DateTimeOffset.UtcNow.AddDays(1);
        var command = new CreateAgendaCommitmentCommand(
            calendar.Id,
            type.Id,
            status.Id,
            user.Id,
            "Alinhamento semanal",
            "Reserva interna",
            startsAt,
            startsAt.AddHours(1),
            [],
            "none");
        var service = new AgendaService(db);

        var denied = await Assert.ThrowsAsync<DomainException>(() => service.CreateCommitmentAsync(command, actor));
        Assert.Equal(403, denied.StatusCode);
        Assert.Contains("coordenadores", denied.Message, StringComparison.OrdinalIgnoreCase);

        user.IsCoordinator = true;
        await db.SaveChangesAsync();
        var created = await service.CreateCommitmentAsync(command, actor);

        Assert.Single(created);
        Assert.Single(await db.AgendaCommitments.ToListAsync());
    }

    [Fact]
    public async Task Selected_dates_preserve_Brasilia_time_duration_and_details_without_duplicates()
    {
        var (db, service, command, actor) = await RecurrenceContext();
        await using var context = db;
        // 23h30 em Brasília, já no dia seguinte em UTC.
        command = command with
        {
            StartsAt = DateTimeOffset.Parse("2026-10-28T02:30:00Z"),
            EndsAt = DateTimeOffset.Parse("2026-10-28T03:15:00Z"),
            Recurrence = "dates",
            RecurrenceDates = [new(2026, 11, 5), new(2026, 10, 29), new(2026, 10, 27), new(2026, 10, 29)],
        };
        var ids = await service.CreateCommitmentAsync(command, actor);
        var entries = await db.AgendaCommitments.OrderBy(entry => entry.StartsAt).ToArrayAsync();
        Assert.Equal(3, ids.Count);
        Assert.Equal(new[] { new DateOnly(2026, 10, 27), new(2026, 10, 29), new(2026, 11, 5) },
            entries.Select(entry => DateOnly.FromDateTime(entry.StartsAt.ToOffset(TimeSpan.FromHours(-3)).DateTime)).ToArray());
        Assert.All(entries, entry =>
        {
            Assert.Equal(23, entry.StartsAt.ToOffset(TimeSpan.FromHours(-3)).Hour);
            Assert.Equal(30, entry.StartsAt.Minute);
            Assert.Equal(TimeSpan.FromMinutes(45), entry.EndsAt - entry.StartsAt);
            Assert.Equal(TimeSpan.Zero, entry.StartsAt.Offset);
            Assert.Equal(TimeSpan.Zero, entry.EndsAt.Offset);
            Assert.Equal(command.Title, entry.Title);
            Assert.Equal(command.Description, entry.Description);
            Assert.Equal(command.AgendaId, entry.AgendaId);
            Assert.Equal(command.AgendaTypeId, entry.AgendaTypeId);
            Assert.Equal(command.AgendaStatusId, entry.AgendaStatusId);
            Assert.Equal(command.ResponsibleUserId, entry.ResponsibleUserId);
            Assert.Equal(actor.Email, entry.CreatedBy);
        });
        Assert.Equal(3, await db.AgendaCommitmentParticipants.CountAsync());
        Assert.Equal(3, await db.AuditEvents.CountAsync());
    }

    [Theory]
    [InlineData("none", 1)]
    [InlineData("week", 5)]
    [InlineData("month", 5)]
    [InlineData("businessDays", 4)]
    public async Task Existing_recurrence_options_continue_generating_the_expected_days(string mode, int expectedCount)
    {
        var (db, service, command, actor) = await RecurrenceContext();
        await using var context = db;
        command = command with { Recurrence = mode };
        Assert.Equal(expectedCount, (await service.CreateCommitmentAsync(command, actor)).Count);
        Assert.All(await db.AgendaCommitments.ToListAsync(), entry => Assert.Equal(14, entry.StartsAt.ToOffset(TimeSpan.FromHours(-3)).Hour));
    }

    [Theory]
    [InlineData("none", 1)]
    [InlineData("week", 1)]
    [InlineData("month", 1)]
    [InlineData("businessDays", 1)]
    public async Task Existing_recurrence_options_use_the_Brasilia_calendar_at_the_end_of_the_month(string mode, int expectedCount)
    {
        var (db, service, command, actor) = await RecurrenceContext();
        await using var context = db;
        // Sábado, 31/10, 23h30 em Brasília: os limites não podem avançar para novembro pelo UTC.
        command = command with { StartsAt = DateTimeOffset.Parse("2026-11-01T02:30:00Z"), EndsAt = DateTimeOffset.Parse("2026-11-01T03:00:00Z"), Recurrence = mode };
        Assert.Equal(expectedCount, (await service.CreateCommitmentAsync(command, actor)).Count);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(101)]
    public async Task Selected_dates_require_a_nonempty_bounded_selection(int dateCount)
    {
        var (db, service, command, actor) = await RecurrenceContext();
        await using var context = db;
        command = command with { Recurrence = "dates", RecurrenceDates = Enumerable.Range(0, dateCount).Select(index => new DateOnly(2026, 11, 1).AddDays(index)).ToArray() };
        await Assert.ThrowsAsync<DomainException>(() => service.CreateCommitmentAsync(command, actor));
        await db.SaveChangesAsync();
        Assert.Empty(await db.AgendaCommitments.ToListAsync());
        Assert.Empty(await db.AuditEvents.ToListAsync());
    }

    [Fact]
    public async Task A_conflict_on_a_selected_date_rejects_the_whole_batch_before_tracking_new_records()
    {
        var (db, service, command, actor) = await RecurrenceContext();
        await using var context = db;
        var conflictStart = command.StartsAt.AddDays(4);
        db.AgendaCommitments.Add(new AgendaCommitment { AgendaId = command.AgendaId, AgendaTypeId = command.AgendaTypeId,
            AgendaStatusId = command.AgendaStatusId, ResponsibleUserId = command.ResponsibleUserId,
            Title = "Horário ocupado", StartsAt = conflictStart, EndsAt = conflictStart.AddHours(1), CreatedBy = actor.Email });
        await db.SaveChangesAsync();
        command = command with { Recurrence = "dates", RecurrenceDates = [new(2026, 10, 28), new(2026, 10, 31)] };
        Assert.Equal(409, (await Assert.ThrowsAsync<DomainException>(() => service.CreateCommitmentAsync(command, actor))).StatusCode);
        await db.SaveChangesAsync();
        Assert.Single(await db.AgendaCommitments.ToListAsync());
        Assert.Empty(await db.AgendaCommitmentParticipants.ToListAsync());
        Assert.Empty(await db.AuditEvents.ToListAsync());
    }

    [Fact]
    public async Task Selected_dates_cannot_generate_overlapping_multiday_commitments()
    {
        var (db, service, command, actor) = await RecurrenceContext();
        await using var context = db;
        command = command with { EndsAt = command.StartsAt.AddHours(25), Recurrence = "dates", RecurrenceDates = [new(2026, 10, 28)] };
        Assert.Equal(409, (await Assert.ThrowsAsync<DomainException>(() => service.CreateCommitmentAsync(command, actor))).StatusCode);
        Assert.Empty(await db.AgendaCommitments.ToListAsync());
    }

    private static async Task<(OperationsDbContext Db, AgendaService Service, CreateAgendaCommitmentCommand Command, ActorContext Actor)> RecurrenceContext()
    {
        var db = CreateContext();
        var department = new TaskDepartment { Name = "Suporte" };
        var user = new AppUser { Email = "agenda@dontus.local", DisplayName = "Responsável", CreatedBy = "tests" };
        var calendar = new AgendaCalendar { Name = "Agenda de suporte", DepartmentId = department.Id };
        var type = new AgendaType { Name = "Reunião" };
        var status = new AgendaStatus { Name = "Agendado" };
        db.AddRange(department, user, calendar, type, status);
        db.UserDepartments.Add(new UserDepartment { UserId = user.Id, DepartmentId = department.Id, IsPrimary = true });
        await db.SaveChangesAsync();
        var startsAt = DateTimeOffset.Parse("2026-10-27T14:00:00-03:00");
        var command = new CreateAgendaCommitmentCommand(calendar.Id, type.Id, status.Id, user.Id, "Alinhamento", "Detalhes", startsAt, startsAt.AddHours(1), [], "none");
        var actor = new ActorContext(user.Email, user.DisplayName, "Colaborador", department.Name, [new EffectivePermission("work", true, true, true, false, false)]);
        return (db, new AgendaService(db), command, actor);
    }

    private static OperationsDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<OperationsDbContext>()
            .UseInMemoryDatabase($"dontus-agenda-tests-{Guid.NewGuid():N}")
            .Options;
        return new OperationsDbContext(options);
    }
}
