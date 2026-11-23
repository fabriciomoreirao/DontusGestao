using System.Net;
using System.Text;
using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Dontus.Operations.Tests;

public sealed class WhatsAppAdministrationTests
{
    private static readonly ActorContext Admin = new("admin@test.local", "Admin", "Admin", "Gestão", FullAccess: true);

    [Theory]
    [InlineData("Nome inválido", "Olá {{1}}, tudo bem.")]
    [InlineData("lembrete", "{{1}} sua consulta está confirmada.")]
    [InlineData("lembrete", "Olá {{2}}, tudo bem.")]
    [InlineData("lembrete", "Olá {{1}}")]
    public void Invalid_templates_are_rejected_before_calling_meta(string name, string body) =>
        Assert.Throws<DomainException>(() => ChatService.ValidateTemplate(Command(Guid.NewGuid()) with { Name = name, Body = body }));

    [Fact]
    public async Task Submits_official_components_and_keeps_actual_pending_status()
    {
        await using var fixture = await Fixture.Create();
        var id = await fixture.Service.SubmitTemplateAsync(Command(fixture.Number.Id), Admin, default);
        var saved = await fixture.Db.WhatsAppTemplates.SingleAsync(x => x.Id == id);
        Assert.Equal("PENDING", saved.Status);
        Assert.Equal("template-123", saved.MetaId);
        var request = fixture.Handler.Requests.Single();
        Assert.EndsWith("/waba-1/message_templates", request.Url);
        using var payload = JsonDocument.Parse(request.Body);
        Assert.Equal("Maria", payload.RootElement.GetProperty("components")[0].GetProperty("example").GetProperty("body_text")[0][0].GetString());
        Assert.DoesNotContain("secret", JsonSerializer.Serialize(await fixture.Service.GetWhatsAppAdminAsync(Admin, default)));
    }

    [Fact]
    public async Task Rejects_template_management_without_specific_capability()
    {
        await using var f = await Fixture.Create();
        var actor = Admin with { FullAccess = false, Permissions = [new("chat", true, true, true, false, true)] };
        var error = await Assert.ThrowsAsync<DomainException>(() => f.Service.SubmitTemplateAsync(Command(f.Number.Id), actor, default));
        Assert.Equal(403, error.StatusCode);
        Assert.Empty(f.Handler.Requests);
    }

    [Fact]
    public async Task Suite_registration_uses_documented_header_path_and_body()
    {
        await using var f = await Fixture.Create();
        await f.Service.RegisterSuiteAsync(new(f.Number.Id, "123", "clinica01", "https://sistema.dontus.com.br"), Admin, default);
        var request = f.Handler.Requests.Single();
        Assert.Equal("https://suite.test/facebook/waba/waba-1/registerAmbiente/phone-1", request.Url);
        Assert.Equal("test-suite-key", request.Key);
        using var body = JsonDocument.Parse(request.Body);
        Assert.Equal("123", body.RootElement.GetProperty("idclinica").GetString());
        Assert.Equal("clinica01", body.RootElement.GetProperty("idDontus").GetString());
        Assert.Equal("Vinculado", f.Number.SuiteStatus);
    }

    [Fact]
    public async Task Campaign_deduplicates_then_sends_each_combination_once_through_meow()
    {
        await using var f = await Fixture.Create();
        var template = await f.AddTemplate();
        var id = await f.Service.SaveCampaignAsync(new(null, f.Number.Id, "Retorno", "MARKETING", [template.Id],
            [new("Maria", "(11) 99999-1111", null), new("Maria repetida", "5511999991111", null)], true, "Aceite no cadastro"), Admin, default);
        Assert.Single(await f.Db.WhatsAppCampaignDeliveries.ToListAsync());
        await f.Service.CampaignActionAsync(id, "schedule", null, Admin, default);
        await f.Service.ProcessCampaignsAsync(default);
        await f.Service.ProcessCampaignsAsync(default);
        var requests = f.Handler.Requests.Where(x => x.Url.EndsWith("/send/template")).ToArray();
        Assert.Single(requests);
        Assert.Equal("test-security", requests[0].Key);
        using var payload = JsonDocument.Parse(requests[0].Body);
        Assert.Equal("phone-1", payload.RootElement.GetProperty("phone_number_id").GetString());
        Assert.Equal("Maria", payload.RootElement.GetProperty("body_params")[0].GetString());
        Assert.Equal("wamid.test", (await f.Db.WhatsAppCampaignDeliveries.SingleAsync()).ExternalId);
        Assert.Equal("Concluída", (await f.Db.WhatsAppCampaigns.SingleAsync()).Status);
    }

    [Fact]
    public async Task Paused_template_blocks_scheduled_campaign_before_sending()
    {
        await using var f = await Fixture.Create(); var t = await f.AddTemplate();
        var id = await f.Service.SaveCampaignAsync(new(null, f.Number.Id, "Retorno", "MARKETING", [t.Id], [new("Maria", "5511999991111", null)], true, "Cadastro"), Admin, default);
        await f.Service.CampaignActionAsync(id, "schedule", null, Admin, default);
        f.Handler.TemplateStatus = "PAUSED";
        await f.Service.ProcessCampaignsAsync(default);
        Assert.DoesNotContain(f.Handler.Requests, r => r.Url.EndsWith("/send/template"));
        Assert.Equal("Erro", (await f.Db.WhatsAppCampaignDeliveries.SingleAsync()).Status);
    }

    [Fact]
    public async Task Cancelled_campaign_and_opted_out_recipient_cannot_be_sent()
    {
        await using var f = await Fixture.Create(); var t = await f.AddTemplate();
        var command = new SaveWhatsAppCampaignCommand(null, f.Number.Id, "Retorno", "MARKETING", [t.Id], [new("Maria", "5511999991111", null)], true, "Cadastro");
        var id = await f.Service.SaveCampaignAsync(command, Admin, default);
        await f.Service.CampaignActionAsync(id, "schedule", null, Admin, default);
        await f.Service.CampaignActionAsync(id, "cancel", null, Admin, default);
        await f.Service.ProcessCampaignsAsync(default);
        Assert.DoesNotContain(f.Handler.Requests, r => r.Url.EndsWith("/send/template"));
        f.Db.WhatsAppOptOuts.Add(new() { Phone = "5511999991111" }); await f.Db.SaveChangesAsync();
        await Assert.ThrowsAsync<DomainException>(() => f.Service.SaveCampaignAsync(command, Admin, default));
        await Assert.ThrowsAsync<DomainException>(() => f.Service.SaveCampaignAsync(command with { ConsentConfirmed = false }, Admin, default));
    }

    [Fact]
    public async Task Interrupted_delivery_is_marked_uncertain_without_automatic_resend()
    {
        await using var f = await Fixture.Create(); var t = await f.AddTemplate();
        var id = await f.Service.SaveCampaignAsync(new(null, f.Number.Id, "Retorno", "MARKETING", [t.Id], [new("Maria", "5511999991111", null)], true, "Cadastro"), Admin, default);
        await f.Service.CampaignActionAsync(id, "schedule", null, Admin, default);
        (await f.Db.WhatsAppCampaignDeliveries.SingleAsync()).Status = "Processando"; await f.Db.SaveChangesAsync();
        await f.Service.ProcessCampaignsAsync(default);
        Assert.Equal("Incerta", (await f.Db.WhatsAppCampaignDeliveries.SingleAsync()).Status);
        Assert.DoesNotContain(f.Handler.Requests, r => r.Url.EndsWith("/send/template"));
    }

    [Fact]
    public async Task Admin_state_counts_each_campaign_and_skips_recipient_lists_on_refresh()
    {
        await using var f = await Fixture.Create();
        var first = await f.AddTemplate();
        var second = new WhatsAppTemplate { NumberId = f.Number.Id, Name = "aviso", Status = "APPROVED" };
        f.Db.WhatsAppTemplates.Add(second);
        var campaign = new WhatsAppCampaign { NumberId = f.Number.Id, Name = "Novembro", Status = "Enviando" };
        var other = new WhatsAppCampaign { NumberId = f.Number.Id, Name = "Sem envios" };
        f.Db.WhatsAppCampaigns.AddRange(campaign, other);
        foreach (var (template, phone, status) in new[]
        {
            (first, "5511900000001", "Entregue"), (first, "5511900000002", "Lida"), (first, "5511900000003", "Erro"),
            (second, "5511900000001", "Pendente"), (second, "5511900000002", "Incerta"), (second, "5511900000003", "Aceita pela Meta"),
        })
            f.Db.WhatsAppCampaignDeliveries.Add(new() { CampaignId = campaign.Id, TemplateId = template.Id, Phone = phone, Status = status });
        f.Db.ChatContacts.Add(new ChatContact { Name = "Maria", Phone = "5511900000001" });
        await f.Db.SaveChangesAsync();

        using var full = JsonDocument.Parse(JsonSerializer.Serialize(await f.Service.GetWhatsAppAdminAsync(Admin, default)));
        var campaigns = full.RootElement.GetProperty("campaigns").EnumerateArray().ToDictionary(x => x.GetProperty("Name").GetString()!);
        var stats = campaigns["Novembro"];
        Assert.Equal(2, stats.GetProperty("templateCount").GetInt32());
        Assert.Equal(3, stats.GetProperty("recipientCount").GetInt32());
        Assert.Equal(5, stats.GetProperty("total").GetInt32()); // a pendente ainda não conta
        Assert.Equal(3, stats.GetProperty("successful").GetInt32());
        Assert.Equal(2, stats.GetProperty("errors").GetInt32());
        Assert.Equal(0, campaigns["Sem envios"].GetProperty("total").GetInt32());
        Assert.NotEmpty(full.RootElement.GetProperty("contacts").EnumerateArray());

        using var refresh = JsonDocument.Parse(JsonSerializer.Serialize(await f.Service.GetWhatsAppAdminAsync(Admin, default, includeRecipients: false)));
        Assert.Empty(refresh.RootElement.GetProperty("contacts").EnumerateArray());
        Assert.Empty(refresh.RootElement.GetProperty("customers").EnumerateArray());
        Assert.Equal(2, refresh.RootElement.GetProperty("campaigns").GetArrayLength());
    }

    private static SaveWhatsAppTemplateCommand Command(Guid numberId) => new(numberId, "lembrete", "pt_BR", "Campanhas", "MARKETING", "Olá {{1}}, temos novidades. Responda SAIR para não receber mensagens.", "NONE", "", "", [new("destinatario", "Maria")], []);

    private sealed class Fixture : IAsyncDisposable
    {
        public required OperationsDbContext Db { get; init; }
        public required ChatService Service { get; init; }
        public required FakeMeta Handler { get; init; }
        public required ChatWhatsAppNumber Number { get; init; }
        public async Task<WhatsAppTemplate> AddTemplate() { var t = new WhatsAppTemplate { NumberId = Number.Id, MetaId = "template-123", Name = "retorno", Category = "MARKETING", Body = "Olá {{1}}, temos novidades.", Status = "APPROVED", VariablesJson = """[{"key":"destinatario","example":"Maria"}]""" }; Db.WhatsAppTemplates.Add(t); await Db.SaveChangesAsync(); return t; }
        public static async Task<Fixture> Create()
        {
            var db = new OperationsDbContext(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
            var protection = new EphemeralDataProtectionProvider();
            var handler = new FakeMeta();
            var service = new ChatService(db, protection, new HttpClient(handler), suiteOptions: Options.Create(new WhatsAppSuiteOptions { ChatwootBaseUrl = "https://suite.test", ChatwootApiKey = "test-suite-key", MeowBaseUrl = "https://meow.test", SecurityId = "test-security" }));
            db.Users.Add(new AppUser { Email = Admin.Email, DisplayName = Admin.DisplayName, CreatedBy = "test" });
            var department = new TaskDepartment { Name = "Atendimento" }; db.TaskDepartments.Add(department); await db.SaveChangesAsync(); await service.InitializeAsync();
            var channel = await db.ChatChannels.FirstAsync(); channel.Type = "WhatsApp";
            var number = new ChatWhatsAppNumber { ChannelId = channel.Id, DepartmentId = department.Id, InternalName = "Principal", DisplayName = "Dontus", PhoneNumber = "5511999990000", PhoneNumberId = "phone-1", WabaId = "waba-1", Status = "Configurado", SuiteStatus = "Vinculado", AccessTokenProtected = protection.CreateProtector("Dontus.Chat.MetaCredentials.v1").Protect("secret-test-token") };
            db.ChatWhatsAppNumbers.Add(number); await db.SaveChangesAsync();
            return new() { Db = db, Service = service, Handler = handler, Number = number };
        }
        public ValueTask DisposeAsync() => Db.DisposeAsync();
    }

    private sealed class FakeMeta : HttpMessageHandler
    {
        public string TemplateStatus { get; set; } = "APPROVED";
        public List<(string Url, string Body, string Key)> Requests { get; } = [];
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var path = request.RequestUri!.ToString();
            var key = request.Headers.TryGetValues("X-Security-ID", out var security) ? security.Single() : request.Headers.TryGetValues("chatwoot-api-key", out var suite) ? suite.Single() : "";
            Requests.Add((path, request.Content is null ? "" : await request.Content.ReadAsStringAsync(ct), key));
            var body = path.Contains("message_templates") ? """{"id":"template-123","status":"PENDING"}"""
                : path.Contains("template-123") ? JsonSerializer.Serialize(new { status = TemplateStatus, category = "MARKETING" })
                : path.EndsWith("/send/template") ? """{"messages":[{"id":"wamid.test"}]}""" : "{}";
            return new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
        }
    }
}
