using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Infrastructure;

public sealed class CommissionConfirmationService(OperationsDbContext db, IDataProtectionProvider protection)
{
    private IDataProtector Protector => protection.CreateProtector("commission-confirmation-links-v1");
    internal static JsonObject Detail(string json)
    {
        try { return JsonNode.Parse(json) as JsonObject ?? new(); }
        catch (JsonException) { return new(); }
    }
    internal static string Text(JsonObject detail, string key) => detail[key]?.ToString() ?? "";
    internal static long Cents(JsonObject detail, string key) => long.TryParse(Text(detail, key), out var value) ? value : 0;
    private static bool Manager(ActorContext actor, string module) => actor.HasPermission(module, "approve") || actor.HasPermission(module, "manage");
    private static void Module(string module)
    {
        if (module is not ("commissions" or "referrals")) throw new DomainException("Módulo de confirmação inválido.");
    }
    private static string EmployeeKey(WorkItem item, JsonObject detail) => item.Module == "referrals"
        ? (item.CreatedBy == "" ? "name:" + item.Owner : item.CreatedBy.ToLowerInvariant())
        : Text(detail, "employeeId") is { Length: > 0 } id ? id : "name:" + item.Owner;

    public async Task<object> ListAsync(string module, string scope, string competence, ActorContext actor, CancellationToken ct)
    {
        Module(module); actor.RequirePermission(module, "view");
        var query = db.CommissionConfirmations.AsNoTracking().Where(x => x.Module == module && x.Scope == scope && x.Competence == competence);
        if (!Manager(actor, module))
        {
            var userId = await db.Users.Where(x => x.Email == actor.Email).Select(x => x.Id).SingleAsync(ct);
            query = query.Where(x => x.EmployeeUserId == userId || x.EmployeeUserId == null && (x.EmployeeKey == userId.ToString() || x.EmployeeKey == actor.Email.ToLower()));
        }
        var entries = await query.OrderByDescending(x => x.CreatedAt).ToListAsync(ct);
        return entries.Select(x => new { x.Id, x.EmployeeName, x.Competence, x.CreatedAt, x.AgreedAt, x.InvalidatedAt,
            status = x.InvalidatedAt.HasValue ? "invalidated" : x.AgreedAt.HasValue ? "agreed" : "pending",
            totalCents = Snapshot(x).TotalCents, x.SignedByName, x.SignedByEmail, pdfAvailable = x.AgreedAt.HasValue, token = Protector.Unprotect(x.ProtectedToken) });
    }

    public async Task<object> GenerateAsync(GenerateCommissionConfirmation command, ActorContext actor, CancellationToken ct)
    {
        Module(command.Module);
        if (!Manager(actor, command.Module)) throw new DomainException("Gerar confirmação exige aprovação neste módulo.", 403);
        if (!DateOnly.TryParseExact(command.Competence + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _) ||
            command.Module == "commissions" && command.Scope is not ("commercial" or "cs" or "lia") ||
            command.Module == "referrals" && command.Scope != "referrals") throw new DomainException("Informe a competência e o setor.");
        if (command.Entries is null || command.Entries.Count is < 1 or > 2000 || command.Entries.Select(x => x.Id).Distinct().Count() != command.Entries.Count)
            throw new DomainException("Selecione lançamentos únicos e já aprovados ou reprovados.");
        var filters = command.Filters ?? new();
        if (filters.Count > 20 || filters.Any(x => x.Key.Length > 100 || x.Value.Length > 1000)) throw new DomainException("Filtros inválidos.");
        var ids = command.Entries.Select(x => x.Id).ToArray();
        var items = await db.WorkItems.Where(x => ids.Contains(x.Id) && x.Module == command.Module).ToListAsync(ct);
        if (items.Count != ids.Length) throw new DomainException("Um lançamento não está mais disponível. Atualize a lista.", 409);
        var groups = new Dictionary<string, (Guid UserId, string Name, List<CommissionReportRow> Rows)>();
        foreach (var item in items.OrderBy(x => x.Id))
        {
            if (item.Version != command.Entries.Single(x => x.Id == item.Id).Version) throw new DomainException("Os lançamentos foram alterados. Atualize a lista.", 409);
            var detail = Detail(item.Description); var referral = command.Module == "referrals";
            var decision = Text(detail, referral ? "phase" : "decision");
            var reason = Text(detail, referral ? "decisionReason" : "reason");
            var month = referral && DateTimeOffset.TryParse(Text(detail, "decisionAt"), CultureInfo.InvariantCulture, DateTimeStyles.None, out var decidedAt)
                ? decidedAt.ToOffset(TimeSpan.FromHours(-3)).ToString("yyyy-MM", CultureInfo.InvariantCulture) : Text(detail, "competence");
            if (decision is not ("approved" or "rejected") || string.IsNullOrWhiteSpace(reason))
                throw new DomainException("Atualize todos os clientes: aprove ou reprove e informe o motivo antes de enviar.", 409);
            if (month != command.Competence || !referral && Text(detail, "scope") != command.Scope)
                throw new DomainException("Os lançamentos não correspondem à competência e aos filtros.", 409);
            var key = EmployeeKey(item, detail);
            if (!groups.ContainsKey(key))
            {
                Guid? id = Guid.TryParse(key, out var userId) ? userId : null;
                var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => (id.HasValue && x.Id == id) || x.Email == key, ct);
                if (user is null || !user.Active || user.BlockedAt.HasValue) throw new DomainException("Vincule cada comissão a um usuário responsável ativo antes de gerar o documento.", 409);
                groups[key] = (user.Id, user.DisplayName, new());
            }
            WorkItem? source = null;
            if (Guid.TryParse(Text(detail, "sourceId"), out var sourceId)) source = await db.WorkItems.AsNoTracking().SingleOrDefaultAsync(x => x.Id == sourceId, ct);
            var journey = source is null ? new JsonObject() : Detail(source.Description);
            var score = decimal.TryParse(Text(detail, "score"), NumberStyles.Number, CultureInfo.InvariantCulture, out var number) ? (decimal?)number : null;
            var sale = Cents(detail, referral ? "valueCents" : "saleValueCents");
            var payout = decision == "approved" ? Cents(detail, "commissionCents") : 0;
            if (sale < 0 || payout < 0 || item.AmountCents != payout) throw new DomainException("O valor do lançamento é inconsistente. Revise a decisão.", 409);
            groups[key].Rows.Add(new(item.Id, item.Version, referral ? Text(detail, "dentistName") : Text(detail, "customerName"),
                Text(detail, referral ? "moduleName" : "product"), Text(detail, "customerStatus"),
                referral ? (decision == "approved" ? "Indicação aprovada" : "Indicação reprovada") : Text(detail, "sourceStatus"), score,
                Text(detail, "usageStatus"), sale, payout, Text(detail, referral ? "commissionLabel" : "ruleLabel"), decision, reason,
                Text(detail, referral ? "reviewer" : "decidedBy"), Text(detail, referral ? "decisionAt" : "decidedAt"),
                Text(journey, "firstMeetingCompletedAt") is { Length: > 0 } kickoff ? kickoff : Text(journey, "firstMeetingAt"),
                Text(journey, "trainingCompletedAt") is { Length: > 0 } training ? training : Text(journey, "trainingAt"),
                Text(journey, "singleAlignmentCompletedAt") is { Length: > 0 } alignment ? alignment : Text(journey, "singleAlignmentAt"),
                Text(detail, "sector"), Text(detail, "manualCustomerCode"), Text(detail, "manual") == "true"));
        }
        var output = new List<object>();
        foreach (var (key, group) in groups)
        {
            var snapshot = new CommissionReportSnapshot(command.Module, command.Scope, command.Competence, group.Name, filters, group.Rows, group.Rows.Sum(x => x.CommissionCents));
            var json = JsonSerializer.Serialize(snapshot);
            var existing = await db.CommissionConfirmations.FirstOrDefaultAsync(x => x.Module == command.Module && x.Scope == command.Scope &&
                x.Competence == command.Competence && x.EmployeeKey == key && x.InvalidatedAt == null && x.SnapshotJson == json, ct);
            var token = existing is null ? Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant() : Protector.Unprotect(existing.ProtectedToken);
            var entry = existing ?? new CommissionConfirmation { Module = command.Module, Scope = command.Scope, Competence = command.Competence,
                EmployeeKey = key, EmployeeUserId = group.UserId, EmployeeName = group.Name, SnapshotJson = json, TokenHash = Hash(token), ProtectedToken = Protector.Protect(token), CreatedBy = actor.Email };
            if (existing is null)
            {
                db.CommissionConfirmations.Add(entry); Audit(actor.Email, "GenerateConfirmation", entry);
            }
            output.Add(new { entry.Id, entry.EmployeeName, entry.AgreedAt, token });
        }
        await db.SaveChangesAsync(ct);
        return output;
    }

    public async Task<object> GetPublicAsync(string token, ActorContext actor, CancellationToken ct)
    {
        var entry = await FindAsync(token, ct);
        var owner = await RequireAccessAsync(entry, actor, false, ct);
        if (entry.InvalidatedAt.HasValue) throw new DomainException("Este relatório foi atualizado. Solicite um novo link de confirmação.", 409);
        if (!entry.AgreedAt.HasValue) await ValidateVersionsAsync(entry, ct);
        return new { report = Snapshot(entry), entry.CreatedAt, entry.AgreedAt, canSign = owner, viewerName = actor.DisplayName,
            signature = entry.AgreedAt.HasValue ? new { entry.SignedByName, entry.SignedByEmail, entry.SignedByUserId, strokes = JsonSerializer.Deserialize<List<SignatureStroke>>(entry.SignatureJson), browser = JsonSerializer.Deserialize<JsonObject>(entry.BrowserJson), entry.EvidenceHash } : null,
            pdfAvailable = entry.AgreedAt.HasValue, status = entry.AgreedAt.HasValue ? "agreed" : "pending" };
    }

    public async Task<DateTimeOffset> AgreeAsync(string token, AgreeCommissionConfirmation command, ActorContext actor, string userAgent, CancellationToken ct)
    {
        var entry = await FindAsync(token, ct);
        await RequireAccessAsync(entry, actor, true, ct);
        if (!command.Agree) throw new DomainException("Marque a opção de concordância para confirmar o relatório.");
        if (entry.InvalidatedAt.HasValue) throw new DomainException("Este relatório foi atualizado. Solicite um novo link.", 409);
        if (entry.AgreedAt.HasValue) return entry.AgreedAt.Value;
        ValidateSignature(command, userAgent);
        await ValidateVersionsAsync(entry, ct);
        // Touch the source versions in the same SaveChanges transaction. A concurrent decision
        // or deletion makes the agreement fail instead of confirming an outdated report.
        var ids = Snapshot(entry).Rows.Select(x => x.Id).ToArray();
        var items = await db.WorkItems.Where(x => ids.Contains(x.Id)).ToListAsync(ct);
        var versions = Snapshot(entry).Rows.ToDictionary(x => x.Id, x => x.Version);
        if (items.Count != ids.Length || items.Any(x => x.Version != versions[x.Id]))
            throw new DomainException("Os valores ou decisões mudaram. Solicite um novo link de confirmação.", 409);
        foreach (var item in items) db.Entry(item).Property(x => x.Version).IsModified = true;
        entry.AgreedAt = DateTimeOffset.UtcNow; entry.UpdatedAt = entry.AgreedAt.Value; entry.Version++;
        var user = await db.Users.AsNoTracking().SingleAsync(x => x.Email == actor.Email, ct);
        entry.SignedByUserId = user.Id; entry.SignedByName = user.DisplayName; entry.SignedByEmail = user.Email;
        entry.SignatureJson = JsonSerializer.Serialize(command.Signature);
        entry.BrowserJson = JsonSerializer.Serialize(new { userAgent, command.Browser!.Language, command.Browser.Platform, command.Browser.TimeZone, command.Browser.ScreenWidth, command.Browser.ScreenHeight });
        entry.EvidenceHash = Hash(entry.SnapshotJson + entry.SignedByUserId + entry.SignedByName + entry.SignedByEmail + entry.AgreedAt.Value.ToString("O") + entry.SignatureJson + entry.BrowserJson);
        entry.SignedPdf = CommissionConfirmationPdf.Create(entry);
        Audit(actor.Email, "AgreeConfirmation", entry);
        await db.SaveChangesAsync(ct);
        return entry.AgreedAt.Value;
    }

    public async Task<(byte[] Bytes, string FileName)> DownloadAsync(string token, ActorContext actor, CancellationToken ct)
    {
        var entry = await FindAsync(token, ct); await RequireAccessAsync(entry, actor, false, ct);
        if (!entry.AgreedAt.HasValue) throw new DomainException("O PDF estará disponível após a assinatura do responsável.", 409);
        if (entry.InvalidatedAt.HasValue) throw new DomainException("Documento indisponível.", 409);
        return (entry.SignedPdf.Length > 0 ? entry.SignedPdf : CommissionConfirmationPdf.Create(entry), $"comissoes-{entry.Competence}-{entry.Id:N}.pdf");
    }

    private async Task<bool> RequireAccessAsync(CommissionConfirmation entry, ActorContext actor, bool signing, CancellationToken ct)
    {
        actor.RequirePermission(entry.Module, "view");
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Email == actor.Email && x.Active && x.BlockedAt == null, ct)
            ?? throw new DomainException("Entre com um usuário ativo para acessar o documento.", 401);
        var owner = entry.EmployeeUserId.HasValue ? entry.EmployeeUserId == user.Id :
            string.Equals(entry.EmployeeKey, user.Id.ToString(), StringComparison.OrdinalIgnoreCase) || string.Equals(entry.EmployeeKey, user.Email, StringComparison.OrdinalIgnoreCase);
        if (signing && !owner) throw new DomainException("Somente o usuário responsável por esta comissão pode assinar o documento.", 403);
        if (!owner && !Manager(actor, entry.Module)) throw new DomainException("Este documento está restrito ao responsável e à supervisão autorizada.", 403);
        return owner;
    }

    private static void ValidateSignature(AgreeCommissionConfirmation command, string userAgent)
    {
        var strokes = command.Signature;
        if (strokes is null || strokes.Count is < 1 or > 50 || strokes.Any(x => x is null || x.Points is null || x.Points.Count is < 2 or > 3000) || strokes.Sum(x => x.Points.Count) > 12000)
            throw new DomainException("Desenhe sua rubrica no quadro de assinatura.");
        if (strokes.SelectMany(x => x.Points).Any(p => p is null || !double.IsFinite(p.X) || !double.IsFinite(p.Y) || p.X < 0 || p.X > 1 || p.Y < 0 || p.Y > 1))
            throw new DomainException("A rubrica contém coordenadas inválidas.");
        var distance = strokes.Sum(s => s.Points.Zip(s.Points.Skip(1), (a, b) => Math.Sqrt(Math.Pow(a.X-b.X,2)+Math.Pow(a.Y-b.Y,2))).Sum());
        if (distance < .15) throw new DomainException("Desenhe uma rubrica completa antes de confirmar.");
        var browser = command.Browser;
        if (browser is null || string.IsNullOrWhiteSpace(userAgent) || userAgent.Length > 2000 ||
            string.IsNullOrWhiteSpace(browser.Language) || browser.Language.Length > 80 || (browser.Platform?.Length ?? 0) > 160 ||
            string.IsNullOrWhiteSpace(browser.TimeZone) || browser.TimeZone.Length > 100 || browser.ScreenWidth is < 1 or > 20000 || browser.ScreenHeight is < 1 or > 20000)
            throw new DomainException("Não foi possível registrar os dados do navegador. Atualize a página e tente novamente.");
    }

    private async Task ValidateVersionsAsync(CommissionConfirmation entry, CancellationToken ct)
    {
        var rows = Snapshot(entry).Rows; var ids = rows.Select(x => x.Id).ToArray();
        var versions = await db.WorkItems.AsNoTracking().Where(x => ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.Version, ct);
        if (rows.Any(x => !versions.TryGetValue(x.Id, out var version) || version != x.Version))
            throw new DomainException("Os valores ou decisões mudaram. Solicite um novo link de confirmação.", 409);
    }
    internal static async Task InvalidatePendingAsync(OperationsDbContext db, WorkItem item, CancellationToken ct)
    {
        if (item.Module is not ("commissions" or "referrals")) return;
        var entries = await db.CommissionConfirmations.Where(x => x.Module == item.Module && x.AgreedAt == null && x.InvalidatedAt == null).ToListAsync(ct);
        foreach (var entry in entries.Where(x => Snapshot(x).Rows.Any(row => row.Id == item.Id)))
        { entry.InvalidatedAt = DateTimeOffset.UtcNow; entry.UpdatedAt = entry.InvalidatedAt.Value; entry.Version++; }
    }
    private async Task<CommissionConfirmation> FindAsync(string token, CancellationToken ct)
    {
        if (token.Length != 64 || token.Any(c => !Uri.IsHexDigit(c))) throw new DomainException("Link de confirmação inválido.", 404);
        var hash = Hash(token);
        return await db.CommissionConfirmations.SingleOrDefaultAsync(x => x.TokenHash == hash, ct) ?? throw new DomainException("Relatório não encontrado.", 404);
    }
    private static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    private static CommissionReportSnapshot Snapshot(CommissionConfirmation entry) => JsonSerializer.Deserialize<CommissionReportSnapshot>(entry.SnapshotJson)!;
    private void Audit(string email, string action, CommissionConfirmation entry) => db.AuditEvents.Add(new AuditEvent {
        ActorEmail = email, Action = action, Module = entry.Module, Resource = "commission_confirmation", ResourceId = entry.Id.ToString() });
}
