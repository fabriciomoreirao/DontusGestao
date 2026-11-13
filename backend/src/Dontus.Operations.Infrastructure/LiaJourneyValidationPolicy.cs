using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;
using static Dontus.Operations.Infrastructure.CommissionConfirmationService;

namespace Dontus.Operations.Infrastructure;

internal static class LiaJourneyValidationPolicy
{
    internal const string SharedQueue = "Fila compartilhada";
    internal static bool FromCommercial(JsonObject detail) => Text(detail, "sourceLeadId") != "" || Text(detail, "saleId") != "" || Text(detail, "sector").Equals("Comercial", StringComparison.OrdinalIgnoreCase);
    internal static bool Checked(JsonObject detail) => Text(detail, "validationConfirmedAt") != "" && Text(detail, "validationConfirmedBy") != "";

    internal static async Task<UpdateWorkItemCommand> PrepareUpdateAsync(OperationsDbContext db, WorkItem item, UpdateWorkItemCommand command, ActorContext actor, CancellationToken ct)
    {
        var old = Detail(item.Description);
        if (item.Module != "lia" || Text(old, "kind") != "liaJourney") return command;
        var next = Detail(command.Description ?? "{}");
        if (Text(next, "kind") != "liaJourney") throw new DomainException("Preserve os dados do acompanhamento LIA.", 403);
        var owns = item.Owner.Trim().Equals(actor.DisplayName.Trim(), StringComparison.OrdinalIgnoreCase);
        var confirming = !Checked(old) && Checked(next);
        var assigning = !string.IsNullOrWhiteSpace(command.Owner) && !item.Owner.Equals(command.Owner.Trim(), StringComparison.OrdinalIgnoreCase);
        var queue = item.Status == "Validacao" && !await db.Users.AnyAsync(user => user.Active && user.BlockedAt == null && user.DisplayName == item.Owner, ct);
        var coreChanged = command.Title.Trim() != item.Title || command.CustomerName is not null && command.CustomerName.Trim() != item.CustomerName || command.AmountCents != item.AmountCents
            || new[] { "clientId", "whatsapp", "sector", "requestType", "startDate", "products" }.Any(key => !JsonNode.DeepEquals(old[key], next[key]))
            || !confirming && Text(old, "liaPlan") != Text(next, "liaPlan");
        if (coreChanged && !owns) throw new DomainException("Somente o responsável atual pode editar os dados deste acompanhamento LIA.", 403);
        if (confirming)
        {
            if (item.Status != "Validacao" || !(owns || queue)) throw new DomainException("Confira os dados na etapa de validação.", 403);
            if (!await db.LiaFormRequests.AnyAsync(request => request.WorkItemId == item.Id, ct))
                throw new DomainException("Gere o link do formulário e envie ao cliente antes de conferir os dados.", 409);
            if (Text(next, "liaPlan").Trim() == "") throw new DomainException("Confira o plano LIA contratado.");
            next["validationConfirmedAt"] = DateTimeOffset.UtcNow.ToString("O");
            next["validationConfirmedBy"] = actor.DisplayName;
        }
        else
        {
            foreach (var key in new[] { "validationConfirmedAt", "validationConfirmedBy" })
            { next.Remove(key); if (old[key] is not null) next[key] = old[key]!.DeepClone(); }
        }
        if (assigning)
        {
            if (!owns && !queue) throw new DomainException("Somente o responsável atual pelo card pode alterar o responsável.", 403);
            if (item.Status == "Validacao" && (!Checked(old) || !await db.LiaFormRequests.AnyAsync(request => request.WorkItemId == item.Id, ct)))
                throw new DomainException("Confira os dados antes de direcionar para o responsável.", 409);
            if (!await db.Users.AnyAsync(user => user.Active && user.BlockedAt == null && user.DisplayName == command.Owner!.Trim(), ct))
                throw new DomainException("Selecione um colaborador ativo para assumir o acompanhamento LIA.");
        }
        return command with { Description = next.ToJsonString() };
    }
}
