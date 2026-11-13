using System.Globalization;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Dontus.Operations.Domain;

namespace Dontus.Operations.Infrastructure;

internal sealed class GoalScope(JsonObject goal, IReadOnlyCollection<CustomerCatalogOption>? catalogs)
{
    private static string Text(JsonObject value, string key) => value[key]?.ToString() ?? "";
    private static string Normalize(string value) => string.Concat(value.Normalize(NormalizationForm.FormD)
        .Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)).Trim().ToLowerInvariant();
    private static bool Same(string left, string right) => left != "" && Normalize(left) == Normalize(right);
    private static bool ModuleName(string name) => Regex.IsMatch(Normalize(name), @"\bmodulos?\b");
    private List<JsonObject> Funnels => goal["funnels"] is JsonArray values ? values.OfType<JsonObject>().ToList()
        : Text(goal, "funnelId") != "" || Text(goal, "funnelName") != ""
            ? [new JsonObject { ["id"] = Text(goal, "funnelId"), ["name"] = Text(goal, "funnelName") }] : [];
    private List<JsonObject> Modules => (goal["modules"] as JsonArray ?? []).OfType<JsonObject>().ToList();
    private string CatalogName(string catalog, string id) => catalogs?.FirstOrDefault(entry => entry.Catalog == catalog && Same(entry.Id.ToString(), id))?.Name ?? "";
    private string FunnelNameFor(JsonObject funnel) => CatalogName("funnelStage", Text(funnel, "id")) is { Length: > 0 } name ? name : Text(funnel, "name");
    internal string FunnelId => Funnels.Count == 1 ? Text(Funnels[0], "id") : "";
    internal string FunnelName => string.Join(", ", Funnels.Select(FunnelNameFor).Where(name => name != "").Distinct());
    internal string ModuleLabel => Text(goal, "moduleScope") == "moduleFunnels"
        ? Modules.Count == 0 ? "Todos os módulos" : string.Join(", ", Modules.Select(module => Text(module, "plan") is { Length: > 0 } plan ? plan : Text(module, "productName"))) : "";

    private bool MatchesFunnel(JsonObject funnel, JsonObject source)
    {
        var id = Text(funnel, "id"); var sourceId = Text(source, "funnelId");
        if (id != "" && sourceId != "") return Same(id, sourceId);
        return Same(Text(funnel, "name"), Text(source, "funnel")) || Same(FunnelNameFor(funnel), Text(source, "funnel"));
    }
    private bool MatchesModule(JsonObject module, JsonObject product)
    {
        var id = Text(module, "productId"); var sourceId = Text(product, "productId");
        var name = ProductName(product);
        var sameProduct = id != "" && sourceId != "" ? Same(id, sourceId)
            : Same(Text(module, "productName"), name) || Same(CatalogName("commercialProduct", id), name);
        return sameProduct && (Text(module, "plan") == "" || Same(Text(module, "plan"), Text(product, "plan")));
    }
    private static string ProductName(JsonObject product) => new[] { "product", "productName", "name" }.Select(key => Text(product, key)).FirstOrDefault(name => name != "") ?? "";

    // A nullable value distinguishes a nonmatching card from a matching free module.
    internal long? SaleValue(JsonObject source, long totalCents)
    {
        var funnels = Funnels;
        if (funnels.Count > 0 && !funnels.Any(funnel => MatchesFunnel(funnel, source))) return null;
        var moduleFunnel = ModuleName(Text(source, "funnel")) || ModuleName(CatalogName("funnelStage", Text(source, "funnelId")))
            || funnels.Any(funnel => MatchesFunnel(funnel, source) && (ModuleName(Text(funnel, "name")) || ModuleName(FunnelNameFor(funnel))));
        if (Text(goal, "moduleScope") != "moduleFunnels" || !moduleFunnel) return totalCents;
        var modules = Modules;
        var products = (source["products"] as JsonArray ?? []).OfType<JsonObject>().Where(product => modules.Count > 0
            ? modules.Any(module => MatchesModule(module, product))
            : ModuleName(ProductName(product)) || ModuleName(CatalogName("commercialProduct", Text(product, "productId")))).ToList();
        return products.Count == 0 ? null : products.Sum(CommercialCommissionSource.ProductValue);
    }

    internal static void Validate(JsonObject goal, string metric)
    {
        static bool ValidText(JsonObject row, string key) => !row.ContainsKey(key) || row[key] is JsonValue value && value.TryGetValue<string>(out _);
        static bool ValidId(string id) => id == "" || Guid.TryParse(id, out _);
        if (!ValidText(goal, "funnelId") || !ValidText(goal, "funnelName") || !ValidId(Text(goal, "funnelId"))) throw new DomainException("Selecione um funil válido.");
        if (goal.ContainsKey("funnels") && (goal["funnels"] is not JsonArray funnels || funnels.Any(value => value is not JsonObject row
            || !ValidText(row, "id") || !ValidText(row, "name") || !ValidId(Text(row, "id")) || string.IsNullOrWhiteSpace(Text(row, "id") + Text(row, "name")))))
            throw new DomainException("Selecione funis válidos para a meta.");
        if (goal.ContainsKey("modules") && (goal["modules"] is not JsonArray modules || modules.Any(value => value is not JsonObject row
            || !ValidText(row, "productId") || !ValidText(row, "productName") || !ValidText(row, "plan") || !ValidId(Text(row, "productId"))
            || string.IsNullOrWhiteSpace(Text(row, "productId") + Text(row, "productName")))))
            throw new DomainException("Selecione módulos válidos para a meta.");
        if (goal.ContainsKey("moduleScope") && Text(goal, "moduleScope") != "moduleFunnels") throw new DomainException("Selecione o filtro de módulos do funil.");
        var scope = new GoalScope(goal, null);
        if (scope.Modules.Count > 0 && Text(goal, "moduleScope") == "") throw new DomainException("Vincule os módulos ao funil de módulos.");
        if (Text(goal, "moduleScope") != "" && scope.Funnels.Count == 0) throw new DomainException("Selecione o funil de módulos da meta.");
        if ((scope.Funnels.Count > 0 || Text(goal, "moduleScope") != "") && metric is not ("salesValue" or "salesCount"))
            throw new DomainException("O filtro por funis e módulos está disponível nas metas de vendas.");
    }
}
