using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class HrVacationTests
{
    private static ActorContext Actor => new("rh@test.local", "Gestora RH", "RH", "RH", [new("hr", true, false, true, false, false)]);
    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static WorkItem Employee(JsonArray? vacations = null) => new()
    {
        Module = "hr", RecordType = "Colaborador", Title = "Pessoa de teste", Status = "Ativos", CreatedBy = Actor.Email,
        Description = new JsonObject { ["kind"] = "hrEmployee", ["employeeId"] = Guid.NewGuid().ToString(),
            ["fullName"] = "Pessoa de teste", ["startedAt"] = DateTime.UtcNow.AddYears(-4).ToString("yyyy-MM-dd"),
            ["comments"] = new JsonArray(new JsonObject { ["text"] = "Histórico preservado" }), ["vacations"] = vacations ?? new JsonArray() }.ToJsonString()
    };

    [Fact]
    public async Task Manual_completion_finishes_only_the_remaining_balance_without_inventing_dates()
    {
        await using var db = Context();
        var item = Employee(new JsonArray(
            new JsonObject { ["id"] = "previous", ["entitlementYear"] = 1, ["days"] = 10, ["status"] = "Concluída", ["startDate"] = "2023-01-01", ["endDate"] = "2023-01-10" },
            new JsonObject { ["id"] = "cancelled", ["entitlementYear"] = 1, ["days"] = 30, ["status"] = "Cancelada" },
            new JsonObject { ["id"] = "other", ["entitlementYear"] = 2, ["days"] = 5, ["status"] = "Concluída" }));
        db.WorkItems.Add(item); await db.SaveChangesAsync();
        var before = DateTimeOffset.UtcNow;
        await new OperationsService(db).CompleteHrVacationPeriodAsync(item.Id, 1, 1, "Regularização do histórico", Actor);
        var profile = JsonNode.Parse((await db.WorkItems.SingleAsync()).Description)!;
        var rows = profile["vacations"]!.AsArray();
        var manual = rows.Last()!;
        Assert.Equal(20, manual["days"]!.GetValue<int>());
        Assert.Equal("", manual["startDate"]!.GetValue<string>()); Assert.Equal("", manual["endDate"]!.GetValue<string>());
        Assert.True(manual["manualCompletion"]!.GetValue<bool>()); Assert.Equal("Concluída", manual["status"]!.ToString());
        Assert.Equal(Actor.Email, manual["authorEmail"]!.ToString());
        Assert.InRange(DateTimeOffset.Parse(manual["createdAt"]!.ToString()), before, DateTimeOffset.UtcNow);
        Assert.Equal("Histórico preservado", profile["comments"]![0]!["text"]!.ToString());
        Assert.Equal(5, rows[2]!["days"]!.GetValue<int>()); Assert.Equal(2, item.Version);
        Assert.Equal("CompleteVacationPeriod", Assert.Single(db.AuditEvents).Action); Assert.Single(db.Activities);
        Assert.Equal(409, (await Assert.ThrowsAsync<DomainException>(() => new OperationsService(db).CompleteHrVacationPeriodAsync(item.Id, 1, 2, null, Actor))).StatusCode);
        Assert.Equal(4, JsonNode.Parse(item.Description)!["vacations"]!.AsArray().Count);
    }

    [Fact]
    public async Task Past_planned_vacations_are_counted_when_completing_the_acquisition_period()
    {
        await using var db = Context();
        var item = Employee(new JsonArray(new JsonObject { ["entitlementYear"] = 1, ["days"] = 15, ["status"] = "Planejada",
            ["startDate"] = DateTime.UtcNow.AddDays(-20).ToString("yyyy-MM-dd"), ["endDate"] = DateTime.UtcNow.AddDays(-6).ToString("yyyy-MM-dd") }));
        db.WorkItems.Add(item); await db.SaveChangesAsync();
        await new OperationsService(db).CompleteHrVacationPeriodAsync(item.Id, 1, 1, null, Actor);
        var rows = JsonNode.Parse(item.Description)!["vacations"]!.AsArray();
        Assert.Equal("Concluída", rows[0]!["status"]!.ToString()); Assert.Equal(15, rows[1]!["days"]!.GetValue<int>());
    }

    [Fact]
    public async Task Permissions_version_employee_stage_and_acquisition_year_are_checked_before_mutation()
    {
        await using var db = Context(); var item = Employee(); db.WorkItems.Add(item); await db.SaveChangesAsync();
        var service = new OperationsService(db); var original = item.Description;
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.CompleteHrVacationPeriodAsync(item.Id, 1, 1, null, Actor with { Permissions = [] }))).StatusCode);
        Assert.Equal(409, (await Assert.ThrowsAsync<DomainException>(() => service.CompleteHrVacationPeriodAsync(item.Id, 1, 0, null, Actor))).StatusCode);
        await Assert.ThrowsAsync<DomainException>(() => service.CompleteHrVacationPeriodAsync(item.Id, 0, 1, null, Actor));
        await Assert.ThrowsAsync<DomainException>(() => service.CompleteHrVacationPeriodAsync(item.Id, 10, 1, null, Actor));
        item.Status = "Desligados"; await db.SaveChangesAsync();
        await Assert.ThrowsAsync<DomainException>(() => service.CompleteHrVacationPeriodAsync(item.Id, 1, 1, null, Actor));
        Assert.Equal(original, item.Description); Assert.Empty(db.AuditEvents);
    }
}
