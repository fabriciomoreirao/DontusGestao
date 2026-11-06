using System.Globalization;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Infrastructure;

public sealed partial class DontusIntegrationService
{
    private IQueryable<SupportAccessLog> FilterAccessHistory(SupportAccessHistoryQuery filter)
    {
        if(filter.From>filter.To)throw new DomainException("A data inicial deve ser anterior ou igual à data final.");
        if(filter.To==DateOnly.MaxValue)throw new DomainException("Informe uma data final válida para o histórico.");
        var query=db.SupportAccessLogs.AsNoTracking();
        if(filter.From is {} from){var start=LocalMidnight(from);query=query.Where(entry=>entry.AccessedAt>=start);}
        if(filter.To is {} to){var end=LocalMidnight(to.AddDays(1));query=query.Where(entry=>entry.AccessedAt<end);}
        if(!string.IsNullOrWhiteSpace(filter.Responsible)){var email=filter.Responsible.Trim().ToLowerInvariant();query=query.Where(entry=>entry.ActorEmail==email);}
        if(filter.ReasonId is {} reason)query=query.Where(entry=>entry.ReasonId==reason);
        if(!string.IsNullOrWhiteSpace(filter.Identification)){var identification=DontusApiClient.NormalizeIdentification(filter.Identification);query=query.Where(entry=>entry.Identification==identification);}
        return query;
    }

    public async Task<SupportAccessIndicatorsDto> GetAccessIndicatorsAsync(SupportAccessHistoryQuery filter,ActorContext actor,CancellationToken ct)
    {
        actor.RequirePermission("access","view");
        var query=FilterAccessHistory(filter);
        // Aggregate the entire selection. Only timestamps are materialized for local
        // calendar buckets; justification text and credentials never enter this view.
        var timestamps=await query.Select(entry=>entry.AccessedAt).ToArrayAsync(ct);
        var total=timestamps.Length;
        var clients=await query.Select(entry=>entry.Identification).Distinct().CountAsync(ct);
        var collaborators=await query.Select(entry=>entry.ActorEmail).Distinct().CountAsync(ct);
        var reasons=await query.Select(entry=>entry.ReasonName).Distinct().CountAsync(ct);
        var people=await query.GroupBy(entry=>entry.ActorEmail).Select(group=>new {Key=group.Key,Label=group.Max(entry=>entry.ActorName)??group.Key,Count=group.Count()})
            .OrderByDescending(entry=>entry.Count).ThenBy(entry=>entry.Label).Take(10).ToArrayAsync(ct);
        var reasonGroups=await query.GroupBy(entry=>entry.ReasonName).Select(group=>new {Key=group.Key,Label=group.Key,Count=group.Count()})
            .OrderByDescending(entry=>entry.Count).ThenBy(entry=>entry.Label).Take(10).ToArrayAsync(ct);
        var clientGroups=await query.GroupBy(entry=>entry.Identification).Select(group=>new {Key=group.Key,Label=(group.Max(entry=>entry.CustomerName)??"Cliente")+" · ID "+group.Key,Count=group.Count()})
            .OrderByDescending(entry=>entry.Count).ThenBy(entry=>entry.Label).Take(10).ToArrayAsync(ct);
        var zone=TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo");
        var local=timestamps.Select(time=>TimeZoneInfo.ConvertTime(time,zone)).ToArray();
        var today=DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow,zone).DateTime);
        var dates=local.Select(time=>DateOnly.FromDateTime(time.DateTime)).ToArray();
        var startDate=filter.From??(dates.Length>0?dates.Min():filter.To??today);
        var endDate=filter.To??(dates.Length>0?dates.Max():today);
        if(endDate<startDate)endDate=startDate;
        var days=endDate.DayNumber-startDate.DayNumber+1;
        var culture=CultureInfo.GetCultureInfo("pt-BR");
        var granularity=days<=62?"day":days<=1096?"month":"year";
        string Key(DateOnly day)=>day.ToString(granularity=="day"?"yyyy-MM-dd":granularity=="month"?"yyyy-MM":"yyyy",CultureInfo.InvariantCulture);
        var grouped=dates.GroupBy(Key).ToDictionary(group=>group.Key,group=>group.Count());
        var trend=new List<SupportAccessMetricDto>();
        var point=granularity=="day"?startDate:granularity=="month"?new DateOnly(startDate.Year,startDate.Month,1):new DateOnly(startDate.Year,1,1);
        while(point<=endDate)
        {
            var key=Key(point);
            var label=point.ToString(granularity=="day"?"dd/MM":granularity=="month"?"MMM/yy":"yyyy",culture);
            trend.Add(new(key,label,grouped.GetValueOrDefault(key)));
            if(granularity=="day"&&point==endDate||granularity=="month"&&point.Year==endDate.Year&&point.Month==endDate.Month||granularity=="year"&&point.Year==endDate.Year)break;
            point=granularity=="day"?point.AddDays(1):granularity=="month"?point.AddMonths(1):point.AddYears(1);
        }
        var hours=Enumerable.Range(0,24).Select(hour=>new SupportAccessMetricDto(hour.ToString(),$"{hour:00}h",local.Count(time=>time.Hour==hour))).ToArray();
        var weekdays=Enumerable.Range(0,7).Select(index=>new SupportAccessMetricDto(index.ToString(),culture.DateTimeFormat.GetAbbreviatedDayName((DayOfWeek)index),local.Count(time=>(int)time.DayOfWeek==index))).ToArray();
        return new(total,clients,collaborators,reasons,Math.Round(total/(decimal)days,2),dates.Distinct().Count(),startDate,endDate,
            total>0?timestamps.Min():null,total>0?timestamps.Max():null,granularity,trend,
            WithRemainder(people.Select(entry=>new SupportAccessMetricDto(entry.Key,entry.Label,entry.Count)).ToArray(),total,"Demais responsáveis"),
            WithRemainder(reasonGroups.Select(entry=>new SupportAccessMetricDto(entry.Key,entry.Label,entry.Count)).ToArray(),total,"Demais motivos"),
            WithRemainder(clientGroups.Select(entry=>new SupportAccessMetricDto(entry.Key,entry.Label,entry.Count)).ToArray(),total,"Demais clientes"),hours,weekdays);
    }

    private static IReadOnlyList<SupportAccessMetricDto> WithRemainder(SupportAccessMetricDto[] entries,int total,string label)
    {
        var remaining=total-entries.Sum(entry=>entry.Count);
        return remaining>0?[..entries,new("__others",label,remaining)]:entries;
    }
}
