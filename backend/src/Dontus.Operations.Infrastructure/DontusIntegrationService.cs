using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Infrastructure;

public sealed partial class DontusIntegrationService(OperationsDbContext db, DontusApiClient api)
{
    private async Task RequireCustomerAsync(Guid id, ActorContext actor, CancellationToken ct)
    {
        actor.RequirePermission("customers", "view");
        if (!await db.Customers.AnyAsync(x => x.Id == id, ct)) throw new DomainException("Cliente não encontrado.", 404);
    }

    public async Task<DontusCustomerLinkDto?> GetLinkAsync(Guid customerId, ActorContext actor, CancellationToken ct)
    {
        await RequireCustomerAsync(customerId, actor, ct);
        var link = await db.CustomerDontusLinks.AsNoTracking().SingleOrDefaultAsync(x => x.CustomerId == customerId, ct);
        return link is null ? null : LinkDto(link);
    }

    public async Task<object> LinkAsync(Guid customerId, LinkDontusCustomerCommand command, ActorContext actor, CancellationToken ct)
    {
        actor.RequirePermission("customers", "edit");
        await RequireCustomerAsync(customerId, actor, ct);
        var externalClientId = DontusApiClient.NormalizeIdentification(command.ExternalClientId);
        var link = await db.CustomerDontusLinks.SingleOrDefaultAsync(x => x.CustomerId == customerId, ct);
        if (command.Version != link?.Version) throw new DomainException("O vínculo foi alterado. Atualize a ficha antes de salvar.", 409);
        var data = await api.FindCustomerByIdAsync(externalClientId, ct);
        var identification = DontusApiClient.NormalizeIdentification(DontusApiClient.Text(data, "Ident"));
        var remoteId = DontusApiClient.Number(data, "ID");
        if (await db.CustomerDontusLinks.AnyAsync(x => (x.ExternalClientId == remoteId || x.Identification == identification) && x.CustomerId != customerId, ct))
            throw new DomainException("Este cadastro do Ambiente Dontus já está vinculado a outro cliente.", 409);
        var previous = link?.Identification;
        if (link is null)
        {
            link = new CustomerDontusLink { CustomerId = customerId, Identification = identification, LinkedBy = actor.Email };
            db.CustomerDontusLinks.Add(link);
        }
        else link.Version++;
        link.Identification = identification;
        link.ExternalClientId = remoteId;
        link.LinkedAt = DateTimeOffset.UtcNow;
        link.LinkedBy = actor.Email;
        Audit(actor, "LinkDontusCustomer", "customers", customerId.ToString(), new { previousIdentification = previous, identification, externalClientId = remoteId });
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException { SqlState: "23505" })
        { throw new DomainException("O vínculo Dontus foi alterado por outro usuário. Atualize a ficha.", 409); }
        return new { link = LinkDto(link), result = DataDto(identification, data) };
    }

    public async Task<DontusCustomerDataDto> GetDataAsync(Guid customerId, ActorContext actor, CancellationToken ct)
    {
        var link = await GetLinkAsync(customerId, actor, ct) ?? throw new DomainException("Vincule a identificação Dontus deste cliente antes de consultar.", 404);
        var data = await api.FindCustomerByIdAsync(link.ExternalClientId.ToString(System.Globalization.CultureInfo.InvariantCulture), ct);
        return DataDto(DontusApiClient.Text(data, "Ident"), data);
    }

    public async Task<object> ListUsersAsync(string identification, ActorContext actor, CancellationToken ct)
    {
        actor.RequirePermission("access", "view");
        identification = DontusApiClient.NormalizeIdentification(identification);
        var customer = await api.FindCustomerAsync(identification, ct);
        var users = await api.ListUsersAsync(identification, ct);
        Audit(actor, "ListDontusUsers", "access", identification, new { identification, count = users.Count });
        await db.SaveChangesAsync(ct);
        return new { identification, customerName = DontusApiClient.Text(customer, "NomeFantasia"), fetchedAt = DateTimeOffset.UtcNow,
            users = users.Select(u => new DontusEnvironmentUserDto(u.Id, u.Name, u.Username, u.Email, u.IsSupervisor, u.Active, u.Active && u.LoginUrl is not null)) };
    }

    public async Task<object> LoginAsync(DontusLoginCommand command, ActorContext actor, CancellationToken ct)
    {
        actor.RequirePermission("access", "view");
        var justification = command.Justification?.Trim() ?? "";
        if (command.ReasonId is null || string.IsNullOrWhiteSpace(justification))
            throw new DomainException("Selecione um motivo cadastrado e descreva o motivo do acesso à base.");
        if (justification.Length > 2000) throw new DomainException("A descrição do acesso deve ter até 2000 caracteres.");
        var reason = await db.SupportAccessReasons.AsNoTracking().SingleOrDefaultAsync(entry => entry.Id == command.ReasonId && entry.Active, ct)
            ?? throw new DomainException("Selecione um motivo de acesso ativo e cadastrado.");
        var accessibleDepartments = AccessDepartmentIds(actor);
        if (reason.DepartmentId is not { } departmentId || !await accessibleDepartments.ContainsAsync(departmentId, ct))
            throw new DomainException("Este motivo de acesso não pertence aos setores vinculados ao seu cadastro.", 403);
        var identification = DontusApiClient.NormalizeIdentification(command.Identification);
        var customer = await api.FindCustomerAsync(identification, ct);
        var users = await api.ListUsersAsync(identification, ct);
        var user = users.FirstOrDefault(u => u.Id == command.UserId) ?? throw new DomainException("Usuário não encontrado nesta identificação.", 404);
        if (!user.Active || user.LoginUrl is null) throw new DomainException("Este usuário não possui um acesso ativo com endereço autorizado.", 403);
        if (actor.AccessAllowedUntil is { } cutoff && DateTimeOffset.UtcNow >= cutoff)
            throw new DomainException(EmployeeAccessPolicy.DeniedMessage, 401, EmployeeAccessPolicy.DeniedCode);
        if (!await db.SupportAccessReasons.AnyAsync(entry => entry.Id == reason.Id && entry.Active
                && entry.DepartmentId == departmentId && accessibleDepartments.Contains(departmentId), ct))
            throw new DomainException("O motivo ou seu vínculo com o setor foi alterado. Atualize os motivos antes de acessar.", 403);
        var log = new SupportAccessLog {
            ActorEmail = actor.Email, ActorName = actor.DisplayName, Identification = identification,
            CustomerName = DontusApiClient.Text(customer, "NomeFantasia"), TargetUserId = user.Id,
            TargetUserName = string.IsNullOrWhiteSpace(user.Name) ? user.Username : user.Name,
            ReasonId = reason.Id, ReasonName = reason.Name, Justification = justification,
        };
        db.SupportAccessLogs.Add(log);
        Audit(actor, "OpenDontusAccess", "access", identification, new { identification, userId = user.Id, reasonId = reason.Id, reason = reason.Name, justification, accessLogId = log.Id });
        await db.SaveChangesAsync(ct);
        return new { url = user.LoginUrl };
    }

    private IQueryable<Guid> AccessDepartmentIds(ActorContext actor) => db.UserDepartments.AsNoTracking()
        .Where(link => link.User.Email == actor.Email && link.User.Active && link.User.BlockedAt == null && link.Department.Active)
        .Select(link => link.DepartmentId);

    public async Task<IReadOnlyCollection<SupportAccessDepartmentDto>> GetAccessDepartmentsAsync(ActorContext actor, CancellationToken ct)
    {
        actor.RequirePermission("access", "manage");
        return await db.TaskDepartments.AsNoTracking().OrderBy(entry => entry.Name)
            .Select(entry => new SupportAccessDepartmentDto(entry.Id, entry.Name, entry.Active)).ToArrayAsync(ct);
    }

    public async Task<IReadOnlyCollection<SupportAccessReasonDto>> GetAccessReasonsAsync(ActorContext actor, CancellationToken ct, bool catalog = false)
    {
        actor.RequirePermission("access", "view");
        if (catalog) actor.RequirePermission("access", "manage");
        var query = db.SupportAccessReasons.AsNoTracking();
        var accessibleDepartments = AccessDepartmentIds(actor);
        if (!catalog) query = query.Where(entry => entry.DepartmentId.HasValue && accessibleDepartments.Contains(entry.DepartmentId.Value));
        return await query.OrderBy(entry => entry.Department!.Name).ThenBy(entry => entry.Name)
            .Select(entry => new SupportAccessReasonDto(entry.Id, entry.Name, entry.Active, entry.Version,
                entry.DepartmentId, entry.Department == null ? "Sem setor" : entry.Department.Name)).ToArrayAsync(ct);
    }

    public async Task<SupportAccessReasonDto> SaveAccessReasonAsync(SaveSupportAccessReasonCommand command, ActorContext actor, CancellationToken ct)
    {
        actor.RequirePermission("access", "manage");
        var name = command.Name?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(name) || name.Length > 120) throw new DomainException("Informe um motivo com até 120 caracteres.");
        var department = command.DepartmentId is { } selectedDepartment
            ? await db.TaskDepartments.SingleOrDefaultAsync(entry => entry.Id == selectedDepartment, ct) : null;
        if (department is null || !department.Active && (command.Active || !command.Id.HasValue))
            throw new DomainException("Selecione um setor ativo para cadastrar o motivo de acesso.");
        if (await db.SupportAccessReasons.AnyAsync(entry => entry.Id != command.Id && entry.DepartmentId == department.Id && entry.Name.ToUpper() == name.ToUpperInvariant(), ct))
            throw new DomainException("Já existe um motivo com este nome neste setor.", 409);
        var reason = command.Id is { } id
            ? await db.SupportAccessReasons.SingleOrDefaultAsync(entry => entry.Id == id, ct) ?? throw new DomainException("Motivo não encontrado.", 404)
            : new SupportAccessReason { Name = name };
        if (command.Id.HasValue && command.Version != reason.Version) throw new DomainException("O motivo foi alterado. Atualize a configuração.", 409);
        reason.Name = name;
        reason.DepartmentId = department.Id;
        reason.Active = command.Active;
        reason.UpdatedAt = DateTimeOffset.UtcNow;
        if (command.Id.HasValue) reason.Version++;
        else db.SupportAccessReasons.Add(reason);
        Audit(actor, "SaveSupportAccessReason", "access", reason.Id.ToString(), new { reason.Name, reason.Active, reason.DepartmentId, DepartmentName = department.Name });
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException error) when (error.InnerException is Npgsql.PostgresException { SqlState: "23505" })
        { throw new DomainException("Já existe um motivo com este nome neste setor.", 409); }
        return new(reason.Id, reason.Name, reason.Active, reason.Version, department.Id, department.Name);
    }

    public async Task<object> GetAccessHistoryAsync(SupportAccessHistoryQuery filter, ActorContext actor, CancellationToken ct)
    {
        actor.RequirePermission("access", "view");
        var query = FilterAccessHistory(filter);
        var total = await query.CountAsync(ct);
        var page = Math.Clamp(filter.Page, 1, Math.Max(1, (int)Math.Ceiling(total / 20d)));
        var entries = await query.OrderByDescending(entry => entry.AccessedAt).ThenByDescending(entry => entry.Id)
            .Skip((page - 1) * 20).Take(20)
            .Select(entry => new SupportAccessLogDto(entry.Id, entry.AccessedAt, entry.ActorEmail, entry.ActorName, entry.Identification,
                entry.CustomerName, entry.TargetUserId, entry.TargetUserName, entry.ReasonId, entry.ReasonName, entry.Justification)).ToArrayAsync(ct);
        var responsible = await db.SupportAccessLogs.AsNoTracking().GroupBy(entry => entry.ActorEmail)
            .Select(group => new { Email = group.Key, Name = group.Max(entry => entry.ActorName) }).OrderBy(entry => entry.Name).ToArrayAsync(ct);
        return new { entries, total, page, pageSize = 20, responsible };
    }

    private static DateTimeOffset LocalMidnight(DateOnly date)
    {
        var local = date.ToDateTime(TimeOnly.MinValue);
        return new DateTimeOffset(local, TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo").GetUtcOffset(local)).ToUniversalTime();
    }

    private static DontusCustomerLinkDto LinkDto(CustomerDontusLink link) => new(link.Identification, link.ExternalClientId, link.Version);
    private static DontusCustomerDataDto DataDto(string ident, JsonElement data) => new(ident, DontusApiClient.Number(data, "ID"), DateTimeOffset.UtcNow, DontusApiClient.PublicCustomerData(data));
    private void Audit(ActorContext actor, string action, string module, string id, object details) => db.AuditEvents.Add(new AuditEvent
    { ActorEmail = actor.Email, Action = action, Resource = "DontusIntegration", ResourceId = id, Module = module, DetailsJson = JsonSerializer.Serialize(details) });
}
