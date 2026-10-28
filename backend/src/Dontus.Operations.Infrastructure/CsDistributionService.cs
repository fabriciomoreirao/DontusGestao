using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Infrastructure;

internal sealed class CsDistributionService(OperationsDbContext db)
{
    internal const string AuditAction = "DistributeCustomer";
    internal const string UnknownVersion = "Versão não informada";
    internal sealed record Assignment(Guid WorkItemId, string Track, string CustomerKey, string Version,
        Guid RecipientUserId, DateTimeOffset AssignedAt);

    private static string Key(string value) => string.Concat(value.Trim().Normalize(NormalizationForm.FormD)
        .Where(character => CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark)).ToLowerInvariant();
    private static string Text(JsonObject? value, string key) => value?[key] is JsonValue entry && entry.TryGetValue<string>(out var text) ? text.Trim() : "";
    private static JsonObject? Read(string? raw) { try { return JsonNode.Parse(raw ?? "{}") as JsonObject; } catch (JsonException) { return null; } }
    internal static bool IsDispatch(UpdateWorkItemCommand command) => command.ResponsibleUserId.HasValue &&
        Read(command.Description) is { } detail && Text(detail, "kind") == "csJourney";
    private static string Track(JsonObject detail) => Text(detail, "track") == "retention" ? "retention" : "activation";
    private static string Phase(JsonObject detail) => Text(detail, "phase") switch { "" => "validation", "activation" => "onboarding", "evolution" => "tracking", var phase => phase };
    private static Customer? FindCustomer(WorkItem item, JsonObject detail, IReadOnlyCollection<Customer> customers)
    {
        var clientId = Text(detail, "clientId");
        return customers.FirstOrDefault(customer => customer.Id == item.CustomerId ||
            clientId.Length > 0 && (customer.Id.ToString() == clientId || customer.DocumentMasked == clientId));
    }
    private static string ClientKey(WorkItem item, JsonObject detail, IReadOnlyCollection<Customer> customers) =>
        FindCustomer(item, detail, customers)?.Id.ToString() ?? item.CustomerId?.ToString() ??
        (Text(detail, "clientId") is { Length: > 0 } clientId ? Key(clientId) : item.Id.ToString());

    private static string ResolveVersion(WorkItem item, JsonObject detail, IReadOnlyCollection<Customer> customers,
        IReadOnlyDictionary<Guid, WorkItem> sources)
    {
        var customer = FindCustomer(item, detail, customers);
        if (!string.IsNullOrWhiteSpace(customer?.ProductVersion)) return customer.ProductVersion.Trim();
        if (Text(detail, "productVersion") is { Length: > 0 } version) return version;
        if (Guid.TryParse(Text(detail, "sourceLeadId"), out var sourceId) && sources.TryGetValue(sourceId, out var source) && Read(source.Description) is { } commercial)
        {
            if (Text(commercial, "productVersion") is { Length: > 0 } sourceVersion) return sourceVersion;
            if (commercial["products"] is JsonArray products)
            {
                // Add-on plan names (e.g. Nota Fiscal) are not system versions.
                var system = products.OfType<JsonObject>().FirstOrDefault(product =>
                    Key(Text(product, "product")).Contains("sistema") || Key(Text(product, "name")).Contains("sistema"));
                if (Text(system, "plan") is { Length: > 0 } plan) return plan;
            }
        }
        if (detail["distributionAssignment"] is JsonObject assignment && Text(assignment, "version") is { Length: > 0 } assignedVersion)
            return assignedVersion;
        return UnknownVersion;
    }

    internal async Task<IReadOnlyCollection<CsDistributionDto>> GetAsync(ActorContext actor, CancellationToken cancellationToken)
    {
        actor.RequirePermission("cs", "view");
        var eligibleIds = await db.UserAccessGroups.AsNoTracking()
            .Where(link => link.Group.Active && link.Group.Permissions.Any(permission => permission.Screen == "cs" && permission.CanView))
            .Select(link => link.UserId).Distinct().ToListAsync(cancellationToken);
        var users = await db.Users.AsNoTracking().Where(user => user.Active && !user.BlockedAt.HasValue && eligibleIds.Contains(user.Id))
            .OrderBy(user => user.DisplayName).ThenBy(user => user.Id).ToListAsync(cancellationToken);
        var allUsers = await db.Users.AsNoTracking().ToListAsync(cancellationToken);
        var names = allUsers.GroupBy(user => Key(user.DisplayName)).Where(group => group.Count() == 1)
            .ToDictionary(group => group.Key, group => group.Single().Id);
        var items = await db.WorkItems.AsNoTracking().Where(item => item.Module == "cs" || item.Module == "commercial").ToListAsync(cancellationToken);
        var sources = items.Where(item => item.Module == "commercial").ToDictionary(item => item.Id);
        var customers = await db.Customers.AsNoTracking().ToListAsync(cancellationToken);
        var versions = await db.CustomerCatalogOptions.AsNoTracking().Where(entry => entry.Catalog == "version" && entry.Active)
            .OrderBy(entry => entry.Name).Select(entry => entry.Name).ToListAsync(cancellationToken);
        var canonical = versions.GroupBy(Key).ToDictionary(group => group.Key, group => group.First());
        string Canonical(string version) { var key = Key(version); if (!canonical.TryGetValue(key, out var name)) canonical[key] = name = version.Trim(); return name; }

        var audit = await db.AuditEvents.AsNoTracking().Where(entry => entry.Module == "cs" && entry.Action == AuditAction)
            .OrderBy(entry => entry.CreatedAt).ToListAsync(cancellationToken);
        var assignments = new List<Assignment>();
        foreach (var entry in audit)
        {
            try { if (JsonSerializer.Deserialize<Assignment>(entry.DetailsJson) is { } assigned) assignments.Add(assigned with { Version = Canonical(assigned.Version),
                CustomerKey = customers.FirstOrDefault(customer => customer.Id.ToString() == assigned.CustomerKey ||
                    assigned.CustomerKey.Length > 0 && customer.DocumentMasked == assigned.CustomerKey)?.Id.ToString() ?? assigned.CustomerKey }); }
            catch (JsonException) { }
        }
        var events = await db.Activities.AsNoTracking().Where(entry => entry.Module == "cs" && entry.Kind == "Responsável alterado")
            .OrderByDescending(entry => entry.CreatedAt).ToListAsync(cancellationToken);
        var lastOwnerChange = events.GroupBy(entry => entry.EntityId).ToDictionary(group => group.Key, group => group.First().CreatedAt);
        var pending = new List<(string Track, CsDistributionClientDto Client)>();
        var current = new List<(string Track, Guid? UserId, string CustomerKey, string Phase, string Version, DateTimeOffset UpdatedAt, Guid ItemId)>();
        foreach (var item in items.Where(item => item.Module == "cs"))
        {
            if (Read(item.Description) is not { } detail || Text(detail, "kind") != "csJourney") continue;
            var track = Track(detail); var customerKey = ClientKey(item, detail, customers); var phase = Phase(detail);
            var version = Canonical(ResolveVersion(item, detail, customers, sources));
            Guid? userId = null;
            if (detail["distributionAssignment"] is JsonObject metadata && Guid.TryParse(Text(metadata, "recipientUserId"), out var stableId) &&
                allUsers.Any(user => user.Id == stableId && (Key(user.DisplayName) == Key(item.Owner) || !names.ContainsKey(Key(item.Owner))))) userId = stableId;
            if (!userId.HasValue && names.TryGetValue(Key(item.Owner), out var ownerId)) userId = ownerId;
            current.Add((track, userId, customerKey, phase, version, item.UpdatedAt, item.Id));
            if (phase == "validation") { pending.Add((track, new(item.Id, version))); continue; }
            if (!userId.HasValue) continue;
            var latestAudit = assignments.Where(entry => entry.Track == track && entry.CustomerKey == customerKey)
                .OrderByDescending(entry => entry.AssignedAt).FirstOrDefault();
            if (latestAudit is not null && latestAudit.RecipientUserId == userId) continue;
            var at = lastOwnerChange.GetValueOrDefault(item.Id, item.CreatedAt);
            if (!lastOwnerChange.ContainsKey(item.Id) && DateTimeOffset.TryParse(Text(detail, "onboardingStartedAt"), out var started)) at = started;
            assignments.Add(new(item.Id, track, customerKey, version, userId.Value, at));
        }

        var boards = new List<CsDistributionDto>();
        foreach (var track in new[] { "activation", "retention" })
        {
            var history = assignments.Where(entry => entry.Track == track).ToList();
            var clients = history.GroupBy(entry => entry.CustomerKey).Select(group => group.OrderByDescending(entry => entry.AssignedAt).First()).ToList();
            var portfolio = current.Where(entry => entry.Track == track).GroupBy(entry => entry.CustomerKey)
                .Select(group => group.OrderByDescending(entry => entry.UpdatedAt).ThenByDescending(entry => entry.ItemId).First())
                .Where(entry => entry.Phase is "onboarding" or "tracking" or "conference").ToArray();
            var collaborators = users.Select(user =>
            {
                var counts = portfolio.Where(entry => entry.UserId == user.Id).GroupBy(entry => new { entry.Phase, entry.Version })
                    .Select(group => new CsDistributionPortfolioCountDto(group.Key.Phase, group.Key.Version, group.Count())).ToArray();
                return new CsDistributionCollaboratorDto(user.Id, user.DisplayName, user.Department, ProfilePhotoUrls.For(user),
                    clients.Count(entry => entry.RecipientUserId == user.Id), counts.Sum(entry => entry.Quantity),
                    clients.Where(entry => entry.RecipientUserId == user.Id).GroupBy(entry => entry.Version).ToDictionary(group => group.Key, group => group.Count()),
                    history.Where(entry => entry.RecipientUserId == user.Id).Select(entry => (DateTimeOffset?)entry.AssignedAt).Max()) { CurrentPortfolio = counts };
            }).ToArray();
            var queues = canonical.Values.Distinct().OrderBy(version => version == UnknownVersion).ThenBy(version => version).Select(version =>
            {
                var last = history.Where(entry => entry.Version == version).OrderByDescending(entry => entry.AssignedAt).FirstOrDefault();
                var ordered = collaborators.OrderBy(entry => collaborators.Length > 1 && entry.UserId == last?.RecipientUserId ? 1 : 0)
                    .ThenBy(entry => entry.ClientsByVersion.GetValueOrDefault(version)).ThenBy(entry => entry.TotalClients)
                    .ThenBy(entry => history.Where(assignment => assignment.RecipientUserId == entry.UserId && assignment.Version == version).Select(assignment => (DateTimeOffset?)assignment.AssignedAt).Max())
                    .ThenBy(entry => entry.LastAssignedAt).ThenBy(entry => entry.DisplayName).ThenBy(entry => entry.UserId).Select(entry => entry.UserId).ToArray();
                return new CsDistributionQueueDto(version, ordered.Length > 0 ? ordered[0] : null, last?.RecipientUserId,
                    allUsers.FirstOrDefault(user => user.Id == last?.RecipientUserId)?.DisplayName, last?.AssignedAt, ordered);
            }).ToArray();
            boards.Add(new(track, DateTimeOffset.UtcNow, collaborators, queues, pending.Where(entry => entry.Track == track).Select(entry => entry.Client).ToArray()));
        }
        return boards;
    }

    internal async Task<Assignment?> PrepareAsync(WorkItem item, UpdateWorkItemCommand command, ActorContext actor, CancellationToken cancellationToken)
    {
        if (item.Module != "cs" || !command.ResponsibleUserId.HasValue || Read(item.Description) is not { } before ||
            Read(command.Description) is not { } after || Text(before, "kind") != "csJourney") return null;
        var advancing = Phase(before) == "validation" && Phase(after) == "onboarding";
        var previousRecipient = before["distributionAssignment"] is JsonObject metadata ? Text(metadata, "recipientUserId") : "";
        var changing = Phase(before) != "validation" && (!Guid.TryParse(previousRecipient, out var previousUserId) || previousUserId != command.ResponsibleUserId);
        if (!advancing && !changing) return null;
        var boards = await GetAsync(actor, cancellationToken);
        var board = boards.Single(entry => entry.Track == Track(before));
        var version = command.DistributionVersion?.Trim();
        version = string.IsNullOrWhiteSpace(version) ? board.PendingClients.FirstOrDefault(entry => entry.WorkItemId == item.Id)?.Version ??
            (before["distributionAssignment"] is JsonObject previous ? Text(previous, "version") : UnknownVersion) : version;
        var queue = board.Queues.FirstOrDefault(entry => Key(entry.Version) == Key(version));
        if (command.ExpectedNextResponsibleUserId.HasValue)
        {
            if (!board.Collaborators.Any(entry => entry.UserId == command.ResponsibleUserId))
                throw new DomainException("O responsável precisa estar ativo e vinculado ao Acompanhamento de CS.", 409);
            if (queue is null || queue.Version == UnknownVersion) throw new DomainException("Informe a versão do cliente para consultar o rodízio.");
            if (queue.SuggestedUserId != command.ExpectedNextResponsibleUserId)
                throw new DomainException("A fila de rodízio mudou após outro envio. Aguarde a atualização da fila e confira a nova sugestão.", 409);
        }
        var customers = await db.Customers.AsNoTracking().ToListAsync(cancellationToken);
        return new(item.Id, Track(before), ClientKey(item, before, customers), queue?.Version ?? version, command.ResponsibleUserId.Value, DateTimeOffset.UtcNow);
    }

    internal static string PreserveMetadata(string before, string? after, Assignment? assignment)
    {
        if (Read(after) is not { } detail) return after ?? "";
        detail.Remove("distributionAssignment");
        if (assignment is not null) detail["distributionAssignment"] = new JsonObject { ["recipientUserId"] = assignment.RecipientUserId.ToString(),
            ["version"] = assignment.Version, ["assignedAt"] = assignment.AssignedAt.ToString("O") };
        else if (Read(before)?["distributionAssignment"] is JsonObject existing) detail["distributionAssignment"] = existing.DeepClone();
        return detail.ToJsonString();
    }
}
