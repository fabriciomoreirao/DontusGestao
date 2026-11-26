namespace Dontus.Operations.Application;

public sealed record SendCommercialFollowupCommand(
    Guid LeadId, long LeadVersion, string Track, string? ClientId, string? ProductVersion,
    string? Owner, Guid? AgendaId, Guid? ResponsibleUserId, DateTimeOffset? StartsAt, string? Description);
