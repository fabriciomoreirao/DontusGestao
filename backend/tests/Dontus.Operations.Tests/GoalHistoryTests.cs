using System.Text.Json;
using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class GoalHistoryTests
{
    private static ActorContext Actor(bool manage = true) => new("ana@test.local", "Ana", "Colaborador", "Comercial", [new("goals", true, true, manage, false, manage)]);
    private static OperationsDbContext Db() => new(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static WorkItem Goal(string metric = "salesValue") => new()
    {
        Module = "goals",
        RecordType = "Meta",
        Title = "Meta",
        Owner = "Ana",
        Team = "Comercial",
        Status = "Ativa",
        CreatedBy = "test",
        CreatedAt = DateTimeOffset.Parse("2026-11-20T12:00:00Z"),
        UpdatedAt = DateTimeOffset.Parse("2026-11-20T12:00:00Z"),
        Description = JsonSerializer.Serialize(new { kind = "performanceGoal", metric, cadence = "monthly", target = 500, employeeName = "Ana", departmentName = "Comercial", periodStart = "2026-11-05", periodEnd = "2026-11-30", active = true })
    };
    private static WorkItem Sale(string date = "2026-11-06", long cents = 10000) => new()
    {
        Module = "commercial",
        RecordType = "Lead comercial",
        Title = "Venda",
        Owner = "Outro",
        Team = "Comercial",
        Status = "Ganho",
        CreatedBy = "test",
        AmountCents = cents,
        CreatedAt = DateTimeOffset.Parse("2026-10-01T12:00:00Z"),
        UpdatedAt = DateTimeOffset.Parse("2026-11-06T12:00:00Z"),
        Description = JsonSerializer.Serialize(new { kind = "commercialLead", seller = "Ana", wonAt = date, funnel = "LIA" })
    };

    [Fact]
    public async Task Goal_aggregate_and_authorized_workspace_keep_the_complete_commercial_history()
    {
        await using var db = Db(); var goal = Goal();
        db.WorkItems.AddRange(goal, Sale("2026-11-05"), Sale("2026-11-30", 20000), Sale("2026-11-04"), Sale("2026-12-01"));
        for (var i = 0; i < 1050; i++) { var noise = Sale("2026-12-05"); noise.UpdatedAt = DateTimeOffset.Parse("2026-12-05T12:00:00Z"); db.WorkItems.Add(noise); }
        await db.SaveChangesAsync();
        var actor = Actor() with { Permissions = [new("goals", true, true, true, false, true), new("commercial", true, false, false, false, false)] };
        var workspace = await new OperationsService(db).GetSnapshotAsync(actor);
        Assert.Equal(1054, workspace.Items.Count(x => x.Module == "commercial"));
        Assert.Contains(workspace.Items, x => x.Id == goal.Id);
        Assert.Equal(4, workspace.Items.Count(x => x.Module == "commercial" && x.UpdatedAt.Month == 11));
        var result = Assert.Single(await new GoalProgressService(db).GetAsync(actor, default));
        Assert.Equal(300, result.Actual); Assert.Equal(goal.Version, result.Version);
        // Goal-only access gets the same authorized aggregate without needing private source records.
        var own = Assert.Single(await new GoalProgressService(db).GetAsync(Actor(false), default));
        Assert.Equal(result.Actual, own.Actual);
        Assert.DoesNotContain("customer", JsonSerializer.Serialize(own).ToLowerInvariant());
    }

    [Fact]
    public async Task Totals_recalculate_after_changing_the_start_date_or_an_existing_entry_without_double_counting()
    {
        await using var db = Db(); var goal = Goal(); var sale = Sale();
        db.WorkItems.AddRange(goal, sale, Sale("2026-11-10", 20000)); await db.SaveChangesAsync();
        var service = new GoalProgressService(db);
        Assert.Equal(300, Assert.Single(await service.GetAsync(Actor(), default)).Actual);
        var detail = JsonNode.Parse(goal.Description)!.AsObject(); detail["periodStart"] = "2026-11-10"; goal.Description = detail.ToJsonString(); goal.Version++;
        await db.SaveChangesAsync(); Assert.Equal(200, Assert.Single(await service.GetAsync(Actor(), default)).Actual);
        detail["periodStart"] = "2026-11-05"; goal.Description = detail.ToJsonString(); sale.AmountCents = 15000; await db.SaveChangesAsync();
        Assert.Equal(350, Assert.Single(await service.GetAsync(Actor(), default)).Actual);
        Assert.Equal(350, Assert.Single(await service.GetAsync(Actor(), default)).Actual);
    }

    [Fact]
    public async Task Goal_permissions_and_ownership_still_apply_to_historical_totals()
    {
        await using var db = Db(); var own = Goal(); var other = Goal(); other.Owner = "Bia"; other.Team = "Suporte";
        db.WorkItems.AddRange(own, other, Sale()); await db.SaveChangesAsync(); var service = new GoalProgressService(db);
        Assert.Equal(own.Id, Assert.Single(await service.GetAsync(Actor(false), default)).Id);
        Assert.Equal(2, (await service.GetAsync(Actor(), default)).Count);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.GetAsync(Actor() with { Permissions = [] }, default))).StatusCode);
    }

    [Fact]
    public void Daily_history_uses_launch_dates_in_Brasilia_includes_boundaries_and_stops_before_future_days()
    {
        var sales = new[] { Sale("2026-11-05T03:00:00Z"), Sale("2026-11-06T02:59:00Z", 20000), Sale("2026-11-07", 30000), Sale("2026-11-05T02:59:00Z"), Sale("2026-12-01") };
        var result = GoalProgress.Calculate(Goal(), sales, includeHistory: true, asOf: new(2026, 11, 13))!;
        Assert.Equal(600, result.Actual); Assert.Equal(9, result.History.Count);
        Assert.Equal(new GoalHistoryPoint("2026-11-05", 300), result.History[0]);
        Assert.Equal(new GoalHistoryPoint("2026-11-06", 300), result.History[1]);
        Assert.Equal(new GoalHistoryPoint("2026-11-07", 600), result.History[2]);
        Assert.Equal(new GoalHistoryPoint("2026-11-13", 600), result.History[^1]);
        Assert.Empty(GoalProgress.Calculate(Goal(), sales)!.History);
        Assert.Empty(GoalProgress.Calculate(Goal(), sales, includeHistory: true, asOf: new(2026, 11, 4))!.History);
    }

    [Fact]
    public void Score_history_is_a_cumulative_average_of_clients_instead_of_summing_percentages_or_averaging_daily_averages()
    {
        var records = new[] { ("2026-11-05", 50), ("2026-11-06", 100), ("2026-11-06", 80) }.Select(row =>
        { var item = Sale(); item.Module = "lia"; item.Owner = "Ana"; item.Description = JsonSerializer.Serialize(new { kind = "liaJourney", startDate = row.Item1, score = row.Item2 }); return item; }).ToArray();
        var result = GoalProgress.Calculate(Goal("usageScore"), records, includeHistory: true, asOf: new(2026, 11, 6))!;
        Assert.Equal(76.67m, result.Actual); Assert.Equal(50, result.History[0].Actual); Assert.Equal(76.67m, result.History[^1].Actual);
    }

    [Fact]
    public void History_and_totals_share_funnel_module_and_configured_winning_stage_filters()
    {
        var goal = Goal(); var d = JsonNode.Parse(goal.Description)!.AsObject();
        d["funnels"] = JsonNode.Parse("""[{"name":"Funil de Módulos"}]"""); d["moduleScope"] = "moduleFunnels";
        d["modules"] = JsonNode.Parse("""[{"productName":"Módulos","plan":"Chat"}]"""); goal.Description = d.ToJsonString();
        var sale = Sale(); sale.Status = "Cliente confirmado"; sale.Description = """{"seller":"Ana","wonAt":"2026-11-06","funnel":"Funil de Módulos","products":[{"product":"Módulos","plan":"Chat","value":50,"quantity":2},{"product":"Módulos","plan":"Outro","value":200}]}""";
        var catalog = new CustomerCatalogOption { Catalog = "funnelStage", Name = "Funil de Módulos", Description = """{"stages":[{"name":"Cliente confirmado","won":true}]}""" };
        var result = GoalProgress.Calculate(goal, [sale, Sale()], catalogs: [catalog], includeHistory: true, asOf: new(2026, 11, 30))!;
        Assert.Equal(100, result.Actual); Assert.Equal(100, result.History[^1].Actual);
        var data = JsonNode.Parse(goal.Description)!.AsObject(); data["metric"] = "salesCount"; goal.Description = data.ToJsonString();
        Assert.Equal(1, GoalProgress.Calculate(goal, [sale], catalogs: [catalog], includeHistory: true, asOf: new(2026, 11, 30))!.History[^1].Actual);
    }

    [Fact]
    public void Very_long_legacy_periods_have_bounded_history_and_still_reach_the_correct_total()
    {
        var goal = Goal(); var d = JsonNode.Parse(goal.Description)!.AsObject(); d["periodStart"] = "2000-01-01"; d["periodEnd"] = "2026-11-30"; goal.Description = d.ToJsonString();
        var result = GoalProgress.Calculate(goal, [Sale()], includeHistory: true, asOf: new(2026, 11, 30))!;
        Assert.InRange(result.History.Count, 1, 368); Assert.Equal(100, result.History[^1].Actual); Assert.Equal("2026-11-30", result.History[^1].Date);
    }
}
