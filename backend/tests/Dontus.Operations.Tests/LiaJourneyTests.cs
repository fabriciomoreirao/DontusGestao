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
        await Assert.ThrowsAsync<DomainException>(()=>service.UpdateWorkItemAsync(new(id,item.Title,"Outra pessoa",item.AmountCents,detail.ToJsonString(),null,null,item.Version),Editor));
        db.LiaFormRequests.Add(new LiaFormRequest{WorkItemId=id,FormName="Diagnóstico",CreatedBy="tests"});await db.SaveChangesAsync();
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

    [Fact]
    public async Task Final_conference_requires_three_days_then_approval_or_justified_rejection_and_keeps_audit_history()
    {
        await using var db=Context();var service=new OperationsService(db);var detail=Detail();detail["finalFollowupStartedAt"]=DateTimeOffset.UtcNow.ToString("O");
        var item=new WorkItem{Module="lia",RecordType="Projeto LIA",Title="Clínica",Owner="Ana",Status="AcompanhamentoFinal",Description=detail.ToJsonString(),CreatedBy="tests"};db.Add(item);await db.SaveChangesAsync();
        await Assert.ThrowsAsync<DomainException>(()=>service.TransitionWorkItemAsync(new(item.Id,"ConferenciaFinal",item.Version,true,true),Editor));
        detail["finalFollowupStartedAt"]=DateTimeOffset.UtcNow.AddDays(-3).ToString("O");item.Description=detail.ToJsonString();await db.SaveChangesAsync();
        await Assert.ThrowsAsync<DomainException>(()=>service.TransitionWorkItemAsync(new(item.Id,"Concluida",item.Version,true,true),Editor));
        await service.TransitionWorkItemAsync(new(item.Id,"ConferenciaFinal",item.Version,true),Editor);
        Assert.NotNull(JsonNode.Parse(item.Description)!["finalConferenceSentAt"]);
        var operatorActor=Editor with{Permissions=[new("lia",true,true,true,false,false)]};
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.TransitionWorkItemAsync(new(item.Id,"Concluida",item.Version,true),operatorActor))).StatusCode);
        await Assert.ThrowsAsync<DomainException>(()=>service.TransitionWorkItemAsync(new(item.Id,"AcompanhamentoFinal",item.Version,true),Editor));
        await service.TransitionWorkItemAsync(new(item.Id,"AcompanhamentoFinal",item.Version,true,Reason:"Ajustar configuração"),Editor);
        var rejected=JsonNode.Parse(item.Description)!;Assert.Equal("rejected",rejected["finalReviewDecision"]!.ToString());Assert.Equal("Ana",rejected["finalReviewedBy"]!.ToString());Assert.Contains(rejected["history"]!.AsArray(),entry=>entry?["text"]?.ToString().Contains("Ajustar configuração")==true);
        Assert.True(DateTimeOffset.Parse(rejected["finalFollowupStartedAt"]!.ToString())>DateTimeOffset.UtcNow.AddMinutes(-1));
        var next=rejected.AsObject();next["finalFollowupStartedAt"]=DateTimeOffset.UtcNow.AddDays(-3).ToString("O");item.Description=next.ToJsonString();await db.SaveChangesAsync();
        await service.TransitionWorkItemAsync(new(item.Id,"ConferenciaFinal",item.Version,true),Editor);
        await service.TransitionWorkItemAsync(new(item.Id,"Concluida",item.Version,true),Editor);
        var approved=JsonNode.Parse(item.Description)!;Assert.Equal("approved",approved["finalReviewDecision"]!.ToString());Assert.Equal(2,approved["finalReviews"]!.AsArray().Count);Assert.Equal("Concluida",item.Status);
    }

    [Fact]
    public async Task Conference_decision_metadata_cannot_be_forged_by_editing_description()
    {
        await using var db=Context();var service=new OperationsService(db);var detail=Detail();
        var item=new WorkItem{Module="lia",RecordType="Projeto LIA",Title="Clínica",Owner="Ana",Status="ConferenciaFinal",Description=detail.ToJsonString(),CreatedBy="tests"};db.Add(item);await db.SaveChangesAsync();
        detail["finalReviewedBy"]="Outra pessoa";detail["finalReviewDecision"]="approved";detail["finalReviews"]=new JsonArray(new JsonObject{["decision"]="approved"});
        await service.UpdateWorkItemAsync(new(item.Id,item.Title,item.Owner,0,detail.ToJsonString(),null,null,item.Version),Editor);
        var saved=JsonNode.Parse(item.Description)!;Assert.Null(saved["finalReviewedBy"]);Assert.Null(saved["finalReviews"]);
    }

    [Theory]
    [InlineData("Ana",true)]
    [InlineData("Gestora",false)]
    public async Task Only_current_responsible_can_reassign_an_existing_lia_client_even_with_management_permission(string name,bool allowed)
    {
        await using var db=Context();var service=new OperationsService(db);
        db.Users.AddRange(new AppUser{Email="ana@test",DisplayName="Ana",CreatedBy="tests"},new AppUser{Email="bia@test",DisplayName="Bia",CreatedBy="tests"});
        var item=new WorkItem{Module="lia",RecordType="Projeto LIA",Title="Clínica",Owner="Ana",Status="ConfiguracaoInicial",Description=Detail().ToJsonString(),CreatedBy="tests"};db.Add(item);await db.SaveChangesAsync();
        var actor=Editor with{DisplayName=name};var command=new UpdateWorkItemCommand(item.Id,item.Title,"Bia",0,item.Description,null,null,item.Version);
        if(!allowed){Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.UpdateWorkItemAsync(command,actor))).StatusCode);Assert.Equal("Ana",item.Owner);return;}
        await service.UpdateWorkItemAsync(command,actor);Assert.Equal("Bia",item.Owner);Assert.Contains(db.Activities,activity=>activity.Kind=="Responsável alterado"&&activity.Actor=="Ana");
        await Assert.ThrowsAsync<DomainException>(()=>service.UpdateWorkItemAsync(command with{Owner="Inexistente",Version=item.Version},Editor with{DisplayName="Bia"}));
    }

    [Fact]
    public async Task Initial_validation_queue_still_allows_coordination_to_assign_the_first_responsible()
    {
        await using var db=Context();var service=new OperationsService(db);db.Users.Add(new AppUser{Email="ana@test",DisplayName="Ana",CreatedBy="tests"});
        var item=new WorkItem{Module="lia",RecordType="Projeto LIA",Title="Clínica",Owner="Coordenação de LIA",Status="Validacao",Description=Detail().ToJsonString(),CreatedBy="tests"};db.Add(item);await db.SaveChangesAsync();
        Assert.Equal(409,(await Assert.ThrowsAsync<DomainException>(()=>service.UpdateWorkItemAsync(new(item.Id,item.Title,"Ana",0,item.Description,null,null,item.Version),Editor))).StatusCode);
        db.LiaFormRequests.Add(new LiaFormRequest{WorkItemId=item.Id,FormName="Diagnóstico",CreatedBy="tests"});await db.SaveChangesAsync();
        var detail=JsonNode.Parse(item.Description)!.AsObject();detail["validationConfirmedAt"]=DateTimeOffset.UtcNow.ToString("O");detail["validationConfirmedBy"]="Ana";
        await service.UpdateWorkItemAsync(new(item.Id,item.Title,item.Owner,0,detail.ToJsonString(),null,null,item.Version),Editor);
        await service.UpdateWorkItemAsync(new(item.Id,item.Title,"Ana",0,item.Description,null,null,item.Version),Editor);Assert.Equal("Ana",item.Owner);
    }
    [Theory]
    [InlineData("KickoffAgendado")]
    [InlineData("Concluida")]
    public async Task Commercial_entry_always_starts_unassigned_in_validation_and_discards_forged_confirmation(string status)
    {
        await using var db=Context();var service=new OperationsService(db);var detail=Detail();detail["sourceLeadId"]=Guid.NewGuid().ToString();detail["validationConfirmedAt"]="2020-01-01";detail["validationConfirmedBy"]="Vendedor";detail["importedCompleted"]=true;
        var id=await service.CreateWorkItemAsync(Create(detail,status,"Vendedor"),Editor);
        var item=await db.WorkItems.SingleAsync(x=>x.Id==id);Assert.Equal("Validacao",item.Status);Assert.Equal("Fila compartilhada",item.Owner);
        Assert.Null(JsonNode.Parse(item.Description)!["validationConfirmedAt"]);Assert.Equal("Performance",JsonNode.Parse(item.Description)!["liaPlan"]!.ToString());
    }
    [Fact]
    public async Task Link_then_check_then_assign_are_separate_persisted_steps_even_before_form_is_answered()
    {
        await using var db=Context();var service=new OperationsService(db);db.Users.Add(new AppUser{Email="bia@test",DisplayName="Bia",CreatedBy="tests"});await db.SaveChangesAsync();
        var detail=Detail();detail["sourceLeadId"]=Guid.NewGuid().ToString();var id=await service.CreateWorkItemAsync(Create(detail),Editor);var item=await db.WorkItems.SingleAsync(x=>x.Id==id);
        detail=JsonNode.Parse(item.Description)!.AsObject();detail["validationConfirmedAt"]="2020-01-01T00:00:00Z";detail["validationConfirmedBy"]="Forjado";
        Assert.Equal(409,(await Assert.ThrowsAsync<DomainException>(()=>service.UpdateWorkItemAsync(new(id,item.Title,item.Owner,item.AmountCents,detail.ToJsonString(),null,null,item.Version),Editor))).StatusCode);
        db.LiaFormRequests.Add(new LiaFormRequest{WorkItemId=id,FormName="Diagnóstico",CreatedBy="tests"});await db.SaveChangesAsync();
        Assert.Equal(409,(await Assert.ThrowsAsync<DomainException>(()=>service.UpdateWorkItemAsync(new(id,item.Title,"Bia",item.AmountCents,detail.ToJsonString(),null,null,item.Version),Editor))).StatusCode);
        await service.UpdateWorkItemAsync(new(id,item.Title,item.Owner,item.AmountCents,detail.ToJsonString(),null,null,item.Version),Editor);
        var saved=JsonNode.Parse(item.Description)!;Assert.Equal("Ana",saved["validationConfirmedBy"]!.ToString());Assert.True(DateTimeOffset.Parse(saved["validationConfirmedAt"]!.ToString())>DateTimeOffset.UtcNow.AddMinutes(-1));Assert.Equal("Fila compartilhada",item.Owner);
        await Assert.ThrowsAsync<DomainException>(()=>service.TransitionWorkItemAsync(new(id,"AguardandoKickoff",item.Version,true),Editor));
        await service.UpdateWorkItemAsync(new(id,item.Title,"Bia",item.AmountCents,item.Description,null,null,item.Version),Editor);
        await service.TransitionWorkItemAsync(new(id,"AguardandoKickoff",item.Version,true),Editor);Assert.Equal("AguardandoKickoff",item.Status);Assert.Equal("Bia",item.Owner);
        Assert.Null((await db.LiaFormRequests.SingleAsync()).SubmittedAt);
    }
    [Theory]
    [InlineData("whatsapp")]
    [InlineData("liaPlan")]
    [InlineData("sector")]
    [InlineData("clientId")]
    [InlineData("customerName")]
    public async Task Non_responsible_cannot_edit_client_data_even_with_management_permission(string field)
    {
        await using var db=Context();var service=new OperationsService(db);var detail=Detail();
        var item=new WorkItem{Module="lia",RecordType="Projeto LIA",Title="Clínica",CustomerName="Clínica",Owner="Ana",Status="ConfiguracaoInicial",Description=detail.ToJsonString(),CreatedBy="tests"};db.Add(item);await db.SaveChangesAsync();
        if(field!="customerName")detail[field]="Alterado";
        var command=new UpdateWorkItemCommand(item.Id,item.Title,item.Owner,0,detail.ToJsonString(),null,field=="customerName"?"Outro nome":item.CustomerName,item.Version);
        var manager=Editor with{DisplayName="Gestora"};Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.UpdateWorkItemAsync(command,manager))).StatusCode);
        Assert.Equal(1,item.Version);Assert.Equal("Clínica",item.CustomerName);
        await service.UpdateWorkItemAsync(command,Editor);Assert.Equal(2,item.Version);
    }
    [Fact]
    public async Task Responsible_edits_all_client_fields_and_can_transfer_ownership_in_the_same_save()
    {
        await using var db=Context();var service=new OperationsService(db);db.Users.Add(new AppUser{Email="bia@test",DisplayName="Bia",CreatedBy="tests"});var detail=Detail();
        var item=new WorkItem{Module="lia",RecordType="Projeto LIA",Title="Clínica",Owner="Ana",Status="ConfiguracaoInicial",Description=detail.ToJsonString(),CreatedBy="tests"};db.Add(item);await db.SaveChangesAsync();
        detail["whatsapp"]="5511999990000";detail["liaPlan"]="Growth";detail["sector"]="Indicação";
        await service.UpdateWorkItemAsync(new(item.Id,"Novo cliente","Bia",item.AmountCents,detail.ToJsonString(),null,"Novo cliente",item.Version),Editor);
        Assert.Equal("Novo cliente",item.Title);Assert.Equal("Novo cliente",item.CustomerName);Assert.Equal("Bia",item.Owner);Assert.Equal("Growth",JsonNode.Parse(item.Description)!["liaPlan"]!.ToString());
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.UpdateWorkItemAsync(new(item.Id,"Novo nome",item.Owner,0,item.Description,null,null,item.Version),Editor))).StatusCode);
    }

}
