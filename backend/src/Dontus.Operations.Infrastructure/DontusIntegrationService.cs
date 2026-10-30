using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Infrastructure;

public sealed class DontusIntegrationService(OperationsDbContext db, DontusApiClient api)
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
        var identification = DontusApiClient.NormalizeIdentification(command.Identification);
        await api.FindCustomerAsync(identification, ct);
        var users = await api.ListUsersAsync(identification, ct);
        var user = users.FirstOrDefault(u => u.Id == command.UserId) ?? throw new DomainException("Usuário não encontrado nesta identificação.", 404);
        if (!user.Active || user.LoginUrl is null) throw new DomainException("Este usuário não possui um acesso ativo com endereço autorizado.", 403);
        Audit(actor, "OpenDontusAccess", "access", identification, new { identification, userId = user.Id });
        await db.SaveChangesAsync(ct);
        return new { url = user.LoginUrl };
    }

    private static DontusCustomerLinkDto LinkDto(CustomerDontusLink link) => new(link.Identification, link.ExternalClientId, link.Version);
    private static DontusCustomerDataDto DataDto(string ident, JsonElement data) => new(ident, DontusApiClient.Number(data, "ID"), DateTimeOffset.UtcNow, DontusApiClient.PublicCustomerData(data));
    private void Audit(ActorContext actor, string action, string module, string id, object details) => db.AuditEvents.Add(new AuditEvent
    { ActorEmail = actor.Email, Action = action, Resource = "DontusIntegration", ResourceId = id, Module = module, DetailsJson = JsonSerializer.Serialize(details) });
}
