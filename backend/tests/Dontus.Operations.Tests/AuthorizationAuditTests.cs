using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class AuthorizationAuditTests
{
    [Fact]
    public async Task Assignments_have_a_stable_event_time_that_does_not_change_when_options_are_saved()
    {
        await using var db = Context(); var item = Item("cs");
        db.WorkItems.Add(item); await db.SaveChangesAsync(); var service = new OperationsService(db); var actor = Actor("cs", edit: true);
        await service.UpdateWorkItemAsync(Update(item) with { Owner = "Novo responsável" }, actor);
        var first = Assert.Single((await service.GetSnapshotAsync(actor)).Items);
        Assert.NotNull(first.AssignedAt);
        Assert.Equal(actor.DisplayName, first.AssignedBy);
        Assert.Equal(item.CreatedBy, first.CreatedBy);
        await service.UpdateWorkItemAsync(Update(item, "{\"usage\":\"Utilizando\"}"), actor);
        var next = Assert.Single((await service.GetSnapshotAsync(actor)).Items);
        Assert.Equal(first.AssignedAt, next.AssignedAt);
        Assert.Single(db.Activities.Where(activity => activity.Kind == "Responsável alterado"));
    }

    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static ActorContext Actor(string module, bool edit = false, bool create = false, bool approve = false) =>
        new("user@test.local", "Pessoa Teste", "Colaboradores", "Suporte", [new(module, true, create, edit, approve, false)]);
    private static WorkItem Item(string module) => new() { Module = module, RecordType = "Registro", Title = "Registro protegido",
        Status = "Pendente", CreatedBy = "owner@test.local", Owner = "Pessoa Teste", CustomerName = "recipient@test.local", Description = "{}" };
    private static CreateWorkItemCommand Create(string module) => new(module, "Registro", "Novo", null, null, null, null, "P3", null, null, 0, "{}", [], null, null);
    private static UpdateWorkItemCommand Update(WorkItem item, string description = "{}") => new(item.Id, item.Title, item.Owner,
        item.AmountCents, description, null, null, item.Version);

    [Fact]
    public async Task Every_visible_module_rejects_writes_for_read_only_users()
    {
        foreach (var screen in ScreenCatalog.All)
        {
            await using var db = Context();
            var item = Item(screen.Code);
            db.WorkItems.Add(item);
            await db.SaveChangesAsync();
            var service = new OperationsService(db);
            var actor = Actor(screen.Code);
            Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.CreateWorkItemAsync(Create(screen.Code), actor))).StatusCode);
            Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.UpdateWorkItemAsync(Update(item), actor))).StatusCode);
            Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.DeleteWorkItemAsync(item.Id, actor))).StatusCode);
            Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.TransitionWorkItemAsync(new(item.Id, "Concluída", item.Version, true, true), actor))).StatusCode);
            Assert.Single(db.WorkItems);
            Assert.Empty(db.AuditEvents);
        }
    }

    [Theory]
    [InlineData("admin", "Registro", "{}", "Desenvolvimento", true, false)]
    [InlineData("ti", "Tarefa de desenvolvimento", "{\"kind\":\"developmentTask\"}", "Desenvolvimento", true, true)]
    [InlineData("ti", "Tarefa de desenvolvimento", "{\"kind\":\"developmentTask\"}", "Em espera", true, false)]
    [InlineData("ti", "Tarefa de desenvolvimento", "{\"kind\":\"developmentTask\"}", "Desenvolvimento", false, false)]
    [InlineData("ti", "Tarefa de desenvolvimento", "{\"kind\":\"invalid\"}", "Desenvolvimento", true, false)]
    [InlineData("commissions", "Registro", "{}", "Desenvolvimento", true, false)]
    [InlineData("cancellations", "Solicitação de cancelamento", "{\"kind\":\"cancellationJourney\"}", "Cancelamento", true, true)]
    [InlineData("commercial", "Lead comercial", "{\"kind\":\"commercialLead\"}", "Nova contratação", true, true)]
    [InlineData("serviceFollowup", "Acompanhamento de chamado", "{\"kind\":\"serviceRequestFollowup\"}", "Reclamação", true, true)]
    public async Task Call_routing_only_allows_the_expected_destination_with_a_real_source(string module, string type,
        string description, string sourceStatus, bool validSource, bool allowed)
    {
        await using var db = Context();
        var source = Item("serviceRequests"); source.Status = sourceStatus;
        db.WorkItems.Add(source); await db.SaveChangesAsync();
        var command = Create(module) with { RecordType = type, Description = description, OriginType = "serviceRequests",
            OriginId = validSource ? source.Id : Guid.NewGuid() };
        var service = new OperationsService(db);
        if (allowed) Assert.NotEqual(Guid.Empty, await service.CreateWorkItemAsync(command, Actor("serviceRequests", edit: true)));
        else Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.CreateWorkItemAsync(command, Actor("serviceRequests", edit: true)))).StatusCode);
    }

    [Theory]
    [InlineData("diary")]
    [InlineData("reminders")]
    public async Task Editing_permission_does_not_allow_editing_or_deleting_someone_elses_personal_record(string module)
    {
        await using var db = Context(); var item = Item(module);
        db.WorkItems.Add(item); await db.SaveChangesAsync(); var service = new OperationsService(db);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.UpdateWorkItemAsync(Update(item), Actor(module, edit: true)))).StatusCode);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.DeleteWorkItemAsync(item.Id, Actor(module, edit: true)))).StatusCode);
    }

    [Fact]
    public async Task The_general_snapshot_does_not_expose_other_users_personal_diary_entries()
    {
        await using var db = Context(); var other = Item("diary"); var own = Item("diary"); own.CreatedBy = "user@test.local";
        db.WorkItems.AddRange(other, own); await db.SaveChangesAsync();
        var snapshot = await new OperationsService(db).GetSnapshotAsync(Actor("diary"));
        Assert.Equal(own.Id, Assert.Single(snapshot.Items).Id);
    }

    [Fact]
    public async Task Reminder_recipient_can_confirm_but_cannot_rewrite_the_content_or_delete_it()
    {
        await using var db = Context(); var item = Item("reminders"); item.CustomerName = "user@test.local";
        item.Description = "{\"title\":\"Original\",\"summary\":\"Conteúdo\"}";
        db.WorkItems.Add(item); await db.SaveChangesAsync(); var service = new OperationsService(db); var actor = Actor("reminders", edit: true);
        await service.UpdateWorkItemAsync(Update(item, "{\"title\":\"Original\",\"summary\":\"Conteúdo\",\"seenAt\":\"2026-10-22T12:00:00Z\"}"), actor);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.UpdateWorkItemAsync(Update(item, "{\"summary\":\"Alterada\"}"), actor))).StatusCode);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.DeleteWorkItemAsync(item.Id, actor))).StatusCode);
    }

    [Fact]
    public async Task Commission_acknowledgement_cannot_change_values_or_the_approval()
    {
        await using var db = Context(); var item = Item("commissions"); item.AmountCents = 12000;
        item.Description = "{\"decision\":\"approved\",\"commissionCents\":12000}";
        db.WorkItems.Add(item); await db.SaveChangesAsync(); var service = new OperationsService(db); var actor = Actor("commissions", edit: true);
        await service.UpdateWorkItemAsync(Update(item, "{\"decision\":\"approved\",\"commissionCents\":12000,\"agreedAt\":\"2026-10-22T12:00:00Z\"}"), actor);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.UpdateWorkItemAsync(Update(item, item.Description) with { AmountCents = 99999 }, actor))).StatusCode);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.UpdateWorkItemAsync(Update(item, "{\"decision\":\"rejected\"}"), actor))).StatusCode);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.DeleteWorkItemAsync(item.Id, actor))).StatusCode);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.CreateWorkItemAsync(Create("commissions"), actor))).StatusCode);
        Assert.Equal(12000, item.AmountCents);
    }

    [Fact]
    public async Task Commission_identity_is_checked_even_when_two_users_have_the_same_display_name()
    {
        await using var db = Context();
        var user = new AppUser { Email = "user@test.local", DisplayName = "Pessoa Teste", CreatedBy = "system", CreatedAt = DateTimeOffset.UtcNow.AddDays(-1) };
        var own = Item("commissions");
        own.Description = $"{{\"employeeId\":\"{user.Id}\",\"decision\":\"approved\"}}";
        var other = Item("commissions");
        other.Description = $"{{\"employeeId\":\"{Guid.NewGuid()}\",\"decision\":\"approved\"}}";
        var ownSource = Item("commercial");
        var otherSource = Item("commercial"); otherSource.Owner = "Outro colaborador";
        db.Users.Add(user); db.WorkItems.AddRange(own, other, ownSource, otherSource); await db.SaveChangesAsync();
        var service = new OperationsService(db); var actor = Actor("commissions", edit: true);
        var snapshot = await service.GetSnapshotAsync(actor);
        Assert.Contains(snapshot.Items, item => item.Id == own.Id);
        Assert.DoesNotContain(snapshot.Items, item => item.Id == other.Id || item.Id == otherSource.Id);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.UpdateWorkItemAsync(Update(other, other.Description), actor))).StatusCode);
    }
}
