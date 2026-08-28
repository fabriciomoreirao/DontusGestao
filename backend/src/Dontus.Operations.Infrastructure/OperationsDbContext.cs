using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;
using TaskStatusEntity = Dontus.Operations.Domain.TaskStatus;

namespace Dontus.Operations.Infrastructure;

public sealed class OperationsDbContext(DbContextOptions<OperationsDbContext> options) : DbContext(options)
{
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<CustomerCatalogOption> CustomerCatalogOptions => Set<CustomerCatalogOption>();
    public DbSet<WorkItem> WorkItems => Set<WorkItem>();
    public DbSet<Appointment> Appointments => Set<Appointment>();
    public DbSet<AgendaCalendar> AgendaCalendars => Set<AgendaCalendar>();
    public DbSet<AgendaType> AgendaTypes => Set<AgendaType>();
    public DbSet<AgendaStatus> AgendaStatuses => Set<AgendaStatus>();
    public DbSet<AgendaCommitment> AgendaCommitments => Set<AgendaCommitment>();
    public DbSet<AgendaCommitmentParticipant> AgendaCommitmentParticipants => Set<AgendaCommitmentParticipant>();
    public DbSet<Approval> Approvals => Set<Approval>();
    public DbSet<Activity> Activities => Set<Activity>();
    public DbSet<AuditEvent> AuditEvents => Set<AuditEvent>();
    public DbSet<DecisionItem> DecisionItems => Set<DecisionItem>();
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<EmployeeLevel> EmployeeLevels => Set<EmployeeLevel>();
    public DbSet<EmployeeSupervision> EmployeeSupervisions => Set<EmployeeSupervision>();
    public DbSet<LocalAuthSession> LocalAuthSessions => Set<LocalAuthSession>();
    public DbSet<AccessGroup> AccessGroups => Set<AccessGroup>();
    public DbSet<UserAccessGroup> UserAccessGroups => Set<UserAccessGroup>();
    public DbSet<GroupPermission> GroupPermissions => Set<GroupPermission>();
    public DbSet<TaskDepartment> TaskDepartments => Set<TaskDepartment>();
    public DbSet<UserDepartment> UserDepartments => Set<UserDepartment>();
    public DbSet<TaskPriority> TaskPriorities => Set<TaskPriority>();
    public DbSet<TaskStatusEntity> TaskStatuses => Set<TaskStatusEntity>();
    public DbSet<TaskSlaPolicy> TaskSlaPolicies => Set<TaskSlaPolicy>();
    public DbSet<TaskSlaPauseStatus> TaskSlaPauseStatuses => Set<TaskSlaPauseStatus>();
    public DbSet<TaskType> TaskTypes => Set<TaskType>();
    public DbSet<TaskTypeDepartment> TaskTypeDepartments => Set<TaskTypeDepartment>();
    public DbSet<TaskTypeStatus> TaskTypeStatuses => Set<TaskTypeStatus>();
    public DbSet<CorporateTask> CorporateTasks => Set<CorporateTask>();
    public DbSet<TaskParticipant> TaskParticipants => Set<TaskParticipant>();
    public DbSet<TaskComment> TaskComments => Set<TaskComment>();
    public DbSet<TaskAttachment> TaskAttachments => Set<TaskAttachment>();
    public DbSet<TaskHistory> TaskHistory => Set<TaskHistory>();
    public DbSet<TaskTransfer> TaskTransfers => Set<TaskTransfer>();
    public DbSet<TaskNotification> TaskNotifications => Set<TaskNotification>();
    public DbSet<TaskClientCommunication> TaskClientCommunications => Set<TaskClientCommunication>();
    public DbSet<ChatQueue> ChatQueues => Set<ChatQueue>();
    public DbSet<ChatChannel> ChatChannels => Set<ChatChannel>();
    public DbSet<ChatWhatsAppNumber> ChatWhatsAppNumbers => Set<ChatWhatsAppNumber>();
    public DbSet<ChatContact> ChatContacts => Set<ChatContact>();
    public DbSet<ChatConversation> ChatConversations => Set<ChatConversation>();
    public DbSet<ChatMessage> ChatMessages => Set<ChatMessage>();
    public DbSet<ChatTag> ChatTags => Set<ChatTag>();
    public DbSet<ChatConversationTag> ChatConversationTags => Set<ChatConversationTag>();
    public DbSet<ChatTransfer> ChatTransfers => Set<ChatTransfer>();
    public DbSet<ChatQuickReply> ChatQuickReplies => Set<ChatQuickReply>();
    public DbSet<ChatWebhookEvent> ChatWebhookEvents => Set<ChatWebhookEvent>();
    public DbSet<InternalChatRoom> InternalChatRooms => Set<InternalChatRoom>();
    public DbSet<InternalChatRoomMember> InternalChatRoomMembers => Set<InternalChatRoomMember>();
    public DbSet<InternalChatMessage> InternalChatMessages => Set<InternalChatMessage>();
    public DbSet<SuggestionPriority> SuggestionPriorities => Set<SuggestionPriority>();
    public DbSet<SuggestionStatus> SuggestionStatuses => Set<SuggestionStatus>();
    public DbSet<Suggestion> Suggestions => Set<Suggestion>();
    public DbSet<SuggestionComment> SuggestionComments => Set<SuggestionComment>();
    public DbSet<CompanyNotice> CompanyNotices => Set<CompanyNotice>();
    public DbSet<CompanyNoticeRead> CompanyNoticeReads => Set<CompanyNoticeRead>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ConfigureEntity(modelBuilder.Entity<Customer>(), "customers");
        modelBuilder.Entity<Customer>(entity =>
        {
            entity.Property(x => x.LegalName).HasMaxLength(240);
            entity.Property(x => x.TradeName).HasMaxLength(160);
            entity.Property(x => x.MonthlyRevenueCents).HasDefaultValue(0L);
            entity.HasIndex(x => x.Status);
            entity.HasIndex(x => x.Owner);
        });

        ConfigureEntity(modelBuilder.Entity<WorkItem>(), "work_items");
        modelBuilder.Entity<WorkItem>(entity =>
        {
            entity.Property(x => x.Module).HasMaxLength(32);
            entity.Property(x => x.RecordType).HasMaxLength(80);
            entity.Property(x => x.Title).HasMaxLength(240);
            entity.Property(x => x.Priority).HasMaxLength(8);
            entity.Property(x => x.Status).HasMaxLength(64);
            entity.HasIndex(x => new { x.Module, x.Status });
            entity.HasIndex(x => x.CustomerId);
            entity.HasIndex(x => x.Owner);
            entity.HasIndex(x => x.DueAt);
        });

        ConfigureEntity(modelBuilder.Entity<Appointment>(), "appointments");
        modelBuilder.Entity<Appointment>(entity =>
        {
            entity.Property(x => x.Title).HasMaxLength(240);
            entity.Property(x => x.Owner).HasMaxLength(160);
            entity.HasIndex(x => new { x.Owner, x.StartsAt, x.EndsAt });
        });

        ConfigureEntity(modelBuilder.Entity<Approval>(), "approvals");
        modelBuilder.Entity<Approval>(entity =>
        {
            entity.Property(x => x.Status).HasMaxLength(48);
            entity.HasIndex(x => x.Status);
        });

        ConfigureEntity(modelBuilder.Entity<Activity>(), "activities");
        modelBuilder.Entity<Activity>()
            .HasIndex(x => new { x.EntityType, x.EntityId, x.CreatedAt });

        modelBuilder.Entity<AuditEvent>(entity =>
        {
            entity.ToTable("audit_events");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Action).HasMaxLength(80);
            entity.Property(x => x.Resource).HasMaxLength(80);
            entity.Property(x => x.Module).HasMaxLength(32);
            entity.HasIndex(x => x.CreatedAt);
            entity.HasIndex(x => new { x.Resource, x.ResourceId });
        });

        modelBuilder.Entity<DecisionItem>(entity =>
        {
            entity.ToTable("decision_items");
            entity.HasKey(x => x.Code);
            entity.Property(x => x.Code).HasMaxLength(8).ValueGeneratedNever();
            entity.Property(x => x.Status).HasMaxLength(32);
            entity.Property(x => x.Risk).HasMaxLength(16);
        });

        ConfigureEntity(modelBuilder.Entity<AppUser>(), "users");
        modelBuilder.Entity<AppUser>(entity =>
        {
            entity.Property(x => x.Email).HasMaxLength(254);
            entity.Property(x => x.DisplayName).HasMaxLength(160);
            entity.Property(x => x.Department).HasMaxLength(120);
            entity.Property(x => x.Phone).HasMaxLength(32);
            entity.Property(x => x.JobTitle).HasMaxLength(120);
            entity.Property(x => x.PasswordHash).HasMaxLength(512);
            entity.Property(x => x.PhotoDataUrl).HasColumnType("text");
            entity.HasIndex(x => x.Email).IsUnique();
            entity.HasIndex(x => x.Active);
            entity.HasIndex(x => x.IsCoordinator);
            entity.HasIndex(x => x.EmployeeLevelId);
            entity.HasOne<EmployeeLevel>().WithMany().HasForeignKey(x => x.EmployeeLevelId).OnDelete(DeleteBehavior.Restrict);
        });

        ConfigureEntity(modelBuilder.Entity<CustomerCatalogOption>(), "customer_catalog_options");
        modelBuilder.Entity<CustomerCatalogOption>(entity =>
        {
            entity.Property(x => x.Catalog).HasMaxLength(64);
            entity.Property(x => x.Name).HasMaxLength(160);
            entity.Property(x => x.Description).HasMaxLength(600);
            entity.HasIndex(x => new { x.Catalog, x.Name }).IsUnique();
            entity.HasIndex(x => new { x.Catalog, x.Active });
        });

        ConfigureEntity(modelBuilder.Entity<AgendaCalendar>(), "agenda_calendars");
        modelBuilder.Entity<AgendaCalendar>(entity =>
        {
            entity.Property(x => x.Name).HasMaxLength(120);
            entity.Property(x => x.Description).HasMaxLength(600);
            entity.HasIndex(x => new { x.DepartmentId, x.Name }).IsUnique();
            entity.HasIndex(x => x.Active);
            entity.HasOne<TaskDepartment>().WithMany().HasForeignKey(x => x.DepartmentId).OnDelete(DeleteBehavior.Restrict);
        });

        ConfigureEntity(modelBuilder.Entity<AgendaType>(), "agenda_types");
        modelBuilder.Entity<AgendaType>(entity =>
        {
            entity.Property(x => x.Name).HasMaxLength(120);
            entity.Property(x => x.Description).HasMaxLength(600);
            entity.Property(x => x.Color).HasMaxLength(16);
            entity.HasIndex(x => x.Name).IsUnique();
            entity.HasIndex(x => x.Active);
        });

        ConfigureEntity(modelBuilder.Entity<AgendaStatus>(), "agenda_statuses");
        modelBuilder.Entity<AgendaStatus>(entity =>
        {
            entity.Property(x => x.Name).HasMaxLength(120);
            entity.Property(x => x.Description).HasMaxLength(600);
            entity.Property(x => x.Color).HasMaxLength(16);
            entity.HasIndex(x => x.Name).IsUnique();
            entity.HasIndex(x => x.Active);
        });

        ConfigureEntity(modelBuilder.Entity<AgendaCommitment>(), "agenda_commitments");
        modelBuilder.Entity<AgendaCommitment>(entity =>
        {
            entity.Property(x => x.Title).HasMaxLength(240);
            entity.Property(x => x.Description).HasColumnType("text");
            entity.Property(x => x.CreatedBy).HasMaxLength(254);
            entity.HasIndex(x => new { x.AgendaId, x.StartsAt });
            entity.HasIndex(x => new { x.ResponsibleUserId, x.StartsAt, x.EndsAt });
            entity.HasOne<AgendaCalendar>().WithMany().HasForeignKey(x => x.AgendaId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<AgendaType>().WithMany().HasForeignKey(x => x.AgendaTypeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<AgendaStatus>().WithMany().HasForeignKey(x => x.AgendaStatusId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<AppUser>().WithMany().HasForeignKey(x => x.ResponsibleUserId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AgendaCommitmentParticipant>(entity =>
        {
            entity.ToTable("agenda_commitment_participants");
            entity.HasKey(x => new { x.CommitmentId, x.UserId });
            entity.HasIndex(x => x.UserId);
            entity.HasOne<AgendaCommitment>().WithMany().HasForeignKey(x => x.CommitmentId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });

        ConfigureEntity(modelBuilder.Entity<EmployeeLevel>(), "employee_levels");
        modelBuilder.Entity<EmployeeLevel>(entity =>
        {
            entity.Property(x => x.Name).HasMaxLength(100);
            entity.Property(x => x.Description).HasMaxLength(600);
            entity.HasIndex(x => x.Name).IsUnique();
            entity.HasIndex(x => x.Active);
        });

        modelBuilder.Entity<EmployeeSupervision>(entity =>
        {
            entity.ToTable("employee_supervisions");
            entity.HasKey(x => new { x.CoordinatorUserId, x.SubordinateUserId });
            entity.HasIndex(x => x.SubordinateUserId);
            entity.HasOne(x => x.CoordinatorUser).WithMany()
                .HasForeignKey(x => x.CoordinatorUserId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.SubordinateUser).WithMany()
                .HasForeignKey(x => x.SubordinateUserId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<LocalAuthSession>(entity =>
        {
            entity.ToTable("local_auth_sessions");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.TokenHash).HasMaxLength(128);
            entity.HasIndex(x => x.TokenHash).IsUnique();
            entity.HasIndex(x => new { x.UserId, x.ExpiresAt });
            entity.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        ConfigureEntity(modelBuilder.Entity<AccessGroup>(), "access_groups");
        modelBuilder.Entity<AccessGroup>(entity =>
        {
            entity.Property(x => x.Name).HasMaxLength(120);
            entity.Property(x => x.Description).HasMaxLength(600);
            entity.HasIndex(x => x.Name).IsUnique();
            entity.HasIndex(x => x.Active);
        });

        modelBuilder.Entity<UserAccessGroup>(entity =>
        {
            entity.ToTable("user_access_groups");
            entity.HasKey(x => new { x.UserId, x.GroupId });
            entity.HasOne(x => x.User)
                .WithMany(x => x.Groups)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Group)
                .WithMany(x => x.Users)
                .HasForeignKey(x => x.GroupId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<GroupPermission>(entity =>
        {
            entity.ToTable("group_permissions");
            entity.HasKey(x => new { x.GroupId, x.Screen });
            entity.Property(x => x.Screen).HasMaxLength(48);
            entity.Property(x => x.CapabilitiesJson).HasColumnType("jsonb");
            entity.HasOne(x => x.Group)
                .WithMany(x => x.Permissions)
                .HasForeignKey(x => x.GroupId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        ConfigureTaskModule(modelBuilder);
        ConfigureChatModule(modelBuilder);
        ConfigureInternalChatModule(modelBuilder);
        ConfigureSuggestionModule(modelBuilder);
        ConfigureNoticeModule(modelBuilder);
    }

    private static void ConfigureNoticeModule(ModelBuilder modelBuilder)
    {
        ConfigureEntity(modelBuilder.Entity<CompanyNotice>(), "company_notices");
        modelBuilder.Entity<CompanyNotice>(entity =>
        {
            entity.Property(x => x.Title).HasMaxLength(240);
            entity.Property(x => x.Body).HasColumnType("text");
            entity.Property(x => x.Type).HasMaxLength(40);
            entity.Property(x => x.Kind).HasMaxLength(24);
            entity.Property(x => x.Audience).HasMaxLength(40);
            entity.Property(x => x.ImageDataUrl).HasColumnType("text");
            entity.HasIndex(x => new { x.Active, x.PublishedAt });
            entity.HasIndex(x => x.ExpiresAt);
            entity.HasIndex(x => x.TargetUserId);
            entity.HasOne<AppUser>().WithMany().HasForeignKey(x => x.AuthorUserId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<AppUser>().WithMany().HasForeignKey(x => x.TargetUserId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<CompanyNoticeRead>(entity =>
        {
            entity.ToTable("company_notice_reads");
            entity.HasKey(x => new { x.NoticeId, x.UserId });
            entity.HasIndex(x => new { x.UserId, x.ReadAt });
            entity.HasOne<CompanyNotice>().WithMany().HasForeignKey(x => x.NoticeId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
    }

    private static void ConfigureSuggestionModule(ModelBuilder modelBuilder)
    {
        modelBuilder.HasSequence<long>("suggestion_number_seq").StartsAt(1);

        ConfigureEntity(modelBuilder.Entity<SuggestionPriority>(), "suggestion_priorities");
        modelBuilder.Entity<SuggestionPriority>(entity =>
        {
            entity.Property(x => x.Name).HasMaxLength(80);
            entity.Property(x => x.Description).HasMaxLength(600);
            entity.Property(x => x.Color).HasMaxLength(16);
            entity.HasIndex(x => x.Name).IsUnique();
            entity.HasIndex(x => new { x.Active, x.DisplayOrder });
        });

        ConfigureEntity(modelBuilder.Entity<SuggestionStatus>(), "suggestion_statuses");
        modelBuilder.Entity<SuggestionStatus>(entity =>
        {
            entity.Property(x => x.Name).HasMaxLength(100);
            entity.Property(x => x.Description).HasMaxLength(600);
            entity.Property(x => x.KanbanColumn).HasMaxLength(100);
            entity.Property(x => x.Color).HasMaxLength(16);
            entity.HasIndex(x => x.Name).IsUnique();
            entity.HasIndex(x => new { x.Active, x.DisplayOrder });
        });

        ConfigureEntity(modelBuilder.Entity<Suggestion>(), "suggestions");
        modelBuilder.Entity<Suggestion>(entity =>
        {
            entity.Property(x => x.Number)
                .HasDefaultValueSql("nextval('suggestion_number_seq')")
                .ValueGeneratedOnAdd();
            entity.Property(x => x.Protocol).HasMaxLength(20);
            entity.Property(x => x.Name).HasMaxLength(240);
            entity.Property(x => x.Description).HasColumnType("text");
            entity.Property(x => x.CreatedBy).HasMaxLength(254);
            entity.HasIndex(x => x.Number).IsUnique();
            entity.HasIndex(x => x.Protocol).IsUnique();
            entity.HasIndex(x => new { x.StatusId, x.UpdatedAt });
            entity.HasIndex(x => x.PriorityId);
            entity.HasIndex(x => x.ResponsibleUserId);
            entity.HasIndex(x => x.CustomerId);
            entity.HasOne<Customer>().WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne<AppUser>().WithMany().HasForeignKey(x => x.ResponsibleUserId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<SuggestionPriority>().WithMany().HasForeignKey(x => x.PriorityId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<SuggestionStatus>().WithMany().HasForeignKey(x => x.StatusId).OnDelete(DeleteBehavior.Restrict);
        });

        ConfigureEntity(modelBuilder.Entity<SuggestionComment>(), "suggestion_comments");
        modelBuilder.Entity<SuggestionComment>(entity =>
        {
            entity.Property(x => x.Body).HasColumnType("text");
            entity.HasIndex(x => new { x.SuggestionId, x.CreatedAt });
            entity.HasOne<Suggestion>().WithMany().HasForeignKey(x => x.SuggestionId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<AppUser>().WithMany().HasForeignKey(x => x.AuthorUserId).OnDelete(DeleteBehavior.Restrict);
        });
    }

    private static void ConfigureInternalChatModule(ModelBuilder modelBuilder)
    {
        ConfigureEntity(modelBuilder.Entity<InternalChatRoom>(), "internal_chat_rooms");
        modelBuilder.Entity<InternalChatRoom>(entity =>
        {
            entity.Property(x => x.Name).HasMaxLength(120);
            entity.Property(x => x.PhotoDataUrl).HasColumnType("text");
            entity.HasIndex(x => x.LastMessageAt);
            entity.HasOne<AppUser>().WithMany().HasForeignKey(x => x.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<InternalChatRoomMember>(entity =>
        {
            entity.ToTable("internal_chat_room_members");
            entity.HasKey(x => new { x.RoomId, x.UserId });
            entity.HasIndex(x => new { x.UserId, x.RoomId });
            entity.HasOne<InternalChatRoom>().WithMany().HasForeignKey(x => x.RoomId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });

        ConfigureEntity(modelBuilder.Entity<InternalChatMessage>(), "internal_chat_messages");
        modelBuilder.Entity<InternalChatMessage>(entity =>
        {
            entity.Property(x => x.Type).HasMaxLength(20);
            entity.Property(x => x.Body).HasColumnType("text");
            entity.Property(x => x.FileName).HasMaxLength(260);
            entity.Property(x => x.ContentType).HasMaxLength(120);
            entity.Property(x => x.StorageKey).HasMaxLength(600);
            entity.HasIndex(x => new { x.RoomId, x.CreatedAt });
            entity.HasOne<InternalChatRoom>().WithMany().HasForeignKey(x => x.RoomId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<AppUser>().WithMany().HasForeignKey(x => x.SenderUserId).OnDelete(DeleteBehavior.Restrict);
        });
    }

    private static void ConfigureChatModule(ModelBuilder modelBuilder)
    {
        modelBuilder.HasSequence<long>("chat_conversation_number_seq").StartsAt(10001);

        ConfigureEntity(modelBuilder.Entity<ChatQueue>(), "chat_queues");
        modelBuilder.Entity<ChatQueue>(entity =>
        {
            entity.Property(x => x.Name).HasMaxLength(120);
            entity.Property(x => x.DistributionStrategy).HasMaxLength(40);
            entity.HasIndex(x => new { x.DepartmentId, x.Name }).IsUnique();
            entity.HasOne<TaskDepartment>().WithMany().HasForeignKey(x => x.DepartmentId).OnDelete(DeleteBehavior.Restrict);
        });

        ConfigureEntity(modelBuilder.Entity<ChatChannel>(), "chat_channels");
        modelBuilder.Entity<ChatChannel>(entity =>
        {
            entity.Property(x => x.Name).HasMaxLength(120);
            entity.Property(x => x.Type).HasMaxLength(40);
            entity.Property(x => x.ClosingMessage).HasMaxLength(1200);
            entity.HasIndex(x => new { x.DepartmentId, x.Name }).IsUnique();
            entity.HasOne<TaskDepartment>().WithMany().HasForeignKey(x => x.DepartmentId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<ChatQueue>().WithMany().HasForeignKey(x => x.DefaultQueueId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<AppUser>().WithMany().HasForeignKey(x => x.DefaultAssigneeUserId).OnDelete(DeleteBehavior.Restrict);
        });

        ConfigureEntity(modelBuilder.Entity<ChatWhatsAppNumber>(), "chat_whatsapp_numbers");
        modelBuilder.Entity<ChatWhatsAppNumber>(entity =>
        {
            entity.Property(x => x.PhoneNumber).HasMaxLength(32);
            entity.Property(x => x.PhoneNumberId).HasMaxLength(120);
            entity.Property(x => x.ConnectionMode).HasMaxLength(30);
            entity.Property(x => x.MetaAppId).HasMaxLength(120);
            entity.Property(x => x.EmbeddedSignupConfigId).HasMaxLength(160);
            entity.Property(x => x.ApiVersion).HasMaxLength(20);
            entity.Property(x => x.CoexistenceStatus).HasMaxLength(60);
            entity.Property(x => x.CoexistenceError).HasMaxLength(1600);
            entity.HasIndex(x => x.ChannelId).IsUnique();
            entity.HasIndex(x => x.PhoneNumber).IsUnique();
            entity.HasIndex(x => x.PhoneNumberId).IsUnique().HasFilter("\"PhoneNumberId\" <> ''");
            entity.HasOne<ChatChannel>().WithMany().HasForeignKey(x => x.ChannelId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<TaskDepartment>().WithMany().HasForeignKey(x => x.DepartmentId).OnDelete(DeleteBehavior.Restrict);
        });

        ConfigureEntity(modelBuilder.Entity<ChatContact>(), "chat_contacts");
        modelBuilder.Entity<ChatContact>(entity =>
        {
            entity.Property(x => x.Name).HasMaxLength(180);
            entity.Property(x => x.Phone).HasMaxLength(32);
            entity.Property(x => x.Email).HasMaxLength(254);
            entity.HasIndex(x => x.Phone);
            entity.HasIndex(x => x.CustomerId);
            entity.HasOne<Customer>().WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.SetNull);
        });

        ConfigureEntity(modelBuilder.Entity<ChatConversation>(), "chat_conversations");
        modelBuilder.Entity<ChatConversation>(entity =>
        {
            entity.Property(x => x.Number).HasDefaultValueSql("nextval('chat_conversation_number_seq')").ValueGeneratedOnAdd();
            entity.Property(x => x.Protocol).HasMaxLength(80);
            entity.Property(x => x.Status).HasMaxLength(40);
            entity.Property(x => x.Priority).HasMaxLength(30);
            entity.Property(x => x.GroupName).HasMaxLength(180);
            entity.Property(x => x.GroupParticipantsJson).HasColumnType("jsonb");
            entity.Property(x => x.SatisfactionComment).HasMaxLength(1600);
            entity.HasIndex(x => x.Number).IsUnique();
            entity.HasIndex(x => new { x.DepartmentId, x.Status, x.LastMessageAt });
            entity.HasIndex(x => x.AssigneeUserId);
            entity.HasOne<ChatContact>().WithMany().HasForeignKey(x => x.ContactId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<ChatChannel>().WithMany().HasForeignKey(x => x.ChannelId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<TaskDepartment>().WithMany().HasForeignKey(x => x.DepartmentId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<ChatQueue>().WithMany().HasForeignKey(x => x.QueueId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<AppUser>().WithMany().HasForeignKey(x => x.AssigneeUserId).OnDelete(DeleteBehavior.Restrict);
        });

        ConfigureEntity(modelBuilder.Entity<ChatMessage>(), "chat_messages");
        modelBuilder.Entity<ChatMessage>(entity =>
        {
            entity.Property(x => x.ExternalId).HasMaxLength(180);
            entity.Property(x => x.Direction).HasMaxLength(20);
            entity.Property(x => x.Type).HasMaxLength(30);
            entity.Property(x => x.Status).HasMaxLength(30);
            entity.Property(x => x.MediaStorageKey).HasMaxLength(700);
            entity.HasIndex(x => new { x.ConversationId, x.CreatedAt });
            entity.HasIndex(x => x.ExternalId).IsUnique().HasFilter("\"ExternalId\" <> ''");
            entity.HasOne<ChatConversation>().WithMany().HasForeignKey(x => x.ConversationId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<AppUser>().WithMany().HasForeignKey(x => x.SenderUserId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<ChatMessage>().WithMany().HasForeignKey(x => x.ReplyToMessageId).OnDelete(DeleteBehavior.Restrict);
        });

        ConfigureEntity(modelBuilder.Entity<ChatTag>(), "chat_tags");
        modelBuilder.Entity<ChatTag>(entity =>
        {
            entity.Property(x => x.Name).HasMaxLength(80);
            entity.Property(x => x.Color).HasMaxLength(16);
            entity.HasIndex(x => new { x.DepartmentId, x.Name }).IsUnique();
            entity.HasOne<TaskDepartment>().WithMany().HasForeignKey(x => x.DepartmentId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ChatConversationTag>(entity =>
        {
            entity.ToTable("chat_conversation_tags");
            entity.HasKey(x => new { x.ConversationId, x.TagId });
            entity.HasOne<ChatConversation>().WithMany().HasForeignKey(x => x.ConversationId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<ChatTag>().WithMany().HasForeignKey(x => x.TagId).OnDelete(DeleteBehavior.Cascade);
        });

        ConfigureEntity(modelBuilder.Entity<ChatTransfer>(), "chat_transfers");
        modelBuilder.Entity<ChatTransfer>(entity =>
        {
            entity.HasIndex(x => new { x.ConversationId, x.CreatedAt });
            entity.HasOne<ChatConversation>().WithMany().HasForeignKey(x => x.ConversationId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<AppUser>().WithMany().HasForeignKey(x => x.ActorUserId).OnDelete(DeleteBehavior.Restrict);
        });

        ConfigureEntity(modelBuilder.Entity<ChatQuickReply>(), "chat_quick_replies");
        modelBuilder.Entity<ChatQuickReply>(entity =>
        {
            entity.Property(x => x.Shortcut).HasMaxLength(40);
            entity.Property(x => x.Title).HasMaxLength(120);
            entity.HasIndex(x => new { x.DepartmentId, x.Shortcut }).IsUnique();
            entity.HasOne<TaskDepartment>().WithMany().HasForeignKey(x => x.DepartmentId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ChatWebhookEvent>(entity =>
        {
            entity.ToTable("chat_webhook_events");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.EventKey).HasMaxLength(220);
            entity.Property(x => x.PhoneNumberId).HasMaxLength(120);
            entity.Property(x => x.PayloadJson).HasColumnType("jsonb");
            entity.HasIndex(x => x.EventKey).IsUnique();
            entity.HasIndex(x => new { x.Status, x.CreatedAt });
        });
    }

    private static void ConfigureTaskModule(ModelBuilder modelBuilder)
    {
        modelBuilder.HasSequence<long>("corporate_task_number_seq").StartsAt(30076);
        ConfigureEntity(modelBuilder.Entity<TaskDepartment>(), "task_departments");
        modelBuilder.Entity<TaskDepartment>(entity =>
        {
            entity.Property(x => x.Name).HasMaxLength(120);
            entity.Property(x => x.Description).HasMaxLength(600);
            entity.HasIndex(x => x.Name).IsUnique();
            entity.HasIndex(x => x.Active);
        });

        modelBuilder.Entity<UserDepartment>(entity =>
        {
            entity.ToTable("user_departments");
            entity.HasKey(x => new { x.UserId, x.DepartmentId });
            entity.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Department).WithMany().HasForeignKey(x => x.DepartmentId).OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(x => new { x.DepartmentId, x.IsCoordinator });
        });

        ConfigureEntity(modelBuilder.Entity<TaskPriority>(), "task_priorities");
        modelBuilder.Entity<TaskPriority>(entity =>
        {
            entity.Property(x => x.Name).HasMaxLength(80);
            entity.Property(x => x.Color).HasMaxLength(16);
            entity.HasIndex(x => x.Name).IsUnique();
            entity.HasIndex(x => x.SeverityOrder);
        });

        ConfigureEntity(modelBuilder.Entity<TaskStatusEntity>(), "task_statuses");
        modelBuilder.Entity<TaskStatusEntity>(entity =>
        {
            entity.Property(x => x.Name).HasMaxLength(100);
            entity.Property(x => x.KanbanColumn).HasMaxLength(100);
            entity.HasIndex(x => new { x.DepartmentId, x.DisplayOrder });
        });

        ConfigureEntity(modelBuilder.Entity<TaskSlaPolicy>(), "task_sla_policies");
        modelBuilder.Entity<TaskSlaPolicy>(entity =>
        {
            entity.Property(x => x.Name).HasMaxLength(140);
            entity.Property(x => x.BusinessDaysJson).HasColumnType("jsonb");
            entity.HasIndex(x => new { x.DepartmentId, x.TaskTypeId, x.PriorityId });
        });

        modelBuilder.Entity<TaskSlaPauseStatus>(entity =>
        {
            entity.ToTable("task_sla_pause_statuses");
            entity.HasKey(x => new { x.SlaPolicyId, x.StatusId });
        });

        ConfigureEntity(modelBuilder.Entity<TaskType>(), "task_types");
        modelBuilder.Entity<TaskType>(entity =>
        {
            entity.Property(x => x.Name).HasMaxLength(120);
            entity.HasIndex(x => x.Name);
            entity.HasIndex(x => x.Active);
        });

        modelBuilder.Entity<TaskTypeDepartment>(entity =>
        {
            entity.ToTable("task_type_departments");
            entity.HasKey(x => new { x.TaskTypeId, x.DepartmentId });
            entity.HasIndex(x => x.DepartmentId);
        });

        modelBuilder.Entity<TaskTypeStatus>(entity =>
        {
            entity.ToTable("task_type_statuses");
            entity.HasKey(x => new { x.TaskTypeId, x.StatusId });
            entity.HasIndex(x => x.StatusId);
        });

        ConfigureEntity(modelBuilder.Entity<CorporateTask>(), "corporate_tasks");
        modelBuilder.Entity<CorporateTask>(entity =>
        {
            entity.Property(x => x.Number)
                .HasDefaultValueSql("nextval('corporate_task_number_seq')")
                .ValueGeneratedOnAdd();
            entity.Property(x => x.Protocol).HasMaxLength(80);
            entity.Property(x => x.Title).HasMaxLength(240);
            entity.Property(x => x.CustomerCode).HasMaxLength(80);
            entity.Property(x => x.CustomerName).HasMaxLength(180);
            entity.Property(x => x.ClientWhatsApp).HasMaxLength(20);
            entity.Property(x => x.ClientNotificationState).HasMaxLength(40);
            entity.Property(x => x.ExternalLink).HasMaxLength(1000);
            entity.HasIndex(x => x.Number).IsUnique();
            entity.HasIndex(x => new { x.CurrentDepartmentId, x.StatusId });
            entity.HasIndex(x => x.AssigneeUserId);
            entity.HasIndex(x => x.CreatorUserId);
            entity.HasIndex(x => x.SlaDueAt);
            entity.HasIndex(x => x.CustomerId);
        });

        modelBuilder.Entity<TaskParticipant>(entity =>
        {
            entity.ToTable("task_participants");
            entity.HasKey(x => new { x.TaskId, x.UserId });
            entity.Property(x => x.Role).HasMaxLength(40);
        });

        ConfigureEntity(modelBuilder.Entity<TaskComment>(), "task_comments");
        modelBuilder.Entity<TaskComment>(entity =>
        {
            entity.Property(x => x.MentionedUserIdsJson).HasColumnType("jsonb");
            entity.HasIndex(x => new { x.TaskId, x.CreatedAt });
        });

        ConfigureEntity(modelBuilder.Entity<TaskAttachment>(), "task_attachments");
        modelBuilder.Entity<TaskAttachment>(entity =>
        {
            entity.Property(x => x.FileName).HasMaxLength(260);
            entity.Property(x => x.ContentType).HasMaxLength(120);
            entity.Property(x => x.StorageKey).HasMaxLength(600);
            entity.HasIndex(x => x.TaskId);
            entity.HasIndex(x => x.CommentId);
        });

        modelBuilder.Entity<TaskHistory>(entity =>
        {
            entity.ToTable("task_history");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.EventType).HasMaxLength(80);
            entity.Property(x => x.Source).HasMaxLength(40);
            entity.Property(x => x.PreviousValueJson).HasColumnType("jsonb");
            entity.Property(x => x.NewValueJson).HasColumnType("jsonb");
            entity.HasIndex(x => new { x.TaskId, x.CreatedAt });
        });

        modelBuilder.Entity<TaskTransfer>(entity =>
        {
            entity.ToTable("task_transfers");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.TaskId, x.CreatedAt });
        });

        modelBuilder.Entity<TaskNotification>(entity =>
        {
            entity.ToTable("task_notifications");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.EventType).HasMaxLength(80);
            entity.HasIndex(x => new { x.RecipientUserId, x.Read, x.CreatedAt });
            entity.HasIndex(x => x.TaskId);
        });

        modelBuilder.Entity<TaskClientCommunication>(entity =>
        {
            entity.ToTable("task_client_communications");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Action).HasMaxLength(80);
            entity.Property(x => x.Channel).HasMaxLength(40);
            entity.Property(x => x.Result).HasMaxLength(80);
            entity.HasIndex(x => new { x.TaskId, x.CreatedAt });
        });

        modelBuilder.Entity<TaskStatusEntity>().HasOne<TaskDepartment>().WithMany()
            .HasForeignKey(x => x.DepartmentId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<TaskSlaPolicy>().HasOne<TaskDepartment>().WithMany()
            .HasForeignKey(x => x.DepartmentId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<TaskSlaPolicy>().HasOne<TaskPriority>().WithMany()
            .HasForeignKey(x => x.PriorityId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<TaskSlaPauseStatus>().HasOne<TaskSlaPolicy>().WithMany()
            .HasForeignKey(x => x.SlaPolicyId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<TaskSlaPauseStatus>().HasOne<TaskStatusEntity>().WithMany()
            .HasForeignKey(x => x.StatusId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<TaskType>().HasOne<TaskPriority>().WithMany()
            .HasForeignKey(x => x.DefaultPriorityId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<TaskType>().HasOne<TaskSlaPolicy>().WithMany()
            .HasForeignKey(x => x.DefaultSlaPolicyId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<TaskType>().HasOne<TaskStatusEntity>().WithMany()
            .HasForeignKey(x => x.InitialStatusId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<TaskTypeDepartment>().HasOne<TaskType>().WithMany()
            .HasForeignKey(x => x.TaskTypeId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<TaskTypeDepartment>().HasOne<TaskDepartment>().WithMany()
            .HasForeignKey(x => x.DepartmentId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<TaskTypeStatus>().HasOne<TaskType>().WithMany()
            .HasForeignKey(x => x.TaskTypeId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<TaskTypeStatus>().HasOne<TaskStatusEntity>().WithMany()
            .HasForeignKey(x => x.StatusId).OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<CorporateTask>().HasOne<TaskType>().WithMany()
            .HasForeignKey(x => x.TypeId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<CorporateTask>().HasOne<TaskPriority>().WithMany()
            .HasForeignKey(x => x.PriorityId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<CorporateTask>().HasOne<TaskStatusEntity>().WithMany()
            .HasForeignKey(x => x.StatusId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<CorporateTask>().HasOne<TaskSlaPolicy>().WithMany()
            .HasForeignKey(x => x.SlaPolicyId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<CorporateTask>().HasOne<TaskDepartment>().WithMany()
            .HasForeignKey(x => x.SourceDepartmentId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<CorporateTask>().HasOne<TaskDepartment>().WithMany()
            .HasForeignKey(x => x.CurrentDepartmentId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<CorporateTask>().HasOne<AppUser>().WithMany()
            .HasForeignKey(x => x.CreatorUserId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<CorporateTask>().HasOne<AppUser>().WithMany()
            .HasForeignKey(x => x.AssigneeUserId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<CorporateTask>().HasOne<AppUser>().WithMany()
            .HasForeignKey(x => x.RequesterUserId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<CorporateTask>().HasOne<Customer>().WithMany()
            .HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<TaskParticipant>().HasOne<CorporateTask>().WithMany()
            .HasForeignKey(x => x.TaskId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<TaskParticipant>().HasOne<AppUser>().WithMany()
            .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<TaskComment>().HasOne<CorporateTask>().WithMany()
            .HasForeignKey(x => x.TaskId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<TaskComment>().HasOne<AppUser>().WithMany()
            .HasForeignKey(x => x.AuthorUserId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<TaskAttachment>().HasOne<CorporateTask>().WithMany()
            .HasForeignKey(x => x.TaskId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<TaskAttachment>().HasOne<TaskComment>().WithMany()
            .HasForeignKey(x => x.CommentId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<TaskAttachment>().HasOne<AppUser>().WithMany()
            .HasForeignKey(x => x.UploadedByUserId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<TaskHistory>().HasOne<CorporateTask>().WithMany()
            .HasForeignKey(x => x.TaskId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<TaskHistory>().HasOne<AppUser>().WithMany()
            .HasForeignKey(x => x.ActorUserId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<TaskTransfer>().HasOne<CorporateTask>().WithMany()
            .HasForeignKey(x => x.TaskId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<TaskTransfer>().HasOne<TaskDepartment>().WithMany()
            .HasForeignKey(x => x.FromDepartmentId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<TaskTransfer>().HasOne<TaskDepartment>().WithMany()
            .HasForeignKey(x => x.ToDepartmentId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<TaskTransfer>().HasOne<AppUser>().WithMany()
            .HasForeignKey(x => x.ActorUserId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<TaskNotification>().HasOne<CorporateTask>().WithMany()
            .HasForeignKey(x => x.TaskId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<TaskNotification>().HasOne<AppUser>().WithMany()
            .HasForeignKey(x => x.RecipientUserId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<TaskClientCommunication>().HasOne<CorporateTask>().WithMany()
            .HasForeignKey(x => x.TaskId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<TaskClientCommunication>().HasOne<AppUser>().WithMany()
            .HasForeignKey(x => x.ActorUserId).OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureEntity<T>(Microsoft.EntityFrameworkCore.Metadata.Builders.EntityTypeBuilder<T> entity, string table)
        where T : Entity
    {
        entity.ToTable(table);
        entity.HasKey(x => x.Id);
        entity.Property(x => x.Version).IsConcurrencyToken();
        entity.Property(x => x.CreatedAt).IsRequired();
        entity.Property(x => x.UpdatedAt).IsRequired();
    }
}
