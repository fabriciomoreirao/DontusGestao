using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class LiaFormServiceTests
{
    private static ActorContext Admin => new("admin@dontus.local", "Admin", "Admin", "LIA", [new("lia", true, true, true, false, true)]);
    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static SaveLiaFormCommand Form(Guid? id = null, long? version = null) => new(id, "Diagnóstico LIA", "Sobre sua clínica", true,
        [new("name", "Nome do responsável", "text", true, []), new("tool", "Sistema", "select", true, ["Dontus", "Outro"])], version);
    private static WorkItem Client() => new() { Module = "lia", RecordType = "Projeto LIA", Title = "Clínica Teste", CustomerName = "Clínica Teste", Status = "AguardandoKickoff", CreatedBy = "admin" };
    private static string Token(object result) => JsonSerializer.SerializeToElement(result).GetProperty("token").GetString()!;

    [Fact]
    public async Task Generated_link_preserves_snapshot_records_server_time_and_cannot_be_submitted_twice()
    {
        await using var db = Context();
        var service = new LiaFormService(db, new EphemeralDataProtectionProvider());
        var client = Client(); db.WorkItems.Add(client); await db.SaveChangesAsync();
        var formId = await service.SaveFormAsync(Form(), Admin, default);
        var token = Token(await service.GenerateAsync(new(client.Id, formId), Admin, default));
        var pending = Assert.Single(await service.ListRequestsAsync(client.Id, Admin, default));
        Assert.Null(pending.SubmittedAt); Assert.Equal(token, pending.Token);
        Assert.DoesNotContain(token, (await db.LiaFormRequests.SingleAsync()).ProtectedToken);
        await service.SaveFormAsync(Form(formId, 1) with { Name = "Modelo alterado", Questions = [new("new", "Nova pergunta", "text", true, [])] }, Admin, default);
        var before = DateTimeOffset.UtcNow;
        var at = await service.SubmitAsync(token, new(new() { ["name"] = "Maria", ["tool"] = "Dontus" }), default);
        Assert.InRange(at, before, DateTimeOffset.UtcNow);
        var entry = Assert.Single(await service.ListRequestsAsync(client.Id, Admin, default));
        Assert.Equal("Diagnóstico LIA", entry.FormName); Assert.Equal("Maria", entry.Answers["name"]);
        Assert.Equal(at, entry.SubmittedAt); Assert.Equal(2, entry.Questions.Count);
        var duplicate = await Assert.ThrowsAsync<DomainException>(() => service.SubmitAsync(token, new(new() { ["name"] = "Outra", ["tool"] = "Outro" }), default));
        Assert.Equal(409, duplicate.StatusCode);
        var publicJson = JsonSerializer.Serialize(await service.GetPublicAsync(token, default));
        Assert.DoesNotContain("Maria", publicJson); Assert.DoesNotContain("TokenHash", publicJson);
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("unknown")]
    [InlineData("invalidOption")]
    [InlineData("tooLong")]
    public async Task Invalid_answers_are_rejected_without_marking_as_answered(string scenario)
    {
        await using var db = Context(); var service = new LiaFormService(db, new EphemeralDataProtectionProvider());
        var client = Client(); db.WorkItems.Add(client); await db.SaveChangesAsync();
        var form = await service.SaveFormAsync(Form(), Admin, default);
        var token = Token(await service.GenerateAsync(new(client.Id, form), Admin, default));
        var answers = new Dictionary<string, string> { ["name"] = "Maria", ["tool"] = "Dontus" };
        if (scenario == "missing") answers.Remove("name");
        if (scenario == "unknown") answers["injected"] = "value";
        if (scenario == "invalidOption") answers["tool"] = "Inválido";
        if (scenario == "tooLong") answers["name"] = new string('a', 5001);
        await Assert.ThrowsAsync<DomainException>(() => service.SubmitAsync(token, new(answers), default));
        Assert.Null((await db.LiaFormRequests.SingleAsync()).SubmittedAt);
    }

    [Fact]
    public async Task Permissions_inactive_forms_and_invalid_tokens_are_checked()
    {
        await using var db = Context(); var service = new LiaFormService(db, new EphemeralDataProtectionProvider());
        var denied = Admin with { Permissions = [] };
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.SaveFormAsync(Form(), denied, default))).StatusCode);
        await Assert.ThrowsAsync<DomainException>(() => service.ListRequestsAsync(null, denied, default));
        await Assert.ThrowsAsync<DomainException>(() => service.GenerateAsync(new(Guid.NewGuid(), Guid.NewGuid()), denied, default));
        await Assert.ThrowsAsync<DomainException>(() => service.GetPublicAsync("invalid", default));
        var client = Client(); db.WorkItems.Add(client); await db.SaveChangesAsync();
        var id = await service.SaveFormAsync(Form() with { Active = false }, Admin, default);
        await Assert.ThrowsAsync<DomainException>(() => service.GenerateAsync(new(client.Id, id), Admin, default));
        await Assert.ThrowsAsync<DomainException>(() => service.SaveFormAsync(Form(id, 0), Admin, default));
    }

    [Fact]
    public async Task Multiple_types_stay_linked_to_the_correct_client()
    {
        await using var db = Context(); var service = new LiaFormService(db, new EphemeralDataProtectionProvider());
        var first = Client(); var second = Client(); db.WorkItems.AddRange(first, second); await db.SaveChangesAsync();
        var a = await service.SaveFormAsync(Form(), Admin, default);
        var b = await service.SaveFormAsync(Form() with { Name = "Configuração" }, Admin, default);
        await service.GenerateAsync(new(first.Id, a), Admin, default);
        await service.GenerateAsync(new(first.Id, b), Admin, default);
        await service.GenerateAsync(new(second.Id, a), Admin, default);
        Assert.Equal(2, (await service.ListRequestsAsync(first.Id, Admin, default)).Count);
        Assert.Single(await service.ListRequestsAsync(second.Id, Admin, default));
    }
}
