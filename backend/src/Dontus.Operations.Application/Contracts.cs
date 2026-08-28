using System.Text.Json.Serialization;
using Dontus.Operations.Domain;

namespace Dontus.Operations.Application;

public sealed record EffectivePermission(
    string Screen,
    bool CanView,
    bool CanCreate,
    bool CanEdit,
    bool CanApprove,
    bool CanManage,
    IReadOnlyCollection<string>? Capabilities = null);

public sealed record ActorContext(
    string Email,
    string DisplayName,
    string Role,
    string Department,
    IReadOnlyCollection<EffectivePermission>? Permissions = null)
{
    public bool HasPermission(string screen, string action)
    {
        var permission = Permissions?.FirstOrDefault(entry =>
            string.Equals(entry.Screen, screen, StringComparison.OrdinalIgnoreCase));
        return action switch
        {
            "view" => permission?.CanView == true,
            "create" => permission?.CanCreate == true,
            "edit" => permission?.CanEdit == true,
            "approve" => permission?.CanApprove == true,
            "manage" => permission?.CanManage == true,
            _ => false,
        };
    }

    public void RequirePermission(string screen, string action)
    {
        if (!HasPermission(screen, action))
            throw new DomainException(
                $"Seu acesso não permite {PermissionActionLabel(action)} em {ScreenLabel(screen)}.",
                403);
    }

    public bool HasCapability(string screen, string capability) =>
        Permissions?.FirstOrDefault(entry =>
            string.Equals(entry.Screen, screen, StringComparison.OrdinalIgnoreCase))
            ?.Capabilities?.Contains(capability, StringComparer.OrdinalIgnoreCase) == true;

    public void RequireCapability(string screen, string capability)
    {
        if (!HasCapability(screen, capability))
            throw new DomainException("Seu acesso não permite executar esta ação na tarefa.", 403);
    }

    private static string PermissionActionLabel(string action) => action switch
    {
        "view" => "visualizar",
        "create" => "criar registros",
        "edit" => "editar registros",
        "approve" => "aprovar",
        "manage" => "administrar",
        _ => "executar esta ação",
    };

    private static string ScreenLabel(string screen) =>
        ScreenCatalog.All.FirstOrDefault(entry => entry.Code == screen)?.Label ?? screen;
}

public sealed record CreateCustomerCommand(
    string LegalName,
    string? TradeName,
    string? DocumentMasked,
    string? Segment,
    string? Owner,
    string? CsOwner,
    int ClinicsCount,
    long MonthlyRevenueCents,
    bool Strategic,
    string? Status,
    string? Project,
    string? ProductVersion,
    string? DueDay,
    string? Server,
    string? PaymentMethod,
    string? InvoiceCompany,
    string? GraceDays,
    string? DueDays,
    string? Subscription,
    string? Email,
    string? Phone,
    string? Website,
    string? Notes,
    string? Address,
    string? City,
    string? State);

public sealed record CreateWorkItemCommand(
    string Module,
    string RecordType,
    string Title,
    Guid? CustomerId,
    string? CustomerName,
    string? Owner,
    string? Team,
    string? Priority,
    DateTimeOffset? DueAt,
    DateTimeOffset? SlaDueAt,
    long AmountCents,
    string? Description,
    IReadOnlyCollection<string>? Tags,
    string? OriginType,
    Guid? OriginId,
    string? Status = null);

public sealed record TransitionWorkItemCommand(Guid Id, string NextStatus, long Version, bool Confirmed);

public sealed record UpdateWorkItemCommand(
    Guid Id,
    string Title,
    string? Owner,
    long AmountCents,
    string? Description,
    string? RecordType,
    string? CustomerName,
    long Version);

public sealed record CreateAppointmentCommand(
    string Title,
    string? Kind,
    Guid? CustomerId,
    string? CustomerName,
    string Owner,
    string? Team,
    DateTimeOffset StartsAt,
    DateTimeOffset EndsAt,
    string? MeetingUrl);

public sealed record DecideApprovalCommand(Guid Id, string Decision, string? Justification);

public sealed record UserDto(
    string Email,
    string DisplayName,
    string Role,
    string Department,
    string PhotoDataUrl,
    string JobTitle,
    bool IsCoordinator,
    IReadOnlyCollection<EffectivePermission> Permissions);

public sealed record CustomerDto(
    Guid Id,
    [property: JsonPropertyName("legal_name")] string LegalName,
    [property: JsonPropertyName("trade_name")] string TradeName,
    [property: JsonPropertyName("document_masked")] string DocumentMasked,
    string Segment,
    string Status,
    string Owner,
    [property: JsonPropertyName("cs_owner")] string CsOwner,
    [property: JsonPropertyName("support_owner")] string SupportOwner,
    int Strategic,
    [property: JsonPropertyName("clinics_count")] int ClinicsCount,
    [property: JsonPropertyName("monthly_revenue_cents")] long MonthlyRevenueCents,
    [property: JsonPropertyName("project")] string Project,
    [property: JsonPropertyName("product_version")] string ProductVersion,
    [property: JsonPropertyName("due_day")] string DueDay,
    string Server,
    [property: JsonPropertyName("payment_method")] string PaymentMethod,
    [property: JsonPropertyName("invoice_company")] string InvoiceCompany,
    [property: JsonPropertyName("grace_days")] string GraceDays,
    [property: JsonPropertyName("due_days")] string DueDays,
    string Subscription,
    string Email,
    string Phone,
    string Website,
    string Notes,
    string Address,
    string City,
    string State,
    [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt,
    [property: JsonPropertyName("open_task_protocols")] IReadOnlyCollection<string> OpenTaskProtocols);

public sealed record WorkItemDto(
    Guid Id,
    string Module,
    [property: JsonPropertyName("record_type")] string RecordType,
    string Title,
    [property: JsonPropertyName("customer_id")] Guid? CustomerId,
    [property: JsonPropertyName("customer_name")] string CustomerName,
    string Owner,
    string Team,
    string Status,
    string Priority,
    [property: JsonPropertyName("due_at")] DateTimeOffset? DueAt,
    [property: JsonPropertyName("sla_due_at")] DateTimeOffset? SlaDueAt,
    [property: JsonPropertyName("amount_cents")] long AmountCents,
    string Description,
    long Version,
    [property: JsonPropertyName("updated_at")] DateTimeOffset UpdatedAt,
    [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt);

public sealed record AppointmentDto(
    Guid Id,
    string Title,
    string Kind,
    [property: JsonPropertyName("customer_name")] string CustomerName,
    string Owner,
    string Team,
    [property: JsonPropertyName("starts_at")] DateTimeOffset StartsAt,
    [property: JsonPropertyName("ends_at")] DateTimeOffset EndsAt,
    string Status);

public sealed record ApprovalDto(
    Guid Id,
    string Kind,
    [property: JsonPropertyName("source_title")] string SourceTitle,
    string Requester,
    [property: JsonPropertyName("approver_role")] string ApproverRole,
    string Status,
    [property: JsonPropertyName("amount_cents")] long AmountCents,
    [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt);

public sealed record DecisionDto(
    string Code,
    string Title,
    string Status,
    string Risk,
    [property: JsonPropertyName("default_behavior")] string DefaultBehavior,
    string Owner);

public sealed record AuditEventDto(
    Guid Id,
    [property: JsonPropertyName("actor_email")] string ActorEmail,
    string Action,
    string Resource,
    string Module,
    string Details,
    string Result,
    [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt);

public sealed record ModuleCountDto(string Module, int Total);

public sealed record DiaryEntryDto(
    Guid Id,
    string Source,
    string Title,
    string Description,
    string Type,
    DateTimeOffset OccursAt,
    string Status,
    string StatusColor,
    Guid? AgendaStatusId,
    long? Version);

public sealed record DiaryModuleDto(
    IReadOnlyCollection<DiaryEntryDto> Entries,
    IReadOnlyCollection<AgendaStatusDto> AgendaStatuses);

public sealed record NoteDto(
    Guid Id,
    string Title,
    string Content,
    string Color,
    int SortOrder,
    DateTimeOffset UpdatedAt);

public sealed record NotesModuleDto(IReadOnlyCollection<NoteDto> Notes);

public sealed record CompanyNoticeRecipientDto(
    Guid UserId, string UserName, string PhotoDataUrl,
    DateTimeOffset? ViewedAt, DateTimeOffset? ConfirmedAt);

public sealed record CompanyNoticeDto(
    Guid Id, string Title, string Body, string Type, string Kind, string Audience,
    Guid? TargetUserId, string TargetUserName, Guid AuthorUserId, string AuthorName,
    string ImageDataUrl, DateTimeOffset PublishedAt, DateTimeOffset? EventAt,
    DateTimeOffset? ExpiresAt, bool Active, bool VisibleToCurrentUser,
    bool IsRead, DateTimeOffset? ViewedAt, DateTimeOffset? ReadAt,
    int ViewedCount, int ReadCount, IReadOnlyCollection<CompanyNoticeRecipientDto> Recipients,
    DateTimeOffset UpdatedAt);

public sealed record NoticesModuleDto(IReadOnlyCollection<CompanyNoticeDto> Notices);

public sealed record CustomerCatalogOptionDto(Guid Id, string Catalog, string Name, string Description, bool Active);
public sealed record CustomerModuleDto(IReadOnlyCollection<CustomerCatalogOptionDto> Catalogs);

public sealed record OperationsSnapshot(
    UserDto User,
    IReadOnlyCollection<CustomerDto> Customers,
    IReadOnlyCollection<WorkItemDto> Items,
    IReadOnlyCollection<AppointmentDto> Appointments,
    IReadOnlyCollection<ApprovalDto> Approvals,
    IReadOnlyCollection<DecisionDto> Decisions,
    IReadOnlyCollection<AuditEventDto> Audit,
    IReadOnlyCollection<ModuleCountDto> ModuleCounts)
{
    public bool? Ok { get; init; }
    public Guid? Id { get; init; }
    public string? TemporaryPassword { get; init; }
    public string? CreatedProtocol { get; init; }
    public AccessManagementDto? Access { get; init; }
    public AgendaModuleDto? AgendaModule { get; init; }
    public DiaryModuleDto? DiaryModule { get; init; }
    public NotesModuleDto? NotesModule { get; init; }
    public SuggestionModuleDto? SuggestionModule { get; init; }
    public TaskModuleDto? TaskModule { get; init; }
    public ChatModuleDto? ChatModule { get; init; }
    public InternalChatModuleDto? InternalChatModule { get; init; }
    public NoticesModuleDto? NoticesModule { get; init; }
    public CustomerModuleDto? CustomerModule { get; init; }
}

public interface IOperationsService
{
    Task InitializeAsync(CancellationToken cancellationToken = default);
    Task<OperationsSnapshot> GetSnapshotAsync(ActorContext actor, CancellationToken cancellationToken = default);
    Task<DiaryModuleDto> GetDiaryModuleAsync(ActorContext actor, CancellationToken cancellationToken = default);
    Task<NotesModuleDto> GetNotesModuleAsync(ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> SaveNoteAsync(Guid? id, string title, string? content, string? color, ActorContext actor, CancellationToken cancellationToken = default);
    Task DeleteNoteAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> DuplicateNoteAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default);
    Task ReorderNotesAsync(IReadOnlyCollection<Guid> noteIds, ActorContext actor, CancellationToken cancellationToken = default);
    Task<NoticesModuleDto> GetNoticesModuleAsync(ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> SaveNoticeAsync(
        Guid? id, string title, string body, string type, string kind, string audience,
        Guid? targetUserId, DateTimeOffset? eventAt, DateTimeOffset? expiresAt,
        string? imageDataUrl, bool active, ActorContext actor,
        CancellationToken cancellationToken = default);
    Task DeleteNoticeAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default);
    Task MarkNoticeViewedAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default);
    Task MarkNoticeReadAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default);
    Task<CustomerModuleDto> GetCustomerModuleAsync(ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> SaveCustomerCatalogAsync(Guid? id, string catalog, string name, string? description, bool active, ActorContext actor, CancellationToken cancellationToken = default);
    Task DeleteCustomerCatalogAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> CreateCustomerAsync(CreateCustomerCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> CreateWorkItemAsync(CreateWorkItemCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task UpdateWorkItemAsync(UpdateWorkItemCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task DeleteWorkItemAsync(Guid id, ActorContext actor, CancellationToken cancellationToken = default);
    Task TransitionWorkItemAsync(TransitionWorkItemCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task<Guid> CreateAppointmentAsync(CreateAppointmentCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task DecideApprovalAsync(DecideApprovalCommand command, ActorContext actor, CancellationToken cancellationToken = default);
    Task SeedDemoAsync(ActorContext actor, CancellationToken cancellationToken = default);
}
