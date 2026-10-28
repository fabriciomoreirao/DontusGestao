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
        db.UserAgendaCalendarAccesses.Add(new UserAgendaCalendarAccess { UserId = user.Id, CalendarId = calendar.Id });
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

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    [InlineData(4)]
    public async Task Commercial_slots_allow_three_commitments_and_refuse_the_fourth(int count)
    {
        var (db, _, command, actor) = await RecurrenceContext();
        await using var context = db;
        var service = new AgendaService(db, new SchedulingClock());
        command = command with { Title = "Kick off · Cliente" };
        for (var index = 0; index < count; index++) db.AgendaCommitments.Add(ExistingSlot(command, actor));
        await db.SaveChangesAsync();
        if (count < 3) Assert.Single(await service.CreateCommitmentAsync(command, actor));
        else Assert.Equal(409, (await Assert.ThrowsAsync<DomainException>(() => service.CreateCommitmentAsync(command, actor))).StatusCode);
        Assert.Equal(count < 3 ? count + 1 : count, await db.AgendaCommitments.CountAsync());
    }

    [Theory]
    [InlineData("2026-10-26T17:00:00Z", false)]
    [InlineData("2026-10-27T11:59:59Z", false)]
    [InlineData("2026-10-27T12:00:00Z", false)]
    [InlineData("2026-10-27T12:30:00Z", true)]
    [InlineData("2026-10-28T12:30:00Z", true)]
    [InlineData("2026-10-31T12:30:00Z", false)]
    [InlineData("2026-11-02T12:30:00Z", false)]
    public async Task New_commercial_bookings_allow_only_upcoming_business_slots(string date, bool allowed)
    {
        var (db, _, command, actor) = await RecurrenceContext();
        await using var context = db;
        var start = DateTimeOffset.Parse(date);
        command = command with { Title = "Kick off · Cliente", StartsAt = start, EndsAt = start.AddHours(1) };
        var service = new AgendaService(db, new SchedulingClock());
        if (allowed) Assert.Single(await service.CreateCommitmentAsync(command, actor));
        else
        {
            Assert.Equal(409, (await Assert.ThrowsAsync<DomainException>(() => service.CreateCommitmentAsync(command, actor))).StatusCode);
            await db.SaveChangesAsync();
            Assert.Empty(await db.AgendaCommitments.ToArrayAsync());
            Assert.Empty(await db.AuditEvents.ToArrayAsync());
        }
    }

    [Fact]
    public async Task Cancelled_commitments_and_blocks_do_not_consume_the_slot_or_other_calendars_capacity()
    {
        var (db, _, command, actor) = await RecurrenceContext();
        await using var context = db;
        var cancelled = new AgendaStatus { Name = "Cancelado" };
        var other = new AgendaCalendar { Name = "Outra agenda", DepartmentId = (await db.AgendaCalendars.SingleAsync()).DepartmentId };
        db.AddRange(cancelled, other);
        for (var index = 0; index < 2; index++) db.AgendaCommitments.Add(ExistingSlot(command, actor));
        for (var index = 0; index < 3; index++)
        {
            var entry = ExistingSlot(command, actor); entry.AgendaStatusId = cancelled.Id; db.AgendaCommitments.Add(entry);
            var elsewhere = ExistingSlot(command, actor); elsewhere.AgendaId = other.Id; db.AgendaCommitments.Add(elsewhere);
        }
        var block = ExistingSlot(command, actor); block.Title = "[BLOQUEIO COMERCIAL] Cancelado"; block.AgendaStatusId = cancelled.Id; db.AgendaCommitments.Add(block);
        await db.SaveChangesAsync();
        Assert.Single(await new AgendaService(db, new SchedulingClock()).CreateCommitmentAsync(command with { Title = "Kick off · Cliente" }, actor));
    }

    [Fact]
    public async Task Capacity_counts_commitments_in_the_same_minute_including_nonzero_seconds()
    {
        var (db, _, command, actor) = await RecurrenceContext();
        await using var context = db;
        for (var index = 0; index < 3; index++) { var entry = ExistingSlot(command, actor); entry.StartsAt = entry.StartsAt.AddSeconds(index * 10); db.AgendaCommitments.Add(entry); }
        await db.SaveChangesAsync();
        Assert.Equal(409, (await Assert.ThrowsAsync<DomainException>(() => new AgendaService(db, new SchedulingClock()).CreateCommitmentAsync(command with { Title = "Kick off · Cliente" }, actor))).StatusCode);
    }

    [Fact]
    public async Task Historical_kickoffs_can_be_edited_without_allowing_a_new_past_reservation()
    {
        var (db, _, command, actor) = await RecurrenceContext();
        await using var context = db;
        var past = ExistingSlot(command, actor); past.Title = "Kick off · Histórico"; past.StartsAt = past.StartsAt.AddDays(-1); past.EndsAt = past.EndsAt.AddDays(-1);
        db.AgendaCommitments.Add(past); await db.SaveChangesAsync();
        var service = new AgendaService(db, new SchedulingClock());
        var update = new UpdateAgendaCommitmentCommand(past.Id, past.AgendaId, past.AgendaTypeId, past.AgendaStatusId, past.ResponsibleUserId, "Kick off · Histórico revisado", "Descrição atualizada", past.StartsAt, past.EndsAt, []);
        await service.UpdateCommitmentAsync(update, actor);
        Assert.Equal(update.Description, past.Description);
        Assert.Equal(409, (await Assert.ThrowsAsync<DomainException>(() => service.UpdateCommitmentAsync(update with { StartsAt = update.StartsAt.AddMinutes(1) }, actor))).StatusCode);
    }

    [Fact]
    public async Task Sector_membership_does_not_grant_another_calendar_and_cross_sector_access_works()
    {
        var (db, service, command, actor) = await RecurrenceContext(); await using var context = db;
        var sector = await db.TaskDepartments.SingleAsync();
        var second = new AgendaCalendar { Name = "Agenda restrita", DepartmentId = sector.Id };db.Add(second);await db.SaveChangesAsync();
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.CreateCommitmentAsync(command with { AgendaId=second.Id },actor))).StatusCode);
        var otherSector = new TaskDepartment { Name="Outro setor" };db.Add(otherSector);
        var link=await db.UserDepartments.SingleAsync();db.UserDepartments.Remove(link);db.UserDepartments.Add(new UserDepartment { UserId=command.ResponsibleUserId, DepartmentId=otherSector.Id,IsPrimary=true });await db.SaveChangesAsync();
        var module=await service.GetModuleAsync(actor);Assert.Equal(command.AgendaId,Assert.Single(module.Calendars).Id);
        Assert.Contains(module.Collaborators,x=>x.Id==command.ResponsibleUserId&&x.AgendaIds!.Contains(command.AgendaId));
        Assert.Single(await service.CreateCommitmentAsync(command,actor));
    }

    [Fact]
    public async Task Revoking_calendar_access_blocks_reads_and_all_commitment_mutations()
    {
        var (db, service, command, actor) = await RecurrenceContext();await using var context=db;
        var id=Assert.Single(await service.CreateCommitmentAsync(command,actor));
        db.UserAgendaCalendarAccesses.RemoveRange(await db.UserAgendaCalendarAccesses.ToArrayAsync());await db.SaveChangesAsync();
        Assert.Empty((await service.GetModuleAsync(actor)).Calendars);
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.ChangeCommitmentStatusAsync(new(id,command.AgendaStatusId),actor))).StatusCode);
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.AssignCommitmentAsync(new(id,command.ResponsibleUserId),actor))).StatusCode);
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.DeleteCommitmentAsync(id,actor))).StatusCode);
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.UpdateCommitmentAsync(new(id,command.AgendaId,command.AgendaTypeId,command.AgendaStatusId,command.ResponsibleUserId,command.Title,command.Description,command.StartsAt,command.EndsAt,[]),actor))).StatusCode);
    }

    private static AgendaCommitment ExistingSlot(CreateAgendaCommitmentCommand command, ActorContext actor) => new()
    {
        AgendaId = command.AgendaId, AgendaTypeId = command.AgendaTypeId, AgendaStatusId = command.AgendaStatusId,
        ResponsibleUserId = command.ResponsibleUserId, Title = "Compromisso existente", StartsAt = command.StartsAt, EndsAt = command.EndsAt, CreatedBy = actor.Email,
    };
    private sealed class SchedulingClock : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => DateTimeOffset.Parse("2026-10-27T12:00:00Z");
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
        db.UserAgendaCalendarAccesses.Add(new UserAgendaCalendarAccess { UserId = user.Id, CalendarId = calendar.Id });
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
