namespace Dontus.Operations.Application;

public static class OperationsProjectionPolicy
{
    private static readonly string[] CustomerCatalogModules =
    [
        "customers", "catalogs", "commercial", "cs", "lia", "support", "cancellations", "hr",
        "serviceRequests", "serviceFollowup", "commissions", "referrals", "waitingQueue", "marketing", "goals", "surveys",
    ];

    public static bool CanViewAssignmentDirectory(ActorContext actor) =>
        actor.FullAccess || actor.Permissions?.Any(permission => permission.CanView) == true || actor.HasPermission("reminders", "create");

    public static bool CanViewCustomerCatalogs(ActorContext actor) =>
        CustomerCatalogModules.Any(module => actor.HasPermission(module, "view"));
}
