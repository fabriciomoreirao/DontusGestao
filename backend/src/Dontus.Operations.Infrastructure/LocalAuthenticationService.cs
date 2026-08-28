using System.Security.Cryptography;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Infrastructure;

public sealed class LocalAuthenticationService(OperationsDbContext db, IPasswordRecoveryEmailSender passwordRecoveryEmailSender) : ILocalAuthenticationService
{
    public async Task<LocalLoginResult> LoginAsync(string email, string password, CancellationToken cancellationToken = default)
    {
        var normalizedEmail = NormalizeEmail(email);
        var user = await db.Users.SingleOrDefaultAsync(entry => entry.Email == normalizedEmail, cancellationToken);
        if (user is null || !user.Active || !PasswordSecurity.Verify(password, user.PasswordHash))
            throw new DomainException("E-mail ou senha inválidos.", 401);

        var token = PasswordSecurity.GenerateToken();
        db.LocalAuthSessions.Add(new LocalAuthSession
        {
            UserId = user.Id,
            TokenHash = PasswordSecurity.HashToken(token),
            ExpiresAt = DateTimeOffset.UtcNow.AddHours(12),
        });
        user.LastAccessAt = DateTimeOffset.UtcNow;
        user.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return new LocalLoginResult(token, user.Email, user.DisplayName);
    }

    public async Task<AuthenticatedIdentity?> ResolveSessionAsync(string token, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;
        var tokenHash = PasswordSecurity.HashToken(token);
        var session = await db.LocalAuthSessions.AsNoTracking()
            .Where(entry => entry.TokenHash == tokenHash && entry.RevokedAt == null && entry.ExpiresAt > DateTimeOffset.UtcNow)
            .Join(db.Users.AsNoTracking(), entry => entry.UserId, user => user.Id, (entry, user) => new { user.Email, user.DisplayName, user.Active })
            .SingleOrDefaultAsync(cancellationToken);
        return session is null || !session.Active ? null : new AuthenticatedIdentity(session.Email, session.DisplayName);
    }

    public async Task ChangePasswordAsync(string email, string currentPassword, string newPassword, CancellationToken cancellationToken = default)
    {
        ValidatePassword(newPassword);
        var user = await db.Users.SingleOrDefaultAsync(entry => entry.Email == NormalizeEmail(email), cancellationToken)
            ?? throw new DomainException("Usuário não encontrado.", 404);
        if (!PasswordSecurity.Verify(currentPassword, user.PasswordHash))
            throw new DomainException("A senha atual não confere.", 400);
        user.PasswordHash = PasswordSecurity.Hash(newPassword);
        user.UpdatedAt = DateTimeOffset.UtcNow;
        user.Version++;
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task RequestPasswordRecoveryAsync(string email, CancellationToken cancellationToken = default)
    {
        var user = await db.Users.SingleOrDefaultAsync(entry => entry.Email == NormalizeEmail(email), cancellationToken);
        if (user is null || !user.Active) return;

        var temporaryPassword = PasswordSecurity.GenerateTemporaryPassword();
        await passwordRecoveryEmailSender.SendAsync(user.Email, user.DisplayName, temporaryPassword, cancellationToken);

        user.PasswordHash = PasswordSecurity.Hash(temporaryPassword);
        user.UpdatedAt = DateTimeOffset.UtcNow;
        user.Version++;

        var activeSessions = await db.LocalAuthSessions
            .Where(entry => entry.UserId == user.Id && entry.RevokedAt == null)
            .ToListAsync(cancellationToken);
        foreach (var session in activeSessions) session.RevokedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task SignOutAsync(string token, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(token)) return;
        var session = await db.LocalAuthSessions.SingleOrDefaultAsync(
            entry => entry.TokenHash == PasswordSecurity.HashToken(token), cancellationToken);
        if (session is null || session.RevokedAt is not null) return;
        session.RevokedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
    }

    internal static void ValidatePassword(string password)
    {
        if (string.IsNullOrWhiteSpace(password) || password.Length < 10)
            throw new DomainException("A senha deve ter ao menos 10 caracteres.");
    }

    private static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();
}

internal static class PasswordSecurity
{
    private const int Iterations = 210_000;

    public static string Hash(string password)
    {
        LocalAuthenticationService.ValidatePassword(password);
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA512, 32);
        return $"v1${Iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }

    public static bool Verify(string password, string storedHash)
    {
        try
        {
            var parts = storedHash.Split('$');
            if (parts.Length != 4 || parts[0] != "v1" || !int.TryParse(parts[1], out var iterations)) return false;
            var salt = Convert.FromBase64String(parts[2]);
            var expected = Convert.FromBase64String(parts[3]);
            var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA512, expected.Length);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch (FormatException)
        {
            return false;
        }
    }

    public static string GenerateTemporaryPassword() => $"Dt!{Convert.ToHexString(RandomNumberGenerator.GetBytes(6)).ToLowerInvariant()}a9";
    public static string GenerateToken() => Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
    public static string HashToken(string token) => Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(token))).ToLowerInvariant();
}
