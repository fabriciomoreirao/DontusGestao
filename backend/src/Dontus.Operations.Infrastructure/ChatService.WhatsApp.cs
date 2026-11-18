using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Infrastructure;

public sealed class WhatsAppSuiteOptions
{
    public string WebhookSecret { get; set; } = "";
    public string WebhookVerifyToken { get; set; } = "";
    public string ChatwootBaseUrl { get; set; } = "";
    public string ChatwootApiKey { get; set; } = "";
    public string MeowBaseUrl { get; set; } = "";
    public string SecurityId { get; set; } = "";
}

public sealed partial class ChatService
{
    private static readonly JsonSerializerOptions WaJson = new(JsonSerializerDefaults.Web);
    private WhatsAppSuiteOptions Suite => suiteOptions?.Value ?? new();
    private static T[] ReadArray<T>(string json) => JsonSerializer.Deserialize<T[]>(json, WaJson) ?? [];
    private static void RequireWhatsAppAdmin(ActorContext actor)
    {
        actor.RequirePermission("chat", "manage");
        actor.RequireCapability("chat", "manageWhatsApp");
    }

    public async Task<object> GetWhatsAppAdminAsync(ActorContext actor, CancellationToken ct)
    {
        actor.RequirePermission("chat", "view");
        var module = await GetModuleAsync(actor, ct);
        var numberIds = module.WhatsAppNumbers.Select(x => x.Id).ToArray();
        var templates = await db.WhatsAppTemplates.AsNoTracking().Where(x => numberIds.Contains(x.NumberId)).OrderByDescending(x => x.CreatedAt).ToListAsync(ct);
        var admin = actor.HasPermission("chat", "manage") && actor.HasCapability("chat", "manageWhatsApp");
        var campaigns = admin ? await db.WhatsAppCampaigns.AsNoTracking().OrderByDescending(x => x.CreatedAt).ToListAsync(ct) : [];
        var campaignIds = campaigns.Select(x => x.Id).ToArray();
        var stats = await db.WhatsAppCampaignDeliveries.AsNoTracking().Where(x => campaignIds.Contains(x.CampaignId))
            .Select(x => new { x.CampaignId, x.TemplateId, x.Phone, x.Status }).ToListAsync(ct);
        return new {
            module,
            templates = templates.Select(x => new { x.Id, x.NumberId, x.Name, x.Language, x.Purpose, x.Category, x.Body, x.HeaderType, x.MediaUrl,
                variables = ReadArray<TemplateVariable>(x.VariablesJson), buttons = ReadArray<TemplateButton>(x.ButtonsJson), x.Status, x.RejectionReason, x.SyncedAt }),
            campaigns = campaigns.Select(x => new { x.Id, x.NumberId, x.Name, x.Category, x.Status, x.ScheduledAt, x.FinishedAt,
                templateCount = stats.Where(d => d.CampaignId == x.Id).Select(d => d.TemplateId).Distinct().Count(),
                recipientCount = stats.Where(d => d.CampaignId == x.Id).Select(d => d.Phone).Distinct().Count(),
                total = stats.Count(d => d.CampaignId == x.Id && d.Status != "Pendente" && d.Status != "Cancelada"),
                successful = stats.Count(d => d.CampaignId == x.Id && (d.Status == "Aceita pela Meta" || d.Status == "Entregue" || d.Status == "Lida")),
                errors = stats.Count(d => d.CampaignId == x.Id && (d.Status == "Erro" || d.Status == "Incerta")) }),
            numbers = await db.ChatWhatsAppNumbers.AsNoTracking().Where(x => numberIds.Contains(x.Id)).Select(x => new { x.Id, x.SuiteStatus, x.SuiteClinicId, x.SuiteDontusId, x.SuiteBase }).ToListAsync(ct),
            suiteConfigured = !string.IsNullOrWhiteSpace(Suite.ChatwootApiKey) && !string.IsNullOrWhiteSpace(Suite.SecurityId) && !string.IsNullOrWhiteSpace(Suite.ChatwootBaseUrl) && !string.IsNullOrWhiteSpace(Suite.MeowBaseUrl),
            contacts = admin ? await db.ChatContacts.AsNoTracking().Select(x => new { x.Id, x.Name, x.Phone }).ToArrayAsync(ct) : [],
            customers = admin && actor.HasPermission("customers", "view") ? await db.Customers.AsNoTracking().Select(x => new { x.Id, Name = x.TradeName == "" ? x.LegalName : x.TradeName, x.Phone }).ToArrayAsync(ct) : [],
        };
    }

    public static void ValidateTemplate(SaveWhatsAppTemplateCommand c)
    {
        if (c.Variables is null || c.Buttons is null) throw new DomainException("Informe as variáveis e os botões do template.");
        if (!Regex.IsMatch(c.Name ?? "", "^[a-z0-9_]{1,512}$")) throw new DomainException("Use snake_case, sem espaços, acentos ou letras maiúsculas no nome.");
        if (c.Category is not ("UTILITY" or "MARKETING")) throw new DomainException("Selecione Utilidade / Serviço ou Marketing.");
        if (string.IsNullOrWhiteSpace(c.Purpose) || c.Purpose.Length > 80) throw new DomainException("Selecione a finalidade do template.");
        if (c.Language is not ("pt_BR" or "en_US" or "es")) throw new DomainException("Idioma inválido.");
        var body = c.Body?.Trim() ?? "";
        if (body.Length is < 1 or > 1024) throw new DomainException("O texto deve conter entre 1 e 1.024 caracteres.");
        var matches = Regex.Matches(body, @"\{\{([0-9]+)\}\}");
        var indices = matches.Select(x => int.TryParse(x.Groups[1].Value, out var n) ? n : -1).Distinct().Order().ToArray();
        if (!indices.SequenceEqual(Enumerable.Range(1, c.Variables.Length)) || c.Variables.Any(x => string.IsNullOrWhiteSpace(x.Example) || string.IsNullOrWhiteSpace(x.Key)))
            throw new DomainException("Preencha as variáveis e exemplos na sequência {{1}}, {{2}} e assim por diante.");
        if (Regex.Replace(body, @"\{\{[0-9]+\}\}", "").Contains("{{") || body.StartsWith("{{") || body.EndsWith("}}"))
            throw new DomainException("Evite iniciar ou terminar o texto com variável e utilize somente tags numéricas.");
        if (c.HeaderType is not ("NONE" or "IMAGE" or "VIDEO" or "DOCUMENT")) throw new DomainException("Cabeçalho inválido.");
        if (c.HeaderType != "NONE" && (string.IsNullOrWhiteSpace(c.HeaderHandle) || !HttpsUrl(c.MediaUrl)))
            throw new DomainException("Envie uma mídia de exemplo e informe o endereço HTTPS da mídia para os envios.");
        if (c.Buttons.Length > 3 || c.Buttons.Any(x => x.Type is not ("QUICK_REPLY" or "URL") || string.IsNullOrWhiteSpace(x.Text) || x.Text.Length > 25 || x.Type == "URL" && (!HttpsUrl(x.Url) || x.Url.Contains("{{"))))
            throw new DomainException("Use até três botões, com texto de até 25 caracteres e URLs HTTPS fixas.");
    }

    public async Task<Guid> SubmitTemplateAsync(SaveWhatsAppTemplateCommand c, ActorContext actor, CancellationToken ct)
    {
        RequireWhatsAppAdmin(actor);
        ValidateTemplate(c);
        var number = await NumberAsync(c.NumberId, ct);
        if (await db.WhatsAppTemplates.AnyAsync(x => x.NumberId == c.NumberId && x.Name == c.Name && x.Language == c.Language, ct))
            throw new DomainException("Já existe um template com este nome e idioma nesta conexão.", 409);
        var components = new List<object>();
        if (c.HeaderType != "NONE") components.Add(new { type = "HEADER", format = c.HeaderType, example = new { header_handle = new[] { c.HeaderHandle } } });
        components.Add(c.Variables.Length == 0 ? new { type = "BODY", text = c.Body.Trim() } : (object)new { type = "BODY", text = c.Body.Trim(), example = new { body_text = new[] { c.Variables.Select(x => x.Example).ToArray() } } });
        if (c.Buttons.Length > 0) components.Add(new { type = "BUTTONS", buttons = c.Buttons.Select(x => x.Type == "URL" ? (object)new { type = x.Type, text = x.Text, url = x.Url } : new { type = x.Type, text = x.Text }) });
        using var result = await SendMetaAsync(HttpMethod.Post, $"{number.ApiVersion}/{number.WabaId}/message_templates", Token(number),
            JsonContent.Create(new { name = c.Name, language = c.Language, category = c.Category, components }), ct);
        var entity = new WhatsAppTemplate { NumberId = number.Id, Name = c.Name, Language = c.Language, Purpose = c.Purpose, Category = c.Category, Body = c.Body.Trim(),
            HeaderType = c.HeaderType, HeaderHandle = c.HeaderHandle, MediaUrl = c.MediaUrl, VariablesJson = JsonSerializer.Serialize(c.Variables, WaJson), ButtonsJson = JsonSerializer.Serialize(c.Buttons, WaJson),
            MetaId = Text(result.RootElement, "id"), Status = Text(result.RootElement, "status", "PENDING"), SyncedAt = DateTimeOffset.UtcNow };
        if (entity.MetaId == "") throw new DomainException("A Meta não retornou o identificador do template.", 502);
        db.WhatsAppTemplates.Add(entity);
        Audit(actor, "whatsapp.template.submitted", "whatsapp_template", entity.Id, new { entity.Name, entity.MetaId });
        await db.SaveChangesAsync(ct);
        return entity.Id;
    }

    public async Task RefreshTemplatesAsync(Guid numberId, ActorContext actor, CancellationToken ct)
    {
        RequireWhatsAppAdmin(actor);
        var number = await NumberAsync(numberId, ct);
        var templates = await db.WhatsAppTemplates.Where(x => x.NumberId == numberId).ToListAsync(ct);
        foreach (var template in templates) await RefreshTemplateAsync(number, template, ct);
        await db.SaveChangesAsync(ct);
    }

    private async Task RefreshTemplateAsync(ChatWhatsAppNumber number, WhatsAppTemplate template, CancellationToken ct)
    {
        using var result = await SendMetaAsync(HttpMethod.Get, $"{number.ApiVersion}/{Uri.EscapeDataString(template.MetaId)}?fields=status,category,rejected_reason", Token(number), null, ct);
        template.Status = Text(result.RootElement, "status", "UNKNOWN");
        template.Category = Text(result.RootElement, "category", template.Category);
        template.RejectionReason = Text(result.RootElement, "rejected_reason");
        template.SyncedAt = DateTimeOffset.UtcNow;
        Touch(template);
    }

    public async Task<string> UploadTemplateSampleAsync(Guid numberId, string name, string contentType, byte[] bytes, ActorContext actor, CancellationToken ct)
    {
        RequireWhatsAppAdmin(actor);
        var number = await NumberAsync(numberId, ct);
        if (!Regex.IsMatch(number.MetaAppId, "^[0-9]+$")) throw new DomainException("Configure o App ID da Meta nesta conexão.");
        if (bytes.Length is < 1 or > 10_000_000 || contentType is not ("image/jpeg" or "image/png" or "video/mp4" or "application/pdf"))
            throw new DomainException("Envie JPG, PNG, MP4 ou PDF com até 10 MB.");
        using var session = await SendMetaAsync(HttpMethod.Post, $"{number.ApiVersion}/{number.MetaAppId}/uploads?file_name={Uri.EscapeDataString(name)}&file_length={bytes.Length}&file_type={Uri.EscapeDataString(contentType)}", Token(number), null, ct);
        var sessionId = Text(session.RootElement, "id");
        if (sessionId == "") throw new DomainException("A Meta não iniciou o upload.", 502);
        using var request = new HttpRequestMessage(HttpMethod.Post, $"https://graph.facebook.com/{number.ApiVersion}/{sessionId}");
        request.Headers.Authorization = new AuthenticationHeaderValue("OAuth", Token(number));
        request.Headers.Add("file_offset", "0");
        request.Content = new ByteArrayContent(bytes);
        using var response = await httpClient.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode) throw new DomainException("A Meta recusou o arquivo de exemplo.", 502);
        using var result = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        var handle = Text(result.RootElement, "h");
        return handle != "" ? handle : throw new DomainException("A Meta não retornou o identificador da mídia.", 502);
    }

    public async Task RegisterSuiteAsync(RegisterWhatsAppSuiteCommand c, ActorContext actor, CancellationToken ct)
    {
        RequireWhatsAppAdmin(actor);
        var number = await NumberAsync(c.NumberId, ct);
        if (!Regex.IsMatch(c.ClinicId ?? "", "^[0-9]+$") || string.IsNullOrWhiteSpace(c.DontusId) || !HttpsUrl(c.Base))
            throw new DomainException("Informe ID da clínica, ID Dontus e base HTTPS do Suíte.");
        await SuiteRequestAsync(HttpMethod.Post, $"facebook/waba/{Uri.EscapeDataString(number.WabaId)}/registerAmbiente/{Uri.EscapeDataString(number.PhoneNumberId)}",
            new { idclinica = c.ClinicId, idDontus = c.DontusId, @base = c.Base }, false, ct);
        number.SuiteClinicId = c.ClinicId!; number.SuiteDontusId = c.DontusId; number.SuiteBase = c.Base; number.SuiteStatus = "Vinculado";
        Touch(number);
        Audit(actor, "whatsapp.suite.registered", "chat_whatsapp_number", number.Id, new { number.PhoneNumberId, c.ClinicId, module = "WhatsApp" });
        await db.SaveChangesAsync(ct);
    }

    private async Task<JsonElement> SuiteRequestAsync(HttpMethod method, string path, object body, bool meow, CancellationToken ct)
    {
        var baseUrl = meow ? Suite.MeowBaseUrl : Suite.ChatwootBaseUrl;
        var key = meow ? Suite.SecurityId : Suite.ChatwootApiKey;
        if (!HttpsUrl(baseUrl) || string.IsNullOrWhiteSpace(key)) throw new DomainException("Configure a integração WABA do Suíte no servidor.", 503);
        using var request = new HttpRequestMessage(method, $"{baseUrl.TrimEnd('/')}/{path}") { Content = JsonContent.Create(body) };
        request.Headers.Add(meow ? "X-Security-ID" : "chatwoot-api-key", key);
        using var response = await httpClient.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode) throw new DomainException($"O Suíte recusou a operação WABA (HTTP {(int)response.StatusCode}). Verifique a conexão e as credenciais.", 502);
        var raw = await response.Content.ReadAsStringAsync(ct);
        return JsonDocument.Parse(string.IsNullOrWhiteSpace(raw) ? "{}" : raw).RootElement.Clone();
    }

    public async Task<Guid> SaveCampaignAsync(SaveWhatsAppCampaignCommand c, ActorContext actor, CancellationToken ct)
    {
        RequireWhatsAppAdmin(actor);
        if (string.IsNullOrWhiteSpace(c.Name) || c.Name.Length > 160) throw new DomainException("Informe o nome da campanha, com até 160 caracteres.");
        if (c.TemplateIds is null || c.Recipients is null) throw new DomainException("Selecione templates e destinatários.");
        if (!c.ConsentConfirmed || string.IsNullOrWhiteSpace(c.ConsentSource)) throw new DomainException("Confirme a autorização dos destinatários e registre a origem do consentimento.");
        if (c.Category is not ("MARKETING" or "UTILITY")) throw new DomainException("Selecione a categoria da campanha.");
        var number = await NumberAsync(c.NumberId, ct);
        if (number.SuiteStatus != "Vinculado") throw new DomainException("Vincule a conexão ao Suíte antes de criar a campanha.");
        if (c.TemplateIds.Length is < 1 or > 10 || c.Recipients.Length is < 1 or > 5000) throw new DomainException("Selecione de 1 a 10 templates e de 1 a 5.000 destinatários.");
        var templates = await db.WhatsAppTemplates.Where(x => c.TemplateIds.Contains(x.Id) && x.NumberId == c.NumberId).ToListAsync(ct);
        if (templates.Count != c.TemplateIds.Distinct().Count()) throw new DomainException("Os templates devem pertencer à conexão selecionada.");
        foreach (var t in templates) {
            await RefreshTemplateAsync(number, t, ct);
            if (t.Status != "APPROVED" || t.Category != c.Category) throw new DomainException("Utilize somente templates aprovados da categoria selecionada.");
        }
        var recipients = c.Recipients.Select(r => r with { Phone = CampaignPhone(r.Phone) }).DistinctBy(r => r.Phone).ToArray();
        if (recipients.Any(r => r.Phone == "" || string.IsNullOrWhiteSpace(r.Name))) throw new DomainException("Revise os nomes e telefones com DDI dos destinatários.");
        var phones = recipients.Select(r => r.Phone).ToArray();
        if (await db.WhatsAppOptOuts.AnyAsync(x => phones.Contains(x.Phone), ct)) throw new DomainException("Há destinatários que solicitaram a interrupção das mensagens. Remova-os da campanha.");
        var campaign = c.Id.HasValue ? await db.WhatsAppCampaigns.SingleOrDefaultAsync(x => x.Id == c.Id, ct) : null;
        if (c.Id.HasValue && campaign is null) throw new DomainException("Campanha não encontrada.", 404);
        if (campaign is not null && campaign.Status != "Aprovada") throw new DomainException("Somente campanhas ainda não agendadas podem ser editadas.", 409);
        campaign ??= new WhatsAppCampaign { CreatedBy = actor.Email };
        campaign.Name = c.Name.Trim(); campaign.NumberId = c.NumberId; campaign.Category = c.Category; campaign.ConsentSource = c.ConsentSource.Trim();
        if (!c.Id.HasValue) db.WhatsAppCampaigns.Add(campaign);
        else { db.WhatsAppCampaignDeliveries.RemoveRange(await db.WhatsAppCampaignDeliveries.Where(x => x.CampaignId == campaign.Id).ToListAsync(ct)); Touch(campaign); }
        foreach (var recipient in recipients)
        foreach (var template in templates) {
            var parameters = ReadArray<TemplateVariable>(template.VariablesJson).Select(v => v.Key is "destinatario" or "paciente" ? recipient.Name : recipient.Values?.GetValueOrDefault(v.Key)?.Trim() ?? "").ToArray();
            if (parameters.Any(string.IsNullOrWhiteSpace)) throw new DomainException($"Preencha os valores das variáveis para {recipient.Name} no template {template.Name}.");
            db.WhatsAppCampaignDeliveries.Add(new WhatsAppCampaignDelivery { CampaignId = campaign.Id, TemplateId = template.Id, Name = recipient.Name.Trim(), Phone = recipient.Phone, ParametersJson = JsonSerializer.Serialize(parameters) });
        }
        Audit(actor, "whatsapp.campaign.saved", "whatsapp_campaign", campaign.Id, new { campaign.Name, recipients = recipients.Length, templates = templates.Count, campaign.ConsentSource });
        await db.SaveChangesAsync(ct);
        return campaign.Id;
    }

    public async Task CampaignActionAsync(Guid id, string action, DateTimeOffset? scheduledAt, ActorContext actor, CancellationToken ct)
    {
        RequireWhatsAppAdmin(actor);
        var campaign = await db.WhatsAppCampaigns.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new DomainException("Campanha não encontrada.", 404);
        if (action == "schedule") {
            if (campaign.Status != "Aprovada") throw new DomainException("A campanha já foi agendada ou encerrada.", 409);
            campaign.ScheduledAt = scheduledAt?.ToUniversalTime() ?? DateTimeOffset.UtcNow;
            if (campaign.ScheduledAt < DateTimeOffset.UtcNow.AddMinutes(-1)) throw new DomainException("Escolha um horário futuro.");
            campaign.Status = "Agendada";
        } else if (action == "cancel") {
            if (campaign.Status is "Concluída" or "Concluída com erros" or "Cancelada") throw new DomainException("A campanha já foi encerrada.", 409);
            campaign.Status = "Cancelada"; campaign.FinishedAt = DateTimeOffset.UtcNow;
        } else if (action == "delete") {
            if (campaign.Status is not ("Aprovada" or "Cancelada")) throw new DomainException("Cancele a campanha antes de excluir.", 409);
            db.WhatsAppCampaigns.Remove(campaign);
        } else throw new DomainException("Ação inválida.");
        Touch(campaign);
        Audit(actor, $"whatsapp.campaign.{action}", "whatsapp_campaign", campaign.Id, new { campaign.ScheduledAt });
        await db.SaveChangesAsync(ct);
    }

    public async Task<Guid> SendTemplateAsync(SendWhatsAppTemplateCommand c, ActorContext actor, CancellationToken ct)
    {
        actor.RequirePermission("chat", "edit"); RequireCapabilityOrManage(actor, "sendMessages");
        var conversation = await AccessibleConversationAsync(c.ConversationId, actor, ct);
        if (conversation.IsGroup || conversation.Status == "Encerrada") throw new DomainException("Selecione uma conversa individual aberta.");
        var template = await db.WhatsAppTemplates.SingleOrDefaultAsync(x => x.Id == c.TemplateId, ct) ?? throw new DomainException("Template não encontrado.", 404);
        var number = await NumberAsync(template.NumberId, ct);
        if (number.ChannelId != conversation.ChannelId) throw new DomainException("O template pertence a outro canal.");
        if (!c.ConsentConfirmed) throw new DomainException("Confirme a autorização do destinatário.");
        await RefreshTemplateAsync(number, template, ct);
        var contact = await db.ChatContacts.SingleAsync(x => x.Id == conversation.ContactId, ct);
        var externalId = await SendApprovedTemplateAsync(number, template, CampaignPhone(contact.Phone), c.Parameters, ct);
        var user = await CurrentUserAsync(actor, ct);
        var body = template.Body;
        for (var i = 0; i < c.Parameters.Length; i++) body = body.Replace("{{" + (i + 1) + "}}", c.Parameters[i]);
        var message = new ChatMessage { ConversationId = conversation.Id, Body = body, Type = "Template", ExternalId = externalId, Status = "Aceita pela Meta", SenderUserId = user.Id, SenderName = user.DisplayName };
        db.ChatMessages.Add(message); conversation.LastMessageAt = DateTimeOffset.UtcNow; Touch(conversation);
        Audit(actor, "whatsapp.template.sent", "chat_conversation", conversation.Id, new { template.Id, message.ExternalId });
        await db.SaveChangesAsync(ct);
        return message.Id;
    }

    private async Task<string> SendApprovedTemplateAsync(ChatWhatsAppNumber number, WhatsAppTemplate template, string phone, string[] parameters, CancellationToken ct)
    {
        if (template.Status != "APPROVED") throw new DomainException("Este template não está aprovado pela Meta.");
        if (parameters.Length != ReadArray<TemplateVariable>(template.VariablesJson).Length || parameters.Any(string.IsNullOrWhiteSpace)) throw new DomainException("Preencha todas as variáveis do template.");
        if (phone == "" || await db.WhatsAppOptOuts.AnyAsync(x => x.Phone == phone, ct)) throw new DomainException("Destinatário inválido ou com descadastro registrado.");
        if (number.SuiteStatus != "Vinculado") throw new DomainException("A conexão precisa estar vinculada ao Suíte.");
        object payload = template.HeaderType == "NONE"
            ? new { phone_number_id = number.PhoneNumberId, to = phone, template_name = template.Name, language = template.Language, body_params = parameters }
            : new { phone_number_id = number.PhoneNumberId, to = phone, template_name = template.Name, language = template.Language, body_params = parameters, header = new { type = template.HeaderType, link = template.MediaUrl } };
        var result = await SuiteRequestAsync(HttpMethod.Post, "api/v1/waba/send/template", payload, true, ct);
        if (!result.TryGetProperty("messages", out var messages) || messages.GetArrayLength() == 0 || Text(messages[0], "id") == "")
            throw new DomainException("O envio não retornou um ID da Meta. Verifique o provedor antes de tentar novamente.", 502);
        return Text(messages[0], "id");
    }

    public async Task ProcessCampaignsAsync(CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        var campaign = await db.WhatsAppCampaigns.FirstOrDefaultAsync(x => (x.Status == "Agendada" || x.Status == "Enviando") && x.ScheduledAt <= now && (x.LeaseUntil == null || x.LeaseUntil < now), ct);
        if (campaign is null) return;
        campaign.LeaseUntil = now.AddMinutes(3); campaign.Status = "Enviando"; Touch(campaign);
        try { await db.SaveChangesAsync(ct); } catch (DbUpdateConcurrencyException) { db.ChangeTracker.Clear(); return; }
        ChatWhatsAppNumber number;
        try { number = await NumberAsync(campaign.NumberId, ct); }
        catch (DomainException) {
            var pending = await db.WhatsAppCampaignDeliveries.Where(x => x.CampaignId == campaign.Id && x.Status == "Pendente").ToListAsync(ct);
            foreach (var item in pending) { item.Status = "Erro"; item.Error = "A conexão foi desativada antes do disparo."; }
            campaign.Status = "Concluída com erros"; campaign.FinishedAt = now; campaign.LeaseUntil = null; Touch(campaign); await db.SaveChangesAsync(ct); return;
        }
        var deliveries = await db.WhatsAppCampaignDeliveries.Where(x => x.CampaignId == campaign.Id && (x.Status == "Pendente" || x.Status == "Processando")).OrderBy(x => x.CreatedAt).Take(30).ToListAsync(ct);
        foreach (var delivery in deliveries) {
            var current = await db.WhatsAppCampaigns.AsNoTracking().Where(x => x.Id == campaign.Id).Select(x => x.Status).SingleOrDefaultAsync(ct);
            if (current != "Enviando") break;
            if (delivery.Status == "Processando") { delivery.Status = "Incerta"; delivery.Error = "Execução interrompida após iniciar o envio. Confira no provedor; não há reenvio automático."; await db.SaveChangesAsync(ct); continue; }
            delivery.Status = "Processando"; campaign.LeaseUntil = DateTimeOffset.UtcNow.AddMinutes(3); Touch(campaign); await db.SaveChangesAsync(ct);
            try {
                var template = await db.WhatsAppTemplates.SingleAsync(x => x.Id == delivery.TemplateId, ct);
                await RefreshTemplateAsync(number, template, ct);
                if (template.Category != campaign.Category) throw new DomainException("A Meta alterou a categoria do template. Revise a campanha.");
                delivery.ExternalId = await SendApprovedTemplateAsync(number, template, delivery.Phone, ReadArray<string>(delivery.ParametersJson), ct);
                delivery.Status = "Aceita pela Meta";
                // Persist the provider acknowledgement before building the chat projection.
                await db.SaveChangesAsync(ct);
                var text = template.Body; var parameters = ReadArray<string>(delivery.ParametersJson);
                for (var i = 0; i < parameters.Length; i++) text = text.Replace("{{" + (i + 1) + "}}", parameters[i]);
                await ReceiveWebhookAsync(new ReceiveWhatsAppWebhookCommand("campaign:" + delivery.Id, number.PhoneNumberId, delivery.ExternalId,
                    delivery.Phone, delivery.Name, "Saida", "Template", text, DateTimeOffset.UtcNow, false, "{}"), ct);
                var sentMessage = await db.ChatMessages.FirstOrDefaultAsync(x => x.ExternalId == delivery.ExternalId, ct);
                if (sentMessage is not null) { sentMessage.Status = "Aceita pela Meta"; sentMessage.SenderName = "Campanha · " + campaign.Name; }
            } catch (OperationCanceledException) { throw; }
              catch (Exception ex) {
                if (delivery.ExternalId != "") delivery.Error = "Envio aceito pela Meta. Não foi possível concluir a atualização do histórico do chat.";
                else { delivery.Status = ex is HttpRequestException ? "Incerta" : "Erro"; delivery.Error = ex is DomainException ? ex.Message : "Falha no envio. Verifique o provedor antes de reenviar."; }
              }
            Touch(delivery); await db.SaveChangesAsync(ct);
            await Task.Delay(150, ct);
        }
        await db.Entry(campaign).ReloadAsync(ct);
        if (campaign.Status == "Enviando" && !await db.WhatsAppCampaignDeliveries.AnyAsync(x => x.CampaignId == campaign.Id && (x.Status == "Pendente" || x.Status == "Processando"), ct)) {
            campaign.Status = await db.WhatsAppCampaignDeliveries.AnyAsync(x => x.CampaignId == campaign.Id && (x.Status == "Erro" || x.Status == "Incerta"), ct) ? "Concluída com erros" : "Concluída";
            campaign.FinishedAt = DateTimeOffset.UtcNow;
        }
        campaign.LeaseUntil = null; Touch(campaign); await db.SaveChangesAsync(ct);
    }

    public async Task ProcessWhatsAppStatusAsync(JsonElement value, CancellationToken ct)
    {
        if (value.TryGetProperty("message_template_id", out var templateId)) {
            var metaId = templateId.ValueKind == JsonValueKind.String ? templateId.GetString() : templateId.GetRawText();
            var templates = await db.WhatsAppTemplates.Where(x => x.MetaId == metaId).ToListAsync(ct);
            foreach (var template in templates) { template.Status = Text(value, "event", template.Status); template.RejectionReason = Text(value, "reason"); template.SyncedAt = DateTimeOffset.UtcNow; Touch(template); }
            await db.SaveChangesAsync(ct);
        }
        if (!value.TryGetProperty("statuses", out var statuses)) return;
        foreach (var status in statuses.EnumerateArray()) {
            var externalId = Text(status, "id"); var state = Text(status, "status");
            var mapped = state switch { "delivered" => "Entregue", "read" => "Lida", "failed" => "Erro", "sent" => "Aceita pela Meta", _ => "" };
            if (externalId == "" || mapped == "") continue;
            var delivery = await db.WhatsAppCampaignDeliveries.SingleOrDefaultAsync(x => x.ExternalId == externalId, ct);
            if (delivery is not null && (mapped == "Erro" || delivery.Status != "Lida" && (delivery.Status != "Entregue" || mapped == "Lida"))) {
                delivery.Status = mapped; delivery.Error = mapped == "Erro" ? "A Meta informou falha na entrega." : ""; Touch(delivery);
            }
            var message = await db.ChatMessages.SingleOrDefaultAsync(x => x.ExternalId == externalId, ct);
            if (message is not null && message.Status != "Lida") { message.Status = mapped; if (mapped == "Lida") message.ReadAt = DateTimeOffset.UtcNow; if (mapped == "Entregue") message.DeliveredAt = DateTimeOffset.UtcNow; Touch(message); }
        }
        await db.SaveChangesAsync(ct);
    }

    private async Task<ChatWhatsAppNumber> NumberAsync(Guid id, CancellationToken ct) =>
        await db.ChatWhatsAppNumbers.SingleOrDefaultAsync(x => x.Id == id && x.Active, ct) ?? throw new DomainException("Conexão ativa não encontrada.", 404);
    private async Task RequireCustomerWindowAsync(Guid conversationId, CancellationToken ct) {
        if (!await db.ChatMessages.AnyAsync(x => x.ConversationId == conversationId && x.Direction == "Entrada" && x.ExternalId != "" && x.Status != "Importada" && x.CreatedAt > DateTimeOffset.UtcNow.AddHours(-24), ct))
            throw new DomainException("A janela de atendimento de 24 horas está fechada. Envie um template aprovado para iniciar o contato.");
    }
    private string Token(ChatWhatsAppNumber number) => SafeUnprotect(number.AccessTokenProtected) is { Length: > 0 } token ? token : throw new DomainException("Conecte este número à Meta antes de continuar.");
    private static bool HttpsUrl(string? url) => Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.Scheme == "https" && string.IsNullOrEmpty(uri.UserInfo);
    public static string CampaignPhone(string? phone) {
        var digits = new string((phone ?? "").Where(char.IsDigit).ToArray());
        if (digits.StartsWith("00")) digits = digits[2..];
        if (digits.Length is 10 or 11 && !(phone ?? "").TrimStart().StartsWith('+')) digits = "55" + digits;
        return digits.Length is >= 10 and <= 15 ? digits : "";
    }
    private static string Text(JsonElement value, string key, string fallback = "") => value.TryGetProperty(key, out var property) && property.ValueKind == JsonValueKind.String ? property.GetString() ?? fallback : fallback;
}
