using System.Text.Json;
using System.Text.RegularExpressions;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Infrastructure;

public sealed partial class SuggestionService(OperationsDbContext db) : ISuggestionService
{
    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        if (!await db.SuggestionPriorities.AnyAsync(cancellationToken))
        {
            db.SuggestionPriorities.AddRange(
                new SuggestionPriority { Name = "Baixa", Color = "#64748b", DisplayOrder = 10 },
                new SuggestionPriority { Name = "Média", Color = "#eab308", DisplayOrder = 20 },
                new SuggestionPriority { Name = "Alta", Color = "#f97316", DisplayOrder = 30 },
                new SuggestionPriority { Name = "Crítica", Color = "#dc2626", DisplayOrder = 40 });
        }

        if (!await db.SuggestionStatuses.AnyAsync(cancellationToken))
        {
            db.SuggestionStatuses.AddRange(
                new SuggestionStatus { Name = "Recebida", KanbanColumn = "Recebidas", Color = "#2563eb", DisplayOrder = 10, IsInitial = true },
                new SuggestionStatus { Name = "Em análise", KanbanColumn = "Em análise", Color = "#7c3aed", DisplayOrder = 20 },
                new SuggestionStatus { Name = "Aprovada", KanbanColumn = "Aprovadas", Color = "#0891b2", DisplayOrder = 30 },
                new SuggestionStatus { Name = "Em desenvolvimento", KanbanColumn = "Em desenvolvimento", Color = "#ea580c", DisplayOrder = 40 },
                new SuggestionStatus { Name = "Concluída", KanbanColumn = "Concluídas", Color = "#16a34a", DisplayOrder = 50 },
                new SuggestionStatus { Name = "Reprovada", KanbanColumn = "Reprovadas", Color = "#dc2626", DisplayOrder = 60 });
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<SuggestionModuleDto> GetModuleAsync(ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("suggestions", "view");
        var actorUser = await GetActorUserAsync(actor, cancellationToken);
        var canManage = actor.HasPermission("admin", "manage");
        var allPriorities = await db.SuggestionPriorities.AsNoTracking()
            .OrderBy(entry => entry.DisplayOrder).ThenBy(entry => entry.Name)
            .ToListAsync(cancellationToken);
        var allStatuses = await db.SuggestionStatuses.AsNoTracking()
            .OrderBy(entry => entry.DisplayOrder).ThenBy(entry => entry.Name)
            .ToListAsync(cancellationToken);
        var priorities = allPriorities.Where(entry => canManage || entry.Active).ToArray();
        var statuses = allStatuses.Where(entry => canManage || entry.Active).ToArray();
        var suggestions = await db.Suggestions.AsNoTracking()
            .OrderByDescending(entry => entry.UpdatedAt)
            .Take(2000)
            .ToListAsync(cancellationToken);
        var suggestionIds = suggestions.Select(entry => entry.Id).ToArray();
        var comments = await db.SuggestionComments.AsNoTracking()
            .Where(entry => suggestionIds.Contains(entry.SuggestionId))
            .OrderBy(entry => entry.CreatedAt)
            .ToListAsync(cancellationToken);
        var users = await db.Users.AsNoTracking().ToDictionaryAsync(entry => entry.Id, cancellationToken);
        var customers = await db.Customers.AsNoTracking().ToDictionaryAsync(entry => entry.Id, cancellationToken);
        var priorityLookup = allPriorities.ToDictionary(entry => entry.Id);
        var statusLookup = allStatuses.ToDictionary(entry => entry.Id);

        return new SuggestionModuleDto(
            priorities.Select(ToDto).ToArray(),
            statuses.Select(ToDto).ToArray(),
            suggestions.Select(suggestion =>
            {
                var responsible = users.GetValueOrDefault(suggestion.ResponsibleUserId);
                var priority = priorityLookup.GetValueOrDefault(suggestion.PriorityId);
                var status = statusLookup.GetValueOrDefault(suggestion.StatusId);
                return new SuggestionDto(
                    suggestion.Id, suggestion.Number, suggestion.Protocol, suggestion.Name, suggestion.Description,
                    suggestion.CustomerId,
                    suggestion.CustomerId.HasValue ? customers.GetValueOrDefault(suggestion.CustomerId.Value)?.TradeName ?? "Cliente removido" : "Não informado",
                    suggestion.ResponsibleUserId, responsible?.DisplayName ?? "Colaborador removido", responsible?.Email ?? "",
                    responsible?.PhotoDataUrl ?? "", responsible?.IsCoordinator ?? false, suggestion.PriorityId, priority?.Name ?? "Prioridade removida",
                    priority?.Color ?? "#64748b", suggestion.StatusId, status?.Name ?? "Status removido",
                    status?.Color ?? "#64748b", status?.KanbanColumn ?? "Sem coluna",
                    suggestion.StrategicClient, suggestion.CancellationRisk, suggestion.CreatedBy,
                    suggestion.CreatedAt, suggestion.UpdatedAt, suggestion.Version,
                    comments.Where(entry => entry.SuggestionId == suggestion.Id).Select(comment =>
                    {
                        var author = users.GetValueOrDefault(comment.AuthorUserId);
                        return new SuggestionCommentDto(comment.Id, comment.SuggestionId, comment.AuthorUserId,
                            author?.DisplayName ?? "Colaborador removido", author?.PhotoDataUrl ?? "", author?.IsCoordinator ?? false,
                            comment.Body, comment.CreatedAt);
                    }).ToArray());
            }).ToArray(),
            new SuggestionCurrentUserDto(actorUser.Id, actorUser.DisplayName, actorUser.Email, actorUser.PhotoDataUrl, actorUser.IsCoordinator),
            canManage);
    }

    public async Task<Guid> SavePriorityAsync(SaveSuggestionPriorityCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        RequireManagement(actor);
        var name = RequiredName(command.Name, "prioridade");
        var priority = command.Id.HasValue
            ? await db.SuggestionPriorities.SingleOrDefaultAsync(entry => entry.Id == command.Id.Value, cancellationToken)
                ?? throw new DomainException("Prioridade da sugestão não encontrada.", 404)
            : new SuggestionPriority { Name = name };
        if (await db.SuggestionPriorities.AnyAsync(entry => entry.Id != priority.Id && entry.Name == name, cancellationToken))
            throw new DomainException("Já existe uma prioridade com este nome.", 409);
        priority.Name = name;
        priority.Description = NormalizeDescription(command.Description);
        priority.Color = NormalizeColor(command.Color);
        priority.DisplayOrder = NormalizeOrder(command.DisplayOrder);
        priority.Active = command.Active;
        priority.UpdatedAt = DateTimeOffset.UtcNow;
        if (!command.Id.HasValue) db.SuggestionPriorities.Add(priority);
        AddAudit(actor, command.Id.HasValue ? "Update" : "Create", "suggestion_priority", priority.Id, new { priority.Name, priority.DisplayOrder });
        await db.SaveChangesAsync(cancellationToken);
        return priority.Id;
    }

    public async Task<Guid> SaveStatusAsync(SaveSuggestionStatusCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        RequireManagement(actor);
        var name = RequiredName(command.Name, "status");
        var kanbanColumn = string.IsNullOrWhiteSpace(command.KanbanColumn) ? name : RequiredName(command.KanbanColumn, "coluna do Kanban");
        var status = command.Id.HasValue
            ? await db.SuggestionStatuses.SingleOrDefaultAsync(entry => entry.Id == command.Id.Value, cancellationToken)
                ?? throw new DomainException("Status da sugestão não encontrado.", 404)
            : new SuggestionStatus { Name = name, KanbanColumn = kanbanColumn };
        if (await db.SuggestionStatuses.AnyAsync(entry => entry.Id != status.Id && entry.Name == name, cancellationToken))
            throw new DomainException("Já existe um status com este nome.", 409);

        status.Name = name;
        status.Description = NormalizeDescription(command.Description);
        status.KanbanColumn = kanbanColumn;
        status.Color = NormalizeColor(command.Color);
        status.DisplayOrder = NormalizeOrder(command.DisplayOrder);
        status.Active = command.Active;
        status.IsInitial = command.IsInitial && command.Active;
        status.UpdatedAt = DateTimeOffset.UtcNow;
        if (!command.Id.HasValue) db.SuggestionStatuses.Add(status);

        if (status.IsInitial)
        {
            var otherInitials = await db.SuggestionStatuses.Where(entry => entry.Id != status.Id && entry.IsInitial).ToListAsync(cancellationToken);
            foreach (var entry in otherInitials) entry.IsInitial = false;
        }
        else if (status.Active && !await db.SuggestionStatuses.AnyAsync(entry => entry.Id != status.Id && entry.Active && entry.IsInitial, cancellationToken))
        {
            status.IsInitial = true;
        }
        else if (!status.Active && !await db.SuggestionStatuses.AnyAsync(entry => entry.Id != status.Id && entry.Active && entry.IsInitial, cancellationToken))
        {
            var nextInitial = await db.SuggestionStatuses.Where(entry => entry.Id != status.Id && entry.Active)
                .OrderBy(entry => entry.DisplayOrder).FirstOrDefaultAsync(cancellationToken);
            if (nextInitial is not null) nextInitial.IsInitial = true;
        }

        AddAudit(actor, command.Id.HasValue ? "Update" : "Create", "suggestion_status", status.Id,
            new { status.Name, status.KanbanColumn, status.DisplayOrder, status.IsInitial });
        await db.SaveChangesAsync(cancellationToken);
        return status.Id;
    }

    public async Task DeletePriorityAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default)
    {
        RequireManagement(actor);
        var priority = await db.SuggestionPriorities.SingleOrDefaultAsync(entry => entry.Id == id, cancellationToken)
            ?? throw new DomainException("Prioridade da sugestão não encontrada.", 404);
        if (await db.Suggestions.AnyAsync(entry => entry.PriorityId == id, cancellationToken))
            throw new DomainException("Não é possível excluir uma prioridade já utilizada. Edite ou desative o cadastro.", 409);
        db.SuggestionPriorities.Remove(priority);
        AddAudit(actor, "Delete", "suggestion_priority", id, new { priority.Name });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task DeleteStatusAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default)
    {
        RequireManagement(actor);
        var status = await db.SuggestionStatuses.SingleOrDefaultAsync(entry => entry.Id == id, cancellationToken)
            ?? throw new DomainException("Status da sugestão não encontrado.", 404);
        if (await db.Suggestions.AnyAsync(entry => entry.StatusId == id, cancellationToken))
            throw new DomainException("Não é possível excluir um status já utilizado. Edite ou desative o cadastro.", 409);
        if (status.IsInitial)
        {
            var nextInitial = await db.SuggestionStatuses.Where(entry => entry.Id != id && entry.Active)
                .OrderBy(entry => entry.DisplayOrder).FirstOrDefaultAsync(cancellationToken);
            if (nextInitial is not null) nextInitial.IsInitial = true;
        }
        db.SuggestionStatuses.Remove(status);
        AddAudit(actor, "Delete", "suggestion_status", id, new { status.Name });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<CreateSuggestionResult> CreateSuggestionAsync(CreateSuggestionCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("suggestions", "create");
        var name = RequiredName(command.Name, "nome da sugestão", 240);
        if ((command.Description?.Trim().Length ?? 0) > 6000)
            throw new DomainException("A descrição deve ter no máximo 6.000 caracteres.");
        var actorUser = await GetActorUserAsync(actor, cancellationToken);
        var priority = await db.SuggestionPriorities.SingleOrDefaultAsync(entry => entry.Id == command.PriorityId && entry.Active, cancellationToken)
            ?? throw new DomainException("Selecione uma prioridade ativa.");
        var initialStatus = await db.SuggestionStatuses.Where(entry => entry.Active)
            .OrderByDescending(entry => entry.IsInitial).ThenBy(entry => entry.DisplayOrder)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new DomainException("Cadastre ao menos um status ativo para receber a sugestão.");
        if (command.CustomerId.HasValue && !await db.Customers.AnyAsync(entry => entry.Id == command.CustomerId.Value, cancellationToken))
            throw new DomainException("Cliente não encontrado.", 404);

        var suggestion = new Suggestion
        {
            Protocol = $"TMP{Guid.NewGuid():N}"[..15],
            Name = name,
            Description = command.Description?.Trim() ?? "",
            CustomerId = command.CustomerId,
            ResponsibleUserId = actorUser.Id,
            PriorityId = priority.Id,
            StatusId = initialStatus.Id,
            StrategicClient = command.StrategicClient,
            CancellationRisk = command.CancellationRisk,
            CreatedBy = actor.Email,
        };
        if (!db.Database.IsRelational())
            suggestion.Number = (await db.Suggestions.Select(entry => (long?)entry.Number).MaxAsync(cancellationToken) ?? 0) + 1;
        db.Suggestions.Add(suggestion);
        await db.SaveChangesAsync(cancellationToken);
        suggestion.Protocol = $"S{DateTimeOffset.UtcNow:yy}{suggestion.Number:0000}";
        suggestion.UpdatedAt = DateTimeOffset.UtcNow;
        AddAudit(actor, "Create", "suggestion", suggestion.Id, new { suggestion.Protocol, suggestion.Name, Priority = priority.Name, Status = initialStatus.Name });
        await db.SaveChangesAsync(cancellationToken);
        return new CreateSuggestionResult(suggestion.Id, suggestion.Protocol);
    }

    public async Task ChangeStatusAsync(ChangeSuggestionStatusCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("suggestions", "edit");
        var suggestion = await db.Suggestions.SingleOrDefaultAsync(entry => entry.Id == command.Id, cancellationToken)
            ?? throw new DomainException("Sugestão não encontrada.", 404);
        if (suggestion.Version != command.Version)
            throw new DomainException("A sugestão foi atualizada por outra pessoa. Recarregue e tente novamente.", 409);
        var status = await db.SuggestionStatuses.SingleOrDefaultAsync(entry => entry.Id == command.StatusId && entry.Active, cancellationToken)
            ?? throw new DomainException("Selecione um status ativo.");
        var previousStatusId = suggestion.StatusId;
        suggestion.StatusId = status.Id;
        suggestion.Version++;
        suggestion.UpdatedAt = DateTimeOffset.UtcNow;
        AddAudit(actor, "StatusChange", "suggestion", suggestion.Id, new { From = previousStatusId, To = status.Id, status.Name });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<Guid> AddCommentAsync(AddSuggestionCommentCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("suggestions", "view");
        var body = command.Body?.Trim() ?? "";
        if (body.Length is < 1 or > 3000)
            throw new DomainException("O comentário deve ter entre 1 e 3.000 caracteres.");
        if (!await db.Suggestions.AnyAsync(entry => entry.Id == command.SuggestionId, cancellationToken))
            throw new DomainException("Sugestão não encontrada.", 404);
        var actorUser = await GetActorUserAsync(actor, cancellationToken);
        var comment = new SuggestionComment { SuggestionId = command.SuggestionId, AuthorUserId = actorUser.Id, Body = body };
        db.SuggestionComments.Add(comment);
        AddAudit(actor, "Comment", "suggestion", command.SuggestionId, new { CommentId = comment.Id });
        await db.SaveChangesAsync(cancellationToken);
        return comment.Id;
    }

    public async Task DeleteSuggestionAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("suggestions", "edit");
        var suggestion = await db.Suggestions.SingleOrDefaultAsync(entry => entry.Id == id, cancellationToken)
            ?? throw new DomainException("Sugestão não encontrada.", 404);
        var actorUser = await GetActorUserAsync(actor, cancellationToken);
        if (suggestion.ResponsibleUserId != actorUser.Id && !actor.HasPermission("admin", "manage"))
            throw new DomainException("Apenas o responsável ou a coordenação pode excluir esta sugestão.", 403);
        db.SuggestionComments.RemoveRange(db.SuggestionComments.Where(entry => entry.SuggestionId == id));
        db.Suggestions.Remove(suggestion);
        AddAudit(actor, "Delete", "suggestion", id, new { suggestion.Protocol, suggestion.Name });
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task<AppUser> GetActorUserAsync(ActorContext actor, CancellationToken cancellationToken) =>
        await db.Users.SingleOrDefaultAsync(entry => entry.Email == actor.Email, cancellationToken)
        ?? throw new DomainException("O colaborador autenticado não foi encontrado.", 404);

    private static SuggestionPriorityDto ToDto(SuggestionPriority entry) =>
        new(entry.Id, entry.Name, entry.Description, entry.Color, entry.DisplayOrder, entry.Active);

    private static SuggestionStatusDto ToDto(SuggestionStatus entry) =>
        new(entry.Id, entry.Name, entry.Description, entry.KanbanColumn, entry.Color, entry.DisplayOrder, entry.IsInitial, entry.Active);

    private static void RequireManagement(ActorContext actor) => actor.RequirePermission("admin", "manage");

    private static string RequiredName(string? value, string field, int maxLength = 100)
    {
        var normalized = value?.Trim() ?? "";
        if (normalized.Length is < 2 || normalized.Length > 240 || normalized.Length > maxLength)
            throw new DomainException($"Informe {field} com entre 2 e {maxLength} caracteres.");
        return normalized;
    }

    private static int NormalizeOrder(int value) => value is >= 0 and <= 999 ? value : 0;

    private static string NormalizeColor(string? value)
    {
        var normalized = value?.Trim() ?? "";
        return ColorPattern().IsMatch(normalized) ? normalized.ToLowerInvariant() : "#2563eb";
    }

    private static string NormalizeDescription(string? value)
    {
        var description = value?.Trim() ?? "";
        if (description.Length > 600) throw new DomainException("A descrição deve ter no máximo 600 caracteres.");
        return description;
    }

    private void AddAudit(ActorContext actor, string action, string resource, Guid id, object details) =>
        db.AuditEvents.Add(new AuditEvent
        {
            ActorEmail = actor.Email,
            Action = action,
            Resource = resource,
            ResourceId = id.ToString(),
            Module = "suggestions",
            DetailsJson = JsonSerializer.Serialize(details),
        });

    [GeneratedRegex("^#[0-9a-fA-F]{6}$")]
    private static partial Regex ColorPattern();
}
