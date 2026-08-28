using System.Data;
using System.Text.Json;
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
        ("V-014", "Integração Dontus", "Alto", "Adaptador desativado; evidência manual"),
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
            .ToArray();

        var customerEntities = actor.HasPermission("customers", "view")
            ? await db.Customers.AsNoTracking()
            .OrderByDescending(x => x.UpdatedAt)
            .Take(100)
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
            x.Owner, x.CsOwner, x.SupportOwner, x.Strategic ? 1 : 0, x.ClinicsCount,
            x.MonthlyRevenueCents, x.Project, x.ProductVersion, x.DueDay, x.Server,
            x.PaymentMethod, x.InvoiceCompany, x.GraceDays, x.DueDays, x.Subscription,
            x.Email, x.Phone, x.Website, x.Notes, x.Address, x.City, x.State, x.CreatedAt,
            openCustomerTasks.Where(task => task.CustomerId == x.Id).Select(task => task.Protocol).ToList()))
            .ToList();

        var items = await db.WorkItems.AsNoTracking()
            .Where(x => visibleModules.Contains(x.Module))
            .OrderByDescending(x => x.UpdatedAt)
            .Take(250)
            .Select(x => new WorkItemDto(
                x.Id, x.Module, x.RecordType, x.Title, x.CustomerId, x.CustomerName,
                x.Owner, x.Team, x.Status, x.Priority, x.DueAt, x.SlaDueAt,
                x.AmountCents, x.Description, x.Version, x.UpdatedAt, x.CreatedAt))
            .ToListAsync(cancellationToken);

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
            .Select(user => new { user.PhotoDataUrl, user.JobTitle, user.IsCoordinator })
            .SingleOrDefaultAsync(cancellationToken);

        return new OperationsSnapshot(
            new UserDto(actor.Email, actor.DisplayName, actor.Role, actor.Department,
                currentUserProfile?.PhotoDataUrl ?? "", currentUserProfile?.JobTitle ?? "",
                currentUserProfile?.IsCoordinator ?? false, actor.Permissions ?? []),
            customers, items, appointments, approvals, decisions, audit, moduleCounts);
    }

    public async Task<DiaryModuleDto> GetDiaryModuleAsync(ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("diary", "view");
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(entry => entry.Email == actor.Email, cancellationToken)
            ?? throw new DomainException("Usuário autenticado não encontrado.", 403);
        var periodStart = DateTimeOffset.UtcNow.AddDays(-31);
        var periodEnd = DateTimeOffset.UtcNow.AddDays(121);
        var agendaStatuses = await db.AgendaStatuses.AsNoTracking()
            .Where(entry => entry.Active)
            .OrderBy(entry => entry.Name)
            .ToListAsync(cancellationToken);
        var statusesById = agendaStatuses.ToDictionary(entry => entry.Id);
        // O Diário de Bordo é a visão operacional da Agenda: todo compromisso
        // do colaborador, seja como responsável ou participante, é exibido aqui.
        // Gestores mantêm a visão completa para acompanhar o time.
        var canViewAllCommitments = actor.HasPermission("work", "manage") || actor.HasPermission("agenda", "manage");
        var commitments = await db.AgendaCommitments.AsNoTracking()
            .Where(entry => (canViewAllCommitments || entry.ResponsibleUserId == user.Id || db.AgendaCommitmentParticipants.Any(participant => participant.CommitmentId == entry.Id && participant.UserId == user.Id))
                && entry.StartsAt >= periodStart && entry.StartsAt <= periodEnd)
            .OrderBy(entry => entry.StartsAt)
            .Take(500)
            .ToListAsync(cancellationToken);
        var manualActivities = await db.WorkItems.AsNoTracking()
            .Where(entry => entry.Module == "diary" && entry.CreatedBy == actor.Email && entry.CreatedAt >= periodStart && entry.CreatedAt <= periodEnd)
            .OrderBy(entry => entry.DueAt ?? entry.CreatedAt)
            .Take(500)
            .ToListAsync(cancellationToken);

        var entries = commitments.Select(entry =>
        {
            var status = statusesById.GetValueOrDefault(entry.AgendaStatusId);
            return new DiaryEntryDto(entry.Id, "agenda", entry.Title, entry.Description, "Compromisso da Agenda", entry.StartsAt,
                status?.Name ?? "Sem status", status?.Color ?? "#64748b", entry.AgendaStatusId, null);
        }).Concat(manualActivities.Select(entry => new DiaryEntryDto(
            entry.Id, "manual", entry.Title, entry.Description, entry.RecordType, entry.DueAt ?? entry.CreatedAt,
            entry.Status, DiaryStatusColor(entry.Status), null, entry.Version)))
            .OrderBy(entry => entry.OccursAt)
            .ToArray();

        return new DiaryModuleDto(
            entries,
            agendaStatuses.Select(entry => new AgendaStatusDto(entry.Id, entry.Name, entry.Description, entry.Color, entry.Active)).ToArray());
    }

    public async Task<NotesModuleDto> GetNotesModuleAsync(ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("notes", "view");
        var notes = await db.WorkItems.AsNoTracking()
            .Where(entry => entry.Module == "notes" && entry.CreatedBy == actor.Email)
            .OrderBy(entry => entry.AmountCents)
            .ThenBy(entry => entry.CreatedAt)
            .Take(500)
            .ToListAsync(cancellationToken);

        return new NotesModuleDto(notes.Select(entry => new NoteDto(
            entry.Id, entry.Title, entry.Description, ReadNoteColor(entry.TagsJson),
            (int)Math.Min(entry.AmountCents, int.MaxValue), entry.UpdatedAt)).ToArray());
    }

    public async Task<Guid> SaveNoteAsync(
        Guid? id,
        string title,
        string? content,
        string? color,
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
                Team = "Pessoal",
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
            Status = "Ativa",
            Priority = "P3",
            Owner = actor.DisplayName,
            Team = "Pessoal",
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
            query = query.Where(entry => entry.Active && entry.PublishedAt <= now
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
            var visibleToCurrentUser = entry.Active && entry.PublishedAt <= now
                && (!entry.ExpiresAt.HasValue || entry.ExpiresAt >= now)
                && (entry.Audience != "Colaborador" || entry.TargetUserId == user.Id);
            var recipients = canManage
                ? activeRecipients.Where(recipient => entry.Audience != "Colaborador" || recipient.Id == entry.TargetUserId)
                    .Select(recipient =>
                    {
                        var receipt = reads.FirstOrDefault(read => read.NoticeId == entry.Id && read.UserId == recipient.Id);
                        return new CompanyNoticeRecipientDto(
                            recipient.Id, recipient.DisplayName, recipient.PhotoDataUrl,
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
        actor.RequirePermission("admin", "manage");
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
                && entry.PublishedAt <= now && (!entry.ExpiresAt.HasValue || entry.ExpiresAt >= now)
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
                && entry.PublishedAt <= now && (!entry.ExpiresAt.HasValue || entry.ExpiresAt >= now)
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
        actor.RequirePermission("customers", "create");
        if (string.IsNullOrWhiteSpace(command.LegalName))
            throw new DomainException("Informe a razão social.");

        var customer = new Customer
        {
            LegalName = command.LegalName.Trim(),
            TradeName = string.IsNullOrWhiteSpace(command.TradeName) ? command.LegalName.Trim() : command.TradeName.Trim(),
            DocumentMasked = command.DocumentMasked?.Trim() ?? "",
            Segment = string.IsNullOrWhiteSpace(command.Segment) ? "Clínica odontológica" : command.Segment.Trim(),
            Owner = string.IsNullOrWhiteSpace(command.Owner) ? actor.DisplayName : command.Owner.Trim(),
            CsOwner = string.IsNullOrWhiteSpace(command.CsOwner) ? "Não atribuído" : command.CsOwner.Trim(),
            Strategic = command.Strategic,
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
        AddAudit(actor, "Create", "customer", customer.Id.ToString(), "customers", new { customer.TradeName });
        await db.SaveChangesAsync(cancellationToken);
        return customer.Id;
    }

    public async Task<CustomerModuleDto> GetCustomerModuleAsync(ActorContext actor, CancellationToken cancellationToken = default)
    {
        if (!actor.HasPermission("customers", "view") && !actor.HasPermission("catalogs", "view"))
            throw new DomainException("Seu acesso não permite visualizar os cadastros de clientes.", 403);
        var includeInactive = actor.HasPermission("catalogs", "manage");
        var entries = await db.CustomerCatalogOptions.AsNoTracking()
            .Where(entry => includeInactive || entry.Active)
            .OrderBy(entry => entry.Catalog).ThenBy(entry => entry.Name)
            .Select(entry => new CustomerCatalogOptionDto(entry.Id, entry.Catalog, entry.Name, entry.Description, entry.Active))
            .ToListAsync(cancellationToken);
        return new CustomerModuleDto(entries);
    }

    public async Task<Guid> SaveCustomerCatalogAsync(Guid? id, string catalog, string name, string? description, bool active, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("catalogs", "manage");
        var allowed = new[] { "commercialProduct", "acquisitionChannel", "commercialLabel", "followUpType", "lossReason", "temperature", "funnelStage", "csFunnel", "csFollowUp", "csLabel", "csTemperature", "csUsage", "csReason", "csFeature", "csStatus", "csCallStatus", "csFinalStatus", "csFeatureActive", "csFeatureBase", "csFeaturePlus", "csRejectionReason", "csApprovalReason", "enterpriseNetworkStatus", "enterpriseUnitStatus", "enterpriseUsageStatus", "enterpriseFeatureActive", "enterpriseFeatureBase", "enterpriseFeaturePlus", "recruitmentVacancy", "recruitmentStage" };
        if (!allowed.Contains(catalog, StringComparer.OrdinalIgnoreCase)) throw new DomainException("Tipo de cadastro inválido.");
        if (string.IsNullOrWhiteSpace(name)) throw new DomainException("Informe o nome do cadastro.");
        var entry = id.HasValue
            ? await db.CustomerCatalogOptions.SingleOrDefaultAsync(item => item.Id == id.Value, cancellationToken) ?? throw new DomainException("Cadastro não encontrado.", 404)
            : new CustomerCatalogOption { Catalog = catalog.Trim(), Name = name.Trim() };
        entry.Catalog = catalog.Trim(); entry.Name = name.Trim(); entry.Description = description?.Trim() ?? ""; entry.Active = active; entry.UpdatedAt = DateTimeOffset.UtcNow;
        if (!id.HasValue) db.CustomerCatalogOptions.Add(entry);
        AddAudit(actor, id.HasValue ? "Update" : "Create", "customerCatalog", entry.Id.ToString(), "catalogs", new { entry.Catalog, entry.Name, entry.Active });
        await db.SaveChangesAsync(cancellationToken); return entry.Id;
    }

    public async Task DeleteCustomerCatalogAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("catalogs", "manage");
        var entry = await db.CustomerCatalogOptions.SingleOrDefaultAsync(item => item.Id == id, cancellationToken) ?? throw new DomainException("Cadastro não encontrado.", 404);
        db.CustomerCatalogOptions.Remove(entry);
        AddAudit(actor, "Delete", "customerCatalog", entry.Id.ToString(), "catalogs", new { entry.Catalog, entry.Name });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<Guid> CreateWorkItemAsync(
        CreateWorkItemCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default)
    {
        actor.RequirePermission(command.Module, "create");
        if (string.IsNullOrWhiteSpace(command.Module) ||
            string.IsNullOrWhiteSpace(command.RecordType) ||
            string.IsNullOrWhiteSpace(command.Title))
            throw new DomainException("Módulo, tipo e título são obrigatórios.");

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
            Status = command.Module.Equals("admin", StringComparison.OrdinalIgnoreCase) &&
                     !string.IsNullOrWhiteSpace(command.Status)
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

    public async Task UpdateWorkItemAsync(
        UpdateWorkItemCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default)
    {
        var item = await db.WorkItems.SingleOrDefaultAsync(entry => entry.Id == command.Id, cancellationToken)
            ?? throw new DomainException("Registro não encontrado.", 404);
        actor.RequirePermission(item.Module, "edit");
        if (item.Version != command.Version)
            throw new DomainException("O registro foi alterado por outro usuário. Atualize a tela e tente novamente.", 409);
        if (string.IsNullOrWhiteSpace(command.Title))
            throw new DomainException("Informe o título do registro.");

        item.Title = command.Title.Trim();
        item.Owner = string.IsNullOrWhiteSpace(command.Owner) ? item.Owner : command.Owner.Trim();
        item.AmountCents = Math.Max(0, command.AmountCents);
        item.Description = command.Description?.Trim() ?? "";
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

    public async Task DeleteWorkItemAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default)
    {
        var item = await db.WorkItems.SingleOrDefaultAsync(entry => entry.Id == id, cancellationToken)
            ?? throw new DomainException("Registro não encontrado.", 404);
        actor.RequirePermission(item.Module, "edit");
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
        if (item.Module != "diary" && item.Module != "admin" && !isApprovalStatus && !isFinalStatus &&
            !WorkflowPolicy.CanTransition(item.Module, item.Status, command.NextStatus))
            throw new DomainException($"Não é permitido mover {item.Status} para {command.NextStatus}.", 409);

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
