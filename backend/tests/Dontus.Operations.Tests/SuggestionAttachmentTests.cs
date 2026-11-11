using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed partial class SuggestionServiceTests
{
    [Theory]
    [InlineData("tela.png", "image/png", false)]
    [InlineData("video.webm", "video/webm", true)]
    [InlineData("arquivo.pdf", "application/pdf", true)]
    [InlineData("planilha.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", false)]
    public async Task Attachment_content_survives_missing_or_unavailable_external_storage(string fileName, string contentType, bool unavailable)
    {
        await using var db = CreateContext();
        var user = AddUser(db, "autor@dontus.local", "Autor"); await db.SaveChangesAsync();
        var service = new SuggestionService(db, unavailable ? new SuggestionStorage(true) : null);
        await service.InitializeAsync();
        var actor = Actor(user);
        var suggestion = await service.CreateSuggestionAsync(new("Melhoria com anexo", "Contexto", null, (await db.SuggestionPriorities.FirstAsync()).Id, false, false), actor);
        var bytes = "conteúdo integral do arquivo"u8.ToArray();
        using var content = new MemoryStream(bytes);
        var id = await service.UploadAttachmentAsync(new(suggestion.Id, fileName, contentType, bytes.Length, content), actor);
        db.ChangeTracker.Clear();
        var download = await service.GetAttachmentDownloadAsync(id, actor);
        Assert.Equal(bytes, download.Content); Assert.Equal(fileName, download.FileName); Assert.Equal(contentType, download.ContentType);
        Assert.Equal(bytes.Length, (await db.SuggestionAttachments.SingleAsync()).SizeBytes);
        Assert.Single(db.SuggestionAttachmentContents);
        var dto = Assert.Single((await service.GetModuleAsync(actor)).Suggestions);
        Assert.Equal($"/api/suggestion-files/{id}", Assert.Single(dto.Attachments).Url);
        var forbidden = actor with { Permissions = [] };
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.GetAttachmentDownloadAsync(id, forbidden))).StatusCode);
    }

    [Fact]
    public async Task External_success_preserves_signed_download_and_avoids_duplicating_the_blob()
    {
        await using var db = CreateContext();
        var user = AddUser(db, "storage@dontus.local", "Autor"); await db.SaveChangesAsync();
        var storage = new SuggestionStorage(false); var service = new SuggestionService(db, storage);
        await service.InitializeAsync();
        var suggestion = await service.CreateSuggestionAsync(new("Anexo externo", null, null, (await db.SuggestionPriorities.FirstAsync()).Id, false, false), Actor(user));
        using var content = new MemoryStream("arquivo"u8.ToArray());
        var id = await service.UploadAttachmentAsync(new(suggestion.Id, "arquivo.pdf", "application/pdf", content.Length, content), Actor(user));
        Assert.Empty(db.SuggestionAttachmentContents);
        var download = await service.GetAttachmentDownloadAsync(id, Actor(user));
        Assert.Null(download.Content); Assert.Equal("https://storage.example.test/file", download.Url);
        Assert.Equal("arquivo"u8.ToArray(), storage.Content);
    }

    [Fact]
    public async Task Creator_can_attach_with_create_permission_but_other_creators_cannot()
    {
        await using var db = CreateContext();
        var user = AddUser(db, "create@dontus.local", "Criador"); var other = AddUser(db, "other@dontus.local", "Outro"); await db.SaveChangesAsync();
        var service = new SuggestionService(db); await service.InitializeAsync();
        var actor = Actor(user) with { Permissions = [new EffectivePermission("suggestions", true, true, false, false, false)] };
        var suggestion = await service.CreateSuggestionAsync(new("Anexos do criador", null, null, (await db.SuggestionPriorities.FirstAsync()).Id, false, false), actor);
        using var content = new MemoryStream("arquivo"u8.ToArray());
        var stranger = Actor(other) with { Permissions = actor.Permissions };
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.UploadAttachmentAsync(new(suggestion.Id, "arquivo.pdf", "application/pdf", content.Length, content), stranger))).StatusCode);
        await Assert.ThrowsAsync<DomainException>(() => service.UploadAttachmentAsync(new(suggestion.Id, "arquivo.pdf", "application/pdf", content.Length+1, content), actor));
        Assert.Empty(db.SuggestionAttachments);
        content.Position = 0;
        await service.UploadAttachmentAsync(new(suggestion.Id, "arquivo.pdf", "application/pdf", content.Length, content), actor);
        Assert.Single(db.SuggestionAttachments);
    }

    private sealed class SuggestionStorage(bool unavailable) : ITaskFileStorage
    {
        public byte[] Content { get; private set; } = [];
        public async Task StoreAsync(string key, Stream content, string contentType, long sizeBytes, CancellationToken ct = default)
        {
            if (unavailable) { await content.ReadExactlyAsync(new byte[2], ct); throw new DomainException("Storage unavailable", 503); }
            using var copy = new MemoryStream(); await content.CopyToAsync(copy, ct); Content = copy.ToArray();
        }
        public Task DeleteAsync(string key, CancellationToken ct = default) => Task.CompletedTask;
        public string CreateDownloadUrl(string key, string fileName, string contentType) => unavailable ? throw new InvalidOperationException() : "https://storage.example.test/file";
    }
}
