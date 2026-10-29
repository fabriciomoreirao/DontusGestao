using System.Text.Json;

namespace Dontus.Operations.Application;

public sealed record LinkDontusCustomerCommand(string ExternalClientId, long? Version);
public sealed record DontusIdentificationCommand(string Identification);
public sealed record DontusLoginCommand(string Identification, long UserId);
public sealed record DontusCustomerLinkDto(string Identification, long ExternalClientId, long Version);
public sealed record DontusCustomerDataDto(string Identification, long ExternalClientId, DateTimeOffset FetchedAt, JsonElement Data);
public sealed record DontusEnvironmentUserDto(long Id, string Name, string Username, string Email,
    bool IsSupervisor, bool Active, bool CanAccess);
