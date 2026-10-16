using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class AgendaServiceTests
{
    [Fact]
    public async Task Allows_meeting_room_reservations_only_for_marked_coordinators()
    {
        await using var db = CreateContext();
        var department = new TaskDepartment { Name = "Administrativo" };
        var user = new AppUser
        {
            Email = "colaborador@dontus.local",
            DisplayName = "Colaborador Dontus",
            Department = department.Name,
            CreatedBy = "teste",
            IsCoordinator = false,
        };
        var calendar = new AgendaCalendar
        {
            Name = "Sala de reunião",
            Description = "Agenda exclusiva para reservar a sala de reuniões.",
            DepartmentId = department.Id,
        };
        var type = new AgendaType { Name = "Reunião" };
        var status = new AgendaStatus { Name = "Reservado" };
        db.AddRange(department, user, calendar, type, status);
        db.UserDepartments.Add(new UserDepartment
        {
            UserId = user.Id,
            DepartmentId = department.Id,
            IsPrimary = true,
        });
        await db.SaveChangesAsync();

        var actor = new ActorContext(
            user.Email,
            user.DisplayName,
            "Colaborador",
            department.Name,
            [new EffectivePermission("work", true, true, true, false, false)]);
        var startsAt = DateTimeOffset.UtcNow.AddDays(1);
        var command = new CreateAgendaCommitmentCommand(
            calendar.Id,
            type.Id,
            status.Id,
            user.Id,
            "Alinhamento semanal",
            "Reserva interna",
            startsAt,
            startsAt.AddHours(1),
            [],
            "none");
        var service = new AgendaService(db);

        var denied = await Assert.ThrowsAsync<DomainException>(() => service.CreateCommitmentAsync(command, actor));
        Assert.Equal(403, denied.StatusCode);
        Assert.Contains("coordenadores", denied.Message, StringComparison.OrdinalIgnoreCase);

        user.IsCoordinator = true;
        await db.SaveChangesAsync();
        var created = await service.CreateCommitmentAsync(command, actor);

        Assert.Single(created);
        Assert.Single(await db.AgendaCommitments.ToListAsync());
    }

    private static OperationsDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<OperationsDbContext>()
            .UseInMemoryDatabase($"dontus-agenda-tests-{Guid.NewGuid():N}")
            .Options;
        return new OperationsDbContext(options);
    }
}
