using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Dontus.Operations.Tests;

public sealed class PublicRecruitmentTests : IDisposable
{
    private readonly OperationsDbContext db = new(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private readonly string root = Path.Combine(Path.GetTempPath(), $"dontus-recruitment-{Guid.NewGuid():N}");
    private readonly ActorContext uploader = new("public-upload:test", "Candidato", "Público", "", [new("admin", false, true, false, false, false)]);
    private WorkspaceFileStorage Files => new(new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> { ["WorkspaceFiles:Path"] = root }).Build(), db);
    private PublicRecruitmentService Service => new(db, new OperationsService(db), Files);
    private async Task<WorkItem> Process(string status = "Ativo")
    {
        var process = new WorkItem { Module = "admin", RecordType = "Processo seletivo", Title = "Seleção CS", Team = "Sucesso do Cliente", Status = status, CreatedBy = "admin@test",
            Description = JsonSerializer.Serialize(new { vacancy = "Analista CS", description = "Atendimento **humanizado**.", requirements = "Experiência", responsibilities = "Acompanhar clientes", benefits = "Vale alimentação", stages = new[] { "Triagem inicial", "Entrevista" }, internalNote = "Dado interno" }) };
        db.WorkItems.Add(process); await db.SaveChangesAsync(); return process;
    }
    private async Task<string> Curriculum(Guid id)
    {
        var entry = await Files.BeginAsync(new("curriculo.pdf", "application/pdf", 4, "admin", id), uploader, default);
        await Files.AppendAsync(entry.Id, 0, new MemoryStream([1,2,3,4]), uploader, default); await Files.CompleteAsync(entry.Id, uploader, default);
        return $"/api/workspace-files/{entry.Id}";
    }
    [Fact]
    public async Task Public_projection_contains_only_the_vacancy_and_lists_only_open_processes()
    {
        var open = await Process(); await Process("Finalizado");
        var vacancy = Assert.Single(await Service.ListAsync(default)); Assert.Equal(open.Id, vacancy.Id); Assert.Equal("Analista CS", vacancy.Vacancy);
        Assert.DoesNotContain("Dado interno", JsonSerializer.Serialize(vacancy)); Assert.Equal("Acompanhar clientes", vacancy.Responsibilities);
        Assert.Equal(404, (await Assert.ThrowsAsync<DomainException>(() => Service.GetAsync(Guid.NewGuid(), default))).StatusCode);
    }
    [Fact]
    public async Task An_anonymous_candidate_is_saved_in_the_configured_first_stage_with_the_uploaded_curriculum()
    {
        var process = await Process(); var url = await Curriculum(process.Id);
        var id = await Service.SubmitAsync(process.Id, new("  Pessoa de teste  ", "pessoa@example.test", "(11) 99999-1234", "Disponível à tarde", url), default);
        var candidate = await db.WorkItems.SingleAsync(item => item.Id == id);
        Assert.Equal("Candidato", candidate.RecordType); Assert.Equal("admin", candidate.Module); Assert.Equal("Triagem inicial", candidate.Status);
        Assert.Equal("Pessoa de teste", candidate.Title); Assert.Equal(process.Team, candidate.Team); Assert.Equal("pessoa@example.test", candidate.CustomerName);
        using var detail = JsonDocument.Parse(candidate.Description);
        Assert.Equal(process.Id.ToString(), detail.RootElement.GetProperty("processId").GetString()); Assert.Equal(url, detail.RootElement.GetProperty("curriculumData").GetString());
        Assert.Equal("curriculo.pdf", detail.RootElement.GetProperty("curriculumName").GetString());
    }
    [Fact]
    public async Task Closed_processes_and_curricula_from_another_process_are_rejected()
    {
        var closed = await Process("Finalizado"); var open = await Process(); var another = await Process(); var url = await Curriculum(another.Id);
        var input = new PublicRecruitmentSubmission("Pessoa de teste", "pessoa@example.test", "11999991234", "", url);
        Assert.Equal(409, (await Assert.ThrowsAsync<DomainException>(() => Service.SubmitAsync(closed.Id, input, default))).StatusCode);
        await Assert.ThrowsAsync<DomainException>(() => Service.SubmitAsync(open.Id, input, default));
        await Assert.ThrowsAsync<DomainException>(() => Service.SubmitAsync(open.Id, input with {CurriculumUrl = "https://example.test/cv.pdf"}, default));
        Assert.DoesNotContain(db.WorkItems, item => item.RecordType == "Candidato");
    }
    [Theory]
    [InlineData("X", "pessoa@example.test", "11999991234")]
    [InlineData("Pessoa", "invalid", "11999991234")]
    [InlineData("Pessoa", "pessoa@example.test", "123")]
    public async Task Invalid_candidate_data_is_rejected(string name, string email, string phone)
    {
        var process = await Process(); await Assert.ThrowsAsync<DomainException>(() => Service.SubmitAsync(process.Id, new(name, email, phone, "", ""), default));
        Assert.DoesNotContain(db.WorkItems, item => item.RecordType == "Candidato");
    }
    public void Dispose() { db.Dispose(); if (Directory.Exists(root)) Directory.Delete(root, true); }
}
