using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class CommissionScoreRuleTests
{
    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static ActorContext Manager() => new("coordinator@test.local", "Coordenador", "Coordenação", "CS", [new("commissions", true, true, true, true, true)]);
    private static string Rule(string tiers, string scope = "cs", string type = "percentage") =>
        $$"""{"kind":"commissionRule","scope":"{{scope}}","type":"{{type}}","value":0,"scoreTiers":{{tiers}}} """;

    [Theory]
    [InlineData(0,0)][InlineData(49.99,0)][InlineData(50,5000)][InlineData(74.99,5000)]
    [InlineData(75,10000)][InlineData(100,10000)][InlineData(100.01,15000)][InlineData(200,15000)][InlineData(450,15000)]
    public async Task Approval_calculates_score_bands_on_the_server(decimal score,long expected)
    {
        await using var db=Context();var employee=Guid.NewGuid();
        db.CustomerCatalogOptions.Add(new CustomerCatalogOption { Catalog="commissionRule",Name="CS",Description=JsonSerializer.Serialize(new { kind="commissionRule",scope="cs",employeeId=employee,product="*",type="percentage",value=0,scoreTiers=new object[]{new{min=0,max=(int?)50,percentage=0},new{min=50,max=(int?)75,percentage=5},new{min=75,max=(int?)100,percentage=10},new{min=100,max=(int?)null,percentage=15}} }) });await db.SaveChangesAsync();
        var detail=JsonSerializer.Serialize(new { kind="commissionRecord",sourceKey=Guid.NewGuid(),scope="cs",competence="2026-10",employeeId=employee,employeeName="Ana",customerName="Clínica",product="Dontus",saleValueCents=100000,score,decision="approved",reason="Valores conferidos" });
        var id=await new OperationsService(db).CreateWorkItemAsync(new("commissions","Comissão","Cliente",null,"Cliente","Ana","CS","P3",null,null,99999,detail,[],null,null,"Aprovada"),Manager());
        Assert.Equal(expected,(await db.WorkItems.SingleAsync(x=>x.Id==id)).AmountCents);
    }

    [Fact]
    public async Task Positive_percentage_requires_the_customer_base_before_approval()
    {
        await using var db=Context();db.CustomerCatalogOptions.Add(new CustomerCatalogOption { Catalog="commissionRule",Name="CS",Description="{\"scope\":\"cs\",\"employeeName\":\"Ana\",\"product\":\"*\",\"type\":\"percentage\",\"value\":15}" });await db.SaveChangesAsync();
        var detail="{\"kind\":\"commissionRecord\",\"sourceKey\":\"customer\",\"scope\":\"cs\",\"employeeName\":\"Ana\",\"product\":\"Dontus\",\"saleValueCents\":0,\"decision\":\"approved\",\"reason\":\"Conferido\"}";
        var error=await Assert.ThrowsAsync<DomainException>(()=>new OperationsService(db).CreateWorkItemAsync(new("commissions","Comissão","Cliente",null,"Cliente","Ana","CS","P3",null,null,0,detail,[],null,null,"Aprovada"),Manager()));
        Assert.Contains("valor base",error.Message);Assert.Empty(db.WorkItems);
    }

    [Fact]
    public async Task Score_bands_can_be_saved_changed_and_read_without_losing_their_percentages()
    {
        await using var db = Context(); var service = new OperationsService(db); var actor = Manager();
        const string tiers = "[{\"min\":0,\"max\":50,\"percentage\":5},{\"min\":50,\"max\":75,\"percentage\":10},{\"min\":75,\"max\":100,\"percentage\":15}]";
        var id = await service.SaveCustomerCatalogAsync(null, "commissionRule", "CS por score", Rule(tiers), true, actor);
        var saved = Assert.Single((await service.GetCustomerModuleAsync(actor)).Catalogs);
        Assert.Equal(3, JsonDocument.Parse(saved.Description).RootElement.GetProperty("scoreTiers").GetArrayLength());
        var updated = Rule(tiers.Replace("\"percentage\":10", "\"percentage\":12.5"));
        await service.SaveCustomerCatalogAsync(id, "commissionRule", "CS por score", updated, true, actor);
        Assert.Equal(updated.Trim(), (await db.CustomerCatalogOptions.SingleAsync()).Description);
    }

    [Theory]
    [InlineData("[]")]
    [InlineData("[{\"min\":1,\"max\":100,\"percentage\":10}]")]
    [InlineData("[{\"min\":0,\"max\":95,\"percentage\":10}]")]
    [InlineData("[{\"min\":0,\"max\":100,\"percentage\":101}]")]
    [InlineData("[{\"min\":0,\"max\":100,\"percentage\":-1}]")]
    [InlineData("[{\"min\":0,\"max\":50,\"percentage\":5},{\"min\":49,\"max\":100,\"percentage\":10}]")]
    [InlineData("[{\"min\":0,\"max\":50,\"percentage\":5},{\"min\":51,\"max\":100,\"percentage\":10}]")]
    [InlineData("[{\"min\":0,\"max\":100,\"percentage\":\"dez\"}]")]
    public async Task Invalid_score_bands_cannot_be_persisted(string tiers)
    {
        await using var db = Context(); var service = new OperationsService(db);
        var error = await Assert.ThrowsAsync<DomainException>(() => service.SaveCustomerCatalogAsync(null, "commissionRule", "Inválida", Rule(tiers), true, Manager()));
        Assert.Equal(400, error.StatusCode); Assert.Empty(db.CustomerCatalogOptions);
    }

    [Theory]
    [InlineData("lia", "percentage")]
    [InlineData("commercial", "percentage")]
    [InlineData("cs", "fixed")]
    public async Task Score_bands_are_exclusive_to_percentage_rules_in_customer_success(string scope, string type)
    {
        await using var db = Context(); var service = new OperationsService(db);
        Assert.Equal(400, (await Assert.ThrowsAsync<DomainException>(() => service.SaveCustomerCatalogAsync(null, "commissionRule", "Inválida",
            Rule("[{\"min\":0,\"max\":100,\"percentage\":5}]", scope, type), true, Manager()))).StatusCode);
    }
}
