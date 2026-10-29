using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Dontus.Operations.Domain;
using Microsoft.Extensions.Options;

namespace Dontus.Operations.Infrastructure;

public sealed class DontusIntegrationOptions
{
    public string ClientsBaseUrl { get; set; } = "https://ambiente.dontus.com.br";
    public string UsersBaseUrl { get; set; } = "https://sistema.dontus.com.br";
    public string ClientsToken { get; set; } = "";
    public string UsersToken { get; set; } = "";
    public string[] AllowedLoginHosts { get; set; } = ["sistema.dontus.com.br"];
}

public sealed class DontusApiClient(HttpClient http, IOptions<DontusIntegrationOptions> options)
{
    private readonly DontusIntegrationOptions settings = options.Value;

    public static string NormalizeIdentification(string? value)
    {
        value = value?.Trim();
        if (string.IsNullOrEmpty(value) || value.Any(c => c is < '0' or > '9') ||
            !long.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var id) || id <= 0)
            throw new DomainException("Informe uma identificação válida, usando apenas números positivos.");
        return id.ToString(CultureInfo.InvariantCulture);
    }

    public async Task<JsonElement> FindCustomerAsync(string identification, CancellationToken ct)
    {
        identification = NormalizeIdentification(identification);
        if (string.IsNullOrWhiteSpace(settings.ClientsToken))
            throw new DomainException("A integração de clientes Dontus ainda não foi configurada no servidor.", 503);
        const int take = 100;
        JsonElement? match = null;
        for (var skip = 0; skip < 20000; skip += take)
        {
            using var request = new HttpRequestMessage(HttpMethod.Get,
                $"{settings.ClientsBaseUrl.TrimEnd('/')}/api/APICliente/GetAllClientes?skip={skip}&take={take}&busca={Uri.EscapeDataString(identification)}");
            request.Headers.Add("Token", settings.ClientsToken);
            var result = await SendAsync(request, "clientes", ct);
            var rows = Property(result, "data");
            if (rows.ValueKind != JsonValueKind.Array)
                throw InvalidResponse("clientes");
            foreach (var row in rows.EnumerateArray())
            {
                // Ident is the sisteminha identification; ID is the API record's distinct primary key.
                var ident = Text(row, "Ident").TrimStart('0');
                if (ident != identification) continue;
                if (match.HasValue) throw new DomainException("A API retornou mais de um cliente com esta identificação. Revise o cadastro no Ambiente Dontus.", 409);
                match = row.Clone();
            }
            var filtered = Property(result, "recordsFiltered");
            if (rows.GetArrayLength() < take || (filtered.TryGetInt64Safe(out var total) && skip + take >= total))
                return match ?? throw new DomainException("Não foi possível encontrar um cliente com esta identificação no Ambiente Dontus.", 404);
        }
        throw new DomainException("A consulta Dontus excedeu o limite de páginas. Refine a identificação e tente novamente.", 502);
    }

    public async Task<JsonElement> FindCustomerByIdAsync(string externalClientId, CancellationToken ct)
    {
        var id = long.Parse(NormalizeIdentification(externalClientId), CultureInfo.InvariantCulture);
        if (string.IsNullOrWhiteSpace(settings.ClientsToken))
            throw new DomainException("A integração de clientes Dontus ainda não foi configurada no servidor.", 503);
        // busca does not search the record ID in this API. Walk the global listing and compare ID exactly.
        const int take = 100;
        for (var skip = 0; skip < 20000; skip += take)
        {
            using var request = new HttpRequestMessage(HttpMethod.Get,
                $"{settings.ClientsBaseUrl.TrimEnd('/')}/api/APICliente/GetAllClientes?skip={skip}&take={take}");
            request.Headers.Add("Token", settings.ClientsToken);
            var result = await SendAsync(request, "clientes", ct);
            var rows = Property(result, "data");
            if (rows.ValueKind != JsonValueKind.Array) throw InvalidResponse("clientes");
            foreach (var row in rows.EnumerateArray())
                if (Number(row, "ID") == id) return row.Clone();
            var total = Property(result, "recordsTotal");
            if (rows.GetArrayLength() < take || total.TryGetInt64Safe(out var count) && skip + take >= count)
                throw new DomainException("Não foi possível encontrar um cliente com este ID no Ambiente Dontus.", 404);
        }
        throw new DomainException("A consulta de clientes Dontus excedeu o limite de páginas. Tente novamente mais tarde.", 502);
    }

    public async Task<IReadOnlyList<DontusRemoteUser>> ListUsersAsync(string identification, CancellationToken ct)
    {
        identification = NormalizeIdentification(identification);
        if (string.IsNullOrWhiteSpace(settings.UsersToken))
            throw new DomainException("A integração de acesso Dontus ainda não foi configurada no servidor.", 503);
        using var request = new HttpRequestMessage(HttpMethod.Post,
            $"{settings.UsersBaseUrl.TrimEnd('/')}/api/Ambiente/listarUsuarios")
        {
            Content = JsonContent.Create(new { identificacao = long.Parse(identification, CultureInfo.InvariantCulture), schema = "s" + identification, token = settings.UsersToken })
        };
        var result = await SendAsync(request, "usuários", ct);
        var error = Property(result, "mensagemDeErro");
        if (error.ValueKind == JsonValueKind.True || error.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(error.GetString()) && error.GetString() != "false")
            throw new DomainException("O sistema Dontus recusou a consulta de usuários desta identificação.", 502);
        var users = Property(result, "usuarios");
        if (users.ValueKind == JsonValueKind.Null) return [];
        if (users.ValueKind != JsonValueKind.Array) throw InvalidResponse("usuários");
        return users.EnumerateArray().Select(row => new DontusRemoteUser(
            Number(row, "id"), Text(row, "nome"), Text(row, "usuario"), Text(row, "email"),
            Boolean(row, "superUsuario"), Boolean(row, "usuarioAtivo"), SafeLoginUrl(Text(row, "urlLogin")))).ToList();
    }

    private string? SafeLoginUrl(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme != "https" ||
            !uri.IsDefaultPort || !string.IsNullOrEmpty(uri.UserInfo) ||
            !settings.AllowedLoginHosts.Contains(uri.IdnHost, StringComparer.OrdinalIgnoreCase)) return null;
        return uri.AbsoluteUri;
    }

    private async Task<JsonElement> SendAsync(HttpRequestMessage request, string source, CancellationToken ct)
    {
        try
        {
            using var response = await http.SendAsync(request, ct);
            if (!response.IsSuccessStatusCode)
                throw new DomainException($"A API Dontus de {source} está indisponível ou recusou a consulta. Tente novamente ou verifique a configuração da integração.", 502);
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
            if (json.RootElement.ValueKind != JsonValueKind.Object) throw InvalidResponse(source);
            return json.RootElement.Clone();
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        { throw new DomainException($"A API Dontus de {source} demorou para responder. Tente novamente.", 504); }
        catch (HttpRequestException)
        { throw new DomainException($"Não foi possível conectar à API Dontus de {source}. Tente novamente.", 502); }
        catch (JsonException) { throw InvalidResponse(source); }
    }

    public static JsonElement PublicCustomerData(JsonElement value)
    {
        var node = JsonNode.Parse(value.GetRawText());
        Clean(node);
        return JsonSerializer.SerializeToElement(node);
    }

    private static void Clean(JsonNode? node)
    {
        if (node is JsonObject obj)
            foreach (var key in obj.Select(p => p.Key).ToArray())
            {
                var normalized = key.ToLowerInvariant().Replace("_", "").Replace("-", "");
                if (new[] { "senha", "password", "token", "secret", "credential", "urllogin" }.Any(normalized.Contains)) obj.Remove(key);
                else Clean(obj[key]);
            }
        else if (node is JsonArray array) foreach (var child in array) Clean(child);
    }

    private static DomainException InvalidResponse(string source) => new($"A API Dontus de {source} retornou uma resposta inválida. Tente novamente.", 502);
    internal static JsonElement Property(JsonElement value, string name) => value.ValueKind == JsonValueKind.Object
        ? value.EnumerateObject().FirstOrDefault(p => p.Name.Equals(name, StringComparison.OrdinalIgnoreCase)).Value : default;
    internal static string Text(JsonElement value, string name) => Property(value, name) is var p && p.ValueKind is not (JsonValueKind.Null or JsonValueKind.Undefined) ? p.ToString() : "";
    internal static long Number(JsonElement value, string name) => long.TryParse(Text(value, name), out var n) ? n : 0;
    private static bool Boolean(JsonElement value, string name) => Text(value, name).ToLowerInvariant() is "true" or "1";
}

public sealed record DontusRemoteUser(long Id, string Name, string Username, string Email, bool IsSupervisor, bool Active, string? LoginUrl);

internal static class DontusJsonExtensions
{
    internal static bool TryGetInt64Safe(this JsonElement value, out long number)
    { number = 0; return value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out number); }
}
