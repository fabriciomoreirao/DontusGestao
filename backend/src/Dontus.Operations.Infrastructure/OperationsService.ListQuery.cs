using System.Text.Json;
using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;
namespace Dontus.Operations.Infrastructure;
public sealed partial class OperationsService {
 internal static bool ListCommissionBelongsTo(string description,string owner,ActorContext actor,Guid? userId)=>CommissionBelongsTo(description,owner,actor,userId);
 internal async Task<(IQueryable<WorkItem> Query,Guid? UserId)> AuthorizedListItemsAsync(ActorContext actor,CancellationToken cancellationToken) {
 var db=ListDatabase;
 if(actor.Permissions?.Any(permission=>permission.CanView)!=true)throw new DomainException("Sem acesso à lista.",403);
        var visibleModules = actor.Permissions
            .Where(permission => permission.CanView)
            .Select(permission => permission.Screen)
            .ToList();
        var directlyVisibleModules = visibleModules.ToArray();
        var canViewValidation = actor.HasPermission(FollowupValidationPolicy.Screen, "view");
        var canManageCommissions = actor.HasPermission("commissions", "manage") || actor.HasPermission("commissions", "approve");
        var canManageReferrals = actor.HasPermission("referrals", "manage") || actor.HasPermission("referrals", "approve");
        var canManageGoals = actor.HasPermission("goals", "manage") || actor.HasPermission("goals", "edit");
        if (actor.HasPermission("commissions", "view"))
            visibleModules.AddRange(["commercial", "cs", "lia"]);
        visibleModules = visibleModules.Distinct(StringComparer.OrdinalIgnoreCase).ToList();

        var registeredUser = await db.Users.AsNoTracking().Where(user => user.Email == actor.Email)
            .Select(user => new { user.Id, user.CreatedAt }).SingleOrDefaultAsync(cancellationToken);
        var registeredAt = registeredUser?.CreatedAt ?? DateTimeOffset.MinValue;
        var sharedParentIds = registeredUser is null || !actor.HasPermission("tasks", "view") ? [] : await db.CorporateTasks.AsNoTracking()
            .Where(task => task.CreatorUserId == registeredUser.Id || task.AssigneeUserId == registeredUser.Id).Select(task => task.Id).ToArrayAsync(cancellationToken);
        var sharedDevelopmentIds = new List<Guid>();
        if (sharedParentIds.Length > 0)
        {
            var developments = await db.WorkItems.AsNoTracking().Where(item => item.Module == "ti" && item.Description.Contains("developmentTask")).Select(item => new { item.Id, item.Description }).ToArrayAsync(cancellationToken);
            foreach (var development in developments)
            {
                try { var source = JsonNode.Parse(development.Description)?["sourceTaskId"]?.ToString(); if (Guid.TryParse(source, out var parentId) && sharedParentIds.Contains(parentId)) sharedDevelopmentIds.Add(development.Id); }
                catch (JsonException) { }
            }
        }
        var visibleNoteIds = actor.HasPermission("notes", "view") ? (await GetNotesModuleAsync(actor,cancellationToken)).Notes.Select(note=>note.Id).ToArray() : [];
        // Keep authorization and version metadata in SQL, without fetching unchanged embedded files.
        // Commission descriptions still participate in the identity check below.
        var authorizedItems = db.WorkItems.AsNoTracking()
            .Where(x => (visibleModules.Contains(x.Module) || sharedDevelopmentIds.Contains(x.Id))
                && (canViewValidation || (x.Module != "lia" || x.Status != "Validacao")
                    && (x.Module != "cs" || !System.Text.RegularExpressions.Regex.IsMatch(x.Description, "\"kind\"\\s*:\\s*\"csJourney\"")
                        || System.Text.RegularExpressions.Regex.IsMatch(x.Description, "\"phase\"\\s*:") && !System.Text.RegularExpressions.Regex.IsMatch(x.Description, "\"phase\"\\s*:\\s*(null|\"\"|\"validation\")")))
                && x.RecordType != "Perfil de colaborador"
                && (x.Module != "notes" || visibleNoteIds.Contains(x.Id))
                && (directlyVisibleModules.Contains(x.Module) || sharedDevelopmentIds.Contains(x.Id) || canManageCommissions || x.Owner == actor.DisplayName)
                && (x.Module != "reminders" || x.CreatedAt >= registeredAt)
                && (x.Module != "reminders" || x.CustomerName == actor.Email || x.CreatedBy == actor.Email || actor.HasPermission("reminders", "manage"))
                && (x.Module != "diary" || x.CreatedBy == actor.Email)
                && (x.Module != "commissions" || canManageCommissions || x.Owner == actor.DisplayName)
                && (x.Module != "referrals" || canManageReferrals || x.CreatedBy == actor.Email || x.CreatedBy == "" && x.Owner == actor.DisplayName)
                && (x.Module != "goals" || canManageGoals || x.Owner == actor.DisplayName || x.Team == actor.Department));

 return (authorizedItems,registeredUser?.Id);
 }
}
