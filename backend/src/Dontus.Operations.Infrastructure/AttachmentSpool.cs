using Dontus.Operations.Domain;

namespace Dontus.Operations.Infrastructure;

/// <summary>Bounded memory while validating and retrying a file transfer.</summary>
internal static class AttachmentSpool
{
    internal const long DatabaseFallbackBytes = 25L * 1024 * 1024;
    private static string Root => Path.Combine(AppContext.BaseDirectory, "workspace-files", "attachments");
    internal static async Task CopyVerifiedAsync(Stream input,Stream output,long expected,CancellationToken ct)
    {
        long total=0;var buffer=new byte[81920];int read;
        while((read=await input.ReadAsync(buffer,ct))>0)
        {
            if(total>expected-read)throw new DomainException("O tamanho do arquivo recebido não corresponde ao informado.");
            await output.WriteAsync(buffer.AsMemory(0,read),ct);total+=read;
        }
        if(total!=expected)throw new DomainException("O arquivo não foi recebido por completo. Tente novamente.");
    }
    internal static async Task<FileStream> ReadAsync(Stream input, long expected, CancellationToken ct)
    {
        var stream = new FileStream(Path.Combine(Path.GetTempPath(), $"dontus-{Guid.NewGuid():N}.upload"), FileMode.CreateNew,
            FileAccess.ReadWrite, FileShare.None, 81920, FileOptions.Asynchronous | FileOptions.DeleteOnClose);
        try
        {
            var buffer = new byte[81920];
            int read;
            while ((read = await input.ReadAsync(buffer, ct)) > 0)
            {
                if (stream.Length > expected - read) throw new DomainException("O tamanho do arquivo recebido não corresponde ao informado.");
                await stream.WriteAsync(buffer.AsMemory(0, read), ct);
            }
            if (stream.Length != expected) throw new DomainException("O arquivo não foi recebido por completo. Tente novamente.");
            stream.Position = 0;
            return stream;
        }
        catch { await stream.DisposeAsync(); throw; }
    }
    internal static async Task<byte[]> BytesAsync(Stream input, CancellationToken ct)
    {
        input.Position = 0;
        var result = new byte[checked((int)input.Length)];
        await input.ReadExactlyAsync(result, ct);
        return result;
    }
    internal static async Task<string> PersistAsync(Stream input, CancellationToken ct)
    {
        Directory.CreateDirectory(Root);
        var key = $"disk:{Guid.NewGuid():N}";
        input.Position = 0;
        try { await using var output = File.Create(Resolve(key)!); await input.CopyToAsync(output, ct); return key; }
        catch { Delete(key); throw; }
    }
    internal static string? Resolve(string key) => key.StartsWith("disk:", StringComparison.Ordinal) && Guid.TryParseExact(key[5..], "N", out var id) ? Path.Combine(Root, id.ToString("N")) : null;
    internal static void Delete(string key) { var path=Resolve(key); if(path is not null)File.Delete(path); }
}
