using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class CsJourneyFeaturesTests
{
    private static readonly ActorContext Editor = new("cs@test", "Ana", "Colaborador", "CS",
        [new("cs", true, false, true, false, false), new("followupValidation", true, false, true, false, false)]);

    [Theory]
    [InlineData("activation")]
    [InlineData("retention")]
    public async Task Features_can_be_adjusted_in_tracking_and_conference_and_survive_completion(string track)
    {
        await using var db = Context();
        var item = await Seed(db, track, "tracking");
        var service = new OperationsService(db);
        var detail = JsonNode.Parse(item.Description)!.AsObject();
        detail["featuresActive"] = new JsonArray("Agenda", "Atendimento");
        await service.UpdateWorkItemAsync(Command(item, detail), Editor);
        detail = JsonNode.Parse(item.Description)!.AsObject();
        detail["phase"] = "conference"; detail["status"] = "Conferência";
        await service.UpdateWorkItemAsync(Command(item, detail), Editor);
        detail = JsonNode.Parse(item.Description)!.AsObject();
        detail["featuresBase"] = new JsonArray("Agenda", "Atendimento");
        detail["featuresPlus"] = new JsonArray("WhatsApp Automático", "Orto");
        await service.UpdateWorkItemAsync(Command(item, detail), Editor);
        Assert.Equal("Conferência", item.Status);
        var expected = JsonNode.Parse(item.Description)!.AsObject();
        detail = new JsonObject { ["kind"] = "csJourney", ["track"] = track, ["phase"] = "finished", ["status"] = "Finalizado" };
        await service.UpdateWorkItemAsync(Command(item, detail), Editor);
        AssertFeatures(expected, JsonNode.Parse(item.Description)!.AsObject());
        await service.UpdateWorkItemAsync(Command(item, null) with { Title = "Cliente atualizado" }, Editor);
        AssertFeatures(expected, JsonNode.Parse(item.Description)!.AsObject());
    }

    public static IEnumerable<object[]> ReadOnlyPhases() =>
        from track in new[] { "activation", "retention" }
        from phase in new[] { "validation", "onboarding", "finished", "unsuccessful", "cancelled", "cancelledWithoutTraining" }
        select new object[] { track, phase };

    [Theory]
    [MemberData(nameof(ReadOnlyPhases))]
    public async Task Other_stages_preserve_selections_and_reject_edits_even_when_the_request_changes_phase(string track, string phase)
    {
        await using var db = Context();
        var item = await Seed(db, track, phase);
        var service = new OperationsService(db);
        var original = JsonNode.Parse(item.Description)!.AsObject();
        var detail = original.DeepClone().AsObject();
        detail["phone"] = "11999999999";
        await service.UpdateWorkItemAsync(Command(item, detail), Editor);
        AssertFeatures(original, JsonNode.Parse(item.Description)!.AsObject());
        foreach (var field in new[] { "featuresBase", "featuresActive", "featuresPlus" })
        {
            detail = JsonNode.Parse(item.Description)!.AsObject();
            detail["phase"] = "tracking";
            detail[field] = new JsonArray();
            var version = item.Version;
            var error = await Assert.ThrowsAsync<DomainException>(() => service.UpdateWorkItemAsync(Command(item, detail), Editor));
            Assert.Equal(403, error.StatusCode);
            Assert.Contains("Acompanhamento ou Conferência", error.Message);
            Assert.Equal(version, item.Version);
            AssertFeatures(original, JsonNode.Parse(item.Description)!.AsObject());
        }
    }

    [Theory]
    [InlineData("tracking")]
    [InlineData("evolution")]
    [InlineData("conference")]
    public async Task Editable_stages_can_clear_selections_without_a_later_save_restoring_them(string phase)
    {
        await using var db = Context();
        var item = await Seed(db, "retention", phase);
        var detail = JsonNode.Parse(item.Description)!.AsObject();
        foreach (var field in new[] { "featuresBase", "featuresActive", "featuresPlus" }) detail[field] = new JsonArray();
        var service = new OperationsService(db);
        await service.UpdateWorkItemAsync(Command(item, detail), Editor);
        await service.UpdateWorkItemAsync(Command(item, new() { ["kind"] = "csJourney", ["phase"] = "finished", ["track"] = "retention" }), Editor);
        AssertFeatures(detail, JsonNode.Parse(item.Description)!.AsObject());
    }

    [Fact]
    public async Task Legacy_selections_are_preserved_and_cannot_bypass_read_only_stages()
    {
        await using var db = Context();
        var item = await Seed(db, "activation", "finished");
        var detail = JsonNode.Parse(item.Description)!.AsObject();
        detail["features"] = detail["featuresActive"]!.DeepClone(); detail.Remove("featuresActive");
        item.Description = detail.ToJsonString(); await db.SaveChangesAsync();
        var service = new OperationsService(db);
        var invalid = detail.DeepClone().AsObject(); invalid["features"] = new JsonArray("Orto");
        await Assert.ThrowsAsync<DomainException>(() => service.UpdateWorkItemAsync(Command(item, invalid), Editor));
        await service.UpdateWorkItemAsync(Command(item, new() { ["kind"] = "csJourney", ["phase"] = "finished", ["track"] = "activation" }), Editor);
        var saved = JsonNode.Parse(item.Description)!;
        Assert.Equal("Agenda", Assert.Single(saved["featuresActive"]!.AsArray())!.GetValue<string>());
        Assert.Null(saved["features"]);
    }

    [Theory]
    [InlineData("null")]
    [InlineData("\"Agenda\"")]
    [InlineData("[1]")]
    public async Task Invalid_feature_lists_are_rejected_without_changing_the_record(string invalid)
    {
        await using var db = Context();
        var item = await Seed(db, "activation", "tracking");
        var original = item.Description;
        var detail = JsonNode.Parse(item.Description)!.AsObject(); detail["featuresActive"] = JsonNode.Parse(invalid);
        var error = await Assert.ThrowsAsync<DomainException>(() => new OperationsService(db).UpdateWorkItemAsync(Command(item, detail), Editor));
        Assert.Equal(400, error.StatusCode);
        Assert.Equal(original, item.Description);
    }

    [Fact]
    public async Task Read_only_users_cannot_change_features_in_an_editable_stage()
    {
        await using var db = Context();
        var item = await Seed(db, "retention", "conference");
        var detail = JsonNode.Parse(item.Description)!.AsObject(); detail["featuresActive"] = new JsonArray("Orto");
        var reader = Editor with { Permissions = [new("cs", true, false, false, false, false)] };
        var error = await Assert.ThrowsAsync<DomainException>(() => new OperationsService(db).UpdateWorkItemAsync(Command(item, detail), reader));
        Assert.Equal(403, error.StatusCode);
    }

    private static void AssertFeatures(JsonObject expected, JsonObject actual)
    {
        foreach (var field in new[] { "featuresBase", "featuresActive", "featuresPlus" })
            Assert.True(JsonNode.DeepEquals(expected[field], actual[field]), $"O campo {field} deve ser preservado.");
    }

    private static UpdateWorkItemCommand Command(WorkItem item, JsonObject? detail) =>
        new(item.Id, item.Title, item.Owner, 0, detail?.ToJsonString(), null, null, item.Version);

    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private static async Task<WorkItem> Seed(OperationsDbContext db, string track, string phase)
    {
        var item = new WorkItem
        {
            Module = "cs", RecordType = "Acompanhamento", Title = "Clínica", Owner = "Ana", Status = "Em acompanhamento", CreatedBy = Editor.Email,
            Description = new JsonObject
            {
                ["kind"] = "csJourney", ["track"] = track, ["phase"] = phase,
                ["featuresBase"] = new JsonArray("Agenda", "Atendimento"),
                ["featuresActive"] = new JsonArray("Agenda"),
                ["featuresPlus"] = new JsonArray("WhatsApp Automático")
            }.ToJsonString()
        };
        db.WorkItems.Add(item); await db.SaveChangesAsync(); return item;
    }
}
