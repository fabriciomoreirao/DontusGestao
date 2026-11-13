using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Dontus.Operations.Tests;

public sealed class GoalProgressTests
{
    [Theory]
    [InlineData("salesCount", 2)]
    [InlineData("salesValue", 319.8)]
    public void Funnel_goals_scope_won_sales_and_keep_the_other_scope_filters(string metric, decimal expected)
    {
        var goal = Goal(metric);
        var detail = JsonNode.Parse(goal.Description)!.AsObject();
        var funnelId = Guid.NewGuid(); detail["funnelId"] = funnelId.ToString(); detail["funnelName"] = "LIA";
        goal.Description = detail.ToJsonString(); GoalProgress.Validate("goals",goal.Description);
        var names = new[]{"LIA","lia","LIA Plus","Clínicas + Módulos"};
        var sources = names.Select(name => { var sale = Sale(); var d = JsonNode.Parse(sale.Description)!.AsObject(); d["funnel"] = name; sale.Description = d.ToJsonString(); return sale; }).ToList();
        var otherEmployee = Sale(); otherEmployee.Description = """{"kind":"commercialLead","seller":"Bia","funnel":"LIA","wonAt":"2026-11-06"}"""; sources.Add(otherEmployee);
        var otherDepartment = Sale(); otherDepartment.Team = "Outro"; sources.Add(otherDepartment);
        Assert.Equal(expected,GoalProgress.Calculate(goal,sources)!.Actual);
        Assert.Equal(metric=="salesCount"?4:639.6m,GoalProgress.Calculate(Goal(metric),sources)!.Actual);
    }

    [Fact]
    public void Funnel_catalog_handles_renames_and_explicit_ids_without_losing_legacy_all_funnel_goals()
    {
        var funnel = new CustomerCatalogOption { Catalog="funnelStage",Name="LIA Novo",Description="{\"f\":\"c\"}",Active=false };
        var goal = Goal(); var d = JsonNode.Parse(goal.Description)!.AsObject(); d["funnelId"] = funnel.Id.ToString(); d["funnelName"] = "LIA"; goal.Description=d.ToJsonString();
        var first = Sale(); first.Description="""{"kind":"commercialLead","seller":"Ana","funnel":"LIA","wonAt":"2026-11-06"}""";
        var renamed = Sale(); renamed.Description=first.Description.Replace("LIA","LIA Novo");
        var other = Sale(); var saleDetail = JsonNode.Parse(first.Description)!.AsObject(); saleDetail["funnelId"]=Guid.NewGuid().ToString(); other.Description=saleDetail.ToJsonString();
        var result=GoalProgress.Calculate(goal,[first,renamed,other],catalogs:[funnel])!;
        Assert.Equal(2,result.Actual); Assert.Equal("LIA Novo",result.FunnelName); Assert.Equal(funnel.Id.ToString(),result.FunnelId);
        Assert.Equal(3,GoalProgress.Calculate(Goal(),[first,renamed,other])!.Actual);
        var invalid=JsonNode.Parse(goal.Description)!.AsObject(); invalid["funnelId"]="invalid";
        Assert.Throws<DomainException>(()=>GoalProgress.Validate("goals",invalid.ToJsonString()));
        invalid["funnelId"]=funnel.Id.ToString(); invalid["metric"]="usageScore";
        Assert.Throws<DomainException>(()=>GoalProgress.Validate("goals",invalid.ToJsonString()));
    }
    private static readonly Guid ModuleFunnel = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid LiaFunnel = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid ModuleProduct = Guid.Parse("33333333-3333-3333-3333-333333333333");
    private static WorkItem ScopedGoal(string metric = "salesValue", bool mixed = false, bool allModules = false)
    {
        var goal = Goal(metric); var d = JsonNode.Parse(goal.Description)!.AsObject();
        d["funnels"] = new JsonArray(new JsonObject { ["id"] = ModuleFunnel.ToString(), ["name"] = "Funil de Módulos" });
        if (mixed) d["funnels"]!.AsArray().Add(new JsonObject { ["id"] = LiaFunnel.ToString(), ["name"] = "LIA" });
        d["moduleScope"] = "moduleFunnels";
        d["modules"] = allModules ? new JsonArray() : JsonNode.Parse($$"""[{"productId":"{{ModuleProduct}}","productName":"Módulos","plan":"Chat Dontus"},{"productId":"{{ModuleProduct}}","productName":"Módulos","plan":"Dontus One"}]""");
        goal.Description = d.ToJsonString(); return goal;
    }
    private static WorkItem ModuleSale(string funnel, string products)
    {
        var sale = Sale(); var d = JsonNode.Parse(sale.Description)!.AsObject(); d["funnel"] = funnel; d["products"] = JsonNode.Parse(products);
        sale.Description = d.ToJsonString(); return sale;
    }
    private static WorkItem[] ModuleSales() => [
        ModuleSale("Funil de Módulos", """[{"product":"Sistema","plan":"Completo","value":500,"quantity":1},{"product":"Módulos","plan":"Chat Dontus","value":69.9,"quantity":2},{"product":"Módulos","plan":"Dontus One","unitValue":99.9,"quantity":1},{"product":"Módulos","plan":"WhatsApp Manual","value":29.9,"quantity":1}]"""),
        ModuleSale("Funil de Módulos", """[{"product":"Módulos","plan":"WhatsApp Manual","value":29.9}]"""),
        ModuleSale("LIA", """[{"product":"LIA","value":159.9}]"""), ModuleSale("Clínicas", """[{"product":"Sistema","value":159.9}]""")];

    [Theory]
    [InlineData(false, false, "salesValue", 239.7)]
    [InlineData(false, false, "salesCount", 1)]
    [InlineData(false, true, "salesValue", 299.5)]
    [InlineData(false, true, "salesCount", 2)]
    [InlineData(true, false, "salesValue", 399.6)]
    [InlineData(true, false, "salesCount", 2)]
    [InlineData(true, true, "salesValue", 459.4)]
    public void Module_filters_sum_selected_line_items_count_cards_once_and_keep_other_funnels_whole(bool mixed, bool allModules, string metric, decimal expected)
    {
        var goal = ScopedGoal(metric, mixed, allModules); GoalProgress.Validate("goals", goal.Description);
        var result = GoalProgress.Calculate(goal, ModuleSales())!;
        Assert.Equal(expected, result.Actual);
        Assert.Equal(allModules ? "Todos os módulos" : "Chat Dontus, Dontus One", result.ModuleName);
        Assert.Equal(mixed ? "Funil de Módulos, LIA" : "Funil de Módulos", result.FunnelName);
    }
    [Fact]
    public void Multiple_funnels_are_a_union_and_empty_array_overrides_legacy_scope()
    {
        var goal = ScopedGoal("salesCount", true); var d = JsonNode.Parse(goal.Description)!.AsObject(); d.Remove("moduleScope"); d["modules"] = new JsonArray();
        goal.Description = d.ToJsonString(); Assert.Equal(3, GoalProgress.Calculate(goal, ModuleSales())!.Actual);
        d["funnelId"] = ModuleFunnel.ToString(); d["funnelName"] = "Funil de Módulos"; d["funnels"] = new JsonArray();
        goal.Description = d.ToJsonString(); GoalProgress.Validate("goals", goal.Description);
        Assert.Equal(4, GoalProgress.Calculate(goal, ModuleSales())!.Actual);
        Assert.Equal("", GoalProgress.Calculate(goal, ModuleSales())!.FunnelName);
    }
    [Fact]
    public void Free_matching_modules_count_and_prices_round_per_line_with_exact_plan_matching()
    {
        var records = new[] { ModuleSale("Funil de Módulos", """[{"product":"modulos","plan":" Chat Dontus ","value":0}]"""),
            ModuleSale("Funil de Módulos", """[{"product":"Módulos","plan":"Chat Dontus Plus","value":99}]"""), ModuleSale("Funil de Módulos", "[]") };
        Assert.Equal(1, GoalProgress.Calculate(ScopedGoal("salesCount"), records)!.Actual);
        Assert.Equal(0, GoalProgress.Calculate(ScopedGoal(), records)!.Actual);
        var rounded = ModuleSale("Funil de Módulos", """[{"product":"Módulos","plan":"Chat Dontus","value":1.005},{"product":"Módulos","plan":"Chat Dontus","unitValue":0,"value":999,"quantity":2},{"product":"Módulos","plan":"Chat Dontus","value":-5}]""");
        Assert.Equal(1.01m, GoalProgress.Calculate(ScopedGoal(), [rounded])!.Actual);
    }
    [Fact]
    public void Module_scopes_keep_owner_department_dates_and_won_crm_filters()
    {
        var records = ModuleSales(); records[0].Description = records[0].Description.Replace("Ana", "Bia");
        records[1].Description = records[1].Description.Replace("2026-11-06T02:30:00Z", "2026-12-01");
        records[2].Team = "Outro";
        Assert.Equal(0, GoalProgress.Calculate(ScopedGoal("salesCount", true), records)!.Actual);
        var direct = ModuleSales()[0]; direct.Description = direct.Description.Replace("commercialLead", "directSale");
        var retention = ModuleSales()[0]; retention.RecordType = "Lead de retenção";
        var pending = ModuleSales()[0]; pending.Status = "Proposta";
        Assert.Equal(0, GoalProgress.Calculate(ScopedGoal("salesCount"), [direct, retention, pending])!.Actual);
    }
    [Fact]
    public void Module_catalog_renames_and_explicit_ids_preserve_history_and_distinguish_sources()
    {
        var catalogs = new[] { new CustomerCatalogOption { Id=ModuleFunnel, Catalog="funnelStage", Name="Complementos", Active=false },
            new CustomerCatalogOption { Id=ModuleProduct, Catalog="commercialProduct", Name="Complementos", Active=false } };
        var renamed = ModuleSale("Complementos", """[{"product":"Complementos","plan":"Chat Dontus","value":25}]""");
        var ids = ModuleSale("Outro", $$"""[{"productId":"{{ModuleProduct}}","product":"Outro","plan":"Chat Dontus","value":30}]""");
        var d = JsonNode.Parse(ids.Description)!.AsObject(); d["funnelId"] = ModuleFunnel.ToString(); ids.Description = d.ToJsonString();
        var wrongProduct = ModuleSale("Funil de Módulos", $$"""[{"productId":"{{Guid.NewGuid()}}","product":"Módulos","plan":"Chat Dontus","value":90}]""");
        var wrongFunnel = ModuleSale("Funil de Módulos", """[{"product":"Módulos","plan":"Chat Dontus","value":90}]""");
        d = JsonNode.Parse(wrongFunnel.Description)!.AsObject(); d["funnelId"] = Guid.NewGuid().ToString(); wrongFunnel.Description = d.ToJsonString();
        var result = GoalProgress.Calculate(ScopedGoal(), [renamed, ids, wrongProduct, wrongFunnel], catalogs:catalogs)!;
        Assert.Equal(55, result.Actual); Assert.Equal("Complementos", result.FunnelName);
    }
    [Theory]
    [InlineData("funnels", "{}")]
    [InlineData("funnels", "[null]")]
    [InlineData("funnels", "[{\"id\":\"invalid\",\"name\":\"LIA\"}]")]
    [InlineData("funnels", "[{\"id\":12}]")]
    [InlineData("funnels", "[{}]")]
    [InlineData("modules", "[{}]")]
    [InlineData("modules", "[{\"productId\":\"invalid\"}]")]
    [InlineData("modules", "[{\"productName\":\"Módulos\",\"plan\":3}]")]
    [InlineData("moduleScope", "\"invalid\"")]
    [InlineData("metric", "\"usageScore\"")]
    public void Malformed_scopes_and_non_sales_filters_are_rejected(string key, string json)
    {
        var goal = ScopedGoal(); var d = JsonNode.Parse(goal.Description)!.AsObject(); d[key] = JsonNode.Parse(json);
        Assert.Throws<DomainException>(() => GoalProgress.Validate("goals", d.ToJsonString()));
    }
    [Fact]
    public void Module_filters_require_a_funnel_and_explicit_module_scope()
    {
        var d = JsonNode.Parse(ScopedGoal().Description)!.AsObject(); d.Remove("moduleScope");
        Assert.Throws<DomainException>(() => GoalProgress.Validate("goals", d.ToJsonString()));
        d["moduleScope"] = "moduleFunnels"; d["funnels"] = new JsonArray();
        Assert.Throws<DomainException>(() => GoalProgress.Validate("goals", d.ToJsonString()));
    }
    private static WorkItem Goal(string metric="salesCount",decimal target=1) => new() { Module="goals",Title="Meta",RecordType="Meta",Status="Ativa",CreatedBy="test",Description=JsonSerializer.Serialize(new {kind="performanceGoal",metric,cadence="monthly",target,employeeName="Ana",departmentName="Comercial",periodStart="2026-11-05",periodEnd="2026-11-30",active=true}) };
    private static WorkItem Sale(string type="Lead comercial",string wonAt="2026-11-06T02:30:00Z") => new() {Module="commercial",RecordType=type,Title="Venda",Owner="Outro",Team="Comercial",Status="Ganho",AmountCents=15990,CreatedBy="test",CreatedAt=DateTimeOffset.Parse("2026-10-01T12:00:00Z"),UpdatedAt=DateTimeOffset.Parse("2026-12-01T12:00:00Z"),Description=JsonSerializer.Serialize(new {kind="commercialLead",seller="Ana",wonAt})};
    [Fact]
    public void Sales_use_the_win_date_seller_and_exact_scope()
    {
        var sources=new[]{Sale(),Sale("Lead de retenção"),Sale("Lead comercial","2026-11-05T02:30:00Z")};
        var count=GoalProgress.Calculate(Goal(),sources)!;
        Assert.Equal(1,count.Actual);Assert.True(count.Achieved);Assert.Equal(100,count.Progress);
        Assert.Equal(159.9m,GoalProgress.Calculate(Goal("salesValue"),sources)!.Actual);
        var qualified=Sale();qualified.Team="Comercial · CRM";
        Assert.Equal(1,GoalProgress.Calculate(Goal(),[qualified])!.Actual);
        qualified.Team="Comercialização";
        Assert.Equal(0,GoalProgress.Calculate(Goal(),[qualified])!.Actual);
    }
    [Fact]
    public void Referral_goals_use_the_sender_instead_of_the_recipient()
    {
        var source=Sale();source.Module="referrals";source.Description="""{"kind":"referral","date":"2026-11-06","senderName":"Ana","senderDepartment":"Comercial"}""";
        Assert.Equal(1,GoalProgress.Calculate(Goal("referralCount"),[source])!.Actual);
    }
    [Fact]
    public void Score_goals_include_base_plus_and_lia()
    {
        var cs=Sale();cs.Module="cs";cs.Owner="Ana";cs.Description="""{"kind":"csJourney","startDate":"2026-11-06","featuresBase":["Agenda","Financeiro"],"featuresActive":["Agenda"],"featuresPlus":["Estoque"]}""";
        var lia=Sale();lia.Module="lia";lia.Owner="Ana";lia.Description="""{"kind":"liaJourney","startDate":"2026-11-06","score":50}""";
        Assert.Equal(75,GoalProgress.Calculate(Goal("usageScore"),[cs,lia])!.Actual);
    }
    [Fact]
    public void Goals_validate_target_and_metric_on_the_server()
    {
        GoalProgress.Validate("goals",Goal().Description);
        Assert.Throws<DomainException>(()=>GoalProgress.Validate("goals",Goal(target:0).Description));
        Assert.Throws<DomainException>(()=>GoalProgress.Validate("goals",Goal("referralCount",1.5m).Description));
        Assert.Throws<DomainException>(()=>GoalProgress.Validate("goals",Goal("unknown").Description));
        Assert.Throws<DomainException>(()=>GoalProgress.Validate("goals",Goal("usageScore",100.01m).Description));
        Assert.Throws<DomainException>(()=>GoalProgress.Validate("goals",Goal("salesValue",10.001m).Description));
        GoalProgress.Validate("goals",Goal("usageScore",100m).Description);
        GoalProgress.Validate("goals",Goal("salesValue",1234.56m).Description);
    }
    [Fact]
    public void Enterprise_score_ignores_inactive_units_and_uses_actual_feature_status()
    {
        var source=Sale();source.Module="cs";source.Owner="Ana";
        source.Description="""{"kind":"enterpriseNetwork","startDate":"2026-11-06","units":[{"active":true,"features":[{"name":"Agenda","status":"Em utilização","category":"Base"},{"name":"Financeiro","status":"Contratada","category":"Base"}]},{"active":false,"features":[]}]}""";
        Assert.Equal(50,GoalProgress.Calculate(Goal("usageScore"),[source])!.Actual);
    }
}
