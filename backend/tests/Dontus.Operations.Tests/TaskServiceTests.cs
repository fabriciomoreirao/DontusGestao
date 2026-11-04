using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Dontus.Operations.Tests;

public sealed class TaskServiceTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Assignee_can_request_approval_complete_and_forward_without_extra_capabilities(bool canEdit)
    {
        await using var db=CreateContext();var (service,admin)=await InitializeAsync(db);
        var support=await db.TaskDepartments.SingleAsync(x=>x.Name=="Suporte");var development=await db.TaskDepartments.SingleAsync(x=>x.Name=="Desenvolvimento");
        var type=await db.TaskTypes.SingleAsync();var responsible=new AppUser{Email="responsible@test",DisplayName="Responsável",CreatedBy="tests"};
        var next=new AppUser{Email="next@test",DisplayName="Desenvolvimento",CreatedBy="tests"};db.Users.AddRange(responsible,next);
        db.UserDepartments.AddRange(new(){UserId=responsible.Id,DepartmentId=support.Id},new(){UserId=next.Id,DepartmentId=development.Id});await db.SaveChangesAsync();
        var created=await service.CreateAsync(new("Fluxo do responsável","Descrição",type.Id,null,null,support.Id,support.Id,responsible.Id,null,null,null,"5511999999999",null,null,null,null,false,[],[]),admin);
        var task=await db.CorporateTasks.SingleAsync(x=>x.Id==created.Id);
        var actor=new ActorContext(responsible.Email,responsible.DisplayName,"Colaborador","Suporte",[new("tasks",true,false,canEdit,false,false,[])]);
        var inProgress=await db.TaskStatuses.SingleAsync(x=>x.Name=="Em andamento");
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.ChangeStatusAsync(new(task.Id,inProgress.Id,null,task.Version),actor))).StatusCode);
        var cancelled=await db.TaskStatuses.SingleAsync(x=>x.Name=="Cancelada");
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.ChangeStatusAsync(new(task.Id,cancelled.Id,"Teste",task.Version),actor))).StatusCode);
        var approval=await db.TaskStatuses.SingleAsync(x=>x.Name=="Aguardando aprovação");
        var version=task.Version;await service.ChangeStatusAsync(new(task.Id,approval.Id,"Encaminhar",version),actor);
        Assert.Contains(db.TaskNotifications,x=>x.TaskId==task.Id&&x.EventType=="approval_requested");
        var final=await db.TaskStatuses.SingleAsync(x=>x.Name=="Resolvida");
        Assert.Equal(409,(await Assert.ThrowsAsync<DomainException>(()=>service.ChangeStatusAsync(new(task.Id,final.Id,"Concluir",version),actor))).StatusCode);
        await service.ChangeStatusAsync(new(task.Id,final.Id,"Concluir",task.Version),actor);Assert.NotNull(task.CompletedAt);
        await service.TransferAsync(new(task.Id,development.Id,next.Id,"Encaminhar ao desenvolvimento",false,task.Version),actor);
        Assert.Equal(development.Id,task.CurrentDepartmentId);Assert.Equal(next.Id,task.AssigneeUserId);Assert.Null(task.CompletedAt);
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.TransferAsync(new(task.Id,support.Id,responsible.Id,"Sem vínculo atual",false,task.Version),actor))).StatusCode);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Client_notice_reaches_creator_assignee_and_both_coordinations_after_transfer(bool sharedQueue)
    {
        await using var db=CreateContext();var (service,admin)=await InitializeAsync(db);
        foreach(var membership in db.UserDepartments)membership.IsCoordinator=false;
        var support=await db.TaskDepartments.SingleAsync(x=>x.Name=="Suporte");var development=await db.TaskDepartments.SingleAsync(x=>x.Name=="Desenvolvimento");var type=await db.TaskTypes.SingleAsync();
        AppUser Add(string name,bool active=true,bool blocked=false){var user=new AppUser{Email=$"{name}@test",DisplayName=name,Active=active,BlockedAt=blocked?DateTimeOffset.UtcNow:null,CreatedBy="tests"};db.Users.Add(user);return user;}
        var creator=Add("creator");var responsible=Add("responsible");var originCoord=Add("origin-coord");var finalCoord=Add("final-coord");var outsider=Add("outsider");var blocked=Add("blocked",blocked:true);var inactive=Add("inactive",false);
        db.UserDepartments.AddRange(new(){UserId=creator.Id,DepartmentId=support.Id},new(){UserId=responsible.Id,DepartmentId=development.Id},
            new(){UserId=originCoord.Id,DepartmentId=support.Id,IsCoordinator=true},new(){UserId=finalCoord.Id,DepartmentId=support.Id,IsCoordinator=true},
            new(){UserId=finalCoord.Id,DepartmentId=development.Id,IsCoordinator=true},new(){UserId=outsider.Id,DepartmentId=support.Id},
            new(){UserId=blocked.Id,DepartmentId=support.Id,IsCoordinator=true},new(){UserId=inactive.Id,DepartmentId=development.Id,IsCoordinator=true});await db.SaveChangesAsync();
        ActorContext Actor(AppUser user,bool create=false,bool edit=false,string[]? capabilities=null)=>new(user.Email,user.DisplayName,"Colaborador","",[new("tasks",true,create,edit,false,false,capabilities??[])]);
        var created=await service.CreateAsync(new("Cliente precisa de retorno","Descrição",type.Id,null,null,support.Id,support.Id,creator.Id,null,null,null,"5511999999999",null,null,null,null,false,[creator.Id],[]),Actor(creator,true,true));
        var task=await db.CorporateTasks.SingleAsync(x=>x.Id==created.Id);
        await service.TransferAsync(new(task.Id,development.Id,sharedQueue?null:responsible.Id,"Análise do desenvolvimento",false,task.Version),Actor(originCoord,edit:true,capabilities:["forward"]));
        if(!sharedQueue)await service.ChangeStatusAsync(new(task.Id,(await db.TaskStatuses.SingleAsync(x=>x.Name=="Resolvida")).Id,"Resolvido",task.Version),Actor(responsible));
        var sender=sharedQueue?finalCoord:responsible;
        await service.CommunicateWithClientAsync(new(task.Id,"requestContact","Interno","Explique a solução ao cliente."),Actor(sender));
        var expected=new[]{creator.Id,originCoord.Id,finalCoord.Id}.Concat(sharedQueue?[]:new[]{responsible.Id}).Order().ToArray();
        var requests=await db.TaskNotifications.Where(x=>x.TaskId==task.Id&&x.EventType=="client_contact_requested").ToArrayAsync();
        Assert.Equal(expected,requests.Select(x=>x.RecipientUserId).Order().ToArray());Assert.Equal(expected.Length,requests.Length);
        Assert.Equal(expected,db.CompanyNotices.Where(x=>x.Active).Select(x=>x.TargetUserId!.Value).Order().ToArray());
        foreach(var user in new[]{creator,originCoord,finalCoord}.Concat(sharedQueue?[]:new[]{responsible}))
        {
            var module=await service.GetModuleAsync(Actor(user));Assert.Contains(module.Tasks,x=>x.Id==task.Id);
            Assert.Single(module.Notifications,x=>x.EventType=="client_contact_requested"&&!x.Read);
        }
        Assert.DoesNotContain((await service.GetModuleAsync(Actor(outsider))).Tasks,x=>x.Id==task.Id);
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.CommunicateWithClientAsync(new(task.Id,"clientInformed","Interno","Sem acesso"),Actor(outsider)))).StatusCode);
        await service.CommunicateWithClientAsync(new(task.Id,"clientInformed","Interno","Cliente avisado pelo criador."),Actor(creator));
        Assert.Equal(creator.Id,task.ClientNotifiedByUserId);Assert.NotNull(task.ClientNotifiedAt);
        Assert.All(requests,entry=>Assert.True(entry.Read));Assert.Empty(db.CompanyNotices.Where(x=>x.Active));
        Assert.DoesNotContain((await service.GetModuleAsync(Actor(originCoord))).Notifications,x=>x.EventType=="client_contact_requested");
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Current_assignee_can_reassign_to_team_without_extra_capability(bool canEdit)
    {
        await using var db=CreateContext();var (service,admin)=await InitializeAsync(db);
        var support=await db.TaskDepartments.SingleAsync(x=>x.Name=="Suporte");
        var finance=await db.TaskDepartments.SingleAsync(x=>x.Name=="Financeiro");
        var type=await db.TaskTypes.SingleAsync();
        var ana=new AppUser{Email="ana@test",DisplayName="Ana",CreatedBy=admin.Email};
        var bia=new AppUser{Email="bia@test",DisplayName="Bia",CreatedBy=admin.Email};
        var outsider=new AppUser{Email="outside@test",DisplayName="Outro setor",CreatedBy=admin.Email};
        var blocked=new AppUser{Email="blocked@test",DisplayName="Bloqueado",BlockedAt=DateTimeOffset.UtcNow,CreatedBy=admin.Email};
        db.Users.AddRange(ana,bia,outsider,blocked);
        db.UserDepartments.AddRange(new UserDepartment{UserId=ana.Id,DepartmentId=support.Id},new UserDepartment{UserId=bia.Id,DepartmentId=finance.Id},new UserDepartment{UserId=bia.Id,DepartmentId=support.Id},new UserDepartment{UserId=outsider.Id,DepartmentId=finance.Id},new UserDepartment{UserId=blocked.Id,DepartmentId=support.Id});
        await db.SaveChangesAsync();
        var id=(await service.CreateAsync(new("Trocar responsável","Contexto",type.Id,null,null,support.Id,support.Id,ana.Id,null,"123456","Clínica","5511999990000",null,null,null,null,false,[],[]),admin)).Id;
        var task=await db.CorporateTasks.SingleAsync(x=>x.Id==id);
        var actor=new ActorContext(ana.Email,ana.DisplayName,"Colaborador","Suporte",[new("tasks",true,false,canEdit,false,false)]);
        await Assert.ThrowsAsync<DomainException>(()=>service.AssignAsync(new(id,outsider.Id,task.Version),actor));
        await Assert.ThrowsAsync<DomainException>(()=>service.AssignAsync(new(id,blocked.Id,task.Version),actor));
        Assert.Equal(409,(await Assert.ThrowsAsync<DomainException>(()=>service.AssignAsync(new(id,bia.Id,task.Version+1),actor))).StatusCode);
        await service.AssignAsync(new(id,bia.Id,task.Version),actor);
        Assert.Equal(bia.Id,task.AssigneeUserId);
        Assert.Contains(db.TaskHistory,x=>x.TaskId==id&&x.EventType=="assignee_changed");
        Assert.Contains(db.TaskNotifications,x=>x.TaskId==id&&x.RecipientUserId==bia.Id&&x.EventType=="assigned");
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.AssignAsync(new(id,ana.Id,task.Version),actor))).StatusCode);
    }

    [Fact]
    public async Task Shared_department_queue_is_visible_and_notifies_members_without_participation_or_extra_capabilities()
    {
        await using var db=CreateContext();var (service,admin)=await InitializeAsync(db);
        var support=await db.TaskDepartments.SingleAsync(x=>x.Name=="Suporte");
        var finance=await db.TaskDepartments.SingleAsync(x=>x.Name=="Financeiro");
        var type=await db.TaskTypes.SingleAsync();
        var ana=new AppUser{Email="ana@test",DisplayName="Ana",CreatedBy=admin.Email};
        var bia=new AppUser{Email="bia@test",DisplayName="Bia",CreatedBy=admin.Email};
        var outsider=new AppUser{Email="outside@test",DisplayName="Outro",CreatedBy=admin.Email};
        db.Users.AddRange(ana,bia,outsider);
        db.UserDepartments.AddRange(new UserDepartment{UserId=ana.Id,DepartmentId=support.Id},new UserDepartment{UserId=bia.Id,DepartmentId=support.Id},new UserDepartment{UserId=bia.Id,DepartmentId=finance.Id},new UserDepartment{UserId=outsider.Id,DepartmentId=finance.Id});
        await db.SaveChangesAsync();
        var created=await service.CreateAsync(new("Fila compartilhada","Contexto",type.Id,null,null,support.Id,support.Id,null,null,"123456","Clínica","5511999990000",null,null,null,null,false,[],[]),admin);
        ActorContext Actor(AppUser user)=>new(user.Email,user.DisplayName,"Colaborador","",[new("tasks",true,false,true,false,false)]);
        foreach(var user in new[]{ana,bia})
        {
            var module=await service.GetModuleAsync(Actor(user));
            Assert.Equal(created.Id,Assert.Single(module.Tasks).Id);
            Assert.Equal("assigned",Assert.Single(module.Notifications).EventType);
        }
        Assert.Empty((await service.GetModuleAsync(Actor(outsider))).Tasks);
        await service.AddCommentAsync(new(created.Id,"Comentário da fila",[]),Actor(ana));
        Assert.Contains((await service.GetModuleAsync(Actor(bia))).Notifications,x=>x.EventType=="comment_added");
        var task=await db.CorporateTasks.SingleAsync();
        await service.TransferAsync(new(task.Id,finance.Id,null,"Encaminhamento para o Financeiro",false,task.Version),admin);
        foreach(var user in new[]{bia,outsider})
        {
            var module=await service.GetModuleAsync(Actor(user));Assert.Single(module.Tasks);
            Assert.Contains(module.Notifications,x=>x.EventType=="transferred");
        }
        Assert.Empty((await service.GetModuleAsync(Actor(ana))).Tasks);
        Assert.Empty((await service.GetModuleAsync(Actor(ana))).Notifications);
    }

    [Theory]
    [InlineData("planilha.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")]
    [InlineData("documento.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")]
    [InlineData("imagem.png", "image/png")]
    [InlineData("documento.pdf", "application/pdf")]
    [InlineData("dados.csv", "text/csv")]
    [InlineData("arquivos.zip", "application/zip")]
    public async Task S3_denial_preserves_the_complete_file_in_private_storage_and_on_the_reopened_card(string name, string type)
    {
        await using var db = CreateContext();
        var (service, actor) = await InitializeAsync(db, new DeniedTaskFileStorage());
        var department = await db.TaskDepartments.SingleAsync(x => x.Name == "Suporte");
        var taskType = await db.TaskTypes.SingleAsync();
        var taskId = (await service.CreateAsync(new("Anexo persistente", "Teste de contingência", taskType.Id, null, null,
            department.Id, department.Id, null, null, null, null, "5511999990000", null, null, null, null, false, [], []), actor)).Id;
        var bytes = "conteúdo privado completo do arquivo"u8.ToArray();
        await using var content = new MemoryStream(bytes);
        var id = await service.UploadAttachmentAsync(new(taskId, null, name, type, bytes.Length, content), actor);
        db.ChangeTracker.Clear();
        var reopened = new TaskService(db, new DeniedTaskFileStorage());
        var module = await reopened.GetModuleAsync(actor);
        var saved = Assert.Single(module.Tasks.Single(x => x.Id == taskId).Attachments);
        Assert.Equal(id, saved.Id); Assert.Equal(name, saved.FileName);
        Assert.DoesNotContain(Convert.ToBase64String(bytes), System.Text.Json.JsonSerializer.Serialize(module));
        var download = await reopened.GetAttachmentDownloadAsync(id, actor);
        Assert.Equal(bytes, download.Content); Assert.Equal(type, download.ContentType); Assert.Equal(name, download.FileName);
        var blockedActor = actor with { Permissions = [new("tasks", false, false, false, false, false)], FullAccess = false };
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => reopened.GetAttachmentDownloadAsync(id, blockedActor))).StatusCode);
        await reopened.DeleteAttachmentAsync(id, actor);
        Assert.Empty(db.TaskAttachments); Assert.Empty(db.TaskAttachmentContents);
    }

    [Fact]
    public async Task Task_creators_can_include_files_without_permission_to_edit_other_tasks()
    {
        await using var db = CreateContext(); var (service, admin) = await InitializeAsync(db);
        var actor = admin with { Permissions = [new("tasks", true, true, false, false, false)], FullAccess = false };
        var department = await db.TaskDepartments.SingleAsync(x => x.Name == "Suporte"); var type = await db.TaskTypes.SingleAsync();
        var id = (await service.CreateAsync(new("Arquivo na criação", "Descrição", type.Id, null, null, department.Id, department.Id,
            null, null, null, null, "5511999990000", null, null, null, null, false, [], []), actor)).Id;
        await using var content = new MemoryStream([1, 2, 3]);
        var file = await service.UploadAttachmentAsync(new(id, null, "arquivo.pdf", "application/pdf", content.Length, content), actor);
        Assert.NotNull((await service.GetAttachmentDownloadAsync(file, actor)).Content);
        var reader = actor with { Permissions = [new("tasks", true, false, false, false, false)] };
        content.Position = 0;
        Assert.Equal(403, (await Assert.ThrowsAsync<DomainException>(() => service.UploadAttachmentAsync(
            new(id, null, "outro.pdf", "application/pdf", content.Length, content), reader))).StatusCode);
    }

    [Fact]
    public async Task Attachment_size_mismatch_is_rejected_without_persisting_partial_content()
    {
        await using var db = CreateContext(); var (service, actor) = await InitializeAsync(db, new DeniedTaskFileStorage());
        var department = await db.TaskDepartments.SingleAsync(x => x.Name == "Suporte"); var type = await db.TaskTypes.SingleAsync();
        var taskId = (await service.CreateAsync(new("Anexo", "Descrição", type.Id, null, null, department.Id, department.Id,
            null, null, null, null, "5511999990000", null, null, null, null, false, [], []), actor)).Id;
        await using var content = new MemoryStream([1, 2, 3]);
        await Assert.ThrowsAsync<DomainException>(() => service.UploadAttachmentAsync(new(taskId, null, "arquivo.pdf", "application/pdf", 10, content), actor));
        Assert.Empty(db.TaskAttachments); Assert.Empty(db.TaskAttachmentContents);
    }

    private sealed class DeniedTaskFileStorage : ITaskFileStorage
    {
        public async Task StoreAsync(string key, Stream content, string type, long size, CancellationToken cancellationToken = default)
        {
            await content.ReadExactlyAsync(new byte[2], cancellationToken);
            throw new DomainException("AccessDenied: s3:PutObject", 503);
        }
        public Task DeleteAsync(string key, CancellationToken cancellationToken = default) => throw new InvalidOperationException("Database files must not call S3 delete.");
        public string CreateDownloadUrl(string key, string name, string type) => throw new InvalidOperationException("Database files must not call S3 download.");
    }

    [Fact]
    public async Task Only_the_assignee_receives_arrivals_and_comments_and_ordinary_updates_stay_silent()
    {
        await using var db = CreateContext();
        var (service, actor) = await InitializeAsync(db);
        var support = await db.TaskDepartments.SingleAsync(entry => entry.Name == "Suporte");
        var type = await db.TaskTypes.SingleAsync();
        var responsible = new AppUser { Email = "responsavel@dontus.local", DisplayName = "Responsável", CreatedBy = actor.Email };
        var mentioned = new AppUser { Email = "participante@dontus.local", DisplayName = "Participante", CreatedBy = actor.Email };
        db.Users.AddRange(responsible, mentioned);
        db.UserDepartments.Add(new UserDepartment { UserId = responsible.Id, DepartmentId = support.Id });
        await db.SaveChangesAsync();
        var created = await service.CreateAsync(new CreateCorporateTaskCommand("Tarefa recebida", "Contexto", type.Id, null, null,
            support.Id, support.Id, responsible.Id, null, "1001", null, "5511999990000", null, null, null, null, false, [], []), actor);
        var arrival = Assert.Single(db.TaskNotifications);
        Assert.Equal(responsible.Id, arrival.RecipientUserId);
        Assert.Equal("assigned", arrival.EventType);
        var task = await db.CorporateTasks.SingleAsync();
        await service.UpdateAsync(new UpdateCorporateTaskCommand(task.Id, "Título atualizado", task.Description, type.Id, null,
            "1001", null, task.ClientWhatsApp, false, [], task.Version), actor);
        Assert.Single(db.TaskNotifications);
        await service.AddCommentAsync(new(task.Id, "Confira este comentário", [responsible.Id, mentioned.Id]), actor);
        var commentNotice = Assert.Single(db.TaskNotifications.Where(entry => entry.EventType == "comment_added"));
        Assert.Equal(responsible.Id, commentNotice.RecipientUserId);
        Assert.DoesNotContain(db.TaskNotifications, entry => entry.RecipientUserId == mentioned.Id);
        await service.AddCommentAsync(new(task.Id, "Resposta do responsável", []), actor with { Email = responsible.Email, DisplayName = responsible.DisplayName });
        Assert.Equal(2, await db.TaskNotifications.CountAsync());
    }

    [Fact]
    public async Task Creates_task_with_catalog_sla_notification_and_immutable_history()
    {
        await using var db = CreateContext();
        var (service, actor) = await InitializeAsync(db);
        var support = await db.TaskDepartments.SingleAsync(x => x.Name == "Suporte");
        var type = await db.TaskTypes.SingleAsync();
        var assignee = await db.Users.SingleAsync();

        var createdTask = await service.CreateAsync(new CreateCorporateTaskCommand(
            "Cliente não consegue emitir relatório",
            "A emissão apresenta erro e precisa ser analisada.",
            type.Id,
            null,
            null,
            support.Id,
            support.Id,
            assignee.Id,
            null,
            "230229",
            "Clínica exemplo",
            "5511999990000",
            null,
            "Evidência registrada",
            null,
            null,
            false,
            [], []), actor);
        var taskId = createdTask.Id;

        var task = await db.CorporateTasks.SingleAsync(x => x.Id == taskId);
        Assert.Null(task.SlaDueAt);
        Assert.Matches(@"^T\d{6}$", task.Protocol);
        Assert.Single(await db.TaskHistory.Where(x => x.TaskId == taskId).ToListAsync());
        Assert.Empty(await db.TaskNotifications.Where(x => x.TaskId == taskId).ToListAsync());

        var module = await service.GetModuleAsync(actor);
        Assert.Single(module.Tasks);
        Assert.Equal("Suporte", module.Tasks.Single().DepartmentName);
    }

    [Fact]
    public async Task Rejects_assignee_that_does_not_belong_to_destination_department()
    {
        await using var db = CreateContext();
        var (service, actor) = await InitializeAsync(db);
        var support = await db.TaskDepartments.SingleAsync(x => x.Name == "Suporte");
        var type = await db.TaskTypes.SingleAsync();
        var outsider = new AppUser
        {
            Email = "externo@dontus.local",
            DisplayName = "Usuário externo",
            CreatedBy = actor.Email,
        };
        db.Users.Add(outsider);
        await db.SaveChangesAsync();

        var exception = await Assert.ThrowsAsync<DomainException>(() => service.CreateAsync(
            new CreateCorporateTaskCommand(
                "Tarefa inválida", "Descrição", type.Id, null, null,
                support.Id, support.Id, outsider.Id, null, null, null, "5511999990000", null, null, null, null, false, [], []),
            actor));

        Assert.Contains("não pertence", exception.Message);
    }

    [Fact]
    public async Task Status_change_requires_capability_and_records_the_transition()
    {
        await using var db = CreateContext();
        var (service, admin) = await InitializeAsync(db);
        var support = await db.TaskDepartments.SingleAsync(x => x.Name == "Suporte");
        var type = await db.TaskTypes.SingleAsync();
        var taskId = (await service.CreateAsync(new CreateCorporateTaskCommand(
            "Analisar protocolo", "Descrição suficiente", type.Id, null, null,
            support.Id, support.Id, null, null, null, null, "5511999990000", null, null, null, null, false, [], []), admin)).Id;
        var task = await db.CorporateTasks.SingleAsync(x => x.Id == taskId);
        var next = await db.TaskStatuses.SingleAsync(x => x.Name == "Em andamento");

        var readOnly = admin with
        {
            FullAccess = false,
            Permissions =
            [
                new EffectivePermission("tasks", true, false, true, false, false, [])
            ]
        };
        var denied = await Assert.ThrowsAsync<DomainException>(() => service.ChangeStatusAsync(
            new ChangeTaskStatusCommand(task.Id, next.Id, null, task.Version), readOnly));
        Assert.Equal(403, denied.StatusCode);

        await service.ChangeStatusAsync(
            new ChangeTaskStatusCommand(task.Id, next.Id, null, task.Version), admin);
        Assert.Equal(next.Id, (await db.CorporateTasks.SingleAsync(x => x.Id == task.Id)).StatusId);
        Assert.Equal(2, await db.TaskHistory.CountAsync(x => x.TaskId == task.Id));
    }

    [Fact]
    public async Task Creates_collaborator_with_department_and_coordination_membership()
    {
        await using var db = CreateContext();
        var (service, actor) = await InitializeAsync(db);
        var support = await db.TaskDepartments.SingleAsync(x => x.Name == "Suporte");

        var collaboratorId = await service.CreateCollaboratorAsync(
            new CreateTaskCollaboratorCommand(
                "Maria Oliveira", "MARIA@DONTUS.LOCAL", "(11) 99999-0000",
                "Analista de suporte", true, [support.Id], [support.Id]), actor);

        var collaborator = await db.Users.SingleAsync(x => x.Id == collaboratorId);
        var membership = await db.UserDepartments.SingleAsync(x => x.UserId == collaboratorId);
        Assert.Equal("maria@dontus.local", collaborator.Email);
        Assert.Equal("Suporte", collaborator.Department);
        Assert.True(membership.IsPrimary);
        Assert.True(membership.IsCoordinator);
    }

    [Fact]
    public async Task Rejects_collaborator_coordination_outside_selected_departments()
    {
        await using var db = CreateContext();
        var (service, actor) = await InitializeAsync(db);
        var support = await db.TaskDepartments.SingleAsync(x => x.Name == "Suporte");

        var exception = await Assert.ThrowsAsync<DomainException>(() =>
            service.CreateCollaboratorAsync(
                new CreateTaskCollaboratorCommand(
                    "Maria Oliveira", "maria@dontus.local", "", "", true, [], [support.Id]), actor));

        Assert.Contains("só pode coordenar", exception.Message);
    }

    [Theory]
    [InlineData("evidencia.pdf", "application/pdf")]
    [InlineData("gravacao.webm", "video/webm")]
    [InlineData("gravacao.mp4", "video/mp4")]
    public async Task Uploads_private_attachment_and_records_metadata_and_history(string fileName, string contentType)
    {
        await using var db = CreateContext();
        var storage = new FakeTaskFileStorage();
        var (service, actor) = await InitializeAsync(db, storage);
        var support = await db.TaskDepartments.SingleAsync(x => x.Name == "Suporte");
        var type = await db.TaskTypes.SingleAsync();
        var taskId = (await service.CreateAsync(new CreateCorporateTaskCommand(
            "Analisar evidência", "Descrição suficiente", type.Id, null, null,
            support.Id, support.Id, null, null, null, null, "5511999990000", null, null, null, null, false, [], []), actor)).Id;
        await using var content = new MemoryStream("conteúdo do anexo"u8.ToArray());

        var attachmentId = await service.UploadAttachmentAsync(
            new UploadTaskAttachmentCommand(
                taskId, null, fileName, contentType, content.Length, content), actor);

        var attachment = await db.TaskAttachments.SingleAsync(x => x.Id == attachmentId);
        var download = await service.GetAttachmentDownloadAsync(attachmentId, actor);
        Assert.Equal(fileName, attachment.FileName);
        Assert.Equal(content.Length, attachment.SizeBytes);
        Assert.Equal(attachment.StorageKey, storage.StoredKey);
        Assert.Contains(attachment.StorageKey, download.Url);
        Assert.Contains(await db.TaskHistory.ToListAsync(),
            entry => entry.TaskId == taskId && entry.EventType == "attachment_added");
        var saved = Assert.Single((await service.GetModuleAsync(actor)).Tasks.Single(task => task.Id == taskId).Attachments);
        Assert.Equal(fileName, saved.FileName);
        Assert.Equal($"/api/task-files/{attachmentId}", saved.Url);
    }

    [Theory]
    [InlineData(1, "2026-10-26T16:00:00Z")]
    [InlineData(5, "2026-10-30T16:00:00Z")]
    [InlineData(15, "2026-11-13T16:00:00Z")]
    public async Task Registered_sla_days_can_be_selected_in_other_departments_and_start_at_task_creation(int days, string deadline)
    {
        await using var db = CreateContext(); var (service, actor) = await InitializeAsync(db);
        var support = await db.TaskDepartments.SingleAsync(x => x.Name == "Suporte");
        var other = new TaskDepartment { Name = "Outro setor" }; db.TaskDepartments.Add(other); await db.SaveChangesAsync();
        var type = await db.TaskTypes.SingleAsync();
        var id = (await service.CreateAsync(new("Demanda", "Contexto", type.Id, null, null, support.Id, support.Id,
            null, null, null, null, "5511999990000", null, null, null, null, false, [], []), actor)).Id;
        var task = await db.CorporateTasks.SingleAsync(x => x.Id == id);
        task.CreatedAt = DateTimeOffset.Parse("2026-10-26T08:00:00Z"); await db.SaveChangesAsync();
        var slaId = await service.SaveSlaPolicyAsync(new(null, $"{days} dias úteis", other.Id, null, null, 0, 0, days * 480,
            [1,2,3,4,5], "08:00", "16:00", 0, 0, true, [], true), actor);
        await service.ChangeSlaAsync(new(id, slaId, task.Version), actor);
        var saved = (await service.GetModuleAsync(actor)).Tasks.Single(x => x.Id == id);
        Assert.Equal(slaId, saved.SlaPolicyId); Assert.Equal(DateTimeOffset.Parse(deadline), saved.SlaDueAt);
        (await db.TaskSlaPolicies.SingleAsync(x => x.Id == slaId)).Active = false; await db.SaveChangesAsync();
        await Assert.ThrowsAsync<DomainException>(() => service.ChangeSlaAsync(new(id, slaId, task.Version), actor));
    }

    [Fact]
    public async Task Transfer_moves_task_exclusively_to_destination_department()
    {
        await using var db = CreateContext();
        var (service, actor) = await InitializeAsync(db);
        var support = await db.TaskDepartments.SingleAsync(x => x.Name == "Suporte");
        var type = await db.TaskTypes.SingleAsync();
        var destination = new TaskDepartment
        {
            Name = "Financeiro",
            Description = "Demandas financeiras",
            Active = true,
        };
        db.TaskDepartments.Add(destination);
        db.TaskTypeDepartments.Add(new TaskTypeDepartment
        {
            TaskTypeId = type.Id,
            DepartmentId = destination.Id,
        });
        await db.SaveChangesAsync();

        var created = await service.CreateAsync(new CreateCorporateTaskCommand(
            "Conferir repasse", "Validar o repasse do contrato.", type.Id, null, null,
            support.Id, support.Id, null, null, null, null, "5511999990000",
            null, null, null, null, false, [], []), actor);
        var task = await db.CorporateTasks.SingleAsync(x => x.Id == created.Id);

        await service.TransferAsync(new TransferTaskCommand(
            task.Id, destination.Id, null, "Análise do setor financeiro", true, task.Version), actor);

        var transferred = await db.CorporateTasks.SingleAsync(x => x.Id == task.Id);
        var module = await service.GetModuleAsync(actor);
        Assert.Equal(destination.Id, transferred.CurrentDepartmentId);
        Assert.Equal("Financeiro", module.Tasks.Single(x => x.Id == task.Id).DepartmentName);
        Assert.Single(await db.TaskTransfers.Where(x => x.TaskId == task.Id).ToListAsync());
    }

    [Fact]
    public async Task Comment_preserves_line_breaks_and_emojis()
    {
        await using var db = CreateContext();
        var (service, actor) = await InitializeAsync(db);
        var support = await db.TaskDepartments.SingleAsync(x => x.Name == "Suporte");
        var type = await db.TaskTypes.SingleAsync();
        var created = await service.CreateAsync(new CreateCorporateTaskCommand(
            "Revisar retorno", "Descrição suficiente", type.Id, null, null,
            support.Id, support.Id, null, null, null, null, "5511999990000",
            null, null, null, null, false, [], []), actor);
        const string body = "Primeira atualização\n\nCliente retornou com sucesso ✅😀";

        await service.AddCommentAsync(new AddTaskCommentCommand(created.Id, body, []), actor);

        var module = await service.GetModuleAsync(actor);
        Assert.Contains(
            module.Tasks.Single(x => x.Id == created.Id).Comments,
            comment => comment.Body == body);
    }

    [Fact]
    public async Task Only_creator_or_assignee_can_update_or_delete_task()
    {
        await using var db = CreateContext();
        var (service, actor) = await InitializeAsync(db);
        var support = await db.TaskDepartments.SingleAsync(x => x.Name == "Suporte");
        var type = await db.TaskTypes.SingleAsync();
        var created = await service.CreateAsync(new CreateCorporateTaskCommand(
            "Título inicial", "Descrição inicial", type.Id, null, null,
            support.Id, support.Id, null, null, "1001", null, "5511999990000",
            null, null, null, null, false, [], []), actor);
        var task = await db.CorporateTasks.SingleAsync(x => x.Id == created.Id);

        await service.UpdateAsync(new UpdateCorporateTaskCommand(
            task.Id, "Título atualizado", "Descrição atualizada", type.Id, null,
            "1001", null, "5511988880000", false, [], task.Version), actor);
        task = await db.CorporateTasks.SingleAsync(x => x.Id == created.Id);
        Assert.Equal("Título atualizado", task.Title);

        var outsider = new AppUser
        {
            Email = "outro@dontus.local",
            DisplayName = "Outro usuário",
            CreatedBy = "tests@dontus.local"
        };
        db.Users.Add(outsider);
        await db.SaveChangesAsync();
        var outsiderActor = actor with { Email = outsider.Email, DisplayName = outsider.DisplayName };
        var denied = await Assert.ThrowsAsync<DomainException>(() => service.UpdateAsync(
            new UpdateCorporateTaskCommand(task.Id, task.Title, task.Description, type.Id, null,
                task.CustomerCode, null, task.ClientWhatsApp, false, [], task.Version), outsiderActor));
        Assert.Equal(403, denied.StatusCode);

        await service.DeleteAsync(new DeleteCorporateTaskCommand(task.Id, task.Version), actor);
        Assert.False(await db.CorporateTasks.AnyAsync(x => x.Id == task.Id));
    }

    [Theory]
    [InlineData(1)]
    [InlineData(3)]
    [InlineData(30)]
    public async Task Sla_days_can_be_saved_and_changed_without_losing_the_deadline(int days)
    {
        await using var db = CreateContext(); var (service, actor) = await InitializeAsync(db);
        var department = await db.TaskDepartments.FirstAsync(x => x.Active);
        var command = new SaveTaskSlaPolicyCommand(null, $"{days} dias úteis", department.Id, null, null, 0, 0, days * 480,
            [1,2,3,4,5], "08:00", "16:00", 0, 0, true, [], true);
        var id = await service.SaveSlaPolicyAsync(command, actor);
        Assert.Equal(days * 480, (await db.TaskSlaPolicies.SingleAsync(x => x.Id == id)).CompletionMinutes);
        await service.SaveSlaPolicyAsync(command with { Id = id, Name = "Prazo alterado", CompletionMinutes = (days + 1) * 480 }, actor);
        Assert.Equal((days + 1) * 480, (await service.GetModuleAsync(actor)).SlaPolicies.Single(x => x.Id == id).CompletionMinutes);
    }

    [Fact]
    public async Task Startup_preserves_inactive_priorities_and_does_not_restore_deleted_status_options()
    {
        await using var db = CreateContext(); var (service, _) = await InitializeAsync(db);
        var priority = await db.TaskPriorities.SingleAsync(x => x.Name == "Não definida"); priority.Active = false;
        var status = await db.TaskStatuses.SingleAsync(x => x.Name == "Aguardando aprovação");
        db.TaskTypeStatuses.RemoveRange(await db.TaskTypeStatuses.Where(x => x.StatusId == status.Id).ToListAsync());
        db.TaskSlaPauseStatuses.RemoveRange(await db.TaskSlaPauseStatuses.Where(x => x.StatusId == status.Id).ToListAsync());
        db.TaskStatuses.Remove(status); await db.SaveChangesAsync(); await service.InitializeAsync();
        Assert.False(priority.Active); Assert.False(await db.TaskStatuses.AnyAsync(x => x.Name == "Aguardando aprovação"));
    }

    [Fact]
    public async Task Employee_department_type_and_stages_are_available_to_a_full_access_user_without_memberships()
    {
        await using var db = CreateContext(); var (service, actor) = await InitializeAsync(db);
        var access = new AccessControlService(db, new ConfigurationBuilder().Build(), new RecordingPasswordEmailSender());
        var departmentId = await access.SaveEmployeeDepartmentAsync(new(null, "Setor criado em Colaboradores", "Compartilhado com tarefas", true), actor);
        db.UserDepartments.RemoveRange(await db.UserDepartments.ToListAsync()); await db.SaveChangesAsync();
        var initialId = await service.SaveStatusAsync(new(null, "Pendente configurada", null, 1, "Pendente configurada", true, false, true, true, false, true), actor);
        var finalId = await service.SaveStatusAsync(new(null, "Final configurada", null, 2, "Final configurada", false, true, false, true, false, true), actor);
        var typeId = await service.SaveTypeAsync(new(null, "Backup configurado", "", null, null, initialId, [departmentId], [initialId, finalId], true), actor);
        var module = await service.GetModuleAsync(actor);
        Assert.Contains(module.Departments, department => department.Id == departmentId && department.Active);
        var type = Assert.Single(module.Types, type => type.Id == typeId);
        Assert.Contains(departmentId, type.DepartmentIds); Assert.Equal(initialId, type.InitialStatusId); Assert.Contains(finalId, type.AllowedStatusIds);
        var created = await service.CreateAsync(new("Tarefa no novo setor", "Contexto", typeId, null, null, departmentId, departmentId, null,
            null, "150001", null, "5511999990000", null, null, null, null, false, [], []), actor);
        var task = Assert.Single((await service.GetModuleAsync(actor)).Tasks, task => task.Id == created.Id);
        Assert.Equal("Backup configurado", task.TypeName); Assert.Equal("Pendente configurada", task.StatusName);
        Assert.Equal("Setor criado em Colaboradores", task.DepartmentName);
    }

    [Fact]
    public async Task A_retired_initial_reference_is_repaired_to_the_unique_configured_initial_without_moving_existing_tasks()
    {
        await using var db = CreateContext(); var (service, actor) = await InitializeAsync(db);
        var type = await db.TaskTypes.SingleAsync(); var departmentId = (await db.TaskTypeDepartments.SingleAsync()).DepartmentId;
        var existing = await service.CreateAsync(new("Histórico preservado", "Contexto", type.Id, null, null, departmentId, departmentId, null,
            null, "150001", null, "5511999990000", null, null, null, null, false, [], []), actor);
        var oldId = type.InitialStatusId; (await db.TaskStatuses.SingleAsync(status => status.Id == oldId)).Active = false;
        await db.SaveChangesAsync();
        var configured = await service.SaveStatusAsync(new(null, "Pendente", null, 1, "Pendente", true, false, true, true, false, true), actor);
        await service.InitializeAsync();
        Assert.Equal(configured, type.InitialStatusId);
        Assert.True(await db.TaskTypeStatuses.AnyAsync(link => link.TaskTypeId == type.Id && link.StatusId == configured));
        Assert.Equal(oldId, (await db.CorporateTasks.SingleAsync(task => task.Id == existing.Id)).StatusId);
        Assert.False((await db.TaskStatuses.SingleAsync(status => status.Id == oldId)).Active);
        Assert.Single(db.AuditEvents.Where(entry => entry.Action == "RepairTaskTypeInitialStatus"));
        var version = type.Version; await service.InitializeAsync(); Assert.Equal(version, type.Version);
        Assert.Single(db.AuditEvents.Where(entry => entry.Action == "RepairTaskTypeInitialStatus"));
        var created = await service.CreateAsync(new("Novo fluxo", "Contexto", type.Id, null, null, departmentId, departmentId, null,
            null, "150001", null, "5511999990000", null, null, null, null, false, [], []), actor);
        Assert.Equal(configured, (await db.CorporateTasks.SingleAsync(task => task.Id == created.Id)).StatusId);
    }

    [Fact]
    public async Task An_ambiguous_initial_configuration_is_not_guessed_or_reactivated()
    {
        await using var db = CreateContext(); var (service, actor) = await InitializeAsync(db);
        var type = await db.TaskTypes.SingleAsync(); var oldId = type.InitialStatusId;
        (await db.TaskStatuses.SingleAsync(status => status.Id == oldId)).Active = false; await db.SaveChangesAsync();
        foreach (var name in new[] { "Inicial A", "Inicial B" })
            await service.SaveStatusAsync(new(null, name, null, 1, name, true, false, true, true, false, true), actor);
        await service.InitializeAsync(); Assert.Equal(oldId, type.InitialStatusId);
        Assert.False((await db.TaskStatuses.SingleAsync(status => status.Id == oldId)).Active);
        Assert.Empty(db.AuditEvents.Where(entry => entry.Action == "RepairTaskTypeInitialStatus"));
    }

    [Fact]
    public async Task A_type_for_multiple_departments_requires_a_shared_initial_stage()
    {
        await using var db = CreateContext(); var (service, actor) = await InitializeAsync(db);
        var departments = await db.TaskDepartments.Where(department => department.Active).Take(2).Select(department => department.Id).ToArrayAsync();
        var scoped = await service.SaveStatusAsync(new(null, "Inicial restrita", departments[0], 1, "Inicial restrita", true, false, true, true, false, true), actor);
        await Assert.ThrowsAsync<DomainException>(() => service.SaveTypeAsync(new(null, "Tipo compartilhado", "", null, null, scoped, departments, [scoped], true), actor));
    }

    [Fact]
    public async Task A_coordinator_selected_in_employee_departments_becomes_the_task_approver_and_survives_catalog_toggles()
    {
        await using var db = CreateContext(); var (tasks, actor) = await InitializeAsync(db);
        var support = await db.TaskDepartments.SingleAsync(entry => entry.Name == "Suporte");
        var coordinator = new AppUser { Email = "coordinator@test.local", DisplayName = "Coordenação escolhida", CreatedBy = "tests" };
        db.Users.Add(coordinator); await db.SaveChangesAsync();
        var access = new AccessControlService(db, new ConfigurationBuilder().Build(), new RecordingPasswordEmailSender());
        await access.SaveEmployeeDepartmentAsync(new(support.Id, support.Name, support.Description, true, [coordinator.Id]), actor);
        Assert.Contains((await access.GetManagementAsync(actor)).Departments.Single(entry => entry.Id == support.Id).CoordinatorUserIds!, id => id == coordinator.Id);
        await access.SaveEmployeeDepartmentAsync(new(support.Id, support.Name, support.Description, false), actor);
        await access.SaveEmployeeDepartmentAsync(new(support.Id, support.Name, support.Description, true), actor);
        Assert.True((await db.UserDepartments.SingleAsync(entry => entry.UserId == coordinator.Id && entry.DepartmentId == support.Id)).IsCoordinator);
        var type = await db.TaskTypes.SingleAsync();
        var created = await tasks.CreateAsync(new("Nova solicitação", "Descrição", type.Id, null, null, support.Id, support.Id, null,
            null, "123456", "Clínica", "5511999999999", null, null, null, null, false, [coordinator.Id], []), actor);
        Assert.Contains(await db.TaskComments.Where(entry => entry.TaskId == created.Id).ToArrayAsync(), entry => entry.Body == $"[APROVADOR:{coordinator.Id}]");
        Assert.Contains(await db.TaskParticipants.Where(entry => entry.TaskId == created.Id).ToArrayAsync(), entry => entry.UserId == coordinator.Id);
        await access.SaveEmployeeDepartmentAsync(new(support.Id, support.Name, support.Description, true, []), actor);
        Assert.False((await db.UserDepartments.SingleAsync(entry => entry.UserId == coordinator.Id && entry.DepartmentId == support.Id)).IsCoordinator);
    }

    private static async Task<(TaskService Service, ActorContext Actor)> InitializeAsync(
        OperationsDbContext db,
        ITaskFileStorage? storage = null)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["AccessControl:BootstrapAdminEmail"] = "gestor@dontus.local",
                ["AccessControl:BootstrapAdminName"] = "Gestor Dontus",
            }).Build();
        var access = new AccessControlService(db, configuration, new RecordingPasswordEmailSender());
        await access.InitializeAsync();
        var service = new TaskService(db, storage);
        await service.InitializeAsync();
        var actor = await access.ResolveActorAsync(new AuthenticatedIdentity("gestor@dontus.local", "Gestor"));
        return (service, actor);
    }

    private static OperationsDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<OperationsDbContext>()
            .UseInMemoryDatabase($"dontus-task-tests-{Guid.NewGuid():N}")
            .Options;
        return new OperationsDbContext(options);
    }

    private sealed class FakeTaskFileStorage : ITaskFileStorage
    {
        public string StoredKey { get; private set; } = "";

        public async Task StoreAsync(
            string key,
            Stream content,
            string contentType,
            long sizeBytes,
            CancellationToken cancellationToken = default)
        {
            StoredKey = key;
            await content.CopyToAsync(Stream.Null, cancellationToken);
        }

        public Task DeleteAsync(string key, CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public string CreateDownloadUrl(string key, string fileName, string contentType) =>
            $"https://files.local/{key}";
    }
}
