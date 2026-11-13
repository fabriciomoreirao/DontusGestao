using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class LiaFormFileTests
{
    private static readonly ActorContext Admin = new("admin@dontus.local", "Admin", "Admin", "LIA", [new("lia", true, true, true, false, true)]);
    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static readonly LiaFormQuestion[] Questions = [new("name", "Nome", "text", true, []), new("files", "Documentos", "file", true, []), new("optional", "Outros arquivos", "file", false, [])];
    private static async Task<(Guid ClientId, Guid FormId, string Token)> Setup(OperationsDbContext db, LiaFormService service)
    {
        var client = new WorkItem { Module = "lia", RecordType = "Projeto LIA", Status = "Validacao", Title = "Clínica de teste", CustomerName = "Clínica de teste", CreatedBy = "admin" };
        db.WorkItems.Add(client); await db.SaveChangesAsync();
        var formId = await service.SaveFormAsync(new(null, "Cadastro", "", true, Questions, null), Admin, default);
        var generated = JsonSerializer.SerializeToElement(await service.GenerateAsync(new(client.Id, formId), Admin, default));
        return (client.Id, formId, generated.GetProperty("token").GetString()!);
    }
    private static UploadLiaFormFile Upload(string name = "arquivo.pdf", string type = "application/pdf", string question = "files") =>
        new(question, name, type, 7, new MemoryStream("arquivo"u8.ToArray()));

    [Theory]
    [InlineData("dados.pdf", "application/pdf")]
    [InlineData("foto.jpg", "image/jpeg")]
    [InlineData("vídeo.mp4", "video/mp4")]
    [InlineData("áudio.ogg", "audio/ogg")]
    [InlineData("planilha.xlsx", "application/octet-stream")]
    public async Task Files_are_saved_against_their_question_and_can_be_downloaded_only_with_Lia_access(string name, string type)
    {
        await using var db = Context(); var service = new LiaFormService(db, new EphemeralDataProtectionProvider());
        var (clientId, _, token) = await Setup(db, service);
        await service.SubmitAsync(token, new(new() { ["name"] = "Maria" }), default, [Upload(name, type), Upload("outro.pdf")]);
        db.ChangeTracker.Clear();
        var response = Assert.Single(await service.ListRequestsAsync(clientId, Admin, default));
        Assert.Equal(2, response.Attachments.Count);
        var file = Assert.Single(response.Attachments, x => x.FileName == name);
        Assert.Equal("files", file.QuestionId); Assert.Equal(type, file.ContentType); Assert.Equal(7, file.SizeBytes);
        var download = await service.GetAttachmentAsync(file.Id, Admin, default);
        Assert.Equal("arquivo"u8.ToArray(), download.Content); Assert.Equal(name, download.FileName);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.GetAttachmentAsync(file.Id, Admin with { Permissions = [] }, default))).StatusCode);
        Assert.Equal(404, (await Assert.ThrowsAsync<DomainException>(() => service.GetAttachmentAsync(Guid.NewGuid(), Admin, default))).StatusCode);
        var publicData = JsonSerializer.Serialize(await service.GetPublicAsync(token, default));
        Assert.DoesNotContain(name, publicData); Assert.DoesNotContain("StorageKey", publicData); Assert.DoesNotContain("Maria", publicData);
        Assert.DoesNotContain("Content\"", JsonSerializer.Serialize(response));
        Assert.Equal("", response.Answers["optional"]);
        Assert.Equal(409, (await Assert.ThrowsAsync<DomainException>(() => service.SubmitAsync(token, new(new() { ["name"] = "Maria" }), default, [Upload()]))).StatusCode);
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("unknownQuestion")]
    [InlineData("textQuestion")]
    [InlineData("forgedAnswer")]
    [InlineData("empty")]
    [InlineData("oversize")]
    [InlineData("truncated")]
    [InlineData("tooManyPerQuestion")]
    [InlineData("tooManyTotal")]
    [InlineData("tooLargeTotal")]
    public async Task Invalid_uploads_do_not_submit_the_form(string scenario)
    {
        await using var db = Context(); var service = new LiaFormService(db, new EphemeralDataProtectionProvider());
        var (_, _, token) = await Setup(db, service);
        var answers = new Dictionary<string, string> { ["name"] = "Maria" };
        List<UploadLiaFormFile> files = [Upload()];
        if (scenario == "missing") files.Clear();
        if (scenario == "unknownQuestion") files = [Upload(question: "unknown")];
        if (scenario == "textQuestion") files = [Upload(question: "name")];
        if (scenario == "forgedAnswer") answers["files"] = "arquivo.pdf";
        if (scenario == "empty") files = [Upload() with { SizeBytes = 0 }];
        if (scenario == "oversize") files = [Upload() with { SizeBytes = LiaFormService.MaximumFileBytes + 1 }];
        if (scenario == "truncated") files = [Upload() with { SizeBytes = 8 }];
        if (scenario == "tooManyPerQuestion") files = Enumerable.Range(0, 11).Select(_ => Upload()).ToList();
        if (scenario == "tooManyTotal") files = Enumerable.Range(0, 21).Select(_ => Upload()).ToList();
        if (scenario == "tooLargeTotal") files = Enumerable.Range(0, 3).Select(_ => Upload() with { SizeBytes = LiaFormService.MaximumFileBytes }).ToList();
        await Assert.ThrowsAsync<DomainException>(() => service.SubmitAsync(token, new(answers), default, files));
        Assert.Null((await db.LiaFormRequests.SingleAsync()).SubmittedAt);
        Assert.Empty(await db.LiaFormAttachments.AsNoTracking().ToListAsync());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Uses_external_storage_or_persistent_database_fallback(bool unavailable)
    {
        await using var db = Context(); var storage = new Storage(unavailable);
        var service = new LiaFormService(db, new EphemeralDataProtectionProvider(), storage);
        var (_, _, token) = await Setup(db, service);
        await service.SubmitAsync(token, new(new() { ["name"] = "Maria" }), default, [Upload(@"C:\fakepath\dados.pdf")]);
        var file = await db.LiaFormAttachments.SingleAsync(); Assert.Equal("dados.pdf", file.FileName);
        var download = await service.GetAttachmentAsync(file.Id, Admin, default);
        if (unavailable) Assert.Equal("arquivo"u8.ToArray(), download.Content);
        else { Assert.Null(file.Content); Assert.Equal("https://storage.example.test/file", download.Url); }
    }

    [Fact]
    public async Task Uncommitted_external_uploads_are_removed_when_a_later_file_is_truncated()
    {
        await using var db = Context(); var storage = new Storage(false);
        var service = new LiaFormService(db, new EphemeralDataProtectionProvider(), storage);
        var (_, _, token) = await Setup(db, service);
        await Assert.ThrowsAsync<DomainException>(() => service.SubmitAsync(token, new(new() { ["name"] = "Maria" }), default, [Upload(), Upload() with { SizeBytes = 8 }]));
        Assert.Single(storage.Deleted); Assert.Empty(await db.LiaFormAttachments.AsNoTracking().ToListAsync());
        Assert.Null((await db.LiaFormRequests.SingleAsync()).SubmittedAt);
    }

    [Fact]
    public async Task Reordering_changes_new_links_but_preserves_the_original_request_and_question_ids()
    {
        await using var db = Context(); var service = new LiaFormService(db, new EphemeralDataProtectionProvider());
        var (client, form, _) = await Setup(db, service);
        await service.SaveFormAsync(new(form, "Cadastro", "", true, Questions.Reverse().ToArray(), 1), Admin, default);
        await service.GenerateAsync(new(client, form), Admin, default);
        var requests = await service.ListRequestsAsync(client, Admin, default);
        Assert.Equal(Questions.Select(q => q.Id), requests.OrderBy(x => x.CreatedAt).First().Questions.Select(q => q.Id));
        Assert.Equal(Questions.Reverse().Select(q => q.Id), requests.OrderBy(x => x.CreatedAt).Last().Questions.Select(q => q.Id));
    }

    private sealed class Storage(bool unavailable) : ITaskFileStorage
    {
        public List<string> Deleted { get; } = [];
        public async Task StoreAsync(string key, Stream content, string contentType, long sizeBytes, CancellationToken ct = default)
        {
            await content.ReadExactlyAsync(new byte[2], ct);
            if (unavailable) throw new DomainException("Indisponível", 503);
        }
        public Task DeleteAsync(string key, CancellationToken ct = default) { Deleted.Add(key); return Task.CompletedTask; }
        public string CreateDownloadUrl(string key, string name, string type) => "https://storage.example.test/file";
    }
}
