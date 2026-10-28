using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class EmployeePasswordResetTests
{
    [Theory]
    [InlineData(true, true, false)]
    [InlineData(false, true, false)]
    [InlineData(true, false, false)]
    [InlineData(true, true, true)]
    public async Task Reset_checks_permissions_and_preserves_password_when_email_fails(bool authorized, bool active, bool failEmail)
    {
        await using var db = new OperationsDbContext(new DbContextOptionsBuilder<OperationsDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var user = new AppUser { Email = "employee@example.com", DisplayName = "Teste", CreatedBy = "admin", Active = active, PasswordHash = "previous-hash" };
        db.Users.Add(user);
        db.LocalAuthSessions.Add(new LocalAuthSession { UserId = user.Id, TokenHash = "session", ExpiresAt = DateTimeOffset.UtcNow.AddHours(1) });
        await db.SaveChangesAsync();
        var sender = new Sender(failEmail);
        var service = new LocalAuthenticationService(db, sender);
        var actor = new ActorContext("admin@example.com", "Admin", "Admin", "Gestão",
            [new EffectivePermission("admin", true, false, false, false, authorized)]);
        if (!authorized || !active || failEmail)
        {
            await Assert.ThrowsAsync<DomainException>(() => service.ResetEmployeePasswordAsync(user.Id, actor));
            Assert.Equal("previous-hash", user.PasswordHash);
            Assert.Null((await db.LocalAuthSessions.SingleAsync()).RevokedAt);
            Assert.Empty(await db.AuditEvents.ToListAsync());
            Assert.Equal(authorized && active, sender.Called);
        }
        else
        {
            await service.ResetEmployeePasswordAsync(user.Id, actor);
            Assert.Equal(user.Email, sender.Email);
            Assert.NotEqual("previous-hash", user.PasswordHash);
            Assert.NotNull((await db.LocalAuthSessions.SingleAsync()).RevokedAt);
            Assert.Equal("ResetPassword", (await db.AuditEvents.SingleAsync()).Action);
            Assert.Equal(user.Email, (await service.LoginAsync(user.Email, sender.Password!)).Email);
        }
    }

    private sealed class Sender(bool fail) : IPasswordRecoveryEmailSender
    {
        public bool Called { get; private set; }
        public string? Email { get; private set; }
        public string? Password { get; private set; }
        public Task SendAsync(string recipientEmail, string recipientName, string temporaryPassword, CancellationToken cancellationToken = default)
        {
            Called = true; Email = recipientEmail; Password = temporaryPassword;
            if (fail) throw new DomainException("SMTP indisponível", 503);
            return Task.CompletedTask;
        }
    }
}
