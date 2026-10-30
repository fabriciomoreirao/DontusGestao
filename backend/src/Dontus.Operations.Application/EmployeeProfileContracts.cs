namespace Dontus.Operations.Application;

public sealed record EmployeeProfilePersonDto(
    Guid Id, string DisplayName, string DepartmentName, IReadOnlyCollection<string> DepartmentNames,
    string PhotoDataUrl, string JobTitle, bool IsCoordinator, int? BirthdayDay, int? BirthdayMonth,
    string SupervisorName);

public sealed record EmployeeProfileDto(
    EmployeeProfilePersonDto Employee, string CoverDataUrl, string Bio, string Phrase,
    long Version, bool CanEdit, DateTimeOffset? UpdatedAt);

public sealed record SaveEmployeeProfileCommand(string? CoverDataUrl, string? Bio, string? Phrase, long Version);
