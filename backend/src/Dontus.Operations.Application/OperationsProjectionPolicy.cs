namespace Dontus.Operations.Application;

public static class OperationsProjectionPolicy
{
    // These screens use assignment pickers, independently of employee administration.
    private static readonly string[] AssignmentModules =
    [
        "customers", "commercial", "cs", "lia", "support", "cancellations", "serviceRequests",
        "serviceFollowup", "marketing", "ti", "goals", "surveys", "waitingQueue", "reminders",
        "finance", "procurement", "work",
    ];

    private static readonly string[] CustomerCatalogModules =
    [
        "customers", "catalogs", "commercial", "cs", "lia", "support", "cancellations", "hr",
        "serviceRequests", "serviceFollowup", "commissions", "referrals", "waitingQueue", "marketing", "goals", "surveys",
    ];

    public static bool CanViewAssignmentDirectory(ActorContext actor) =>
        AssignmentModules.Any(module => actor.HasPermission(module, "view")) || actor.HasPermission("reminders", "create");

    public static bool CanViewCustomerCatalogs(ActorContext actor) =>
        CustomerCatalogModules.Any(module => actor.HasPermission(module, "view"));
}
