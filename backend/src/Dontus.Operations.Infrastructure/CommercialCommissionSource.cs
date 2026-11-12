using System.Globalization;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;
using static Dontus.Operations.Infrastructure.CommissionConfirmationService;

namespace Dontus.Operations.Infrastructure;

internal static class CommercialCommissionSource
{
    internal static string Normalize(string value) => Regex.Replace(string.Concat(value.Normalize(NormalizationForm.FormD).Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)).Trim().ToLowerInvariant(), @"\s+", " ");
    internal static bool Won(WorkItem item, IReadOnlyList<CustomerCatalogOption> funnels)
    {
        var detail = Detail(item.Description);
        if (item.Module != "commercial" || Text(detail, "kind") == "directSale" || Regex.IsMatch(Normalize(item.RecordType), "reten|qualifica|configura")
            || Regex.IsMatch(Normalize(Text(detail, "flow") + " " + Text(detail, "crmFlow")), "retention|retencao|qualification|qualificacao")) return false;
        var stage = Text(detail, "stage") is { Length: > 0 } name ? name : item.Status;
        var funnel = funnels.FirstOrDefault(x => x.Name == Text(detail, "funnel"));
        if (funnel is not null)
        {
            var definition = Detail(funnel.Description);
            if (Text(definition, "f") is "q" or "r" || Regex.IsMatch(Normalize(Text(definition, "functionality")), "reten|qualifica")) return false;
            if (definition["s"] is JsonArray compact)
                foreach (var row in compact.OfType<JsonArray>().Where(row => row.Count >= 3 && row[0]?.ToString() == stage)) return row[2]?.ToString() is "1" or "true";
            if (definition["stages"] is JsonArray stages)
                foreach (var row in stages.OfType<JsonObject>().Where(row => Text(row, "name") == stage)) return Text(row, "won") == "true";
        }
        return Regex.IsMatch(Normalize(stage), "ganho|vendid|fechad|contrat|conclu");
    }
    internal static DateOnly? Date(WorkItem item) { var d = Detail(item.Description); return CsJourneyTimeline.ReadDate(Text(d, "wonAt") is { Length: > 0 } won ? won : Text(d, "closedAt") is { Length: > 0 } closed ? closed : Text(d, "saleDate") is { Length: > 0 } sale ? sale : item.UpdatedAt.ToString("O")); }
    internal static string Seller(WorkItem item) => Text(Detail(item.Description), "seller") is { Length: > 0 } seller ? seller : item.Owner;
    internal static long Value(WorkItem item)
    {
        if (item.AmountCents > 0) return item.AmountCents;
        return (Detail(item.Description)["products"] as JsonArray ?? []).OfType<JsonObject>().Sum(ProductValue);
    }
    internal static long ProductValue(JsonObject product)
    {
        decimal Number(string key) => decimal.TryParse(Text(product, key), NumberStyles.Number, CultureInfo.InvariantCulture, out var n) ? n : 0;
        var unit = product.ContainsKey("unitValue") ? Number("unitValue") : Number("value");
        return checked((long)decimal.Round(Math.Max(0, unit) * Math.Max(1, Number("quantity")) * 100, 0, MidpointRounding.AwayFromZero));
    }
    internal static async Task SynchronizeWinAsync(OperationsDbContext db, WorkItem item, string? previousDescription, CancellationToken ct)
    {
        if (item.Module != "commercial") return;
        var funnels = await db.CustomerCatalogOptions.AsNoTracking().Where(x => x.Catalog == "funnelStage").ToListAsync(ct);
        var detail = Detail(item.Description);
        if (Won(item, funnels)) detail["wonAt"] = Text(Detail(previousDescription ?? "{}"), "wonAt") is { Length: > 0 } before ? before : Text(detail, "wonAt") is { Length: > 0 } stamp ? stamp : DateTimeOffset.UtcNow.ToString("O");
        else detail.Remove("wonAt");
        item.Description = detail.ToJsonString();
    }
    internal static async Task<long> PrepareAsync(OperationsDbContext db, JsonObject detail, CancellationToken ct)
    {
        if (!Guid.TryParse(Text(detail, "sourceId"), out var id)) throw new DomainException("Vincule a comissão a uma venda do CRM Comercial.");
        var sales = await db.WorkItems.AsNoTracking().Where(x => x.Module == "commercial").ToListAsync(ct);
        var source = sales.SingleOrDefault(x => x.Id == id) ?? throw new DomainException("Venda não encontrada no CRM Comercial.");
        var funnels = await db.CustomerCatalogOptions.AsNoTracking().Where(x => x.Catalog == "funnelStage").ToListAsync(ct);
        if (!Won(source, funnels)) throw new DomainException("A comissão comercial exige um card marcado como Ganho no CRM Comercial.");
        var day = Date(source) ?? throw new DomainException("Informe uma data de ganho válida.");
        if (day > CsJourneyTimeline.ReadDate(DateTimeOffset.UtcNow.ToString("O"))) throw new DomainException("A data do ganho não pode estar no futuro.");
        var month = day.ToString("yyyy-MM", CultureInfo.InvariantCulture);
        var seller = Seller(source);
        var users = await db.Users.AsNoTracking().Select(x => new { x.Id, x.DisplayName }).ToListAsync(ct);
        var user = users.FirstOrDefault(x => Normalize(x.DisplayName) == Normalize(seller));
        detail["employeeName"] = seller; detail["employeeId"] = user?.Id.ToString() ?? "";
        detail["competence"] = month; detail["routedAt"] = $"{day:yyyy-MM-dd}T00:00:00-03:00";
        var customers = await db.Customers.AsNoTracking().Select(x => new { x.Id, x.TradeName, x.LegalName, x.Status }).ToListAsync(ct);
        bool Eligible(WorkItem item)
        {
            var customer = customers.FirstOrDefault(x => x.Id == item.CustomerId || Normalize(x.TradeName) == Normalize(item.CustomerName) || Normalize(x.LegalName) == Normalize(item.CustomerName));
            var state = Normalize(item.Status + " " + customer?.Status);
            return state.Contains("cancel") || !Regex.IsMatch(state, "inativ|deslig|perdid|sem sucesso|nao convertido");
        }
        if (!Eligible(source) && Text(detail, "decision") != "rejected") throw new DomainException("O cliente não atende às condições de comissionamento.");
        var included = sales.Where(x => Won(x, funnels) && Eligible(x) && Normalize(Seller(x)) == Normalize(seller) && Date(x)?.ToString("yyyy-MM", CultureInfo.InvariantCulture) == month).ToArray();
        var total = included.Sum(Value);
        detail["monthlySalesCents"] = total;
        var offset = included.Where(x => string.CompareOrdinal(x.Id.ToString(), source.Id.ToString()) < 0).Sum(Value);
        var value = Value(source);
        var key = Text(detail, "sourceKey").Split(':');
        if (key.Length == 2 && int.TryParse(key[1], out var index) && Detail(source.Description)["products"] is JsonArray products && index >= 0 && index < products.Count && products[index] is JsonObject product)
        { value = ProductValue(product); offset += products.Take(index).OfType<JsonObject>().Sum(ProductValue); }
        detail["saleValueCents"] = value;
        detail["commissionOffsetCents"] = offset;
        return total;
    }
    internal static async Task ValidateDecisionAsync(OperationsDbContext db, WorkItem item, CancellationToken ct)
    {
        var detail = Detail(item.Description);
        if (item.Module != "commissions" || Text(detail, "scope") != "commercial" || Text(detail, "manual") == "true" || Text(detail, "decision") != "approved"
            || detail["ruleSnapshot"] is not JsonObject rule || rule["salesTiers"] is not JsonArray tiers) return;
        var originalSale = Cents(detail, "saleValueCents"); var originalMonth = Text(detail, "competence"); var originalEmployee = Text(detail, "employeeName");
        var total = await PrepareAsync(db, detail, ct);
        using var json = System.Text.Json.JsonDocument.Parse(tiers.ToJsonString());
        var rate = CommissionSalesBands.Select(CommissionSalesBands.Parse(json.RootElement), total).Percentage;
        var offset = Cents(detail, "commissionOffsetCents"); var sale = Cents(detail, "saleValueCents");
        var expected = checked((long)(decimal.Round((offset + sale) * rate / 100, 0, MidpointRounding.AwayFromZero) - decimal.Round(offset * rate / 100, 0, MidpointRounding.AwayFromZero)));
        if (originalSale != sale || item.AmountCents != expected || originalMonth != Text(detail, "competence") || Normalize(originalEmployee) != Normalize(Text(detail, "employeeName")))
            throw new DomainException("O total mensal de vendas mudou. Revise a aprovação das comissões comerciais antes de gerar ou assinar o relatório.", 409);
    }
}
