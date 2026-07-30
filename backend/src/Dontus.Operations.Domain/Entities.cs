using System.ComponentModel.DataAnnotations;

namespace Dontus.Operations.Domain;

public abstract class Entity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    [ConcurrencyCheck]
    public long Version { get; set; } = 1;
}

public sealed class Customer : Entity
{
    public required string LegalName { get; set; }
    public required string TradeName { get; set; }
    public string DocumentMasked { get; set; } = "";
    public string Segment { get; set; } = "Clínica odontológica";
    public string Status { get; set; } = "Ativo";
    public string Owner { get; set; } = "Não atribuído";
    public string CsOwner { get; set; } = "Não atribuído";
    public string SupportOwner { get; set; } = "Fila de suporte";
    public bool Strategic { get; set; }
    public int ClinicsCount { get; set; } = 1;
    public long MonthlyRevenueCents { get; set; }
    public required string CreatedBy { get; set; }
}

public sealed class WorkItem : Entity
{
    public required string Module { get; set; }
    public required string RecordType { get; set; }
    public required string Title { get; set; }
    public Guid? CustomerId { get; set; }
    public string CustomerName { get; set; } = "";
    public string Owner { get; set; } = "Não atribuído";
    public string Team { get; set; } = "";
    public required string Status { get; set; }
    public string Priority { get; set; } = "P3";
    public DateTimeOffset? DueAt { get; set; }
    public DateTimeOffset? SlaDueAt { get; set; }
    public long AmountCents { get; set; }
    public string Description { get; set; } = "";
    public string TagsJson { get; set; } = "[]";
    public string? OriginType { get; set; }
    public Guid? OriginId { get; set; }
    public required string CreatedBy { get; set; }
}

public sealed class Appointment : Entity
{
    public required string Title { get; set; }
    public required string Kind { get; set; }
    public Guid? CustomerId { get; set; }
    public string CustomerName { get; set; } = "";
    public required string Owner { get; set; }
    public required string Team { get; set; }
    public DateTimeOffset StartsAt { get; set; }
    public DateTimeOffset EndsAt { get; set; }
    public string Status { get; set; } = "Agendado";
    public string MeetingUrl { get; set; } = "";
    public required string CreatedBy { get; set; }
}

public sealed class Approval : Entity
{
    public required string Kind { get; set; }
    public Guid SourceId { get; set; }
    public required string SourceTitle { get; set; }
    public required string Requester { get; set; }
    public required string ApproverRole { get; set; }
    public string Status { get; set; } = "Pendente";
    public long AmountCents { get; set; }
    public string Justification { get; set; } = "";
    public string? DecidedBy { get; set; }
    public DateTimeOffset? DecidedAt { get; set; }
}

public sealed class Activity : Entity
{
    public required string EntityType { get; set; }
    public Guid EntityId { get; set; }
    public required string Module { get; set; }
    public required string Kind { get; set; }
    public required string Summary { get; set; }
    public required string Actor { get; set; }
    public string Visibility { get; set; } = "Compartilhada";
}

public sealed class AuditEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string ActorEmail { get; set; }
    public required string Action { get; set; }
    public required string Resource { get; set; }
    public required string ResourceId { get; set; }
    public required string Module { get; set; }
    public string DetailsJson { get; set; } = "{}";
    public string Result { get; set; } = "Sucesso";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class DecisionItem
{
    public required string Code { get; set; }
    public required string Title { get; set; }
    public string Status { get; set; } = "Pendente";
    public required string Risk { get; set; }
    public required string DefaultBehavior { get; set; }
    public string Owner { get; set; } = "Product Owner";
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class AppUser : Entity
{
    public required string Email { get; set; }
    public required string DisplayName { get; set; }
    public string Department { get; set; } = "Gestão";
    public string Phone { get; set; } = "";
    public string JobTitle { get; set; } = "";
    public bool Active { get; set; } = true;
    public DateTimeOffset? LastAccessAt { get; set; }
    public required string CreatedBy { get; set; }
    public ICollection<UserAccessGroup> Groups { get; set; } = [];
}

public sealed class AccessGroup : Entity
{
    public required string Name { get; set; }
    public string Description { get; set; } = "";
    public bool Active { get; set; } = true;
    public bool IsSystem { get; set; }
    public required string CreatedBy { get; set; }
    public ICollection<UserAccessGroup> Users { get; set; } = [];
    public ICollection<GroupPermission> Permissions { get; set; } = [];
}

public sealed class UserAccessGroup
{
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;
    public Guid GroupId { get; set; }
    public AccessGroup Group { get; set; } = null!;
}

public sealed class GroupPermission
{
    public Guid GroupId { get; set; }
    public AccessGroup Group { get; set; } = null!;
    public required string Screen { get; set; }
    public bool CanView { get; set; }
    public bool CanCreate { get; set; }
    public bool CanEdit { get; set; }
    public bool CanApprove { get; set; }
    public bool CanManage { get; set; }
    public string CapabilitiesJson { get; set; } = "[]";
}
