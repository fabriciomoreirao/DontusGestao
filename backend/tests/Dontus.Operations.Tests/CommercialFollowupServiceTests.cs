using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class CommercialFollowupServiceTests
{
    [Theory]
    [InlineData("activation")]
    [InlineData("retention")]
    [InlineData("lia")]
    public async Task Sending_without_a_booking_only_routes_the_won_card_without_requiring_version_or_client_id(string track)
    {
        await using var db = Context();
        var (lead, actor, _) = await Seed(db);
        if (track == "lia")
        {
            var source = JsonNode.Parse(lead.Description)!;
            source["products"] = new JsonArray(new JsonObject { ["product"] = "LIA", ["plan"] = "Essencial" });
            lead.Description = source.ToJsonString();
            await db.SaveChangesAsync();
        }
        var result = await Service(db).SendAsync(new(lead.Id, lead.Version, track, null, null, "Coordenação CS", null, null, null, null), actor);
        var journey = await db.WorkItems.SingleAsync(x => x.Id == result);
        var detail = JsonNode.Parse(journey.Description)!;
        Assert.Equal(track == "lia" ? "lia" : "cs", journey.Module);
        if (track != "lia") Assert.Equal(track, detail["track"]?.ToString());
        Assert.Empty(await db.AgendaCommitments.ToArrayAsync());
        Assert.Equal("sent", JsonNode.Parse(lead.Description)!["onboarding"]!["status"]?.ToString());
        Assert.Equal("false", JsonNode.Parse(lead.Description)!["notifyPublicWin"]?.ToString().ToLowerInvariant());
    }

    [Theory]
    [InlineData("activation")]
    [InlineData("retention")]
    public async Task Scheduling_resolves_training_and_scheduled_status_from_the_current_database_and_links_the_journey(string track)
    {
        await using var db = Context();
        var (lead, actor, calendar) = await Seed(db);
        var type = new AgendaType { Name = "Treinamento" };
        var status = new AgendaStatus { Name = "Agendado" };
        db.AddRange(type, status, new AgendaType { Name = "Apresentação comercial" }, new AgendaStatus { Name = "Aguardando" });
        await db.SaveChangesAsync();
        var responsible = await db.Users.SingleAsync();
        var start = DateTimeOffset.Parse("2026-11-27T14:00:00-03:00");
        var result = await Service(db).SendAsync(new(lead.Id, lead.Version, track, "123456", "Essencial", "Coordenação CS",
            calendar.Id, responsible.Id, start, "Preparar treinamento"), actor);
        var booking = Assert.Single(await db.AgendaCommitments.ToArrayAsync());
        Assert.Equal(type.Id, booking.AgendaTypeId); Assert.Equal(status.Id, booking.AgendaStatusId);
        Assert.Equal(start, booking.StartsAt); Assert.Equal(start.AddHours(1), booking.EndsAt);
        Assert.Equal("Kick off (Essencial) - ID: 123456", booking.Title);
        var detail = JsonNode.Parse((await db.WorkItems.SingleAsync(x => x.Id == result)).Description)!;
        Assert.Equal(booking.Id.ToString(), detail["firstMeetingCommitmentId"]?.ToString());
        Assert.Equal("scheduled", detail["scheduling"]?.ToString());
        var sent = JsonNode.Parse(lead.Description)!["onboarding"]!;
        Assert.Equal("123456", sent["clientId"]?.ToString()); Assert.Equal("Essencial", sent["version"]?.ToString());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task A_missing_active_training_or_scheduled_status_returns_a_clear_error_before_creating_records(bool missingStatus)
    {
        await using var db = Context();
        var (lead, actor, calendar) = await Seed(db);
        db.Add(new AgendaType { Name = "Treinamento", Active = missingStatus });
        db.Add(new AgendaStatus { Name = "Agendado", Active = !missingStatus });
        await db.SaveChangesAsync();
        var user = await db.Users.SingleAsync();
        var error = await Assert.ThrowsAsync<DomainException>(() => Service(db).SendAsync(new(lead.Id, lead.Version, "activation", "123456", "Essencial", "CS",
            calendar.Id, user.Id, DateTimeOffset.Parse("2026-11-27T14:00:00-03:00"), null), actor));
        Assert.Contains(missingStatus ? "Agendado" : "Treinamento", error.Message);
        Assert.Empty(await db.AgendaCommitments.ToArrayAsync()); Assert.Single(await db.WorkItems.ToArrayAsync());
    }

    [Theory]
    [InlineData("12345", "Essencial")]
    [InlineData("123456", "")]
    public async Task Scheduled_handoff_validates_client_details_before_writing(string clientId, string version)
    {
        await using var db = Context();
        var (lead, actor, calendar) = await Seed(db);
        var user = await db.Users.SingleAsync();
        await Assert.ThrowsAsync<DomainException>(() => Service(db).SendAsync(new(lead.Id, lead.Version, "activation", clientId, version, "CS",
            calendar.Id, user.Id, DateTimeOffset.Parse("2026-11-27T14:00:00-03:00"), null), actor));
        Assert.Empty(await db.AgendaCommitments.ToArrayAsync()); Assert.Single(await db.WorkItems.ToArrayAsync());
    }

    [Fact]
    public async Task Sending_preserves_existing_customer_details_when_the_commercial_fields_are_empty()
    {
        await using var db = Context();
        var (lead, actor, _) = await Seed(db);
        var customer = new Customer { LegalName = "Cliente QA", TradeName = "Cliente QA", DocumentMasked = "234567", ProductVersion = "Completa", CreatedBy = actor.Email };
        db.Add(customer); lead.CustomerId = customer.Id; await db.SaveChangesAsync();
        var result = await Service(db).SendAsync(new(lead.Id, lead.Version, "activation", null, null, "Coordenação CS", null, null, null, null), actor);
        Assert.Equal("234567", JsonNode.Parse((await db.WorkItems.SingleAsync(x => x.Id == result)).Description)!["clientId"]?.ToString());
        Assert.Equal("Completa", customer.ProductVersion); Assert.Equal("Coordenação CS", customer.CsOwner);
        Assert.Equal("Cliente", customer.Status);
    }

    [Fact]
    public async Task The_existing_retention_contact_forwarding_keeps_its_completion_stage_and_client_details()
    {
        await using var db = Context();
        var (lead, actor, _) = await Seed(db);
        lead.RecordType = "Lead de retenção";
        lead.Status = "Em espera";
        lead.Description = "{\"kind\":\"commercialLead\",\"stage\":\"Em espera\",\"funnel\":\"Retenção QA\"}";
        db.Add(new CustomerCatalogOption { Catalog = "funnelStage", Name = "Retenção QA", Description = "{\"f\":\"r\",\"s\":[[\"Em espera\",\"#2563eb\",false],[\"Concluído com sucesso\",\"#22c55e\",true]]}" });
        await db.SaveChangesAsync();
        await Service(db).SendAsync(new(lead.Id, lead.Version, "retention", "123456", "Completa", "CS", null, null, null, null), actor);
        var sent = JsonNode.Parse(lead.Description)!;
        Assert.Equal("Concluído com sucesso", sent["stage"]?.ToString());
        Assert.Equal("123456", sent["onboarding"]!["clientId"]?.ToString());
        Assert.Single(await db.WorkItems.Where(x => x.Module == "cs").ToArrayAsync());
        Assert.Empty(await db.AgendaCommitments.ToArrayAsync());
    }

    [Fact]
    public async Task A_second_send_without_client_id_does_not_duplicate_the_same_origin_journey()
    {
        await using var db = Context();
        var (lead, actor, _) = await Seed(db);
        var command = new SendCommercialFollowupCommand(lead.Id, lead.Version, "activation", null, null, "CS", null, null, null, null);
        await Service(db).SendAsync(command, actor);
        command = command with { LeadVersion = lead.Version };
        Assert.Equal(409, (await Assert.ThrowsAsync<DomainException>(() => Service(db).SendAsync(command, actor))).StatusCode);
        Assert.Single(await db.WorkItems.Where(x => x.Module == "cs").ToArrayAsync());
        Assert.Empty(await db.AgendaCommitments.ToArrayAsync());
    }

    [Fact]
    public async Task A_stale_card_or_missing_commercial_permission_cannot_send_anything()
    {
        await using var db = Context();
        var (lead, actor, _) = await Seed(db);
        var command = new SendCommercialFollowupCommand(lead.Id, lead.Version - 1, "activation", null, null, "CS", null, null, null, null);
        Assert.Equal(409, (await Assert.ThrowsAsync<DomainException>(() => Service(db).SendAsync(command, actor))).StatusCode);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => Service(db).SendAsync(command, actor with { FullAccess = false }))).StatusCode);
        Assert.Single(await db.WorkItems.ToArrayAsync());
    }

    private sealed class Clock : TimeProvider { public override DateTimeOffset GetUtcNow() => DateTimeOffset.Parse("2026-11-26T12:00:00Z"); }
    private static CommercialFollowupService Service(OperationsDbContext db) => new(db, new OperationsService(db), new AgendaService(db, new Clock()));
    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase("commercial-followup-" + Guid.NewGuid()).Options);
    private static async Task<(WorkItem Lead, ActorContext Actor, AgendaCalendar Calendar)> Seed(OperationsDbContext db)
    {
        var user = new AppUser { Email = "comercial-qa@test", DisplayName = "Responsável QA", CreatedBy = "tests" };
        var department = new TaskDepartment { Name = "Sucesso do Cliente" };
        var calendar = new AgendaCalendar { Name = "Sucesso do Cliente", DepartmentId = department.Id };
        var lead = new WorkItem { Module = "commercial", RecordType = "Lead comercial", Title = "Cliente QA", CustomerName = "Cliente QA", Owner = user.DisplayName,
            Status = "Ganho", Description = "{\"kind\":\"commercialLead\",\"stage\":\"Ganho\",\"notifyPublicWin\":false}", CreatedBy = user.Email };
        db.AddRange(user, department, calendar, lead);
        db.UserAgendaCalendarAccesses.Add(new UserAgendaCalendarAccess { UserId = user.Id, CalendarId = calendar.Id });
        await db.SaveChangesAsync();
        return (lead, new(user.Email, user.DisplayName, "Administrador", "Comercial", FullAccess: true), calendar);
    }
}
