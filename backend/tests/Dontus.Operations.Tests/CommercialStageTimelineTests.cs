using System.Text.Json.Nodes;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;

namespace Dontus.Operations.Tests;

public sealed class CommercialStageTimelineTests
{
    private static readonly DateTimeOffset November = DateTimeOffset.Parse("2026-11-12T15:00:00Z");
    [Fact]
    public void Commenting_cannot_reset_the_month_of_a_stage_or_override_its_entry_date()
    {
        var before = """{"kind":"commercialLead","funnel":"Alpha","stage":"Ganho","stageEnteredAt":"2026-10-15T15:00:00Z"}""";
        var next = """{"kind":"commercialLead","funnel":"Alpha","stage":"Ganho","stageEnteredAt":"2026-11-12T15:00:00Z","comments":[{"text":"Comentário novo"}]}""";
        var result = JsonNode.Parse(CommercialStageTimeline.Normalize(next, before, at:November))!;
        Assert.Equal(DateTimeOffset.Parse("2026-10-15T15:00:00Z"), DateTimeOffset.Parse(result["stageEnteredAt"]!.ToString()));
        Assert.Single(result["comments"]!.AsArray());
    }
    [Theory]
    [InlineData("Beta", "Ganho")]
    [InlineData("Alpha", "Proposta")]
    public void Changing_the_stage_or_funnel_starts_a_new_stage_period(string funnel, string stage)
    {
        var before = """{"kind":"commercialLead","funnel":"Alpha","stage":"Ganho","stageEnteredAt":"2026-10-15T15:00:00Z"}""";
        var next = new JsonObject { ["kind"]="commercialLead", ["funnel"]=funnel, ["stage"]=stage };
        var result = JsonNode.Parse(CommercialStageTimeline.Normalize(next.ToJsonString(), before, at:November))!;
        Assert.Equal(November, DateTimeOffset.Parse(result["stageEnteredAt"]!.ToString()));
    }
    [Fact]
    public void Legacy_cards_keep_their_last_movement_date_when_edited()
    {
        var before = """{"kind":"commercialLead","funnel":"Alpha","stage":"Ganho","follows":[{"type":"Resultado comercial","createdAt":"2026-10-15T15:00:00Z"},{"type":"Contato","createdAt":"2026-11-12T15:00:00Z"}]}""";
        var result = JsonNode.Parse(CommercialStageTimeline.Normalize(before,before,DateTimeOffset.Parse("2026-09-01T15:00:00Z"),November))!;
        Assert.Equal(DateTimeOffset.Parse("2026-10-15T15:00:00Z"),DateTimeOffset.Parse(result["stageEnteredAt"]!.ToString()));
    }
    [Fact]
    public void Status_transitions_record_the_entry_date_and_direct_sales_are_unchanged()
    {
        var item=new WorkItem{Module="commercial",RecordType="Lead comercial",Title="Lead",Status="Novo",CreatedBy="test",Description="""{"kind":"commercialLead","stage":"Novo","stageEnteredAt":"2026-10-15T15:00:00Z"}"""};
        SalesCelebrationService.SynchronizeStage(item,"Proposta");
        var result=JsonNode.Parse(item.Description)!;
        Assert.Equal("Proposta",result["stage"]!.ToString());
        Assert.True(DateTimeOffset.Parse(result["stageEnteredAt"]!.ToString())>DateTimeOffset.Parse("2026-10-15T15:00:00Z"));
        const string direct="""{"kind":"directSale","saleDate":"2026-10-15"}""";
        Assert.Equal(direct,CommercialStageTimeline.Normalize(direct,at:November));
    }
}
