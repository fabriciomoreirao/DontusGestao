using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Dontus.Operations.Tests;

public sealed class WorkspaceFileStorageTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), $"dontus-upload-test-{Guid.NewGuid():N}");
    private readonly OperationsDbContext db = new(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static readonly ActorContext Owner = new("ana@test.local", "Ana", "Gestora", "Marketing", [new("marketing", true, true, true, false, false)]);
    private WorkspaceFileStorage Store => new(new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["WorkspaceFiles:Path"] = root }).Build(), db);

    [Fact]
    public async Task Streams_large_files_in_chunks_and_retries_do_not_duplicate_bytes()
    {
        var store = Store;
        var bytes = new byte[6 * 1024 * 1024]; Random.Shared.NextBytes(bytes);
        var entry = await store.BeginAsync(new("video longo.mp4", "video/mp4", bytes.Length * 6L, "marketing"), Owner, default);
        for (var i = 0; i < 6; i++)
        {
            Assert.Equal((i + 1L) * bytes.Length, await store.AppendAsync(entry.Id, i * (long)bytes.Length, new MemoryStream(bytes), Owner, default));
            if (i == 0) Assert.Equal(bytes.Length, await store.AppendAsync(entry.Id, 0, new MemoryStream(bytes), Owner, default));
        }
        var completed = await store.CompleteAsync(entry.Id, Owner, default);
        Assert.True(completed.Complete);
        var download = await store.DownloadAsync(entry.Id, Owner, default);
        Assert.Equal(bytes.Length * 6L, new FileInfo(download.Path).Length);
        await using var file = File.OpenRead(download.Path); var sample = new byte[bytes.Length];
        for (var i = 0; i < 6; i++) { await file.ReadExactlyAsync(sample); Assert.Equal(bytes, sample); }
        Assert.True((await store.CompleteAsync(entry.Id, Owner, default)).Complete);
    }

    [Fact]
    public async Task Enforces_ownership_complete_length_and_source_permissions()
    {
        var store = Store; var entry = await store.BeginAsync(new("a.pdf", "application/pdf", 4, "marketing"), Owner, default);
        var other = Owner with { Email = "other@test.local" };
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => store.AppendAsync(entry.Id, 0, new MemoryStream([1]), other, default))).StatusCode);
        Assert.Equal(409, (await Assert.ThrowsAsync<DomainException>(() => store.CompleteAsync(entry.Id, Owner, default))).StatusCode);
        await Assert.ThrowsAsync<DomainException>(() => store.AppendAsync(entry.Id, 0, new MemoryStream([1, 2, 3, 4, 5]), Owner, default));
        await store.AppendAsync(entry.Id, 0, new MemoryStream([1, 2, 3, 4]), Owner, default); await store.CompleteAsync(entry.Id, Owner, default);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => store.DownloadAsync(entry.Id, other, default))).StatusCode);
        await Assert.ThrowsAsync<DomainException>(() => store.BeginAsync(new("file", "text/plain", 1, "hr"), Owner, default));
        await Assert.ThrowsAsync<DomainException>(() => store.BeginAsync(new("file", "text/html", 1, "profile"), Owner, default));
    }

    [Fact]
    public async Task No_file_size_ceiling_is_imposed_on_the_upload_ticket()
    {
        var entry = await Store.BeginAsync(new("backup.zip", "application/zip", 5_000_000_000_000, "marketing"), Owner, default);
        Assert.Equal(5_000_000_000_000, entry.Size);
    }
    public void Dispose() { db.Dispose(); if (Directory.Exists(root)) Directory.Delete(root, true); }
}
