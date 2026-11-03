using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Infrastructure;

public sealed class ReferralCommissionRulesService(OperationsDbContext db)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private sealed record StoredRule(string Type, Guid CollaboratorId, string CollaboratorName,
        Guid ModuleId, string ModuleName, decimal Percentage, long FixedCents);

    public Task<string> SaveAsync(Guid collaboratorId, IReadOnlyCollection<ReferralCommissionRuleInput> inputs,
        ActorContext actor, CancellationToken cancellationToken = default) => MutateAsync(async () =>
    {
        RequireManagement(actor);
        var user = await ActiveUserAsync(collaboratorId, cancellationToken);
        var modules = await ModulesAsync(cancellationToken);
        if (inputs.Count != modules.Count || inputs.Select(x => x.ModuleId).Distinct().Count() != modules.Count
            || inputs.Any(x => modules.All(m => m.Id != x.ModuleId)))
            throw new DomainException("A lista de módulos mudou. Reabra as configurações antes de salvar todas as regras.", 409);
        if (inputs.Any(x => x.Type is not ("percentage" or "fixed") || x.Percentage is < 0 or > 100 || x.FixedCents < 0))
            throw new DomainException("Informe percentuais de 0 a 100 e valores fixos positivos ou iguais a zero.");
        var catalogs = await RulesAsync(cancellationToken);
        var rules = inputs.Select(x => new StoredRule(x.Type, user.Id, user.DisplayName, x.ModuleId,
            modules.Single(m => m.Id == x.ModuleId).Name, x.Percentage, x.FixedCents)).ToArray();
        Upsert(user, rules, catalogs);
        Audit(actor, "SaveReferralCommissionRules", user.Id, new { collaboratorId, modules = rules.Length });
        await db.SaveChangesAsync(cancellationToken);
        return Revision(rules);
    }, cancellationToken);

    public Task<string> CopyAsync(Guid sourceId, IReadOnlyCollection<Guid> targetIds, string expectedRevision,
        ActorContext actor, CancellationToken cancellationToken = default) => MutateAsync(async () =>
    {
        RequireManagement(actor);
        var ids = targetIds.Distinct().ToArray();
        if (ids.Length == 0 || ids.Contains(sourceId))
            throw new DomainException("Selecione os colaboradores que receberão as regras, sem incluir o colaborador de origem.");
        var source = await ActiveUserAsync(sourceId, cancellationToken);
        // Validate every recipient before changing any rule.
        var targets = await db.Users.Where(x => ids.Contains(x.Id) && x.Active && x.BlockedAt == null).ToListAsync(cancellationToken);
        if (targets.Count != ids.Length)
            throw new DomainException("Um dos colaboradores selecionados está inativo ou bloqueado. Atualize a lista antes de copiar.", 409);
        var modules = await ModulesAsync(cancellationToken);
        var catalogs = await RulesAsync(cancellationToken);
        var rules = modules.Select(module => Find(catalogs, source, module.Id, module.Name))
            .Select(entry => entry is null ? null : Parse(entry.Description)).ToArray();
        if (rules.Any(x => x is null))
            throw new DomainException("Salve todas as regras do colaborador de origem antes de copiar.", 409);
        var complete = rules.Select(x => x!).ToArray();
        var revision = Revision(complete);
        if (string.IsNullOrWhiteSpace(expectedRevision) || revision != expectedRevision)
            throw new DomainException("As regras de origem mudaram. Salve novamente antes de copiar.", 409);
        foreach (var target in targets)
        {
            Upsert(target, complete.Select(rule => rule with { CollaboratorId = target.Id, CollaboratorName = target.DisplayName }).ToArray(), catalogs);
            Audit(actor, "CopyReferralCommissionRules", target.Id, new { sourceId, modules = complete.Length });
        }
        await db.SaveChangesAsync(cancellationToken);
        return revision;
    }, cancellationToken);

    private async Task<T> MutateAsync<T>(Func<Task<T>> mutate, CancellationToken cancellationToken)
    {
        if (!db.Database.IsRelational()) return await mutate();
        return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            // Commission configuration is infrequent; one lock prevents partial concurrent copies.
            await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(780315221)", cancellationToken);
            var result = await mutate();
            await transaction.CommitAsync(cancellationToken);
            return result;
        });
    }

    private static void RequireManagement(ActorContext actor)
    {
        if (!actor.HasPermission("catalogs", "manage")) actor.RequirePermission("referrals", "manage");
    }

    private async Task<AppUser> ActiveUserAsync(Guid id, CancellationToken ct) =>
        await db.Users.SingleOrDefaultAsync(x => x.Id == id && x.Active && x.BlockedAt == null, ct)
        ?? throw new DomainException("Colaborador ativo não encontrado. Atualize a lista de colaboradores.", 409);

    private async Task<List<CustomerCatalogOption>> ModulesAsync(CancellationToken ct)
    {
        var modules = await db.CustomerCatalogOptions.Where(x => x.Catalog == "referralModule" && x.Active).OrderBy(x => x.Id).ToListAsync(ct);
        if (modules.Count == 0) throw new DomainException("Cadastre os módulos antes de configurar as comissões.");
        return modules;
    }

    private Task<List<CustomerCatalogOption>> RulesAsync(CancellationToken ct) =>
        db.CustomerCatalogOptions.Where(x => x.Catalog == "referralCommission").ToListAsync(ct);

    private static StoredRule? Parse(string value)
    {
        try { return JsonSerializer.Deserialize<StoredRule>(value, Json); }
        catch (JsonException) { return null; }
    }

    private static bool Matches(CustomerCatalogOption entry, AppUser user, Guid moduleId, string moduleName)
    {
        var rule = Parse(entry.Description);
        return rule is not null
            && (rule.CollaboratorId == user.Id || rule.CollaboratorId == Guid.Empty && string.Equals(rule.CollaboratorName, user.DisplayName, StringComparison.OrdinalIgnoreCase))
            && (rule.ModuleId == moduleId || rule.ModuleId == Guid.Empty && rule.ModuleName == moduleName);
    }

    private static CustomerCatalogOption? Find(List<CustomerCatalogOption> catalogs, AppUser user, Guid moduleId, string name) =>
        catalogs.Where(x => x.Active && Matches(x, user, moduleId, name)).OrderByDescending(x => x.UpdatedAt).FirstOrDefault();

    private void Upsert(AppUser user, StoredRule[] rules, List<CustomerCatalogOption> catalogs)
    {
        foreach (var rule in rules)
        {
            var matches = catalogs.Where(x => Matches(x, user, rule.ModuleId, rule.ModuleName)).OrderByDescending(x => x.Active).ThenByDescending(x => x.UpdatedAt).ToArray();
            var entry = matches.FirstOrDefault();
            if (entry is null)
            {
                var label = $"{user.DisplayName} · {rule.ModuleName}";
                entry = new CustomerCatalogOption { Catalog = "referralCommission", Name = $"{label[..Math.Min(88, label.Length)]} · {user.Id:N} · {rule.ModuleId:N}" };
                db.CustomerCatalogOptions.Add(entry);
                catalogs.Add(entry);
            }
            entry.Description = JsonSerializer.Serialize(rule, Json);
            entry.Active = true;
            entry.UpdatedAt = DateTimeOffset.UtcNow;
            foreach (var duplicate in matches.Skip(1)) { duplicate.Active = false; duplicate.UpdatedAt = entry.UpdatedAt; }
        }
    }

    private static string Revision(IEnumerable<StoredRule> rules) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(
        string.Join(";", rules.OrderBy(x => x.ModuleId).Select(x => $"{x.CollaboratorId}|{x.ModuleId}|{x.Type}|{x.Percentage.ToString("G29", CultureInfo.InvariantCulture)}|{x.FixedCents}")))));

    private void Audit(ActorContext actor, string action, Guid userId, object details) => db.AuditEvents.Add(new AuditEvent
    {
        ActorEmail = actor.Email, Action = action, Resource = "referralCommissionRules", ResourceId = userId.ToString(),
        Module = "referrals", DetailsJson = JsonSerializer.Serialize(details, Json),
    });
}
