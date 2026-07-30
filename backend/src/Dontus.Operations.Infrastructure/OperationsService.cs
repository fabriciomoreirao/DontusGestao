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

        var customers = actor.HasPermission("customers", "view")
            ? await db.Customers.AsNoTracking()
            .OrderByDescending(x => x.UpdatedAt)
            .Take(100)
            .Select(x => new CustomerDto(
                x.Id, x.LegalName, x.TradeName, x.DocumentMasked, x.Segment, x.Status,
                x.Owner, x.CsOwner, x.SupportOwner, x.Strategic ? 1 : 0, x.ClinicsCount,
                x.MonthlyRevenueCents, x.CreatedAt))
            .ToListAsync(cancellationToken)
            : [];

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

        return new OperationsSnapshot(
            new UserDto(actor.Email, actor.DisplayName, actor.Role, actor.Department, actor.Permissions ?? []),
            customers, items, appointments, approvals, decisions, audit, moduleCounts);
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
            CreatedBy = actor.Email,
        };

        db.Customers.Add(customer);
        AddAudit(actor, "Create", "customer", customer.Id.ToString(), "customers", new { customer.TradeName });
        await db.SaveChangesAsync(cancellationToken);
        return customer.Id;
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

        var item = new WorkItem
        {
            Module = command.Module.Trim(),
            RecordType = command.RecordType.Trim(),
            Title = command.Title.Trim(),
            CustomerId = command.CustomerId,
            CustomerName = command.CustomerName?.Trim() ?? "",
            Owner = string.IsNullOrWhiteSpace(command.Owner) ? actor.DisplayName : command.Owner.Trim(),
            Team = command.Team?.Trim() ?? "",
            Status = WorkflowPolicy.InitialStatus(command.Module),
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

    public async Task TransitionWorkItemAsync(
        TransitionWorkItemCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default)
    {
        var item = await db.WorkItems.SingleOrDefaultAsync(x => x.Id == command.Id, cancellationToken)
            ?? throw new DomainException("Registro não encontrado.", 404);
        actor.RequirePermission(item.Module, "edit");

        if (item.Version != command.Version)
            throw new DomainException("O registro foi alterado por outro usuário. Atualize a tela e tente novamente.", 409);

        if (!WorkflowPolicy.CanTransition(item.Module, item.Status, command.NextStatus))
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
