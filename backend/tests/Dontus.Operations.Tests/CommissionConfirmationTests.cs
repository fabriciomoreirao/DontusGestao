using System.Text.Json;
using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class CommissionConfirmationTests
{
    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static ActorContext Manager() => new("manager@test.local", "Gestora", "Coordenação", "CS", [new("commissions", true, true, true, true, true), new("referrals", true, true, true, true, true)]);
    private static CommissionConfirmationService Service(OperationsDbContext db)
    {
        if (!db.Users.Any(x=>x.Email==Manager().Email)) db.Users.Add(new AppUser { Email=Manager().Email,DisplayName=Manager().DisplayName,CreatedBy="test" });
        foreach(var item in db.WorkItems.Where(x=>x.Module=="commissions").ToList())
        {
            var detail=JsonNode.Parse(item.Description)!;
            if(Guid.TryParse(detail["employeeId"]?.ToString(),out var id) && !db.Users.Local.Any(x=>x.Id==id) && !db.Users.Any(x=>x.Id==id))
                db.Users.Add(new AppUser { Id=id,Email=id+"@test.local",DisplayName=item.Owner,CreatedBy="test" });
        }
        db.SaveChanges(); return new(db,new EphemeralDataProtectionProvider());
    }
    private static ActorContext Owner(OperationsDbContext db,string token)
    {
        var hash=Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(token)));
        var entry=db.CommissionConfirmations.Single(x=>x.TokenHash==hash);
        var user=db.Users.Single(x=>entry.EmployeeUserId==x.Id || entry.EmployeeKey==x.Email || entry.EmployeeKey==x.Id.ToString());
        return new(user.Email,user.DisplayName,"Colaborador","CS",[new(entry.Module,true,false,true,false,false)]);
    }
    private static AgreeCommissionConfirmation Signature() => new(true,[new([new(.1,.5),new(.3,.2),new(.4,.8),new(.7,.4)])],new("pt-BR","Windows","America/Sao_Paulo",1920,1080));
    private static JsonElement Json(object value) => JsonSerializer.SerializeToElement(value);
    private static WorkItem Record(string employee = "Ana", string? employeeId = null, string decision = "approved", string month = "2026-10") => new() {
        Module = "commissions", RecordType = "Comissão", Title = "Comissão", Owner = employee, Status = decision == "approved" ? "Aprovada" : "Reprovada", CreatedBy = "manager@test.local",
        AmountCents = decision == "approved" ? 15000 : 0,
        Description = JsonSerializer.Serialize(new { kind = "commissionRecord", scope = "cs", competence = month, employeeName = employee, employeeId = employeeId ?? Guid.NewGuid().ToString(),
            sourceKey = Guid.NewGuid().ToString(), customerName = "Clínica A", product = "Dontus", saleValueCents = 100000, commissionCents = decision == "approved" ? 15000 : 0,
            decision, reason = "Critérios conferidos", decidedBy = "Gestora", decidedAt = "2026-10-28T12:00:00Z", ruleLabel = "15% sobre R$ 1.000,00 = R$ 150,00", score = 90, customerStatus = "Ativo", usageStatus = "90%" })
    };
    private static GenerateCommissionConfirmation Command(params WorkItem[] items) => new("commissions", "cs", "2026-10", items.Select(x => new ConfirmationEntry(x.Id, x.Version)).ToArray(), new() { ["Responsável"] = "Filtro selecionado", ["Decisão"] = "Todas" });
    private static string Token(object result) => Json(result)[0].GetProperty("token").GetString()!;
    private static UpdateWorkItemCommand Update(WorkItem item, JsonObject detail) => new(item.Id, item.Title, item.Owner, item.AmountCents, detail.ToJsonString(), null, null, item.Version);

    [Fact]
    public async Task Links_preserve_exact_filtered_rows_values_rules_and_server_agreement_time()
    {
        await using var db = Context(); var own = Record(); var excluded = Record("Bia");
        db.WorkItems.AddRange(own, excluded); await db.SaveChangesAsync(); var service = Service(db);
        var token = Token(await service.GenerateAsync(Command(own), Manager(), default));
        var report = Json(await service.GetPublicAsync(token, Owner(db,token), default)).GetProperty("report");
        Assert.Equal(own.Id, Assert.Single(report.GetProperty("Rows").EnumerateArray()).GetProperty("Id").GetGuid());
        Assert.Equal(15000, report.GetProperty("TotalCents").GetInt64());
        Assert.Contains("15%", report.GetProperty("Rows")[0].GetProperty("RuleLabel").GetString());
        Assert.Equal("Filtro selecionado", report.GetProperty("Filters").GetProperty("Responsável").GetString());
        Assert.DoesNotContain(token, (await db.CommissionConfirmations.SingleAsync()).TokenHash);
        Assert.Equal(400, (await Assert.ThrowsAsync<DomainException>(() => service.AgreeAsync(token, new(false), Owner(db,token), "Test Browser", default))).StatusCode);
        var before = DateTimeOffset.UtcNow; var agreedAt = await service.AgreeAsync(token, Signature(), Owner(db,token), "Test Browser", default);
        Assert.InRange(agreedAt, before, DateTimeOffset.UtcNow);
        Assert.Equal(agreedAt, await service.AgreeAsync(token, Signature(), Owner(db,token), "Test Browser", default));
        own.AmountCents = 0; own.Version++; await db.SaveChangesAsync();
        Assert.Equal(15000, Json(await service.GetPublicAsync(token, Owner(db,token), default)).GetProperty("report").GetProperty("TotalCents").GetInt64());
        Assert.Contains(db.AuditEvents, x => x.Action == "AgreeConfirmation");
    }

    [Fact]
    public async Task Each_responsible_gets_a_separate_link_even_with_identical_names_and_regeneration_reuses_it()
    {
        await using var db = Context(); var first = Record("Mesmo nome"); var second = Record("Mesmo nome");
        db.WorkItems.AddRange(first, second); await db.SaveChangesAsync(); var service = Service(db);
        var generated = Json(await service.GenerateAsync(Command(first, second), Manager(), default));
        Assert.Equal(2, generated.GetArrayLength());
        foreach (var entry in generated.EnumerateArray()) Assert.Single(Json(await service.GetPublicAsync(entry.GetProperty("token").GetString()!, Manager(), default)).GetProperty("report").GetProperty("Rows").EnumerateArray());
        var again = Json(await service.GenerateAsync(Command(first, second), Manager(), default));
        Assert.Equal(generated[0].GetProperty("token").GetString(), again[0].GetProperty("token").GetString());
        Assert.Equal(2, await db.CommissionConfirmations.CountAsync());
    }

    [Theory]
    [InlineData("pending", "2026-10")]
    [InlineData("approved", "2026-09")]
    public async Task Pending_or_different_month_entries_cannot_generate_a_link(string decision, string month)
    {
        await using var db = Context(); var item = Record(decision: decision, month: month); db.WorkItems.Add(item); await db.SaveChangesAsync();
        Assert.Equal(409, (await Assert.ThrowsAsync<DomainException>(() => Service(db).GenerateAsync(Command(item), Manager(), default))).StatusCode);
        Assert.Empty(db.CommissionConfirmations);
    }

    [Fact]
    public async Task Wrong_versions_missing_reason_and_other_scopes_are_rejected()
    {
        await using var db = Context(); var item = Record(); db.WorkItems.Add(item); await db.SaveChangesAsync(); var service = Service(db);
        Assert.Equal(409, (await Assert.ThrowsAsync<DomainException>(() => service.GenerateAsync(Command(item) with { Entries = [new(item.Id, 99)] }, Manager(), default))).StatusCode);
        Assert.Equal(409, (await Assert.ThrowsAsync<DomainException>(() => service.GenerateAsync(Command(item) with { Scope = "lia" }, Manager(), default))).StatusCode);
        var detail = JsonNode.Parse(item.Description)!.AsObject(); detail["reason"] = ""; item.Description = detail.ToJsonString(); await db.SaveChangesAsync();
        Assert.Equal(409, (await Assert.ThrowsAsync<DomainException>(() => service.GenerateAsync(Command(item), Manager(), default))).StatusCode);
    }

    [Fact]
    public async Task Ordinary_users_cannot_generate_and_can_only_list_their_own_confirmation()
    {
        await using var db = Context(); var user = new AppUser { Email = "ana@test.local", DisplayName = "Ana", CreatedBy = "system" };
        db.Users.Add(user); var own = Record(employeeId: user.Id.ToString()); var other = Record(); db.WorkItems.AddRange(own, other); await db.SaveChangesAsync();
        var actor = new ActorContext(user.Email, user.DisplayName, "Colaboradora", "CS", [new("commissions", true, false, true, false, false)]);
        var service = Service(db); await service.GenerateAsync(Command(own, other), Manager(), default);
        Assert.Single(Json(await service.ListAsync("commissions", "cs", "2026-10", actor, default)).EnumerateArray());
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.GenerateAsync(Command(own), actor, default))).StatusCode);
        Assert.Equal(404, (await Assert.ThrowsAsync<DomainException>(() => service.GetPublicAsync(new string('a', 64), actor, default))).StatusCode);
    }

    [Fact]
    public async Task Changes_or_deletions_after_generation_prevent_agreement()
    {
        await using var db = Context(); var item = Record(); db.WorkItems.Add(item); await db.SaveChangesAsync(); var service = Service(db);
        var token = Token(await service.GenerateAsync(Command(item), Manager(), default));
        await new OperationsService(db).DeleteWorkItemAsync(item.Id, Manager());
        Assert.NotNull((await db.CommissionConfirmations.SingleAsync()).InvalidatedAt);
        Assert.Equal(409, (await Assert.ThrowsAsync<DomainException>(() => service.AgreeAsync(token, Signature(), Owner(db,token), "Test Browser", default))).StatusCode);
    }

    [Fact]
    public async Task Approval_requires_reason_calculates_on_server_and_rejection_has_no_payment()
    {
        await using var db = Context(); var item = Record(decision: "pending"); item.AmountCents = 0;
        var detail = JsonNode.Parse(item.Description)!.AsObject();
        db.WorkItems.Add(item); db.CustomerCatalogOptions.Add(new() { Catalog = "commissionRule", Name = "CS", Description = JsonSerializer.Serialize(new {
            kind = "commissionRule", scope = "cs", employeeId = detail["employeeId"]!.ToString(), employeeName = "Ana", product = "*", type = "percentage", value = 15 }) });
        await db.SaveChangesAsync(); var operations = new OperationsService(db);
        detail["decision"] = "approved"; detail["reason"] = "";
        Assert.Equal(400, (await Assert.ThrowsAsync<DomainException>(() => operations.UpdateWorkItemAsync(Update(item, detail), Manager()))).StatusCode);
        detail["reason"] = "Conferido"; detail["commissionCents"] = 99999; detail["decidedAt"] = "2000-01-01";
        await operations.UpdateWorkItemAsync(Update(item, detail), Manager());
        Assert.Equal(15000, item.AmountCents); Assert.Equal("Aprovada", item.Status);
        var saved = JsonNode.Parse(item.Description)!.AsObject(); Assert.NotNull(saved["ruleSnapshot"]);
        Assert.NotEqual("2000-01-01", saved["decidedAt"]!.ToString()); Assert.Equal("Gestora", saved["decidedBy"]!.ToString());
        saved["decision"] = "rejected"; saved["reason"] = "Fora dos critérios";
        await operations.UpdateWorkItemAsync(Update(item, saved), Manager());
        Assert.Equal(0, item.AmountCents); Assert.Equal("Reprovada", item.Status);
        var token = Token(await Service(db).GenerateAsync(Command(item), Manager(), default)); Assert.Equal(64, token.Length);
    }

    [Fact]
    public async Task Referral_confirmation_uses_sender_rule_and_Brasilia_competence_and_excludes_rejections_from_payment()
    {
        await using var db = Context(); var user = new AppUser { Email = "referral@test.local", DisplayName = "Indicadora", CreatedBy = "system" };
        db.Users.Add(user);
        db.CustomerCatalogOptions.Add(new() { Catalog = "referralCommission", Name = "Regra de indicação", Description = JsonSerializer.Serialize(new {
            type = "percentage", collaboratorId = user.Id, collaboratorName = user.DisplayName, moduleName = "LIA", percentage = 20 }) });
        var item = new WorkItem { Module = "referrals", RecordType = "Indicação", Title = "Cliente indicado", Owner = user.DisplayName, Status = "Conferência", CreatedBy = user.Email,
            Description = JsonSerializer.Serialize(new { kind = "referral", phase = "conference", senderName = user.DisplayName, moduleName = "LIA", valueCents = 100000, dentistName = "Cliente indicado" }) };
        db.WorkItems.Add(item); await db.SaveChangesAsync();
        var detail = JsonNode.Parse(item.Description)!.AsObject(); detail["phase"] = "approved"; detail["decisionReason"] = "Contratação conferida";
        await new OperationsService(db).UpdateWorkItemAsync(Update(item, detail), Manager()); Assert.Equal(20000, item.AmountCents);
        detail = JsonNode.Parse(item.Description)!.AsObject(); detail["decisionAt"] = "2026-11-01T01:00:00Z"; item.Description = detail.ToJsonString(); await db.SaveChangesAsync();
        var service = Service(db); var command = new GenerateCommissionConfirmation("referrals", "referrals", "2026-10", [new(item.Id, item.Version)], new());
        var token = Token(await service.GenerateAsync(command, Manager(), default));
        Assert.Equal(20000, Json(await service.GetPublicAsync(token, Owner(db,token), default)).GetProperty("report").GetProperty("TotalCents").GetInt64());
        detail["phase"] = "rejected"; detail["decisionReason"] = "Contratação cancelada";
        await new OperationsService(db).UpdateWorkItemAsync(Update(item, detail), Manager()); Assert.Equal(0, item.AmountCents);
        Assert.Equal(409, (await Assert.ThrowsAsync<DomainException>(() => service.GetPublicAsync(token, Owner(db,token), default))).StatusCode);
    }

    [Fact]
    public async Task Only_the_responsible_can_sign_supervisors_can_read_and_names_do_not_grant_access()
    {
        await using var db=Context();var item=Record();db.WorkItems.Add(item);await db.SaveChangesAsync();var service=Service(db);
        var token=Token(await service.GenerateAsync(Command(item),Manager(),default));var owner=Owner(db,token);
        var stranger=new AppUser { Email="stranger@test.local",DisplayName=owner.DisplayName,CreatedBy="test" };db.Users.Add(stranger);await db.SaveChangesAsync();
        var outsider=owner with { Email=stranger.Email };
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.GetPublicAsync(token,outsider,default))).StatusCode);
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.DownloadAsync(token,outsider,default))).StatusCode);
        Assert.False(Json(await service.GetPublicAsync(token,Manager(),default)).GetProperty("canSign").GetBoolean());
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.AgreeAsync(token,Signature(),Manager(),"Browser",default))).StatusCode);
        Assert.True(Json(await service.GetPublicAsync(token,owner,default)).GetProperty("canSign").GetBoolean());
        Assert.Equal(409,(await Assert.ThrowsAsync<DomainException>(()=>service.DownloadAsync(token,owner,default))).StatusCode);
    }

    [Fact]
    public async Task A_signature_persists_identity_browser_rubric_and_an_immutable_downloadable_pdf()
    {
        await using var db=Context();var item=Record();db.WorkItems.Add(item);await db.SaveChangesAsync();var service=Service(db);
        var token=Token(await service.GenerateAsync(Command(item),Manager(),default));var owner=Owner(db,token);
        Assert.Equal(400,(await Assert.ThrowsAsync<DomainException>(()=>service.AgreeAsync(token,new(true),owner,"Browser",default))).StatusCode);
        var command=Signature();var invalid=command with { Signature=[new([new(-.1,.5),new(.7,.8)])] };
        Assert.Equal(400,(await Assert.ThrowsAsync<DomainException>(()=>service.AgreeAsync(token,invalid,owner,"Browser",default))).StatusCode);
        var stamp=await service.AgreeAsync(token,command,owner,"Mozilla/5.0 Test Browser",default);
        var entry=await db.CommissionConfirmations.SingleAsync();
        Assert.Equal(owner.Email,entry.SignedByEmail);Assert.Equal(owner.DisplayName,entry.SignedByName);
        Assert.Equal(64,entry.EvidenceHash.Length);Assert.Contains("Mozilla/5.0 Test Browser",entry.BrowserJson);Assert.Contains("Points",entry.SignatureJson);
        var first=await service.DownloadAsync(token,owner,default);Assert.True(first.Bytes.Length>1000);Assert.StartsWith("%PDF",System.Text.Encoding.ASCII.GetString(first.Bytes[..8]));
        Assert.Equal(first.Bytes,(await service.DownloadAsync(token,Manager(),default)).Bytes);
        await service.AgreeAsync(token,command with { Signature=[new([new(.2,.3),new(.6,.7)])] },owner,"Other Browser",default);
        Assert.Equal(stamp,entry.AgreedAt);Assert.Contains("Mozilla/5.0 Test Browser",entry.BrowserJson);Assert.Equal(first.Bytes,entry.SignedPdf);
    }

    [Fact]
    public async Task Manual_commissions_require_supervision_keep_the_client_and_amount_and_still_require_a_decision()
    {
        await using var db=Context();var user=new AppUser { Email="manual@test.local",DisplayName="Responsável manual",CreatedBy="test" };db.Users.Add(user);await db.SaveChangesAsync();
        var detail=new JsonObject { ["kind"]="commissionRecord",["manual"]=true,["sourceKey"]="manual:"+Guid.NewGuid(),["scope"]="cs",["competence"]="2026-10",["employeeId"]=user.Id.ToString(),["employeeName"]=user.DisplayName,["customerName"]="Cliente Manual",["manualCustomerCode"]="123456",["product"]="Ajuste de comissão",["saleValueCents"]=100000,["manualCommissionCents"]=12345,["manualReason"]="Ajuste autorizado pela supervisão",["decision"]="pending" };
        var command=new CreateWorkItemCommand("commissions","Comissão manual","Cliente Manual",null,"Cliente Manual",user.DisplayName,"CS","P3",null,null,99999,detail.ToJsonString(),[],null,null,"Pendente");
        var ordinary=new ActorContext(user.Email,user.DisplayName,"Colaborador","CS",[new("commissions",true,true,true,false,false)]);var operations=new OperationsService(db);
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>operations.CreateWorkItemAsync(command,ordinary))).StatusCode);
        db.CustomerCatalogOptions.Add(new CustomerCatalogOption { Catalog="commissionRule",Name="CS manual",Description=JsonSerializer.Serialize(new { kind="commissionRule",scope="cs",employeeId=user.Id,product="*",type="percentage",value=0,scoreTiers=new[]{new{min=0,max=50,percentage=5},new{min=50,max=75,percentage=10},new{min=75,max=100,percentage=15}} }) });await db.SaveChangesAsync();
        var id=await operations.CreateWorkItemAsync(command,Manager());var item=await db.WorkItems.SingleAsync(x=>x.Id==id);Assert.Equal(0,item.AmountCents);
        var service=Service(db);Assert.Equal(409,(await Assert.ThrowsAsync<DomainException>(()=>service.GenerateAsync(Command(item),Manager(),default))).StatusCode);
        detail=JsonNode.Parse(item.Description)!.AsObject();detail["decision"]="approved";detail["reason"]="Conferido e aprovado";
        await operations.UpdateWorkItemAsync(Update(item,detail),Manager());Assert.Equal(12345,item.AmountCents);
        var token=Token(await service.GenerateAsync(Command(item),Manager(),default));var report=Json(await service.GetPublicAsync(token,Owner(db,token),default)).GetProperty("report");
        Assert.Equal(12345,report.GetProperty("TotalCents").GetInt64());Assert.Equal("123456",report.GetProperty("Rows")[0].GetProperty("CustomerCode").GetString());Assert.True(report.GetProperty("Rows")[0].GetProperty("Manual").GetBoolean());
    }
}
