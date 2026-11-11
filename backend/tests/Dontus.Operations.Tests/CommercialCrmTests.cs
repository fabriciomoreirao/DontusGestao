using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class CommercialCrmTests
{
    [Fact]
    public async Task Sellers_require_an_active_commercial_membership_including_secondary_departments()
    {
        await using var db = Context();
        var commercial = new TaskDepartment { Name = " Comercial " };
        var secondCommercial = new TaskDepartment { Name = "COMERCIAL" };
        var inactive = new TaskDepartment { Name = "Comercial", Active = false };
        var support = new TaskDepartment { Name = "Suporte" };
        var otherSales = new TaskDepartment { Name = "Comercial externo" };
        db.TaskDepartments.AddRange(commercial, secondCommercial, inactive, support, otherSales);
        var users = Enumerable.Range(0, 7).Select(index => new AppUser {
            Email = $"employee{index}@example.com", DisplayName = $"Colaborador {index}",
            Department = "Comercial", CreatedBy = "test",
        }).ToArray();
        users[2].Active = false;
        users[3].BlockedAt = DateTimeOffset.UtcNow;
        db.Users.AddRange(users);
        void Link(int index, TaskDepartment department, bool primary = false) => db.UserDepartments.Add(new() {
            UserId = users[index].Id, DepartmentId = department.Id, IsPrimary = primary,
        });
        Link(0, commercial, true);
        Link(0, secondCommercial);
        Link(1, support, true);
        Link(1, commercial);
        Link(2, commercial);
        Link(3, commercial);
        Link(4, inactive);
        Link(5, otherSales);
        // User 6 has only the legacy department text, without a department link.
        await db.SaveChangesAsync();
        var service = new OperationsService(db);

        var result = await service.GetCustomerModuleAsync(Actor("commercial"));

        Assert.Equal([users[0].Id, users[1].Id], result.CommercialSellers.Select(seller => seller.Id));
        Assert.Empty(result.Collaborators);
        Assert.Empty((await service.GetCustomerModuleAsync(Actor("customers"))).CommercialSellers);
        db.UserDepartments.Remove(await db.UserDepartments.SingleAsync(link => link.UserId == users[1].Id && link.DepartmentId == commercial.Id));
        await db.SaveChangesAsync();
        Assert.Equal(users[0].Id, Assert.Single((await service.GetCustomerModuleAsync(Actor("commercial"))).CommercialSellers).Id);
    }

    [Fact]
    public async Task Creating_and_editing_a_lead_preserves_the_exact_amount_in_cents()
    {
        await using var db = Context();
        var service = new OperationsService(db);
        var actor = Actor("commercial");
        var id = await service.CreateWorkItemAsync(new("commercial", "Lead comercial", "Teste de centavos", null,
            "Cliente", "Vendedor", "Comercial", "P3", null, null, 12990,
            "{\"kind\":\"commercialLead\",\"products\":[{\"product\":\"Plano\",\"value\":129.9,\"quantity\":1}]}", [], null, null), actor);
        db.ChangeTracker.Clear();
        var created = await db.WorkItems.SingleAsync(item => item.Id == id);
        Assert.Equal(12990, created.AmountCents);
        await service.UpdateWorkItemAsync(new(id, created.Title, created.Owner, 12991, created.Description,
            null, created.CustomerName, created.Version), actor);
        db.ChangeTracker.Clear();
        Assert.Equal(12991, (await db.WorkItems.SingleAsync(item => item.Id == id)).AmountCents);
    }

    [Fact]
    public async Task Regular_viewers_receive_disabled_crm_overrides_without_other_inactive_catalogs()
    {
        await using var db = Context();
        var legacy = new CustomerCatalogOption { Catalog = "lossReason", Name = "Preço" };
        var disabled = new CustomerCatalogOption { Catalog = "commercialLossReason_alpha", Name = "Preço", Active = false };
        db.CustomerCatalogOptions.AddRange(legacy, disabled,
            new CustomerCatalogOption { Catalog = "commercialProduct", Name = "Produto antigo", Active = false },
            new CustomerCatalogOption { Catalog = "lossReason", Name = "Motivo antigo", Active = false });
        await db.SaveChangesAsync();
        var viewer = new ActorContext("viewer@example.com", "Leitor", "Colaborador", "Comercial",
            [new("commercial", true, false, false, false, false)]);

        var result = await new OperationsService(db).GetCustomerModuleAsync(viewer);

        Assert.Equal(2, result.Catalogs.Count);
        Assert.Contains(result.Catalogs, option => option.Id == legacy.Id && option.Active);
        Assert.Contains(result.Catalogs, option => option.Id == disabled.Id && !option.Active);
    }

    [Fact]
    public async Task Editing_a_crm_loss_reason_preserves_other_crms_and_legacy_reasons()
    {
        await using var db = Context();
        var service = new OperationsService(db);
        var manager = new ActorContext("manager@example.com", "Gestor", "Gestor", "Comercial",
            [new("commercial", true, true, true, true, true)]);
        var legacyId = await service.SaveCustomerCatalogAsync(null, "lossReason", "Preço", "{}", true, manager);
        var alphaId = await service.SaveCustomerCatalogAsync(null, "commercialLossReason_alpha", "Preço", "{}", true, manager);
        var betaId = await service.SaveCustomerCatalogAsync(null, "commercialLossReason_beta", "Preço", "{}", true, manager);

        await service.SaveCustomerCatalogAsync(alphaId, "commercialLossReason_alpha", "Orçamento Alpha", "{\"inheritedName\":\"Preço\"}", false, manager);
        db.ChangeTracker.Clear();

        var alpha = await db.CustomerCatalogOptions.SingleAsync(option => option.Id == alphaId);
        Assert.Equal("Orçamento Alpha", alpha.Name);
        Assert.False(alpha.Active);
        foreach (var id in new[] { legacyId, betaId })
        {
            var unchanged = await db.CustomerCatalogOptions.SingleAsync(option => option.Id == id);
            Assert.Equal("Preço", unchanged.Name);
            Assert.True(unchanged.Active);
        }
        Assert.Equal(409, (await Assert.ThrowsAsync<DomainException>(() => service.SaveCustomerCatalogAsync(
            betaId, "commercialLossReason_alpha", "Outro motivo", "{}", true, manager))).StatusCode);
    }

    [Fact]
    public async Task Scoped_loss_reasons_require_commercial_management_permission()
    {
        await using var db = Context();
        var service = new OperationsService(db);
        var error = await Assert.ThrowsAsync<DomainException>(() => service.SaveCustomerCatalogAsync(
            null, "commercialLossReason_alpha", "Preço", "{}", true, Actor("commercial")));

        Assert.Equal(403, error.StatusCode);
        Assert.Empty(db.CustomerCatalogOptions);
    }

    private static ActorContext Actor(string screen) => new("operator@example.com", "Operador", "Colaborador", "Suporte",
        [new(screen, true, true, true, false, false)]);
    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
}
