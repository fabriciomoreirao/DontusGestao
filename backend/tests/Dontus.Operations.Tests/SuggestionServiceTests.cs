using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class SuggestionServiceTests
{
    [Fact]
    public async Task Creates_sequential_protocols_and_uses_the_creator_as_responsible()
    {
        await using var db = CreateContext();
        var user = AddUser(db, "criador@dontus.local", "Criador da Sugestão");
        await db.SaveChangesAsync();
        var service = new SuggestionService(db);
        await service.InitializeAsync();
        var priority = await db.SuggestionPriorities.OrderBy(entry => entry.DisplayOrder).FirstAsync();

        var firstResult = await service.CreateSuggestionAsync(
            new CreateSuggestionCommand("Primeira melhoria", "Descrição", null, priority.Id, true, false), Actor(user));
        var secondResult = await service.CreateSuggestionAsync(
            new CreateSuggestionCommand("Segunda melhoria", null, null, priority.Id, false, true), Actor(user));

        var first = await db.Suggestions.SingleAsync(entry => entry.Id == firstResult.Id);
        var second = await db.Suggestions.SingleAsync(entry => entry.Id == secondResult.Id);
        Assert.Equal($"S{DateTimeOffset.UtcNow:yy}0001", first.Protocol);
        Assert.Equal($"S{DateTimeOffset.UtcNow:yy}0002", second.Protocol);
        Assert.Equal(first.Protocol, firstResult.Protocol);
        Assert.True(firstResult.Protocol.Length <= 20);
        Assert.Equal(user.Id, first.ResponsibleUserId);
        Assert.True(first.StrategicClient);
        Assert.True(second.CancellationRisk);
        Assert.Equal((await db.SuggestionStatuses.SingleAsync(entry => entry.IsInitial)).Id, first.StatusId);
    }

    [Fact]
    public async Task Changes_status_with_version_control_and_persists_comments()
    {
        await using var db = CreateContext();
        var user = AddUser(db, "analista@dontus.local", "Analista");
        await db.SaveChangesAsync();
        var service = new SuggestionService(db);
        await service.InitializeAsync();
        var priority = await db.SuggestionPriorities.FirstAsync();
        var targetStatus = await db.SuggestionStatuses.OrderBy(entry => entry.DisplayOrder).Skip(1).FirstAsync();
        var created = await service.CreateSuggestionAsync(
            new CreateSuggestionCommand("Melhoria comentada", null, null, priority.Id, false, false), Actor(user));
        var id = created.Id;
        var suggestion = await db.Suggestions.SingleAsync(entry => entry.Id == id);
        var originalVersion = suggestion.Version;

        await service.ChangeStatusAsync(new ChangeSuggestionStatusCommand(id, targetStatus.Id, originalVersion), Actor(user));
        await service.AddCommentAsync(new AddSuggestionCommentCommand(id, "Concordo com a análise."), Actor(user));
        var module = await service.GetModuleAsync(Actor(user));

        var result = Assert.Single(module.Suggestions);
        Assert.Equal(targetStatus.Id, result.StatusId);
        Assert.Equal("Concordo com a análise.", Assert.Single(result.Comments).Body);
        await Assert.ThrowsAsync<DomainException>(() => service.ChangeStatusAsync(
            new ChangeSuggestionStatusCommand(id, targetStatus.Id, originalVersion), Actor(user)));
    }

    [Fact]
    public async Task Keeps_only_one_initial_status_when_catalog_is_changed()
    {
        await using var db = CreateContext();
        var user = AddUser(db, "gestor@dontus.local", "Gestor");
        await db.SaveChangesAsync();
        var service = new SuggestionService(db);
        await service.InitializeAsync();

        var newStatusId = await service.SaveStatusAsync(
            new SaveSuggestionStatusCommand(null, "Triagem executiva", "Status para triagem da gestão.", "Triagem", "#123456", 5, true, true), Actor(user));

        Assert.Equal(newStatusId, (await db.SuggestionStatuses.SingleAsync(entry => entry.IsInitial)).Id);
    }

    private static AppUser AddUser(OperationsDbContext db, string email, string name)
    {
        var user = new AppUser { Email = email, DisplayName = name, Department = "Produto", CreatedBy = "tests@dontus.local" };
        db.Users.Add(user);
        return user;
    }

    private static ActorContext Actor(AppUser user) => new(
        user.Email, user.DisplayName, "Administrador", user.Department,
        [
            new EffectivePermission("suggestions", true, true, true, false, false),
            new EffectivePermission("admin", true, true, true, true, true),
        ]);

    private static OperationsDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<OperationsDbContext>()
            .UseInMemoryDatabase($"dontus-suggestion-tests-{Guid.NewGuid():N}")
            .Options;
        return new OperationsDbContext(options);
    }
}
