using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Dontus.Operations.Tests;

public sealed class TaskServiceTests
{
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
        Assert.Single(await db.TaskNotifications.Where(x => x.TaskId == taskId).ToListAsync());

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

    [Fact]
    public async Task Uploads_private_attachment_and_records_metadata_and_history()
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
                taskId, null, "evidencia.pdf", "application/pdf", content.Length, content), actor);

        var attachment = await db.TaskAttachments.SingleAsync(x => x.Id == attachmentId);
        var download = await service.GetAttachmentDownloadAsync(attachmentId, actor);
        Assert.Equal("evidencia.pdf", attachment.FileName);
        Assert.Equal(content.Length, attachment.SizeBytes);
        Assert.Equal(attachment.StorageKey, storage.StoredKey);
        Assert.Contains(attachment.StorageKey, download.Url);
        Assert.Contains(await db.TaskHistory.ToListAsync(),
            entry => entry.TaskId == taskId && entry.EventType == "attachment_added");
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
        var access = new AccessControlService(db, configuration);
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
