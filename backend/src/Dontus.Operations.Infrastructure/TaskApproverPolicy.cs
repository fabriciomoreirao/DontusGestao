using Dontus.Operations.Domain;

namespace Dontus.Operations.Infrastructure;

public static class TaskApproverPolicy
{
    public static bool IsLegacyMarker(string body) => System.Text.RegularExpressions.Regex.IsMatch(body.Trim(), @"^\[APROVADOR:[0-9a-fA-F-]{36}\]$");

    public static Guid? Resolve(TaskDepartment department, IEnumerable<Guid> activeUsers, IEnumerable<UserDepartment> memberships) =>
        activeUsers.Where(id => id == department.ApproverUserId &&
            memberships.Any(link => link.UserId == id && link.DepartmentId == department.Id && link.IsCoordinator))
            .Select(id => (Guid?)id).FirstOrDefault();
}
