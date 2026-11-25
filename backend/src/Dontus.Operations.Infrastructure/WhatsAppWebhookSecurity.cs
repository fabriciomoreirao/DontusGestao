using System.Security.Cryptography;
using System.Text;

namespace Dontus.Operations.Infrastructure;

public static class WhatsAppWebhookSecurity
{
    public static bool TokenMatches(string provided, string configured) =>
        !string.IsNullOrWhiteSpace(provided) && !string.IsNullOrWhiteSpace(configured) &&
        CryptographicOperations.FixedTimeEquals(SHA256.HashData(Encoding.UTF8.GetBytes(provided)), SHA256.HashData(Encoding.UTF8.GetBytes(configured)));

    public static bool VerifySignature(string payload, string signature, string secret)
    {
        if (string.IsNullOrWhiteSpace(secret) || !signature.StartsWith("sha256=", StringComparison.OrdinalIgnoreCase)) return false;
        try
        {
            var received = Convert.FromHexString(signature[7..]);
            var expected = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(payload));
            return CryptographicOperations.FixedTimeEquals(expected, received);
        }
        catch (FormatException) { return false; }
    }
}
