using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed class CatalogConfigurationTests
{
    private static OperationsDbContext Context() => new(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private static ActorContext Actor(string module) => new("teste@dontus.local", "Gestor de testes", "Gestor", "Gestão", [new EffectivePermission(module, true, true, true, true, true)]);

    [Theory]
    [InlineData("customers", "version")]
    [InlineData("commercial", "acquisitionChannel")]
    [InlineData("commercial", "followUpType")]
    [InlineData("commercial", "lossReason")]
    [InlineData("commercial", "temperature")]
    [InlineData("commercial", "retentionStatus")]
    [InlineData("cs", "csWorkflowStatus")]
    [InlineData("cs", "enterpriseUnitStatus")]
    [InlineData("lia", "liaAdjustmentType")]
    [InlineData("support", "serviceStatus")]
    [InlineData("waitingQueue", "waitingQueueRequestType")]
    [InlineData("cancellations", "cancellationReason")]
    [InlineData("hr", "hrCommunicationType")]
    [InlineData("admin", "recruitmentStage")]
    public async Task Area_manager_can_save_and_remove_own_catalog(string module, string catalog)
    {
        await using var db = Context(); var service = new OperationsService(db); var actor = Actor(module);
        var id = await service.SaveCustomerCatalogAsync(null, catalog, "Opção", "{}", true, actor);
        await service.SaveCustomerCatalogAsync(id, catalog, "Opção editada", "{}", false, actor);
        Assert.False((await db.CustomerCatalogOptions.SingleAsync()).Active);
        await service.DeleteCustomerCatalogAsync(id, actor);
        Assert.Empty(db.CustomerCatalogOptions);
    }

    [Fact]
    public async Task Cannot_reclassify_another_areas_catalog_or_duplicate_existing_names()
    {
        await using var db = Context(); var service = new OperationsService(db);
        var id = await service.SaveCustomerCatalogAsync(null, "commercialProduct", "Produto", "{}", true, Actor("commercial"));
        var error = await Assert.ThrowsAsync<DomainException>(() => service.SaveCustomerCatalogAsync(id, "csUsage", "Desvio", "{}", true, Actor("cs")));
        Assert.Contains("original", error.Message);
        await Assert.ThrowsAsync<DomainException>(() => service.DeleteCustomerCatalogAsync(id, Actor("cs")));
        await Assert.ThrowsAsync<DomainException>(() => service.SaveCustomerCatalogAsync(null, "commercialProduct", " produto ", "{}", true, Actor("commercial")));
        Assert.Equal("commercialProduct", (await db.CustomerCatalogOptions.SingleAsync()).Catalog);
    }

    [Theory]
    [InlineData("{\"s\":[]}")]
    [InlineData("{\"s\":[[\"Análise\",\"#2563eb\",1,1]]}")]
    [InlineData("{\"s\":[[\"Análise\"],[\" análise \"]]}")]
    [InlineData("{\"stages\":[{\"name\":\"\"}]}")]
    [InlineData("{\"stages\":[{}]}")]
    public async Task Invalid_funnels_return_a_validation_error(string description)
    {
        await using var db = Context();
        await Assert.ThrowsAsync<DomainException>(() => new OperationsService(db).SaveCustomerCatalogAsync(null, "funnelStage", "Funil", description, true, Actor("commercial")));
        Assert.Empty(db.CustomerCatalogOptions);
    }

    [Fact]
    public async Task New_stage_uses_one_name_preserves_flags_and_is_available_in_the_flow()
    {
        await using var db = Context(); var service = new TaskService(db);
        await service.InitializeAsync();
        var initial = await db.TaskStatuses.FirstAsync(x => x.IsInitial);
        var type = await db.TaskTypes.FirstAsync();
        var id = await service.SaveStatusAsync(new(null, " Análise especializada ", null, 10, "", false, false, true, true, true, true), Actor("catalogs"));
        var stage = await db.TaskStatuses.SingleAsync(x => x.Id == id);
        Assert.Equal("Análise especializada", stage.Name); Assert.Equal(stage.Name, stage.KanbanColumn);
        Assert.True(stage.RequiresJustification); Assert.True(stage.AcceptsNewTasks); Assert.True(stage.ManualMovement);
        Assert.Contains(db.TaskTypeStatuses, x => x.TaskTypeId == type.Id && x.StatusId == id);
        await service.SaveStatusAsync(new(id, "Análise especializada", null, 10, "Nome antigo", false, false, true, false, true, false), Actor("catalogs"));
        Assert.False(stage.Active); Assert.False(stage.ManualMovement); Assert.True(stage.RequiresJustification);
        await service.SaveStatusAsync(new(id, stage.Name, null, 10, "", false, false, true, false, true, true), Actor("catalogs"));
        Assert.True(stage.Active);
        await Assert.ThrowsAsync<DomainException>(() => service.DeleteCatalogEntryAsync("statuses", initial.Id, Actor("catalogs")));
        await Assert.ThrowsAsync<DomainException>(() => service.SaveStatusAsync(new(null, "Análise", Guid.NewGuid(), 10, "", false, false, true, true, false, true), Actor("catalogs")));
        await Assert.ThrowsAsync<DomainException>(() => service.SaveStatusAsync(new(Guid.NewGuid(), "Etapa ausente", null, 10, "", false, false, true, true, false, true), Actor("catalogs")));
    }

    [Fact]
    public async Task Task_type_rejects_unknown_references_and_final_initial_stage()
    {
        await using var db = Context(); var service = new TaskService(db); await service.InitializeAsync();
        var department = await db.TaskDepartments.FirstAsync(); var initial = await db.TaskStatuses.FirstAsync(x => x.IsInitial); var final = await db.TaskStatuses.FirstAsync(x => x.IsFinal);
        await Assert.ThrowsAsync<DomainException>(() => service.SaveTypeAsync(new(null, "Tipo", "", null, null, initial.Id, [Guid.NewGuid()], [initial.Id], true), Actor("catalogs")));
        await Assert.ThrowsAsync<DomainException>(() => service.SaveTypeAsync(new(null, "Tipo", "", null, null, final.Id, [department.Id], [final.Id], true), Actor("catalogs")));
        await Assert.ThrowsAsync<DomainException>(() => service.SaveTypeAsync(new(null, "Tipo", "", Guid.NewGuid(), null, initial.Id, [department.Id], [initial.Id], true), Actor("catalogs")));
    }

    [Fact]
    public async Task Cannot_delete_a_calendar_with_commitments_or_block_periods()
    {
        await using var db = Context();
        var calendar = new AgendaCalendar { Name = "Agenda CS", DepartmentId = Guid.NewGuid() };
        db.AgendaCalendars.Add(calendar);
        db.AgendaCommitments.Add(new AgendaCommitment { AgendaId = calendar.Id, Title = "Compromisso preservado", CreatedBy = "teste@dontus.local" });
        await db.SaveChangesAsync();
        await Assert.ThrowsAsync<DomainException>(() => new AgendaService(db).DeleteCalendarAsync(calendar.Id, Actor("agenda")));
        Assert.Single(db.AgendaCommitments); Assert.Single(db.AgendaCalendars);
    }

    [Theory]
    [InlineData("unsuccessful", "Finalizado por falta de retorno")]
    [InlineData("validation", "Pendente")]
    [InlineData("cancelledWithoutTraining", "Cancelado sem treinamento")]
    public async Task Journey_phase_and_operational_status_remain_consistent(string phase, string expectedStatus)
    {
        await using var db = Context();
        var item = new WorkItem { Module = "cs", RecordType = "Acompanhamento", Title = "Cliente", Status = "Em acompanhamento", CreatedBy = "teste@dontus.local" };
        db.WorkItems.Add(item); await db.SaveChangesAsync();
        await new OperationsService(db).UpdateWorkItemAsync(new(item.Id, item.Title, item.Owner, 0, $"{{\"kind\":\"csJourney\",\"phase\":\"{phase}\"}}", null, null, item.Version), Actor("cs"));
        Assert.Equal(expectedStatus, item.Status);
    }

    [Fact]
    public async Task Read_only_access_cannot_manage_catalogs()
    {
        await using var db = Context();
        var reader = new ActorContext("leitor@dontus.local", "Leitor", "Colaborador", "CS", [new EffectivePermission("catalogs", true, false, false, false, false), new EffectivePermission("cs", true, false, false, false, false)]);
        await Assert.ThrowsAsync<DomainException>(() => new OperationsService(db).SaveCustomerCatalogAsync(null, "csUsage", "Uso", "{}", true, reader));
        await Assert.ThrowsAsync<DomainException>(() => new TaskService(db).SaveStatusAsync(new(null, "Etapa", null, 1, "", false, false, true, true, false, true), reader));
        Assert.Empty(db.CustomerCatalogOptions); Assert.Empty(db.TaskStatuses);
    }
}
