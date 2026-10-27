using System.Text.Json;
using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Dontus.Operations.Tests;

public sealed class CommissionsAndReferralsAccessTests
{
    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static AccessControlService Access(OperationsDbContext db) => new(db, new ConfigurationBuilder().Build());

    private static async Task<(ActorContext Actor, AppUser User, AppUser Other)> Profile(
        OperationsDbContext db, bool coordinator = false, bool supervisor = false)
    {
        // Identical names must not give one employee access to the other's data.
        var user = new AppUser { Email = "own@test.local", DisplayName = "Mesmo Nome", Department = "Comercial", IsCoordinator = coordinator, CreatedBy = "system" };
        var other = new AppUser { Email = "other@test.local", DisplayName = user.DisplayName, Department = "CS", CreatedBy = "system" };
        var group = new AccessGroup { Name = "Coordenador apenas no nome do grupo", CreatedBy = "system" };
        foreach (var module in new[] { "commissions", "referrals" })
            group.Permissions.Add(new GroupPermission { GroupId = group.Id, Screen = module, CanView = true,
                CanCreate = module == "referrals", CanEdit = true, CanApprove = supervisor });
        user.Groups.Add(new UserAccessGroup { UserId = user.Id, GroupId = group.Id });
        db.AccessGroups.Add(group); db.Users.AddRange(user, other); await db.SaveChangesAsync();
        return (await Access(db).ResolveActorAsync(new(user.Email, user.DisplayName)), user, other);
    }

    private static WorkItem Referral(AppUser user) => new()
    {
        Module = "referrals", RecordType = "Indicação", Title = "Profissional", Owner = user.DisplayName,
        CreatedBy = user.Email, Status = "Em acompanhamento",
        Description = JsonSerializer.Serialize(new { kind = "referral", phase = "tracking", senderName = user.DisplayName,
            senderDepartment = user.Department, reviewer = "", decisionAt = "", decisionReason = "" }),
    };
    private static WorkItem Commission(AppUser user) => new()
    {
        Module = "commissions", RecordType = "Comissão", Title = "Comissão", Owner = user.DisplayName,
        CreatedBy = "supervisor@test.local", Status = "Aprovada", AmountCents = 1000,
        Description = JsonSerializer.Serialize(new { kind = "commissionRecord", employeeId = user.Id, decision = "approved", commissionCents = 1000 }),
    };
    private static UpdateWorkItemCommand Update(WorkItem item, string? description = null) =>
        new(item.Id, item.Title, item.Owner, item.AmountCents, description ?? item.Description, null, null, item.Version);
    private static string Patch(WorkItem item, string key, string value)
    {
        var detail = JsonNode.Parse(item.Description)!.AsObject(); detail[key] = value; return detail.ToJsonString();
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public async Task Coordinators_and_supervisors_manage_both_modules_without_administration(bool coordinator, bool supervisor)
    {
        await using var db = Context(); var (actor, user, other) = await Profile(db, coordinator, supervisor);
        foreach (var module in new[] { "commissions", "referrals" })
            foreach (var action in new[] { "view", "create", "edit", "approve", "manage" }) Assert.True(actor.HasPermission(module, action));
        Assert.False(actor.HasPermission("admin", "manage"));
        Assert.False(actor.HasPermission("catalogs", "manage"));
        Assert.False(actor.HasPermission("commercial", "manage"));
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => Access(db).GetManagementAsync(actor))).StatusCode);

        var referral = Referral(other); var commission = Commission(other);
        db.WorkItems.AddRange(referral, commission); await db.SaveChangesAsync(); var service = new OperationsService(db);
        Assert.Equal(2, (await service.GetSnapshotAsync(actor)).Items.Count);
        await service.UpdateWorkItemAsync(Update(referral, Patch(referral, "phase", "approved")), actor);
        await service.UpdateWorkItemAsync(Update(commission) with { AmountCents = 2000 }, actor);
        Assert.Equal(2000, commission.AmountCents);
        foreach (var catalog in new[] { "commissionRule", "referralModule", "referralUsageStatus", "referralCommission" })
        {
            var id = await service.SaveCustomerCatalogAsync(null, catalog, catalog, "{}", true, actor);
            await service.SaveCustomerCatalogAsync(id, catalog, catalog + " atualizado", "{}", false, actor);
            Assert.Contains((await service.GetCustomerModuleAsync(actor)).Catalogs, entry => entry.Id == id && !entry.Active);
            await service.DeleteCustomerCatalogAsync(id, actor);
        }
        Assert.Equal(2, (await service.GetCustomerModuleAsync(actor)).Collaborators.Count);
        await service.DeleteWorkItemAsync(referral.Id, actor);
        await service.DeleteWorkItemAsync(commission.Id, actor);
        Assert.Empty(db.WorkItems);
    }

    [Fact]
    public async Task Coordinator_flag_is_effective_immediately_and_does_not_depend_on_group_names_or_administration()
    {
        await using var db = Context(); var (_, user, _) = await Profile(db);
        var access = Access(db);
        user.IsCoordinator = true; await db.SaveChangesAsync();
        Assert.True((await access.ResolveActorAsync(new(user.Email, user.DisplayName))).HasPermission("commissions", "manage"));
        user.IsCoordinator = false; await db.SaveChangesAsync();
        var ordinary = await access.ResolveActorAsync(new(user.Email, user.DisplayName));
        Assert.False(ordinary.HasPermission("commissions", "manage"));
        Assert.False(ordinary.HasPermission("referrals", "approve"));
    }

    [Fact]
    public async Task Ordinary_employees_receive_only_their_records_rules_and_collaborator_even_with_identical_names()
    {
        await using var db = Context(); var (actor, user, other) = await Profile(db);
        var ownReferral = Referral(user); var otherReferral = Referral(other);
        var ownCommission = Commission(user); var otherCommission = Commission(other);
        var ownCustomer = new Customer { LegalName = "Cliente próprio", TradeName = "", CreatedBy = "system" };
        var otherCustomer = new Customer { LegalName = "Cliente de outro colaborador", TradeName = "", CreatedBy = "system" };
        ownCommission.CustomerId = ownCustomer.Id; otherCommission.CustomerId = otherCustomer.Id;
        db.Customers.AddRange(ownCustomer, otherCustomer);
        db.WorkItems.AddRange(ownReferral, otherReferral, ownCommission, otherCommission);
        foreach (var employee in new[] { user, other })
        {
            db.CustomerCatalogOptions.Add(new CustomerCatalogOption { Catalog = "commissionRule", Name = employee.Email,
                Description = JsonSerializer.Serialize(new { employeeId = employee.Id, employeeName = employee.DisplayName }) });
            db.CustomerCatalogOptions.Add(new CustomerCatalogOption { Catalog = "referralCommission", Name = employee.Email,
                Description = JsonSerializer.Serialize(new { collaboratorId = employee.Id, collaboratorName = employee.DisplayName }) });
        }
        await db.SaveChangesAsync(); var service = new OperationsService(db);
        var snapshot = await service.GetSnapshotAsync(actor);
        Assert.Equal(new[] { ownReferral.Id, ownCommission.Id }.Order(), snapshot.Items.Select(item => item.Id).Order());
        Assert.Equal(ownCustomer.Id, Assert.Single(snapshot.Customers).Id);
        var module = await service.GetCustomerModuleAsync(actor);
        Assert.Equal(user.Id, Assert.Single(module.Collaborators).Id);
        Assert.Equal(2, module.Catalogs.Count);
        Assert.All(module.Catalogs, entry => Assert.Equal(user.Email, entry.Name));

        foreach (var item in new[] { otherReferral, otherCommission })
        {
            Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.UpdateWorkItemAsync(Update(item), actor))).StatusCode);
            Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.DeleteWorkItemAsync(item.Id, actor))).StatusCode);
            Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.TransitionWorkItemAsync(new(item.Id, "Concluída", item.Version, true), actor))).StatusCode);
        }
        foreach (var catalog in new[] { "commissionRule", "referralModule", "referralUsageStatus", "referralCommission" })
            Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.SaveCustomerCatalogAsync(null, catalog, "Indevido", "{}", true, actor))).StatusCode);
    }

    [Fact]
    public async Task An_employee_can_send_their_referral_for_review_and_acknowledge_commission_but_cannot_approve_or_impersonate_others()
    {
        await using var db = Context(); var (actor, user, other) = await Profile(db);
        var referral = Referral(user); var commission = Commission(user);
        db.WorkItems.AddRange(referral, commission); await db.SaveChangesAsync(); var service = new OperationsService(db);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.UpdateWorkItemAsync(Update(referral, Patch(referral, "phase", "approved")), actor))).StatusCode);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.UpdateWorkItemAsync(Update(referral) with { Owner = "Outra pessoa" }, actor))).StatusCode);
        await service.UpdateWorkItemAsync(Update(referral, Patch(referral, "phase", "conference")), actor);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.DeleteWorkItemAsync(referral.Id, actor))).StatusCode);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.UpdateWorkItemAsync(Update(referral, Patch(referral, "phase", "approved")), actor))).StatusCode);
        await service.UpdateWorkItemAsync(Update(commission, Patch(commission, "agreedAt", DateTimeOffset.UtcNow.ToString("O"))), actor);

        var command = new CreateWorkItemCommand("referrals", "Indicação", "Nova", null, null, "Outra pessoa", null, "P3", null, null, 0, Referral(user).Description, [], null, null);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.CreateWorkItemAsync(command, actor))).StatusCode);
        var id = await service.CreateWorkItemAsync(command with { Owner = user.DisplayName, Description = Referral(other).Description }, actor);
        var created = await db.WorkItems.SingleAsync(item => item.Id == id);
        Assert.Equal(user.Email, created.CreatedBy);
        Assert.Equal(user.Department, JsonNode.Parse(created.Description)!["senderDepartment"]!.ToString());
    }
}
