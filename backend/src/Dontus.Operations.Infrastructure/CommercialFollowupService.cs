using System.Globalization;
using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Infrastructure;

public sealed class CommercialFollowupService(OperationsDbContext db, IOperationsService operations, IAgendaService agenda)
{
    public async Task<Guid> SendAsync(SendCommercialFollowupCommand command, ActorContext actor, CancellationToken ct = default)
    {
        actor.RequirePermission("commercial", "edit");
        if (!db.Database.IsRelational()) return await SendCoreAsync(command, actor, ct);
        var attempt = 0;
        return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            if (attempt++ > 0) db.ChangeTracker.Clear();
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            // Serialize commercial handoffs so a retry or concurrent click cannot
            // create two journeys or take a fourth reservation in the same slot.
            if (db.Database.ProviderName?.Contains("Npgsql") == true)
                await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(74219, 2)", ct);
            try
            {
                var id = await SendCoreAsync(command, actor, ct);
                await transaction.CommitAsync(ct);
                return id;
            }
            catch
            {
                await transaction.RollbackAsync(ct);
                db.ChangeTracker.Clear();
                throw;
            }
        });
    }

    private async Task<Guid> SendCoreAsync(SendCommercialFollowupCommand command, ActorContext actor, CancellationToken ct)
    {
        if (command.Track is not ("activation" or "retention" or "lia"))
            throw new DomainException("Selecione o tipo de acompanhamento.");
        var lead = await db.WorkItems.AsNoTracking().SingleOrDefaultAsync(x => x.Id == command.LeadId && x.Module == "commercial", ct)
            ?? throw new DomainException("Card comercial não encontrado.", 404);
        if (lead.Version != command.LeadVersion)
            throw new DomainException("O card foi alterado. Atualize a tela antes de encaminhar.", 409);
        var funnels = await db.CustomerCatalogOptions.AsNoTracking().Where(x => x.Catalog == "funnelStage").ToListAsync(ct);
        var retentionContact = lead.RecordType == "Lead de retenção";
        if (retentionContact && (command.Track != "retention" || command.StartsAt.HasValue))
            throw new DomainException("Use o encaminhamento sem agendamento para o contato do CRM Retenção.");
        if (!retentionContact && !SalesCelebrationService.IsWon(lead, funnels))
            throw new DomainException("Confirme o ganho antes de encaminhar o acompanhamento.", 409);
        var detail = CommissionConfirmationService.Detail(lead.Description);
        if (detail["kind"]?.ToString() != "commercialLead") throw new DomainException("Os dados comerciais do card são inválidos.");
        var customerName = FirstText(detail["customer"]?.ToString(), lead.CustomerName);
        var isLia = command.Track == "lia";
        var targetModule = isLia ? "lia" : "cs";
        var previousJourneys = await db.WorkItems.AsNoTracking()
            .Where(x => x.Module == targetModule && (x.OriginId == lead.Id || x.Description.Contains(lead.Id.ToString())))
            .Select(x => x.Description).ToArrayAsync(ct);
        if (previousJourneys.Any(value =>
        {
            var previous = CommissionConfirmationService.Detail(value);
            return Guid.TryParse(previous["sourceLeadId"]?.ToString(), out var sourceId) && sourceId == lead.Id
                && (isLia || (previous["track"]?.ToString() ?? "activation") == command.Track);
        })) throw new DomainException("Este card já foi encaminhado para este acompanhamento.", 409);
        var scheduled = command.StartsAt.HasValue;
        var customer = lead.CustomerId.HasValue ? await db.Customers.AsNoTracking().SingleOrDefaultAsync(x => x.Id == lead.CustomerId, ct) : null;
        var clientId = FirstText(command.ClientId, detail["clientId"]?.ToString(), customer?.DocumentMasked);
        var version = FirstText(command.ProductVersion, detail["version"]?.ToString(), customer?.ProductVersion);
        if ((scheduled || retentionContact) && (clientId.Length != 6 || !clientId.All(char.IsAsciiDigit)))
            throw new DomainException("Informe o ID do cliente com 6 números.");
        if ((scheduled || retentionContact) && version.Length == 0) throw new DomainException("Informe a versão do cliente.");
        if (clientId.Length != 6 || !clientId.All(char.IsAsciiDigit)) clientId = "";
        var owner = isLia ? "Fila compartilhada" : command.Owner?.Trim();
        if (!isLia && string.IsNullOrWhiteSpace(owner)) throw new DomainException("Não foi localizado um responsável pelo acompanhamento.");
        Guid? commitmentId = null;
        string? date = null, time = null;
        if (scheduled)
        {
            var agendaId = command.AgendaId ?? throw new DomainException("Selecione uma agenda ativa.");
            var responsible = command.ResponsibleUserId ?? throw new DomainException("Selecione o responsável pelo agendamento.");
            var typeId = command.AgendaTypeId ?? throw new DomainException("Selecione o tipo de agendamento.");
            var type = await db.AgendaTypes.AsNoTracking().SingleOrDefaultAsync(x => x.Active && x.Id == typeId, ct)
                ?? throw new DomainException("O tipo de agendamento selecionado não está ativo. Atualize os tipos da Agenda e selecione novamente.");
            var status = await db.AgendaStatuses.AsNoTracking().FirstOrDefaultAsync(x => x.Active && x.Name.Trim().ToLower() == "agendado", ct)
                ?? throw new DomainException("O status Agendado precisa estar ativo no cadastro da Agenda.");
            var startsAt = command.StartsAt!.Value;
            var local = startsAt.ToOffset(TimeSpan.FromHours(-3));
            date = local.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            time = local.ToString("HH:mm", CultureInfo.InvariantCulture);
            if (local.Second != 0 || local.Millisecond != 0 || time is not ("09:30" or "11:00" or "14:00" or "16:00"))
                throw new DomainException("Selecione um dos horários comerciais disponíveis.");
            var ids = await agenda.CreateCommitmentAsync(new(agendaId, type.Id, status.Id, responsible,
                $"Kick off ({version}) - ID: {clientId}", FirstText(command.Description, $"Kick off comercial de {customerName}"),
                startsAt, startsAt.AddHours(1), [], "none"), actor, ct);
            commitmentId = ids.Single();
        }
        var now = DateTimeOffset.UtcNow.ToString("O");
        var trackLabel = isLia ? "LIA" : command.Track == "activation" ? "Ativação" : "Retenção";
        var journey = isLia
            ? new JsonObject
            {
                ["kind"] = "liaJourney", ["sourceLeadId"] = lead.Id, ["clientId"] = clientId,
                ["liaPlan"] = detail["liaPlan"]?.DeepClone(), ["whatsapp"] = detail["phone"]?.DeepClone(),
                ["products"] = detail["products"]?.DeepClone(), ["startDate"] = now,
                ["kickoffDate"] = date ?? "", ["kickoffTime"] = time ?? "", ["kickoffCommitmentId"] = commitmentId,
                ["sector"] = "Comercial", ["requestType"] = "Cliente ganho",
                ["history"] = new JsonArray(new JsonObject { ["id"] = Guid.NewGuid(), ["text"] = "Cliente encaminhado pelo CRM para a LIA.", ["at"] = now, ["author"] = actor.DisplayName })
            }
            : new JsonObject
            {
                ["kind"] = "csJourney", ["track"] = command.Track, ["phase"] = "validation",
                ["sourceLeadId"] = lead.Id, ["clientId"] = clientId,
                ["scheduledAt"] = command.StartsAt?.ToString("O") ?? "", ["scheduling"] = scheduled ? "scheduled" : "not-scheduled",
                ["commerciallyApproved"] = true, ["firstMeetingAt"] = command.StartsAt?.ToString("O") ?? "",
                ["firstMeetingTime"] = time ?? "", ["firstMeetingCommitmentId"] = commitmentId,
                ["trainingAt"] = "", ["rescheduledAt"] = "", ["status"] = "Pendente",
                ["featuresBase"] = new JsonArray(), ["featuresActive"] = new JsonArray(), ["featuresPlus"] = new JsonArray(),
                ["labels"] = new JsonArray(),
                ["follows"] = new JsonArray(new JsonObject { ["kind"] = "Origem comercial", ["text"] = scheduled
                    ? $"Cliente enviado para acompanhamento de {trackLabel} com Kick off agendado em {date} às {time}."
                    : $"Cliente enviado para acompanhamento de {trackLabel}.", ["createdAt"] = now, ["actor"] = actor.DisplayName })
            };
        var journeyId = await operations.CreateWorkItemAsync(new(isLia ? "lia" : "cs",
            isLia ? "Projeto LIA" : command.Track == "activation" ? "Acompanhamento de ativação" : "Acompanhamento de retenção",
            lead.Title, lead.CustomerId, customerName, owner, isLia ? "LIA" : $"Sucesso do Cliente · {trackLabel}",
            "P3", null, null, lead.AmountCents, journey.ToJsonString(), [], "commercial", lead.Id, isLia ? "Validacao" : null), actor, ct);
        if (customer is not null)
            await operations.UpdateCustomerAsync(new(customer.Id, null, null, clientId.Length == 0 ? null : clientId, null,
                FirstText(detail["seller"]?.ToString(), lead.Owner), isLia ? null : owner, null, lead.AmountCents, null, null, "Cliente", null,
                version.Length == 0 ? null : version, null, null, null, null, null, null, null, null, null, null, null, null, null, null), actor, ct);
        if (clientId.Length > 0) detail["clientId"] = clientId;
        if (version.Length > 0) detail["version"] = version;
        if (retentionContact)
        {
            var config = CommissionConfirmationService.Detail(funnels.FirstOrDefault(x => x.Name == detail["funnel"]?.ToString())?.Description ?? "{}");
            var stages = config["s"] as JsonArray ?? config["stages"] as JsonArray;
            foreach (var entry in stages ?? new JsonArray())
            {
                var name = entry is JsonArray row ? row[0]?.ToString() : entry?["name"]?.ToString();
                var won = entry is JsonArray values ? values.ElementAtOrDefault(2)?.ToString() : entry?["won"]?.ToString();
                if (!string.IsNullOrWhiteSpace(name) && (won is "true" or "1" || name.Contains("ganho", StringComparison.OrdinalIgnoreCase) || name.Contains("conclu", StringComparison.OrdinalIgnoreCase)))
                { detail["stage"] = name; break; }
            }
        }
        detail["onboarding"] = new JsonObject
        {
            ["status"] = scheduled ? "scheduled" : "sent", ["date"] = date, ["time"] = time,
            ["commitmentId"] = commitmentId, ["sentAt"] = now, ["clientId"] = clientId.Length == 0 ? null : clientId,
            ["version"] = version.Length == 0 ? null : version, ["commerciallyApproved"] = true
        };
        await operations.UpdateWorkItemAsync(new(lead.Id, lead.Title, lead.Owner, lead.AmountCents,
            detail.ToJsonString(), null, null, command.LeadVersion), actor, ct);
        return journeyId;
    }

    private static string FirstText(params string?[] values) => values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))?.Trim() ?? "";
}
