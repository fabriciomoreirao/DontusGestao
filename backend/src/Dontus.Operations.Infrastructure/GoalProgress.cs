using System.Globalization;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Dontus.Operations.Domain;

namespace Dontus.Operations.Infrastructure;

public sealed record PerformanceGoalProgress(Guid Id, string Title, string Metric, string Cadence, decimal Target, decimal Actual,
    decimal Progress, bool Achieved, bool Active, string Employee, string Department, string PeriodStart, string PeriodEnd)
{
    public string FunnelId { get; init; } = "";
    public string FunnelName { get; init; } = "";
    public string ModuleName { get; init; } = "";
    public long Version { get; init; }
    public IReadOnlyList<GoalHistoryPoint> History { get; init; } = [];
}

public sealed record GoalHistoryPoint(string Date, decimal Actual);

public static class GoalProgress
{
    private static JsonObject Detail(string value) { try { return JsonNode.Parse(value) as JsonObject ?? new(); } catch { return new(); } }
    private static string Text(JsonObject value, string key) => value[key]?.ToString() ?? "";
    private static decimal Number(JsonObject value, string key) => decimal.TryParse(Text(value, key), NumberStyles.Number, CultureInfo.InvariantCulture, out var number) ? number : 0;
    private static string Normalize(string value) => string.Concat(value.Normalize(NormalizationForm.FormD).Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)).Trim().ToLowerInvariant();
    private static DateOnly? Day(string value) => DateOnly.TryParseExact(value, "yyyy-MM-dd", out var day) ? day
        : DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var timestamp) ? DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(timestamp, "America/Sao_Paulo").DateTime) : null;
    private static string First(params string[] values) => values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)) ?? "";
    private static HashSet<string> Features(JsonObject detail, string key) => (detail[key] as JsonArray ?? new()).SelectMany(value => (value?.ToString() ?? "").Split(',')).Select(Normalize).Where(value => value != "").ToHashSet();

    public static void Validate(string module, string? description)
    {
        if (module != "goals") return;
        var goal = Detail(description ?? "");
        if (Text(goal, "kind") != "performanceGoal") throw new DomainException("Informe os dados da meta.");
        if (Text(goal, "metric") is not ("salesValue" or "salesCount" or "referralCount" or "usageScore" or "clientCount")) throw new DomainException("Selecione um dos tipos de meta disponíveis.");
        if (Text(goal, "cadence") is not ("daily" or "monthly" or "annual" or "weekly")) throw new DomainException("Selecione o período da meta.");
        var start = Day(Text(goal, "periodStart")); var end = Day(Text(goal, "periodEnd"));
        if (start is null || end is null || start > end || Number(goal, "target") <= 0) throw new DomainException("Informe uma data inicial válida e uma meta maior que zero.");
        var metric = Text(goal, "metric"); var target = Number(goal, "target");
        if (metric is "salesCount" or "referralCount" or "clientCount" && target % 1 != 0) throw new DomainException("A quantidade da meta deve ser um número inteiro.");
        if (metric == "usageScore" && target > 100) throw new DomainException("A meta de score deve estar entre 0,01% e 100%.");
        if (metric is "salesValue" or "usageScore" && decimal.Round(target, 2) != target) throw new DomainException("Use no máximo duas casas decimais na meta.");
        GoalScope.Validate(goal, metric);
    }

    public static PerformanceGoalProgress? Calculate(WorkItem item, IReadOnlyCollection<WorkItem> items,
        IReadOnlyCollection<string>? defaultFeatures = null, IReadOnlyCollection<CustomerCatalogOption>? catalogs = null,
        bool includeHistory = false, DateOnly? asOf = null)
    {
        var goal = Detail(item.Description);
        if (Text(goal, "kind") != "performanceGoal") return null;
        var metric = Text(goal, "metric"); var start = Day(Text(goal, "periodStart")); var end = Day(Text(goal, "periodEnd"));
        if (start is null || end is null || start > end) return null;
        var employee = Text(goal, "employeeName"); var department = Text(goal, "departmentName");
        var scope = new GoalScope(goal, catalogs);
        var funnelCatalogs = (catalogs ?? []).Where(x => x.Catalog == "funnelStage").ToList();
        var values = new List<(DateOnly Day, decimal Value)>();
        foreach (var record in items)
        {
            var d = Detail(record.Description); var commercial = record.Module == "commercial";
            var owner = commercial ? First(Text(d, "seller"), record.Owner)
                : record.Module == "referrals" ? First(Text(d, "senderName"), record.Owner) : record.Owner;
            var team = record.Module == "referrals" ? First(Text(d, "senderDepartment"), record.Team) : record.Team;
            var sector = Normalize(department); var teamName = Normalize(team);
            if (employee != "" && Normalize(owner) != Normalize(employee)
                || sector != "" && teamName != sector && !teamName.StartsWith(sector + " ·") && !teamName.StartsWith(sector + " -")) continue;
            var won = commercial && CommercialCommissionSource.Won(record, funnelCatalogs);
            var raw = commercial ? First(Text(d, "wonAt"), Text(d, "closedAt"), Text(d, "saleDate"),
                    won ? record.UpdatedAt.ToString("O") : First(Text(d, "entryDate"), record.CreatedAt.ToString("O")))
                : record.Module == "referrals" ? First(Text(d, "date"), record.CreatedAt.ToString("O"))
                : First(Text(d, "trackingStartedAt"), Text(d, "startDate"), record.CreatedAt.ToString("O"));
            var day = Day(raw);
            if (!day.HasValue || day < start || day > end) continue;
            decimal? value = null;
            if (metric is "salesValue" or "salesCount" && won)
            {
                var cents = scope.SaleValue(d, record.AmountCents);
                if (cents.HasValue) value = metric == "salesValue" ? cents.Value / 100m : 1;
            }
            else if (metric == "referralCount" && record.Module == "referrals" && Text(d, "kind") == "referral") value = 1;
            else if (metric == "clientCount" && record.Module is "cs" or "lia") value = 1;
            else if (metric == "usageScore" && record.Module is "cs" or "lia") value = Score(d, defaultFeatures);
            if (value.HasValue) values.Add((day.Value, value.Value));
        }
        var actual = Aggregate(values.Sum(x => x.Value), values.Count, metric);
        var target = Number(goal, "target");
        return new(item.Id, item.Title, metric, Text(goal, "cadence"), target, actual,
            target > 0 ? Math.Round(actual / target * 100, 0, MidpointRounding.AwayFromZero) : 0, target > 0 && actual >= target,
            Text(goal, "active") != "false", employee, department, Text(goal, "periodStart"), Text(goal, "periodEnd"))
        {
            Version = item.Version,
            FunnelId = scope.FunnelId,
            FunnelName = scope.FunnelName,
            ModuleName = scope.ModuleLabel,
            History = includeHistory ? History(values, metric, start.Value, end.Value, asOf ?? Day(DateTimeOffset.UtcNow.ToString("O"))!.Value) : [],
        };
    }

    private static decimal Aggregate(decimal sum, int count, string metric) => metric == "usageScore"
        ? count == 0 ? 0 : Math.Round(sum / count, 2, MidpointRounding.AwayFromZero) : sum;

    private static IReadOnlyList<GoalHistoryPoint> History(List<(DateOnly Day, decimal Value)> values, string metric, DateOnly start, DateOnly end, DateOnly today)
    {
        var through = today < end ? today : end;
        if (through < start) return [];
        var sorted = values.OrderBy(x => x.Day).ToList();
        // Monthly and annual goals keep daily points; unusually long legacy periods remain bounded.
        var days = through.DayNumber - start.DayNumber;
        var step = Math.Max(1, (int)Math.Ceiling(days / 366m));
        var points = new List<GoalHistoryPoint>(); var index = 0; decimal sum = 0;
        for (var offset = 0; ; offset = Math.Min(days, offset + step))
        {
            var day = start.AddDays(offset);
            while (index < sorted.Count && sorted[index].Day <= day) { sum += sorted[index].Value; index++; }
            points.Add(new(day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), Aggregate(sum, index, metric)));
            if (offset == days) break;
        }
        return points;
    }

    private static decimal? Score(JsonObject detail, IReadOnlyCollection<string>? defaultFeatures)
    {
        if (Text(detail, "kind") == "enterpriseNetwork" && detail["units"] is JsonArray units)
        {
            var scores = units.OfType<JsonObject>().Where(unit => Text(unit, "active") != "false").Select(unit =>
            {
                var features = (unit["features"] as JsonArray ?? new()).OfType<JsonObject>().ToList();
                var names = features.Select(feature => Normalize(Text(feature, "name"))).Where(name => name != "").ToHashSet();
                var enabled = features.Where(feature => Regex.IsMatch(Normalize(Text(feature, "status")), "em utilizacao|configurada") || Normalize(Text(feature, "category")).Contains("ativa"))
                    .Select(feature => Normalize(Text(feature, "name"))).Where(names.Contains).ToHashSet();
                return names.Count == 0 ? 0 : Math.Round(enabled.Count * 100m / names.Count, MidpointRounding.AwayFromZero);
            }).ToList();
            return scores.Count == 0 ? 0 : Math.Round(scores.Average(), MidpointRounding.AwayFromZero);
        }
        if (Text(detail, "kind") != "csJourney") return detail["score"] is JsonValue ? Number(detail, "score") : null;
        var basis = Features(detail, "featuresBase");
        if (basis.Count == 0) basis = (defaultFeatures ?? []).Select(Normalize).ToHashSet();
        var active = Features(detail, "featuresActive"); var plus = Features(detail, "featuresPlus");
        return basis.Count == 0 ? 0 : Math.Round((basis.Count(active.Contains) + plus.Count(value => !basis.Contains(value))) * 100m / basis.Count, MidpointRounding.AwayFromZero);
    }
}
