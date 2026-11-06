using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Dontus.Operations.Tests;

public sealed class SupportAccessIndicatorsTests
{
    private static readonly ActorContext Viewer=new("ana@example.test","Ana","Analista","Suporte",[new("access",true,false,false,false,false)]);
    private static OperationsDbContext Context()=>new(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static DontusIntegrationService Service(OperationsDbContext db)=>new(db,new DontusApiClient(new HttpClient(),Options.Create(new DontusIntegrationOptions{ClientsToken="test",UsersToken="test"})));
    private static SupportAccessLog Log(string at,string actor="ana@example.test",string client="123456",string reason="Suporte")=>new(){AccessedAt=DateTimeOffset.Parse(at),ActorEmail=actor,ActorName=actor.Split('@')[0],Identification=client,CustomerName="Cliente "+client,TargetUserId=1,TargetUserName="Usuário acessado",ReasonId=Guid.NewGuid(),ReasonName=reason,Justification="Descrição privada do atendimento"};

    [Fact]
    public async Task Indicators_cover_all_filtered_rows_and_use_inclusive_Brasilia_days()
    {
        await using var db=Context();
        for(var i=0;i<25;i++)db.SupportAccessLogs.Add(Log("2026-11-05T15:00:00Z",i%2==0?Viewer.Email:"bia@example.test",(123456+i%3).ToString(),i%2==0?"Suporte":"Apresentação"));
        db.SupportAccessLogs.Add(Log("2026-11-06T02:59:59Z"));
        db.SupportAccessLogs.Add(Log("2026-11-06T03:00:00Z"));await db.SaveChangesAsync();
        var service=Service(db);var filter=new SupportAccessHistoryQuery(new(2026,11,5),new(2026,11,5),Page:2);
        var history=System.Text.Json.JsonSerializer.SerializeToElement(await service.GetAccessHistoryAsync(filter,Viewer,default));
        Assert.Equal(6,history.GetProperty("entries").GetArrayLength());
        var data=await service.GetAccessIndicatorsAsync(filter,Viewer,default);
        Assert.Equal(26,data.Total);Assert.Equal(3,data.Clients);Assert.Equal(2,data.Collaborators);Assert.Equal(2,data.Reasons);
        Assert.Equal(26,Assert.Single(data.Trend).Count);Assert.Equal(1,data.ByHour.Single(entry=>entry.Key=="23").Count);
        Assert.Equal(26,data.ByResponsible.Sum(entry=>entry.Count));Assert.Equal(26,data.ByClient.Sum(entry=>entry.Count));Assert.Equal(26,data.ByReason.Sum(entry=>entry.Count));
        Assert.DoesNotContain("Descrição privada",System.Text.Json.JsonSerializer.Serialize(data));
        var range=await service.GetAccessIndicatorsAsync(new(new(2026,11,4),new(2026,11,6)),Viewer,default);
        Assert.Equal(3,range.Trend.Count);Assert.Equal(0,range.Trend[0].Count);Assert.Equal(27,range.Total);Assert.Equal(9,range.AveragePerDay);
    }
    [Fact]
    public async Task Filters_combine_and_the_access_permission_is_required()
    {
        await using var db=Context();var wanted=Log("2026-11-06T03:00:00Z");db.SupportAccessLogs.Add(wanted);
        db.SupportAccessLogs.Add(Log("2026-11-06T04:00:00Z","bia@example.test"));db.SupportAccessLogs.Add(Log("2026-11-06T04:00:00Z",client:"456789"));await db.SaveChangesAsync();
        var service=Service(db);var filter=new SupportAccessHistoryQuery(new(2026,11,6),new(2026,11,6)," ANA@EXAMPLE.TEST ",wanted.ReasonId,"123456");
        Assert.Equal(1,(await service.GetAccessIndicatorsAsync(filter,Viewer,default)).Total);
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.GetAccessIndicatorsAsync(filter,Viewer with{Permissions=[]},default))).StatusCode);
        Assert.Equal(400,(await Assert.ThrowsAsync<DomainException>(()=>service.GetAccessIndicatorsAsync(new(new(2026,11,7),new(2026,11,6)),Viewer,default))).StatusCode);
        Assert.Equal(400,(await Assert.ThrowsAsync<DomainException>(()=>service.GetAccessIndicatorsAsync(new(To:DateOnly.MaxValue),Viewer,default))).StatusCode);
    }
    [Fact]
    public async Task Empty_periods_have_zero_totals_and_no_invented_accesses()
    {
        await using var db=Context();var data=await Service(db).GetAccessIndicatorsAsync(new(new(2026,11,1),new(2026,11,3)),Viewer,default);
        Assert.Equal(0,data.Total);Assert.Equal(0,data.AveragePerDay);Assert.Equal(3,data.Trend.Count);Assert.All(data.Trend,entry=>Assert.Equal(0,entry.Count));Assert.Null(data.FirstAccessAt);Assert.Null(data.LastAccessAt);Assert.Empty(data.ByResponsible);Assert.Equal(24,data.ByHour.Count);
    }
    [Fact]
    public async Task Long_periods_change_granularity_and_rankings_preserve_the_remainder()
    {
        await using var db=Context();for(var i=0;i<12;i++)db.SupportAccessLogs.Add(Log("2026-11-05T15:00:00Z",$"person{i}@example.test",(123456+i).ToString(),$"Motivo {i}"));await db.SaveChangesAsync();
        var data=await Service(db).GetAccessIndicatorsAsync(new(new(2023,1,1),new(2026,12,31)),Viewer,default);
        Assert.Equal("year",data.Granularity);Assert.Equal(4,data.Trend.Count);Assert.Equal(12,data.Total);Assert.Equal(12,data.Clients);
        Assert.Equal(11,data.ByClient.Count);Assert.Equal(12,data.ByClient.Sum(entry=>entry.Count));Assert.Contains(data.ByClient,entry=>entry.Key=="__others"&&entry.Count==2);
        Assert.Equal(12,data.ByResponsible.Sum(entry=>entry.Count));Assert.Equal(12,data.ByReason.Sum(entry=>entry.Count));
    }
}
