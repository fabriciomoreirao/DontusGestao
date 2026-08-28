namespace Dontus.Operations.Application;

public sealed record LocalLoginResult(string Token, string Email, string DisplayName);

public interface ILocalAuthenticationService
{
    Task<LocalLoginResult> LoginAsync(string email, string password, CancellationToken cancellationToken = default);
    Task<AuthenticatedIdentity?> ResolveSessionAsync(string token, CancellationToken cancellationToken = default);
    Task ChangePasswordAsync(string email, string currentPassword, string newPassword, CancellationToken cancellationToken = default);
    Task RequestPasswordRecoveryAsync(string email, CancellationToken cancellationToken = default);
    Task SignOutAsync(string token, CancellationToken cancellationToken = default);
}

public interface IPasswordRecoveryEmailSender
{
    Task SendAsync(string recipientEmail, string recipientName, string temporaryPassword, CancellationToken cancellationToken = default);
}
