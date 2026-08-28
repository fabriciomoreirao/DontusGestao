using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;
using TaskStatusEntity = Dontus.Operations.Domain.TaskStatus;

namespace Dontus.Operations.Infrastructure;

public sealed class TaskService(OperationsDbContext db, ITaskFileStorage? fileStorage = null) : ITaskService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly HashSet<string> BlockedAttachmentExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".ade", ".adp", ".app", ".bat", ".cmd", ".com", ".cpl", ".dll", ".exe",
        ".hta", ".htm", ".html", ".js", ".jse", ".msi", ".msp", ".ps1", ".scr",
        ".svg", ".vbe", ".vbs", ".wsf",
    };
    private const long MaximumAttachmentSizeBytes = 25 * 1024 * 1024;

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        if (await db.TaskDepartments.AnyAsync(cancellationToken))
        {
            var unassignedPriority = await db.TaskPriorities.FirstOrDefaultAsync(
                x => x.Name == "Não definida", cancellationToken);
            var repairedUnassignedPriority = false;
            if (unassignedPriority is null)
            {
                unassignedPriority = Priority("Não definida", 0, "#64748b", null);
                db.TaskPriorities.Add(unassignedPriority);
                repairedUnassignedPriority = true;
            }
            else if (!unassignedPriority.Active)
            {
                // A tarefa nasce sem classificação. Este item de sistema não pode impedir
                // o cadastro caso tenha sido bloqueado acidentalmente no catálogo.
                unassignedPriority.Active = true;
                unassignedPriority.UpdatedAt = DateTimeOffset.UtcNow;
                repairedUnassignedPriority = true;
            }
            var missingDepartments = new[]
            {
                Department("Customer Success", "Relacionamento, adoção e retenção de clientes"),
                Department("Cobrança", "Negociação e recuperação de recebíveis"),
            }.Where(candidate => !db.TaskDepartments.Any(existing => existing.Name == candidate.Name)).ToArray();
            if (missingDepartments.Length > 0)
            {
                db.TaskDepartments.AddRange(missingDepartments);
                var existingAdmin = await db.Users.FirstOrDefaultAsync(x => x.Email == "gestor@dontus.local", cancellationToken);
                if (existingAdmin is not null)
                    foreach (var department in missingDepartments)
                        db.UserDepartments.Add(new UserDepartment
                        {
                            UserId = existingAdmin.Id,
                            DepartmentId = department.Id,
                            IsCoordinator = true,
                        });
            }
            var invalidFinalStatuses = await db.TaskStatuses
                .Where(x => x.IsFinal && x.AcceptsNewTasks).ToListAsync(cancellationToken);
            foreach (var status in invalidFinalStatuses)
                status.AcceptsNewTasks = false;
            var hasApprovalStatus = await db.TaskStatuses.AnyAsync(
                x => x.Name == "Aguardando aprovação", cancellationToken);
            if (!hasApprovalStatus)
                db.TaskStatuses.Add(Status("Aguardando aprovação", 55));
            var tasksWithoutProtocol = await db.CorporateTasks
                .Where(task => task.Protocol == "").ToListAsync(cancellationToken);
            foreach (var task in tasksWithoutProtocol)
                task.Protocol = $"T{task.CreatedAt:yy}{task.Number:0000}";
            if (missingDepartments.Length > 0 || invalidFinalStatuses.Count > 0 || tasksWithoutProtocol.Count > 0 || repairedUnassignedPriority || !hasApprovalStatus)
                await db.SaveChangesAsync(cancellationToken);
            return;
        }

        var departments = new[]
        {
            Department("Suporte", "Atendimento e sustentação dos clientes"),
            Department("Desenvolvimento", "Produto, engenharia e correções"),
            Department("Financeiro", "Demandas financeiras"),
            Department("Comercial", "Relacionamento comercial"),
            Department("Implantação", "Onboarding e implantação"),
            Department("Administrativo", "Operações administrativas"),
            Department("Customer Success", "Relacionamento, adoção e retenção de clientes"),
            Department("Cobrança", "Negociação e recuperação de recebíveis"),
        };
        var priorities = new[]
        {
            Priority("Não definida", 0, "#64748b", null),
            Priority("Baixa", 10, "#64748b", 2880),
            Priority("Normal", 20, "#2563eb", 1440),
            Priority("Alta", 30, "#f59e0b", 480),
            Priority("Urgente", 40, "#ef4444", 240),
            Priority("Crítica", 50, "#a855f7", 120),
        };
        var statuses = new[]
        {
            Status("Aberta", 10, true),
            Status("Em análise", 20),
            Status("Em andamento", 30),
            Status("Aguardando cliente", 40, pause: true),
            Status("Aguardando outro setor", 50, pause: true),
            Status("Aguardando aprovação", 55),
            Status("Resolvida", 60, final: true),
            Status("Cancelada", 70, final: true, requiresJustification: true),
        };
        db.AddRange(departments);
        db.AddRange(priorities);
        db.AddRange(statuses);
        await db.SaveChangesAsync(cancellationToken);

        var support = departments[0];
        var normal = priorities[2];
        var open = statuses[0];
        var sla = new TaskSlaPolicy
        {
            Name = "Atendimento padrão",
            DepartmentId = support.Id,
            PriorityId = normal.Id,
            FirstResponseMinutes = 60,
            ServiceStartMinutes = 240,
            CompletionMinutes = 1440,
            AlertBeforeMinutes = 120,
        };
        var type = new TaskType
        {
            Name = "Solicitação de suporte",
            Description = "Dúvidas, incidentes e solicitações operacionais",
            DefaultPriorityId = null,
            InitialStatusId = open.Id,
            Active = true,
        };
        db.AddRange(sla, type);
        await db.SaveChangesAsync(cancellationToken);
        type.DefaultSlaPolicyId = null;
        sla.TaskTypeId = type.Id;
        db.TaskTypeDepartments.Add(new() { TaskTypeId = type.Id, DepartmentId = support.Id });
        foreach (var status in statuses)
            db.TaskTypeStatuses.Add(new() { TaskTypeId = type.Id, StatusId = status.Id });
        foreach (var paused in statuses.Where(x => x.Name.StartsWith("Aguardando")))
            db.TaskSlaPauseStatuses.Add(new() { SlaPolicyId = sla.Id, StatusId = paused.Id });

        var admin = await db.Users.FirstOrDefaultAsync(x => x.Email == "gestor@dontus.local", cancellationToken);
        if (admin is not null)
        {
            foreach (var department in departments)
                db.UserDepartments.Add(new()
                {
                    UserId = admin.Id,
                    DepartmentId = department.Id,
                    IsPrimary = department == support,
                    IsCoordinator = true,
                });
        }
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<TaskModuleDto> GetModuleAsync(ActorContext actor, CancellationToken cancellationToken = default)
    {
        var canViewTasks = actor.HasPermission("tasks", "view");
        if (!canViewTasks)
            actor.RequirePermission("catalogs", "view");
        var user = await GetActorUserAsync(actor, cancellationToken);
        if (canViewTasks)
            await EnsureSlaNotificationsAsync(user.Id, cancellationToken);
        var memberDepartments = await db.UserDepartments
            .Where(x => x.UserId == user.Id)
            .Select(x => x.DepartmentId)
            .ToListAsync(cancellationToken);
        var manages = actor.HasPermission("tasks", "manage");
        var viewAllDepartments = manages || actor.HasCapability("tasks", "viewOtherDepartments");
        var viewOthers = manages || actor.HasCapability("tasks", "viewOthers");
        var participantTaskIds = db.TaskParticipants.Where(x => x.UserId == user.Id).Select(x => x.TaskId);
        var tasksWithParticipants = db.TaskParticipants.Select(x => x.TaskId).Distinct();
        var coordinatedDepartments = await db.UserDepartments
            .Where(x => x.UserId == user.Id && x.IsCoordinator)
            .Select(x => x.DepartmentId)
            .ToListAsync(cancellationToken);

        var query = db.CorporateTasks.AsNoTracking();
        if (!canViewTasks)
            query = query.Where(_ => false);
        else if (!manages)
        {
            query = query.Where(x => !tasksWithParticipants.Contains(x.Id)
                || x.CreatorUserId == user.Id || x.AssigneeUserId == user.Id
                || participantTaskIds.Contains(x.Id) || coordinatedDepartments.Contains(x.CurrentDepartmentId));
            if (!viewAllDepartments)
                query = viewOthers
                    ? query.Where(x => memberDepartments.Contains(x.CurrentDepartmentId)
                        || x.CreatorUserId == user.Id || x.AssigneeUserId == user.Id || participantTaskIds.Contains(x.Id))
                    : query.Where(x => x.CreatorUserId == user.Id || x.AssigneeUserId == user.Id
                        || participantTaskIds.Contains(x.Id) || coordinatedDepartments.Contains(x.CurrentDepartmentId));
        }

        var tasks = await query.OrderByDescending(x => x.UpdatedAt).Take(1000).ToListAsync(cancellationToken);
        var taskIds = tasks.Select(x => x.Id).ToList();
        var users = await db.Users.AsNoTracking().ToDictionaryAsync(x => x.Id, cancellationToken);
        var departments = await db.TaskDepartments.AsNoTracking().OrderBy(x => x.Name).ToListAsync(cancellationToken);
        var priorities = await db.TaskPriorities.AsNoTracking().OrderByDescending(x => x.SeverityOrder).ToListAsync(cancellationToken);
        var statuses = await db.TaskStatuses.AsNoTracking().OrderBy(x => x.DisplayOrder).ToListAsync(cancellationToken);
        var types = await db.TaskTypes.AsNoTracking().OrderBy(x => x.Name).ToListAsync(cancellationToken);
        var slas = await db.TaskSlaPolicies.AsNoTracking().OrderBy(x => x.Name).ToListAsync(cancellationToken);
        var comments = await db.TaskComments.AsNoTracking()
            .Where(x => taskIds.Contains(x.TaskId)).OrderBy(x => x.CreatedAt).ToListAsync(cancellationToken);
        var history = await db.TaskHistory.AsNoTracking()
            .Where(x => taskIds.Contains(x.TaskId)).OrderByDescending(x => x.CreatedAt).ToListAsync(cancellationToken);
        var attachments = await db.TaskAttachments.AsNoTracking()
            .Where(x => taskIds.Contains(x.TaskId)).OrderBy(x => x.CreatedAt).ToListAsync(cancellationToken);
        var participants = await db.TaskParticipants.AsNoTracking()
            .Where(x => taskIds.Contains(x.TaskId)).ToListAsync(cancellationToken);
        var typeDepartments = await db.TaskTypeDepartments.AsNoTracking().ToListAsync(cancellationToken);
        var typeStatuses = await db.TaskTypeStatuses.AsNoTracking().ToListAsync(cancellationToken);
        var userDepartments = await db.UserDepartments.AsNoTracking().ToListAsync(cancellationToken);
        var pauseStatuses = await db.TaskSlaPauseStatuses.AsNoTracking().ToListAsync(cancellationToken);
        var notifications = await db.TaskNotifications.AsNoTracking()
            .Where(x => x.RecipientUserId == user.Id)
            .OrderByDescending(x => x.CreatedAt).Take(100).ToListAsync(cancellationToken);
        var taskNumbers = tasks.ToDictionary(x => x.Id, x => x.Number);

        string UserName(Guid id) => users.TryGetValue(id, out var value) ? value.DisplayName : "Usuário removido";
        var taskDtos = tasks.Select(task =>
        {
            var priority = priorities.First(x => x.Id == task.PriorityId);
            var status = statuses.First(x => x.Id == task.StatusId);
            return new CorporateTaskDto(
                task.Id, task.Number, task.Protocol, task.Title, task.Description,
                task.TypeId, types.First(x => x.Id == task.TypeId).Name,
                task.PriorityId, priority.Name, priority.Color, task.StatusId, status.Name, task.SlaPolicyId,
                task.SourceDepartmentId, task.CurrentDepartmentId,
                departments.First(x => x.Id == task.CurrentDepartmentId).Name,
                task.CreatorUserId, UserName(task.CreatorUserId), task.AssigneeUserId,
                task.AssigneeUserId.HasValue ? UserName(task.AssigneeUserId.Value) : "Fila do setor",
                task.CustomerId, task.CustomerCode, task.CustomerName,
                task.ClientWhatsApp, task.ClientNotificationState, task.ClientNotificationRequestedAt,
                task.ClientNotifiedAt, task.ExternalLink, task.InternalNotes, task.DueAt,
                task.FirstResponseDueAt, task.ServiceStartDueAt,
                task.SlaDueAt, SlaState(task), task.CompletedAt, task.Cancelled, task.CancellationRequest, task.Version,
                task.CreatedAt, task.UpdatedAt,
                task.CreatorUserId == user.Id || task.AssigneeUserId == user.Id,
                participants.Where(x => x.TaskId == task.Id).Select(x => x.UserId).ToList(),
                comments.Where(x => x.TaskId == task.Id).Select(x =>
                    new TaskCommentDto(x.Id, x.AuthorUserId, UserName(x.AuthorUserId), x.Body, x.Internal, x.CreatedAt,
                        attachments.Where(a => a.CommentId == x.Id).Select(a =>
                            new TaskAttachmentDto(a.Id, a.CommentId, a.FileName, $"/api/task-files/{a.Id}", a.CreatedAt)).ToList())).ToList(),
                history.Where(x => x.TaskId == task.Id).Select(x =>
                    new TaskHistoryDto(x.Id, x.EventType, x.Summary, UserName(x.ActorUserId),
                        x.PreviousValueJson, x.NewValueJson, x.Source, x.Justification, x.CreatedAt)).ToList(),
                attachments.Where(x => x.TaskId == task.Id && x.CommentId == null).Select(x =>
                    new TaskAttachmentDto(x.Id, x.CommentId, x.FileName, $"/api/task-files/{x.Id}", x.CreatedAt)).ToList());
        }).ToList();

        return new TaskModuleDto(
            taskDtos,
            departments.Select(x => new TaskDepartmentDto(x.Id, x.Name, x.Description, x.Active,
                x.RequiresAssigneeOnTransfer,
                userDepartments.Where(m => m.DepartmentId == x.Id && m.IsCoordinator).Select(m => m.UserId).ToList())).ToList(),
            types.Select(x => new TaskTypeDto(x.Id, x.Name, x.Description, x.DefaultPriorityId,
                x.DefaultSlaPolicyId, x.InitialStatusId,
                typeDepartments.Where(m => m.TaskTypeId == x.Id).Select(m => m.DepartmentId).ToList(),
                typeStatuses.Where(m => m.TaskTypeId == x.Id).Select(m => m.StatusId).ToList(), x.Active)).ToList(),
            priorities.Select(x => new TaskPriorityDto(x.Id, x.Name, x.SeverityOrder, x.Color, x.DefaultDueMinutes, x.Active)).ToList(),
            statuses.Select(x => new TaskStatusDto(x.Id, x.Name, x.DepartmentId, x.DisplayOrder,
                x.KanbanColumn, x.IsInitial, x.IsFinal, x.AcceptsNewTasks, x.ManualMovement,
                x.RequiresJustification, x.Active)).ToList(),
            slas.Select(x => new TaskSlaPolicyDto(x.Id, x.Name, x.DepartmentId, x.TaskTypeId,
                x.PriorityId, x.FirstResponseMinutes, x.ServiceStartMinutes, x.CompletionMinutes,
                Deserialize<int>(x.BusinessDaysJson), x.BusinessStart.ToString("HH:mm"), x.BusinessEnd.ToString("HH:mm"),
                x.AlertBeforeMinutes, x.EscalationMinutes, x.RecalculateOnTransfer,
                pauseStatuses.Where(m => m.SlaPolicyId == x.Id).Select(m => m.StatusId).ToList(), x.Active)).ToList(),
            users.Values.OrderBy(x => x.DisplayName).Select(x => new TaskCollaboratorDto(
                x.Id, x.DisplayName, x.Email, x.Phone, x.JobTitle, x.PhotoDataUrl, x.Active,
                userDepartments.Where(m => m.UserId == x.Id).Select(m => m.DepartmentId).ToList(),
                userDepartments.Where(m => m.UserId == x.Id && m.IsCoordinator).Select(m => m.DepartmentId).ToList())).ToList(),
            notifications.Select(x => new TaskNotificationDto(x.Id, x.TaskId,
                taskNumbers.GetValueOrDefault(x.TaskId), x.EventType, x.Message, x.Read, x.CreatedAt)).ToList());
    }

    public async Task<CreatedCorporateTaskDto> CreateAsync(CreateCorporateTaskCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("tasks", "create");
        if (string.IsNullOrWhiteSpace(command.Title))
            throw new DomainException("Título da tarefa é obrigatório.");
        var whatsAppDigits = new string((command.ClientWhatsApp ?? "").Where(char.IsDigit).ToArray());
        if (whatsAppDigits.Length < 10 || whatsAppDigits.Length > 15)
            throw new DomainException("Informe um número de WhatsApp válido do cliente, com DDD.");
        var user = await GetActorUserAsync(actor, cancellationToken);
        await ValidateDepartmentAccessAsync(user.Id, command.SourceDepartmentId, actor, cancellationToken);
        await ValidateDepartmentAccessAsync(user.Id, command.CurrentDepartmentId, actor, cancellationToken);

        var type = await db.TaskTypes.SingleOrDefaultAsync(x => x.Id == command.TypeId && x.Active, cancellationToken)
            ?? throw new DomainException("Tipo de tarefa inválido ou inativo.");
        if (!await db.TaskTypeDepartments.AnyAsync(x => x.TaskTypeId == type.Id && x.DepartmentId == command.CurrentDepartmentId, cancellationToken))
            throw new DomainException("O tipo de tarefa não pertence ao setor selecionado.");
        // Prioridade é definida pela coordenação após a abertura da demanda. Para não
        // bloquear o colaborador, usa-se a prioridade de sistema ou, como contingência,
        // a primeira prioridade ativa cadastrada.
        var priority = command.PriorityId.HasValue
            ? await db.TaskPriorities.SingleOrDefaultAsync(x => x.Id == command.PriorityId.Value && x.Active, cancellationToken)
            : await db.TaskPriorities.Where(x => x.Active && x.Name == "Não definida")
                .OrderBy(x => x.SeverityOrder).FirstOrDefaultAsync(cancellationToken)
              ?? await db.TaskPriorities.Where(x => x.Active)
                  .OrderBy(x => x.SeverityOrder).FirstOrDefaultAsync(cancellationToken);
        if (priority is null)
            throw new DomainException("Cadastre ao menos uma prioridade ativa para receber novas tarefas.");
        var statusId = command.StatusId ?? type.InitialStatusId;
        var status = await db.TaskStatuses.SingleOrDefaultAsync(x => x.Id == statusId && x.Active && x.AcceptsNewTasks, cancellationToken)
            ?? throw new DomainException("Status inicial inválido ou inativo.");
        if (!await db.TaskTypeStatuses.AnyAsync(x => x.TaskTypeId == type.Id && x.StatusId == status.Id, cancellationToken))
            throw new DomainException("O status não pertence ao fluxo configurado para o tipo.");
        if (command.AssigneeUserId.HasValue)
            await ValidateAssigneeAsync(command.AssigneeUserId.Value, command.CurrentDepartmentId, cancellationToken);

        // A política selecionada no tipo (ou a política geral do setor) é vinculada
        // já na criação e passa a contabilizar o prazo a partir deste instante.
        var sla = await ResolveSlaAsync(command.SlaPolicyId ?? type.DefaultSlaPolicyId,
            type.Id, priority.Id, command.CurrentDepartmentId, cancellationToken);
        var now = DateTimeOffset.UtcNow;
        var task = new CorporateTask
        {
            Protocol = "",
            Title = command.Title.Trim(),
            Description = command.Description?.Trim() ?? "",
            TypeId = type.Id,
            PriorityId = priority.Id,
            StatusId = status.Id,
            SlaPolicyId = sla?.Id,
            SourceDepartmentId = command.SourceDepartmentId,
            CurrentDepartmentId = command.CurrentDepartmentId,
            CreatorUserId = user.Id,
            AssigneeUserId = command.AssigneeUserId,
            CustomerId = command.CustomerId,
            CustomerCode = command.CustomerCode?.Trim() ?? "",
            CustomerName = command.CustomerName?.Trim() ?? "",
            ClientWhatsApp = whatsAppDigits,
            ClientNotificationState = "Pendente",
            ExternalLink = command.ExternalLink?.Trim() ?? "",
            InternalNotes = command.InternalNotes?.Trim() ?? "",
            CancellationRequest = command.CancellationRequest,
            DueAt = command.DueAt ?? (priority.DefaultDueMinutes is int due ? now.AddMinutes(due) : null),
            FirstResponseDueAt = sla is null ? null : AddBusinessMinutes(now, sla.FirstResponseMinutes, sla),
            ServiceStartDueAt = sla is null ? null : AddBusinessMinutes(now, sla.ServiceStartMinutes, sla),
            SlaDueAt = sla is null ? null : AddBusinessMinutes(now, sla.CompletionMinutes, sla),
        };
        db.CorporateTasks.Add(task);
        var approverId = await db.UserDepartments.AsNoTracking()
            .Join(db.Users.AsNoTracking(), membership => membership.UserId, appUser => appUser.Id,
                (membership, appUser) => new { membership, appUser })
            .Where(entry => entry.membership.DepartmentId == task.CurrentDepartmentId
                && entry.membership.IsCoordinator && entry.appUser.Active)
            .OrderBy(entry => entry.appUser.DisplayName)
            .Select(entry => (Guid?)entry.appUser.Id)
            .FirstOrDefaultAsync(cancellationToken);
        if (approverId.HasValue)
            db.TaskComments.Add(new TaskComment
            {
                TaskId = task.Id,
                AuthorUserId = user.Id,
                Body = $"[APROVADOR:{approverId.Value}]",
            });
        if (command.ParticipantUserIds is not null)
            foreach (var participantId in command.ParticipantUserIds.Distinct())
                db.TaskParticipants.Add(new() { TaskId = task.Id, UserId = participantId });
        if (command.AttachmentLinks is not null)
        {
            foreach (var link in command.AttachmentLinks.Where(x => !string.IsNullOrWhiteSpace(x)).Distinct())
            {
                if (!Uri.TryCreate(link.Trim(), UriKind.Absolute, out var uri)
                    || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
                    throw new DomainException("Os anexos devem ser links HTTP ou HTTPS válidos.");
                var fileName = Path.GetFileName(uri.AbsolutePath);
                db.TaskAttachments.Add(new()
                {
                    TaskId = task.Id, UploadedByUserId = user.Id,
                    FileName = string.IsNullOrWhiteSpace(fileName) ? uri.Host : fileName,
                    StorageKey = uri.ToString(), ContentType = "text/uri-list",
                });
                AddHistory(task.Id, user.Id, "attachment_added", "Anexo vinculado", null, new { Url = uri.ToString() });
            }
        }
        AddHistory(task.Id, user.Id, "created", "Tarefa criada", null, new { task.Title, task.StatusId, task.PriorityId });
        if (task.AssigneeUserId.HasValue)
            AddNotification(task.Id, task.AssigneeUserId.Value, user.Id, "assigned", "Uma nova tarefa foi atribuída a você.");
        var coordinators = await db.UserDepartments.AsNoTracking()
            .Where(x => x.DepartmentId == task.CurrentDepartmentId && x.IsCoordinator && x.UserId != user.Id)
            .Select(x => x.UserId).Distinct().ToListAsync(cancellationToken);
        foreach (var coordinatorId in coordinators)
            AddNotification(task.Id, coordinatorId, user.Id, "task_waiting_validation",
                "Uma nova tarefa aguarda validação de prioridade, SLA e direcionamento.");
        await db.SaveChangesAsync(cancellationToken);
        if (task.Number <= 0)
        {
            var previousNumber = await db.CorporateTasks
                .Where(existing => existing.Id != task.Id)
                .MaxAsync(existing => (long?)existing.Number, cancellationToken) ?? 0;
            task.Number = previousNumber + 1;
        }
        var annualSequence = await db.CorporateTasks.AsNoTracking()
            .CountAsync(existing => existing.Id != task.Id
                && existing.CreatedAt.Year == now.Year, cancellationToken) + 1;
        task.Protocol = $"T{now:yy}{annualSequence:0000}";
        await db.SaveChangesAsync(cancellationToken);
        return new CreatedCorporateTaskDto(task.Id, task.Protocol);
    }

    public async Task ChangeStatusAsync(ChangeTaskStatusCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        RequireCapabilityOrManage(actor, "changeStatus");
        var user = await GetActorUserAsync(actor, cancellationToken);
        var task = await LoadEditableTaskAsync(command.TaskId, command.Version, user, actor, cancellationToken);
        var status = await db.TaskStatuses.SingleOrDefaultAsync(x => x.Id == command.StatusId && x.Active, cancellationToken)
            ?? throw new DomainException("Status inválido ou inativo.");
        if (!status.ManualMovement)
            throw new DomainException("Este status não permite movimentação manual.");
        var isApprovalStatus = status.Name.Contains("aguardando aprova", StringComparison.OrdinalIgnoreCase);
        if (!isApprovalStatus && !await db.TaskTypeStatuses.AnyAsync(x => x.TaskTypeId == task.TypeId && x.StatusId == status.Id, cancellationToken))
            throw new DomainException("Movimentação não permitida pelo fluxo do tipo de tarefa.");
        if (status.RequiresJustification && string.IsNullOrWhiteSpace(command.Justification))
            throw new DomainException("Este status exige justificativa.");
        if (status.IsFinal && string.IsNullOrWhiteSpace(task.Description))
            throw new DomainException("A tarefa não pode ser concluída sem descrição.");

        var previous = task.StatusId;
        task.StatusId = status.Id;
        task.UpdatedAt = DateTimeOffset.UtcNow;
        task.Version++;
        task.CompletedAt = status.IsFinal ? DateTimeOffset.UtcNow : null;
        task.Cancelled = status.Name.Equals("Cancelada", StringComparison.OrdinalIgnoreCase);
        if (task.Cancelled)
            RequireCapabilityOrManage(actor, "cancel");
        await UpdatePauseStateAsync(task, status.Id, cancellationToken);
        AddHistory(task.Id, user.Id, task.Cancelled ? "cancelled" : status.IsFinal ? "completed" : "status_changed",
            $"Status alterado para {status.Name}", new { StatusId = previous }, new { StatusId = status.Id },
            command.Justification);
        NotifyInterested(task, user.Id, "status_changed", $"A tarefa #{task.Number} mudou para {status.Name}.");
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task ChangePriorityAsync(ChangeTaskPriorityCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        RequireCapabilityOrManage(actor, "changePriority");
        var user = await GetActorUserAsync(actor, cancellationToken);
        var task = await LoadEditableTaskAsync(command.TaskId, command.Version, user, actor, cancellationToken);
        var priority = await db.TaskPriorities.SingleOrDefaultAsync(x => x.Id == command.PriorityId && x.Active, cancellationToken)
            ?? throw new DomainException("Prioridade inválida ou inativa.");
        var previous = task.PriorityId;
        task.PriorityId = priority.Id;
        task.UpdatedAt = DateTimeOffset.UtcNow;
        task.Version++;
        AddHistory(task.Id, user.Id, "priority_changed", $"Prioridade alterada para {priority.Name}",
            new { PriorityId = previous }, new { PriorityId = priority.Id });
        NotifyInterested(task, user.Id, "priority_changed", $"A prioridade da tarefa #{task.Number} foi alterada para {priority.Name}.");
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task ChangeSlaAsync(ChangeTaskSlaCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        RequireCapabilityOrManage(actor, "changeSla");
        var user = await GetActorUserAsync(actor, cancellationToken);
        var task = await LoadEditableTaskAsync(command.TaskId, command.Version, user, actor, cancellationToken);
        var previous = new { task.SlaPolicyId, task.FirstResponseDueAt, task.ServiceStartDueAt, task.SlaDueAt };
        if (!command.SlaPolicyId.HasValue)
        {
            task.SlaPolicyId = null; task.FirstResponseDueAt = null; task.ServiceStartDueAt = null; task.SlaDueAt = null;
        }
        else
        {
            var sla = await db.TaskSlaPolicies.SingleOrDefaultAsync(
                x => x.Id == command.SlaPolicyId && x.Active && x.DepartmentId == task.CurrentDepartmentId, cancellationToken)
                ?? throw new DomainException("SLA inválido, inativo ou incompatível com o setor.");
            task.SlaPolicyId = sla.Id;
            task.FirstResponseDueAt = AddBusinessMinutes(DateTimeOffset.UtcNow, sla.FirstResponseMinutes, sla);
            task.ServiceStartDueAt = AddBusinessMinutes(DateTimeOffset.UtcNow, sla.ServiceStartMinutes, sla);
            task.SlaDueAt = AddBusinessMinutes(DateTimeOffset.UtcNow, sla.CompletionMinutes, sla);
        }
        task.UpdatedAt = DateTimeOffset.UtcNow;
        task.Version++;
        AddHistory(task.Id, user.Id, "sla_changed", "Política de SLA alterada", previous,
            new { task.SlaPolicyId, task.FirstResponseDueAt, task.ServiceStartDueAt, task.SlaDueAt });
        NotifyInterested(task, user.Id, "sla_changed", $"O SLA da tarefa #{task.Number} foi alterado.");
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task TransferAsync(TransferTaskCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        RequireCapabilityOrManage(actor, "forward");
        if (string.IsNullOrWhiteSpace(command.Reason))
            throw new DomainException("Informe o motivo do encaminhamento.");
        var user = await GetActorUserAsync(actor, cancellationToken);
        var task = await LoadEditableTaskAsync(command.TaskId, command.Version, user, actor, cancellationToken);
        var destination = await db.TaskDepartments.SingleOrDefaultAsync(x => x.Id == command.DepartmentId && x.Active, cancellationToken)
            ?? throw new DomainException("Setor de destino inválido ou inativo.");
        if (destination.Id == task.CurrentDepartmentId)
            throw new DomainException("Selecione um setor diferente do setor atual.");
        if (destination.RequiresAssigneeOnTransfer && !command.AssigneeUserId.HasValue)
            throw new DomainException("O setor de destino exige um responsável.");
        if (command.AssigneeUserId.HasValue)
            await ValidateAssigneeAsync(command.AssigneeUserId.Value, destination.Id, cancellationToken);
        var previousDepartment = task.CurrentDepartmentId;
        var previousAssignee = task.AssigneeUserId;
        var previousStatus = task.StatusId;
        task.CurrentDepartmentId = destination.Id;
        task.AssigneeUserId = command.AssigneeUserId;
        var destinationInitialStatus = await db.TaskStatuses
            .Where(status => status.Active && status.AcceptsNewTasks && status.IsInitial
                && (status.DepartmentId == destination.Id || status.DepartmentId == null))
            .OrderByDescending(status => status.DepartmentId == destination.Id)
            .ThenBy(status => status.DisplayOrder)
            .FirstOrDefaultAsync(cancellationToken);
        if (destinationInitialStatus is not null)
        {
            task.StatusId = destinationInitialStatus.Id;
            task.CompletedAt = null;
            task.Cancelled = false;
            await UpdatePauseStateAsync(task, destinationInitialStatus.Id, cancellationToken);
        }
        task.UpdatedAt = DateTimeOffset.UtcNow;
        task.Version++;
        var recalculated = false;
        if (command.RecalculateSla)
        {
            var sla = await ResolveSlaAsync(null, task.TypeId, task.PriorityId, destination.Id, cancellationToken);
            if (sla is not null)
            {
                task.SlaPolicyId = sla.Id;
                task.FirstResponseDueAt = AddBusinessMinutes(task.UpdatedAt, sla.FirstResponseMinutes, sla);
                task.ServiceStartDueAt = AddBusinessMinutes(task.UpdatedAt, sla.ServiceStartMinutes, sla);
                task.SlaDueAt = AddBusinessMinutes(task.UpdatedAt, sla.CompletionMinutes, sla);
                recalculated = true;
            }
        }
        db.TaskTransfers.Add(new()
        {
            TaskId = task.Id, FromDepartmentId = previousDepartment, ToDepartmentId = destination.Id,
            PreviousAssigneeUserId = previousAssignee, NewAssigneeUserId = task.AssigneeUserId,
            ActorUserId = user.Id, Reason = command.Reason.Trim(), SlaRecalculated = recalculated,
        });
        AddHistory(task.Id, user.Id, "transferred", $"Tarefa encaminhada para {destination.Name}",
            new { DepartmentId = previousDepartment, AssigneeUserId = previousAssignee, StatusId = previousStatus },
            new { DepartmentId = destination.Id, AssigneeUserId = task.AssigneeUserId, StatusId = task.StatusId, SlaRecalculated = recalculated },
            command.Reason);
        var recipients = await db.UserDepartments.Where(x => x.DepartmentId == destination.Id)
            .Select(x => x.UserId).ToListAsync(cancellationToken);
        foreach (var recipient in recipients.Distinct())
            AddNotification(task.Id, recipient, user.Id, "transferred", $"A tarefa #{task.Number} foi encaminhada para {destination.Name}.");
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task AssignAsync(AssignTaskCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        RequireCapabilityOrManage(actor, command.AssigneeUserId.HasValue ? "transferAssignee" : "assume");
        var user = await GetActorUserAsync(actor, cancellationToken);
        var task = await LoadEditableTaskAsync(command.TaskId, command.Version, user, actor, cancellationToken);
        var assigneeId = command.AssigneeUserId ?? user.Id;
        await ValidateAssigneeAsync(assigneeId, task.CurrentDepartmentId, cancellationToken);
        var previous = task.AssigneeUserId;
        task.AssigneeUserId = assigneeId;
        task.UpdatedAt = DateTimeOffset.UtcNow;
        task.Version++;
        AddHistory(task.Id, user.Id, "assignee_changed", "Responsável pela tarefa alterado",
            new { AssigneeUserId = previous }, new { AssigneeUserId = assigneeId });
        AddNotification(task.Id, assigneeId, user.Id, "assigned", $"A tarefa #{task.Number} foi atribuída a você.");
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task UpdateAsync(UpdateCorporateTaskCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("tasks", "edit");
        if (string.IsNullOrWhiteSpace(command.Title))
            throw new DomainException("Título da tarefa é obrigatório.");
        if (string.IsNullOrWhiteSpace(command.Description))
            throw new DomainException("Descrição da tarefa é obrigatória.");
        var whatsAppDigits = new string((command.ClientWhatsApp ?? "").Where(char.IsDigit).ToArray());
        if (whatsAppDigits.Length < 10 || whatsAppDigits.Length > 15)
            throw new DomainException("Informe um número de WhatsApp válido do cliente, com DDD.");
        var user = await GetActorUserAsync(actor, cancellationToken);
        var task = await LoadVisibleTaskAsync(command.TaskId, user, actor, cancellationToken);
        RequireCreatorOrAssignee(task, user);
        if (task.Version != command.Version)
            throw new DomainException("A tarefa foi alterada por outro usuário.", 409);
        var type = await db.TaskTypes.SingleOrDefaultAsync(x => x.Id == command.TypeId && x.Active, cancellationToken)
            ?? throw new DomainException("Tipo de tarefa inválido ou inativo.");
        if (!await db.TaskTypeDepartments.AnyAsync(x => x.TaskTypeId == type.Id && x.DepartmentId == task.CurrentDepartmentId, cancellationToken))
            throw new DomainException("O tipo de tarefa não pertence ao setor atual.");
        var customerName = "";
        if (command.CustomerId.HasValue)
            customerName = await db.Customers.Where(x => x.Id == command.CustomerId.Value)
                .Select(x => x.TradeName).SingleOrDefaultAsync(cancellationToken)
                ?? throw new DomainException("Cliente não encontrado.");

        var previous = new
        {
            task.Title, task.Description, task.TypeId, task.CustomerId, task.CustomerCode,
            task.CustomerName, task.ClientWhatsApp, task.CancellationRequest,
        };
        task.Title = command.Title.Trim();
        task.Description = command.Description.Trim();
        task.TypeId = type.Id;
        task.CustomerId = command.CustomerId;
        task.CustomerCode = command.CustomerCode?.Trim() ?? "";
        task.CustomerName = customerName.Length > 0 ? customerName : command.CustomerName?.Trim() ?? "";
        task.ClientWhatsApp = whatsAppDigits;
        task.CancellationRequest = command.CancellationRequest;
        task.UpdatedAt = DateTimeOffset.UtcNow;
        task.Version++;

        var participants = await db.TaskParticipants.Where(x => x.TaskId == task.Id).ToListAsync(cancellationToken);
        db.TaskParticipants.RemoveRange(participants);
        foreach (var participantId in (command.ParticipantUserIds ?? []).Distinct())
            db.TaskParticipants.Add(new TaskParticipant { TaskId = task.Id, UserId = participantId });
        AddHistory(task.Id, user.Id, "updated", "Tarefa editada", previous,
            new { task.Title, task.Description, task.TypeId, task.CustomerId, task.CustomerCode, task.CustomerName, task.ClientWhatsApp, task.CancellationRequest });
        NotifyInterested(task, user.Id, "updated", $"A tarefa #{task.Number} foi atualizada.");
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task DeleteAsync(DeleteCorporateTaskCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("tasks", "edit");
        var user = await GetActorUserAsync(actor, cancellationToken);
        var task = await LoadVisibleTaskAsync(command.TaskId, user, actor, cancellationToken);
        RequireCreatorOrAssignee(task, user);
        if (task.Version != command.Version)
            throw new DomainException("A tarefa foi alterada por outro usuário.", 409);
        var storageKeys = await db.TaskAttachments.Where(x => x.TaskId == task.Id)
            .Select(x => x.StorageKey).ToListAsync(cancellationToken);
        db.CorporateTasks.Remove(task);
        await db.SaveChangesAsync(cancellationToken);
        if (fileStorage is not null)
            foreach (var storageKey in storageKeys.Where(key => !string.IsNullOrWhiteSpace(key) && !Uri.IsWellFormedUriString(key, UriKind.Absolute)))
                await fileStorage.DeleteAsync(storageKey, cancellationToken);
    }

    public async Task<Guid> AddCommentAsync(AddTaskCommentCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("tasks", "edit");
        if (string.IsNullOrWhiteSpace(command.Body))
            throw new DomainException("O comentário não pode ficar vazio.");
        var user = await GetActorUserAsync(actor, cancellationToken);
        var task = await LoadVisibleTaskAsync(command.TaskId, user, actor, cancellationToken);
        var mentions = command.MentionedUserIds?.Distinct().ToList() ?? [];
        var comment = new TaskComment
        {
            TaskId = task.Id, AuthorUserId = user.Id, Body = command.Body.Trim(),
            MentionedUserIdsJson = JsonSerializer.Serialize(mentions, JsonOptions),
        };
        db.TaskComments.Add(comment);
        AddHistory(task.Id, user.Id, "comment_added", "Comentário incluído", null, new { comment.Id });
        NotifyInterested(task, user.Id, "comment_added", $"Novo comentário na tarefa #{task.Number}.");
        foreach (var mentioned in mentions)
            AddNotification(task.Id, mentioned, user.Id, "mentioned", $"Você foi mencionado na tarefa #{task.Number}.");
        await db.SaveChangesAsync(cancellationToken);
        return comment.Id;
    }

    public async Task CommunicateWithClientAsync(ClientCommunicationCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        var user = await GetActorUserAsync(actor, cancellationToken);
        var task = await LoadVisibleTaskAsync(command.TaskId, user, actor, cancellationToken);
        var action = command.Action.Trim();
        var normalized = action.ToLowerInvariant() switch
        {
            "requestcontact" => "Avisar Cliente",
            "notifyclient" or "clientinformed" => "Cliente Informado",
            "noneed" => "Sem Necessidade",
            _ => "",
        };
        if (string.IsNullOrWhiteSpace(normalized))
            throw new DomainException("Ação de comunicação inválida.");
        if (normalized != "Sem Necessidade" && string.IsNullOrWhiteSpace(command.Message))
            throw new DomainException("Informe a orientação ou mensagem ao cliente.");
        var now = DateTimeOffset.UtcNow;
        task.ClientNotificationState = normalized;
        task.UpdatedAt = now;
        task.Version++;
        if (normalized == "Avisar Cliente")
            task.ClientNotificationRequestedAt = now;
        if (normalized == "Cliente Informado")
        {
            task.ClientNotifiedAt = now;
            task.ClientNotifiedByUserId = user.Id;
        }
        var result = normalized == "Avisar Cliente" ? "Solicitação enviada ao responsável" : normalized;
        db.TaskClientCommunications.Add(new()
        {
            TaskId = task.Id, ActorUserId = user.Id, Action = action,
            Channel = string.IsNullOrWhiteSpace(command.Channel) ? "Interno" : command.Channel.Trim(),
            Message = command.Message?.Trim() ?? "", Result = result,
        });
        AddHistory(task.Id, user.Id, "client_communication",
            $"Aviso ao cliente: {normalized}", null,
            new { Action = action, State = normalized, command.Channel, Result = result });
        if (normalized == "Avisar Cliente" && task.AssigneeUserId.HasValue)
        {
            AddNotification(task.Id, task.AssigneeUserId.Value, user.Id, "client_contact_requested",
                $"O cliente da tarefa {task.Protocol} precisa ser avisado pelo WhatsApp.");
            db.CompanyNotices.Add(new CompanyNotice
            {
                Title = $"Avisar o cliente · {task.Protocol}",
                Body = $"{command.Message?.Trim() ?? ""}\n\n[TASK_LINK:/?mod=tasks&task={task.Id}]",
                Type = "Importante",
                Kind = "Aviso",
                Audience = "Colaborador",
                TargetUserId = task.AssigneeUserId,
                AuthorUserId = user.Id,
                PublishedAt = now,
                Active = true,
            });
        }
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<Guid> SaveDepartmentAsync(SaveTaskDepartmentCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        RequireCatalogManagement(actor);
        if (string.IsNullOrWhiteSpace(command.Name)) throw new DomainException("Nome do setor é obrigatório.");
        var name = command.Name.Trim();
        var normalizedName = name.ToUpperInvariant();
        TaskDepartment? entity = command.Id.HasValue
            ? await db.TaskDepartments.SingleOrDefaultAsync(x => x.Id == command.Id, cancellationToken)
                ?? throw new DomainException("Setor não encontrado.", 404)
            : null;

        var duplicateQuery = db.TaskDepartments.AsQueryable();
        if (command.Id.HasValue)
            duplicateQuery = duplicateQuery.Where(x => x.Id != command.Id.Value);
        var duplicate = await duplicateQuery
            .FirstOrDefaultAsync(x => x.Name.ToUpper() == normalizedName, cancellationToken);

        if (duplicate is not null)
        {
            if (duplicate.Active)
                throw new DomainException("Já existe um setor ativo com este nome.", 409);
            if (command.Id.HasValue)
                throw new DomainException("Já existe um setor inativo com este nome. Reative-o diretamente na lista.", 409);

            // Um novo cadastro com o mesmo nome reativa o registro existente, sem violar o índice único.
            entity = duplicate;
        }

        entity ??= new TaskDepartment { Name = name };
        entity.Name = name; entity.Description = command.Description?.Trim() ?? "";
        entity.Active = command.Active; entity.RequiresAssigneeOnTransfer = command.RequiresAssigneeOnTransfer;
        entity.UpdatedAt = DateTimeOffset.UtcNow;
        if (!command.Id.HasValue && duplicate is null) db.TaskDepartments.Add(entity);
        var existing = await db.UserDepartments.Where(x => x.DepartmentId == entity.Id).ToListAsync(cancellationToken);
        foreach (var membership in existing)
            membership.IsCoordinator = command.CoordinatorUserIds.Contains(membership.UserId);
        foreach (var userId in command.CoordinatorUserIds.Except(existing.Select(x => x.UserId)))
            db.UserDepartments.Add(new() { UserId = userId, DepartmentId = entity.Id, IsCoordinator = true });
        await db.SaveChangesAsync(cancellationToken);
        return entity.Id;
    }

    public async Task<Guid> SavePriorityAsync(SaveTaskPriorityCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        RequireCatalogManagement(actor);
        if (string.IsNullOrWhiteSpace(command.Name)) throw new DomainException("Nome da prioridade é obrigatório.");
        var entity = command.Id.HasValue
            ? await db.TaskPriorities.SingleAsync(x => x.Id == command.Id, cancellationToken)
            : new TaskPriority { Name = command.Name.Trim() };
        entity.Name = command.Name.Trim(); entity.SeverityOrder = command.SeverityOrder;
        entity.Color = command.Color; entity.DefaultDueMinutes = command.DefaultDueMinutes; entity.Active = command.Active;
        entity.UpdatedAt = DateTimeOffset.UtcNow;
        if (!command.Id.HasValue) db.TaskPriorities.Add(entity);
        await db.SaveChangesAsync(cancellationToken);
        return entity.Id;
    }

    public async Task<Guid> SaveStatusAsync(SaveTaskStatusCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        RequireCatalogManagement(actor);
        if (string.IsNullOrWhiteSpace(command.Name)) throw new DomainException("Nome do status é obrigatório.");
        if (command.IsInitial && command.IsFinal) throw new DomainException("Um status não pode ser inicial e final.");
        var entity = command.Id.HasValue
            ? await db.TaskStatuses.SingleAsync(x => x.Id == command.Id, cancellationToken)
            : new TaskStatusEntity { Name = command.Name.Trim() };
        entity.Name = command.Name.Trim(); entity.DepartmentId = command.DepartmentId;
        entity.DisplayOrder = command.DisplayOrder; entity.KanbanColumn = command.KanbanColumn.Trim();
        entity.IsInitial = command.IsInitial; entity.IsFinal = command.IsFinal;
        entity.AcceptsNewTasks = command.AcceptsNewTasks; entity.ManualMovement = command.ManualMovement;
        entity.RequiresJustification = command.RequiresJustification; entity.Active = command.Active;
        entity.UpdatedAt = DateTimeOffset.UtcNow;
        if (!command.Id.HasValue) db.TaskStatuses.Add(entity);
        await db.SaveChangesAsync(cancellationToken);
        return entity.Id;
    }

    public async Task<Guid> SaveSlaPolicyAsync(SaveTaskSlaPolicyCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        RequireCatalogManagement(actor);
        if (command.CompletionMinutes <= 0) throw new DomainException("O prazo de conclusão do SLA deve ser positivo.");
        if (command.BusinessDays.Count == 0) throw new DomainException("Selecione ao menos um dia útil para o SLA.");
        if (!TimeOnly.TryParse(command.BusinessStart, out var start) || !TimeOnly.TryParse(command.BusinessEnd, out var end) || start >= end)
            throw new DomainException("Horário útil inválido.");
        var entity = command.Id.HasValue
            ? await db.TaskSlaPolicies.SingleAsync(x => x.Id == command.Id, cancellationToken)
            : new TaskSlaPolicy { Name = command.Name.Trim() };
        entity.Name = command.Name.Trim(); entity.DepartmentId = command.DepartmentId;
        entity.TaskTypeId = command.TaskTypeId; entity.PriorityId = command.PriorityId;
        entity.FirstResponseMinutes = command.FirstResponseMinutes; entity.ServiceStartMinutes = command.ServiceStartMinutes;
        entity.CompletionMinutes = command.CompletionMinutes;
        entity.BusinessDaysJson = JsonSerializer.Serialize(command.BusinessDays.Distinct().Order(), JsonOptions);
        entity.BusinessStart = start; entity.BusinessEnd = end; entity.AlertBeforeMinutes = command.AlertBeforeMinutes;
        entity.EscalationMinutes = command.EscalationMinutes; entity.RecalculateOnTransfer = command.RecalculateOnTransfer;
        entity.Active = command.Active; entity.UpdatedAt = DateTimeOffset.UtcNow;
        if (!command.Id.HasValue) db.TaskSlaPolicies.Add(entity);
        var pauses = await db.TaskSlaPauseStatuses.Where(x => x.SlaPolicyId == entity.Id).ToListAsync(cancellationToken);
        db.TaskSlaPauseStatuses.RemoveRange(pauses);
        foreach (var statusId in command.PauseStatusIds.Distinct())
            db.TaskSlaPauseStatuses.Add(new() { SlaPolicyId = entity.Id, StatusId = statusId });
        await db.SaveChangesAsync(cancellationToken);
        return entity.Id;
    }

    public async Task<Guid> SaveTypeAsync(SaveTaskTypeCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        RequireCatalogManagement(actor);
        if (string.IsNullOrWhiteSpace(command.Name) || command.DepartmentIds.Count == 0)
            throw new DomainException("Informe o nome e ao menos um setor para o tipo.");
        if (!command.AllowedStatusIds.Contains(command.InitialStatusId))
            throw new DomainException("O status inicial deve pertencer aos status permitidos.");
        var entity = command.Id.HasValue
            ? await db.TaskTypes.SingleAsync(x => x.Id == command.Id, cancellationToken)
            : new TaskType { Name = command.Name.Trim(), InitialStatusId = command.InitialStatusId };
        entity.Name = command.Name.Trim(); entity.Description = command.Description?.Trim() ?? "";
        entity.DefaultPriorityId = command.DefaultPriorityId; entity.DefaultSlaPolicyId = command.DefaultSlaPolicyId;
        entity.InitialStatusId = command.InitialStatusId; entity.Active = command.Active; entity.UpdatedAt = DateTimeOffset.UtcNow;
        if (!command.Id.HasValue) db.TaskTypes.Add(entity);
        db.TaskTypeDepartments.RemoveRange(await db.TaskTypeDepartments.Where(x => x.TaskTypeId == entity.Id).ToListAsync(cancellationToken));
        db.TaskTypeStatuses.RemoveRange(await db.TaskTypeStatuses.Where(x => x.TaskTypeId == entity.Id).ToListAsync(cancellationToken));
        foreach (var departmentId in command.DepartmentIds.Distinct())
            db.TaskTypeDepartments.Add(new() { TaskTypeId = entity.Id, DepartmentId = departmentId });
        foreach (var statusId in command.AllowedStatusIds.Distinct())
            db.TaskTypeStatuses.Add(new() { TaskTypeId = entity.Id, StatusId = statusId });
        await db.SaveChangesAsync(cancellationToken);
        return entity.Id;
    }

    public async Task SaveCollaboratorAsync(SaveTaskCollaboratorCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        RequireCatalogManagement(actor);
        var user = await db.Users.SingleOrDefaultAsync(x => x.Id == command.UserId, cancellationToken)
            ?? throw new DomainException("Colaborador não encontrado.", 404);
        await ValidateCollaboratorDepartmentsAsync(
            command.DepartmentIds, command.CoordinatorDepartmentIds, cancellationToken);
        user.Phone = command.Phone?.Trim() ?? ""; user.JobTitle = command.JobTitle?.Trim() ?? "";
        user.Active = command.Active; user.UpdatedAt = DateTimeOffset.UtcNow;
        var existing = await db.UserDepartments.Where(x => x.UserId == user.Id).ToListAsync(cancellationToken);
        db.UserDepartments.RemoveRange(existing);
        foreach (var departmentId in command.DepartmentIds.Distinct())
            db.UserDepartments.Add(new()
            {
                UserId = user.Id, DepartmentId = departmentId,
                IsCoordinator = command.CoordinatorDepartmentIds.Contains(departmentId),
                IsPrimary = departmentId == command.DepartmentIds.FirstOrDefault(),
            });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task DeleteCatalogEntryAsync(string catalog, Guid id, ActorContext actor, CancellationToken cancellationToken = default)
    {
        RequireCatalogManagement(actor);
        var normalized = catalog?.Trim().ToLowerInvariant() ?? "";
        switch (normalized)
        {
            case "departments":
                var department = await db.TaskDepartments.SingleOrDefaultAsync(entry => entry.Id == id, cancellationToken)
                    ?? throw new DomainException("Setor não encontrado.", 404);
                department.Active = false;
                department.UpdatedAt = DateTimeOffset.UtcNow;
                break;
            case "priorities":
                var priority = await db.TaskPriorities.SingleOrDefaultAsync(entry => entry.Id == id, cancellationToken)
                    ?? throw new DomainException("Prioridade não encontrada.", 404);
                priority.Active = false;
                priority.UpdatedAt = DateTimeOffset.UtcNow;
                break;
            case "statuses":
                var status = await db.TaskStatuses.SingleOrDefaultAsync(entry => entry.Id == id, cancellationToken)
                    ?? throw new DomainException("Status não encontrado.", 404);
                status.Active = false;
                status.UpdatedAt = DateTimeOffset.UtcNow;
                break;
            case "sla":
                var sla = await db.TaskSlaPolicies.SingleOrDefaultAsync(entry => entry.Id == id, cancellationToken)
                    ?? throw new DomainException("Política de SLA não encontrada.", 404);
                sla.Active = false;
                sla.UpdatedAt = DateTimeOffset.UtcNow;
                break;
            case "types":
                var type = await db.TaskTypes.SingleOrDefaultAsync(entry => entry.Id == id, cancellationToken)
                    ?? throw new DomainException("Tipo de tarefa não encontrado.", 404);
                type.Active = false;
                type.UpdatedAt = DateTimeOffset.UtcNow;
                break;
            case "people":
                var user = await db.Users.SingleOrDefaultAsync(entry => entry.Id == id, cancellationToken)
                    ?? throw new DomainException("Colaborador não encontrado.", 404);
                if (string.Equals(user.Email, actor.Email, StringComparison.OrdinalIgnoreCase))
                    throw new DomainException("Você não pode excluir o próprio acesso.", 409);
                user.Active = false;
                user.UpdatedAt = DateTimeOffset.UtcNow;
                break;
            default:
                throw new DomainException("Cadastro não suportado.");
        }
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<Guid> CreateCollaboratorAsync(
        CreateTaskCollaboratorCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default)
    {
        RequireCatalogManagement(actor);
        var name = command.DisplayName?.Trim() ?? "";
        var email = command.Email?.Trim().ToLowerInvariant() ?? "";
        if (name.Length < 2)
            throw new DomainException("Informe o nome completo do colaborador.");
        if (email.Length < 5 || !email.Contains('@'))
            throw new DomainException("Informe um e-mail válido para o colaborador.");
        if (await db.Users.AnyAsync(x => x.Email == email, cancellationToken))
            throw new DomainException("Já existe um colaborador cadastrado com este e-mail.", 409);

        await ValidateCollaboratorDepartmentsAsync(
            command.DepartmentIds, command.CoordinatorDepartmentIds, cancellationToken);
        var departmentIds = command.DepartmentIds.Distinct().ToArray();
        var primaryDepartment = departmentIds.Length == 0
            ? "Sem setor"
            : await db.TaskDepartments
                .Where(x => x.Id == departmentIds[0])
                .Select(x => x.Name)
                .SingleAsync(cancellationToken);
        var user = new AppUser
        {
            DisplayName = name,
            Email = email,
            Phone = command.Phone?.Trim() ?? "",
            JobTitle = command.JobTitle?.Trim() ?? "",
            Department = primaryDepartment,
            Active = command.Active,
            CreatedBy = actor.Email,
        };
        db.Users.Add(user);
        foreach (var departmentId in departmentIds)
            db.UserDepartments.Add(new()
            {
                UserId = user.Id,
                DepartmentId = departmentId,
                IsCoordinator = command.CoordinatorDepartmentIds.Contains(departmentId),
                IsPrimary = departmentId == departmentIds[0],
            });
        await db.SaveChangesAsync(cancellationToken);
        return user.Id;
    }

    private async Task ValidateCollaboratorDepartmentsAsync(
        IReadOnlyCollection<Guid> departmentIds,
        IReadOnlyCollection<Guid> coordinatorDepartmentIds,
        CancellationToken cancellationToken)
    {
        var selected = departmentIds.Distinct().ToHashSet();
        if (coordinatorDepartmentIds.Any(id => !selected.Contains(id)))
            throw new DomainException("Um colaborador só pode coordenar setores aos quais pertence.");
        var requested = selected.Union(coordinatorDepartmentIds).ToArray();
        var existingCount = await db.TaskDepartments.CountAsync(
            department => requested.Contains(department.Id), cancellationToken);
        if (existingCount != requested.Length)
            throw new DomainException("Um ou mais setores selecionados não existem.");
    }

    public async Task<Guid> UploadAttachmentAsync(
        UploadTaskAttachmentCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("tasks", "edit");
        var user = await GetActorUserAsync(actor, cancellationToken);
        var task = await LoadVisibleTaskAsync(command.TaskId, user, actor, cancellationToken);
        if (command.CommentId.HasValue && !await db.TaskComments.AnyAsync(
            x => x.Id == command.CommentId && x.TaskId == task.Id, cancellationToken))
            throw new DomainException("O comentário informado não pertence a esta tarefa.");
        var fileName = Path.GetFileName(command.FileName?.Trim() ?? "");
        if (string.IsNullOrWhiteSpace(fileName))
            throw new DomainException("O arquivo precisa possuir um nome válido.");
        if (command.SizeBytes <= 0)
            throw new DomainException("O arquivo está vazio.");
        if (command.SizeBytes > MaximumAttachmentSizeBytes)
            throw new DomainException("Cada anexo pode possuir no máximo 25 MB.");
        if (BlockedAttachmentExtensions.Contains(Path.GetExtension(fileName)))
            throw new DomainException("Este tipo de arquivo não é permitido por segurança.");
        if (fileStorage is null)
            throw new DomainException("O armazenamento de anexos não está configurado.", 503);

        var attachment = new TaskAttachment
        {
            TaskId = task.Id,
            CommentId = command.CommentId,
            UploadedByUserId = user.Id,
            FileName = fileName,
            ContentType = string.IsNullOrWhiteSpace(command.ContentType)
                ? "application/octet-stream"
                : command.ContentType.Trim().ToLowerInvariant(),
            SizeBytes = command.SizeBytes,
            StorageKey = $"tasks/{task.Id:N}/{Guid.NewGuid():N}/{Uri.EscapeDataString(fileName)}",
        };
        await fileStorage.StoreAsync(
            attachment.StorageKey, command.Content, attachment.ContentType,
            attachment.SizeBytes, cancellationToken);
        try
        {
            db.TaskAttachments.Add(attachment);
            AddHistory(task.Id, user.Id, "attachment_added", $"Anexo incluído: {fileName}",
                null, new { attachment.Id, attachment.FileName, attachment.SizeBytes });
            await db.SaveChangesAsync(cancellationToken);
            return attachment.Id;
        }
        catch
        {
            await fileStorage.DeleteAsync(attachment.StorageKey, cancellationToken);
            throw;
        }
    }

    public async Task<TaskAttachmentDownloadDto> GetAttachmentDownloadAsync(
        Guid attachmentId,
        ActorContext actor,
        CancellationToken cancellationToken = default)
    {
        var user = await GetActorUserAsync(actor, cancellationToken);
        var attachment = await db.TaskAttachments.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == attachmentId, cancellationToken)
            ?? throw new DomainException("Anexo não encontrado.", 404);
        await LoadVisibleTaskAsync(attachment.TaskId, user, actor, cancellationToken);
        if (Uri.TryCreate(attachment.StorageKey, UriKind.Absolute, out var external)
            && (external.Scheme == Uri.UriSchemeHttp || external.Scheme == Uri.UriSchemeHttps))
            return new TaskAttachmentDownloadDto(external.ToString());
        if (fileStorage is null)
            throw new DomainException("O armazenamento de anexos não está configurado.", 503);
        return new TaskAttachmentDownloadDto(fileStorage.CreateDownloadUrl(
            attachment.StorageKey, attachment.FileName, attachment.ContentType));
    }

    public async Task DeleteAttachmentAsync(
        Guid attachmentId,
        ActorContext actor,
        CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("tasks", "edit");
        var user = await GetActorUserAsync(actor, cancellationToken);
        var attachment = await db.TaskAttachments.SingleOrDefaultAsync(x => x.Id == attachmentId, cancellationToken)
            ?? throw new DomainException("Anexo não encontrado.", 404);
        var task = await LoadVisibleTaskAsync(attachment.TaskId, user, actor, cancellationToken);
        var storageKey = attachment.StorageKey;
        var fileName = attachment.FileName;
        db.TaskAttachments.Remove(attachment);
        AddHistory(task.Id, user.Id, "attachment_removed", $"Anexo removido: {fileName}", null, new { attachmentId, fileName });
        await db.SaveChangesAsync(cancellationToken);
        if (fileStorage is not null && !Uri.TryCreate(storageKey, UriKind.Absolute, out _))
        {
            try { await fileStorage.DeleteAsync(storageKey, cancellationToken); }
            catch { /* The database record is already removed; orphan cleanup can be retried by storage maintenance. */ }
        }
    }

    public async Task MarkNotificationReadAsync(Guid notificationId, ActorContext actor, CancellationToken cancellationToken = default)
    {
        var user = await GetActorUserAsync(actor, cancellationToken);
        var notification = await db.TaskNotifications.SingleOrDefaultAsync(
            x => x.Id == notificationId && x.RecipientUserId == user.Id, cancellationToken)
            ?? throw new DomainException("Notificação não encontrada.", 404);
        notification.Read = true; notification.ReadAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task<AppUser> GetActorUserAsync(ActorContext actor, CancellationToken cancellationToken) =>
        await db.Users.SingleOrDefaultAsync(x => x.Email == actor.Email && x.Active, cancellationToken)
        ?? throw new DomainException("Usuário inativo ou não cadastrado.", 403);

    private async Task ValidateDepartmentAccessAsync(Guid userId, Guid departmentId, ActorContext actor, CancellationToken cancellationToken)
    {
        if (actor.HasPermission("tasks", "manage") || actor.HasCapability("tasks", "viewOtherDepartments")) return;
        if (!await db.UserDepartments.AnyAsync(x => x.UserId == userId && x.DepartmentId == departmentId, cancellationToken))
            throw new DomainException("Você não possui acesso ao setor selecionado.", 403);
    }

    private async Task ValidateAssigneeAsync(Guid userId, Guid departmentId, CancellationToken cancellationToken)
    {
        if (!await db.Users.AnyAsync(x => x.Id == userId && x.Active, cancellationToken))
            throw new DomainException("Somente colaboradores ativos podem receber tarefas.");
        if (!await db.UserDepartments.AnyAsync(x => x.UserId == userId && x.DepartmentId == departmentId, cancellationToken))
            throw new DomainException("O responsável não pertence ao setor selecionado.");
    }

    private async Task EnsureSlaNotificationsAsync(Guid actorUserId, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var candidates = await db.CorporateTasks
            .Where(x => !x.CompletedAt.HasValue && x.SlaDueAt.HasValue && !x.SlaPausedAt.HasValue)
            .ToListAsync(cancellationToken);
        if (candidates.Count == 0) return;
        var policies = await db.TaskSlaPolicies.AsNoTracking().ToDictionaryAsync(x => x.Id, cancellationToken);
        var existing = await db.TaskNotifications
            .Where(x => candidates.Select(task => task.Id).Contains(x.TaskId)
                && (x.EventType == "sla_near_due" || x.EventType == "sla_overdue"))
            .Select(x => new { x.TaskId, x.RecipientUserId, x.EventType })
            .ToListAsync(cancellationToken);
        foreach (var task in candidates)
        {
            var alertMinutes = task.SlaPolicyId.HasValue && policies.TryGetValue(task.SlaPolicyId.Value, out var policy)
                ? policy.AlertBeforeMinutes : 120;
            var eventType = task.SlaDueAt <= now ? "sla_overdue"
                : task.SlaDueAt <= now.AddMinutes(alertMinutes) ? "sla_near_due" : null;
            if (eventType is null) continue;
            var recipients = new[] { task.CreatorUserId, task.AssigneeUserId }.Where(x => x.HasValue)
                .Select(x => x!.Value).Distinct();
            foreach (var recipient in recipients)
            {
                if (existing.Any(x => x.TaskId == task.Id && x.RecipientUserId == recipient && x.EventType == eventType))
                    continue;
                AddNotification(task.Id, recipient, actorUserId, eventType,
                    eventType == "sla_overdue"
                        ? $"O SLA da tarefa #{task.Number} venceu."
                        : $"O SLA da tarefa #{task.Number} está próximo do vencimento.");
            }
        }
        if (db.ChangeTracker.HasChanges())
            await db.SaveChangesAsync(cancellationToken);
    }

    private async Task<CorporateTask> LoadEditableTaskAsync(
        Guid taskId, long version, AppUser user, ActorContext actor, CancellationToken cancellationToken)
    {
        actor.RequirePermission("tasks", "edit");
        var task = await LoadVisibleTaskAsync(taskId, user, actor, cancellationToken);
        if (task.Version != version) throw new DomainException("A tarefa foi alterada por outro usuário.", 409);
        return task;
    }

    private static void RequireCreatorOrAssignee(CorporateTask task, AppUser user)
    {
        if (task.CreatorUserId != user.Id && task.AssigneeUserId != user.Id)
            throw new DomainException("Somente o criador ou o responsável pode editar ou excluir esta tarefa.", 403);
    }

    private async Task<CorporateTask> LoadVisibleTaskAsync(
        Guid taskId, AppUser user, ActorContext actor, CancellationToken cancellationToken)
    {
        actor.RequirePermission("tasks", "view");
        var task = await db.CorporateTasks.SingleOrDefaultAsync(x => x.Id == taskId, cancellationToken)
            ?? throw new DomainException("Tarefa não encontrada.", 404);
        if (actor.HasPermission("tasks", "manage")) return task;
        if (task.CreatorUserId == user.Id || task.AssigneeUserId == user.Id) return task;
        if (await db.TaskParticipants.AnyAsync(x => x.TaskId == task.Id && x.UserId == user.Id, cancellationToken))
            return task;
        if (await db.UserDepartments.AnyAsync(x => x.UserId == user.Id
            && x.DepartmentId == task.CurrentDepartmentId && x.IsCoordinator, cancellationToken))
            return task;
        if (await db.TaskParticipants.AnyAsync(x => x.TaskId == task.Id, cancellationToken))
            throw new DomainException("Esta tarefa possui acesso restrito aos participantes selecionados.", 403);
        if (actor.HasCapability("tasks", "viewOtherDepartments")) return task;
        if (actor.HasCapability("tasks", "viewOthers")
            && await db.UserDepartments.AnyAsync(x => x.UserId == user.Id && x.DepartmentId == task.CurrentDepartmentId, cancellationToken))
            return task;
        throw new DomainException("Você não possui acesso a esta tarefa.", 403);
    }

    private async Task<TaskSlaPolicy?> ResolveSlaAsync(
        Guid? explicitId, Guid taskTypeId, Guid priorityId, Guid departmentId, CancellationToken cancellationToken)
    {
        if (explicitId.HasValue)
            return await db.TaskSlaPolicies.SingleOrDefaultAsync(x => x.Id == explicitId && x.Active, cancellationToken)
                ?? throw new DomainException("SLA inválido ou inativo.");
        return await db.TaskSlaPolicies.Where(x => x.Active && x.DepartmentId == departmentId
                && (x.TaskTypeId == null || x.TaskTypeId == taskTypeId)
                && (x.PriorityId == null || x.PriorityId == priorityId))
            .OrderByDescending(x => x.TaskTypeId != null).ThenByDescending(x => x.PriorityId != null)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private async Task UpdatePauseStateAsync(CorporateTask task, Guid statusId, CancellationToken cancellationToken)
    {
        if (!task.SlaPolicyId.HasValue) return;
        var pauses = await db.TaskSlaPauseStatuses.AnyAsync(
            x => x.SlaPolicyId == task.SlaPolicyId && x.StatusId == statusId, cancellationToken);
        if (pauses && !task.SlaPausedAt.HasValue)
            task.SlaPausedAt = DateTimeOffset.UtcNow;
        else if (!pauses && task.SlaPausedAt.HasValue)
        {
            var pauseMinutes = (int)Math.Max(0, (DateTimeOffset.UtcNow - task.SlaPausedAt.Value).TotalMinutes);
            task.AccumulatedPauseMinutes += pauseMinutes;
            task.SlaDueAt = task.SlaDueAt?.AddMinutes(pauseMinutes);
            task.SlaPausedAt = null;
        }
    }

    private void NotifyInterested(CorporateTask task, Guid actorUserId, string eventType, string message)
    {
        foreach (var recipient in new[] { task.CreatorUserId, task.AssigneeUserId }.Where(x => x.HasValue)
                     .Select(x => x!.Value).Where(x => x != actorUserId).Distinct())
            AddNotification(task.Id, recipient, actorUserId, eventType, message);
    }

    private void AddNotification(Guid taskId, Guid recipientId, Guid actorId, string type, string message) =>
        db.TaskNotifications.Add(new()
        {
            TaskId = taskId, RecipientUserId = recipientId, ActorUserId = actorId,
            EventType = type, Message = message,
        });

    private void AddHistory(Guid taskId, Guid actorId, string type, string summary,
        object? previous, object? current, string? justification = null) =>
        db.TaskHistory.Add(new()
        {
            TaskId = taskId, ActorUserId = actorId, EventType = type, Summary = summary,
            PreviousValueJson = JsonSerializer.Serialize(previous ?? new { }, JsonOptions),
            NewValueJson = JsonSerializer.Serialize(current ?? new { }, JsonOptions),
            Justification = justification?.Trim() ?? "",
        });

    private static void RequireCapabilityOrManage(ActorContext actor, string capability)
    {
        if (!actor.HasPermission("tasks", "manage"))
            actor.RequireCapability("tasks", capability);
    }

    private static void RequireCatalogManagement(ActorContext actor)
    {
        if (!actor.HasPermission("catalogs", "manage")
            && !actor.HasPermission("tasks", "manage"))
            actor.RequireCapability("tasks", "manageCatalogs");
    }

    private static DateTimeOffset AddBusinessMinutes(DateTimeOffset start, int minutes, TaskSlaPolicy policy)
    {
        if (minutes <= 0) return start;
        var businessDays = Deserialize<int>(policy.BusinessDaysJson).ToHashSet();
        var cursor = start;
        var remaining = minutes;
        while (remaining > 0)
        {
            var day = (int)cursor.DayOfWeek;
            var date = DateOnly.FromDateTime(cursor.DateTime);
            var dayStart = new DateTimeOffset(date.ToDateTime(policy.BusinessStart), cursor.Offset);
            var dayEnd = new DateTimeOffset(date.ToDateTime(policy.BusinessEnd), cursor.Offset);
            if (!businessDays.Contains(day) || cursor >= dayEnd)
            {
                cursor = new DateTimeOffset(date.AddDays(1).ToDateTime(policy.BusinessStart), cursor.Offset);
                continue;
            }
            if (cursor < dayStart) cursor = dayStart;
            var available = (int)(dayEnd - cursor).TotalMinutes;
            var consume = Math.Min(available, remaining);
            cursor = cursor.AddMinutes(consume);
            remaining -= consume;
            if (remaining > 0)
                cursor = new DateTimeOffset(date.AddDays(1).ToDateTime(policy.BusinessStart), cursor.Offset);
        }
        return cursor;
    }

    private static IReadOnlyCollection<T> Deserialize<T>(string json) =>
        JsonSerializer.Deserialize<List<T>>(json, JsonOptions) ?? [];

    private static string SlaState(CorporateTask task)
    {
        if (task.CompletedAt.HasValue) return "Concluída";
        if (!task.SlaDueAt.HasValue) return "Sem SLA";
        if (task.SlaPausedAt.HasValue) return "Pausado";
        var remaining = task.SlaDueAt.Value - DateTimeOffset.UtcNow;
        if (remaining <= TimeSpan.Zero) return "Vencido";
        if (remaining <= TimeSpan.FromHours(2)) return "Próximo do vencimento";
        return "No prazo";
    }

    private static TaskDepartment Department(string name, string description) =>
        new() { Name = name, Description = description };
    private static TaskPriority Priority(string name, int order, string color, int? due) =>
        new() { Name = name, SeverityOrder = order, Color = color, DefaultDueMinutes = due };
    private static TaskStatusEntity Status(string name, int order, bool initial = false, bool final = false,
        bool pause = false, bool requiresJustification = false) =>
        new()
        {
            Name = name, DisplayOrder = order, KanbanColumn = name, IsInitial = initial,
            IsFinal = final, RequiresJustification = requiresJustification,
            AcceptsNewTasks = !final, ManualMovement = true,
        };
}
