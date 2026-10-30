using Dontus.Operations.Application;
using Dontus.Operations.Domain;

namespace Dontus.Operations.Tests;

internal sealed class RecordingPasswordEmailSender : IPasswordRecoveryEmailSender
{
    public List<(string Email, string Name, string Password)> Messages { get; } = [];
    public bool Fail { get; set; }

    public Task SendAsync(string recipientEmail, string recipientName, string temporaryPassword, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (Fail) throw new DomainException("SMTP indisponível", 503);
        Messages.Add((recipientEmail, recipientName, temporaryPassword));
        return Task.CompletedTask;
    }
}
