using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;
namespace Dontus.Operations.Tests;
public sealed class RequestedWorkflowTests
{
    private static OperationsDbContext Context()=>new(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static ActorContext Actor(AppUser user)=>new(user.Email,user.DisplayName,"Colaborador",user.Department,ScreenCatalog.All.Select(screen=>new EffectivePermission(screen.Code,true,true,true,true,true)).ToArray());
    private static AppUser User(string name)=>new(){Email=name+"@test",DisplayName=name,CreatedBy="tests"};
    private static UpdateWorkItemCommand Edit(WorkItem item,string description)=>new(item.Id,item.Title,item.Owner,item.AmountCents,description,null,item.CustomerName,item.Version);
    [Fact]
    public async Task Notes_scope_is_enforced_in_notes_and_snapshot_and_customer_link_survives_save()
    {
        await using var db=Context();var author=User("author");var colleague=User("colleague");var outsider=User("outsider");var department=new TaskDepartment{Name="Suporte"};
        db.AddRange(author,colleague,outsider,department);db.UserDepartments.Add(new UserDepartment{UserId=colleague.Id,DepartmentId=department.Id});await db.SaveChangesAsync();
        var service=new OperationsService(db);var note=await service.SaveNoteAsync(null,"Cliente","Texto\n\n**Importante**","#123456","public",Actor(author),departmentId:department.Id,customerCode:"123456");
        var saved=Assert.Single((await service.GetNotesModuleAsync(Actor(colleague))).Notes);Assert.Equal(note,saved.Id);Assert.Equal("123456",saved.CustomerCode);Assert.Equal(department.Id,saved.DepartmentId);
        Assert.Empty((await service.GetNotesModuleAsync(Actor(outsider))).Notes);Assert.DoesNotContain((await service.GetSnapshotAsync(Actor(outsider))).Items,item=>item.Id==note);
        Assert.Single((await service.GetNotesModuleAsync(Actor(author))).Notes);
        await service.SaveNoteAsync(note,"Cliente","Atualizada","#123456","public",Actor(author),customerCode:"123456");
        Assert.Single((await service.GetNotesModuleAsync(Actor(outsider))).Notes);
    }
    [Fact]
    public async Task Only_queue_creator_can_change_sector_and_contact_does_not_create_an_attendance()
    {
        await using var db=Context();var creator=User("creator");var peer=User("peer");var department=new TaskDepartment{Name="Novo setor"};db.AddRange(creator,peer,department);
        var item=new WorkItem{Status="Pendente",Module="waitingQueue",RecordType="Encaminhamento",Title="Cliente",CreatedBy=creator.Email,Description="{\"kind\":\"waitingQueue\",\"departmentId\":\"old\",\"requestType\":\"Atendimento\",\"state\":\"waiting\"}"};db.Add(item);await db.SaveChangesAsync();var service=new OperationsService(db);
        var changed=JsonNode.Parse(item.Description)!.AsObject();changed["departmentId"]=department.Id.ToString();
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.UpdateWorkItemAsync(Edit(item,changed.ToJsonString()),Actor(peer)))).StatusCode);
        await service.UpdateWorkItemAsync(Edit(item,changed.ToJsonString()),Actor(creator));Assert.Equal(department.Name,item.Team);Assert.Contains(await db.Activities.ToArrayAsync(),activity=>activity.Kind=="Responsável alterado");
        changed=JsonNode.Parse(item.Description)!.AsObject();changed["state"]="contacted";await service.UpdateWorkItemAsync(Edit(item,changed.ToJsonString()),Actor(peer));Assert.Single(await db.WorkItems.ToArrayAsync());
    }
    [Fact]
    public async Task Development_comments_sync_once_and_parent_responsible_can_read_linked_subtask_without_ti_permission()
    {
        await using var db=Context();var author=User("operator");var developer=User("developer");db.AddRange(author,developer);
        var parent=new CorporateTask{Title="Matriz",Description="Descrição",CreatorUserId=author.Id,AssigneeUserId=author.Id};db.Add(parent);
        var detail=new JsonObject{["kind"]="developmentTask",["sourceTaskId"]=parent.Id.ToString(),["executor"]=developer.DisplayName,["comments"]=new JsonArray()};
        var subtask=new WorkItem{Status="Pendente",Module="ti",RecordType="Tarefa de desenvolvimento",Title="Subtarefa",CreatedBy=author.Email,Description=detail.ToJsonString()};db.Add(subtask);await db.SaveChangesAsync();var service=new OperationsService(db);
        detail["comments"]!.AsArray().Add(new JsonObject{["text"]="Atualização\n**Resultado**",["author"]=developer.DisplayName,["at"]=DateTimeOffset.UtcNow.ToString("O")});
        await service.UpdateWorkItemAsync(Edit(subtask,detail.ToJsonString()),Actor(developer));Assert.Equal("Atualização\n**Resultado**",Assert.Single(await db.TaskComments.ToArrayAsync()).Body);
        await service.UpdateWorkItemAsync(Edit(subtask,subtask.Description),Actor(developer));Assert.Single(await db.TaskComments.ToArrayAsync());
        var operatorActor=Actor(author) with{Permissions=[new EffectivePermission("tasks",true,false,false,false,false)]};Assert.Contains((await service.GetSnapshotAsync(operatorActor)).Items,item=>item.Id==subtask.Id);
    }
    [Fact]
    public async Task Configured_origin_blocks_empty_new_record_but_keeps_legacy_unrelated_edits()
    {
        await using var db=Context();var user=User("creator");db.Add(user);db.Add(new CustomerCatalogOption{Catalog="serviceOrigin",Name="Portal"});await db.SaveChangesAsync();var service=new OperationsService(db);
        var command=new CreateWorkItemCommand("support","Atendimento","Cliente",null,null,null,null,null,null,null,0,"{\"kind\":\"serviceRecord\",\"origin\":\"\"}",null,null,null);
        Assert.Contains("origem",(await Assert.ThrowsAsync<DomainException>(()=>service.CreateWorkItemAsync(command,Actor(user)))).Message);
        var legacy=new WorkItem{Status="Pendente",Module="support",RecordType="Atendimento",Title="Legado",Description=command.Description!,CreatedBy=user.Email};db.Add(legacy);await db.SaveChangesAsync();await service.UpdateWorkItemAsync(Edit(legacy,legacy.Description),Actor(user));
    }
    [Fact]
    public async Task Retention_can_repeat_but_activation_keeps_duplicate_protection()
    {
        await using var db=Context();var user=User("cs");db.Add(user);await db.SaveChangesAsync();var service=new OperationsService(db);
        CreateWorkItemCommand Command(string track)=>new("cs","Acompanhamento","Cliente",null,"Cliente",null,"CS",null,null,null,0,"{\"kind\":\"csJourney\",\"phase\":\"validation\",\"clientId\":\"123456\",\"track\":\""+track+"\"}",null,null,null);
        await service.CreateWorkItemAsync(Command("retention"),Actor(user));await service.CreateWorkItemAsync(Command("retention"),Actor(user));
        await service.CreateWorkItemAsync(Command("activation"),Actor(user));Assert.Equal(409,(await Assert.ThrowsAsync<DomainException>(()=>service.CreateWorkItemAsync(Command("activation"),Actor(user)))).StatusCode);
        Assert.Equal(3,await db.WorkItems.CountAsync());
    }

    [Fact]
    public async Task Unit_features_remain_saved_after_a_fresh_database_read()
    {
        await using var db=Context();var user=User("manager");db.Add(user);var item=new WorkItem{Status="Pendente",Module="cs",RecordType="Conta estratégica",Title="Rede",Description="{\"kind\":\"enterpriseNetwork\",\"units\":[{\"id\":\"unit\",\"features\":[]}]}",CreatedBy=user.Email};db.Add(item);await db.SaveChangesAsync();
        var detail=JsonNode.Parse(item.Description)!;detail["units"]![0]!["features"]=new JsonArray(new JsonObject{["name"]="Agenda",["category"]="Ativa",["status"]="Em utilização"});await new OperationsService(db).UpdateWorkItemAsync(Edit(item,detail.ToJsonString()),Actor(user));db.ChangeTracker.Clear();var saved=await db.WorkItems.SingleAsync();Assert.Equal("Agenda",JsonNode.Parse(saved.Description)!["units"]![0]!["features"]![0]!["name"]!.ToString());
    }
}
