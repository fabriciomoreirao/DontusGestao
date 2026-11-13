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
}

public static class GoalProgress
{
    private static JsonObject Detail(string value) { try { return JsonNode.Parse(value) as JsonObject ?? new(); } catch { return new(); } }
    private static string Text(JsonObject value, string key) => value[key]?.ToString() ?? "";
    private static decimal Number(JsonObject value, string key) => decimal.TryParse(Text(value,key), NumberStyles.Number, CultureInfo.InvariantCulture, out var number) ? number : 0;
    private static string Normalize(string value) => string.Concat(value.Normalize(NormalizationForm.FormD).Where(c=>CharUnicodeInfo.GetUnicodeCategory(c)!=UnicodeCategory.NonSpacingMark)).Trim().ToLowerInvariant();
    private static DateOnly? Day(string value) => DateOnly.TryParseExact(value,"yyyy-MM-dd",out var day) ? day
        : DateTimeOffset.TryParse(value,CultureInfo.InvariantCulture,DateTimeStyles.None,out var timestamp) ? DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(timestamp,"America/Sao_Paulo").DateTime) : null;
    private static string First(params string[] values) => values.FirstOrDefault(value=>!string.IsNullOrWhiteSpace(value)) ?? "";
    private static HashSet<string> Features(JsonObject detail,string key) => (detail[key] as JsonArray ?? new()).SelectMany(value=>(value?.ToString()??"").Split(',')).Select(Normalize).Where(value=>value!="").ToHashSet();

    public static void Validate(string module,string? description)
    {
        if(module!="goals")return;
        var goal=Detail(description??"");
        if(Text(goal,"kind")!="performanceGoal")throw new DomainException("Informe os dados da meta.");
        if(Text(goal,"metric") is not ("salesValue" or "salesCount" or "referralCount" or "usageScore" or "clientCount"))throw new DomainException("Selecione um dos tipos de meta disponíveis.");
        if(Text(goal,"cadence") is not ("daily" or "monthly" or "annual" or "weekly"))throw new DomainException("Selecione o período da meta.");
        var start=Day(Text(goal,"periodStart"));var end=Day(Text(goal,"periodEnd"));
        if(start is null||end is null||start>end||Number(goal,"target")<=0)throw new DomainException("Informe uma data inicial válida e uma meta maior que zero.");
        var metric=Text(goal,"metric");var target=Number(goal,"target");
        if(metric is "salesCount" or "referralCount" or "clientCount" && target%1!=0)throw new DomainException("A quantidade da meta deve ser um número inteiro.");
        if(metric=="usageScore"&&target>100)throw new DomainException("A meta de score deve estar entre 0,01% e 100%.");
        if(metric is "salesValue" or "usageScore" && decimal.Round(target,2)!=target)throw new DomainException("Use no máximo duas casas decimais na meta.");
        GoalScope.Validate(goal, metric);
    }

    public static PerformanceGoalProgress? Calculate(WorkItem item,IReadOnlyCollection<WorkItem> items,IReadOnlyCollection<string>? defaultFeatures=null,
        IReadOnlyCollection<CustomerCatalogOption>? catalogs=null)
    {
        var goal=Detail(item.Description);if(Text(goal,"kind")!="performanceGoal")return null;
        var metric=Text(goal,"metric");var start=Day(Text(goal,"periodStart"));var end=Day(Text(goal,"periodEnd"));
        if(start is null||end is null)return null;
        var employee=Text(goal,"employeeName");var department=Text(goal,"departmentName");
        var scope = new GoalScope(goal, catalogs);
        var source=items.Select(record=>(Item:record,Detail:Detail(record.Description))).Where(entry=>{
            var d=entry.Detail;var record=entry.Item;var commercial=record.Module=="commercial";
            var owner=commercial?First(Text(d,"seller"),record.Owner):record.Module=="referrals"?First(Text(d,"senderName"),record.Owner):record.Owner;
            var team=record.Module=="referrals"?First(Text(d,"senderDepartment"),record.Team):record.Team;
            var sector=Normalize(department);var teamName=Normalize(team);
            if(employee!=""&&Normalize(owner)!=Normalize(employee)||sector!=""&&teamName!=sector&&!teamName.StartsWith(sector+" ·")&&!teamName.StartsWith(sector+" -"))return false;
            var raw=commercial?First(Text(d,"wonAt"),Text(d,"closedAt"),Text(d,"saleDate"),Regex.IsMatch(Normalize(record.Status),"ganho|fechad|vendid")?record.UpdatedAt.ToString("O"):First(Text(d,"entryDate"),record.CreatedAt.ToString("O")))
                :record.Module=="referrals"?First(Text(d,"date"),record.CreatedAt.ToString("O")):First(Text(d,"trackingStartedAt"),Text(d,"startDate"),record.CreatedAt.ToString("O"));
            var day=Day(raw);return day.HasValue&&day>=start&&day<=end;
        }).ToList();
        var sales=source.Where(entry=>entry.Item.Module=="commercial"&&!Regex.IsMatch(Normalize(entry.Item.RecordType),"reten|qualifica|configura")&&Text(entry.Detail,"kind")!="directSale"
            &&Regex.IsMatch(Normalize($"{entry.Item.Status} {Text(entry.Detail,"stage")}"),"ganho|fechad|vendid"))
            .Select(entry => scope.SaleValue(entry.Detail, entry.Item.AmountCents)).Where(value => value.HasValue).Select(value => value!.Value).ToList();
        decimal actual=metric switch {"salesValue"=>sales.Sum()/100m,"salesCount"=>sales.Count,
            "referralCount"=>source.Count(entry=>entry.Item.Module=="referrals"&&Text(entry.Detail,"kind")=="referral"),
            "clientCount"=>source.Count(entry=>entry.Item.Module is "cs" or "lia"),_=>0};
        if(metric=="usageScore")
        {
            var scores=source.Where(entry=>entry.Item.Module is "cs" or "lia").Select(entry=>{
                if(Text(entry.Detail,"kind")=="enterpriseNetwork" && entry.Detail["units"] is JsonArray units)
                {
                    var unitScores=units.OfType<JsonObject>().Where(unit=>Text(unit,"active")!="false").Select(unit=>{
                        var features=(unit["features"] as JsonArray??new()).OfType<JsonObject>().ToList();
                        var names=features.Select(feature=>Normalize(Text(feature,"name"))).Where(name=>name!="").ToHashSet();
                        var enabledFeatures=features.Where(feature=>Regex.IsMatch(Normalize(Text(feature,"status")),"em utilizacao|configurada")||Normalize(Text(feature,"category")).Contains("ativa"))
                            .Select(feature=>Normalize(Text(feature,"name"))).Where(names.Contains).ToHashSet();
                        return names.Count==0?0:Math.Round(enabledFeatures.Count*100m/names.Count,MidpointRounding.AwayFromZero);
                    }).ToList();
                    return (decimal?)(unitScores.Count==0?0:Math.Round(unitScores.Average(),MidpointRounding.AwayFromZero));
                }
                if(Text(entry.Detail,"kind")!="csJourney")return entry.Detail["score"] is JsonValue ? (decimal?)Number(entry.Detail,"score"):null;
                var basis=Features(entry.Detail,"featuresBase");if(basis.Count==0)basis=(defaultFeatures??[]).Select(Normalize).ToHashSet();
                var active=Features(entry.Detail,"featuresActive");var plus=Features(entry.Detail,"featuresPlus");
                return (decimal?)(basis.Count==0?0:Math.Round((basis.Count(active.Contains)+plus.Count(value=>!basis.Contains(value)))*100m/basis.Count,MidpointRounding.AwayFromZero));
            }).Where(value=>value.HasValue).Select(value=>value!.Value).ToList();
            actual=scores.Count==0?0:Math.Round(scores.Average(),2,MidpointRounding.AwayFromZero);
        }
        var target=Number(goal,"target");
        return new(item.Id,item.Title,metric,Text(goal,"cadence"),target,actual,target>0?Math.Round(actual/target*100,0,MidpointRounding.AwayFromZero):0,target>0&&actual>=target,
            Text(goal,"active")!="false",employee,department,Text(goal,"periodStart"),Text(goal,"periodEnd"))
            { FunnelId=scope.FunnelId, FunnelName=scope.FunnelName, ModuleName=scope.ModuleLabel };
    }
}
