using System.Net;
using System.Net.Mail;
using System.Text;
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
            throw new DomainException("O envio dos dados de acesso por e-mail não está configurado. Solicite a configuração do SMTP à administração.", 503);

        if (!Uri.TryCreate(configuration["Email:AppUrl"], UriKind.Absolute, out var appUrl)
            || (appUrl.Scheme != Uri.UriSchemeHttps && appUrl.Scheme != Uri.UriSchemeHttp))
            throw new DomainException("Configure o endereço de acesso ao sistema para o envio dos dados por e-mail.", 503);

        var port = configuration.GetValue<int?>("Email:Smtp:Port") ?? 587;
        var useSsl = configuration.GetValue("Email:Smtp:UseSsl", true);
        var username = configuration["Email:Smtp:Username"];
        var password = configuration["Email:Smtp:Password"];

        using var message = new MailMessage
        {
            From = new MailAddress(from, "Dontus Gestão"),
            Subject = "Seus dados de acesso — Dontus",
            IsBodyHtml = true,
            BodyEncoding = Encoding.UTF8,
            Body = $"""
                <p>Olá, {WebUtility.HtmlEncode(recipientName)}.</p>
                <p>Seus dados de acesso à Dontus foram gerados.</p>
                <p>Endereço de acesso: <a href="{WebUtility.HtmlEncode(appUrl.AbsoluteUri)}">{WebUtility.HtmlEncode(appUrl.AbsoluteUri)}</a></p>
                <p>E-mail de acesso: {WebUtility.HtmlEncode(recipientEmail)}</p>
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

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(10));
        try
        {
            await client.SendMailAsync(message, timeout.Token);
        }
        catch (SmtpException)
        {
            throw new DomainException("Não foi possível enviar os dados de acesso por e-mail. Verifique a configuração do SMTP e tente novamente.", 503);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new DomainException("O envio dos dados de acesso por e-mail excedeu o tempo limite. Tente novamente.", 503);
        }
    }
}
