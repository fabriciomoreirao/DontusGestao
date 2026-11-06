using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using System.Text.Json;

namespace Dontus.Operations.Tests;

public sealed class GoalProgressTests
{
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
