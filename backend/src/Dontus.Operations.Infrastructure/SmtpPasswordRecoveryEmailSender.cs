using System.Net;
using System.Net.Mail;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.Extensions.Configuration;

namespace Dontus.Operations.Infrastructure;

public sealed class SmtpPasswordRecoveryEmailSender(IConfiguration configuration) : IPasswordRecoveryEmailSender
{
    public async Task SendAsync(string recipientEmail, string recipientName, string temporaryPassword, CancellationToken cancellationToken = default)
    {
        var host = configuration["Email:Smtp:Host"];
        var from = configuration["Email:Smtp:From"];
        if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(from))
            throw new DomainException("A recuperação de senha ainda não está configurada para envio de e-mail.", 503);

        var port = configuration.GetValue<int?>("Email:Smtp:Port") ?? 587;
        var useSsl = configuration.GetValue("Email:Smtp:UseSsl", true);
        var username = configuration["Email:Smtp:Username"];
        var password = configuration["Email:Smtp:Password"];

        using var message = new MailMessage
        {
            From = new MailAddress(from, "Dontus Gestão"),
            Subject = "Sua nova senha de acesso — Dontus",
            IsBodyHtml = true,
            Body = $"""
                <p>Olá, {WebUtility.HtmlEncode(recipientName)}.</p>
                <p>Recebemos uma solicitação para redefinir a sua senha de acesso à Dontus.</p>
                <p>Use a senha temporária abaixo para entrar:</p>
                <p style="font-size:18px;font-weight:700;letter-spacing:1px">{WebUtility.HtmlEncode(temporaryPassword)}</p>
                <p>Após acessar, altere essa senha pelo menu da sua conta.</p>
                <p>Se não foi você quem solicitou, informe a administração.</p>
                """,
        };
        message.To.Add(new MailAddress(recipientEmail));

        using var client = new SmtpClient(host, port)
        {
            EnableSsl = useSsl,
            DeliveryMethod = SmtpDeliveryMethod.Network,
        };
        if (!string.IsNullOrWhiteSpace(username))
            client.Credentials = new NetworkCredential(username, password);

        cancellationToken.ThrowIfCancellationRequested();
        await client.SendMailAsync(message);
    }
}
