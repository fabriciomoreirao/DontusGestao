using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Infrastructure;

public sealed class GoalProgressService(OperationsDbContext db)
{
    public async Task<IReadOnlyList<PerformanceGoalProgress>> GetAsync(ActorContext actor, CancellationToken ct)
    {
        actor.RequirePermission("goals", "view");
        var canManage = actor.HasPermission("goals", "manage") || actor.HasPermission("goals", "edit");
        var goals = await db.WorkItems.AsNoTracking().Where(x => x.Module == "goals"
            && (canManage || x.Owner == actor.DisplayName || x.Team == actor.Department)).ToListAsync(ct);
        if (goals.Count == 0) return [];
        // Goal metrics need the full history, independently of workspace pagination and source-screen access.
        // Only the authorized goal totals leave this service; source records and client details stay private.
        var sources = await db.WorkItems.AsNoTracking().Where(x => x.Module == "commercial" || x.Module == "referrals" || x.Module == "cs" || x.Module == "lia")
            .Select(x => new WorkItem
            {
                Id = x.Id,
                Module = x.Module,
                RecordType = x.RecordType,
                Title = "",
                CreatedBy = "",
                Owner = x.Owner,
                Team = x.Team,
                Status = x.Status,
                AmountCents = x.AmountCents,
                Description = x.Description,
                CreatedAt = x.CreatedAt,
                UpdatedAt = x.UpdatedAt
            }).ToListAsync(ct);
        var catalogs = await db.CustomerCatalogOptions.AsNoTracking().Where(x => x.Catalog == "funnelStage" || x.Catalog == "commercialProduct"
            || x.Active && (x.Catalog == "csFeatureBase" || x.Catalog == "csFeature" || x.Catalog == "csFeatureActive" || x.Catalog == "csFeaturePlus")).ToListAsync(ct);
        var features = catalogs.Where(x => x.Active && (x.Catalog == "csFeatureBase" || x.Catalog.StartsWith("csFeature") && IsBase(x.Description)))
            .Select(x => x.Name).ToArray();
        return goals.Select(goal => GoalProgress.Calculate(goal, sources, features, catalogs)).OfType<PerformanceGoalProgress>().ToList();
    }

    private static bool IsBase(string description)
    {
        try { return JsonNode.Parse(description) is JsonObject detail && detail["featureBase"]?.ToString() == "true"; }
        catch (System.Text.Json.JsonException) { return false; }
    }
}
