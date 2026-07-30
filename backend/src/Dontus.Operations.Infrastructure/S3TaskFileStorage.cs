using Amazon;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.Extensions.Configuration;

namespace Dontus.Operations.Infrastructure;

public sealed class S3TaskFileStorage : ITaskFileStorage, IDisposable
{
    private readonly string bucketName;
    private readonly Lazy<IAmazonS3> client;

    public S3TaskFileStorage(IConfiguration configuration)
    {
        bucketName = configuration["TaskFiles:BucketName"]?.Trim() ?? "";
        var regionName = configuration["TaskFiles:Region"]?.Trim() ?? "us-east-1";
        client = new Lazy<IAmazonS3>(() =>
            new AmazonS3Client(RegionEndpoint.GetBySystemName(regionName)));
    }

    public async Task StoreAsync(
        string key,
        Stream content,
        string contentType,
        long sizeBytes,
        CancellationToken cancellationToken = default)
    {
        EnsureConfigured();
        try
        {
            await client.Value.PutObjectAsync(new PutObjectRequest
            {
                BucketName = bucketName,
                Key = key,
                InputStream = content,
                ContentType = contentType,
                AutoCloseStream = false,
                ServerSideEncryptionMethod = ServerSideEncryptionMethod.AES256,
                Metadata =
                {
                    ["dontus-size-bytes"] = sizeBytes.ToString(),
                },
            }, cancellationToken);
        }
        catch (AmazonS3Exception exception)
        {
            throw new DomainException(
                $"Não foi possível armazenar o arquivo na AWS S3: {exception.Message}", 503);
        }
        catch (AmazonClientException exception)
        {
            throw new DomainException(
                $"A integração com a AWS S3 não está configurada corretamente: {exception.Message}", 503);
        }
    }

    public async Task DeleteAsync(string key, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(bucketName) || !client.IsValueCreated) return;
        await client.Value.DeleteObjectAsync(bucketName, key, cancellationToken);
    }

    public string CreateDownloadUrl(string key, string fileName, string contentType)
    {
        EnsureConfigured();
        try
        {
            return client.Value.GetPreSignedURL(new GetPreSignedUrlRequest
            {
                BucketName = bucketName,
                Key = key,
                Expires = DateTime.UtcNow.AddMinutes(10),
                Verb = HttpVerb.GET,
                ResponseHeaderOverrides = new ResponseHeaderOverrides
                {
                    ContentDisposition = $"attachment; filename*=UTF-8''{Uri.EscapeDataString(fileName)}",
                    ContentType = contentType,
                },
            });
        }
        catch (AmazonClientException exception)
        {
            throw new DomainException(
                $"Não foi possível gerar o acesso temporário ao arquivo: {exception.Message}", 503);
        }
    }

    public void Dispose()
    {
        if (client.IsValueCreated) client.Value.Dispose();
    }

    private void EnsureConfigured()
    {
        if (string.IsNullOrWhiteSpace(bucketName))
            throw new DomainException(
                "O bucket AWS S3 para anexos ainda não foi configurado.", 503);
    }
}
