using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Infrastructure;

public sealed record RecordPageQuery(string[] Path, string[] Keys, int Page = 1, int PageSize = 10);
public sealed record RecordPageResult(string[] Keys, JsonElement Rows, int Page, int PageSize, int Total);

/// <summary>Pages an authorized collection. Only the requested records cross the HTTP boundary.</summary>
public sealed class RecordPages(OperationsDbContext db, OperationsService operations, TaskService tasks,
    IAgendaService agenda, ISuggestionService suggestions, IAccessControlService access, IChatService chat, LiaFormService? liaForms = null, CommissionConfirmationService? confirmations = null, DontusIntegrationService? dontus = null, IWhatsAppAdminService? whatsApp = null)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly HashSet<string> Roots = ["items", "customers", "approvals", "audit", "customerModule", "taskModule", "agendaModule", "suggestionModule", "notesModule", "diaryModule", "noticesModule", "access", "chatModule", "liaForms", "liaFormRequests", "commissionConfirmations", "whatsAppAdmin", "supportReasons", "chatReport", "whatsAppDeliveries"];
    public async Task<RecordPageResult> ReadAsync(RecordPageQuery request, ActorContext actor, CancellationToken ct)
    {
        if (request.Path is not {Length: > 0 and <= 12} || !Roots.Contains(request.Path[0]) || request.Path.Any(segment => segment is null || segment.Length > 250 || segment is "__proto__" or "constructor" or "prototype")
            || request.Keys is null || request.Keys.Length > 100_000 || request.Keys.Any(key => key is null || key.Length > 250))
            throw new DomainException("Consulta de página inválida.");
        var keys = request.Keys.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        if (request.Path is ["items"]) return await WorkItemsAsync(request, keys, actor, ct);
        if (request.Path is ["taskModule", "tasks"]) return await TasksAsync(request, keys, actor, ct);
        object resource;
        var skip = 1;
        switch (request.Path[0])
        {
            case "chatReport":
                if(request.Path.Length != 3 || !DateTimeOffset.TryParse(request.Path[1],out var from) || !DateTimeOffset.TryParse(request.Path[2],out var to)) throw new DomainException("Período obrigatório.");
                resource = await chat.GetReportAsync(from.ToUniversalTime(),to.ToUniversalTime(),actor,ct); skip = 3; break;
            case "whatsAppDeliveries":
                actor.RequirePermission("chat","manage");actor.RequireCapability("chat","manageWhatsApp");
                if(request.Path.Length != 2 || !Guid.TryParse(request.Path[1],out var campaignId)) throw new DomainException("Campanha obrigatória.");
                resource = await db.WhatsAppCampaignDeliveries.AsNoTracking().Where(entry=>entry.CampaignId==campaignId).ToArrayAsync(ct); skip = 2; break;
            case "liaForms": resource = await liaForms!.ListFormsAsync(actor, ct); break;
            case "liaFormRequests":
                if(request.Path.Length != 2 || !Guid.TryParse(request.Path[1],out var workItemId)) throw new DomainException("Cliente obrigatório.");
                resource = await liaForms!.ListRequestsAsync(workItemId, actor, ct); skip = 2; break;
            case "commissionConfirmations":
                if(request.Path.Length != 4) throw new DomainException("Contexto de confirmação obrigatório.");
                resource = await confirmations!.ListAsync(request.Path[1],request.Path[2],request.Path[3],actor,ct); skip = 4; break;
            case "whatsAppAdmin": resource = await whatsApp!.GetWhatsAppAdminAsync(actor,ct); break;
            case "supportReasons": resource = await dontus!.GetAccessReasonsAsync(actor,ct,true); break;
            case "items":
                var parent = ParentId(request.Path) ?? throw new DomainException("Registro de origem obrigatório.");
                resource = (await WorkItemsAsync(request with {Path=["items"],Keys=[parent.ToString()],Page=1,PageSize=10}, [parent.ToString()], actor, ct)).Rows;
                break;
            case "taskModule": resource = await tasks.GetListModuleAsync(actor, ParentId(request.Path) is { } taskId ? [taskId] : [], ct); break;
            case "agendaModule": resource = await agenda.GetModuleAsync(actor, ct); break;
            case "suggestionModule": resource = await suggestions.GetModuleAsync(actor, ct); break;
            case "customerModule": resource = await operations.GetCustomerModuleAsync(actor, ct); break;
            case "notesModule": resource = await operations.GetNotesModuleAsync(actor, ct); break;
            case "diaryModule": resource = await operations.GetDiaryModuleAsync(actor, ct); break;
            case "noticesModule": resource = await operations.GetNoticesModuleAsync(actor, ct); break;
            case "access": resource = await access.GetManagementAsync(actor, ct); break;
            case "chatModule": resource = await chat.GetModuleAsync(actor, ct); break;
            default:
                var snapshot = JsonSerializer.SerializeToElement(await operations.GetSnapshotAsync(actor, ct), Json);
                resource = snapshot.GetProperty(request.Path[0]);
                break;
        }
        var rows = Traverse(JsonSerializer.SerializeToElement(resource, Json), request.Path.Skip(skip));
        if (rows.ValueKind != JsonValueKind.Array) throw new DomainException("A origem não é uma lista.");
        var indexed = rows.EnumerateArray().Where(row => Key(row) is not null).GroupBy(row => Key(row)!, StringComparer.OrdinalIgnoreCase).ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);
        var permitted = keys.Where(indexed.ContainsKey).ToArray();
        var plan = Plan(permitted, request.Page, request.PageSize);
        return new(plan.Keys, JsonSerializer.SerializeToElement(plan.Keys.Select(key => indexed[key]), Json), plan.Page, plan.Size, permitted.Length);
    }

    private async Task<RecordPageResult> WorkItemsAsync(RecordPageQuery request, string[] keys, ActorContext actor, CancellationToken ct)
    {
        var ids = keys.Select(key => Guid.TryParse(key, out var id) ? id : Guid.Empty).Where(id => id != Guid.Empty).ToArray();
        var scope = await operations.AuthorizedListItemsAsync(actor, ct);
        var query = scope.Query.Where(item => ids.Contains(item.Id));
        var allowed = (await query.Select(item => item.Id).ToArrayAsync(ct)).Select(id => id.ToString()).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (!actor.HasPermission("commissions", "manage") && !actor.HasPermission("commissions", "approve"))
            foreach (var commission in await query.Where(item => item.Module == "commissions").Select(item => new {item.Id,item.Description,item.Owner}).ToArrayAsync(ct))
                if (!OperationsService.ListCommissionBelongsTo(commission.Description,commission.Owner,actor,scope.UserId)) allowed.Remove(commission.Id.ToString());
        var permitted = keys.Where(allowed.Contains).ToArray();
        var plan = Plan(permitted, request.Page, request.PageSize);
        var pageIds = plan.Keys.Select(Guid.Parse).ToArray();
        var rows = await query.Where(item => pageIds.Contains(item.Id)).Select(item => new WorkItemDto(item.Id,item.Module,item.RecordType,item.Title,item.CustomerId,item.CustomerName,
            item.Owner,item.Team,item.Status,item.Priority,item.DueAt,item.SlaDueAt,item.AmountCents,item.Description,item.Version,item.UpdatedAt,item.CreatedAt,item.CreatedBy,null,"")).ToArrayAsync(ct);
        var assignments = await db.Activities.AsNoTracking().Where(activity => pageIds.Contains(activity.EntityId) && activity.EntityType == "work_item" && activity.Kind == "Responsável alterado")
            .OrderByDescending(activity => activity.CreatedAt).ToArrayAsync(ct);
        var indexed = rows.ToDictionary(row => row.Id.ToString(), StringComparer.OrdinalIgnoreCase);
        var ordered = plan.Keys.Where(indexed.ContainsKey).Select(key => {var row=indexed[key];var last=assignments.FirstOrDefault(entry=>entry.EntityId==row.Id);return last is null?row:row with {AssignedAt=last.CreatedAt,AssignedBy=last.Actor};});
        return new(plan.Keys,JsonSerializer.SerializeToElement(ordered,Json),plan.Page,plan.Size,permitted.Length);
    }
    private async Task<RecordPageResult> TasksAsync(RecordPageQuery request,string[] keys,ActorContext actor,CancellationToken ct)
    {
        var ids=keys.Select(key=>Guid.TryParse(key,out var id)?id:Guid.Empty).Where(id=>id!=Guid.Empty).ToArray();
        var scope=await tasks.AuthorizedListTasksAsync(actor,ct);
        var allowed=(await scope.Query.Where(task=>ids.Contains(task.Id)).Select(task=>task.Id).ToArrayAsync(ct)).Select(id=>id.ToString()).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var permitted=keys.Where(allowed.Contains).ToArray();var plan=Plan(permitted,request.Page,request.PageSize);
        var module=await tasks.GetListModuleAsync(actor,plan.Keys.Select(Guid.Parse).ToArray(),ct);
        var indexed=module.Tasks.ToDictionary(task=>task.Id.ToString(),StringComparer.OrdinalIgnoreCase);
        return new(plan.Keys,JsonSerializer.SerializeToElement(plan.Keys.Where(indexed.ContainsKey).Select(key=>indexed[key]),Json),plan.Page,plan.Size,permitted.Length);
    }
    private static (string[] Keys,int Page,int Size) Plan(string[] keys,int page,int size)
    {
        size = size is 10 or 30 or 50 or 100 ? size : 10;
        page = Math.Clamp(page,1,Math.Max(1,(int)Math.Ceiling(keys.Length/(double)size)));
        return (keys.Skip((page-1)*size).Take(size).ToArray(),page,size);
    }
    private static Guid? ParentId(string[] path) => path.FirstOrDefault(segment=>segment.StartsWith("@id:")) is { } selector && Guid.TryParse(selector[4..],out var id)?id:null;
    private static string? Key(JsonElement row)
    {
        if(row.ValueKind!=JsonValueKind.Object)return null;
        foreach(var key in new[]{"id","userId","token","phone","name","code","track","version"})
            if(row.TryGetProperty(key,out var value)&&value.ValueKind is JsonValueKind.String or JsonValueKind.Number)return value.ToString();
        return null;
    }
    private static JsonElement Traverse(JsonElement value,IEnumerable<string> path)
    {
        foreach(var segment in path)
        {
            if(segment.StartsWith("@"))
            {
                var separator=segment.IndexOf(':');if(separator<2||value.ValueKind!=JsonValueKind.Array)throw new DomainException("Origem de lista inválida.");
                var field=segment[1..separator];var key=segment[(separator+1)..];
                if(field is "__proto__" or "constructor" or "prototype")throw new DomainException("Origem de lista inválida.");
                value=value.EnumerateArray().FirstOrDefault(row=>row.ValueKind==JsonValueKind.Object&&row.TryGetProperty(field,out var property)&&property.ToString().Equals(key,StringComparison.OrdinalIgnoreCase));
            }
            else if(segment.StartsWith("$json:"))
            {
                if(value.ValueKind!=JsonValueKind.Object||!value.TryGetProperty(segment[6..],out var field)||field.ValueKind!=JsonValueKind.String)throw new DomainException("Dados de origem indisponíveis.",404);
                try{using var document=JsonDocument.Parse(field.GetString()??"{}");value=document.RootElement.Clone();}catch(JsonException){throw new DomainException("Dados de origem inválidos.");}
            }
            else if(value.ValueKind==JsonValueKind.Object&&value.TryGetProperty(segment,out var property))value=property;
            else throw new DomainException("Lista não encontrada.",404);
        }
        return value;
    }
}
