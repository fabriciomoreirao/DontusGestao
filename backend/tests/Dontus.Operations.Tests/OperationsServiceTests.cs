using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class OperationsServiceTests
{
    private static readonly ActorContext Actor =
        new(
            "gestor@dontus.local",
            "Gestor Dontus",
            "Administradores",
            "Gestão",
            ScreenCatalog.All.Select(screen =>
                new EffectivePermission(screen.Code, true, true, true, true, true)).ToArray());

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
                true),
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

    private static OperationsDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<OperationsDbContext>()
            .UseInMemoryDatabase($"dontus-tests-{Guid.NewGuid():N}")
            .Options;
        return new OperationsDbContext(options);
    }
}
