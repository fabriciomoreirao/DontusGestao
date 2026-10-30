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

    private static ActorContext Actor(string screen) => new("operator@example.com", "Operador", "Colaborador", "Suporte",
        [new(screen, true, true, true, false, false)]);
    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
}
