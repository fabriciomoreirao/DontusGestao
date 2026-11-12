using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class LiaJourneyTests
{
    private static ActorContext Editor => new("ana@test", "Ana", "Colaborador", "LIA", [new("lia", true, true, true, false, true)]);
    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static JsonObject Detail() => new() { ["kind"]="liaJourney", ["clientId"]="123456", ["liaPlan"]="Performance", ["startDate"]="2026-10-01" };
    private static CreateWorkItemCommand Create(JsonObject detail, string? status = null, string owner = "Ana") => new("lia","Projeto LIA","Clínica",null,"Clínica",owner,"LIA","P3",null,null,14990,detail.ToJsonString(),[],null,null,status);

    [Fact]
    public async Task New_client_starts_in_validation_and_requires_conference_and_active_responsible_before_onboarding()
    {
        await using var db=Context();var service=new OperationsService(db);
        db.Users.Add(new AppUser{Email="ana@test",DisplayName="Ana",CreatedBy="tests"});await db.SaveChangesAsync();
        var id=await service.CreateWorkItemAsync(Create(Detail(),"KickoffAgendado"),Editor);
        var item=await db.WorkItems.SingleAsync(entry=>entry.Id==id);Assert.Equal("Validacao",item.Status);
        Assert.Equal(409,(await Assert.ThrowsAsync<DomainException>(()=>service.TransitionWorkItemAsync(new(id,"AguardandoKickoff",item.Version,true,true),Editor))).StatusCode);
        var detail=JsonNode.Parse(item.Description)!.AsObject();detail["validationConfirmedAt"]=DateTimeOffset.UtcNow.ToString("O");detail["validationConfirmedBy"]="Ana";
        await service.UpdateWorkItemAsync(new(id,item.Title,"Outra pessoa",item.AmountCents,detail.ToJsonString(),null,null,item.Version),Editor);
        Assert.Equal(409,(await Assert.ThrowsAsync<DomainException>(()=>service.TransitionWorkItemAsync(new(id,"AguardandoKickoff",item.Version,true,true),Editor))).StatusCode);
        await service.UpdateWorkItemAsync(new(id,item.Title,"Ana",item.AmountCents,detail.ToJsonString(),null,null,item.Version),Editor);
        Assert.Equal(409,(await Assert.ThrowsAsync<DomainException>(()=>service.TransitionWorkItemAsync(new(id,"ConfiguracaoInicial",item.Version,true,true),Editor))).StatusCode);
        await service.TransitionWorkItemAsync(new(id,"AguardandoKickoff",item.Version,true),Editor);
        Assert.Equal("AguardandoKickoff",item.Status);Assert.Equal("Performance",JsonNode.Parse(item.Description)!["liaPlan"]!.ToString());
        await service.TransitionWorkItemAsync(new(id,"Validacao",item.Version,true,true),Editor);
        Assert.Null(JsonNode.Parse(item.Description)!["validationConfirmedAt"]);
    }

    [Fact]
    public async Task Commercial_route_requires_a_plan_and_can_recover_it_from_lia_products()
    {
        await using var db=Context();var service=new OperationsService(db);var detail=Detail();detail.Remove("liaPlan");detail["sourceLeadId"]=Guid.NewGuid().ToString();
        Assert.Contains("plano",(await Assert.ThrowsAsync<DomainException>(()=>service.CreateWorkItemAsync(Create(detail),Editor))).Message);
        detail["products"]=new JsonArray(new JsonObject{["product"]="LIA",["plan"]="Growth"});
        var id=await service.CreateWorkItemAsync(Create(detail),Editor);
        Assert.Equal("Growth",JsonNode.Parse((await db.WorkItems.SingleAsync(entry=>entry.Id==id)).Description)!["liaPlan"]!.ToString());
    }

    [Fact]
    public async Task Completed_import_preserves_start_value_plan_and_does_not_enable_bypassing_final_followup()
    {
        await using var db=Context();var service=new OperationsService(db);db.Users.Add(new AppUser{Email="ana@test",DisplayName="Ana",CreatedBy="tests"});await db.SaveChangesAsync();
        var detail=Detail();detail["importedCompleted"]=true;
        var id=await service.CreateWorkItemAsync(Create(detail,"Concluida"),Editor);
        var item=await db.WorkItems.SingleAsync(entry=>entry.Id==id);var saved=JsonNode.Parse(item.Description)!;
        Assert.Equal("Concluida",item.Status);Assert.Equal(14990,item.AmountCents);Assert.Equal("2026-10-01",saved["startDate"]!.ToString());Assert.NotNull(saved["completedAt"]);
        await service.TransitionWorkItemAsync(new(id,"AcompanhamentoFinal",item.Version,true,true),Editor);
        Assert.Equal(409,(await Assert.ThrowsAsync<DomainException>(()=>service.TransitionWorkItemAsync(new(id,"Concluida",item.Version,true,true),Editor))).StatusCode);
    }

    [Theory]
    [InlineData("liaPlan", "")]
    [InlineData("clientId", "123")]
    [InlineData("startDate", "2099-01-01")]
    [InlineData("startDate", "invalid")]
    public async Task Completed_import_rejects_invalid_or_missing_fields(string field,string value)
    {
        await using var db=Context();var service=new OperationsService(db);db.Users.Add(new AppUser{Email="ana@test",DisplayName="Ana",CreatedBy="tests"});await db.SaveChangesAsync();
        var detail=Detail();detail["importedCompleted"]=true;detail[field]=value;
        await Assert.ThrowsAsync<DomainException>(()=>service.CreateWorkItemAsync(Create(detail,"Concluida"),Editor));Assert.Empty(db.WorkItems);
    }

    [Fact]
    public async Task Repeated_client_id_is_rejected_including_completed_cards()
    {
        await using var db=Context();var service=new OperationsService(db);
        await service.CreateWorkItemAsync(Create(Detail()),Editor);
        Assert.Equal(409,(await Assert.ThrowsAsync<DomainException>(()=>service.CreateWorkItemAsync(Create(Detail()),Editor))).StatusCode);Assert.Single(db.WorkItems);
    }

    [Fact]
    public async Task Lia_viewer_sees_other_responsibles_clients_and_lia_manager_configures_without_admin_or_hr_permission()
    {
        await using var db=Context();var service=new OperationsService(db);
        db.WorkItems.AddRange(new WorkItem{Module="lia",RecordType="Projeto LIA",Title="Cliente de outro responsável",Owner="Outra pessoa",Status="AguardandoKickoff",CreatedBy="other"},new WorkItem{Module="lia",RecordType="Projeto LIA",Title="Cliente antigo",Owner="Outra pessoa",Status="EmTesteCliente",CreatedBy="other",CreatedAt=DateTimeOffset.Parse("2026-01-01T12:00:00Z")});await db.SaveChangesAsync();
        var viewer=Editor with { Permissions=[new("lia",true,false,false,false,false)] };
        Assert.Equal(2,(await service.GetSnapshotAsync(viewer)).Items.Count);
        Assert.False(Editor.HasPermission("admin","view"));Assert.False(Editor.HasPermission("hr","view"));
        await service.SaveCustomerCatalogAsync(null,"liaPlan","Growth","",true,Editor);
        Assert.Contains((await service.GetCustomerModuleAsync(Editor)).Catalogs,entry=>entry.Name=="Growth");
        var forms=new LiaFormService(db,new EphemeralDataProtectionProvider());
        await forms.SaveFormAsync(new(null,"Diagnóstico","",true,[new("name","Nome","text",true,[])],null),Editor,default);
        Assert.Single(await forms.ListFormsAsync(Editor,default));
        await Assert.ThrowsAsync<DomainException>(()=>service.SaveCustomerCatalogAsync(null,"liaPlan","Performance","",true,viewer));
    }
}
