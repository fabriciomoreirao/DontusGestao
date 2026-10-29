using System.Data;
using System.Text.Json;
using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace Dontus.Operations.Infrastructure;

public sealed class OperationsService(OperationsDbContext db) : IOperationsService
{
    private static readonly (string Code, string Title, string Risk, string Behavior)[] Decisions =
    [
        ("V-001", "Destino do Base 44", "Alto", "Manter legado ativo; migração bloqueada"),
        ("V-002", "Nome oficial e product owner", "Médio", "Usar Sistema Integrado de Operações Dontus"),
        ("V-003", "Fonte de verdade por cadastro", "Alto", "Dontus operacional; conflitos exigem revisão"),
        ("V-004", "Calendário e pausa do SLA", "Alto", "Exibir cenários; não pausar automaticamente"),
        ("V-005", "Alçadas financeiras", "Crítico", "Bloquear execução sem política aprovada"),
        ("V-006", "Cliente em haver", "Crítico", "Somente registro; sem consequência financeira"),
        ("V-007", "Critério de grande cliente", "Médio", "Classificação manual aprovada"),
        ("V-008", "Treinamentos e preços", "Alto", "Cobrança bloqueada sem tabela vigente"),
        ("V-009", "Metas comerciais", "Médio", "Carga inicial configurável: 12 mil/10 mil"),
        ("V-010", "Planos e recursos LIA", "Alto", "Growth e Performance configuráveis"),
        ("V-011", "Portal externo do cliente", "Médio", "Fluxos permanecem internos"),
        ("V-012", "Canais e consentimentos", "Alto", "Envio externo desativado até validação"),
        ("V-013", "APIs Sicoob e CelCash", "Crítico", "Somente simulação; emissão bloqueada"),
        ("V-014", "Integração Dontus", "Alto", "Consulta de clientes e acesso assistido via API; tokens somente no servidor"),
        ("V-015", "Retenção, anonimização, RPO e RTO", "Crítico", "Exclusão física desativada"),
        ("V-016", "Escopo de migração do legado", "Alto", "Apenas dry-run e reconciliação"),
        ("V-017", "Configurações por papel", "Alto", "Menor privilégio e autorização explícita"),
        ("V-018", "Avisos do Dontus Pay", "Médio", "Fila interna para responsável configurável"),
        ("V-019", "Ambientes e aprovadores de deploy", "Crítico", "Deploy sensível bloqueado"),
        ("V-020", "Falta de retorno em CS/LIA", "Alto", "Permitir bloqueio/pausa com justificativa"),
    ];

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        if (db.Database.IsRelational())
            await db.Database.MigrateAsync(cancellationToken);
        else
            await db.Database.EnsureCreatedAsync(cancellationToken);

        var existing = await db.DecisionItems.Select(x => x.Code).ToListAsync(cancellationToken);
        var missing = Decisions
            .Where(x => !existing.Contains(x.Code))
            .Select(x => new DecisionItem
            {
                Code = x.Code,
                Title = x.Title,
                Risk = x.Risk,
                DefaultBehavior = x.Behavior,
                Status = x.Code == "V-014" ? "Implementado" : "Pendente",
            });
        await db.DecisionItems.AddRangeAsync(missing, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<OperationsSnapshot> GetSnapshotAsync(ActorContext actor, CancellationToken cancellationToken = default)
    {
        if (actor.Permissions?.All(permission => !permission.CanView) != false)
            throw new DomainException("Seu usuário não possui acesso a nenhuma tela do sistema.", 403);

        var visibleModules = actor.Permissions
            .Where(permission => permission.CanView)
            .Select(permission => permission.Screen)
            .ToList();
        var directlyVisibleModules = visibleModules.ToArray();
        var canManageCommissions = actor.HasPermission("commissions", "manage") || actor.HasPermission("commissions", "approve");
        var canManageReferrals = actor.HasPermission("referrals", "manage") || actor.HasPermission("referrals", "approve");
        var canManageGoals = actor.HasPermission("goals", "manage") || actor.HasPermission("goals", "edit");
        if (actor.HasPermission("commissions", "view"))
            visibleModules.AddRange(["commercial", "cs", "lia"]);
        visibleModules = visibleModules.Distinct(StringComparer.OrdinalIgnoreCase).ToList();

        var canViewCustomers = actor.HasPermission("customers", "view")
            || actor.HasPermission("catalogs", "view")
            || actor.HasPermission("commercial", "view")
            || actor.HasPermission("cs", "view")
            || actor.HasPermission("lia", "view")
            || actor.HasPermission("tasks", "view")
            || actor.HasPermission("waitingQueue", "view")
            || actor.HasPermission("cancellations", "view")
            || actor.HasPermission("serviceRequests", "view")
            || actor.HasPermission("serviceFollowup", "view")
            || actor.HasPermission("commissions", "view")
            || actor.HasPermission("referrals", "view");
        var customerEntities = canViewCustomers
            ? await db.Customers.AsNoTracking()
            .OrderByDescending(x => x.UpdatedAt)
            .Take(1000)
            .ToListAsync(cancellationToken)
            : [];
        var customerIds = customerEntities.Select(x => x.Id).ToList();
        var openCustomerTasks = await db.CorporateTasks.AsNoTracking()
            .Where(x => x.CustomerId.HasValue && customerIds.Contains(x.CustomerId.Value)
                && !x.CompletedAt.HasValue && !x.Cancelled)
            .Select(x => new { CustomerId = x.CustomerId!.Value, x.Protocol })
            .ToListAsync(cancellationToken);
        var customers = customerEntities.Select(x => new CustomerDto(
            x.Id, x.LegalName, x.TradeName, x.DocumentMasked, x.Segment, x.Status,
            x.Owner, x.CsOwner, x.SupportOwner, x.Strategic ? 1 : 0, x.StrategicNetworkId, x.ClinicsCount,
            x.MonthlyRevenueCents, x.Project, x.ProductVersion, x.DueDay, x.Server,
            x.PaymentMethod, x.InvoiceCompany, x.GraceDays, x.DueDays, x.Subscription,
            x.Email, x.Phone, x.Website, x.Notes, x.Address, x.City, x.State, x.CreatedAt,
            openCustomerTasks.Where(task => task.CustomerId == x.Id).Select(task => task.Protocol).ToList()))
            .ToList();

        var registeredUser = await db.Users.AsNoTracking().Where(user => user.Email == actor.Email)
            .Select(user => new { user.Id, user.CreatedAt }).SingleOrDefaultAsync(cancellationToken);
        var registeredAt = registeredUser?.CreatedAt ?? DateTimeOffset.MinValue;
        var items = await db.WorkItems.AsNoTracking()
            .Where(x => visibleModules.Contains(x.Module)
                && (directlyVisibleModules.Contains(x.Module) || canManageCommissions || x.Owner == actor.DisplayName)
                && (x.Module != "reminders" || x.CreatedAt >= registeredAt)
                && (x.Module != "reminders" || x.CustomerName == actor.Email || x.CreatedBy == actor.Email || actor.HasPermission("reminders", "manage"))
                && (x.Module != "diary" || x.CreatedBy == actor.Email)
                && (x.Module != "commissions" || canManageCommissions || x.Owner == actor.DisplayName)
                && (x.Module != "referrals" || canManageReferrals || x.CreatedBy == actor.Email || x.CreatedBy == "" && x.Owner == actor.DisplayName)
                && (x.Module != "goals" || canManageGoals || x.Owner == actor.DisplayName || x.Team == actor.Department))
            .OrderByDescending(x => x.UpdatedAt)
            .Take(1000)
            .Select(x => new WorkItemDto(
                x.Id, x.Module, x.RecordType, x.Title, x.CustomerId, x.CustomerName,
                x.Owner, x.Team, x.Status, x.Priority, x.DueAt, x.SlaDueAt,
                x.AmountCents, x.Description, x.Version, x.UpdatedAt, x.CreatedAt, x.CreatedBy, null, ""))
            .ToListAsync(cancellationToken);
        var itemIds = items.Select(item => item.Id).ToArray();
        var assignments = await db.Activities.AsNoTracking().Where(activity => itemIds.Contains(activity.EntityId)
            && activity.EntityType == "work_item" && activity.Kind == "Responsável alterado")
            .OrderByDescending(activity => activity.CreatedAt).ToListAsync(cancellationToken);
        var latestAssignments = assignments.GroupBy(activity => activity.EntityId).ToDictionary(group => group.Key, group => group.First());
        items = items.Select(item => latestAssignments.TryGetValue(item.Id, out var assignment)
            ? item with { AssignedAt = assignment.CreatedAt, AssignedBy = assignment.Actor } : item).ToList();
        if (!canManageCommissions)
            items = items.Where(item => item.Module != "commissions" || CommissionBelongsTo(item.Description, item.Owner, actor, registeredUser?.Id)).ToList();
        if (!new[] { "customers", "catalogs", "commercial", "cs", "lia", "tasks", "waitingQueue", "cancellations", "serviceRequests", "serviceFollowup" }
                .Any(module => actor.HasPermission(module, "view")))
            customers = customers.Where(customer => items.Any(item => item.CustomerId == customer.Id ||
                !string.IsNullOrWhiteSpace(item.CustomerName) && (item.CustomerName == customer.TradeName || item.CustomerName == customer.LegalName))).ToList();

        var appointments = actor.HasPermission("work", "view")
            ? await db.Appointments.AsNoTracking()
            .OrderBy(x => x.StartsAt)
            .Take(100)
            .Select(x => new AppointmentDto(
                x.Id, x.Title, x.Kind, x.CustomerName, x.Owner, x.Team,
                x.StartsAt, x.EndsAt, x.Status))
            .ToListAsync(cancellationToken)
            : [];

        var approvals = actor.HasPermission("approvals", "view")
            ? await db.Approvals.AsNoTracking()
            .OrderByDescending(x => x.CreatedAt)
            .Take(100)
            .Select(x => new ApprovalDto(
                x.Id, x.Kind, x.SourceTitle, x.Requester, x.ApproverRole,
                x.Status, x.AmountCents, x.CreatedAt))
            .ToListAsync(cancellationToken)
            : [];

        var decisions = actor.HasPermission("admin", "view")
            ? await db.DecisionItems.AsNoTracking()
            .OrderBy(x => x.Code)
            .Select(x => new DecisionDto(
                x.Code, x.Title, x.Status, x.Risk, x.DefaultBehavior, x.Owner))
            .ToListAsync(cancellationToken)
            : [];

        var audit = actor.HasPermission("admin", "view")
            ? await db.AuditEvents.AsNoTracking()
            .OrderByDescending(x => x.CreatedAt)
            .Take(80)
            .Select(x => new AuditEventDto(
                x.Id, x.ActorEmail, x.Action, x.Resource, x.Module,
                x.DetailsJson, x.Result, x.CreatedAt))
            .ToListAsync(cancellationToken)
            : [];

        var moduleCounts = items.GroupBy(x => x.Module)
            .Select(x => new ModuleCountDto(x.Key, x.Count()))
            .ToArray();
        var currentUserProfile = await db.Users.AsNoTracking()
            .Where(user => user.Email == actor.Email)
            .Select(user => new { user.Id, user.UpdatedAt, user.PhotoDataUrl, user.JobTitle, user.IsCoordinator })
            .SingleOrDefaultAsync(cancellationToken);

        return new OperationsSnapshot(
            new UserDto(actor.Email, actor.DisplayName, actor.Role, actor.Department,
                currentUserProfile is null ? "" : ProfilePhotoUrls.For(currentUserProfile.Id, currentUserProfile.UpdatedAt, currentUserProfile.PhotoDataUrl), currentUserProfile?.JobTitle ?? "",
                currentUserProfile?.IsCoordinator ?? false, actor.Permissions ?? [], actor.FullAccess),
            customers, items, appointments, approvals, decisions, audit, moduleCounts);
    }

    public async Task<DiaryModuleDto> GetDiaryModuleAsync(ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("diary", "view");
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(entry => entry.Email == actor.Email, cancellationToken)
            ?? throw new DomainException("Usuário autenticado não encontrado.", 403);
        // A supervisão cadastrada define o escopo, independentemente das permissões administrativas.
        var collaborators = await db.Users.AsNoTracking()
            .Where(entry => user.IsCoordinator && entry.Id != user.Id && entry.Active && entry.BlockedAt == null
                && db.EmployeeSupervisions.Any(link => link.CoordinatorUserId == user.Id && link.SubordinateUserId == entry.Id))
            .OrderBy(entry => entry.DisplayName)
            .Select(entry => new { entry.Id, entry.Email, entry.DisplayName, entry.Department })
            .ToListAsync(cancellationToken);
        var userIds = collaborators.Select(entry => entry.Id).Append(user.Id).ToArray();
        var emails = collaborators.Select(entry => entry.Email).Append(user.Email).ToArray();
        var periodStart = DateTimeOffset.UtcNow.AddDays(-31);
        var periodEnd = DateTimeOffset.UtcNow.AddDays(121);
        var agendaStatuses = await db.AgendaStatuses.AsNoTracking()
            .Where(entry => entry.Active)
            .OrderBy(entry => entry.Name)
            .ToListAsync(cancellationToken);
        var statusesById = agendaStatuses.ToDictionary(entry => entry.Id);
        var commitments = await db.AgendaCommitments.AsNoTracking()
            .Where(entry => userIds.Contains(entry.ResponsibleUserId)
                && entry.StartsAt >= periodStart && entry.StartsAt <= periodEnd)
            .OrderBy(entry => entry.StartsAt)
            .ToListAsync(cancellationToken);
        var manualActivities = await db.WorkItems.AsNoTracking()
            .Where(entry => entry.Module == "diary" && emails.Contains(entry.CreatedBy)
                && (entry.DueAt ?? entry.CreatedAt) >= periodStart && (entry.DueAt ?? entry.CreatedAt) <= periodEnd)
            .OrderBy(entry => entry.DueAt ?? entry.CreatedAt)
            .ToListAsync(cancellationToken);

        DiaryEntryDto[] EntriesFor(Guid userId, string email) => commitments
            .Where(entry => entry.ResponsibleUserId == userId).Take(500).Select(entry =>
        {
            var status = statusesById.GetValueOrDefault(entry.AgendaStatusId);
            return new DiaryEntryDto(entry.Id, "agenda", entry.Title, entry.Description, "Compromisso da Agenda", entry.StartsAt,
                status?.Name ?? "Sem status", status?.Color ?? "#64748b", entry.AgendaStatusId, null);
        }).Concat(manualActivities.Where(entry => string.Equals(entry.CreatedBy, email, StringComparison.OrdinalIgnoreCase)).Take(500).Select(entry => new DiaryEntryDto(
            entry.Id, "manual", entry.Title, entry.Description, entry.RecordType, entry.DueAt ?? entry.CreatedAt,
            entry.Status, DiaryStatusColor(entry.Status), null, entry.Version)))
            .OrderBy(entry => entry.OccursAt)
            .ToArray();

        return new DiaryModuleDto(
            EntriesFor(user.Id, user.Email),
            agendaStatuses.Select(entry => new AgendaStatusDto(entry.Id, entry.Name, entry.Description, entry.Color, entry.Active)).ToArray(),
            collaborators.Select(entry => new DiaryCollaboratorDto(entry.Id, entry.DisplayName, entry.Department,
                EntriesFor(entry.Id, entry.Email))).ToArray());
    }

    public async Task<NotesModuleDto> GetNotesModuleAsync(ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("notes", "view");
        var notes = await db.WorkItems.AsNoTracking()
            .Where(entry => entry.Module == "notes" && (entry.CreatedBy == actor.Email || entry.Team == "Pública"))
            .OrderBy(entry => entry.AmountCents)
            .ThenBy(entry => entry.CreatedAt)
            .Take(500)
            .ToListAsync(cancellationToken);

        return new NotesModuleDto(notes.Select(entry => new NoteDto(
            entry.Id, entry.Title, entry.Description, ReadNoteColor(entry.TagsJson),
            (int)Math.Min(entry.AmountCents, int.MaxValue), entry.UpdatedAt,
            entry.Team == "Pública" ? "public" : "private", entry.Owner, entry.CreatedBy == actor.Email)).ToArray());
    }

    public async Task<Guid> SaveNoteAsync(
        Guid? id,
        string title,
        string? content,
        string? color,
        string? visibility,
        ActorContext actor,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(title))
            throw new DomainException("Informe o título da anotação.");
        if (title.Trim().Length > 240)
            throw new DomainException("O título deve ter no máximo 240 caracteres.");

        var now = DateTimeOffset.UtcNow;
        var normalizedColor = NormalizeNoteColor(color);
        if (id is null)
        {
            actor.RequirePermission("notes", "create");
            var existingOrders = await db.WorkItems
                .Where(entry => entry.Module == "notes" && entry.CreatedBy == actor.Email)
                .Select(entry => entry.AmountCents)
                .ToListAsync(cancellationToken);
            var lastOrder = existingOrders.Count == 0 ? -1L : existingOrders.Max();
            var note = new WorkItem
            {
                Module = "notes",
                RecordType = "Anotação",
                Title = title.Trim(),
                Description = content?.Trim() ?? "",
                TagsJson = SerializeNoteColor(normalizedColor),
                Status = "Ativa",
                Priority = "P3",
                Owner = actor.DisplayName,
                Team = string.Equals(visibility, "public", StringComparison.OrdinalIgnoreCase) ? "Pública" : "Pessoal",
                AmountCents = lastOrder + 1,
                CreatedBy = actor.Email,
            };
            db.WorkItems.Add(note);
            AddAudit(actor, "Create", "note", note.Id.ToString(), "notes", new { note.Title });
            await db.SaveChangesAsync(cancellationToken);
            return note.Id;
        }

        actor.RequirePermission("notes", "edit");
        var existing = await db.WorkItems.SingleOrDefaultAsync(entry => entry.Id == id.Value, cancellationToken)
            ?? throw new DomainException("Anotação não encontrada.", 404);
        EnsureOwnedNote(existing, actor);
        existing.Title = title.Trim();
        existing.Description = content?.Trim() ?? "";
        existing.TagsJson = SerializeNoteColor(normalizedColor);
        existing.Team = string.Equals(visibility, "public", StringComparison.OrdinalIgnoreCase) ? "Pública" : "Pessoal";
        existing.UpdatedAt = now;
        existing.Version++;
        AddAudit(actor, "Update", "note", existing.Id.ToString(), "notes", new { existing.Title });
        await db.SaveChangesAsync(cancellationToken);
        return existing.Id;
    }

    public async Task DeleteNoteAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("notes", "edit");
        var note = await db.WorkItems.SingleOrDefaultAsync(entry => entry.Id == id, cancellationToken)
            ?? throw new DomainException("Anotação não encontrada.", 404);
        EnsureOwnedNote(note, actor);
        db.WorkItems.Remove(note);
        AddAudit(actor, "Delete", "note", note.Id.ToString(), "notes", new { note.Title });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<Guid> DuplicateNoteAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("notes", "create");
        var source = await db.WorkItems.SingleOrDefaultAsync(entry => entry.Id == id, cancellationToken)
            ?? throw new DomainException("Anotação não encontrada.", 404);
        EnsureOwnedNote(source, actor);
        var existingOrders = await db.WorkItems
            .Where(entry => entry.Module == "notes" && entry.CreatedBy == actor.Email)
            .Select(entry => entry.AmountCents)
            .ToListAsync(cancellationToken);
        var lastOrder = existingOrders.Count == 0 ? -1L : existingOrders.Max();
        var copy = new WorkItem
        {
            Module = "notes",
            RecordType = "Anotação",
            Title = string.Concat(source.Title, " (cópia)"),
            Description = source.Description,
            TagsJson = SerializeNoteColor(ReadNoteColor(source.TagsJson)),
            Team = source.Team,
            Status = "Ativa",
            Priority = "P3",
            Owner = actor.DisplayName,
            AmountCents = lastOrder + 1,
            CreatedBy = actor.Email,
        };
        db.WorkItems.Add(copy);
        AddAudit(actor, "Duplicate", "note", copy.Id.ToString(), "notes", new { SourceId = source.Id, copy.Title });
        await db.SaveChangesAsync(cancellationToken);
        return copy.Id;
    }

    public async Task ReorderNotesAsync(IReadOnlyCollection<Guid> noteIds, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("notes", "edit");
        var requestedIds = noteIds.Distinct().ToArray();
        var notes = await db.WorkItems
            .Where(entry => entry.Module == "notes" && entry.CreatedBy == actor.Email)
            .ToListAsync(cancellationToken);
        if (requestedIds.Length != notes.Count || !requestedIds.ToHashSet().SetEquals(notes.Select(entry => entry.Id)))
            throw new DomainException("A organização das anotações está desatualizada. Atualize a tela e tente novamente.", 409);

        var positions = requestedIds.Select((noteId, index) => new { noteId, index }).ToDictionary(entry => entry.noteId, entry => entry.index);
        foreach (var note in notes)
        {
            note.AmountCents = positions[note.Id];
            note.UpdatedAt = DateTimeOffset.UtcNow;
            note.Version++;
        }
        AddAudit(actor, "Reorder", "note", actor.Email, "notes", new { Total = notes.Count });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<NoticesModuleDto> GetNoticesModuleAsync(ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("notices", "view");
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(entry => entry.Email == actor.Email, cancellationToken)
            ?? throw new DomainException("Usuário autenticado não encontrado.", 403);
        var canManage = actor.HasPermission("admin", "manage");
        var now = DateTimeOffset.UtcNow;
        var query = db.CompanyNotices.AsNoTracking();
        if (!canManage)
            query = query.Where(entry => entry.Active && entry.CreatedAt >= user.CreatedAt && entry.PublishedAt <= now
                && (!entry.ExpiresAt.HasValue || entry.ExpiresAt >= now)
                && (entry.Audience != "Colaborador" || entry.TargetUserId == user.Id));
        var notices = await query.OrderByDescending(entry => entry.PublishedAt).Take(300).ToListAsync(cancellationToken);
        var noticeIds = notices.Select(entry => entry.Id).ToList();
        var reads = await db.CompanyNoticeReads.AsNoTracking()
            .Where(entry => noticeIds.Contains(entry.NoticeId)).ToListAsync(cancellationToken);
        var referencedUserIds = notices.Select(entry => entry.AuthorUserId)
            .Concat(notices.Where(entry => entry.TargetUserId.HasValue).Select(entry => entry.TargetUserId!.Value))
            .Distinct().ToList();
        var referencedUsers = await db.Users.AsNoTracking().Where(entry => referencedUserIds.Contains(entry.Id))
            .ToDictionaryAsync(entry => entry.Id, cancellationToken);
        var activeRecipients = canManage
            ? await db.Users.AsNoTracking().Where(entry => entry.Active).OrderBy(entry => entry.DisplayName).ToListAsync(cancellationToken)
            : [];
        return new NoticesModuleDto(notices.Select(entry =>
        {
            var ownRead = reads.FirstOrDefault(read => read.NoticeId == entry.Id && read.UserId == user.Id);
            var visibleToCurrentUser = entry.Active && entry.CreatedAt >= user.CreatedAt && entry.PublishedAt <= now
                && (!entry.ExpiresAt.HasValue || entry.ExpiresAt >= now)
                && (entry.Audience != "Colaborador" || entry.TargetUserId == user.Id);
            var recipients = canManage
                ? activeRecipients.Where(recipient => recipient.CreatedAt <= entry.CreatedAt).Where(recipient => entry.Audience != "Colaborador" || recipient.Id == entry.TargetUserId)
                    .Select(recipient =>
                    {
                        var receipt = reads.FirstOrDefault(read => read.NoticeId == entry.Id && read.UserId == recipient.Id);
                        return new CompanyNoticeRecipientDto(
                            recipient.Id, recipient.DisplayName, ProfilePhotoUrls.For(recipient),
                            receipt?.ViewedAt, receipt?.ReadAt);
                    }).ToList()
                : [];
            return new CompanyNoticeDto(
                entry.Id, entry.Title, entry.Body, entry.Type, entry.Kind, entry.Audience,
                entry.TargetUserId,
                entry.TargetUserId.HasValue && referencedUsers.TryGetValue(entry.TargetUserId.Value, out var targetUser)
                    ? targetUser.DisplayName : "Toda a empresa",
                entry.AuthorUserId,
                referencedUsers.TryGetValue(entry.AuthorUserId, out var author) ? author.DisplayName : "Usuário removido",
                entry.ImageDataUrl, entry.PublishedAt, entry.EventAt, entry.ExpiresAt,
                entry.Active, visibleToCurrentUser, ownRead?.ReadAt is not null,
                ownRead?.ViewedAt, ownRead?.ReadAt,
                reads.Count(read => read.NoticeId == entry.Id && read.ViewedAt.HasValue),
                reads.Count(read => read.NoticeId == entry.Id && read.ReadAt.HasValue),
                recipients, entry.UpdatedAt);
        }).ToList());
    }

    public async Task<Guid> SaveNoticeAsync(
        Guid? id, string title, string body, string type, string kind, string audience,
        Guid? targetUserId, DateTimeOffset? eventAt, DateTimeOffset? expiresAt,
        string? imageDataUrl, bool active, ActorContext actor,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(title)) throw new DomainException("Informe o título do aviso.");
        if (string.IsNullOrWhiteSpace(body)) throw new DomainException("Informe o conteúdo do aviso.");
        var normalizedType = type.Trim();
        if (normalizedType is not ("Informativo" or "Importante" or "Urgente"))
            throw new DomainException("Tipo de aviso inválido.");
        var normalizedKind = kind.Trim();
        if (normalizedKind is not ("Aviso" or "Evento"))
            throw new DomainException("Formato de aviso inválido.");
        var normalizedAudience = audience.Trim();
        if (normalizedAudience is not ("Todos" or "Colaborador"))
            throw new DomainException("Destinatário do aviso inválido.");
        var canPublishCompletionNotice = !id.HasValue && actor.HasPermission("cs", "edit")
            && normalizedAudience == "Colaborador" && normalizedKind == "Aviso";
        if (!actor.HasPermission("admin", "manage") && !canPublishCompletionNotice)
            throw new DomainException("Seu acesso não permite publicar este aviso.", 403);
        if (normalizedKind == "Evento" && !eventAt.HasValue)
            throw new DomainException("Informe a data e o horário do evento.");
        if (expiresAt.HasValue && expiresAt.Value <= DateTimeOffset.UtcNow)
            throw new DomainException("A validade deve ser uma data futura.");
        var normalizedImage = imageDataUrl?.Trim() ?? "";
        if (normalizedImage.Length > 3_000_000 || (normalizedImage.Length > 0 && !normalizedImage.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase)))
            throw new DomainException("A imagem do aviso é inválida ou excede o limite permitido.");
        var user = await db.Users.SingleOrDefaultAsync(entry => entry.Email == actor.Email, cancellationToken)
            ?? throw new DomainException("Usuário autenticado não encontrado.", 403);
        if (normalizedAudience == "Colaborador")
        {
            if (!targetUserId.HasValue) throw new DomainException("Selecione o colaborador destinatário.");
            if (!await db.Users.AnyAsync(entry => entry.Id == targetUserId.Value && entry.Active, cancellationToken))
                throw new DomainException("O colaborador selecionado não está disponível.");
        }
        else targetUserId = null;
        CompanyNotice notice;
        if (id.HasValue)
        {
            notice = await db.CompanyNotices.SingleOrDefaultAsync(entry => entry.Id == id.Value, cancellationToken)
                ?? throw new DomainException("Aviso não encontrado.", 404);
            var resetReceipts = notice.Audience != normalizedAudience || notice.TargetUserId != targetUserId || notice.Kind != normalizedKind;
            notice.Title = title.Trim();
            notice.Body = body.Trim();
            notice.Type = normalizedType;
            notice.Kind = normalizedKind;
            notice.Audience = normalizedAudience;
            notice.TargetUserId = targetUserId;
            notice.EventAt = normalizedKind == "Evento" ? eventAt : null;
            notice.ExpiresAt = expiresAt;
            notice.ImageDataUrl = normalizedImage;
            notice.Active = active;
            notice.UpdatedAt = DateTimeOffset.UtcNow;
            if (resetReceipts)
                db.CompanyNoticeReads.RemoveRange(db.CompanyNoticeReads.Where(entry => entry.NoticeId == notice.Id));
            AddAudit(actor, "Update", "company_notice", notice.Id.ToString(), "notices", new { notice.Title, notice.Type, notice.Kind, notice.Audience, notice.Active });
        }
        else
        {
            notice = new CompanyNotice
            {
                Title = title.Trim(), Body = body.Trim(), Type = normalizedType, Kind = normalizedKind,
                Audience = normalizedAudience, TargetUserId = targetUserId,
                AuthorUserId = user.Id, ImageDataUrl = normalizedImage,
                PublishedAt = DateTimeOffset.UtcNow,
                EventAt = normalizedKind == "Evento" ? eventAt : null,
                ExpiresAt = expiresAt, Active = active,
            };
            db.CompanyNotices.Add(notice);
            AddAudit(actor, "Create", "company_notice", notice.Id.ToString(), "notices", new { notice.Title, notice.Type, notice.Kind, notice.Audience });
        }
        await db.SaveChangesAsync(cancellationToken);
        return notice.Id;
    }

    public async Task DeleteNoticeAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("admin", "manage");
        var notice = await db.CompanyNotices.SingleOrDefaultAsync(entry => entry.Id == id, cancellationToken)
            ?? throw new DomainException("Aviso não encontrado.", 404);
        db.CompanyNotices.Remove(notice);
        AddAudit(actor, "Delete", "company_notice", notice.Id.ToString(), "notices", new { notice.Title });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task MarkNoticeViewedAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("notices", "view");
        var user = await db.Users.SingleOrDefaultAsync(entry => entry.Email == actor.Email, cancellationToken)
            ?? throw new DomainException("Usuário autenticado não encontrado.", 403);
        var now = DateTimeOffset.UtcNow;
        if (!await db.CompanyNotices.AnyAsync(entry => entry.Id == id && entry.Active
                && entry.CreatedAt >= user.CreatedAt && entry.PublishedAt <= now && (!entry.ExpiresAt.HasValue || entry.ExpiresAt >= now)
                && (entry.Audience != "Colaborador" || entry.TargetUserId == user.Id), cancellationToken))
            throw new DomainException("Aviso não encontrado ou indisponível.", 404);
        var receipt = await db.CompanyNoticeReads.SingleOrDefaultAsync(
            entry => entry.NoticeId == id && entry.UserId == user.Id, cancellationToken);
        if (receipt is null)
            db.CompanyNoticeReads.Add(new CompanyNoticeRead { NoticeId = id, UserId = user.Id, ViewedAt = now });
        else if (!receipt.ViewedAt.HasValue)
            receipt.ViewedAt = now;
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task MarkNoticeReadAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("notices", "view");
        var user = await db.Users.SingleOrDefaultAsync(entry => entry.Email == actor.Email, cancellationToken)
            ?? throw new DomainException("Usuário autenticado não encontrado.", 403);
        var now = DateTimeOffset.UtcNow;
        if (!await db.CompanyNotices.AnyAsync(entry => entry.Id == id && entry.Active
                && entry.CreatedAt >= user.CreatedAt && entry.PublishedAt <= now && (!entry.ExpiresAt.HasValue || entry.ExpiresAt >= now)
                && (entry.Audience != "Colaborador" || entry.TargetUserId == user.Id), cancellationToken))
            throw new DomainException("Aviso não encontrado ou indisponível.", 404);
        var read = await db.CompanyNoticeReads.SingleOrDefaultAsync(entry => entry.NoticeId == id && entry.UserId == user.Id, cancellationToken);
        if (read is null)
            db.CompanyNoticeReads.Add(new CompanyNoticeRead { NoticeId = id, UserId = user.Id, ViewedAt = now, ReadAt = now });
        else
        {
            read.ViewedAt ??= now;
            read.ReadAt = now;
        }
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<Guid> CreateCustomerAsync(
        CreateCustomerCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default)
    {
        if (!actor.HasPermission("customers", "create")
            && !actor.HasPermission("catalogs", "create")
            && !actor.HasPermission("commercial", "create")
            && !actor.HasPermission("cs", "create")
            && !actor.HasPermission("admin", "manage"))
            throw new DomainException("Seu acesso não permite cadastrar clientes.", 403);
        if (string.IsNullOrWhiteSpace(command.LegalName))
            throw new DomainException("Informe a razão social.");
        if (command.Strategic && !command.StrategicNetworkId.HasValue)
            throw new DomainException("Selecione a rede da conta estratégica.");
        if (command.StrategicNetworkId.HasValue && !await db.WorkItems.AsNoTracking().AnyAsync(
            entry => entry.Id == command.StrategicNetworkId.Value && entry.Module == "cs" && entry.Description.Contains("enterpriseNetwork"), cancellationToken))
            throw new DomainException("A rede estratégica selecionada não foi localizada.");

        var customer = new Customer
        {
            LegalName = command.LegalName.Trim(),
            TradeName = string.IsNullOrWhiteSpace(command.TradeName) ? command.LegalName.Trim() : command.TradeName.Trim(),
            DocumentMasked = command.DocumentMasked?.Trim() ?? "",
            Segment = string.IsNullOrWhiteSpace(command.Segment) ? "Clínica odontológica" : command.Segment.Trim(),
            Owner = string.IsNullOrWhiteSpace(command.Owner) ? actor.DisplayName : command.Owner.Trim(),
            CsOwner = string.IsNullOrWhiteSpace(command.CsOwner) ? "Não atribuído" : command.CsOwner.Trim(),
            Strategic = command.Strategic,
            StrategicNetworkId = command.Strategic ? command.StrategicNetworkId : null,
            ClinicsCount = Math.Max(1, command.ClinicsCount),
            MonthlyRevenueCents = Math.Max(0, command.MonthlyRevenueCents),
            Status = command.Status?.Trim() ?? "",
            Project = command.Project?.Trim() ?? "",
            ProductVersion = command.ProductVersion?.Trim() ?? "",
            DueDay = command.DueDay?.Trim() ?? "",
            Server = command.Server?.Trim() ?? "",
            PaymentMethod = command.PaymentMethod?.Trim() ?? "",
            InvoiceCompany = command.InvoiceCompany?.Trim() ?? "",
            GraceDays = command.GraceDays?.Trim() ?? "",
            DueDays = command.DueDays?.Trim() ?? "",
            Subscription = command.Subscription?.Trim() ?? "",
            Email = command.Email?.Trim() ?? "",
            Phone = command.Phone?.Trim() ?? "",
            Website = command.Website?.Trim() ?? "",
            Notes = command.Notes?.Trim() ?? "",
            Address = command.Address?.Trim() ?? "",
            City = command.City?.Trim() ?? "",
            State = command.State?.Trim() ?? "",
            CreatedBy = actor.Email,
        };

        db.Customers.Add(customer);
        await LinkStrategicUnitAsync(customer, actor, cancellationToken);
        AddAudit(actor, "Create", "customer", customer.Id.ToString(), "customers", new { customer.TradeName });
        await db.SaveChangesAsync(cancellationToken);
        return customer.Id;
    }

    public async Task UpdateCustomerAsync(
        UpdateCustomerCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default)
    {
        if (!actor.HasPermission("customers", "edit")
            && !actor.HasPermission("commercial", "edit")
            && !actor.HasPermission("cs", "edit")
            && !actor.HasPermission("cs", "approve")
            && !actor.HasPermission("cancellations", "edit")
            && !actor.HasPermission("admin", "manage"))
            throw new DomainException("Seu acesso não permite editar clientes.", 403);

        var customer = await db.Customers.SingleOrDefaultAsync(entry => entry.Id == command.Id, cancellationToken)
            ?? throw new DomainException("Cliente não encontrado.", 404);

        static string Clean(string value) => value.Trim();
        if (command.LegalName is not null)
        {
            if (string.IsNullOrWhiteSpace(command.LegalName)) throw new DomainException("Informe a razão social.");
            customer.LegalName = Clean(command.LegalName);
        }
        if (command.TradeName is not null) customer.TradeName = string.IsNullOrWhiteSpace(command.TradeName) ? customer.LegalName : Clean(command.TradeName);
        if (command.DocumentMasked is not null) customer.DocumentMasked = Clean(command.DocumentMasked);
        if (command.Segment is not null) customer.Segment = Clean(command.Segment);
        if (command.Owner is not null) customer.Owner = Clean(command.Owner);
        if (command.CsOwner is not null) customer.CsOwner = Clean(command.CsOwner);
        if (command.ClinicsCount.HasValue) customer.ClinicsCount = Math.Max(1, command.ClinicsCount.Value);
        if (command.MonthlyRevenueCents.HasValue) customer.MonthlyRevenueCents = Math.Max(0, command.MonthlyRevenueCents.Value);
        if (command.Strategic.HasValue) customer.Strategic = command.Strategic.Value;
        if (!customer.Strategic) customer.StrategicNetworkId = null;
        else if (command.StrategicNetworkId.HasValue) customer.StrategicNetworkId = command.StrategicNetworkId;
        if (customer.Strategic && !customer.StrategicNetworkId.HasValue)
            throw new DomainException("Selecione a rede da conta estratégica.");
        if (customer.StrategicNetworkId.HasValue && !await db.WorkItems.AsNoTracking().AnyAsync(
            entry => entry.Id == customer.StrategicNetworkId.Value && entry.Module == "cs" && entry.Description.Contains("enterpriseNetwork"), cancellationToken))
            throw new DomainException("A rede estratégica selecionada não foi localizada.");
        if (command.Status is not null) customer.Status = Clean(command.Status);
        if (command.Project is not null) customer.Project = Clean(command.Project);
        if (command.ProductVersion is not null) customer.ProductVersion = Clean(command.ProductVersion);
        if (command.DueDay is not null) customer.DueDay = Clean(command.DueDay);
        if (command.Server is not null) customer.Server = Clean(command.Server);
        if (command.PaymentMethod is not null) customer.PaymentMethod = Clean(command.PaymentMethod);
        if (command.InvoiceCompany is not null) customer.InvoiceCompany = Clean(command.InvoiceCompany);
        if (command.GraceDays is not null) customer.GraceDays = Clean(command.GraceDays);
        if (command.DueDays is not null) customer.DueDays = Clean(command.DueDays);
        if (command.Subscription is not null) customer.Subscription = Clean(command.Subscription);
        if (command.Email is not null) customer.Email = Clean(command.Email);
        if (command.Phone is not null) customer.Phone = Clean(command.Phone);
        if (command.Website is not null) customer.Website = Clean(command.Website);
        if (command.Notes is not null) customer.Notes = Clean(command.Notes);
        if (command.Address is not null) customer.Address = Clean(command.Address);
        if (command.City is not null) customer.City = Clean(command.City);
        if (command.State is not null) customer.State = Clean(command.State);
        customer.UpdatedAt = DateTimeOffset.UtcNow;
        customer.Version++;

        await LinkStrategicUnitAsync(customer, actor, cancellationToken);
        AddAudit(actor, "Update", "customer", customer.Id.ToString(), "customers", new { customer.TradeName, customer.Status });
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task LinkStrategicUnitAsync(Customer customer, ActorContext actor, CancellationToken cancellationToken)
    {
        if (!customer.Strategic || !customer.StrategicNetworkId.HasValue) return;
        var network = await db.WorkItems.SingleAsync(item => item.Id == customer.StrategicNetworkId.Value, cancellationToken);
        var detail = JsonNode.Parse(network.Description) as JsonObject
            ?? throw new DomainException("Os dados da rede estratégica são inválidos.");
        var units = detail["units"] as JsonArray ?? new JsonArray();
        if (detail["units"] is null) detail["units"] = units;
        var code = new string(customer.DocumentMasked.Where(char.IsDigit).ToArray());
        var existing = units.OfType<JsonObject>().FirstOrDefault(unit => unit["customerId"]?.ToString() == customer.Id.ToString()
            || (code.Length == 6 && unit["externalId"]?.ToString() == code));
        if (existing is not null)
        {
            if (existing["customerId"]?.ToString() == customer.Id.ToString()) return;
            existing["customerId"] = customer.Id.ToString();
            network.Description = detail.ToJsonString(); network.Version++; network.UpdatedAt = DateTimeOffset.UtcNow; return;
        }
        var unitId = Guid.NewGuid().ToString();
        units.Add(new JsonObject {
            ["id"] = unitId, ["customerId"] = customer.Id.ToString(), ["name"] = customer.TradeName,
            ["externalId"] = code.Length == 6 ? code : "", ["city"] = customer.City, ["state"] = customer.State,
            ["contact"] = customer.TradeName, ["phone"] = customer.Phone, ["email"] = customer.Email,
            ["usageStatus"] = "Não iniciada", ["usagePercent"] = 0, ["lastAnalysis"] = "",
            ["implementationAt"] = DateTimeOffset.UtcNow.ToString("yyyy-MM-dd"), ["status"] = "Não iniciada",
            ["active"] = true, ["features"] = new JsonArray(),
            ["notes"] = string.Join("\n", new[] { $"Razão social: {customer.LegalName}", $"Nome: {customer.TradeName}", $"ID: {customer.DocumentMasked}", $"Comercial: {customer.Owner} · CS: {customer.CsOwner}", $"Produto: {customer.Project} · Versão: {customer.ProductVersion}", $"Receita mensal (centavos): {customer.MonthlyRevenueCents}", $"Contato: {customer.Phone} · {customer.Email}", $"Endereço: {customer.Address} · {customer.City}/{customer.State}", customer.Notes })
        });
        var history = detail["history"] as JsonArray ?? new JsonArray();
        if (detail["history"] is null) detail["history"] = history;
        history.Add(new JsonObject { ["id"] = Guid.NewGuid().ToString(), ["unitId"] = unitId, ["createdAt"] = DateTimeOffset.UtcNow.ToString("O"), ["user"] = actor.DisplayName, ["type"] = "Cadastro de cliente", ["text"] = $"Clínica {customer.TradeName} vinculada à rede pelo cadastro de clientes." });
        network.Description = detail.ToJsonString();
        network.Version++;
        network.UpdatedAt = DateTimeOffset.UtcNow;
    }

    public async Task<CustomerModuleDto> GetCustomerModuleAsync(ActorContext actor, CancellationToken cancellationToken = default)
    {
        if (!actor.HasPermission("customers", "view") && !actor.HasPermission("catalogs", "view") && !actor.HasPermission("commercial", "view") && !actor.HasPermission("cs", "view") && !actor.HasPermission("lia", "view") && !actor.HasPermission("support", "view") && !actor.HasPermission("cancellations", "view") && !actor.HasPermission("hr", "view") && !actor.HasPermission("serviceRequests", "view") && !actor.HasPermission("serviceFollowup", "view") && !actor.HasPermission("commissions", "view") && !actor.HasPermission("referrals", "view"))
            throw new DomainException("Seu acesso não permite visualizar os cadastros de clientes.", 403);
        var includeInactive = actor.HasPermission("catalogs", "manage") || actor.HasPermission("customers", "manage") || actor.HasPermission("commercial", "manage") || actor.HasPermission("cs", "manage") || actor.HasPermission("lia", "manage") || actor.HasPermission("support", "manage") || actor.HasPermission("cancellations", "manage") || actor.HasPermission("hr", "manage");
        var manageCommissions = actor.HasPermission("commissions", "manage") || actor.HasPermission("commissions", "approve");
        var manageReferrals = actor.HasPermission("referrals", "manage") || actor.HasPermission("referrals", "approve");
        var entries = await db.CustomerCatalogOptions.AsNoTracking()
            .Where(entry => includeInactive || entry.Active || manageCommissions && entry.Catalog == "commissionRule" ||
                manageReferrals && (entry.Catalog == "referralCommission" || entry.Catalog == "referralModule" || entry.Catalog == "referralUsageStatus"))
            .OrderBy(entry => entry.Catalog).ThenBy(entry => entry.Name)
            .Select(entry => new CustomerCatalogOptionDto(entry.Id, entry.Catalog, entry.Name, entry.Description, entry.Active))
            .ToListAsync(cancellationToken);
        var userId = await db.Users.AsNoTracking().Where(user => user.Email == actor.Email)
            .Select(user => (Guid?)user.Id).SingleOrDefaultAsync(cancellationToken);
        entries = entries.Where(entry => entry.Catalog switch
        {
            "commissionRule" => manageCommissions || CatalogBelongsTo(entry.Description, "employeeId", "employeeName", actor, userId),
            "referralCommission" => manageReferrals || CatalogBelongsTo(entry.Description, "collaboratorId", "collaboratorName", actor, userId, true),
            _ => true,
        }).ToList();
        var collaborators = new List<CollaboratorSummaryDto>();
        if (actor.HasPermission("commissions", "view") || actor.HasPermission("referrals", "view"))
        {
            var users = await db.Users.AsNoTracking().Where(user => manageCommissions || manageReferrals || user.Email == actor.Email)
                .OrderBy(user => user.DisplayName).ToListAsync(cancellationToken);
            collaborators = users.Select(user => new CollaboratorSummaryDto(user.Id, user.Email, user.DisplayName,
                user.Department, [user.Department], ProfilePhotoUrls.For(user), user.Active && !user.BlockedAt.HasValue)).ToList();
        }
        return new CustomerModuleDto(entries) { Collaborators = collaborators,
            CsDistribution = actor.HasPermission("cs", "view") ? await new CsDistributionService(db).GetAsync(actor, cancellationToken) : [] };
    }

    private static bool CatalogBelongsTo(string description, string idKey, string nameKey, ActorContext actor, Guid? userId, bool allowDepartment = false)
    {
        try
        {
            using var json = JsonDocument.Parse(description);
            var root = json.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return false;
            if (root.TryGetProperty(idKey, out var id) && id.ValueKind == JsonValueKind.String && Guid.TryParse(id.GetString(), out var employeeId))
                return employeeId == userId;
            if (root.TryGetProperty(nameKey, out var name) && name.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(name.GetString()))
                return string.Equals(name.GetString(), actor.DisplayName, StringComparison.OrdinalIgnoreCase);
            return allowDepartment && (!root.TryGetProperty("department", out var department) || department.ValueKind == JsonValueKind.String &&
                (string.IsNullOrWhiteSpace(department.GetString()) || string.Equals(department.GetString(), actor.Department, StringComparison.OrdinalIgnoreCase)));
        }
        catch (JsonException) { return false; }
    }

    private static void RequireCustomerCatalogManagement(string catalog, ActorContext actor)
    {
        if (actor.FullAccess || actor.HasPermission("catalogs", "manage")) return;
        var key = catalog.ToLowerInvariant();
        var module = key switch
        {
            "status" or "project" or "version" or "subscription" or "server" or "paymentmethod" or "dueday" or "gracedays" or "duedays" or "invoicecompany" => "customers",
            "temperature" or "funnelstage" or "acquisitionchannel" or "followuptype" or "lossreason" => "commercial",
            "employeerole" => "hr",
            "portallink" => "admin",
            "commissionrule" => "commissions",
            "referralmodule" or "referralusagestatus" or "referralcommission" => "referrals",
            _ when key.StartsWith("commercial") || key.StartsWith("retention") => "commercial",
            _ when key.StartsWith("cs") || key.StartsWith("enterprise") => "cs",
            _ when key.StartsWith("lia") => "lia",
            _ when key.StartsWith("service") => "support",
            _ when key.StartsWith("waitingqueue") => "waitingQueue",
            _ when key.StartsWith("cancellation") => "cancellations",
            _ when key.StartsWith("recruitment") => "admin",
            _ when key.StartsWith("hr") => "hr",
            _ => "",
        };
        if (module.Length == 0 || !actor.HasPermission(module, "manage"))
            throw new DomainException("Seu acesso não permite alterar os cadastros desta funcionalidade.", 403);
    }

    private static void ValidateCustomerCatalogConfiguration(string catalog, string? description)
    {
        if (catalog == "commissionRule")
        {
            ValidateCommissionScoreTiers(description);
            return;
        }
        if (catalog is not ("funnelStage" or "csFunnel" or "recruitmentStageTemplate")) return;
        try
        {
            using var json = JsonDocument.Parse(description ?? "{}");
            var root = json.RootElement;
            var compact = root.TryGetProperty("s", out var stages);
            if (!compact && !root.TryGetProperty("stages", out stages))
                throw new DomainException("Adicione ao menos uma etapa ao fluxo.");
            if (stages.ValueKind != JsonValueKind.Array || stages.GetArrayLength() == 0)
                throw new DomainException("Adicione ao menos uma etapa ao fluxo.");
            var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var stage in stages.EnumerateArray())
            {
                var name = compact ? stage[0].GetString() : stage.GetProperty("name").GetString();
                if (string.IsNullOrWhiteSpace(name) || !names.Add(name.Trim()))
                    throw new DomainException("Cada etapa deve ter um nome preenchido e diferente das demais.");
                var won = compact ? stage.GetArrayLength() > 2 && stage[2].ToString() is "1" or "true" : stage.TryGetProperty("won", out var w) && w.ValueKind == JsonValueKind.True;
                var lost = compact ? stage.GetArrayLength() > 3 && stage[3].ToString() is "1" or "true" : stage.TryGetProperty("lost", out var l) && l.ValueKind == JsonValueKind.True;
                if (won && lost) throw new DomainException("Uma etapa não pode representar ganho e perda ao mesmo tempo.");
            }
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException or KeyNotFoundException or IndexOutOfRangeException)
        {
            throw new DomainException("As etapas do fluxo estão inválidas. Confira os nomes e as flags antes de salvar.");
        }
    }

    private static void ValidateCommissionScoreTiers(string? description)
    {
        try
        {
            using var json = JsonDocument.Parse(description ?? "{}");
            var root = json.RootElement;
            // Existing flat rules remain valid until their manager configures score bands.
            if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("scoreTiers", out var tiers)) return;
            if (!root.TryGetProperty("scope", out var scope) || scope.GetString() != "cs" ||
                !root.TryGetProperty("type", out var type) || type.GetString() != "percentage" ||
                tiers.ValueKind != JsonValueKind.Array || tiers.GetArrayLength() == 0)
                throw new DomainException("As faixas de score são exclusivas das comissões percentuais de Sucesso do Cliente.");
            CommissionScoreBands.Parse(tiers);
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException)
        {
            throw new DomainException("Informe uma configuração de faixas de score válida.");
        }
    }

    public async Task<Guid> SaveCustomerCatalogAsync(Guid? id, string catalog, string name, string? description, bool active, ActorContext actor, CancellationToken cancellationToken = default)
    {
        var catalogKey = (catalog ?? "").Trim();
        RequireCustomerCatalogManagement(catalogKey, actor);

        if (catalogKey.Length is < 2 or > 80 || !char.IsLetter(catalogKey[0]) || catalogKey.Any(character => !char.IsLetterOrDigit(character) && character != '_'))
            throw new DomainException("Identificador do cadastro inválido. Use somente letras, números e sublinhado.");
        if (string.IsNullOrWhiteSpace(name)) throw new DomainException("Informe o nome do cadastro.");
        var entry = id.HasValue
            ? await db.CustomerCatalogOptions.SingleOrDefaultAsync(item => item.Id == id.Value, cancellationToken) ?? throw new DomainException("Cadastro não encontrado.", 404)
            : new CustomerCatalogOption { Catalog = catalogKey, Name = name.Trim() };
        if (id.HasValue && !string.Equals(entry.Catalog, catalogKey, StringComparison.OrdinalIgnoreCase))
            throw new DomainException("Não é permitido mover um cadastro entre funcionalidades. Edite-o na configuração original.", 409);
        if (await db.CustomerCatalogOptions.AnyAsync(item => item.Id != entry.Id && item.Catalog == catalogKey && item.Name.ToUpper() == name.Trim().ToUpper(), cancellationToken))
            throw new DomainException("Já existe uma opção com este nome. Edite ou reative o cadastro existente.", 409);
        ValidateCustomerCatalogConfiguration(catalogKey, description);
        entry.Catalog = catalogKey; entry.Name = name.Trim(); entry.Description = description?.Trim() ?? ""; entry.Active = active; entry.UpdatedAt = DateTimeOffset.UtcNow;
        if (!id.HasValue) db.CustomerCatalogOptions.Add(entry);
        AddAudit(actor, id.HasValue ? "Update" : "Create", "customerCatalog", entry.Id.ToString(), "catalogs", new { entry.Catalog, entry.Name, entry.Active });
        await db.SaveChangesAsync(cancellationToken); return entry.Id;
    }

    public async Task DeleteCustomerCatalogAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default)
    {
        var entry = await db.CustomerCatalogOptions.SingleOrDefaultAsync(item => item.Id == id, cancellationToken) ?? throw new DomainException("Cadastro não encontrado.", 404);
        RequireCustomerCatalogManagement(entry.Catalog, actor);
        db.CustomerCatalogOptions.Remove(entry);
        AddAudit(actor, "Delete", "customerCatalog", entry.Id.ToString(), "catalogs", new { entry.Catalog, entry.Name });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<Guid> CreateWorkItemAsync(
        CreateWorkItemCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default)
    {
        var cancellationRoute = string.Equals(command.OriginType, "cancellations", StringComparison.OrdinalIgnoreCase)
            && (string.Equals(command.Module, "cs", StringComparison.OrdinalIgnoreCase)
                || string.Equals(command.Module, "lia", StringComparison.OrdinalIgnoreCase))
            && actor.HasPermission("cancellations", "edit");
        if (cancellationRoute && !await HasWorkItemOriginAsync(command, "cancellations", cancellationToken)) cancellationRoute = false;
        var customerComment = string.Equals(command.Module, "customers", StringComparison.OrdinalIgnoreCase)
            && string.Equals(command.RecordType, "Comentário do cliente", StringComparison.OrdinalIgnoreCase)
            && actor.HasPermission("customers", "edit");
        var customerEngagement = string.Equals(command.Module, "customers", StringComparison.OrdinalIgnoreCase)
            && (string.Equals(command.RecordType, "Alerta do cliente", StringComparison.OrdinalIgnoreCase)
                || string.Equals(command.RecordType, "Checklist vinculado", StringComparison.OrdinalIgnoreCase))
            && !string.IsNullOrWhiteSpace(command.OriginType)
            && new[] { "support", "commercial", "cs", "cancellations", "lia" }.Contains(command.OriginType)
            && actor.HasPermission(command.OriginType, "edit");
        var retentionRestart = string.Equals(command.Module, "commercial", StringComparison.OrdinalIgnoreCase)
            && string.Equals(command.RecordType, "Lead de retenção", StringComparison.OrdinalIgnoreCase)
            && string.Equals(command.OriginType, "cs", StringComparison.OrdinalIgnoreCase)
            && actor.HasPermission("cs", "edit");
        if (retentionRestart && !await HasWorkItemOriginAsync(command, "cs", cancellationToken)) retentionRestart = false;
        var serviceRequestRoute = await CanRouteServiceRequestAsync(command, actor, cancellationToken);
        var commissionDecision = command.Module == "commissions" &&
            (actor.HasPermission("commissions", "approve") || actor.HasPermission("commissions", "manage"));
        if (command.Module == "commissions" && !commissionDecision)
            throw new DomainException("A decisão de comissão exige permissão de aprovação.", 403);
        if (!cancellationRoute && !customerComment && !customerEngagement && !retentionRestart && !serviceRequestRoute && !commissionDecision)
            actor.RequirePermission(command.Module, "create");
        if (command.Module == "referrals" && !CanSuperviseReferrals(actor))
            command = PrepareOwnReferral(command, actor);
        if (string.IsNullOrWhiteSpace(command.Module) ||
            string.IsNullOrWhiteSpace(command.RecordType) ||
            string.IsNullOrWhiteSpace(command.Title))
            throw new DomainException("Módulo, tipo e título são obrigatórios.");

        if (TryReadJourneyIdentity(command.Description, out var journeyKind, out var clientId, out var journeyTrack) &&
            !string.IsNullOrWhiteSpace(clientId) &&
            (journeyKind.Equals("csJourney", StringComparison.OrdinalIgnoreCase) || journeyKind.Equals("liaJourney", StringComparison.OrdinalIgnoreCase)))
        {
            var module = command.Module.Trim();
            var candidates = await db.WorkItems.AsNoTracking()
                .Where(entry => entry.Module == module)
                .Select(entry => new { entry.CustomerId, entry.Description })
                .ToListAsync(cancellationToken);
            var duplicate = candidates.Any(candidate =>
            {
                if (!TryReadJourneyIdentity(candidate.Description, out var existingKind, out var existingClientId, out var existingTrack))
                    return false;
                if (!existingKind.Equals(journeyKind, StringComparison.OrdinalIgnoreCase))
                    return false;
                if (journeyKind.Equals("csJourney", StringComparison.OrdinalIgnoreCase) &&
                    !string.Equals(existingTrack, journeyTrack, StringComparison.OrdinalIgnoreCase))
                    return false;
                return string.Equals(existingClientId.Trim(), clientId.Trim(), StringComparison.OrdinalIgnoreCase)
                    || command.CustomerId.HasValue && candidate.CustomerId == command.CustomerId;
            });
            if (duplicate)
                throw new DomainException("ID já inserido na funcionalidade.", 409);
        }

        if (command.RecordType.Equals("Candidato", StringComparison.OrdinalIgnoreCase) &&
            TryReadRecruitmentProcessId(command.Description, out var recruitmentProcessId))
        {
            var process = await db.WorkItems.AsNoTracking().SingleOrDefaultAsync(
                entry => entry.Id == recruitmentProcessId && entry.Module == "admin" && entry.RecordType == "Processo seletivo",
                cancellationToken);
            if (process is null || !string.Equals(process.Status, "Ativo", StringComparison.OrdinalIgnoreCase))
                throw new DomainException("Este processo seletivo foi finalizado e não recebe novas inscrições.", 409);
        }

        var item = new WorkItem
        {
            Module = command.Module.Trim(),
            RecordType = command.RecordType.Trim(),
            Title = command.Title.Trim(),
            CustomerId = command.CustomerId,
            CustomerName = command.CustomerName?.Trim() ?? "",
            Owner = string.IsNullOrWhiteSpace(command.Owner) ? actor.DisplayName : command.Owner.Trim(),
            Team = command.Team?.Trim() ?? "",
            // Alguns fluxos operacionais (Marketing, Indicações e inserções manuais)
            // já conhecem a etapa inicial correta. Preserve-a quando informada.
            Status = !string.IsNullOrWhiteSpace(command.Status)
                ? command.Status.Trim()
                : WorkflowPolicy.InitialStatus(command.Module),
            Priority = string.IsNullOrWhiteSpace(command.Priority) ? "P3" : command.Priority.Trim(),
            DueAt = command.DueAt,
            SlaDueAt = command.SlaDueAt,
            AmountCents = Math.Max(0, command.AmountCents),
            Description = command.Description?.Trim() ?? "",
            TagsJson = JsonSerializer.Serialize(command.Tags ?? []),
            OriginType = command.OriginType?.Trim(),
            OriginId = command.OriginId,
            CreatedBy = actor.Email,
        };

        var commissionDecisionData = await CommissionDecisionPolicy.PrepareAsync(db, item.Module, item.Description, null, item.AmountCents, actor, cancellationToken, item.CreatedBy);
        item.Description = commissionDecisionData.Description; item.AmountCents = commissionDecisionData.Amount;
        db.WorkItems.Add(item);
        db.Activities.Add(new Activity
        {
            EntityType = "work_item",
            EntityId = item.Id,
            Module = item.Module,
            Kind = "Criado",
            Summary = $"{item.RecordType} criado: {item.Title}",
            Actor = actor.DisplayName,
        });
        AddAudit(actor, "Create", "work_item", item.Id.ToString(), item.Module, new { item.RecordType, item.Title });
        await db.SaveChangesAsync(cancellationToken);
        return item.Id;
    }

    private async Task<bool> CanRouteServiceRequestAsync(CreateWorkItemCommand command, ActorContext actor, CancellationToken cancellationToken)
    {
        if (command.OriginType != "serviceRequests" || !actor.HasPermission("serviceRequests", "edit") || !command.OriginId.HasValue)
            return false;
        var source = await db.WorkItems.AsNoTracking().Where(item => item.Id == command.OriginId && item.Module == "serviceRequests")
            .Select(item => item.Status).SingleOrDefaultAsync(cancellationToken);
        var expected = source switch
        {
            "Desenvolvimento" => (Module: "ti", Type: "Tarefa de desenvolvimento", Kind: "developmentTask"),
            "Cancelamento" => (Module: "cancellations", Type: "Solicitação de cancelamento", Kind: "cancellationJourney"),
            "Nova contratação" => (Module: "commercial", Type: "Lead comercial", Kind: "commercialLead"),
            "Reclamação" or "Elogio" => (Module: "serviceFollowup", Type: "Acompanhamento de chamado", Kind: "serviceRequestFollowup"),
            _ => (Module: "", Type: "", Kind: ""),
        };
        if (command.Module != expected.Module || command.RecordType != expected.Type || string.IsNullOrWhiteSpace(expected.Module)) return false;
        try
        {
            using var document = JsonDocument.Parse(command.Description ?? "{}");
            return document.RootElement.ValueKind == JsonValueKind.Object && document.RootElement.TryGetProperty("kind", out var kind)
                && kind.ValueKind == JsonValueKind.String && kind.GetString() == expected.Kind;
        }
        catch (JsonException) { return false; }
    }

    private Task<bool> HasWorkItemOriginAsync(CreateWorkItemCommand command, string module, CancellationToken cancellationToken) =>
        db.WorkItems.AsNoTracking().AnyAsync(item => item.Id == command.OriginId && item.Module == module, cancellationToken);

    private static bool ChangesOnlyDescriptionFields(WorkItem item, UpdateWorkItemCommand command, params string[] fields)
    {
        if (item.Title != command.Title || item.Owner != command.Owner || item.AmountCents != command.AmountCents) return false;
        try
        {
            if (JsonNode.Parse(item.Description) is not JsonObject before || JsonNode.Parse(command.Description ?? "{}") is not JsonObject after) return false;
            foreach (var field in fields) { before.Remove(field); after.Remove(field); }
            return JsonNode.DeepEquals(before, after);
        }
        catch (JsonException) { return false; }
    }

    private static void RequirePersonalRecordScope(WorkItem item, ActorContext actor, bool deleting = false)
    {
        if (item.Module == "referrals" && !CanSuperviseReferrals(actor) &&
            !(string.Equals(item.CreatedBy, actor.Email, StringComparison.OrdinalIgnoreCase) ||
                string.IsNullOrEmpty(item.CreatedBy) && string.Equals(item.Owner, actor.DisplayName, StringComparison.OrdinalIgnoreCase)))
            throw new DomainException("Você só pode acessar suas próprias indicações.", 403);
        if (item.Module == "referrals" && deleting && !CanSuperviseReferrals(actor))
        {
            try
            {
                if (JsonNode.Parse(item.Description) is JsonObject detail && detail["phase"]?.ToString() == "tracking") return;
            }
            catch (JsonException) { }
            throw new DomainException("Uma indicação enviada para conferência só pode ser excluída pela supervisão.", 403);
        }
        if (item.Module == "diary" && !string.Equals(item.CreatedBy, actor.Email, StringComparison.OrdinalIgnoreCase))
            throw new DomainException("Você só pode alterar atividades pessoais criadas por você.", 403);
        if (item.Module == "reminders" && !actor.HasPermission("reminders", "manage") &&
            !string.Equals(item.CreatedBy, actor.Email, StringComparison.OrdinalIgnoreCase) &&
            (deleting || !string.Equals(item.CustomerName, actor.Email, StringComparison.OrdinalIgnoreCase)))
            throw new DomainException("Você não possui acesso para alterar este lembrete.", 403);
    }

    private static bool CanSuperviseReferrals(ActorContext actor) =>
        actor.HasPermission("referrals", "manage") || actor.HasPermission("referrals", "approve");

    private static CreateWorkItemCommand PrepareOwnReferral(CreateWorkItemCommand command, ActorContext actor)
    {
        if (!string.IsNullOrWhiteSpace(command.Owner) && !string.Equals(command.Owner.Trim(), actor.DisplayName, StringComparison.OrdinalIgnoreCase))
            throw new DomainException("Você só pode cadastrar indicações em seu próprio nome.", 403);
        try
        {
            if (JsonNode.Parse(command.Description ?? "{}") is not JsonObject detail || detail["kind"]?.ToString() != "referral" ||
                detail["phase"]?.ToString() != "tracking" || command.AmountCents != 0)
                throw new DomainException("Uma nova indicação deve iniciar em acompanhamento, sem comissão aprovada.", 403);
            detail["senderName"] = actor.DisplayName;
            detail["senderDepartment"] = actor.Department;
            detail["commissionCents"] = 0;
            detail["reviewer"] = "";
            detail["decisionAt"] = "";
            detail["decisionReason"] = "";
            return command with { Owner = actor.DisplayName, Team = actor.Department, Status = "Em acompanhamento", Description = detail.ToJsonString() };
        }
        catch (JsonException) { throw new DomainException("Informe os dados da indicação."); }
    }

    private static void RequireReferralUpdate(WorkItem item, UpdateWorkItemCommand command, ActorContext actor)
    {
        if (item.Module != "referrals" || CanSuperviseReferrals(actor)) return;
        try
        {
            if (JsonNode.Parse(item.Description) is JsonObject before && JsonNode.Parse(command.Description ?? "{}") is JsonObject after &&
                before["kind"]?.ToString() == "referral" && after["kind"]?.ToString() == "referral" &&
                before["phase"]?.ToString() == "tracking" && (after["phase"]?.ToString() is "tracking" or "conference") &&
                (string.IsNullOrWhiteSpace(command.Owner) || string.Equals(item.Owner, command.Owner.Trim(), StringComparison.OrdinalIgnoreCase)) &&
                new[] { "senderName", "senderDepartment", "reviewer", "decisionAt", "decisionReason" }
                    .All(field => JsonNode.DeepEquals(before[field], after[field]))) return;
        }
        catch (JsonException) { }
        throw new DomainException("A conferência, aprovação e alteração do responsável exigem supervisão de Indicações.", 403);
    }

    private static bool CommissionBelongsTo(string description, string owner, ActorContext actor, Guid? userId)
    {
        try
        {
            using var json = JsonDocument.Parse(description);
            if (json.RootElement.ValueKind == JsonValueKind.Object && json.RootElement.TryGetProperty("employeeId", out var employee) &&
                employee.ValueKind == JsonValueKind.String && Guid.TryParse(employee.GetString(), out var employeeId))
                return userId.HasValue && employeeId == userId;
        }
        catch (JsonException) { }
        return string.Equals(owner, actor.DisplayName, StringComparison.OrdinalIgnoreCase);
    }

    private async Task RequireCommissionScopeAsync(WorkItem item, ActorContext actor, bool deleting, CancellationToken cancellationToken)
    {
        if (item.Module != "commissions" || actor.HasPermission("commissions", "approve") || actor.HasPermission("commissions", "manage")) return;
        var userId = await db.Users.AsNoTracking().Where(user => user.Email == actor.Email).Select(user => (Guid?)user.Id).SingleOrDefaultAsync(cancellationToken);
        if (deleting || !CommissionBelongsTo(item.Description, item.Owner, actor, userId))
            throw new DomainException("Você só pode registrar ciência nas suas próprias comissões.", 403);
    }

    private static bool TryReadRecruitmentProcessId(string? description, out Guid processId)
    {
        processId = Guid.Empty;
        if (string.IsNullOrWhiteSpace(description)) return false;
        try
        {
            using var document = JsonDocument.Parse(description);
            return document.RootElement.TryGetProperty("processId", out var property) &&
                   Guid.TryParse(property.GetString(), out processId) && processId != Guid.Empty;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static bool TryReadJourneyIdentity(string? description, out string kind, out string clientId, out string track)
    {
        kind = "";
        clientId = "";
        track = "";
        if (string.IsNullOrWhiteSpace(description)) return false;
        try
        {
            using var document = JsonDocument.Parse(description);
            var root = document.RootElement;
            if (!root.TryGetProperty("kind", out var kindProperty)) return false;
            kind = kindProperty.GetString() ?? "";
            clientId = root.TryGetProperty("clientId", out var clientProperty) ? clientProperty.GetString() ?? "" : "";
            track = root.TryGetProperty("track", out var trackProperty) ? trackProperty.GetString() ?? "" : "";
            return !string.IsNullOrWhiteSpace(kind);
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static bool CanEditCustomerEngagement(WorkItem item, ActorContext actor)
    {
        if (!string.Equals(item.Module, "customers", StringComparison.OrdinalIgnoreCase) ||
            item.RecordType is not ("Alerta do cliente" or "Checklist vinculado"))
            return false;
        try
        {
            using var document = JsonDocument.Parse(item.Description);
            var root = document.RootElement;
            var sourceModule = root.TryGetProperty("sourceModule", out var source) ? source.GetString() : null;
            return !string.IsNullOrWhiteSpace(sourceModule) && actor.HasPermission(sourceModule, "edit");
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static bool CanRestartRetentionJourney(WorkItem item, string? description, ActorContext actor)
    {
        if (!string.Equals(item.Module, "cs", StringComparison.OrdinalIgnoreCase) || !actor.HasPermission("commercial", "edit") || string.IsNullOrWhiteSpace(description))
            return false;
        try
        {
            using var document = JsonDocument.Parse(description);
            var root = document.RootElement;
            return root.TryGetProperty("kind", out var kind) && kind.GetString() == "csJourney"
                && root.TryGetProperty("track", out var track) && track.GetString() == "retention"
                && root.TryGetProperty("status", out var status) && status.GetString() == "Retomado pelo CRM Retenção";
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static bool CanCoordinateCustomerSuccessJourney(WorkItem item, ActorContext actor)
    {
        if (!string.Equals(item.Module, "cs", StringComparison.OrdinalIgnoreCase) ||
            !actor.HasPermission("cs", "approve"))
            return false;
        return TryReadJourneyIdentity(item.Description, out var kind, out _, out _) &&
               string.Equals(kind, "csJourney", StringComparison.OrdinalIgnoreCase);
    }

    public async Task CompleteHrVacationPeriodAsync(Guid id, int entitlementYear, long version, string? observation, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("hr", "edit");
        var item = await db.WorkItems.SingleOrDefaultAsync(x => x.Id == id && x.Module == "hr", cancellationToken)
            ?? throw new DomainException("Colaborador não encontrado na Gestão RH.", 404);
        if (item.Version != version) throw new DomainException("O histórico foi alterado. Atualize a ficha antes de finalizar o período.", 409);
        if (item.Status != "Ativos") throw new DomainException("A conclusão de férias está disponível para colaboradores ativos.");
        JsonObject profile;
        try { profile = JsonNode.Parse(item.Description) as JsonObject ?? throw new JsonException(); }
        catch (JsonException) { throw new DomainException("O cadastro de RH possui um histórico inválido."); }
        var at = DateTimeOffset.UtcNow;
        var localToday = DateOnly.FromDateTime(at.ToOffset(TimeSpan.FromHours(-3)).DateTime);
        if (profile["kind"]?.ToString() != "hrEmployee" || !DateOnly.TryParse(profile["startedAt"]?.ToString(), out var started))
            throw new DomainException("Informe a data de admissão do colaborador.");
        if (entitlementYear < 1 || entitlementYear > localToday.Year - started.Year || started.AddYears(entitlementYear) > localToday)
            throw new DomainException("Selecione um período aquisitivo já completado pelo colaborador.");
        if ((observation?.Length ?? 0) > 2000) throw new DomainException("A observação deve ter até 2.000 caracteres.");
        var vacations = profile["vacations"] as JsonArray ?? new JsonArray();
        profile["vacations"] = vacations.Parent is null ? vacations : vacations.DeepClone();
        vacations = (JsonArray)profile["vacations"]!;
        foreach (var entry in vacations.OfType<JsonObject>())
            if (entry["entitlementYear"]?.ToString() == entitlementYear.ToString() && entry["status"]?.ToString() == "Planejada" && DateOnly.TryParse(entry["endDate"]?.ToString(), out var end) && end < localToday)
            { entry["status"] = "Concluída"; entry["updatedAt"] = at.ToString("O"); }
        var completed = vacations.OfType<JsonObject>().Where(entry => entry["entitlementYear"]?.ToString() == entitlementYear.ToString()
            && entry["status"]?.ToString() == "Concluída").Sum(entry => int.TryParse(entry["days"]?.ToString(), out var days) ? days : 0);
        if (completed >= 30) throw new DomainException("Este período aquisitivo já está concluído.", 409);
        var remaining = 30 - Math.Max(0, completed);
        var entryId = Guid.NewGuid();
        vacations.Add(new JsonObject { ["id"] = entryId.ToString(), ["entitlementYear"] = entitlementYear, ["startDate"] = "", ["endDate"] = "",
            ["days"] = remaining, ["status"] = "Concluída", ["manualCompletion"] = true, ["observation"] = observation?.Trim() ?? "",
            ["createdAt"] = at.ToString("O"), ["updatedAt"] = at.ToString("O"), ["author"] = actor.DisplayName, ["authorEmail"] = actor.Email });
        item.Description = profile.ToJsonString(); item.UpdatedAt = at; item.Version++;
        db.Activities.Add(new Activity { EntityType = "work_item", EntityId = item.Id, Module = "hr", Kind = "Período de férias finalizado",
            Summary = $"{entitlementYear}º período aquisitivo finalizado manualmente, sem datas: {remaining} dia(s) de saldo.", Actor = actor.Email });
        AddAudit(actor, "CompleteVacationPeriod", "work_item", item.Id.ToString(), "hr", new { entitlementYear, remainingDays = remaining, entryId, manualCompletion = true });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task UpdateWorkItemAsync(
        UpdateWorkItemCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default)
    {
        // Serialize dispatches across API instances so two coordinators cannot
        // consume the same suggestion concurrently. Other edits stay independent.
        var dispatch = CsDistributionService.IsDispatch(command);
        if (dispatch && db.Database.ProviderName?.Contains("Npgsql") == true)
        {
            var attempt = 0;
            await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
            {
                if (attempt++ > 0) db.ChangeTracker.Clear();
                await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
                await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(74219, 1)", cancellationToken);
                await UpdateWorkItemCoreAsync(command, actor, cancellationToken);
                await transaction.CommitAsync(cancellationToken);
            });
            return;
        }
        await UpdateWorkItemCoreAsync(command, actor, cancellationToken);
    }

    private async Task UpdateWorkItemCoreAsync(UpdateWorkItemCommand command, ActorContext actor, CancellationToken cancellationToken)
    {
        var item = await db.WorkItems.SingleOrDefaultAsync(entry => entry.Id == command.Id, cancellationToken)
            ?? throw new DomainException("Registro não encontrado.", 404);
        if (!CanEditCustomerEngagement(item, actor) &&
            !CanRestartRetentionJourney(item, command.Description, actor) &&
            !CanCoordinateCustomerSuccessJourney(item, actor))
            actor.RequirePermission(item.Module, "edit");
        RequirePersonalRecordScope(item, actor);
        RequireReferralUpdate(item, command, actor);
        await RequireCommissionScopeAsync(item, actor, false, cancellationToken);
        if (item.Module == "reminders" && !actor.HasPermission("reminders", "manage") &&
            !string.Equals(item.CreatedBy, actor.Email, StringComparison.OrdinalIgnoreCase) &&
            !ChangesOnlyDescriptionFields(item, command, "nextAlertAt", "snoozeCount", "seenAt", "seenBy", "confirmedAt", "confirmedBy"))
            throw new DomainException("O destinatário só pode adiar ou confirmar o lembrete recebido.", 403);
        if (item.Module == "commissions" && !actor.HasPermission("commissions", "approve") && !actor.HasPermission("commissions", "manage"))
            throw new DomainException("A concordância deve ser registrada pelo link do relatório mensal.", 403);
        if (item.Version != command.Version)
            throw new DomainException("O registro foi alterado por outro usuário. Atualize a tela e tente novamente.", 409);
        if (string.IsNullOrWhiteSpace(command.Title))
            throw new DomainException("Informe o título do registro.");

        CsDistributionService.Assignment? distribution = null;
        if (command.ResponsibleUserId.HasValue)
        {
            if (item.Module != "cs" || !TryReadJourneyIdentity(item.Description, out var kind, out _, out _) || kind != "csJourney" ||
                !TryReadJourneyIdentity(command.Description, out var nextKind, out _, out _) || nextKind != "csJourney")
                throw new DomainException("O encaminhamento exige um acompanhamento de CS válido.");
            using var previousJourney = JsonDocument.Parse(item.Description);
            using var nextJourney = JsonDocument.Parse(command.Description ?? "{}");
            if (previousJourney.RootElement.TryGetProperty("phase", out var previousPhase) && previousPhase.GetString() == "validation" &&
                nextJourney.RootElement.TryGetProperty("phase", out var nextPhase) && nextPhase.GetString() == "onboarding" &&
                (!previousJourney.RootElement.TryGetProperty("checkedAt", out var checkedAt) || string.IsNullOrWhiteSpace(checkedAt.GetString())))
                throw new DomainException("Confira os dados comerciais antes de encaminhar para onboarding.", 409);
            distribution = await new CsDistributionService(db).PrepareAsync(item, command, actor, cancellationToken);
            var owner = await new AgendaService(db).PrepareJourneyAssignmentAsync(item, command.ResponsibleUserId.Value, actor, cancellationToken);
            command = command with { Owner = owner };
        }

        if (item.Module == "cs")
            command = command with { Description = CsDistributionService.PreserveMetadata(item.Description, command.Description, distribution) };
        if (distribution is not null) AddAudit(actor, CsDistributionService.AuditAction, "work_item", item.Id.ToString(), "cs", distribution);

        if (!string.IsNullOrWhiteSpace(command.Owner) && !string.Equals(item.Owner, command.Owner.Trim(), StringComparison.OrdinalIgnoreCase))
            db.Activities.Add(new Activity { EntityType = "work_item", EntityId = item.Id, Module = item.Module,
                Kind = "Responsável alterado", Summary = command.Owner.Trim(), Actor = actor.DisplayName });
        var commissionDecisionData = await CommissionDecisionPolicy.PrepareAsync(db, item.Module, command.Description, item.Description, command.AmountCents, actor, cancellationToken, item.CreatedBy);
        command = command with { Description = commissionDecisionData.Description, AmountCents = commissionDecisionData.Amount };
        await CommissionConfirmationService.InvalidatePendingAsync(db, item, cancellationToken);
        item.Title = command.Title.Trim();
        item.Owner = string.IsNullOrWhiteSpace(command.Owner) ? item.Owner : command.Owner.Trim();
        item.AmountCents = Math.Max(0, command.AmountCents);
        item.Description = command.Description?.Trim() ?? "";
        if (item.Module == "commissions" && CommissionConfirmationService.Text(CommissionConfirmationService.Detail(item.Description), "decision") is "approved" or "rejected")
            item.Status = CommissionConfirmationService.Text(CommissionConfirmationService.Detail(item.Description), "decision") == "approved" ? "Aprovada" : "Reprovada";
        if (item.Module == "cs" && CustomerSuccessJourneyStatus(item.Description) is { } journeyStatus)
            item.Status = journeyStatus;
        if (item.Module == "commercial" && !string.IsNullOrWhiteSpace(command.RecordType))
        {
            var recordType = command.RecordType.Trim();
            if (recordType is not ("Lead de qualifica\u00e7\u00e3o" or "Lead comercial" or "Lead de reten\u00e7\u00e3o"))
                throw new DomainException("Tipo de lead inv\u00e1lido.");
            item.RecordType = recordType;
        }
        if (item.Module == "commercial" && command.CustomerName is not null)
            item.CustomerName = command.CustomerName.Trim();
        item.UpdatedAt = DateTimeOffset.UtcNow;
        item.Version++;
        db.Activities.Add(new Activity
        {
            EntityType = "work_item",
            EntityId = item.Id,
            Module = item.Module,
            Kind = "Atualizado",
            Summary = $"{item.RecordType} atualizado: {item.Title}",
            Actor = actor.DisplayName,
        });
        AddAudit(actor, "Update", "work_item", item.Id.ToString(), item.Module, new { item.RecordType, item.Title });
        await db.SaveChangesAsync(cancellationToken);
    }

    private static string? CustomerSuccessJourneyStatus(string description)
    {
        try
        {
            using var json = JsonDocument.Parse(description);
            var root = json.RootElement;
            if (!root.TryGetProperty("kind", out var kind) || kind.GetString() != "csJourney"
                || !root.TryGetProperty("phase", out var phase)) return null;
            return phase.GetString() switch
            {
                "validation" => "Pendente",
                "onboarding" => "Onboarding",
                "tracking" => "Em acompanhamento",
                "conference" => "Conferência",
                "finished" => "Finalizado",
                "unsuccessful" => "Finalizado por falta de retorno",
                "cancelled" => "Cancelado",
                "cancelledWithoutTraining" => "Cancelado sem treinamento",
                _ => null,
            };
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException) { return null; }
    }

    public async Task DeleteWorkItemAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default)
    {
        var item = await db.WorkItems.SingleOrDefaultAsync(entry => entry.Id == id, cancellationToken)
            ?? throw new DomainException("Registro não encontrado.", 404);
        if (!CanEditCustomerEngagement(item, actor)) actor.RequirePermission(item.Module, "edit");
        RequirePersonalRecordScope(item, actor, deleting: true);
        await RequireCommissionScopeAsync(item, actor, true, cancellationToken);
        if (await db.LiaFormRequests.AnyAsync(entry => entry.WorkItemId == id, cancellationToken))
            throw new DomainException("Este acompanhamento possui formulários vinculados e não pode ser excluído. Preserve-o no histórico de concluídos.", 409);
        await CommissionConfirmationService.InvalidatePendingAsync(db, item, cancellationToken);
        db.WorkItems.Remove(item);
        db.Activities.Add(new Activity
        {
            EntityType = "work_item",
            EntityId = item.Id,
            Module = item.Module,
            Kind = "Excluído",
            Summary = $"{item.RecordType} excluído: {item.Title}",
            Actor = actor.DisplayName,
        });
        AddAudit(actor, "Delete", "work_item", item.Id.ToString(), item.Module, new { item.RecordType, item.Title });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task TransitionWorkItemAsync(
        TransitionWorkItemCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default)
    {
        var item = await db.WorkItems.SingleOrDefaultAsync(x => x.Id == command.Id, cancellationToken)
            ?? throw new DomainException("Registro não encontrado.", 404);
        actor.RequirePermission(item.Module, "edit");
        RequirePersonalRecordScope(item, actor);
        if (item.Module == "referrals" && !CanSuperviseReferrals(actor))
            throw new DomainException("Use o envio da sua indicação para conferência; decisões exigem supervisão.", 403);
        if (item.Module == "commissions" && !actor.HasPermission("commissions", "approve") && !actor.HasPermission("commissions", "manage"))
            throw new DomainException("A decisão de comissão exige permissão de aprovação.", 403);
        if (item.Module == "reminders")
            throw new DomainException("Use a ação específica de confirmação ou decisão deste registro.", 409);

        if (item.Module == "diary" && !string.Equals(item.CreatedBy, actor.Email, StringComparison.OrdinalIgnoreCase))
            throw new DomainException("Você só pode atualizar atividades manuais criadas por você.", 403);

        if (item.Version != command.Version)
            throw new DomainException("O registro foi alterado por outro usuário. Atualize a tela e tente novamente.", 409);

        var diaryStatuses = new[] { "Pendente", "Em andamento", "Concluída", "Cancelada" };
        if (item.Module == "diary" && !diaryStatuses.Contains(command.NextStatus, StringComparer.OrdinalIgnoreCase))
            throw new DomainException("Status inválido para a atividade manual.");
        var isApprovalStatus = command.NextStatus.Contains("aguardando aprova", StringComparison.OrdinalIgnoreCase);
        var isFinalStatus = command.NextStatus.Contains("conclu", StringComparison.OrdinalIgnoreCase) ||
                            command.NextStatus.Contains("resolvid", StringComparison.OrdinalIgnoreCase);
        var involvesConfiguredLiaStage = item.Module == "lia" && await db.CustomerCatalogOptions.AsNoTracking().AnyAsync(
            entry => entry.Catalog == "liaWorkflowStage" && entry.Active && (entry.Name == command.NextStatus || entry.Name == item.Status),
            cancellationToken);
        if (!command.BoardMove && item.Module != "diary" && item.Module != "admin" && !isApprovalStatus && !isFinalStatus && !involvesConfiguredLiaStage &&
            !WorkflowPolicy.CanTransition(item.Module, item.Status, command.NextStatus))
            throw new DomainException($"Não é permitido mover {item.Status} para {command.NextStatus}.", 409);

        if (command.BoardMove && string.IsNullOrWhiteSpace(command.NextStatus))
            throw new DomainException("Selecione uma etapa válida para mover o card.");

        if (item.Module == "commercial" && command.NextStatus == "Ganho" &&
            (item.CustomerId is null || item.AmountCents <= 0))
            throw new DomainException("Para marcar como ganho, vincule cliente e informe valor.", 409);

        if (WorkflowPolicy.RequiresExplicitConfirmation(item.Module, command.NextStatus) && !command.Confirmed)
            throw new DomainException("Esta ação sensível exige confirmação explícita e evidência registrada.", 409);

        var previous = item.Status;
        item.Status = command.NextStatus;
        item.UpdatedAt = DateTimeOffset.UtcNow;
        item.Version++;

        db.Activities.Add(new Activity
        {
            EntityType = "work_item",
            EntityId = item.Id,
            Module = item.Module,
            Kind = "Status alterado",
            Summary = $"{previous} → {item.Status}",
            Actor = actor.DisplayName,
        });
        AddAudit(actor, "Transition", "work_item", item.Id.ToString(), item.Module, new { From = previous, To = item.Status });

        var routesToCancellation = item.Module != "cancellations"
            && command.NextStatus.Contains("cancel", StringComparison.OrdinalIgnoreCase)
            && item.Module is "commercial" or "cs" or "lia" or "support";
        if (routesToCancellation && !await db.WorkItems.AnyAsync(
                entry => entry.Module == "cancellations" && entry.OriginId == item.Id,
                cancellationToken))
        {
            var requestedAt = DateTimeOffset.UtcNow;
            var clientId = item.CustomerId?.ToString() ?? item.Id.ToString("N")[..8];
            try
            {
                using var source = JsonDocument.Parse(item.Description);
                if (source.RootElement.TryGetProperty("clientId", out var sourceClientId) &&
                    !string.IsNullOrWhiteSpace(sourceClientId.GetString()))
                    clientId = sourceClientId.GetString()!;
            }
            catch (JsonException) { }

            var cancellation = new WorkItem
            {
                Module = "cancellations",
                RecordType = "Solicitação de cancelamento",
                Title = string.IsNullOrWhiteSpace(item.CustomerName) ? item.Title : item.CustomerName,
                CustomerId = item.CustomerId,
                CustomerName = item.CustomerName,
                Owner = string.IsNullOrWhiteSpace(item.Owner) ? actor.DisplayName : item.Owner,
                Team = "Reversão de cancelamentos",
                Status = "Fila de espera",
                Priority = "P1",
                AmountCents = item.AmountCents,
                OriginType = item.Module,
                OriginId = item.Id,
                CreatedBy = actor.Email,
                Description = JsonSerializer.Serialize(new
                {
                    kind = "cancellationJourney",
                    requestDate = requestedAt.ToString("yyyy-MM-dd"),
                    requestMonth = requestedAt.ToString("yyyy-MM"),
                    clientId,
                    customerName = string.IsNullOrWhiteSpace(item.CustomerName) ? item.Title : item.CustomerName,
                    adhesionDate = "",
                    stayRange = "",
                    plan = "",
                    monthlyValueCents = item.AmountCents,
                    seller = item.Module == "commercial" ? item.Owner : "",
                    csOwner = item.Owner,
                    reason = $"Cancelamento sinalizado em {item.RecordType}",
                    notes = $"Solicitação gerada automaticamente ao mover o registro para {command.NextStatus}.",
                    sourceModule = item.Module,
                    sourceItemId = item.Id.ToString(),
                    linkedCsItemId = item.Module == "cs" ? item.Id.ToString() : null,
                    history = new[] { new { id = Guid.NewGuid().ToString(), text = $"Cancelamento registrado a partir de {item.Module}.", at = requestedAt, author = actor.DisplayName } },
                }),
            };
            db.WorkItems.Add(cancellation);
            db.Activities.Add(new Activity
            {
                EntityType = "work_item",
                EntityId = cancellation.Id,
                Module = "cancellations",
                Kind = "Criado automaticamente",
                Summary = $"Solicitação de cancelamento criada para {cancellation.Title}",
                Actor = actor.DisplayName,
            });
            AddAudit(actor, "Create", "work_item", cancellation.Id.ToString(), "cancellations", new { SourceModule = item.Module, SourceId = item.Id });
        }
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<Guid> CreateAppointmentAsync(
        CreateAppointmentCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("work", "create");
        if (string.IsNullOrWhiteSpace(command.Title) || command.EndsAt <= command.StartsAt)
            throw new DomainException("Informe título, início e término válidos.");

        IDbContextTransaction? transaction = null;
        if (db.Database.IsRelational())
            transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);

        try
        {
            var conflict = await db.Appointments.AnyAsync(
                x => x.Owner == command.Owner &&
                     x.Status != "Cancelado" &&
                     x.StartsAt < command.EndsAt &&
                     x.EndsAt > command.StartsAt,
                cancellationToken);

            if (conflict)
                throw new DomainException("O responsável já possui uma reserva neste horário.", 409);

            var appointment = new Appointment
            {
                Title = command.Title.Trim(),
                Kind = string.IsNullOrWhiteSpace(command.Kind) ? "Compromisso" : command.Kind.Trim(),
                CustomerId = command.CustomerId,
                CustomerName = command.CustomerName?.Trim() ?? "",
                Owner = command.Owner.Trim(),
                Team = string.IsNullOrWhiteSpace(command.Team) ? "CS" : command.Team.Trim(),
                StartsAt = command.StartsAt,
                EndsAt = command.EndsAt,
                MeetingUrl = command.MeetingUrl?.Trim() ?? "",
                CreatedBy = actor.Email,
            };

            db.Appointments.Add(appointment);
            AddAudit(actor, "Create", "appointment", appointment.Id.ToString(), "work", new { appointment.StartsAt, appointment.Owner });
            await db.SaveChangesAsync(cancellationToken);
            if (transaction is not null)
                await transaction.CommitAsync(cancellationToken);
            return appointment.Id;
        }
        finally
        {
            if (transaction is not null)
                await transaction.DisposeAsync();
        }
    }

    public async Task DecideApprovalAsync(
        DecideApprovalCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("approvals", "approve");
        var approval = await db.Approvals.SingleOrDefaultAsync(x => x.Id == command.Id, cancellationToken)
            ?? throw new DomainException("Solicitação de aprovação não encontrada.", 404);

        if (string.Equals(approval.Requester, actor.Email, StringComparison.OrdinalIgnoreCase))
            throw new DomainException("O solicitante não pode aprovar a própria solicitação.", 403);

        if (command.Decision is not ("Aprovado" or "Reprovado" or "Solicitar ajustes"))
            throw new DomainException("Escolha uma decisão permitida.");

        if (command.Decision != "Aprovado" && string.IsNullOrWhiteSpace(command.Justification))
            throw new DomainException("Reprovação ou ajuste exige justificativa.");

        approval.Status = command.Decision;
        approval.Justification = command.Justification?.Trim() ?? "";
        approval.DecidedBy = actor.Email;
        approval.DecidedAt = DateTimeOffset.UtcNow;
        approval.UpdatedAt = DateTimeOffset.UtcNow;
        approval.Version++;
        AddAudit(actor, "Approve", "approval", approval.Id.ToString(), "approvals", new { Decision = command.Decision });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task SeedDemoAsync(ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("admin", "manage");
        if (await db.Customers.AnyAsync(cancellationToken))
            throw new DomainException("A demonstração só pode ser carregada em uma base vazia.", 409);

        var customers = new[]
        {
            NewCustomer("Sorriso Prime Odontologia Ltda.", "Sorriso Prime", "Clínica premium", 2, 1_890_000, true),
            NewCustomer("Rede Oral Mais S.A.", "Oral Mais", "Rede odontológica", 8, 4_650_000, true),
            NewCustomer("Clínica Aurora Saúde Ltda.", "Aurora Saúde", "Clínica odontológica", 1, 890_000, false),
            NewCustomer("Instituto Vida Dental Ltda.", "Vida Dental", "Implantodontia", 3, 1_520_000, false),
            NewCustomer("Odonto Center Participações Ltda.", "Odonto Center", "Rede regional", 5, 2_380_000, true),
        };

        Customer NewCustomer(string legal, string trade, string segment, int clinics, long revenue, bool strategic) =>
            new()
            {
                LegalName = legal,
                TradeName = trade,
                Segment = segment,
                ClinicsCount = clinics,
                MonthlyRevenueCents = revenue,
                Strategic = strategic,
                Owner = "Marina Costa",
                CsOwner = "Beatriz Lima",
                CreatedBy = actor.Email,
            };

        await db.Customers.AddRangeAsync(customers, cancellationToken);
        var now = DateTimeOffset.UtcNow;

        var samples = new (string Module, string Type, string Title, int Customer, string Status, string Priority, long Amount)[]
        {
            ("commercial", "Oportunidade", "Expansão plano Performance", 0, "Negociacao", "P1", 3_200_000),
            ("cs", "Onboarding", "Onboarding de 90 dias", 2, "EmAcompanhamento", "P2", 0),
            ("lia", "Projeto LIA", "LIA Performance + CRC", 1, "EmTesteCliente", "P1", 0),
            ("support", "Ticket", "Falha na emissão de nota fiscal", 3, "EmAtendimento", "P1", 0),
            ("ti", "Bug", "Duplicidade no retorno bancário", 4, "EmTriagem", "P0", 0),
            ("finance", "Conta a pagar", "Cloudia — competência julho", 0, "PendenteAprovacao", "P2", 485_000),
            ("procurement", "Compra", "Novos notebooks para CS", 1, "EmCotacao", "P3", 1_875_000),
            ("work", "Tarefa", "Revisar clientes com baixa utilização", 2, "Em andamento", "P2", 0),
        };

        foreach (var sample in samples)
        {
            var customer = customers[sample.Customer];
            db.WorkItems.Add(new WorkItem
            {
                Module = sample.Module,
                RecordType = sample.Type,
                Title = sample.Title,
                CustomerId = customer.Id,
                CustomerName = customer.TradeName,
                Owner = sample.Module == "ti" ? "Rafael Torres" : "Beatriz Lima",
                Team = sample.Module.ToUpperInvariant(),
                Status = sample.Status,
                Priority = sample.Priority,
                DueAt = now.AddDays(3),
                SlaDueAt = now.AddHours(8),
                AmountCents = sample.Amount,
                Description = "Registro de demonstração carregado de forma explícita pelo administrador.",
                CreatedBy = actor.Email,
            });
        }

        db.Approvals.Add(new Approval
        {
            Kind = "Compra",
            SourceId = Guid.NewGuid(),
            SourceTitle = "Novos notebooks para CS",
            Requester = "financeiro@dontus.local",
            ApproverRole = "Aprovador Financeiro Especial",
            AmountCents = 1_875_000,
        });

        var start = new DateTimeOffset(now.Year, now.Month, now.Day, 9, 0, 0, TimeSpan.Zero).AddDays(1);
        db.Appointments.Add(new Appointment
        {
            Title = "Treinamento inicial Dontus",
            Kind = "Treinamento",
            CustomerId = customers[2].Id,
            CustomerName = customers[2].TradeName,
            Owner = "Beatriz Lima",
            Team = "CS",
            StartsAt = start,
            EndsAt = start.AddMinutes(90),
            CreatedBy = actor.Email,
        });

        AddAudit(actor, "Seed", "workspace", "demo", "admin", new { Customers = customers.Length, Records = samples.Length });
        await db.SaveChangesAsync(cancellationToken);
    }

    private static string DiaryStatusColor(string status) => status.ToLowerInvariant() switch
    {
        var value when value.Contains("concl") || value.Contains("final") => "#16a36a",
        var value when value.Contains("cancel") => "#dc3c4d",
        var value when value.Contains("andamento") => "#1682e6",
        _ => "#e39b17",
    };

    private static readonly string[] NoteColors =
    [
        "#7c3aed", "#2563eb", "#0f9bb2", "#168b57", "#c98613",
        "#c1444d", "#a83b86", "#5b5bd6", "#64748b",
    ];

    private sealed record NoteMetadata(string Color);

    private static string NormalizeNoteColor(string? color)
    {
        if (color is not { Length: 7 } || color[0] != '#' || !color[1..].All(Uri.IsHexDigit))
            return NoteColors[0];
        return color.ToLowerInvariant();
    }

    private static string SerializeNoteColor(string color) => JsonSerializer.Serialize(new NoteMetadata(color));

    private static string ReadNoteColor(string? metadata)
    {
        try
        {
            return NormalizeNoteColor(JsonSerializer.Deserialize<NoteMetadata>(metadata ?? "")?.Color);
        }
        catch (JsonException)
        {
            return NoteColors[0];
        }
    }

    private static void EnsureOwnedNote(WorkItem note, ActorContext actor)
    {
        if (note.Module != "notes" || !string.Equals(note.CreatedBy, actor.Email, StringComparison.OrdinalIgnoreCase))
            throw new DomainException("Você só pode alterar suas próprias anotações.", 403);
    }

    private void AddAudit(
        ActorContext actor,
        string action,
        string resource,
        string resourceId,
        string module,
        object details) =>
        db.AuditEvents.Add(new AuditEvent
        {
            ActorEmail = actor.Email,
            Action = action,
            Resource = resource,
            ResourceId = resourceId,
            Module = module,
            DetailsJson = JsonSerializer.Serialize(details),
        });
}
