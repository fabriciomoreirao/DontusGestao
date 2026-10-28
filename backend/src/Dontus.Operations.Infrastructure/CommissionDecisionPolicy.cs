using System.Globalization;
using System.Text;
using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;
using static Dontus.Operations.Infrastructure.CommissionConfirmationService;

namespace Dontus.Operations.Infrastructure;

internal static class CommissionDecisionPolicy
{
    private static string Normalize(string text) => string.Concat(text.Normalize(NormalizationForm.FormD)
        .Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)).ToLowerInvariant();
    private static decimal Number(JsonObject detail, string key) => decimal.TryParse(Text(detail, key), NumberStyles.Number, CultureInfo.InvariantCulture, out var n) ? n : 0;
    private static string Money(long cents) => (cents / 100m).ToString("C", CultureInfo.GetCultureInfo("pt-BR"));
    private static long Round(decimal value) => checked((long)decimal.Round(value, 0, MidpointRounding.AwayFromZero));

    public static async Task<(string Description, long Amount)> PrepareAsync(OperationsDbContext db, string module, string? description,
        string? previousDescription, long amount, ActorContext actor, CancellationToken ct, string? creatorEmail = null)
    {
        if (module is not ("commissions" or "referrals")) return (description ?? "", amount);
        var detail = Detail(description ?? "{}"); var before = Detail(previousDescription ?? "{}");
        var manual = module == "commissions" && Text(detail,"manual") == "true";
        if (module == "commissions" && Text(before,"manual") == "true" && !manual) throw new DomainException("Preserve a identificação do lançamento manual.");
        if (manual)
        {
            if (!actor.HasPermission(module,"approve") && !actor.HasPermission(module,"manage")) throw new DomainException("Lançamentos manuais exigem supervisão de comissões.",403);
            if (previousDescription is not null && Text(before,"manual") != "true") throw new DomainException("Adicione um novo lançamento para informar uma comissão manual.");
            if (!Guid.TryParse(Text(detail,"employeeId"),out var employeeId)) throw new DomainException("Selecione o usuário responsável.");
            var employee=await db.Users.AsNoTracking().SingleOrDefaultAsync(x=>x.Id==employeeId&&x.Active&&x.BlockedAt==null,ct)
                ?? throw new DomainException("Selecione um responsável ativo.");
            if(Text(detail,"scope") is not ("commercial" or "cs" or "lia") || !DateOnly.TryParseExact(Text(detail,"competence")+"-01","yyyy-MM-dd",out _))
                throw new DomainException("Informe o setor e a competência.");
            if(Text(detail,"customerName").Trim().Length is < 3 or > 240 || Text(detail,"product").Trim().Length is < 1 or > 200 || Text(detail,"manualCustomerCode").Length>80 || Text(detail,"manualReason").Trim().Length is < 3 or > 4000)
                throw new DomainException("Informe cliente, produto e justificativa do lançamento manual.");
            if(Cents(detail,"saleValueCents") is < 0 or > 100000000000 || Cents(detail,"manualCommissionCents") is <= 0 or > 100000000000)
                throw new DomainException("Informe valores válidos para o cliente e a comissão manual.");
            detail["employeeName"]=employee.DisplayName;
            foreach(var key in new[]{"manualCreatedBy","manualCreatedByEmail","manualCreatedAt"})
                detail[key]=before[key]?.DeepClone() ?? JsonValue.Create(key=="manualCreatedBy"?actor.DisplayName:key=="manualCreatedByEmail"?actor.Email:DateTimeOffset.UtcNow.ToString("O"));
            detail["ruleLabel"]=$"Comissão manual: {Money(Cents(detail,"manualCommissionCents"))}. Justificativa: {Text(detail,"manualReason")}";
            if(Text(detail,"decision") is not ("approved" or "rejected"))
            { detail["decision"]="pending";detail["commissionCents"]=0;return(detail.ToJsonString(),0); }
        }
        var referral = module == "referrals"; var field = referral ? "phase" : "decision";
        var next = Text(detail, field); var previous = Text(before, field);
        // Keep old records readable; every new or revised complete decision uses the new policy.
        var decisionChanged = next != previous || Text(detail, referral ? "decisionReason" : "reason") != Text(before, referral ? "decisionReason" : "reason");
        if (next is not ("approved" or "rejected") || !decisionChanged && (!detail.ContainsKey(referral ? "valueCents" : "sourceKey") || JsonNode.DeepEquals(detail, before)))
            return (description ?? "", amount);
        if (!actor.HasPermission(module, "approve") && !actor.HasPermission(module, "manage")) throw new DomainException("A decisão exige permissão de aprovação.", 403);
        var reason = Text(detail, referral ? "decisionReason" : "reason").Trim();
        if (reason.Length is < 3 or > 4000) throw new DomainException("Informe um motivo de aprovação ou reprovação entre 3 e 4.000 caracteres.");
        var sale = Cents(detail, referral ? "valueCents" : "saleValueCents");
        if (sale < 0) throw new DomainException("O valor do cliente não pode ser negativo.");
        var catalogs = await db.CustomerCatalogOptions.AsNoTracking().Where(x => x.Active && x.Catalog == (referral ? "referralCommission" : "commissionRule")).OrderBy(x => x.Id).ToListAsync(ct);
        var rules = catalogs.Select(x => Detail(x.Description)).ToList();
        JsonObject? rule;
        if (referral)
        {
            var sender = Text(detail, "senderName");
            var senderId = Text(detail, "senderId");
            if (senderId == "" && creatorEmail is not null)
            {
                var userId = await db.Users.Where(x => x.Email == creatorEmail).Select(x => (Guid?)x.Id).SingleOrDefaultAsync(ct);
                senderId = userId?.ToString() ?? ""; detail["senderId"] = senderId;
            }
            var candidates = rules.Where(x => Text(x, "moduleName") is "" || Text(x, "moduleName") == Text(detail, "moduleName")).ToList();
            rule = candidates.FirstOrDefault(x => Text(x, "collaboratorId") != "" && Text(x, "collaboratorId") == senderId)
                ?? candidates.FirstOrDefault(x => Text(x, "collaboratorId") == "" && Text(x, "collaboratorName") != "" && Text(x, "collaboratorName") == sender)
                ?? candidates.FirstOrDefault(x => Text(x, "collaboratorId") == "" && Text(x, "collaboratorName") == "" && (Text(x, "department") == "" || Text(x, "department") == Text(detail, "senderDepartment")));
        }
        else
        {
            var scope = Text(detail, "scope"); var employeeId = Text(detail, "employeeId");
            var candidates = rules.Where(x => Text(x, "scope") == scope && (Text(x, "employeeId") != "" && employeeId != ""
                ? Text(x, "employeeId") == employeeId : Normalize(Text(x, "employeeName")) == Normalize(Text(detail, "employeeName")))).ToList();
            rule = candidates.FirstOrDefault(x => Normalize(Text(x, "product")) == Normalize(Text(detail, "product")))
                ?? candidates.FirstOrDefault(x => Text(x, "product") == "*") ?? (scope == "cs" ? candidates.FirstOrDefault() : null);
        }
        long proposed = 0; var label = "Sem regra configurada";
        if (rule is not null && !manual)
        {
            var type = Text(rule, "type"); var rate = Number(rule, referral ? "percentage" : "value");
            var tierLabel = "";
            if (!referral && Text(rule, "scope") == "cs" && rule["scoreTiers"] is JsonArray tiers)
            {
                var score = Number(detail, "score");
                if (detail["score"] is null || score < 0) throw new DomainException("Não foi possível calcular a comissão pela faixa de score.");
                using var json = System.Text.Json.JsonDocument.Parse(tiers.ToJsonString());
                var band = CommissionScoreBands.Select(CommissionScoreBands.Parse(json.RootElement), score);
                rate = band.Percentage;
                var range = band.Max is null ? "acima de 100%" : band.Max == 100 ? "75% a 100% (inclusive)" : band.Min == 0 ? "abaixo de 50%" : "50% a menos de 75%";
                tierLabel = $" · score {score}% · faixa {range}";
            }
            if (rate < 0 || type == "percentage" && rate > 100 || type is not ("percentage" or "fixed")) throw new DomainException("A regra de comissionamento é inválida.");
            if (next == "approved" && type == "percentage" && rate > 0 && sale == 0)
                throw new DomainException("Informe o valor base do cliente antes de aprovar a comissão.");
            proposed = type == "percentage" ? Round(sale * rate / 100) : referral ? Cents(rule, "fixedCents") : Round(rate * 100);
            if (proposed < 0) throw new DomainException("O valor da comissão é inválido.");
            label = type == "percentage" ? $"{rate}% sobre {Money(sale)} = {Money(proposed)}{tierLabel}" : $"{Money(proposed)} fixos por lançamento";
        }
        if (manual) { proposed=Cents(detail,"manualCommissionCents"); label=Text(detail,"ruleLabel"); }
        if (next == "approved" && rule is null && !manual) throw new DomainException("Configure a regra de comissionamento antes de aprovar.");
        detail[referral ? "decisionReason" : "reason"] = reason;
        detail[referral ? "reviewer" : "decidedBy"] = actor.DisplayName;
        detail[referral ? "decisionAt" : "decidedAt"] = DateTimeOffset.UtcNow.ToString("O");
        detail["commissionCents"] = next == "approved" ? proposed : 0;
        detail[referral ? "commissionLabel" : "ruleLabel"] = label;
        detail["ruleSnapshot"] = rule?.DeepClone();
        detail.Remove("agreedAt"); detail.Remove("viewedAt");
        return (detail.ToJsonString(), next == "approved" ? proposed : 0);
    }
}
