using System.Text.Json;
using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class CsDistributionTests
{
    [Fact]
    public async Task Manual_forwarding_without_a_version_or_queue_expectation_preserves_distribution_indicators()
    {
        var f = await Setup(); await using var db = f.Db;
        var item = Journey(""); db.WorkItems.Add(item); await db.SaveChangesAsync();
        var command = Command(item, f.Users[1], "", Guid.NewGuid()) with { DistributionVersion = null, ExpectedNextResponsibleUserId = null };
        await f.Service.UpdateWorkItemAsync(command, f.Actor);
        Assert.Equal("Bruno", item.Owner);
        Assert.Equal("onboarding", JsonNode.Parse(item.Description)!["phase"]!.ToString());
        var board = await Board(f);
        Assert.Equal(1, board.Collaborators.Single(user => user.UserId == f.Users[1].Id).TotalClients);
        Assert.Single(db.AuditEvents.Where(entry => entry.Action == "DistributeCustomer"));
    }

    private sealed record Fixture(OperationsDbContext Db, OperationsService Service, ActorContext Actor, AppUser[] Users, AccessGroup Group);
    private static async Task<Fixture> Setup()
    {
        var db = new OperationsDbContext(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var group = new AccessGroup { Name = "Equipe de CS", CreatedBy = "system" };
        group.Permissions.Add(new GroupPermission { GroupId = group.Id, Screen = "cs", CanView = true, CanEdit = true });
        var users = new[] { "Alice", "Bruno", "Carla" }.Select(name => new AppUser { DisplayName = name, Email = name + "@test.local", Department = "CS", CreatedBy = "system" }).ToArray();
        foreach (var user in users) user.Groups.Add(new UserAccessGroup { GroupId = group.Id, UserId = user.Id });
        db.AccessGroups.Add(group); db.Users.AddRange(users);
        foreach (var version in new[] { "Essencial", "Maxi", "Ultra" }) db.CustomerCatalogOptions.Add(new CustomerCatalogOption { Catalog = "version", Name = version });
        await db.SaveChangesAsync();
        var actor = new ActorContext("coordinator@test.local", "Coordenação", "Coordenação", "CS", [new("cs", true, true, true, true, true)]);
        return new(db, new OperationsService(db), actor, users, group);
    }
    private static WorkItem Journey(string version = "Essencial", string phase = "validation", string track = "activation", string owner = "Comercial") => new()
    {
        Module = "cs", RecordType = "Acompanhamento", Title = "Cliente " + Guid.NewGuid(), Owner = owner, CreatedBy = "system", Status = "Pendente",
        Description = JsonSerializer.Serialize(new { kind = "csJourney", phase, track, productVersion = version, clientId = Guid.NewGuid(), checkedAt = "2026-10-26T12:00:00Z" }),
    };
    private static async Task<CsDistributionDto> Board(Fixture f, string track = "activation") =>
        (await f.Service.GetCustomerModuleAsync(f.Actor)).CsDistribution.Single(board => board.Track == track);
    private static CsDistributionQueueDto Queue(CsDistributionDto board, string version = "Essencial") => board.Queues.Single(queue => queue.Version == version);
    private static UpdateWorkItemCommand Command(WorkItem item, AppUser recipient, string version, Guid expected)
    {
        var detail = JsonNode.Parse(item.Description)!.AsObject(); detail["phase"] = "onboarding";
        return new(item.Id, item.Title, recipient.DisplayName, 0, detail.ToJsonString(), null, null, item.Version, recipient.Id, version, expected);
    }
    private static async Task<AppUser> Dispatch(Fixture f, WorkItem item, string version)
    {
        var board = await Board(f); var next = Queue(board, version).SuggestedUserId!.Value;
        var user = f.Users.Single(user => user.Id == next);
        await f.Service.UpdateWorkItemAsync(Command(item, user, version, next), f.Actor); return user;
    }

    [Fact]
    public async Task Current_portfolio_counts_only_the_three_active_stages_and_keeps_versions_separate()
    {
        var f = await Setup(); await using var db = f.Db;
        db.WorkItems.AddRange(Journey("Essencial", "onboarding", owner: "Alice"), Journey("Maxi", "tracking", owner: "Alice"),
            Journey("Ultra", "conference", owner: "Alice"), Journey("Essencial", "validation", owner: "Alice"),
            Journey("Essencial", "finished", owner: "Alice"), Journey("Maxi", "cancelled", owner: "Alice"),
            Journey("Ultra", "finishedWithoutSuccess", owner: "Alice"), Journey("Maxi", "cancelledWithoutTraining", owner: "Alice"),
            Journey("Essencial", "activation", owner: "Bruno"), Journey("Maxi", "evolution", owner: "Bruno"),
            Journey("Ultra", "onboarding", "retention", "Carla"));
        await db.SaveChangesAsync();
        var board = await Board(f); var alice = board.Collaborators.Single(user => user.DisplayName == "Alice");
        Assert.Equal(3, alice.ActiveClients);
        Assert.Contains(new CsDistributionPortfolioCountDto("onboarding", "Essencial", 1), alice.CurrentPortfolio);
        Assert.Contains(new CsDistributionPortfolioCountDto("tracking", "Maxi", 1), alice.CurrentPortfolio);
        Assert.Contains(new CsDistributionPortfolioCountDto("conference", "Ultra", 1), alice.CurrentPortfolio);
        Assert.Equal(3, alice.CurrentPortfolio.Count);
        Assert.Equal(2, board.Collaborators.Single(user => user.DisplayName == "Bruno").CurrentPortfolio.Sum(entry => entry.Quantity));
        Assert.Empty(board.Collaborators.Single(user => user.DisplayName == "Carla").CurrentPortfolio);
        Assert.Single((await Board(f, "retention")).Collaborators.Single(user => user.DisplayName == "Carla").CurrentPortfolio);
    }

    [Fact]
    public async Task Current_portfolio_uses_the_current_customer_version_and_owner_instead_of_the_delivery_history()
    {
        var f = await Setup(); await using var db = f.Db;
        var customer = new Customer { LegalName = "Cliente", TradeName = "Cliente", ProductVersion = "Essencial", CreatedBy = "system" };
        var item = Journey(); item.CustomerId = customer.Id;
        db.Customers.Add(customer); db.WorkItems.Add(item); await db.SaveChangesAsync();
        await Dispatch(f, item, "Essencial");
        customer.ProductVersion = "Ultra"; item.Owner = "Bruno"; item.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
        var board = await Board(f);
        Assert.Empty(board.Collaborators.Single(user => user.DisplayName == "Alice").CurrentPortfolio);
        Assert.Equal(new CsDistributionPortfolioCountDto("onboarding", "Ultra", 1),
            Assert.Single(board.Collaborators.Single(user => user.DisplayName == "Bruno").CurrentPortfolio));
        Assert.Contains("Essencial", db.AuditEvents.Single(entry => entry.Action == "DistributeCustomer").DetailsJson);
        db.WorkItems.Remove(item); await db.SaveChangesAsync();
        Assert.All((await Board(f)).Collaborators, user => Assert.Empty(user.CurrentPortfolio));
    }

    [Fact]
    public async Task The_latest_closed_record_excludes_legacy_active_duplicates_from_current_portfolios()
    {
        var f = await Setup(); await using var db = f.Db;
        var customer = new Customer { LegalName = "Cliente", TradeName = "Cliente", ProductVersion = "Maxi", CreatedBy = "system" };
        var old = Journey(phase: "tracking", owner: "Alice"); old.CustomerId = customer.Id; old.UpdatedAt = DateTimeOffset.UtcNow.AddDays(-1);
        var latest = Journey(phase: "finished", owner: "Bruno"); latest.CustomerId = customer.Id;
        db.Customers.Add(customer); db.WorkItems.AddRange(old, latest); await db.SaveChangesAsync();
        Assert.All((await Board(f)).Collaborators, user => Assert.Empty(user.CurrentPortfolio));
    }

    [Fact]
    public async Task Suggestions_rotate_by_version_and_use_total_clients_to_balance_other_versions()
    {
        var f = await Setup(); await using var db = f.Db;
        var essential = Journey(); var maxi = Journey("Maxi"); var nextEssential = Journey(); var thirdEssential = Journey();
        db.WorkItems.AddRange(essential, maxi, nextEssential, thirdEssential); await db.SaveChangesAsync();
        Assert.Equal("Alice", (await Dispatch(f, essential, "Essencial")).DisplayName);
        Assert.Equal("Bruno", (await Dispatch(f, maxi, "Maxi")).DisplayName);
        Assert.Equal("Carla", (await Dispatch(f, nextEssential, "Essencial")).DisplayName);
        var board = await Board(f);
        Assert.Equal(f.Users[2].Id, Queue(board).LastRecipientUserId);
        Assert.Equal(f.Users[1].Id, Queue(board).SuggestedUserId);
        Assert.Equal(f.Users[0].Id, Queue(board, "Maxi").SuggestedUserId);
        Assert.Equal("Bruno", (await Dispatch(f, thirdEssential, "Essencial")).DisplayName);
        board = await Board(f);
        Assert.All(board.Collaborators, user => Assert.Equal(1, user.ClientsByVersion["Essencial"]));
        Assert.Equal(4, board.Collaborators.Sum(user => user.TotalClients));
        Assert.DoesNotContain((await Board(f, "retention")).Collaborators, user => user.TotalClients > 0);
    }

    [Fact]
    public async Task A_stale_suggestion_is_rejected_without_changing_the_client_or_the_audit()
    {
        var f = await Setup(); await using var db = f.Db;
        var first = Journey(); var second = Journey(); db.WorkItems.AddRange(first, second); await db.SaveChangesAsync();
        var stale = Queue(await Board(f)).SuggestedUserId!.Value;
        await Dispatch(f, first, "Essencial");
        var error = await Assert.ThrowsAsync<DomainException>(() => f.Service.UpdateWorkItemAsync(Command(second, f.Users[0], "Essencial", stale), f.Actor));
        Assert.Equal(409, error.StatusCode); Assert.Equal(1, second.Version);
        Assert.Equal("validation", JsonNode.Parse(second.Description)!["phase"]!.ToString());
        Assert.Single(db.AuditEvents.Where(entry => entry.Action == "DistributeCustomer"));
        Assert.Equal("Bruno", (await Dispatch(f, second, "Essencial")).DisplayName);
    }

    [Fact]
    public async Task Counts_include_old_finished_clients_but_exclude_validation_from_active_portfolios()
    {
        var f = await Setup(); await using var db = f.Db;
        var old = Journey(phase: "finished", owner: "Alice"); old.CreatedAt = DateTimeOffset.UtcNow.AddYears(-2);
        var active = Journey("Maxi", "tracking", owner: "Alice");
        var cancelled = Journey(phase: "cancelled", owner: "Bruno");
        var pending = Journey(owner: "Carla");
        db.WorkItems.AddRange(old, active, cancelled, pending); await db.SaveChangesAsync();
        var board = await Board(f); var alice = board.Collaborators.Single(user => user.DisplayName == "Alice");
        Assert.Equal(2, alice.TotalClients); Assert.Equal(1, alice.ActiveClients);
        Assert.Equal(1, alice.ClientsByVersion["Essencial"]); Assert.Equal(1, alice.ClientsByVersion["Maxi"]);
        Assert.Equal(0, board.Collaborators.Single(user => user.DisplayName == "Carla").TotalClients);
        Assert.Equal(pending.Id, Assert.Single(board.PendingClients).WorkItemId);
    }

    [Fact]
    public async Task System_version_is_resolved_from_customer_or_system_plan_without_using_addon_plan_names()
    {
        var f = await Setup(); await using var db = f.Db;
        var source = new WorkItem { Module = "commercial", RecordType = "Lead", Title = "Venda", Status = "Ganho", CreatedBy = "system", Description = "{\"products\":[{\"product\":\"Módulos\",\"plan\":\"Nota Fiscal\"},{\"product\":\"Sistema\",\"plan\":\"Essencial\"}]}" };
        var item = Journey(""); var detail = JsonNode.Parse(item.Description)!.AsObject(); detail.Remove("productVersion"); detail["sourceLeadId"] = source.Id.ToString(); item.Description = detail.ToJsonString();
        db.WorkItems.AddRange(source, item); await db.SaveChangesAsync();
        Assert.Equal("Essencial", Assert.Single((await Board(f)).PendingClients).Version);
        var customer = new Customer { LegalName = "Cliente", TradeName = "Cliente", ProductVersion = "Ultra", CreatedBy = "system" };
        item.CustomerId = customer.Id; db.Customers.Add(customer); await db.SaveChangesAsync();
        Assert.Equal("Ultra", Assert.Single((await Board(f)).PendingClients).Version);
    }

    [Fact]
    public async Task Only_active_unblocked_users_in_active_groups_with_CS_access_participate()
    {
        var f = await Setup(); await using var db = f.Db;
        f.Users[1].Active = false; f.Users[2].BlockedAt = DateTimeOffset.UtcNow;
        db.Users.Add(new AppUser { DisplayName = "Sem acesso CS", Email = "no-access@test.local", CreatedBy = "system" });
        await db.SaveChangesAsync();
        var board = await Board(f); Assert.Equal(f.Users[0].Id, Assert.Single(board.Collaborators).UserId);
        var item = Journey(); db.WorkItems.Add(item); await db.SaveChangesAsync();
        Assert.Equal(409, (await Assert.ThrowsAsync<DomainException>(() => f.Service.UpdateWorkItemAsync(Command(item, f.Users[2], "Essencial", f.Users[0].Id), f.Actor))).StatusCode);
        f.Group.Active = false; await db.SaveChangesAsync(); Assert.Empty((await Board(f)).Collaborators);
    }

    [Fact]
    public async Task Comments_cannot_rewrite_assignment_identity_or_move_the_round_robin()
    {
        var f = await Setup(); await using var db = f.Db;
        var item = Journey(); db.WorkItems.Add(item); await db.SaveChangesAsync(); await Dispatch(f, item, "Essencial");
        var previous = JsonNode.Parse(item.Description)!["distributionAssignment"]!.ToJsonString();
        var detail = JsonNode.Parse(item.Description)!.AsObject(); detail["distributionAssignment"] = new JsonObject { ["recipientUserId"] = f.Users[2].Id.ToString(), ["version"] = "Ultra" }; detail["comment"] = "Atualização";
        await f.Service.UpdateWorkItemAsync(new(item.Id, item.Title, item.Owner, 0, detail.ToJsonString(), null, null, item.Version), f.Actor);
        Assert.Equal(previous, JsonNode.Parse(item.Description)!["distributionAssignment"]!.ToJsonString());
        Assert.Single(db.AuditEvents.Where(entry => entry.Action == "DistributeCustomer"));
        Assert.Equal(f.Users[1].Id, Queue(await Board(f)).SuggestedUserId);
    }

    [Fact]
    public async Task Returning_to_validation_or_deleting_a_client_does_not_erase_the_distribution_history()
    {
        var f = await Setup(); await using var db = f.Db; var item = Journey();
        db.WorkItems.Add(item); await db.SaveChangesAsync(); await Dispatch(f, item, "Essencial");
        var detail = JsonNode.Parse(item.Description)!.AsObject(); detail["phase"] = "validation";
        await f.Service.UpdateWorkItemAsync(new(item.Id, item.Title, item.Owner, 0, detail.ToJsonString(), null, null, item.Version), f.Actor);
        var board = await Board(f); Assert.Equal(1, board.Collaborators.Single(user => user.UserId == f.Users[0].Id).TotalClients);
        Assert.Equal(0, board.Collaborators.Single(user => user.UserId == f.Users[0].Id).ActiveClients);
        await f.Service.DeleteWorkItemAsync(item.Id, f.Actor);
        Assert.Equal(1, (await Board(f)).Collaborators.Single(user => user.UserId == f.Users[0].Id).TotalClients);
        Assert.Equal(f.Users[1].Id, Queue(await Board(f)).SuggestedUserId);
    }

    [Fact]
    public async Task Duplicate_display_names_are_disambiguated_by_the_recipient_user_id()
    {
        var f = await Setup(); await using var db = f.Db;
        f.Users[1].DisplayName = f.Users[0].DisplayName; await db.SaveChangesAsync();
        var item = Journey(); db.WorkItems.Add(item); await db.SaveChangesAsync(); var board = await Board(f);
        await f.Service.UpdateWorkItemAsync(Command(item, f.Users[1], "Essencial", Queue(board).SuggestedUserId!.Value), f.Actor);
        board = await Board(f);
        Assert.Equal(1, board.Collaborators.Single(user => user.UserId == f.Users[1].Id).TotalClients);
        Assert.Equal(0, board.Collaborators.Single(user => user.UserId == f.Users[0].Id).TotalClients);
    }

    [Fact]
    public async Task Legacy_duplicates_count_a_client_once_under_the_latest_assignment_even_with_different_customer_identifiers()
    {
        var f = await Setup(); await using var db = f.Db;
        var customer = new Customer { LegalName = "Cliente", TradeName = "Cliente", DocumentMasked = "210440", CreatedBy = "system" };
        var previous = Journey(phase: "tracking", owner: "Alice"); previous.CustomerId = customer.Id; previous.CreatedAt = DateTimeOffset.UtcNow.AddDays(-2);
        var latest = Journey(phase: "tracking", owner: "Bruno"); var detail = JsonNode.Parse(latest.Description)!.AsObject(); detail["clientId"] = "210440"; latest.Description = detail.ToJsonString();
        db.Customers.Add(customer); db.WorkItems.AddRange(previous, latest); await db.SaveChangesAsync();
        var board = await Board(f);
        Assert.Equal(1, board.Collaborators.Sum(user => user.TotalClients));
        Assert.Equal(1, board.Collaborators.Sum(user => user.ActiveClients));
        Assert.Equal(0, board.Collaborators.Single(user => user.DisplayName == "Alice").ActiveClients);
        Assert.Equal(1, board.Collaborators.Single(user => user.DisplayName == "Bruno").TotalClients);
    }
}
