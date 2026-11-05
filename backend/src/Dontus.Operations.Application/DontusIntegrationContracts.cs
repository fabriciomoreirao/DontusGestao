using System.Text.Json;

namespace Dontus.Operations.Application;

public sealed record LinkDontusCustomerCommand(string ExternalClientId, long? Version);
public sealed record DontusIdentificationCommand(string Identification);
public sealed record DontusLoginCommand(string Identification, long UserId, Guid? ReasonId = null, string? Justification = null);
public sealed record SaveSupportAccessReasonCommand(Guid? Id, string Name, bool Active, long? Version = null, Guid? DepartmentId = null);
public sealed record SupportAccessReasonDto(Guid Id, string Name, bool Active, long Version, Guid? DepartmentId, string DepartmentName);
public sealed record SupportAccessDepartmentDto(Guid Id, string Name, bool Active);
public sealed record SupportAccessHistoryQuery(DateOnly? From = null, DateOnly? To = null, string? Responsible = null, Guid? ReasonId = null, string? Identification = null, int Page = 1);
public sealed record SupportAccessLogDto(Guid Id, DateTimeOffset AccessedAt, string ActorEmail, string ActorName,
    string Identification, string CustomerName, long TargetUserId, string TargetUserName, Guid ReasonId, string ReasonName, string Justification);
public sealed record DontusCustomerLinkDto(string Identification, long ExternalClientId, long Version);
public sealed record DontusCustomerDataDto(string Identification, long ExternalClientId, DateTimeOffset FetchedAt, JsonElement Data);
public sealed record DontusEnvironmentUserDto(long Id, string Name, string Username, string Email,
    bool IsSupervisor, bool Active, bool CanAccess);
