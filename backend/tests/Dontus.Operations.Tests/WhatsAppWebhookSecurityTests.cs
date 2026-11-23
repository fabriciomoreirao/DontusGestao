using System.Security.Cryptography;
using System.Text;
using Dontus.Operations.Infrastructure;

namespace Dontus.Operations.Tests;

public sealed class WhatsAppWebhookSecurityTests
{
    [Theory]
    [InlineData("", "", false)]
    [InlineData("test", "", false)]
    [InlineData("", "test", false)]
    [InlineData("test", "test", true)]
    [InlineData("test", "other", false)]
    public void Verification_requires_configured_matching_token(string given, string configured, bool accepted) =>
        Assert.Equal(accepted, WhatsAppWebhookSecurity.TokenMatches(given, configured));

    [Fact]
    public void Signature_authenticates_exact_utf8_body_and_rejects_tampering()
    {
        const string secret = "test-webhook-secret";
        const string body = "{\"text\":\"Olá, cliente!\"}";
        var signature = "sha256=" + Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(body))).ToLowerInvariant();
        Assert.True(WhatsAppWebhookSecurity.VerifySignature(body, signature, secret));
        Assert.False(WhatsAppWebhookSecurity.VerifySignature(body + " ", signature, secret));
        Assert.False(WhatsAppWebhookSecurity.VerifySignature(body, signature, "other-secret"));
        Assert.False(WhatsAppWebhookSecurity.VerifySignature(body, signature, ""));
        Assert.False(WhatsAppWebhookSecurity.VerifySignature(body, "sha256=not-hex", secret));
    }
}
