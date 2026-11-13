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
