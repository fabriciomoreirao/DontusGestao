namespace Dontus.Operations.Application;

public sealed record CsDistributionCollaboratorDto(Guid UserId, string DisplayName, string Department, string PhotoDataUrl,
    int TotalClients, int ActiveClients, IReadOnlyDictionary<string, int> ClientsByVersion, DateTimeOffset? LastAssignedAt)
{
    public IReadOnlyCollection<CsDistributionPortfolioCountDto> CurrentPortfolio { get; init; } = [];
}
public sealed record CsDistributionPortfolioCountDto(string Phase, string Version, int Quantity);
public sealed record CsDistributionQueueDto(string Version, Guid? SuggestedUserId, Guid? LastRecipientUserId,
    string? LastRecipientName, DateTimeOffset? LastAssignedAt, IReadOnlyCollection<Guid> OrderedUserIds);
public sealed record CsDistributionClientDto(Guid WorkItemId, string Version);
public sealed record CsDistributionDto(string Track, DateTimeOffset UpdatedAt,
    IReadOnlyCollection<CsDistributionCollaboratorDto> Collaborators,
    IReadOnlyCollection<CsDistributionQueueDto> Queues, IReadOnlyCollection<CsDistributionClientDto> PendingClients);
