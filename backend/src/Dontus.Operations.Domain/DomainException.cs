namespace Dontus.Operations.Domain;

public sealed class DomainException(string message, int statusCode = 400, string? code = null) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
    public string? Code { get; } = code;
}
