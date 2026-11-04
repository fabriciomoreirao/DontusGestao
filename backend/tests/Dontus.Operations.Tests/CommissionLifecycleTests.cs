using System.Text.Json;
using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class CommissionLifecycleTests
{
    private static OperationsDbContext Context()=>new(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static ActorContext Manager()=>new("manager@test","Coordenador","Coordenação","CS",[new("commissions",true,false,false,true,true),new("cs",true,true,true,false,false),new("lia",true,true,true,false,false)]);
    private static CreateWorkItemCommand Source(string description,string module="cs")=>new(module,"Acompanhamento","Clínica",null,"Clínica","Ana Ribeiro","CS","P3",null,null,100000,description,[],null,null,"Em acompanhamento");
    private static CreateWorkItemCommand Commission(Guid source,string scope="cs",long value=100000)=>new("commissions","Comissão","Clínica",null,"Clínica","Ana Ribeiro","CS","P3",null,null,999999,
        JsonSerializer.Serialize(new{kind="commissionRecord",sourceId=source,sourceKey=source.ToString(),scope,competence="1999-01",employeeId="",employeeName="Ana Ribeiro",customerName="Clínica",product="Acompanhamento",saleValueCents=value,score=120,decision="pending",reason="",ruleLabel="Regra não configurada",commissionCents=999999}),[],null,null,"Pendente");

    [Theory]
    [InlineData("cs")]
    [InlineData("lia")]
    public async Task Base_value_is_saved_and_recalculated_with_the_source_start_month_and_requires_new_approval(string scope)
    {
        await using var db=Context();var service=new OperationsService(db);var actor=Manager();
        await service.SaveCustomerCatalogAsync(null,"commissionRule","Regra da Ana",JsonSerializer.Serialize(new{scope,employeeName=" Ána   Ribeiro ",product="*",type="percentage",value=15}),true,actor);
        var source=await service.CreateWorkItemAsync(Source(JsonSerializer.Serialize(new{kind=scope=="cs"?"csJourney":"liaJourney",phase="tracking",track="activation",startDate="2025-12-31"}),scope),actor);
        var id=await service.CreateWorkItemAsync(Commission(source,scope),actor);var item=await db.WorkItems.SingleAsync(x=>x.Id==id);
        var detail=JsonNode.Parse(item.Description)!.AsObject();
        Assert.Equal("2025-12",detail["competence"]!.ToString());Assert.Contains("15%",detail["ruleLabel"]!.ToString());Assert.Equal(0,item.AmountCents);
        detail["decision"]="approved";detail["reason"]="Valores conferidos";
        await service.UpdateWorkItemAsync(new(id,item.Title,item.Owner,999999,detail.ToJsonString(),null,null,item.Version),actor);
        Assert.Equal(15000,item.AmountCents);Assert.Equal("Aprovada",item.Status);
        detail=JsonNode.Parse(item.Description)!.AsObject();detail["saleValueCents"]=200000;detail["decision"]="pending";
        await service.UpdateWorkItemAsync(new(id,item.Title,item.Owner,999999,detail.ToJsonString(),null,null,item.Version),actor);
        detail=JsonNode.Parse(item.Description)!.AsObject();Assert.Equal(0,item.AmountCents);Assert.Equal("Pendente",item.Status);
        Assert.Contains("300,00",detail["ruleLabel"]!.ToString());Assert.Equal("",detail["decidedBy"]!.ToString());
        Assert.Equal("Coordenador",detail["baseValueEditedBy"]!.ToString());
        detail["decision"]="approved";detail["reason"]="Novo valor conferido";
        await service.UpdateWorkItemAsync(new(id,item.Title,item.Owner,0,detail.ToJsonString(),null,null,item.Version),actor);Assert.Equal(30000,item.AmountCents);
        detail=JsonNode.Parse(item.Description)!.AsObject();detail["saleValueCents"]=0;detail["decision"]="pending";
        await service.UpdateWorkItemAsync(new(id,item.Title,item.Owner,0,detail.ToJsonString(),null,null,item.Version),actor);
        Assert.Equal(0,JsonNode.Parse(item.Description)!["saleValueCents"]!.GetValue<long>());Assert.Equal(0,item.AmountCents);
    }

    [Theory]
    [InlineData("validation")]
    [InlineData("onboarding")]
    public async Task Clients_before_tracking_cannot_generate_commission(string phase)
    {
        await using var db=Context();var service=new OperationsService(db);var actor=Manager();
        var source=await service.CreateWorkItemAsync(Source(JsonSerializer.Serialize(new{kind="csJourney",phase,track="activation",startDate="2025-01-01"})),actor);
        Assert.Equal(400,(await Assert.ThrowsAsync<DomainException>(()=>service.CreateWorkItemAsync(Commission(source),actor))).StatusCode);
    }

    [Fact]
    public async Task Forwarding_uses_the_current_tracking_date_and_manual_date_edits_update_competence()
    {
        await using var db=Context();var service=new OperationsService(db);var actor=Manager();
        var source=await service.CreateWorkItemAsync(Source("{\"kind\":\"csJourney\",\"phase\":\"onboarding\",\"track\":\"retention\",\"startDate\":\"2025-01-01\"}"),actor);
        var item=await db.WorkItems.SingleAsync(x=>x.Id==source);var detail=JsonNode.Parse(item.Description)!.AsObject();
        detail["phase"]="tracking";detail["trackingStartedAt"]="2025-01-02T00:00:00-03:00";
        await service.UpdateWorkItemAsync(new(source,item.Title,item.Owner,0,detail.ToJsonString(),null,null,item.Version),actor);
        var tracking=DateTimeOffset.Parse(JsonNode.Parse(item.Description)!["trackingStartedAt"]!.ToString());
        Assert.InRange(tracking,DateTimeOffset.UtcNow.AddMinutes(-1),DateTimeOffset.UtcNow.AddMinutes(1));
        var record=await service.CreateWorkItemAsync(Commission(source),actor);
        Assert.Equal(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(tracking,"America/Sao_Paulo").ToString("yyyy-MM"),JsonNode.Parse((await db.WorkItems.SingleAsync(x=>x.Id==record)).Description)!["competence"]!.ToString());
        detail=JsonNode.Parse(item.Description)!.AsObject();detail["startDate"]="2025-02-15";
        await service.UpdateWorkItemAsync(new(source,item.Title,item.Owner,0,detail.ToJsonString(),null,null,item.Version),actor);
        Assert.Equal("2025-02-15T00:00:00-03:00",JsonNode.Parse(item.Description)!["trackingStartedAt"]!.ToString());
    }

    [Fact]
    public async Task Invalid_values_and_future_start_dates_are_rejected()
    {
        await using var db=Context();var service=new OperationsService(db);var actor=Manager();
        var source=await service.CreateWorkItemAsync(Source("{\"kind\":\"csJourney\",\"phase\":\"tracking\",\"startDate\":\"2025-01-01\"}"),actor);
        foreach(var value in new long[]{-1,100000000001})Assert.Equal(400,(await Assert.ThrowsAsync<DomainException>(()=>service.CreateWorkItemAsync(Commission(source,value:value),actor))).StatusCode);
        Assert.Equal(400,(await Assert.ThrowsAsync<DomainException>(()=>service.CreateWorkItemAsync(Source("{\"kind\":\"csJourney\",\"phase\":\"tracking\",\"trackingStartedAt\":\"2099-01-01T00:00:00Z\"}"),actor))).StatusCode);
        var invalidLia=await service.CreateWorkItemAsync(Source("{\"kind\":\"liaJourney\",\"startDate\":\"2026-02-30\"}","lia"),actor);
        Assert.Equal(400,(await Assert.ThrowsAsync<DomainException>(()=>service.CreateWorkItemAsync(Commission(invalidLia,"lia"),actor))).StatusCode);
        var denied=actor with{Permissions=[new("commissions",true,true,true,false,false)]};
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.CreateWorkItemAsync(Commission(source),denied))).StatusCode);
    }
}
