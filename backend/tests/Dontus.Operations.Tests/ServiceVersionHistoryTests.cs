using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class ServiceVersionHistoryTests
{
    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static ActorContext Actor() => new("support@test", "Suporte", "Colaborador", "Suporte", [new("support",true,true,true,false,false)]);
    private static WorkItem Record(string id, string version, DateTimeOffset date) => new()
    {
        Module="support",RecordType="Atendimento",Title="Atendimento",Status="Concluído",CreatedBy="other@test",Team="Outro setor",
        CreatedAt=date,UpdatedAt=date,Description=JsonSerializer.Serialize(new { kind="serviceRecord",clientCode=id,version }),
    };

    [Fact]
    public async Task Looks_beyond_snapshot_and_month_limits_and_returns_latest_nonempty_version_for_exact_id()
    {
        await using var db=Context();var date=DateTimeOffset.UtcNow;
        db.AddRange(Enumerable.Range(0,1005).Select(i=>Record("999999","Ultra",date.AddMinutes(-i))));
        db.AddRange(Record("210400","Essencial",date.AddYears(-2)),Record("210400","Plus",date.AddYears(-1)),Record("210400","  ",date));
        var otherId=Record("1210400","Wrong",date);db.Add(otherId);
        var otherModule=Record("210400","Wrong",date);otherModule.Module="cs";db.Add(otherModule);
        var otherType=Record("210400","Wrong",date);otherType.RecordType="Ticket";db.Add(otherType);
        var corrupt=Record("210400","Wrong",date);corrupt.Description="invalid 210400";db.Add(corrupt);
        var wrongKind=Record("210400","Wrong",date);wrongKind.Description="{\"kind\":3,\"clientCode\":\"210400\",\"version\":\"Wrong\"}";db.Add(wrongKind);
        await db.SaveChangesAsync();
        var service=new OperationsService(db);
        Assert.Equal("Plus",await service.GetServiceVersionAsync("210400",Actor()));
        Assert.Null(await service.GetServiceVersionAsync("000001",Actor()));
        Assert.Equal("Ultra",await service.GetServiceVersionAsync(" 999999 ",Actor()));
    }

    [Theory]
    [InlineData("")]
    [InlineData("21040")]
    [InlineData("1210400")]
    [InlineData("2104a0")]
    public async Task Rejects_incomplete_or_non_numeric_ids(string id)
    {
        await using var db=Context();
        Assert.Equal(400,(await Assert.ThrowsAsync<DomainException>(()=>new OperationsService(db).GetServiceVersionAsync(id,Actor()))).StatusCode);
    }

    [Fact]
    public async Task Requires_permission_to_view_attendances()
    {
        await using var db=Context();
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>new OperationsService(db).GetServiceVersionAsync("210400",Actor() with { Permissions=[] }))).StatusCode);
    }
}
