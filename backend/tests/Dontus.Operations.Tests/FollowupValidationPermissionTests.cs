using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class FollowupValidationPermissionTests
{
    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static ActorContext Actor(bool view, bool edit, bool moduleEdit = true) => new("approver@test", "Aprovador", "Colaborador", "CS",
        [new("cs", true, false, moduleEdit, false, false), new("lia", true, false, moduleEdit, false, false), new("followupValidation", view, false, edit, false, false)]);

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Validation_clients_require_specific_view_access_but_other_stages_remain_visible(bool view)
    {
        await using var db = Context();
        WorkItem Item(string module, string phase, string status) => new() { Module = module, RecordType = "Acompanhamento", Title = phase, Status = status, CreatedBy = "tests", Description = $$"""{"kind":"{{(module == "cs" ? "csJourney" : "liaJourney")}}","phase":"{{phase}}"}""" };
        db.WorkItems.AddRange(Item("cs", "validation", "Pendente"), Item("cs", "onboarding", "Onboarding"), Item("lia", "validation", "Validacao"), Item("lia", "onboarding", "AguardandoKickoff"));
        await db.SaveChangesAsync();
        var snapshot = await new OperationsService(db).GetSnapshotAsync(Actor(view, false));
        Assert.Equal(view ? 4 : 2, snapshot.Items.Count);
        if (!view) Assert.All(snapshot.Items, item => Assert.Equal("onboarding", JsonNode.Parse(item.Description)!["phase"]!.ToString()));
    }

    [Theory]
    [InlineData("cs")]
    [InlineData("lia")]
    public async Task Module_edit_and_validation_view_cannot_modify_or_forward_validation(string module)
    {
        await using var db = Context();
        var item = new WorkItem { Module = module, RecordType = "Acompanhamento", Title = "Cliente", Owner = "Aprovador", Status = module == "cs" ? "Pendente" : "Validacao", CreatedBy = "tests",
            Description = $$"""{"kind":"{{(module == "cs" ? "csJourney" : "liaJourney")}}","phase":"validation"}""" };
        db.WorkItems.Add(item); await db.SaveChangesAsync(); var service = new OperationsService(db);
        foreach (var view in new[] { false, true })
        {
            Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.UpdateWorkItemAsync(new(item.Id, "Alterado", item.Owner, 0, item.Description, null, null, item.Version), Actor(view, false)))).StatusCode);
            Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.TransitionWorkItemAsync(new(item.Id, "Onboarding", item.Version, true, true), Actor(view, false)))).StatusCode);
        }
        Assert.Equal("Cliente", item.Title);
    }

    [Fact]
    public async Task Validation_editor_can_check_and_dispatch_CS_without_editing_other_stages()
    {
        await using var db = Context(); var service = new OperationsService(db); var actor = Actor(true, true, false);
        var user = new AppUser { Email = "cs@test", DisplayName = "Responsável CS", CreatedBy = "tests" }; db.Users.Add(user);
        var item = new WorkItem { Module = "cs", RecordType = "Acompanhamento", Title = "Cliente", Status = "Pendente", Owner = "Comercial", CreatedBy = "tests", Description = """{"kind":"csJourney","track":"activation","phase":"validation","clientId":"123456"}""" };
        db.WorkItems.Add(item); await db.SaveChangesAsync();
        var detail = JsonNode.Parse(item.Description)!.AsObject(); detail["checkedAt"] = "2020-01-01";
        await service.UpdateWorkItemAsync(new(item.Id, item.Title, item.Owner, 0, detail.ToJsonString(), null, null, item.Version), actor);
        detail = JsonNode.Parse(item.Description)!.AsObject(); Assert.Equal("Aprovador", detail["checkedBy"]!.ToString()); Assert.DoesNotContain("2020-01-01", detail["checkedAt"]!.ToString());
        detail["phase"] = "onboarding";
        await service.UpdateWorkItemAsync(new(item.Id, item.Title, user.DisplayName, 0, detail.ToJsonString(), null, null, item.Version, user.Id), actor);
        Assert.Equal("Onboarding", item.Status);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.UpdateWorkItemAsync(new(item.Id, "Outro título", item.Owner, 0, item.Description, null, null, item.Version), actor))).StatusCode);
    }

    [Fact]
    public async Task Validation_editor_can_check_and_dispatch_LIA_owned_by_another_user()
    {
        await using var db = Context(); var service = new OperationsService(db); var actor = Actor(true, true, false);
        var user = new AppUser { Email = "lia@test", DisplayName = "Responsável LIA", CreatedBy = "tests" }; db.Users.Add(user);
        var item = new WorkItem { Module = "lia", RecordType = "Projeto LIA", Title = "Cliente", Status = "Validacao", Owner = "Comercial", CreatedBy = "tests", Description = """{"kind":"liaJourney","clientId":"123456","liaPlan":"Performance","startDate":"2026-10-01","products":[]}""" };
        db.WorkItems.Add(item); db.LiaFormRequests.Add(new LiaFormRequest { WorkItemId = item.Id, FormName = "Diagnóstico", CreatedBy = "tests" }); await db.SaveChangesAsync();
        var detail = JsonNode.Parse(item.Description)!.AsObject(); detail["validationConfirmedAt"] = "2020-01-01"; detail["validationConfirmedBy"] = "Cliente";
        await service.UpdateWorkItemAsync(new(item.Id, item.Title, item.Owner, 0, detail.ToJsonString(), null, null, item.Version), actor);
        Assert.Equal("Aprovador", JsonNode.Parse(item.Description)!["validationConfirmedBy"]!.ToString());
        await service.UpdateWorkItemAsync(new(item.Id, item.Title, user.DisplayName, 0, item.Description, null, null, item.Version), actor);
        await service.TransitionWorkItemAsync(new(item.Id, "AguardandoKickoff", item.Version, true), actor);
        Assert.Equal("AguardandoKickoff", item.Status);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.UpdateWorkItemAsync(new(item.Id, "Outro título", item.Owner, 0, item.Description, null, null, item.Version), actor))).StatusCode);
    }
}
