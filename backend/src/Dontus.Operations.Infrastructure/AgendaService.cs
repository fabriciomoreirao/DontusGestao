using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Infrastructure;

public sealed class AgendaService(OperationsDbContext db) : IAgendaService
{
    public async Task<AgendaModuleDto> GetModuleAsync(ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("work", "view");
        var actorUser = await GetActorUserAsync(actor, cancellationToken);
        var canManage = CanManage(actor);
        var memberDepartmentIds = await db.UserDepartments.AsNoTracking()
            .Where(link => link.UserId == actorUser.Id)
            .Select(link => link.DepartmentId)
            .ToArrayAsync(cancellationToken);

        var calendarsQuery = db.AgendaCalendars.AsNoTracking();
        if (!canManage) calendarsQuery = calendarsQuery.Where(calendar => calendar.Active && memberDepartmentIds.Contains(calendar.DepartmentId));
        var calendars = await calendarsQuery.OrderBy(calendar => calendar.Name).ToListAsync(cancellationToken);
        var calendarIds = calendars.Select(calendar => calendar.Id).ToArray();
        // A agenda utiliza a mesma base de setores do RH. Assim, setores criados ou
        // inativados no RH passam a refletir imediatamente nos formulários da agenda.
        var departmentEntries = await db.TaskDepartments.AsNoTracking()
            .Select(department => new { department.Id, department.Name, department.Active })
            .ToListAsync(cancellationToken);
        var departments = departmentEntries.ToDictionary(department => department.Id, department => department.Name);
        var types = await db.AgendaTypes.AsNoTracking()
            .Where(type => canManage || type.Active)
            .OrderBy(type => type.Name)
            .ToListAsync(cancellationToken);
        var statuses = await db.AgendaStatuses.AsNoTracking()
            .Where(status => canManage || status.Active)
            .OrderBy(status => status.Name)
            .ToListAsync(cancellationToken);
        var visibleDepartmentIds = calendars.Select(calendar => calendar.DepartmentId).Distinct().ToArray();
        var userDepartments = await db.UserDepartments.AsNoTracking()
            .Where(link => visibleDepartmentIds.Contains(link.DepartmentId))
            .ToListAsync(cancellationToken);
        var users = await db.Users.AsNoTracking().Where(user => user.Active).ToDictionaryAsync(user => user.Id, cancellationToken);
        var collaborators = userDepartments
            .Where(link => users.ContainsKey(link.UserId))
            .Select(link => new AgendaCollaboratorDto(link.UserId, users[link.UserId].DisplayName, users[link.UserId].Email,
                link.DepartmentId, departments.GetValueOrDefault(link.DepartmentId, "Setor não encontrado"),
                users[link.UserId].BirthDate, users[link.UserId].StartedAt))
            .DistinctBy(collaborator => new { collaborator.Id, collaborator.DepartmentId })
            .OrderBy(collaborator => collaborator.Name)
            .ToArray();

        var commitments = await db.AgendaCommitments.AsNoTracking()
            .Where(commitment => calendarIds.Contains(commitment.AgendaId))
            .OrderBy(commitment => commitment.StartsAt)
            .Take(1500)
            .ToListAsync(cancellationToken);
        var commitmentIds = commitments.Select(commitment => commitment.Id).ToArray();
        var participants = await db.AgendaCommitmentParticipants.AsNoTracking()
            .Where(participant => commitmentIds.Contains(participant.CommitmentId))
            .ToListAsync(cancellationToken);
        var typeNames = types.ToDictionary(type => type.Id);
        var statusNames = statuses.ToDictionary(status => status.Id);

        return new AgendaModuleDto(
            calendars.Select(calendar => new AgendaCalendarDto(calendar.Id, calendar.Name, calendar.Description, calendar.DepartmentId,
                departments.GetValueOrDefault(calendar.DepartmentId, "Setor não encontrado"), calendar.Active)).ToArray(),
            departmentEntries
                .Where(department => department.Active && (canManage || visibleDepartmentIds.Contains(department.Id)))
                .OrderBy(department => department.Name)
                .Select(department => new AgendaDepartmentDto(department.Id, department.Name, department.Active)).ToArray(),
            types.Select(type => new AgendaTypeDto(type.Id, type.Name, type.Description, type.Color, type.Active)).ToArray(),
            statuses.Select(status => new AgendaStatusDto(status.Id, status.Name, status.Description, status.Color, status.Active)).ToArray(),
            collaborators,
            users.Values.OrderBy(user => user.DisplayName)
                .Select(user => new AgendaCelebrantDto(user.Id, user.DisplayName, user.BirthDate, user.StartedAt)).ToArray(),
            commitments.Select(commitment =>
            {
                var type = typeNames.GetValueOrDefault(commitment.AgendaTypeId);
                var status = statusNames.GetValueOrDefault(commitment.AgendaStatusId);
                return new AgendaCommitmentDto(
                    commitment.Id, commitment.AgendaId, commitment.AgendaTypeId, commitment.Title, commitment.Description,
                    commitment.StartsAt, commitment.EndsAt, commitment.ResponsibleUserId,
                    users.GetValueOrDefault(commitment.ResponsibleUserId)?.DisplayName ?? "Responsável removido",
                    type?.Name ?? "Tipo removido", commitment.AgendaStatusId, status?.Name ?? "Status removido", status?.Color ?? "#64748b",
                    commitment.CreatedBy,
                    participants.Where(participant => participant.CommitmentId == commitment.Id).Select(participant => participant.UserId).ToArray());
            }).ToArray(),
            canManage);
    }

    public async Task<Guid> SaveCalendarAsync(SaveAgendaCalendarCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        RequireManagement(actor);
        var name = RequiredName(command.Name, "agenda");
        var department = await db.TaskDepartments.SingleOrDefaultAsync(department => department.Id == command.DepartmentId && department.Active, cancellationToken)
            ?? throw new DomainException("Selecione um setor ativo.");
        var calendar = command.Id.HasValue
            ? await db.AgendaCalendars.SingleOrDefaultAsync(entry => entry.Id == command.Id.Value, cancellationToken)
                ?? throw new DomainException("Agenda não encontrada.", 404)
            : new AgendaCalendar { Name = name, DepartmentId = department.Id };
        if (await db.AgendaCalendars.AnyAsync(entry => entry.Id != calendar.Id && entry.DepartmentId == department.Id && entry.Name == name, cancellationToken))
            throw new DomainException("Já existe uma agenda com este nome neste setor.", 409);
        calendar.Name = name;
        calendar.Description = NormalizeDescription(command.Description);
        calendar.DepartmentId = department.Id;
        calendar.Active = command.Active;
        calendar.UpdatedAt = DateTimeOffset.UtcNow;
        if (!command.Id.HasValue) db.AgendaCalendars.Add(calendar);
        AddAudit(actor, command.Id.HasValue ? "Update" : "Create", "agenda_calendar", calendar.Id.ToString(), new { calendar.Name, Department = department.Name });
        await db.SaveChangesAsync(cancellationToken);
        return calendar.Id;
    }

    public async Task<Guid> SaveTypeAsync(SaveAgendaTypeCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        RequireManagement(actor);
        var name = RequiredName(command.Name, "tipo de agendamento");
        var type = command.Id.HasValue
            ? await db.AgendaTypes.SingleOrDefaultAsync(entry => entry.Id == command.Id.Value, cancellationToken)
                ?? throw new DomainException("Tipo de agendamento não encontrado.", 404)
            : new AgendaType { Name = name };
        if (await db.AgendaTypes.AnyAsync(entry => entry.Id != type.Id && entry.Name == name, cancellationToken))
            throw new DomainException("Já existe um tipo de agendamento com este nome.", 409);
        type.Name = name;
        type.Description = NormalizeDescription(command.Description);
        type.Color = NormalizeColor(command.Color);
        type.Active = command.Active;
        type.UpdatedAt = DateTimeOffset.UtcNow;
        if (!command.Id.HasValue) db.AgendaTypes.Add(type);
        AddAudit(actor, command.Id.HasValue ? "Update" : "Create", "agenda_type", type.Id.ToString(), new { type.Name, type.Color });
        await db.SaveChangesAsync(cancellationToken);
        return type.Id;
    }

    public async Task<Guid> SaveStatusAsync(SaveAgendaStatusCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        RequireManagement(actor);
        var name = RequiredName(command.Name, "status de agendamento");
        var status = command.Id.HasValue
            ? await db.AgendaStatuses.SingleOrDefaultAsync(entry => entry.Id == command.Id.Value, cancellationToken)
                ?? throw new DomainException("Status de agendamento não encontrado.", 404)
            : new AgendaStatus { Name = name };
        if (await db.AgendaStatuses.AnyAsync(entry => entry.Id != status.Id && entry.Name == name, cancellationToken))
            throw new DomainException("Já existe um status de agendamento com este nome.", 409);
        status.Name = name;
        status.Description = NormalizeDescription(command.Description);
        status.Color = NormalizeColor(command.Color);
        status.Active = command.Active;
        status.UpdatedAt = DateTimeOffset.UtcNow;
        if (!command.Id.HasValue) db.AgendaStatuses.Add(status);
        AddAudit(actor, command.Id.HasValue ? "Update" : "Create", "agenda_status", status.Id.ToString(), new { status.Name, status.Color });
        await db.SaveChangesAsync(cancellationToken);
        return status.Id;
    }

    public async Task DeleteCalendarAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default)
    {
        RequireManagement(actor);
        var calendar = await db.AgendaCalendars.SingleOrDefaultAsync(entry => entry.Id == id, cancellationToken)
            ?? throw new DomainException("Agenda não encontrada.", 404);
        db.AgendaCalendars.Remove(calendar);
        AddAudit(actor, "Delete", "agenda_calendar", id.ToString(), new { calendar.Name });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task DeleteTypeAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default)
    {
        RequireManagement(actor);
        var type = await db.AgendaTypes.SingleOrDefaultAsync(entry => entry.Id == id, cancellationToken)
            ?? throw new DomainException("Tipo de agendamento não encontrado.", 404);
        if (await db.AgendaCommitments.AnyAsync(entry => entry.AgendaTypeId == id, cancellationToken))
            throw new DomainException("Não é possível excluir um tipo já utilizado em compromissos.", 409);
        db.AgendaTypes.Remove(type);
        AddAudit(actor, "Delete", "agenda_type", id.ToString(), new { type.Name });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task DeleteStatusAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default)
    {
        RequireManagement(actor);
        var status = await db.AgendaStatuses.SingleOrDefaultAsync(entry => entry.Id == id, cancellationToken)
            ?? throw new DomainException("Status de agendamento não encontrado.", 404);
        if (await db.AgendaCommitments.AnyAsync(entry => entry.AgendaStatusId == id, cancellationToken))
            throw new DomainException("Não é possível excluir um status já utilizado em compromissos.", 409);
        db.AgendaStatuses.Remove(status);
        AddAudit(actor, "Delete", "agenda_status", id.ToString(), new { status.Name });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyCollection<Guid>> CreateCommitmentAsync(CreateAgendaCommitmentCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("work", "create");
        if (string.IsNullOrWhiteSpace(command.Title) || command.Title.Trim().Length > 240)
            throw new DomainException("Informe um título de até 240 caracteres.");
        if (command.EndsAt <= command.StartsAt)
            throw new DomainException("A hora final deve ser posterior à hora inicial.");
        var calendar = await db.AgendaCalendars.SingleOrDefaultAsync(entry => entry.Id == command.AgendaId && entry.Active, cancellationToken)
            ?? throw new DomainException("Selecione uma agenda ativa.");
        var type = await db.AgendaTypes.SingleOrDefaultAsync(entry => entry.Id == command.AgendaTypeId && entry.Active, cancellationToken)
            ?? throw new DomainException("Selecione um tipo de agendamento ativo.");
        var status = await db.AgendaStatuses.SingleOrDefaultAsync(entry => entry.Id == command.AgendaStatusId && entry.Active, cancellationToken)
            ?? throw new DomainException("Selecione um status de agendamento ativo.");
        var actorUser = await GetActorUserAsync(actor, cancellationToken);
        var allowedDepartments = await db.UserDepartments.AsNoTracking().Where(link => link.UserId == actorUser.Id)
            .Select(link => link.DepartmentId).ToArrayAsync(cancellationToken);
        if (!CanManage(actor) && !allowedDepartments.Contains(calendar.DepartmentId))
            throw new DomainException("Você só pode incluir compromissos na agenda do seu setor.", 403);

        var participantIds = (command.ParticipantUserIds ?? []).Append(command.ResponsibleUserId).Distinct().ToArray();
        var validParticipantIds = await db.UserDepartments.AsNoTracking()
            .Where(link => link.DepartmentId == calendar.DepartmentId && participantIds.Contains(link.UserId))
            .Select(link => link.UserId).Distinct().ToArrayAsync(cancellationToken);
        if (validParticipantIds.Length != participantIds.Length)
            throw new DomainException("Responsável e colaboradores devem pertencer ao setor da agenda.");

        var createdIds = new List<Guid>();
        foreach (var startsAt in RecurringStarts(command.StartsAt, command.Recurrence))
        {
            var endsAt = startsAt.Add(command.EndsAt - command.StartsAt);
            var conflict = await db.AgendaCommitments.AnyAsync(entry => entry.ResponsibleUserId == command.ResponsibleUserId && entry.StartsAt < endsAt && entry.EndsAt > startsAt, cancellationToken);
            if (conflict) throw new DomainException("O responsável já possui um compromisso neste horário.", 409);
            var commitment = new AgendaCommitment
            {
                AgendaId = calendar.Id,
                AgendaTypeId = type.Id,
                AgendaStatusId = status.Id,
                ResponsibleUserId = command.ResponsibleUserId,
                Title = command.Title.Trim(),
                Description = command.Description?.Trim() ?? "",
                StartsAt = startsAt,
                EndsAt = endsAt,
                CreatedBy = actor.Email,
            };
            db.AgendaCommitments.Add(commitment);
            db.AgendaCommitmentParticipants.AddRange(validParticipantIds.Select(userId => new AgendaCommitmentParticipant { CommitmentId = commitment.Id, UserId = userId }));
            AddAudit(actor, "Create", "agenda_commitment", commitment.Id.ToString(), new { commitment.Title, commitment.StartsAt, Agenda = calendar.Name, Type = type.Name, Status = status.Name });
            createdIds.Add(commitment.Id);
        }
        await db.SaveChangesAsync(cancellationToken);
        return createdIds;
    }

    public async Task UpdateCommitmentAsync(UpdateAgendaCommitmentCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        var commitment = await db.AgendaCommitments.SingleOrDefaultAsync(entry => entry.Id == command.Id, cancellationToken)
            ?? throw new DomainException("Compromisso não encontrado.", 404);
        if (!string.Equals(commitment.CreatedBy, actor.Email, StringComparison.OrdinalIgnoreCase))
            throw new DomainException("Apenas quem criou o compromisso pode editá-lo.", 403);
        if (string.IsNullOrWhiteSpace(command.Title) || command.Title.Trim().Length > 240 || command.EndsAt <= command.StartsAt)
            throw new DomainException("Informe título, início e término válidos.");
        var calendar = await db.AgendaCalendars.SingleOrDefaultAsync(entry => entry.Id == command.AgendaId && entry.Active, cancellationToken)
            ?? throw new DomainException("Selecione uma agenda ativa.");
        var type = await db.AgendaTypes.SingleOrDefaultAsync(entry => entry.Id == command.AgendaTypeId && entry.Active, cancellationToken)
            ?? throw new DomainException("Selecione um tipo ativo.");
        var status = await db.AgendaStatuses.SingleOrDefaultAsync(entry => entry.Id == command.AgendaStatusId && entry.Active, cancellationToken)
            ?? throw new DomainException("Selecione um status ativo.");
        var actorUser = await GetActorUserAsync(actor, cancellationToken);
        var actorDepartments = await db.UserDepartments.AsNoTracking().Where(link => link.UserId == actorUser.Id).Select(link => link.DepartmentId).ToArrayAsync(cancellationToken);
        if (!CanManage(actor) && !actorDepartments.Contains(calendar.DepartmentId))
            throw new DomainException("Você só pode editar compromissos da agenda do seu setor.", 403);
        var participantIds = (command.ParticipantUserIds ?? []).Append(command.ResponsibleUserId).Distinct().ToArray();
        var validParticipantIds = await db.UserDepartments.AsNoTracking()
            .Where(link => link.DepartmentId == calendar.DepartmentId && participantIds.Contains(link.UserId))
            .Select(link => link.UserId).Distinct().ToArrayAsync(cancellationToken);
        if (participantIds.Length != validParticipantIds.Length)
            throw new DomainException("Responsável e colaboradores devem pertencer ao setor da agenda.");
        var conflict = await db.AgendaCommitments.AnyAsync(entry => entry.Id != commitment.Id && entry.ResponsibleUserId == command.ResponsibleUserId && entry.StartsAt < command.EndsAt && entry.EndsAt > command.StartsAt, cancellationToken);
        if (conflict) throw new DomainException("O responsável já possui um compromisso neste horário.", 409);

        commitment.AgendaId = calendar.Id;
        commitment.AgendaTypeId = type.Id;
        commitment.AgendaStatusId = status.Id;
        commitment.ResponsibleUserId = command.ResponsibleUserId;
        commitment.Title = command.Title.Trim();
        commitment.Description = command.Description?.Trim() ?? "";
        commitment.StartsAt = command.StartsAt;
        commitment.EndsAt = command.EndsAt;
        commitment.UpdatedAt = DateTimeOffset.UtcNow;
        db.AgendaCommitmentParticipants.RemoveRange(db.AgendaCommitmentParticipants.Where(entry => entry.CommitmentId == commitment.Id));
        db.AgendaCommitmentParticipants.AddRange(validParticipantIds.Select(userId => new AgendaCommitmentParticipant { CommitmentId = commitment.Id, UserId = userId }));
        AddAudit(actor, "Update", "agenda_commitment", commitment.Id.ToString(), new { commitment.Title, Status = status.Name });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task ChangeCommitmentStatusAsync(ChangeAgendaCommitmentStatusCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        var commitment = await db.AgendaCommitments.SingleOrDefaultAsync(entry => entry.Id == command.Id, cancellationToken)
            ?? throw new DomainException("Compromisso não encontrado.", 404);
        var actorUser = await GetActorUserAsync(actor, cancellationToken);
        if (!string.Equals(commitment.CreatedBy, actor.Email, StringComparison.OrdinalIgnoreCase) && commitment.ResponsibleUserId != actorUser.Id)
            throw new DomainException("Apenas o criador ou responsável pelo compromisso pode alterar o status.", 403);
        var status = await db.AgendaStatuses.SingleOrDefaultAsync(entry => entry.Id == command.AgendaStatusId && entry.Active, cancellationToken)
            ?? throw new DomainException("Selecione um status ativo.");

        commitment.AgendaStatusId = status.Id;
        commitment.UpdatedAt = DateTimeOffset.UtcNow;
        AddAudit(actor, "UpdateStatus", "agenda_commitment", commitment.Id.ToString(), new { commitment.Title, Status = status.Name });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task DeleteCommitmentAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default)
    {
        var commitment = await db.AgendaCommitments.SingleOrDefaultAsync(entry => entry.Id == id, cancellationToken)
            ?? throw new DomainException("Compromisso não encontrado.", 404);
        var actorUser = await GetActorUserAsync(actor, cancellationToken);
        if (!string.Equals(commitment.CreatedBy, actor.Email, StringComparison.OrdinalIgnoreCase) && commitment.ResponsibleUserId != actorUser.Id && !CanManage(actor))
            throw new DomainException("Apenas o criador, responsável ou coordenador pode excluir o compromisso.", 403);
        db.AgendaCommitmentParticipants.RemoveRange(db.AgendaCommitmentParticipants.Where(entry => entry.CommitmentId == id));
        db.AgendaCommitments.Remove(commitment);
        AddAudit(actor, "Delete", "agenda_commitment", id.ToString(), new { commitment.Title });
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task<AppUser> GetActorUserAsync(ActorContext actor, CancellationToken cancellationToken) =>
        await db.Users.SingleOrDefaultAsync(user => user.Email == actor.Email, cancellationToken)
        ?? throw new DomainException("Usuário autenticado não encontrado.", 403);

    private static bool CanManage(ActorContext actor) => actor.HasPermission("work", "manage") || actor.HasPermission("admin", "manage");
    private static void RequireManagement(ActorContext actor)
    {
        if (!CanManage(actor)) throw new DomainException("Seu acesso não permite administrar agendas.", 403);
    }
    private static string RequiredName(string value, string label)
    {
        var name = value?.Trim() ?? "";
        if (name.Length is < 2 or > 120) throw new DomainException($"Informe um {label} entre 2 e 120 caracteres.");
        return name;
    }
    private static string NormalizeColor(string? value) =>
        !string.IsNullOrWhiteSpace(value) && System.Text.RegularExpressions.Regex.IsMatch(value.Trim(), "^#[0-9a-fA-F]{6}$")
            ? value.Trim().ToLowerInvariant() : "#2563eb";
    private static string NormalizeDescription(string? value)
    {
        var description = value?.Trim() ?? "";
        if (description.Length > 600) throw new DomainException("A descrição deve ter no máximo 600 caracteres.");
        return description;
    }
    private static IEnumerable<DateTimeOffset> RecurringStarts(DateTimeOffset startsAt, string? recurrence)
    {
        yield return startsAt;
        var mode = recurrence?.Trim().ToLowerInvariant() ?? "none";
        var startDate = startsAt.Date;
        DateTimeOffset? end = mode switch
        {
            "week" => startsAt.AddDays(6 - (int)startsAt.DayOfWeek),
            "month" or "businessdays" => new DateTimeOffset(new DateTime(startDate.Year, startDate.Month, DateTime.DaysInMonth(startDate.Year, startDate.Month), startsAt.Hour, startsAt.Minute, startsAt.Second, DateTimeKind.Utc)),
            _ => null,
        };
        if (end is null) yield break;
        for (var occurrence = startsAt.AddDays(1); occurrence.Date <= end.Value.Date; occurrence = occurrence.AddDays(1))
            if (mode != "businessdays" || occurrence.DayOfWeek is not DayOfWeek.Saturday and not DayOfWeek.Sunday)
                yield return occurrence;
    }
    private void AddAudit(ActorContext actor, string action, string resource, string resourceId, object details) =>
        db.AuditEvents.Add(new AuditEvent { ActorEmail = actor.Email, Action = action, Resource = resource, ResourceId = resourceId, Module = "work", DetailsJson = JsonSerializer.Serialize(details) });
}
