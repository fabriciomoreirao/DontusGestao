using System.Net;
using System.Text;
using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Dontus.Operations.Tests;

public sealed class DontusIntegrationTests
{
    private static readonly ActorContext Admin = new("admin@dontus.local", "Admin", "Admin", "Suporte",
        [new("customers", true, true, true, false, true), new("access", true, false, false, false, false)]);
    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static DontusApiClient Client(Func<HttpRequestMessage, Task<HttpResponseMessage>> send) => new(new HttpClient(new Handler(send)),
        Options.Create(new DontusIntegrationOptions { ClientsToken = "clients-secret", UsersToken = "users-secret" }));
    private static HttpResponseMessage Json(object value) => new(HttpStatusCode.OK)
    { Content = new StringContent(JsonSerializer.Serialize(value), Encoding.UTF8, "application/json") };
    private static object CustomerResponse(string ident = "150001") => new { data = new[] { new { ID = 12162, Ident = ident, NomeFantasia = "Clínica de teste", CEP = "00000-000", Complemento = (string?)null } }, recordsFiltered = 1 };
    private static Customer Customer() => new() { LegalName = "Cliente Teste", TradeName = "Teste", CreatedBy = "admin" };

    [Theory]
    [InlineData("")]
    [InlineData("-1")]
    [InlineData("0")]
    [InlineData("123a")]
    [InlineData("1.5")]
    [InlineData("9223372036854775808")]
    public void Invalid_identifications_are_rejected(string value) => Assert.Throws<DomainException>(() => DontusApiClient.NormalizeIdentification(value));

    [Fact]
    public async Task Customer_lookup_uses_exact_Ident_across_pages_and_does_not_match_the_record_ID()
    {
        var calls = 0;
        var api = Client(request =>
        {
            Assert.Equal("clients-secret", request.Headers.GetValues("Token").Single());
            Assert.Contains("busca=150001", request.RequestUri!.Query);
            Assert.Contains("take=100", request.RequestUri.Query);
            var rows = ++calls == 1 ? Enumerable.Range(0, 100).Select(i => new { ID = 150001, Ident = (200000 + i).ToString() }).ToArray()
                : [new { ID = 12162, Ident = "150001" }];
            Assert.Contains(calls == 1 ? "skip=0" : "skip=100", request.RequestUri.Query);
            return Task.FromResult(Json(new { data = rows, recordsFiltered = 101 }));
        });
        var result = await api.FindCustomerAsync("00150001", default);
        Assert.Equal("150001", result.GetProperty("Ident").GetString());
        Assert.Equal(2, calls);
        var notFound = Client(_ => Task.FromResult(Json(new { data = new[] { new { ID = 150001, Ident = "1150001" } }, recordsFiltered = 1 })));
        Assert.Equal(404, (await Assert.ThrowsAsync<DomainException>(() => notFound.FindCustomerAsync("150001", default))).StatusCode);
    }

    [Fact]
    public async Task Environment_ID_is_related_to_Ident_using_the_global_listing_not_the_search_filter()
    {
        var calls = 0;
        var api = Client(request =>
        {
            Assert.DoesNotContain("busca=", request.RequestUri!.Query);
            var rows = ++calls == 1 ? Enumerable.Range(0, 100).Select(i => new { ID = 20000 + i, Ident = "12162" }).ToArray()
                : [new { ID = 12162, Ident = "150001" }];
            Assert.Contains(calls == 1 ? "skip=0" : "skip=100", request.RequestUri.Query);
            return Task.FromResult(Json(new { data = rows, recordsTotal = 101, recordsFiltered = 0 }));
        });
        var customer = await api.FindCustomerByIdAsync("00012162", default);
        Assert.Equal(12162, customer.GetProperty("ID").GetInt64());
        Assert.Equal("150001", customer.GetProperty("Ident").GetString());
        Assert.Equal(2, calls);
        var missing = Client(_ => Task.FromResult(Json(new { data = new[] { new { ID = 10, Ident = "12162" } }, recordsTotal = 1 })));
        Assert.Equal(404, (await Assert.ThrowsAsync<DomainException>(() => missing.FindCustomerByIdAsync("12162", default))).StatusCode);
    }

    [Fact]
    public async Task Link_is_persisted_with_permissions_concurrency_uniqueness_and_audit()
    {
        await using var db = Context();
        var first = Customer(); var second = Customer(); db.Customers.AddRange(first, second); await db.SaveChangesAsync();
        var calls = 0;
        var service = new DontusIntegrationService(db, Client(_ => { calls++; return Task.FromResult(Json(CustomerResponse())); }));
        var denied = Admin with { Permissions = [] };
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.LinkAsync(first.Id, new("12162", null), denied, default))).StatusCode);
        Assert.Equal(0, calls);
        await service.LinkAsync(first.Id, new("00012162", null), Admin, default);
        var reloaded = new DontusIntegrationService(db, Client(_ => Task.FromResult(Json(CustomerResponse()))));
        var saved = await reloaded.GetLinkAsync(first.Id, Admin, default);
        Assert.Equal("150001", saved!.Identification); Assert.Equal(12162, saved.ExternalClientId);
        Assert.Equal(409, (await Assert.ThrowsAsync<DomainException>(() => service.LinkAsync(first.Id, new("12162", 0), Admin, default))).StatusCode);
        Assert.Equal(409, (await Assert.ThrowsAsync<DomainException>(() => service.LinkAsync(second.Id, new("12162", null), Admin, default))).StatusCode);
        var readOnly = Admin with { Permissions = [new("customers", true, false, false, false, false)] };
        var data = await reloaded.GetDataAsync(first.Id, readOnly, default);
        Assert.Equal(12162, data.ExternalClientId); Assert.Equal("150001", data.Identification);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => reloaded.LinkAsync(first.Id, new("12162", 1), readOnly, default))).StatusCode);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => reloaded.GetLinkAsync(first.Id, denied, default))).StatusCode);
        var audit = Assert.Single(db.AuditEvents); Assert.Equal("LinkDontusCustomer", audit.Action);
        Assert.DoesNotContain("secret", audit.DetailsJson);
    }

    [Fact]
    public async Task Users_are_normalized_without_passwords_or_login_tokens_and_access_is_revalidated()
    {
        await using var db = Context();
        var userCalls = 0;
        var api = Client(async request =>
        {
            if (request.Method == HttpMethod.Get) return Json(CustomerResponse());
            userCalls++;
            var payload = JsonDocument.Parse(await request.Content!.ReadAsStringAsync()).RootElement;
            Assert.Equal(150001, payload.GetProperty("identificacao").GetInt64());
            Assert.Equal("s150001", payload.GetProperty("schema").GetString());
            Assert.Equal("users-secret", payload.GetProperty("token").GetString());
            return Json(new { mensagemDeErro = false, usuarios = new[] {
                new { id = 1, nome = "Supervisor", usuario = "super", email = "super@test.local", superUsuario = true, usuarioAtivo = true, senha = "never-expose", urlLogin = "https://sistema.dontus.com.br/login?token=login-secret" },
                new { id = 2, nome = "Comum", usuario = "comum", email = "comum@test.local", superUsuario = false, usuarioAtivo = false, senha = "never-expose", urlLogin = "https://sistema.dontus.com.br/login" },
                new { id = 3, nome = "URL inválida", usuario = "url", email = "url@test.local", superUsuario = false, usuarioAtivo = true, senha = "never-expose", urlLogin = "https://sistema.dontus.com.br.evil.example/login" }
            }});
        });
        var service = new DontusIntegrationService(db, api);
        var result = JsonSerializer.SerializeToElement(await service.ListUsersAsync("150001", Admin, default));
        var users = result.GetProperty("users").EnumerateArray().ToArray();
        Assert.True(users[0].GetProperty("IsSupervisor").GetBoolean());
        Assert.False(users[1].GetProperty("IsSupervisor").GetBoolean());
        Assert.False(users[1].GetProperty("CanAccess").GetBoolean());
        Assert.False(users[2].GetProperty("CanAccess").GetBoolean());
        Assert.DoesNotContain("never-expose", result.GetRawText()); Assert.DoesNotContain("login-secret", result.GetRawText());
        var login = JsonSerializer.SerializeToElement(await service.LoginAsync(new("150001", 1), Admin, default));
        Assert.StartsWith("https://sistema.dontus.com.br/", login.GetProperty("url").GetString());
        Assert.Equal(2, userCalls);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.LoginAsync(new("150001", 2), Admin, default))).StatusCode);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.LoginAsync(new("150001", 3), Admin, default))).StatusCode);
        Assert.Equal(404, (await Assert.ThrowsAsync<DomainException>(() => service.LoginAsync(new("150001", 99), Admin, default))).StatusCode);
        var denied = Admin with { Permissions = [] };
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.ListUsersAsync("150001", denied, default))).StatusCode);
        Assert.DoesNotContain("login-secret", string.Join(" ", db.AuditEvents.Select(x => x.DetailsJson)));
    }

    [Fact]
    public async Task Errors_empty_results_and_sensitive_customer_fields_are_handled()
    {
        var errorApi = Client(_ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.Unauthorized) { Content = new StringContent("secret-upstream-detail") }));
        var error = await Assert.ThrowsAsync<DomainException>(() => errorApi.FindCustomerAsync("150001", default));
        Assert.Equal(502, error.StatusCode); Assert.DoesNotContain("secret", error.Message);
        var malformed = Client(_ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("<html>Login</html>") }));
        Assert.Equal(502, (await Assert.ThrowsAsync<DomainException>(() => malformed.ListUsersAsync("150001", default))).StatusCode);
        var missing = Client(_ => Task.FromResult(Json(new { data = Array.Empty<object>(), recordsFiltered = 0 })));
        Assert.Equal(404, (await Assert.ThrowsAsync<DomainException>(() => missing.FindCustomerAsync("150001", default))).StatusCode);
        var emptyUsers = Client(_ => Task.FromResult(Json(new { usuarios = (object?)null, mensagemDeErro = false })));
        Assert.Empty(await emptyUsers.ListUsersAsync("150001", default));
        var refused = Client(_ => Task.FromResult(Json(new { usuarios = Array.Empty<object>(), mensagemDeErro = true })));
        Assert.Equal(502, (await Assert.ThrowsAsync<DomainException>(() => refused.ListUsersAsync("150001", default))).StatusCode);
        var clean = DontusApiClient.PublicCustomerData(JsonSerializer.SerializeToElement(new { ID = 1, empty = (string?)null, nested = new { token = "secret", Nome = "Preservado", senha = "password" } }));
        Assert.DoesNotContain("secret", clean.GetRawText()); Assert.DoesNotContain("password", clean.GetRawText());
        Assert.Equal("Preservado", clean.GetProperty("nested").GetProperty("Nome").GetString()); Assert.Equal(JsonValueKind.Null, clean.GetProperty("empty").ValueKind);
    }

    private sealed class Handler(Func<HttpRequestMessage, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => send(request);
    }
}
