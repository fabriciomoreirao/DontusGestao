using System.Text.Json;
using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class CommercialAndLiaCommissionTests
{
    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static ActorContext Manager => new("manager@test", "Gestora", "Coordenação", "LIA", [new("commissions", true, true, true, true, true), new("commercial", true, true, true, false, false), new("lia", true, true, true, true, true)]);
    private static WorkItem Sale(long cents, string seller = "Ana", string stamp = "2026-10-15T12:00:00Z", string type = "Lead comercial") => new() {
        Module = "commercial", RecordType = type, Title = "Clínica", CustomerName = "Clínica", Owner = seller, Status = "Ganho", AmountCents = cents, CreatedBy = "test",
        UpdatedAt = DateTimeOffset.Parse("2026-11-10T12:00:00Z"), Description = JsonSerializer.Serialize(new { kind = "commercialLead", stage = "Ganho", seller, wonAt = stamp }) };
    private static async Task Rules(OperationsDbContext db)
    {
        foreach (var name in new[] { "Ana", "Bruno" })
        {
            var user = new AppUser { Email = name + "@test", DisplayName = name, CreatedBy = "test" }; db.Users.Add(user);
            db.CustomerCatalogOptions.Add(new CustomerCatalogOption { Catalog = "commissionRule", Name = "Comercial " + name, Description = JsonSerializer.Serialize(new {
                kind = "commissionRule", scope = "commercial", employeeId = user.Id, employeeName = name, product = "*", type = "percentage", value = 0,
                salesTiers = new object[] { new { minCents = 0, maxCents = (int?)300000, percentage = 35 }, new { minCents = 300000, maxCents = (int?)450000, percentage = 40 }, new { minCents = 450000, maxCents = (int?)null, percentage = 50 } } }) });
        }
        await db.SaveChangesAsync();
    }
    private static CreateWorkItemCommand Commission(WorkItem source, string scope = "commercial", string decision = "approved") => new("commissions", "Comissão", "Clínica", null, "Clínica", source.Owner, "Comercial", "P3", null, null, 999999,
        JsonSerializer.Serialize(new { kind = "commissionRecord", sourceId = source.Id, sourceKey = source.Id.ToString(), scope, competence = "1999-01", employeeName = source.Owner,
            employeeId = "", customerName = "Clínica", product = "Dontus", saleValueCents = scope == "lia" ? source.AmountCents : 999999, decision, reason = "Valores conferidos" }), [], null, null, "Pendente");

    [Theory]
    [InlineData(299999, 105000)] [InlineData(300000, 120000)] [InlineData(449999, 180000)] [InlineData(450000, 225000)]
    public async Task Commercial_bands_apply_to_all_sales_of_the_employee_by_win_month(long total, long payout)
    {
        await using var db = Context(); await Rules(db);
        var first = Sale(total / 2); var second = Sale(total - total / 2); var otherEmployee = Sale(900000, "Bruno");
        db.WorkItems.AddRange(first, second, otherEmployee, Sale(900000, stamp:"2026-09-30T12:00:00Z"), Sale(900000, type:"Lead de retenção")); await db.SaveChangesAsync();
        var service = new OperationsService(db); long approved = 0;
        foreach (var source in new[] { first, second })
        {
            var id = await service.CreateWorkItemAsync(Commission(source), Manager); var record = await db.WorkItems.SingleAsync(x => x.Id == id);
            var detail = JsonNode.Parse(record.Description)!;
            Assert.Equal("2026-10", detail["competence"]!.ToString()); Assert.Equal(total, detail["monthlySalesCents"]!.GetValue<long>());
            Assert.Equal(source.AmountCents, detail["saleValueCents"]!.GetValue<long>()); Assert.NotEmpty(detail["employeeId"]!.ToString());
            approved += record.AmountCents;
        }
        Assert.Equal(payout, approved);
    }

    [Fact]
    public async Task Custom_won_stage_is_counted_and_ordinary_edits_keep_the_original_win_date()
    {
        await using var db = Context(); await Rules(db); var service = new OperationsService(db);
        db.CustomerCatalogOptions.Add(new CustomerCatalogOption { Catalog = "funnelStage", Name = "Principal", Description = "{\"f\":\"c\",\"s\":[[\"Contrato aceito\",\"blue\",1]]}" });
        var source = Sale(50000, stamp:"2026-11-01T02:30:00Z");
        source.Status = "Contrato aceito"; var d = JsonNode.Parse(source.Description)!.AsObject(); d["stage"] = source.Status; d["funnel"] = "Principal"; source.Description = d.ToJsonString(); db.WorkItems.Add(source); await db.SaveChangesAsync();
        await service.UpdateWorkItemAsync(new(source.Id,source.Title,source.Owner,source.AmountCents,source.Description,null,null,source.Version),Manager);
        Assert.Equal("2026-11-01T02:30:00Z", JsonNode.Parse(source.Description)!["wonAt"]!.ToString());
        var id = await service.CreateWorkItemAsync(Commission(source), Manager);
        Assert.Equal("2026-10", JsonNode.Parse((await db.WorkItems.SingleAsync(x => x.Id == id)).Description)!["competence"]!.ToString());
    }

    [Fact]
    public async Task Changed_monthly_band_requires_review_before_confirmation_and_signature()
    {
        await using var db = Context(); await Rules(db); var first = Sale(200000); db.WorkItems.Add(first); await db.SaveChangesAsync();
        var operations = new OperationsService(db); var id = await operations.CreateWorkItemAsync(Commission(first), Manager); var record = await db.WorkItems.SingleAsync(x => x.Id == id);
        var confirmations = new CommissionConfirmationService(db,new EphemeralDataProtectionProvider());
        await confirmations.GenerateAsync(new("commissions","commercial","2026-10",[new(id,record.Version)],null),Manager,default);
        db.WorkItems.Add(Sale(100000)); await db.SaveChangesAsync();
        var error = await Assert.ThrowsAsync<DomainException>(()=>confirmations.GenerateAsync(new("commissions","commercial","2026-10",[new(id,record.Version)],null),Manager,default));
        Assert.Equal(409,error.StatusCode); Assert.Contains("total mensal",error.Message);
    }

    [Fact]
    public async Task Lia_onboarding_is_commissioned_per_client_and_stages_are_in_the_signature_snapshot()
    {
        await using var db = Context(); var service = new OperationsService(db); var user = new AppUser { Email="Ana@test",DisplayName="Ana",CreatedBy="test" }; db.Users.Add(user);
        await service.SaveCustomerCatalogAsync(null,"commissionRule","LIA Ana",JsonSerializer.Serialize(new{scope="lia",employeeId=user.Id,employeeName="Ana",product="*",type="percentage",value=50}),true,Manager);
        var source = new WorkItem { Module="lia",RecordType="Projeto LIA",Title="Clínica",CustomerName="Clínica",Owner="Ana",Status="AguardandoKickoff",CreatedBy="test",AmountCents=50000,CreatedAt=DateTimeOffset.Parse("2026-11-01T02:30:00Z"),Description="{\"kind\":\"liaJourney\"}" };db.WorkItems.Add(source);await db.SaveChangesAsync();
        var id=await service.CreateWorkItemAsync(Commission(source,"lia"),Manager);var record=await db.WorkItems.SingleAsync(x=>x.Id==id);var detail=JsonNode.Parse(record.Description)!;
        Assert.Equal("2026-10",detail["competence"]!.ToString());Assert.Equal(25000,record.AmountCents);Assert.Equal("Pendente",detail["liaStages"]!["configuration"]!.ToString());
        var confirmations=new CommissionConfirmationService(db,new EphemeralDataProtectionProvider());
        await confirmations.GenerateAsync(new("commissions","lia","2026-10",[new(id,record.Version)],null),Manager,default);
        var snapshot=JsonNode.Parse((await db.CommissionConfirmations.SingleAsync()).SnapshotJson)!;
        Assert.Equal("Onboarding",snapshot["Rows"]![0]!["LiaStages"]!["current"]!.ToString());
        Assert.Equal(25000,snapshot["TotalCents"]!.GetValue<long>());
    }

    [Fact]
    public async Task Lia_final_followup_cannot_be_skipped_or_backdated_and_finishes_after_three_days()
    {
        await using var db=Context();var service=new OperationsService(db);var source=new WorkItem{Module="lia",RecordType="Projeto LIA",Title="Clínica",Status="ConfigurandoCRC",CreatedBy="test",Description="{\"kind\":\"liaJourney\"}"};db.WorkItems.Add(source);await db.SaveChangesAsync();
        Assert.Equal(409,(await Assert.ThrowsAsync<DomainException>(()=>service.TransitionWorkItemAsync(new(source.Id,"Concluida",source.Version,true,true),Manager))).StatusCode);
        await service.TransitionWorkItemAsync(new(source.Id,"AcompanhamentoFinal",source.Version,true),Manager);
        Assert.Equal(409,(await Assert.ThrowsAsync<DomainException>(()=>service.TransitionWorkItemAsync(new(source.Id,"Concluida",source.Version,true),Manager))).StatusCode);
        var detail=JsonNode.Parse(source.Description)!.AsObject();var started=detail["finalFollowupStartedAt"]!.ToString();detail["finalFollowupStartedAt"]="2025-01-01T12:00:00Z";
        await service.UpdateWorkItemAsync(new(source.Id,source.Title,source.Owner,0,detail.ToJsonString(),null,null,source.Version),Manager);
        Assert.Equal(started,JsonNode.Parse(source.Description)!["finalFollowupStartedAt"]!.ToString());
        detail=JsonNode.Parse(source.Description)!.AsObject();detail["finalFollowupStartedAt"]=DateTimeOffset.UtcNow.AddDays(-3).ToString("O");source.Description=detail.ToJsonString();await db.SaveChangesAsync();
        await service.TransitionWorkItemAsync(new(source.Id,"Concluida",source.Version,true),Manager);Assert.Equal("Concluida",source.Status);
    }

    [Theory]
    [InlineData(false)] [InlineData(true)]
    public async Task Only_lia_coordinators_can_delete_cards_with_submitted_forms(bool submitted)
    {
        await using var db=Context();var service=new OperationsService(db);var source=new WorkItem{Module="lia",RecordType="Projeto LIA",Title="Clínica",Status="AguardandoKickoff",CreatedBy="test"};db.WorkItems.Add(source);
        db.LiaFormRequests.Add(new LiaFormRequest{WorkItemId=source.Id,FormId=Guid.NewGuid(),SubmittedAt=submitted?DateTimeOffset.UtcNow:null});await db.SaveChangesAsync();
        var editor=Manager with {Role="Coordenador",Permissions=[new("lia",true,true,true,false,false)]};
        if(submitted){Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.DeleteWorkItemAsync(source.Id,editor))).StatusCode);Assert.Single(db.LiaFormRequests);await service.DeleteWorkItemAsync(source.Id,Manager);}
        else await service.DeleteWorkItemAsync(source.Id,editor);
        Assert.Empty(db.WorkItems);Assert.Empty(db.LiaFormRequests);
    }

    [Theory]
    [InlineData("commercial")] [InlineData("lia")]
    public async Task Individual_settings_reject_fixed_amounts_and_invalid_sales_bands(string scope)
    {
        await using var db=Context();var service=new OperationsService(db);
        Assert.Equal(400,(await Assert.ThrowsAsync<DomainException>(()=>service.SaveCustomerCatalogAsync(null,"commissionRule","Inválida",JsonSerializer.Serialize(new{scope,employeeName="Ana",type="fixed",value=50}),true,Manager))).StatusCode);
        var invalid=JsonSerializer.Serialize(new{scope,employeeName="Ana",type="percentage",value=0,salesTiers=new[]{new{minCents=1,maxCents=(int?)null,percentage=35}}});
        Assert.Equal(400,(await Assert.ThrowsAsync<DomainException>(()=>service.SaveCustomerCatalogAsync(null,"commissionRule","Inválida",invalid,true,Manager))).StatusCode);
    }
}
