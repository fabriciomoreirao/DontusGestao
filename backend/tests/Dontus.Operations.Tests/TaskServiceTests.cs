using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Dontus.Operations.Tests;

public sealed class TaskServiceTests
{
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
        var access = new AccessControlService(db, new ConfigurationBuilder().Build());
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
