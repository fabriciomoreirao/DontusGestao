using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Tests;

public sealed partial class SuggestionServiceTests
{
    [Fact]
    public async Task Responsible_and_administrative_permissions_do_not_replace_the_coordinator_requirement()
    {
        await using var db=CreateContext();var user=AddUser(db,"owner@test","Responsável");user.IsCoordinator=false;
        await db.SaveChangesAsync();var service=new SuggestionService(db);await service.InitializeAsync();
        var priority=await db.SuggestionPriorities.FirstAsync();var created=await service.CreateSuggestionAsync(new("Sugestão protegida","Descrição",null,priority.Id,false,false),Actor(user));
        var suggestion=await db.Suggestions.SingleAsync();var status=await db.SuggestionStatuses.FirstAsync(entry=>entry.Id!=suggestion.StatusId);
        using var bytes=new MemoryStream([1,2,3]);var attachment=await service.UploadAttachmentAsync(new(created.Id,"arquivo.pdf","application/pdf",3,bytes),Actor(user));
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.UpdateSuggestionAsync(new(suggestion.Id,"Alterada","Outra descrição",null,priority.Id,false,false,suggestion.Version),Actor(user)))).StatusCode);
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.ChangeStatusAsync(new(suggestion.Id,status.Id,suggestion.Version),Actor(user)))).StatusCode);
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.DeleteSuggestionAsync(suggestion.Id,Actor(user)))).StatusCode);
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.DeleteAttachmentAsync(attachment,Actor(user)))).StatusCode);
        await service.AddCommentAsync(new(suggestion.Id,"Comentário permitido."),Actor(user));
        Assert.Single(db.Suggestions);Assert.Single(db.SuggestionAttachments);Assert.Single(db.SuggestionComments);
        Assert.Equal("Sugestão protegida",suggestion.Name);
    }

    [Fact]
    public async Task Coordinators_with_edit_permission_can_manage_another_responsibles_suggestion()
    {
        await using var db=CreateContext();var owner=AddUser(db,"owner@test","Responsável");owner.IsCoordinator=false;
        var coordinator=AddUser(db,"coordinator@test","Coordenação");await db.SaveChangesAsync();
        var service=new SuggestionService(db);await service.InitializeAsync();var priority=await db.SuggestionPriorities.FirstAsync();
        var created=await service.CreateSuggestionAsync(new("Sugestão da equipe","Contexto",null,priority.Id,false,false),Actor(owner));
        var suggestion=await db.Suggestions.SingleAsync();var actor=Actor(coordinator) with { Permissions=[new("suggestions",true,false,true,false,false)] };
        var readOnly=actor with { Permissions=[new("suggestions",true,false,false,false,false)] };
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.DeleteSuggestionAsync(suggestion.Id,readOnly))).StatusCode);
        await service.UpdateSuggestionAsync(new(suggestion.Id,"Revisada","Contexto revisado",null,priority.Id,true,false,suggestion.Version),actor);
        var status=await db.SuggestionStatuses.FirstAsync(entry=>entry.Name=="Em análise");
        await service.ChangeStatusAsync(new(suggestion.Id,status.Id,suggestion.Version),actor);
        Assert.Equal("Revisada",suggestion.Name);Assert.Equal(status.Id,suggestion.StatusId);
        await service.DeleteSuggestionAsync(created.Id,actor);Assert.Empty(db.Suggestions);
    }

    [Fact]
    public async Task Non_coordinators_can_upload_their_own_creation_files_but_cannot_change_another_suggestions_files()
    {
        await using var db=CreateContext();var owner=AddUser(db,"owner@test","Responsável");owner.IsCoordinator=false;
        var other=AddUser(db,"other@test","Outro");other.IsCoordinator=false;await db.SaveChangesAsync();
        var service=new SuggestionService(db);await service.InitializeAsync();var priority=await db.SuggestionPriorities.FirstAsync();
        var created=await service.CreateSuggestionAsync(new("Sugestão com anexo","Contexto",null,priority.Id,false,false),Actor(owner));
        using var bytes=new MemoryStream([1,2,3]);
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.UploadAttachmentAsync(new(created.Id,"arquivo.pdf","application/pdf",3,bytes),Actor(other)))).StatusCode);
        var id=await service.UploadAttachmentAsync(new(created.Id,"arquivo.pdf","application/pdf",3,bytes),Actor(owner));
        Assert.Equal(id,Assert.Single(db.SuggestionAttachments).Id);
    }
    [Fact]
    public async Task Creates_sequential_protocols_and_uses_the_creator_as_responsible()
    {
        await using var db = CreateContext();
        var user = AddUser(db, "criador@dontus.local", "Criador da Sugestão");
        await db.SaveChangesAsync();
        var service = new SuggestionService(db);
        await service.InitializeAsync();
        var priority = await db.SuggestionPriorities.OrderBy(entry => entry.DisplayOrder).FirstAsync();

        var firstResult = await service.CreateSuggestionAsync(
            new CreateSuggestionCommand("Primeira melhoria", "Descrição", null, priority.Id, true, false), Actor(user));
        var secondResult = await service.CreateSuggestionAsync(
            new CreateSuggestionCommand("Segunda melhoria", null, null, priority.Id, false, true), Actor(user));

        var first = await db.Suggestions.SingleAsync(entry => entry.Id == firstResult.Id);
        var second = await db.Suggestions.SingleAsync(entry => entry.Id == secondResult.Id);
        Assert.Equal($"S{DateTimeOffset.UtcNow:yy}0001", first.Protocol);
        Assert.Equal($"S{DateTimeOffset.UtcNow:yy}0002", second.Protocol);
        Assert.Equal(first.Protocol, firstResult.Protocol);
        Assert.True(firstResult.Protocol.Length <= 20);
        Assert.Equal(user.Id, first.ResponsibleUserId);
        Assert.True(first.StrategicClient);
        Assert.True(second.CancellationRisk);
        Assert.Equal((await db.SuggestionStatuses.SingleAsync(entry => entry.IsInitial)).Id, first.StatusId);
    }

    [Fact]
    public async Task Changes_status_with_version_control_and_persists_comments()
    {
        await using var db = CreateContext();
        var user = AddUser(db, "analista@dontus.local", "Analista");
        await db.SaveChangesAsync();
        var service = new SuggestionService(db);
        await service.InitializeAsync();
        var priority = await db.SuggestionPriorities.FirstAsync();
        var targetStatus = await db.SuggestionStatuses.OrderBy(entry => entry.DisplayOrder).Skip(1).FirstAsync();
        var created = await service.CreateSuggestionAsync(
            new CreateSuggestionCommand("Melhoria comentada", null, null, priority.Id, false, false), Actor(user));
        var id = created.Id;
        var suggestion = await db.Suggestions.SingleAsync(entry => entry.Id == id);
        var originalVersion = suggestion.Version;

        await service.ChangeStatusAsync(new ChangeSuggestionStatusCommand(id, targetStatus.Id, originalVersion), Actor(user));
        await service.AddCommentAsync(new AddSuggestionCommentCommand(id, "Concordo com a análise."), Actor(user));
        var module = await service.GetModuleAsync(Actor(user));

        var result = Assert.Single(module.Suggestions);
        Assert.Equal(targetStatus.Id, result.StatusId);
        Assert.Equal("Concordo com a análise.", Assert.Single(result.Comments).Body);
        await Assert.ThrowsAsync<DomainException>(() => service.ChangeStatusAsync(
            new ChangeSuggestionStatusCommand(id, targetStatus.Id, originalVersion), Actor(user)));
    }

    [Fact]
    public async Task Keeps_only_one_initial_status_when_catalog_is_changed()
    {
        await using var db = CreateContext();
        var user = AddUser(db, "gestor@dontus.local", "Gestor");
        await db.SaveChangesAsync();
        var service = new SuggestionService(db);
        await service.InitializeAsync();

        var newStatusId = await service.SaveStatusAsync(
            new SaveSuggestionStatusCommand(null, "Triagem executiva", "Status para triagem da gestão.", "Triagem", "#123456", 5, true, true), Actor(user));

        Assert.Equal(newStatusId, (await db.SuggestionStatuses.SingleAsync(entry => entry.IsInitial)).Id);
    }

    [Theory]
    [InlineData("Em desenvolvimento")]
    [InlineData("Enviada ao TI")]
    [InlineData("Em produção")]
    public async Task Completes_suggestions_when_handed_to_delivery(string requestedStatus)
    {
        await using var db = CreateContext();
        var user = AddUser(db, "gestor@dontus.local", "Gestor");
        await db.SaveChangesAsync();
        var service = new SuggestionService(db);
        await service.InitializeAsync();
        var priority = await db.SuggestionPriorities.FirstAsync();
        var status = new SuggestionStatus { Name = requestedStatus, KanbanColumn = requestedStatus };
        db.SuggestionStatuses.Add(status);
        await db.SaveChangesAsync();
        var created = await service.CreateSuggestionAsync(new CreateSuggestionCommand("Melhoria", "Contexto", null, priority.Id, false, false), Actor(user));
        var suggestion = await db.Suggestions.SingleAsync(entry => entry.Id == created.Id);
        await service.ChangeStatusAsync(new ChangeSuggestionStatusCommand(suggestion.Id, status.Id, suggestion.Version), Actor(user));
        var completed = await db.SuggestionStatuses.SingleAsync(entry => entry.Id == suggestion.StatusId);
        Assert.Equal("Concluída", completed.Name);
        Assert.Equal("Contexto", suggestion.Description);
    }

    [Fact]
    public async Task Files_can_be_replaced_and_removed_only_with_edit_permission()
    {
        await using var db=CreateContext();var user=AddUser(db,"files@test","Responsável");await db.SaveChangesAsync();var service=new SuggestionService(db);await service.InitializeAsync();
        var priority=await db.SuggestionPriorities.FirstAsync();var suggestion=await service.CreateSuggestionAsync(new("Anexos","Contexto",null,priority.Id,false,false),Actor(user));
        using var first=new MemoryStream([1,2,3]);var file=await service.UploadAttachmentAsync(new(suggestion.Id,"imagem.png","image/png",3,first),Actor(user));
        var reader=Actor(user) with {Permissions=[new("suggestions",true,false,false,false,false)]};
        Assert.Equal(403,(await Assert.ThrowsAsync<DomainException>(()=>service.DeleteAttachmentAsync(file,reader))).StatusCode);
        await service.DeleteAttachmentAsync(file,Actor(user));Assert.Empty(await db.SuggestionAttachments.ToArrayAsync());Assert.Empty(await db.SuggestionAttachmentContents.ToArrayAsync());
        using var replacement=new MemoryStream([4,5,6]);var newFile=await service.UploadAttachmentAsync(new(suggestion.Id,"video.mp4","video/mp4",3,replacement),Actor(user));
        Assert.Equal(newFile,Assert.Single((await service.GetModuleAsync(Actor(user))).Suggestions).Attachments.Single().Id);
        Assert.NotNull((await service.GetAttachmentDownloadAsync(newFile,reader)).Content);
    }

    [Theory]
    [InlineData("arte.svg", "image/svg+xml")]
    [InlineData("backup.7z", "application/octet-stream")]
    [InlineData("pagina.html", "text/html")]
    [InlineData("arquivo.exe", "application/octet-stream")]
    public async Task General_file_formats_keep_their_bytes_and_download_names(string name, string type)
    {
        await using var db = CreateContext();
        var user = AddUser(db, "all-formats@test", "Responsável");
        await db.SaveChangesAsync();
        var service = new SuggestionService(db);
        await service.InitializeAsync();
        var priority = await db.SuggestionPriorities.FirstAsync();
        var suggestion = await service.CreateSuggestionAsync(new("Anexos", "Contexto", null, priority.Id, false, false), Actor(user));
        var original = new byte[] { 0, 1, 2, 255 };
        using var bytes = new MemoryStream(original);
        var id = await service.UploadAttachmentAsync(new(suggestion.Id, name, type, bytes.Length, bytes), Actor(user));
        var download = await service.GetAttachmentDownloadAsync(id, Actor(user));
        Assert.Equal(name, download.FileName);
        Assert.Equal(type, download.ContentType);
        Assert.Equal(original, download.Content);
    }

    private static AppUser AddUser(OperationsDbContext db, string email, string name)
    {
        var user = new AppUser { Email = email, DisplayName = name, Department = "Produto", IsCoordinator = true, CreatedBy = "tests@dontus.local" };
        db.Users.Add(user);
        return user;
    }

    private static ActorContext Actor(AppUser user) => new(
        user.Email, user.DisplayName, "Administrador", user.Department,
        [
            new EffectivePermission("suggestions", true, true, true, false, false),
            new EffectivePermission("admin", true, true, true, true, true),
        ]);

    private static OperationsDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<OperationsDbContext>()
            .UseInMemoryDatabase($"dontus-suggestion-tests-{Guid.NewGuid():N}")
            .Options;
        return new OperationsDbContext(options);
    }
}
