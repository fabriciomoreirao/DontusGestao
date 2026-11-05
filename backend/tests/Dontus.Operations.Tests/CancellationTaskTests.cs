using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class CancellationTaskTests
{
    private static readonly ActorContext Actor = new("gestor@dontus.local", "Colaborador", "Colaborador", "Suporte",
        [new("tasks", true, true, true, false, false), new("cancellations", true, true, true, false, false)]);
    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static async Task<(CancellationTaskService Service, WorkItem Source, CreateCorporateTaskCommand Draft)> Setup(OperationsDbContext db)
    {
        var user = new AppUser { Email = Actor.Email, DisplayName = Actor.DisplayName, CreatedBy = "tests" };
        var customer = new Customer { LegalName = "Clínica", TradeName = "Clínica", DocumentMasked = "250105", CreatedBy = "tests" };
        db.AddRange(user, customer); await db.SaveChangesAsync();
        var tasks = new TaskService(db); await tasks.InitializeAsync();
        var department = await db.TaskDepartments.SingleAsync(entry => entry.Name == "Suporte");
        var type = await db.TaskTypes.SingleAsync();
        var source = new WorkItem { Module = "cancellations", RecordType = "Solicitação de cancelamento", Title = "Clínica", CustomerId = customer.Id, CustomerName = "Clínica", Owner = "Reversão", Status = "Em processo", CreatedBy = Actor.Email,
            Description = """{"kind":"cancellationJourney","protocol":"C260002","clientId":"250105","customerName":"Clínica","seller":"Vendedor","csOwner":"CS","reversalOwner":"Reversão","history":[{"id":"original","text":"Solicitação registrada"}]}""" };
        db.WorkItems.Add(source); await db.SaveChangesAsync();
        var draft = new CreateCorporateTaskCommand("Verificar migração", "Analisar solicitação", type.Id, null, null, department.Id, department.Id, null,
            Guid.NewGuid(), "outro-id", "Outro cliente", "83999999999", null, null, null, null, false, [], []);
        return (new CancellationTaskService(db, tasks), source, draft);
    }

    [Fact]
    public async Task Creates_a_real_task_and_links_both_histories_without_changing_the_cancellation_roles_or_status()
    {
        await using var db = Context(); var (service, source, draft) = await Setup(db);
        var id = source.Id; var version = source.Version; var customerId = source.CustomerId; var requestId = Guid.NewGuid();
        var result = await service.CreateAsync(id, version, requestId, draft, Actor);
        var task = await db.CorporateTasks.SingleAsync(); var saved = await db.WorkItems.SingleAsync(); var detail = JsonNode.Parse(saved.Description)!;
        Assert.Equal(result.Id, task.Id); Assert.Matches(@"^T\d{6,}$", result.Protocol);
        Assert.Equal(draft.CurrentDepartmentId, task.CurrentDepartmentId); Assert.Equal(task.SourceDepartmentId, task.CurrentDepartmentId);
        Assert.Equal(customerId, task.CustomerId); Assert.Equal("250105", task.CustomerCode); Assert.Equal("Clínica", task.CustomerName);
        Assert.Contains("C260002", task.Description); Assert.Contains(id.ToString(), task.ExternalLink);
        Assert.Equal("Em processo", saved.Status); Assert.Equal("Reversão", saved.Owner); Assert.Equal("CS", detail["csOwner"]!.ToString()); Assert.Equal("Vendedor", detail["seller"]!.ToString());
        var link = detail["history"]!.AsArray().Last()!;
        Assert.Equal(task.Id.ToString(), link["taskId"]!.ToString()); Assert.Equal(task.Protocol, link["taskProtocol"]!.ToString()); Assert.Equal(Actor.DisplayName, link["author"]!.ToString());
        Assert.Contains(db.TaskHistory, entry => entry.TaskId == task.Id && entry.Source == "cancellations" && entry.Summary.Contains("C260002"));
        Assert.Empty(db.TaskComments); Assert.Equal(version + 1, saved.Version);
        var retry = await service.CreateAsync(id, version, requestId, draft, Actor);
        Assert.Equal(result, retry); Assert.Single(db.CorporateTasks);
        Assert.Equal(2, JsonNode.Parse((await db.WorkItems.SingleAsync()).Description)!["history"]!.AsArray().Count);
    }

    [Fact]
    public async Task New_tasks_are_allowed_and_old_versions_are_rejected_without_creating_another_task()
    {
        await using var db = Context(); var (service, source, draft) = await Setup(db); var originalVersion = source.Version;
        await service.CreateAsync(source.Id, originalVersion, Guid.NewGuid(), draft, Actor);
        Assert.Equal(409, (await Assert.ThrowsAsync<DomainException>(() => service.CreateAsync(source.Id, originalVersion, Guid.NewGuid(), draft, Actor))).StatusCode);
        Assert.Single(db.CorporateTasks);
        var current = await db.WorkItems.AsNoTracking().SingleAsync();
        await service.CreateAsync(source.Id, current.Version, Guid.NewGuid(), draft, Actor);
        Assert.Equal(2, await db.CorporateTasks.CountAsync());
    }

    [Theory]
    [InlineData("tasks")]
    [InlineData("cancellations")]
    public async Task Requires_both_cancellation_edit_and_task_creation(string missing)
    {
        await using var db = Context(); var (service, source, draft) = await Setup(db);
        var denied = Actor with { Permissions = Actor.Permissions!.Where(permission => permission.Screen != missing).ToArray() };
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.CreateAsync(source.Id, source.Version, Guid.NewGuid(), draft, denied))).StatusCode);
        Assert.Empty(db.CorporateTasks);
    }

    [Fact]
    public async Task Invalid_tasks_and_foreign_departments_do_not_append_history()
    {
        await using var db = Context(); var (service, source, draft) = await Setup(db);
        await Assert.ThrowsAsync<DomainException>(() => service.CreateAsync(source.Id, source.Version, Guid.NewGuid(), draft with { ClientWhatsApp = "" }, Actor));
        var other = await db.TaskDepartments.SingleAsync(entry => entry.Name == "Desenvolvimento");
        db.UserDepartments.RemoveRange(await db.UserDepartments.Where(entry => entry.DepartmentId == other.Id).ToArrayAsync()); await db.SaveChangesAsync();
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.CreateAsync(source.Id, source.Version, Guid.NewGuid(), draft with { CurrentDepartmentId = other.Id }, Actor))).StatusCode);
        Assert.Empty(db.CorporateTasks); Assert.Single(JsonNode.Parse((await db.WorkItems.SingleAsync()).Description)!["history"]!.AsArray());
    }
}
