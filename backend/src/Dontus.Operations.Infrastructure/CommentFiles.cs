using System.Text.Json;
using Dontus.Operations.Domain;

namespace Dontus.Operations.Infrastructure;

public static class CommentFiles
{
    private const string Marker = "[[DONTUS_FILES:";
    public static string Validate(string? input, int maximumTextLength = 3000)
    {
        var body=input??"";
        var encodedBody=body.TrimEnd();
        var index=encodedBody.LastIndexOf(Marker,StringComparison.Ordinal);
        if(index<0||!encodedBody.EndsWith("]]",StringComparison.Ordinal))
        {
            if(string.IsNullOrWhiteSpace(body)||body.Length>maximumTextLength)throw new DomainException($"O comentário deve ter entre 1 e {maximumTextLength:N0} caracteres.");
            return body;
        }
        if(body[..index].Length>maximumTextLength+2)throw new DomainException("O texto do comentário excede o limite permitido.");
        try
        {
            using var json=JsonDocument.Parse(encodedBody[(index+Marker.Length)..^2]);
            var files=json.RootElement;
            if(files.ValueKind!=JsonValueKind.Array||files.GetArrayLength() is <1 or >10)throw new FormatException();
            long total=0;
            foreach(var file in files.EnumerateArray())
            {
                var name=file.GetProperty("name").GetString()??"";
                var data=file.GetProperty("dataUrl").GetString()??"";
                var size=file.GetProperty("size").GetInt64();
                var mime=file.GetProperty("type").GetString()??"";
                if(name.Length is <1 or >255||mime.Length>200||size<=0)throw new FormatException();
                if(System.Text.RegularExpressions.Regex.IsMatch(data,@"^/api/workspace-files/[0-9a-f-]{36}$")&&Guid.TryParse(data[21..],out _))continue;
                var delimiter=data.IndexOf(";base64,",StringComparison.Ordinal);
                if(!data.StartsWith("data:",StringComparison.Ordinal)||delimiter<5)throw new FormatException();
                var content=Convert.FromBase64String(data[(delimiter+8)..]);
                if(content.Length!=size)throw new FormatException();
                total+=size;
            }
            return encodedBody;
        }
        catch(Exception error) when(error is JsonException or FormatException or InvalidOperationException or KeyNotFoundException or OverflowException)
        {
            throw new DomainException("Selecione até 10 arquivos válidos por comentário.");
        }
    }
}
