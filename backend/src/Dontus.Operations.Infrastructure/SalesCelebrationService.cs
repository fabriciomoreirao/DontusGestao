using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Infrastructure;

public sealed record SaleCelebrationDto(string Id, string CustomerName, string ClientId, string Seller, DateTimeOffset At);

public static class SalesCelebrationService
{
    public const string AuditAction = "SaleWon";
    public static void SynchronizeStage(WorkItem item, string stage)
    {
        if (item.Module != "commercial") return;
        var detail = Detail(item.Description);
        if (Text(detail, "kind") is not ("commercialLead" or "directSale")) return;
        detail["stage"] = stage; item.Description = CommercialStageTimeline.Normalize(detail.ToJsonString(), item.Description, item.CreatedAt);
    }
    private static JsonObject Detail(string value) { try { return JsonNode.Parse(value) as JsonObject ?? new(); } catch (JsonException) { return new(); } }
    private static string Text(JsonObject detail, string key) => detail[key] is JsonValue value && value.TryGetValue<string>(out var text) ? text ?? "" : "";
    public static bool IsWon(WorkItem item)
    {
        if (item.Module != "commercial" || Regex.IsMatch(item.RecordType, "reten|qualifica|configura", RegexOptions.IgnoreCase)) return false;
        var detail = Detail(item.Description);
        var stage = Text(detail, "stage");
        return Regex.IsMatch(string.IsNullOrWhiteSpace(stage) ? item.Status : stage, "ganho|vendid|fechad|contrat|conclu", RegexOptions.IgnoreCase);
    }

    public static string PreserveWinDate(WorkItem item, string? description)
    {
        var before = Detail(item.Description); var next = Detail(description ?? "{}");
        if (IsWon(item)) next["wonAt"] = Text(before, "wonAt") is { Length: > 0 } date ? date : item.UpdatedAt.ToString("O");
        else next.Remove("wonAt");
        return next.ToJsonString();
    }

    public static void RecordWin(OperationsDbContext db, WorkItem item, bool previouslyWon, ActorContext actor)
    {
        if (previouslyWon || !IsWon(item)) return;
        var detail = Detail(item.Description);
        detail["wonAt"] = DateTimeOffset.UtcNow.ToString("O");
        item.Description = detail.ToJsonString();
        db.AuditEvents.Add(new AuditEvent { ActorEmail = actor.Email, Action = AuditAction, Resource = "work_item", ResourceId = item.Id.ToString(), Module = "commercial",
            DetailsJson = JsonSerializer.Serialize(new { customerName = Text(detail, "customer") is { Length: > 0 } customer ? customer : string.IsNullOrWhiteSpace(item.CustomerName) ? item.Title : item.CustomerName,
                clientId = Text(detail, "clientId"), seller = Text(detail, "seller") is { Length: > 0 } seller ? seller : item.Owner }) });
    }

    public static async Task<IReadOnlyCollection<SaleCelebrationDto>> RecentAsync(OperationsDbContext db, CancellationToken ct)
    {
        var since = DateTimeOffset.UtcNow.AddMinutes(-10);
        var events = await db.AuditEvents.AsNoTracking().Where(x => x.Action == AuditAction && x.Module == "commercial" && x.CreatedAt >= since)
            .OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id).Take(100).ToArrayAsync(ct);
        return events.Reverse().Select(entry => { var detail = Detail(entry.DetailsJson); return new SaleCelebrationDto(entry.Id.ToString(), Text(detail, "customerName"), Text(detail, "clientId"), Text(detail, "seller"), entry.CreatedAt); }).ToArray();
    }
}
