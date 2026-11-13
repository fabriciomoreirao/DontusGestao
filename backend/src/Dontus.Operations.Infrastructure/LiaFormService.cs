using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Logging;

namespace Dontus.Operations.Infrastructure;

public sealed partial class LiaFormService(OperationsDbContext db, IDataProtectionProvider protection,
    ITaskFileStorage? fileStorage = null, ILogger<LiaFormService>? logger = null)
{
    public async Task<IReadOnlyList<LiaFormDto>> ListFormsAsync(ActorContext actor, CancellationToken ct)
    {
        actor.RequirePermission("lia", "view");
        var forms = await db.LiaForms.AsNoTracking().OrderBy(x => x.Name).ToListAsync(ct);
        return forms.Select(x => new LiaFormDto(x.Id, x.Name, x.Description, x.Active, Questions(x.QuestionsJson), x.Version)).ToList();
    }

    public async Task<Guid> SaveFormAsync(SaveLiaFormCommand command, ActorContext actor, CancellationToken ct)
    {
        actor.RequirePermission("lia", "manage");
        if (string.IsNullOrWhiteSpace(command.Name) || command.Name.Trim().Length > 160 || (command.Description?.Length ?? 0) > 2000)
            throw new DomainException("Informe um nome de até 160 caracteres e uma descrição de até 2.000 caracteres.");
        if (command.Questions is null || command.Questions.Count is < 1 or > 50)
            throw new DomainException("Inclua de 1 a 50 perguntas.");
        var ids = new HashSet<string>();
        foreach (var q in command.Questions)
        {
            if (string.IsNullOrWhiteSpace(q.Id) || q.Id.Length > 80 || !ids.Add(q.Id) || string.IsNullOrWhiteSpace(q.Text) || q.Text.Length > 500)
                throw new DomainException("As perguntas precisam de identificadores únicos e texto de até 500 caracteres.");
            if (q.Type is not ("text" or "textarea" or "select" or "email" or "date" or "number" or "file"))
                throw new DomainException("Tipo de pergunta inválido.");
            if (q.Type == "select" && (q.Options is null || q.Options.Count is < 2 or > 30 || q.Options.Any(x => string.IsNullOrWhiteSpace(x) || x.Length > 200) || q.Options.Distinct().Count() != q.Options.Count))
                throw new DomainException("Inclua de 2 a 30 opções diferentes em cada pergunta de seleção.");
        }
        var form = command.Id.HasValue
            ? await db.LiaForms.SingleOrDefaultAsync(x => x.Id == command.Id.Value, ct) ?? throw new DomainException("Formulário não encontrado.", 404)
            : new LiaForm();
        if (command.Id.HasValue && command.Version != form.Version) throw new DomainException("O formulário foi alterado. Atualize a página antes de salvar.", 409);
        form.Name = command.Name.Trim(); form.Description = command.Description?.Trim() ?? ""; form.Active = command.Active;
        form.QuestionsJson = JsonSerializer.Serialize(command.Questions); form.UpdatedAt = DateTimeOffset.UtcNow;
        if (command.Id.HasValue) form.Version++; else db.LiaForms.Add(form);
        Audit(actor.Email, "SaveForm", form.Id);
        await db.SaveChangesAsync(ct);
        return form.Id;
    }

    public async Task<IReadOnlyList<LiaFormRequestDto>> ListRequestsAsync(Guid? workItemId, ActorContext actor, CancellationToken ct)
    {
        actor.RequirePermission("lia", "view");
        var query = db.LiaFormRequests.AsNoTracking().AsQueryable();
        if (workItemId.HasValue) query = query.Where(x => x.WorkItemId == workItemId.Value);
        var entries = await query.OrderByDescending(x => x.CreatedAt).ToListAsync(ct);
        var workItemIds = entries.Select(x => x.WorkItemId).Distinct().ToList();
        var clientNames = await db.WorkItems.AsNoTracking().Where(x => workItemIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.CustomerName == "" ? x.Title : x.CustomerName, ct);
        var requestIds = entries.Select(x => x.Id).ToList();
        // Project metadata only: file bytes never enter the list of forms or the chat snapshot.
        var attachments = await db.LiaFormAttachments.AsNoTracking().Where(x => requestIds.Contains(x.RequestId))
            .OrderBy(x => x.CreatedAt).ThenBy(x => x.Id)
            .Select(x => new { x.RequestId, File = new LiaFormAttachmentDto(x.Id, x.QuestionId, x.FileName, x.ContentType, x.SizeBytes) }).ToListAsync(ct);
        return entries.Select(x => new LiaFormRequestDto(x.Id, x.WorkItemId, x.FormId, x.FormName, x.FormDescription,
            Questions(x.QuestionsJson), x.CreatedAt, x.SubmittedAt, JsonSerializer.Deserialize<Dictionary<string, string>>(x.AnswersJson) ?? [], protection.CreateProtector("lia-form-links-v1").Unprotect(x.ProtectedToken), clientNames.GetValueOrDefault(x.WorkItemId, "Cliente"))
            { Attachments = attachments.Where(a => a.RequestId == x.Id).Select(a => a.File).ToList() }).ToList();
    }

    public async Task<object> GenerateAsync(GenerateLiaFormCommand command, ActorContext actor, CancellationToken ct)
    {
        actor.RequirePermission("lia", "edit");
        if (!await db.WorkItems.AnyAsync(x => x.Id == command.WorkItemId && x.Module == "lia", ct))
            throw new DomainException("Cliente do acompanhamento LIA não encontrado.", 404);
        var form = await db.LiaForms.AsNoTracking().SingleOrDefaultAsync(x => x.Id == command.FormId && x.Active, ct)
            ?? throw new DomainException("Escolha um formulário ativo.");
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        var entry = new LiaFormRequest { WorkItemId = command.WorkItemId, FormId = form.Id, TokenHash = Hash(token),
            ProtectedToken = protection.CreateProtector("lia-form-links-v1").Protect(token),
            FormName = form.Name, FormDescription = form.Description, QuestionsJson = form.QuestionsJson, CreatedBy = actor.Email };
        db.LiaFormRequests.Add(entry); Audit(actor.Email, "GenerateFormLink", entry.Id);
        await db.SaveChangesAsync(ct);
        return new { entry.Id, token };
    }

    public async Task<object> GetPublicAsync(string token, CancellationToken ct)
    {
        var entry = await FindPublicAsync(token, ct);
        var client = await db.WorkItems.AsNoTracking().Where(x => x.Id == entry.WorkItemId).Select(x => x.CustomerName).SingleAsync(ct);
        return new { entry.FormName, entry.FormDescription, clientName = client, questions = Questions(entry.QuestionsJson), entry.SubmittedAt };
    }

    public async Task<DateTimeOffset> SubmitAsync(string token, SubmitLiaFormCommand command, CancellationToken ct,
        IReadOnlyList<UploadLiaFormFile>? uploads = null)
    {
        var entry = await FindPublicAsync(token, ct);
        if (entry.SubmittedAt.HasValue) throw new DomainException("Este formulário já foi respondido.", 409);
        var questions = Questions(entry.QuestionsJson);
        uploads ??= [];
        ValidateUploads(questions, uploads);
        if (command.Answers is null || command.Answers.Keys.Any(key => !questions.Any(q => q.Id == key)))
            throw new DomainException("As respostas não correspondem às perguntas deste formulário.");
        var answers = new Dictionary<string, string>();
        foreach (var q in questions)
        {
            var value = command.Answers.GetValueOrDefault(q.Id)?.Trim() ?? "";
            if (q.Type == "file")
            {
                var files = uploads.Where(x => x.QuestionId == q.Id).ToList();
                if (value.Length > 0) throw new DomainException($"Envie os arquivos pelo campo de anexo: {q.Text}");
                if (q.Required && files.Count == 0) throw new DomainException($"Anexe pelo menos um arquivo: {q.Text}");
                answers[q.Id] = string.Join("\n", files.Select(x => CleanFileName(x.FileName)));
                continue;
            }
            if (q.Required && value.Length == 0) throw new DomainException($"Responda: {q.Text}");
            if (value.Length > 5000) throw new DomainException("Cada resposta deve ter até 5.000 caracteres.");
            if (value.Length > 0 && ((q.Type == "select" && q.Options?.Contains(value) != true)
                || (q.Type == "email" && !System.Net.Mail.MailAddress.TryCreate(value, out _))
                || (q.Type == "date" && !DateOnly.TryParseExact(value, "yyyy-MM-dd", out _))
                || (q.Type == "number" && !decimal.TryParse(value, System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out _))))
                throw new DomainException($"Resposta inválida: {q.Text}");
            answers[q.Id] = value;
        }
        return await CompleteSubmissionAsync(entry, answers, uploads, ct);
    }

    private async Task<LiaFormRequest> FindPublicAsync(string token, CancellationToken ct)
    {
        if (token.Length != 64 || token.Any(c => !Uri.IsHexDigit(c))) throw new DomainException("Link de formulário inválido.", 404);
        var hash = Hash(token);
        return await db.LiaFormRequests.SingleOrDefaultAsync(x => x.TokenHash == hash, ct)
            ?? throw new DomainException("Formulário não encontrado.", 404);
    }
    private static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    private static IReadOnlyList<LiaFormQuestion> Questions(string json) => JsonSerializer.Deserialize<List<LiaFormQuestion>>(json) ?? [];
    private void Audit(string email, string action, Guid id) => db.AuditEvents.Add(new AuditEvent
        { ActorEmail = email, Action = action, Module = "lia", Resource = "lia_form", ResourceId = id.ToString() });
}
