namespace Dontus.Operations.Domain;

public sealed class CustomerDontusLink
{
    public Guid CustomerId { get; set; }
    public required string Identification { get; set; }
    public long ExternalClientId { get; set; }
    public long Version { get; set; } = 1;
    public DateTimeOffset LinkedAt { get; set; } = DateTimeOffset.UtcNow;
    public required string LinkedBy { get; set; }
}
