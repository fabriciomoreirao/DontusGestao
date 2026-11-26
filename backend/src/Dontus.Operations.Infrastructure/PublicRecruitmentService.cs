using System.Net.Mail;
using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Infrastructure;

public sealed record PublicRecruitmentVacancy(Guid Id, string Title, string Vacancy, string Sector, bool IsOpen,
    string Description, string Requirements, string Responsibilities, string Benefits);
public sealed record PublicRecruitmentSubmission(string Name, string Email, string Phone, string? Notes, string CurriculumUrl);

public sealed class PublicRecruitmentService(OperationsDbContext db, IOperationsService operations, WorkspaceFileStorage files)
{
    public async Task<PublicRecruitmentVacancy[]> ListAsync(CancellationToken ct)
    {
        var processes = await db.WorkItems.AsNoTracking().Where(item => item.Module == "admin" && item.RecordType == "Processo seletivo" && item.Status == "Ativo")
            .OrderByDescending(item => item.CreatedAt).ToListAsync(ct);
        return processes.Select(Project).ToArray();
    }

    public async Task<PublicRecruitmentVacancy> GetAsync(Guid id, CancellationToken ct) => Project(await ProcessAsync(id, ct));

    public async Task<Guid> SubmitAsync(Guid id, PublicRecruitmentSubmission input, CancellationToken ct)
    {
        var process = await ProcessAsync(id, ct);
        if (process.Status != "Ativo") throw new DomainException("As inscrições deste processo seletivo foram encerradas.", 409);
        var name = input.Name?.Trim() ?? "";
        var email = input.Email?.Trim() ?? "";
        var phone = input.Phone?.Trim() ?? "";
        if (name.Length is < 3 or > 240) throw new DomainException("Informe seu nome completo.");
        if (email.Length > 254 || !MailAddress.TryCreate(email, out var address) || address.Address != email)
            throw new DomainException("Informe um e-mail válido.");
        if (phone.Length > 40 || phone.Count(char.IsDigit) is < 10 or > 15) throw new DomainException("Informe um telefone válido.");
        if ((input.Notes?.Length ?? 0) > 6000) throw new DomainException("As observações devem ter até 6.000 caracteres.");
        var file = await files.RequireRecruitmentFileAsync(id, input.CurriculumUrl ?? "", ct);
        var detail = Detail(process);
        var stage = detail.ValueKind == JsonValueKind.Object && detail.TryGetProperty("stages", out var stages) && stages.ValueKind == JsonValueKind.Array
            ? stages.EnumerateArray().Where(value => value.ValueKind == JsonValueKind.String).Select(value => value.GetString()).FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)) : null;
        var vacancy = Project(process);
        var actor = new ActorContext("candidatura-publica@dontus.local", "Candidatura pública", "Público", process.Team,
            [new("admin", false, true, false, false, false)]);
        return await operations.CreateWorkItemAsync(new("admin", "Candidato", name, null, email, phone, process.Team, "P3", null, null, 0,
            JsonSerializer.Serialize(new
            {
                processId = process.Id,
                vacancy = vacancy.Vacancy,
                sector = vacancy.Sector,
                notes = input.Notes?.Trim() ?? "",
                curriculumName = file.Name,
                curriculumData = input.CurriculumUrl,
                comments = Array.Empty<object>()
            }), null, "publicRecruitment", process.Id, stage?.Trim() ?? "Currículo"), actor, ct);
    }

    private async Task<WorkItem> ProcessAsync(Guid id, CancellationToken ct) =>
        await db.WorkItems.AsNoTracking().SingleOrDefaultAsync(item => item.Id == id && item.Module == "admin" && item.RecordType == "Processo seletivo", ct)
        ?? throw new DomainException("Processo seletivo não encontrado.", 404);
    private static JsonElement Detail(WorkItem item)
    {
        try { using var document = JsonDocument.Parse(item.Description); return document.RootElement.ValueKind == JsonValueKind.Object ? document.RootElement.Clone() : default; }
        catch (JsonException) { return default; }
    }
    private static string Text(JsonElement detail, string key, string fallback = "") => detail.ValueKind == JsonValueKind.Object && detail.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? fallback : fallback;
    private static PublicRecruitmentVacancy Project(WorkItem item)
    {
        var detail = Detail(item);
        return new(item.Id, item.Title, Text(detail, "vacancy", item.CustomerName), Text(detail, "sector", item.Team), item.Status == "Ativo",
            Text(detail, "description"), Text(detail, "requirements"), Text(detail, "responsibilities"), Text(detail, "benefits"));
    }
}
