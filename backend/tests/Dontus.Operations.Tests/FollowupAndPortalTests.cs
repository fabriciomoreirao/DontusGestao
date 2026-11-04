using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class FollowupAndPortalTests
{
    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static ActorContext Actor(string module) => new("ana@test", "Ana", "Colaborador", "Suporte", [new(module, true, true, true, false, false)]);

    [Theory]
    [InlineData("activation")]
    [InlineData("retention")]
    public async Task Manual_dates_and_customer_edits_preserve_history_and_creation(string track)
    {
        await using var db = Context();
        var service = new OperationsService(db);
        var actor = Actor("cs");
        var detail = JsonSerializer.Serialize(new { kind="csJourney", track, phase="tracking", clientId="123456", startDate="2026-01-02", phone="11999999999", follows=new[]{new{text="Histórico anterior"}} });
        var id = await service.CreateWorkItemAsync(new("cs", "Acompanhamento", "Clínica", null, "Clínica", "Ana", "CS", "P3", null, null, 0, detail, null, null, null, null), actor);
        var item = await db.WorkItems.SingleAsync();
        var createdAt = item.CreatedAt;
        using (var json = JsonDocument.Parse(item.Description)) Assert.Equal("2026-01-02T00:00:00-03:00", json.RootElement.GetProperty("trackingStartedAt").GetString());
        var edited = JsonSerializer.Serialize(new { kind="csJourney", track, phase="tracking", clientId="123456", startDate="2026-01-01", phone="11888888888", follows=new[]{new{text="Histórico anterior"}} });
        await service.UpdateWorkItemAsync(new(id,"Clínica editada","Bia",0,edited,null,"Clínica editada",item.Version),actor);
        Assert.Equal(createdAt,item.CreatedAt);
        Assert.Equal("Clínica editada",item.CustomerName);
        Assert.Equal("Bia",item.Owner);
        Assert.Equal("Histórico anterior",JsonDocument.Parse(item.Description).RootElement.GetProperty("follows")[0].GetProperty("text").GetString());
        Assert.Contains("2026-01-01",item.Description);
        Assert.Contains("11888888888",item.Description);
    }

    [Fact]
    public async Task Forwarding_stamps_start_once_and_rejects_invalid_dates_and_duplicate_edits()
    {
        await using var db=Context(); var service=new OperationsService(db);var actor=Actor("cs");
        var first=new WorkItem{Module="cs",Status="Pendente",CreatedBy="ana@test",RecordType="Acompanhamento",Title="Primeiro",Owner="Ana",Description="{\"kind\":\"csJourney\",\"track\":\"activation\",\"phase\":\"validation\",\"clientId\":\"123456\"}"};
        var second=new WorkItem{Module="cs",Status="Pendente",CreatedBy="ana@test",RecordType="Acompanhamento",Title="Segundo",Owner="Ana",Description="{\"kind\":\"csJourney\",\"track\":\"activation\",\"phase\":\"tracking\",\"clientId\":\"999999\"}"};
        db.WorkItems.AddRange(first,second);await db.SaveChangesAsync();
        var forwarded=first.Description.Replace("validation","tracking");
        await service.UpdateWorkItemAsync(new(first.Id,first.Title,first.Owner,0,forwarded,null,"",first.Version),actor);
        var start=JsonDocument.Parse(first.Description).RootElement.GetProperty("trackingStartedAt").GetString();
        await service.UpdateWorkItemAsync(new(first.Id,first.Title,first.Owner,0,first.Description,null,"",first.Version),actor);
        Assert.Equal(start,JsonDocument.Parse(first.Description).RootElement.GetProperty("trackingStartedAt").GetString());
        var duplicate=first.Description.Replace("123456","999999");
        Assert.Equal(409,(await Assert.ThrowsAsync<DomainException>(()=>service.UpdateWorkItemAsync(new(first.Id,first.Title,first.Owner,0,duplicate,null,"",first.Version),actor))).StatusCode);
        var invalid=JsonSerializer.Serialize(new{kind="csJourney",phase="tracking",startDate="2099-01-01"});
        await Assert.ThrowsAsync<DomainException>(()=>service.UpdateWorkItemAsync(new(first.Id,first.Title,first.Owner,0,invalid,null,"",first.Version),actor));
    }

    [Fact]
    public async Task Portal_queries_exact_ids_without_waiting_queue_access_and_returns_only_status_fields()
    {
        await using var db=Context(); var service=new OperationsService(db);var actor=Actor("dashboard");
        foreach(var code in new[]{"123456","9123456"}) db.WorkItems.Add(new WorkItem{Module="waitingQueue",RecordType="Encaminhamento do Portal",Status="Novo",CreatedBy="ana@test",Title="Clínica",Description=JsonSerializer.Serialize(new{kind="waitingQueue",clientCode=code,clientName="Clínica",departmentName="Suporte",responsibleName="",state="waiting",sentAt="2026-01-01T12:00:00Z",summary="Resumo privado",whatsapp="11999999999",imageDataUrl="Imagem privada"})});
        await db.SaveChangesAsync();
        var result=await service.GetDispatchStatusAsync("123456",actor);
        Assert.Equal("waiting",Assert.Single(result).State);
        var serialized=JsonSerializer.Serialize(result);
        Assert.DoesNotContain("privad",serialized);Assert.DoesNotContain("whatsapp",serialized,StringComparison.OrdinalIgnoreCase);
        var item=await db.WorkItems.FirstAsync();
        item.Description=item.Description.Replace("\"waiting\"","\"contacted\"");await db.SaveChangesAsync();
        Assert.Equal("contacted",Assert.Single(await service.GetDispatchStatusAsync("123456",actor)).State);
        Assert.Empty(await service.GetDispatchStatusAsync("111111",actor));
        await Assert.ThrowsAsync<DomainException>(()=>service.GetDispatchStatusAsync("abc",actor));
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.GetDispatchStatusAsync("123456",Actor("notes")))).StatusCode);
    }
}
