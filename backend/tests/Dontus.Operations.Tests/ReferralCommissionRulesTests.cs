using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class ReferralCommissionRulesTests
{
    private static readonly ActorContext Manager = new("manager@dontus.test", "Gestor", "Gestor", "Suporte",
        [new EffectivePermission("referrals", true, true, true, false, true)]);

    [Fact]
    public async Task Saves_all_rates_and_copies_every_percentage_type_and_fixed_value_to_multiple_people()
    {
        await using var db = Context();
        var (source, targets, modules) = await Seed(db);
        var service = new ReferralCommissionRulesService(db);
        var inputs = Inputs(modules);
        var revision = await service.SaveAsync(source.Id, inputs, Manager);
        await service.CopyAsync(source.Id, targets.Select(x => x.Id).ToArray(), revision, Manager);
        var rules = await db.CustomerCatalogOptions.Where(x => x.Catalog == "referralCommission" && x.Active).ToListAsync();
        Assert.Equal(6, rules.Count);
        foreach (var user in targets.Prepend(source))
        foreach (var input in inputs)
        {
            var json = rules.Select(x => JsonDocument.Parse(x.Description).RootElement).Single(x =>
                x.GetProperty("collaboratorId").GetGuid() == user.Id && x.GetProperty("moduleId").GetGuid() == input.ModuleId);
            Assert.Equal(input.Type, json.GetProperty("type").GetString());
            Assert.Equal(input.Percentage, json.GetProperty("percentage").GetDecimal());
            Assert.Equal(input.FixedCents, json.GetProperty("fixedCents").GetInt64());
        }
        Assert.Equal(3, await db.AuditEvents.CountAsync());
    }

    [Fact]
    public async Task Updates_legacy_rules_without_duplicates_and_overwrites_existing_target_rates()
    {
        await using var db = Context();
        var (source, targets, modules) = await Seed(db);
        var legacy = new CustomerCatalogOption { Catalog = "referralCommission", Name = "Regra antiga", Description = JsonSerializer.Serialize(new
        {
            type = "percentage", collaboratorName = source.DisplayName, moduleName = modules[0].Name, percentage = 1.25m, fixedCents = 123,
        }) };
        db.Add(legacy); await db.SaveChangesAsync();
        var service = new ReferralCommissionRulesService(db);
        await service.SaveAsync(targets[0].Id, Inputs(modules).Select(x => x with { Percentage = 99, FixedCents = 1 }).ToArray(), Manager);
        var revision = await service.SaveAsync(source.Id, Inputs(modules), Manager);
        await service.CopyAsync(source.Id, [targets[0].Id], revision, Manager);
        Assert.Equal(4, await db.CustomerCatalogOptions.CountAsync(x => x.Catalog == "referralCommission"));
        Assert.Equal(6.98m, JsonDocument.Parse(legacy.Description).RootElement.GetProperty("percentage").GetDecimal());
        Assert.Contains(source.Id.ToString(), legacy.Description);
    }

    [Fact]
    public async Task Invalid_or_incomplete_bulk_rules_save_nothing()
    {
        await using var db = Context();
        var (source, _, modules) = await Seed(db);
        var service = new ReferralCommissionRulesService(db);
        await Assert.ThrowsAsync<DomainException>(() => service.SaveAsync(source.Id, [Inputs(modules)[0]], Manager));
        await Assert.ThrowsAsync<DomainException>(() => service.SaveAsync(source.Id, Inputs(modules).Select(x => x with { Percentage = 101 }).ToArray(), Manager));
        Assert.False(await db.CustomerCatalogOptions.AnyAsync(x => x.Catalog == "referralCommission"));
        Assert.False(await db.AuditEvents.AnyAsync());
    }

    [Fact]
    public async Task Copy_rejects_a_blocked_target_before_altering_any_recipient()
    {
        await using var db = Context();
        var (source, targets, modules) = await Seed(db);
        var service = new ReferralCommissionRulesService(db);
        var revision = await service.SaveAsync(source.Id, Inputs(modules), Manager);
        targets[1].BlockedAt = DateTimeOffset.UtcNow; await db.SaveChangesAsync();
        await Assert.ThrowsAsync<DomainException>(() => service.CopyAsync(source.Id, targets.Select(x => x.Id).ToArray(), revision, Manager));
        Assert.Equal(2, await db.CustomerCatalogOptions.CountAsync(x => x.Catalog == "referralCommission"));
    }

    [Fact]
    public async Task Copy_rejects_changed_source_rules_instead_of_copying_unreviewed_rates()
    {
        await using var db = Context();
        var (source, targets, modules) = await Seed(db);
        var service = new ReferralCommissionRulesService(db);
        var revision = await service.SaveAsync(source.Id, Inputs(modules), Manager);
        await service.SaveAsync(source.Id, Inputs(modules).Select(x => x with { Percentage = 12 }).ToArray(), Manager);
        await Assert.ThrowsAsync<DomainException>(() => service.CopyAsync(source.Id, [targets[0].Id], revision, Manager));
        Assert.Equal(2, await db.CustomerCatalogOptions.CountAsync(x => x.Catalog == "referralCommission"));
    }

    [Fact]
    public async Task Financial_approval_permission_does_not_grant_configuration_access()
    {
        await using var db = Context();
        var (source, targets, modules) = await Seed(db);
        var actor = Manager with { Permissions = [new EffectivePermission("referrals", true, false, false, true, false)] };
        var service = new ReferralCommissionRulesService(db);
        await Assert.ThrowsAsync<DomainException>(() => service.SaveAsync(source.Id, Inputs(modules), actor));
        await Assert.ThrowsAsync<DomainException>(() => service.CopyAsync(source.Id, [targets[0].Id], "revision", actor));
        Assert.False(await db.AuditEvents.AnyAsync());
    }

    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private static ReferralCommissionRuleInput[] Inputs(CustomerCatalogOption[] modules) =>
        [new(modules[0].Id, "percentage", 6.98m, 3275), new(modules[1].Id, "fixed", 2.37m, 9876)];

    private static async Task<(AppUser Source, AppUser[] Targets, CustomerCatalogOption[] Modules)> Seed(OperationsDbContext db)
    {
        AppUser User(string name) => new() { Email = $"{name}@dontus.test", DisplayName = name, Department = "Suporte", CreatedBy = "test" };
        var source = User("Origem"); var targets = new[] { User("Destino1"), User("Destino2") };
        var modules = new[] { new CustomerCatalogOption { Catalog = "referralModule", Name = "WhatsApp" }, new CustomerCatalogOption { Catalog = "referralModule", Name = "LIA" } };
        db.Add(source); db.AddRange(targets); db.AddRange(modules); await db.SaveChangesAsync();
        return (source, targets, modules);
    }
}
