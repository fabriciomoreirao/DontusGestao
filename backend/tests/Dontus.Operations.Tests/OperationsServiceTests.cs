using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class OperationsServiceTests
{
    [Fact]
    public async Task New_users_do_not_receive_notices_or_reminders_created_before_registration()
    {
        await using var db = CreateContext();
        var registeredAt = DateTimeOffset.UtcNow.AddHours(-1);
        var user = new AppUser { Email = Actor.Email, DisplayName = Actor.DisplayName,
            CreatedBy = Actor.Email, CreatedAt = registeredAt };
        db.Users.Add(user);
        var oldNotice = new CompanyNotice { Title = "Antigo", AuthorUserId = user.Id,
            CreatedAt = registeredAt.AddDays(-1), PublishedAt = registeredAt.AddDays(-1) };
        var newNotice = new CompanyNotice { Title = "Novo", AuthorUserId = user.Id };
        db.CompanyNotices.AddRange(oldNotice, newNotice);
        db.WorkItems.AddRange(
            new WorkItem { Module = "reminders", RecordType = "Lembrete", Title = "Antigo", Status = "Pendente",
                CustomerName = user.Email, Owner = user.DisplayName, CreatedBy = user.Email, CreatedAt = registeredAt.AddDays(-1) },
            new WorkItem { Module = "reminders", RecordType = "Lembrete", Title = "Novo", Status = "Pendente",
                CustomerName = user.Email, Owner = user.DisplayName, CreatedBy = user.Email });
        await db.SaveChangesAsync();
        var service = new OperationsService(db);
        var recipient = Actor with { Permissions = [new EffectivePermission("notices", true, false, false, false, false),
            new EffectivePermission("reminders", true, false, false, false, false)] };
        var notices = await service.GetNoticesModuleAsync(recipient);
        Assert.Equal(newNotice.Id, Assert.Single(notices.Notices).Id);
        Assert.False((await service.GetNoticesModuleAsync(Actor)).Notices.Single(n => n.Id == oldNotice.Id).VisibleToCurrentUser);
        Assert.Equal("Novo", Assert.Single((await service.GetSnapshotAsync(recipient)).Items).Title);
        await Assert.ThrowsAsync<DomainException>(() => service.MarkNoticeReadAsync(oldNotice.Id, recipient));
    }

    private static readonly ActorContext Actor =
        new(
            "gestor@dontus.local",
            "Gestor Dontus",
            "Administradores",
            "Gestão",
            ScreenCatalog.All.Select(screen =>
                new EffectivePermission(screen.Code, true, true, true, true, true)).ToArray());

    [Fact]
    public async Task Creates_a_strategic_clinic_inside_the_selected_network_with_its_registration()
    {
        await using var db = CreateContext();
        var network = new WorkItem { Module = "cs", RecordType = "Conta estratégica", Title = "Rede ativa", Status = "Em acompanhamento", CreatedBy = Actor.Email, Description = "{\"kind\":\"enterpriseNetwork\",\"units\":[],\"history\":[]}" };
        db.WorkItems.Add(network);
        await db.SaveChangesAsync();
        var service = new OperationsService(db);
        var customerId = await service.CreateCustomerAsync(new CreateCustomerCommand(
            "Clínica Ltda", "Unidade Centro", "123456", "Clínica", "Comercial", "CS", 1, 15000, true, network.Id,
            "Cliente", "Dontus", "Essencial", null, null, null, null, null, null, null, "teste@example.com", "11999999999", null, "Observação", "Rua Central", "São Paulo", "SP"), Actor);
        using var data = System.Text.Json.JsonDocument.Parse(network.Description);
        var unit = Assert.Single(data.RootElement.GetProperty("units").EnumerateArray());
        Assert.Equal(customerId.ToString(), unit.GetProperty("customerId").GetString());
        Assert.Equal("123456", unit.GetProperty("externalId").GetString());
        Assert.Equal("São Paulo", unit.GetProperty("city").GetString());
        Assert.Contains("Essencial", unit.GetProperty("notes").GetString());
    }

    [Fact]
    public async Task Creates_customer_and_audit_in_the_same_unit_of_work()
    {
        await using var db = CreateContext();
        var service = new OperationsService(db);
        await service.InitializeAsync();

        var id = await service.CreateCustomerAsync(
            new CreateCustomerCommand(
                "Clínica Teste Ltda.",
                "Clínica Teste",
                "***.***.***/****-**",
                "Clínica odontológica",
                null,
                null,
                2,
                125_000,
                false,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null),
            Actor);

        Assert.NotEqual(Guid.Empty, id);
        Assert.Single(await db.Customers.ToListAsync());
        var audit = Assert.Single(await db.AuditEvents.ToListAsync());
        Assert.Equal("Create", audit.Action);
        Assert.Equal("customer", audit.Resource);
    }

    [Fact]
    public async Task Blocks_overlapping_appointments_for_the_same_owner()
    {
        await using var db = CreateContext();
        var service = new OperationsService(db);
        var start = DateTimeOffset.UtcNow.AddDays(1);

        await service.CreateAppointmentAsync(
            new CreateAppointmentCommand(
                "Treinamento",
                "Treinamento",
                null,
                null,
                "Beatriz Lima",
                "CS",
                start,
                start.AddHours(1),
                null),
            Actor);

        var exception = await Assert.ThrowsAsync<DomainException>(() =>
            service.CreateAppointmentAsync(
                new CreateAppointmentCommand(
                    "Onboarding",
                    "Reunião",
                    null,
                    null,
                    "Beatriz Lima",
                    "CS",
                    start.AddMinutes(30),
                    start.AddHours(2),
                    null),
                Actor));

        Assert.Equal(409, exception.StatusCode);
    }

    [Fact]
    public async Task Blocks_self_approval()
    {
        await using var db = CreateContext();
        var approval = new Approval
        {
            Kind = "Compra",
            SourceId = Guid.NewGuid(),
            SourceTitle = "Notebooks",
            Requester = Actor.Email,
            ApproverRole = "Aprovador Financeiro",
            AmountCents = 100_000,
        };
        db.Approvals.Add(approval);
        await db.SaveChangesAsync();
        var service = new OperationsService(db);

        var exception = await Assert.ThrowsAsync<DomainException>(() =>
            service.DecideApprovalAsync(
                new DecideApprovalCommand(approval.Id, "Aprovado", null),
                Actor));

        Assert.Equal(403, exception.StatusCode);
        Assert.Equal("Pendente", approval.Status);
    }

    [Fact]
    public async Task Enforces_optimistic_version_on_workflow_transition()
    {
        await using var db = CreateContext();
        var service = new OperationsService(db);
        var id = await service.CreateWorkItemAsync(
            new CreateWorkItemCommand(
                "support",
                "Ticket",
                "Falha na conciliação",
                null,
                null,
                null,
                "Suporte",
                "P1",
                null,
                null,
                0,
                null,
                [],
                null,
                null),
            Actor);

        var exception = await Assert.ThrowsAsync<DomainException>(() =>
            service.TransitionWorkItemAsync(
                new TransitionWorkItemCommand(id, "EmAtendimento", 99, false),
                Actor));

        Assert.Equal(409, exception.StatusCode);
    }

    [Fact]
    public async Task Publishes_company_notice_and_tracks_read_confirmation()
    {
        await using var db = CreateContext();
        var manager = new AppUser
        {
            Email = Actor.Email,
            DisplayName = Actor.DisplayName,
            CreatedBy = "tests@dontus.local"
        };
        var recipient = new AppUser
        {
            Email = "colaborador@dontus.local",
            DisplayName = "Colaborador Teste",
            CreatedBy = Actor.Email
        };
        db.Users.AddRange(manager, recipient);
        await db.SaveChangesAsync();
        var service = new OperationsService(db);
        var recipientActor = new ActorContext(
            recipient.Email, recipient.DisplayName, "Colaboradores", "Suporte",
            [new EffectivePermission("notices", true, false, false, false, false)]);

        var id = await service.SaveNoticeAsync(
            null, "Encontro da equipe", "Confirme sua presença no encontro.",
            "Importante", "Evento", "Colaborador", recipient.Id,
            DateTimeOffset.UtcNow.AddDays(1), DateTimeOffset.UtcNow.AddDays(2),
            "data:image/png;base64,AA==", true, Actor);
        var beforeRead = await service.GetNoticesModuleAsync(recipientActor);
        var pending = beforeRead.Notices.Single(x => x.Id == id);
        Assert.False(pending.IsRead);
        Assert.True(pending.VisibleToCurrentUser);
        Assert.Equal("Evento", pending.Kind);

        await service.MarkNoticeViewedAsync(id, recipientActor);
        var afterView = await service.GetNoticesModuleAsync(Actor);
        Assert.Equal(1, afterView.Notices.Single(x => x.Id == id).ViewedCount);
        Assert.Equal(0, afterView.Notices.Single(x => x.Id == id).ReadCount);

        await service.MarkNoticeReadAsync(id, recipientActor);

        var afterRead = await service.GetNoticesModuleAsync(Actor);
        var notice = afterRead.Notices.Single(x => x.Id == id);
        Assert.False(notice.VisibleToCurrentUser);
        Assert.Equal(1, notice.ReadCount);
        Assert.Single(notice.Recipients);
        Assert.NotNull(notice.Recipients.Single().ConfirmedAt);
    }

    [Fact]
    public async Task Diary_lists_only_commitments_assigned_to_the_authenticated_user()
    {
        await using var db = CreateContext();
        var currentUser = new AppUser
        {
            Email = Actor.Email,
            DisplayName = Actor.DisplayName,
            CreatedBy = "tests@dontus.local"
        };
        var otherUser = new AppUser
        {
            Email = "outro@dontus.local",
            DisplayName = "Outro Colaborador",
            CreatedBy = Actor.Email
        };
        var status = new AgendaStatus { Name = "Reservada", Color = "#2563eb" };
        db.Users.AddRange(currentUser, otherUser);
        db.AgendaStatuses.Add(status);
        await db.SaveChangesAsync();

        var startsAt = DateTimeOffset.UtcNow.AddDays(1);
        var ownCommitment = new AgendaCommitment
        {
            AgendaStatusId = status.Id,
            ResponsibleUserId = currentUser.Id,
            Title = "Compromisso do gestor",
            StartsAt = startsAt,
            EndsAt = startsAt.AddHours(1),
            CreatedBy = otherUser.Email
        };
        var otherCommitment = new AgendaCommitment
        {
            AgendaStatusId = status.Id,
            ResponsibleUserId = otherUser.Id,
            Title = "Compromisso de outro colaborador",
            StartsAt = startsAt.AddHours(2),
            EndsAt = startsAt.AddHours(3),
            CreatedBy = Actor.Email
        };
        db.AgendaCommitments.AddRange(ownCommitment, otherCommitment);
        db.AgendaCommitmentParticipants.Add(new AgendaCommitmentParticipant
        {
            CommitmentId = otherCommitment.Id,
            UserId = currentUser.Id
        });
        await db.SaveChangesAsync();

        var diary = await new OperationsService(db).GetDiaryModuleAsync(Actor);

        var entry = Assert.Single(diary.Entries);
        Assert.Equal(ownCommitment.Id, entry.Id);
        Assert.DoesNotContain(diary.Entries, item => item.Id == otherCommitment.Id);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Diary_supervision_is_limited_to_active_direct_reports_and_requires_coordinator_flag(bool isCoordinator)
    {
        await using var db = CreateContext();
        var coordinator = new AppUser { Email = Actor.Email, DisplayName = Actor.DisplayName, CreatedBy = Actor.Email, IsCoordinator = isCoordinator };
        var subordinate = new AppUser { Email = "equipe@dontus.local", DisplayName = "Colaborador vinculado", CreatedBy = Actor.Email };
        var unrelated = new AppUser { Email = "outro@dontus.local", DisplayName = "Mesmo setor sem vínculo", CreatedBy = Actor.Email };
        var inactive = new AppUser { Email = "inativo@dontus.local", DisplayName = "Inativo", Active = false, CreatedBy = Actor.Email };
        var blocked = new AppUser { Email = "bloqueado@dontus.local", DisplayName = "Bloqueado", BlockedAt = DateTimeOffset.UtcNow, CreatedBy = Actor.Email };
        var indirect = new AppUser { Email = "indireto@dontus.local", DisplayName = "Subordinado indireto", CreatedBy = Actor.Email };
        db.Users.AddRange(coordinator, subordinate, unrelated, inactive, blocked, indirect);
        db.EmployeeSupervisions.AddRange(
            new EmployeeSupervision { CoordinatorUserId = coordinator.Id, SubordinateUserId = subordinate.Id },
            new EmployeeSupervision { CoordinatorUserId = coordinator.Id, SubordinateUserId = inactive.Id },
            new EmployeeSupervision { CoordinatorUserId = coordinator.Id, SubordinateUserId = blocked.Id },
            new EmployeeSupervision { CoordinatorUserId = subordinate.Id, SubordinateUserId = indirect.Id });
        var status = new AgendaStatus { Name = "Reservada", Color = "#2563eb" };
        db.AgendaStatuses.Add(status);
        var now = DateTimeOffset.UtcNow;
        var own = new WorkItem { Module = "diary", RecordType = "Tarefa", Title = "Minha atividade", Status = "Pendente", CreatedBy = coordinator.Email };
        var manual = new WorkItem { Module = "diary", RecordType = "Tarefa", Title = "Atividade da equipe", Status = "Pendente", CreatedBy = subordinate.Email,
            CreatedAt = now.AddMonths(-2), DueAt = now };
        db.WorkItems.AddRange(own, manual,
            new WorkItem { Module = "diary", RecordType = "Tarefa", Title = "Atividade sem vínculo", Status = "Pendente", CreatedBy = unrelated.Email });
        var commitment = new AgendaCommitment { AgendaStatusId = status.Id, ResponsibleUserId = subordinate.Id, Title = "Agenda da equipe", StartsAt = now, EndsAt = now.AddHours(1), CreatedBy = unrelated.Email };
        db.AgendaCommitments.AddRange(commitment,
            new AgendaCommitment { AgendaStatusId = status.Id, ResponsibleUserId = unrelated.Id, Title = "Agenda sem vínculo", StartsAt = now, EndsAt = now.AddHours(1), CreatedBy = coordinator.Email });
        await db.SaveChangesAsync();
        var service = new OperationsService(db);
        // A consulta exige apenas visualizar o diário, sem acesso administrativo ou à Agenda.
        var readOnlyActor = Actor with { Permissions = [new EffectivePermission("diary", true, false, false, false, false)] };
        var diary = await service.GetDiaryModuleAsync(readOnlyActor);
        Assert.Equal(own.Id, Assert.Single(diary.Entries).Id);
        if (!isCoordinator) { Assert.Empty(diary.Collaborators); return; }
        var report = Assert.Single(diary.Collaborators);
        Assert.Equal(subordinate.Id, report.UserId);
        Assert.Equal(2, report.Entries.Count);
        Assert.Contains(report.Entries, entry => entry.Id == manual.Id && entry.Source == "manual");
        Assert.Contains(report.Entries, entry => entry.Id == commitment.Id && entry.Source == "agenda");
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.UpdateWorkItemAsync(
            new UpdateWorkItemCommand(manual.Id, "Alteração indevida", "", 0, "", null, null, manual.Version), Actor))).StatusCode);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.TransitionWorkItemAsync(
            new TransitionWorkItemCommand(manual.Id, "Concluída", manual.Version, true), Actor))).StatusCode);
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.DeleteWorkItemAsync(manual.Id, Actor))).StatusCode);
        db.EmployeeSupervisions.RemoveRange(db.EmployeeSupervisions.Where(link => link.CoordinatorUserId == coordinator.Id));
        await db.SaveChangesAsync();
        Assert.Empty((await service.GetDiaryModuleAsync(readOnlyActor)).Collaborators);
        var deniedActor = Actor with { Permissions = [] };
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.GetDiaryModuleAsync(deniedActor))).StatusCode);
    }

    private static OperationsDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<OperationsDbContext>()
            .UseInMemoryDatabase($"dontus-tests-{Guid.NewGuid():N}")
            .Options;
        return new OperationsDbContext(options);
    }
}
