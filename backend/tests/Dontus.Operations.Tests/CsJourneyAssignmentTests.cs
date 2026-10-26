using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class CsJourneyAssignmentTests
{
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Handoff_moves_the_complete_agenda_and_customer_even_without_visible_CS_calendars(bool calendarExists)
    {
        var fixture = await Fixture(calendarExists);
        await using var db = fixture.Db;
        var starts = fixture.Commitments.Select(entry => entry.StartsAt).ToArray();
        await new OperationsService(db).UpdateWorkItemAsync(Command(fixture), fixture.Actor);
        Assert.Equal(fixture.Target.DisplayName, fixture.Journey.Owner);
        Assert.Equal("Onboarding", fixture.Journey.Status);
        Assert.Equal(2, fixture.Journey.Version);
        Assert.Equal(fixture.Target.DisplayName, fixture.Customer.CsOwner);
        var destination = await db.AgendaCalendars.SingleAsync(entry => entry.DepartmentId == fixture.Department.Id);
        Assert.All(fixture.Commitments, entry => { Assert.Equal(destination.Id, entry.AgendaId); Assert.Equal(fixture.Target.Id, entry.ResponsibleUserId); });
        Assert.Equal(starts, fixture.Commitments.Select(entry => entry.StartsAt));
        Assert.Equal(2, await db.AgendaCommitmentParticipants.CountAsync(entry => entry.UserId == fixture.Target.Id));
        Assert.Empty(await db.AgendaCommitmentParticipants.Where(entry => entry.UserId == fixture.Source.Id).ToArrayAsync());
        Assert.Equal(2, await db.AgendaCommitments.CountAsync());
        Assert.Equal("onboarding", JsonDocument.Parse(fixture.Journey.Description).RootElement.GetProperty("phase").GetString());
    }

    [Fact]
    public async Task A_late_conflict_does_not_transfer_any_commitment_or_update_the_customer()
    {
        var f = await Fixture(false);
        await using var db = f.Db;
        db.AgendaCommitments.Add(new AgendaCommitment { AgendaId = f.Commitments[0].AgendaId, ResponsibleUserId = f.Target.Id, Title = "Ocupado", StartsAt = f.Commitments[1].StartsAt, EndsAt = f.Commitments[1].EndsAt, CreatedBy = "tests" });
        await db.SaveChangesAsync();
        var agendaId = f.Commitments[0].AgendaId;
        var error = await Assert.ThrowsAsync<DomainException>(() => new OperationsService(db).UpdateWorkItemAsync(Command(f), f.Actor));
        Assert.Equal(409, error.StatusCode);
        await db.SaveChangesAsync();
        Assert.All(f.Commitments, entry => { Assert.Equal(agendaId, entry.AgendaId); Assert.Equal(f.Source.Id, entry.ResponsibleUserId); });
        Assert.Equal(f.Source.DisplayName, f.Journey.Owner);
        Assert.Equal(f.Source.DisplayName, f.Customer.CsOwner);
        Assert.Equal(1, f.Journey.Version);
        Assert.Single(await db.AgendaCalendars.ToArrayAsync());
        Assert.Empty(await db.AuditEvents.ToArrayAsync());
    }

    [Fact]
    public async Task Validation_can_advance_without_changing_the_current_responsible()
    {
        var f = await Fixture(true);
        await using var db = f.Db;
        await new OperationsService(db).UpdateWorkItemAsync(Command(f) with { ResponsibleUserId = f.Source.Id }, f.Actor);
        Assert.Equal("Onboarding", f.Journey.Status);
        Assert.Equal(f.Source.DisplayName, f.Journey.Owner);
        Assert.All(f.Commitments, entry => Assert.Equal(f.Source.Id, entry.ResponsibleUserId));
        Assert.Equal(2, await db.AgendaCommitmentParticipants.CountAsync(entry => entry.UserId == f.Source.Id));
    }

    [Theory]
    [InlineData("stale")]
    [InlineData("unchecked")]
    [InlineData("inactive")]
    [InlineData("reader")]
    public async Task Invalid_handoffs_fail_before_any_change(string reason)
    {
        var f = await Fixture(false);
        await using var db = f.Db;
        var command = Command(f);
        var actor = f.Actor;
        if (reason == "stale") command = command with { Version = 0 };
        if (reason == "unchecked") f.Journey.Description = f.Journey.Description.Replace("\"checkedAt\":\"2026-10-26T12:00:00Z\"", "\"checkedAt\":null");
        if (reason == "inactive") f.Target.Active = false;
        if (reason == "reader") actor = actor with { Permissions = [new EffectivePermission("cs", true, false, false, false, false)] };
        await db.SaveChangesAsync();
        await Assert.ThrowsAsync<DomainException>(() => new OperationsService(db).UpdateWorkItemAsync(command, actor));
        await db.SaveChangesAsync();
        Assert.Equal(f.Source.DisplayName, f.Journey.Owner);
        Assert.Single(await db.AgendaCalendars.ToArrayAsync());
        Assert.All(f.Commitments, entry => Assert.Equal(f.Source.Id, entry.ResponsibleUserId));
    }

    private static UpdateWorkItemCommand Command(TestFixture f) => new(f.Journey.Id, f.Journey.Title, f.Target.DisplayName, 0,
        f.Journey.Description.Replace("\"phase\":\"validation\"", "\"phase\":\"onboarding\""), null, null, f.Journey.Version, f.Target.Id);

    private static async Task<TestFixture> Fixture(bool calendarExists)
    {
        var db = new OperationsDbContext(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var sourceDepartment = new TaskDepartment { Name = "Comercial" };
        var department = new TaskDepartment { Name = "Sucesso do Cliente" };
        var source = new AppUser { Email = "comercial@tests.local", DisplayName = "Comercial", CreatedBy = "tests" };
        var target = new AppUser { Email = "cs@tests.local", DisplayName = "Responsável CS", CreatedBy = "tests" };
        var calendar = new AgendaCalendar { Name = "Comercial", DepartmentId = sourceDepartment.Id };
        var customer = new Customer { LegalName = "Cliente", TradeName = "Cliente", CsOwner = source.DisplayName, CreatedBy = "tests" };
        var first = new AgendaCommitment { AgendaId = calendar.Id, Title = "Kick off · Cliente", StartsAt = DateTimeOffset.Parse("2026-10-27T14:00:00Z"), EndsAt = DateTimeOffset.Parse("2026-10-27T15:00:00Z"), ResponsibleUserId = source.Id, CreatedBy = source.Email };
        var second = new AgendaCommitment { AgendaId = calendar.Id, Title = "Treinamento · Cliente", StartsAt = first.StartsAt.AddDays(1), EndsAt = first.EndsAt.AddDays(1), ResponsibleUserId = source.Id, CreatedBy = source.Email };
        var journey = new WorkItem { Module = "cs", RecordType = "Acompanhamento", Title = "Cliente", Owner = source.DisplayName, CustomerId = customer.Id, Status = "Pendente", CreatedBy = source.Email,
            Description = JsonSerializer.Serialize(new { kind = "csJourney", track = "activation", phase = "validation", checkedAt = "2026-10-26T12:00:00Z", firstMeetingCommitmentId = first.Id, trainingCommitmentId = second.Id, follows = Array.Empty<object>() }) };
        db.AddRange(sourceDepartment, department, source, target, calendar, customer, first, second, journey);
        db.UserDepartments.AddRange(new UserDepartment { UserId = source.Id, DepartmentId = sourceDepartment.Id, IsPrimary = true }, new UserDepartment { UserId = target.Id, DepartmentId = department.Id, IsPrimary = true });
        db.AgendaCommitmentParticipants.AddRange(new AgendaCommitmentParticipant { CommitmentId = first.Id, UserId = source.Id }, new AgendaCommitmentParticipant { CommitmentId = second.Id, UserId = source.Id });
        if (calendarExists) db.AgendaCalendars.Add(new AgendaCalendar { Name = department.Name, DepartmentId = department.Id });
        await db.SaveChangesAsync();
        var actor = new ActorContext(source.Email, source.DisplayName, "Colaborador", "Comercial", [new EffectivePermission("cs", true, false, true, false, false)]);
        return new(db, actor, source, target, department, customer, journey, [first, second]);
    }

    private sealed record TestFixture(OperationsDbContext Db, ActorContext Actor, AppUser Source, AppUser Target, TaskDepartment Department, Customer Customer, WorkItem Journey, AgendaCommitment[] Commitments);
}
