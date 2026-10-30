using System.Net;
using System.Net.Sockets;
using System.Text;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.Extensions.Configuration;

namespace Dontus.Operations.Tests;

public sealed class SmtpPasswordEmailTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Sends_complete_access_details_and_reports_smtp_rejection(bool rejectRecipient)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var delivery = ReceiveAsync(listener, rejectRecipient, timeout.Token);
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Email:Smtp:Host"] = "127.0.0.1",
            ["Email:Smtp:Port"] = ((IPEndPoint)listener.LocalEndpoint).Port.ToString(),
            ["Email:Smtp:UseSsl"] = "false",
            ["Email:Smtp:From"] = "access@example.com",
            ["Email:AppUrl"] = "https://gestao.example.com/login?source=email&kind=access",
        }).Build();
        var sender = new SmtpPasswordRecoveryEmailSender(configuration);

        if (rejectRecipient)
        {
            var error = await Assert.ThrowsAsync<DomainException>(() => sender.SendAsync("user@example.com", "Usuário", "Temporary-password!", timeout.Token));
            Assert.Equal(503, error.StatusCode);
            Assert.Contains("SMTP", error.Message);
        }
        else
        {
            await sender.SendAsync("user@example.com", "Nome <teste>", "Temporary-password!", timeout.Token);
        }

        var rawMessage = await delivery.WaitAsync(timeout.Token);
        if (rejectRecipient) { Assert.Empty(rawMessage); return; }
        Assert.Contains("To: user@example.com", rawMessage);
        Assert.Contains("Content-Transfer-Encoding: base64", rawMessage);
        var body = Encoding.UTF8.GetString(Convert.FromBase64String(rawMessage.Split("\r\n\r\n", 2)[1]));
        Assert.Contains("Nome &lt;teste&gt;", body);
        Assert.DoesNotContain("Nome <teste>", body);
        Assert.Contains("user@example.com", body);
        Assert.Contains("Temporary-password!", body);
        Assert.Contains("href=\"https://gestao.example.com/login?source=email&amp;kind=access\"", body);
        Assert.Contains("altere essa senha", body);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("invalid")]
    [InlineData("javascript:alert(1)")]
    public async Task Requires_a_valid_access_url_before_sending(string? url)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Email:Smtp:Host"] = "127.0.0.1",
            ["Email:Smtp:From"] = "access@example.com",
            ["Email:AppUrl"] = url,
        }).Build();
        var error = await Assert.ThrowsAsync<DomainException>(() => new SmtpPasswordRecoveryEmailSender(configuration)
            .SendAsync("user@example.com", "Usuário", "Temporary-password!"));
        Assert.Equal(503, error.StatusCode);
        Assert.Contains("endereço de acesso", error.Message);
    }

    [Fact]
    public async Task Reports_missing_smtp_configuration()
    {
        var error = await Assert.ThrowsAsync<DomainException>(() => new SmtpPasswordRecoveryEmailSender(new ConfigurationBuilder().Build())
            .SendAsync("user@example.com", "Usuário", "Temporary-password!"));
        Assert.Equal(503, error.StatusCode);
        Assert.Contains("SMTP", error.Message);
    }

    private static async Task<string> ReceiveAsync(TcpListener listener, bool rejectRecipient, CancellationToken cancellationToken)
    {
        using var client = await listener.AcceptTcpClientAsync(cancellationToken);
        await using var stream = client.GetStream();
        using var reader = new StreamReader(stream, Encoding.ASCII, leaveOpen: true);
        await using var writer = new StreamWriter(stream, Encoding.ASCII, leaveOpen: true) { NewLine = "\r\n", AutoFlush = true };
        await writer.WriteLineAsync("220 localhost test SMTP");
        var message = new StringBuilder();
        while (await reader.ReadLineAsync(cancellationToken) is { } line)
        {
            if (line == "QUIT") { await writer.WriteLineAsync("221 Bye"); break; }
            if (rejectRecipient && line.StartsWith("RCPT TO:", StringComparison.OrdinalIgnoreCase))
            {
                await writer.WriteLineAsync("550 Recipient rejected");
                continue;
            }
            if (line == "DATA")
            {
                await writer.WriteLineAsync("354 End with a dot");
                while (await reader.ReadLineAsync(cancellationToken) is { } data && data != ".")
                    message.Append(data).Append("\r\n");
            }
            await writer.WriteLineAsync("250 OK");
        }
        return message.ToString();
    }
}
