using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class TaskModule : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateSequence(
                name: "corporate_task_number_seq",
                startValue: 30076L);

            migrationBuilder.AddColumn<string>(
                name: "JobTitle",
                table: "users",
                type: "character varying(120)",
                maxLength: 120,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Phone",
                table: "users",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "CapabilitiesJson",
                table: "group_permissions",
                type: "jsonb",
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "task_departments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
                    Active = table.Column<bool>(type: "boolean", nullable: false),
                    RequiresAssigneeOnTransfer = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_task_departments", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "task_priorities",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    SeverityOrder = table.Column<int>(type: "integer", nullable: false),
                    Color = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    DefaultDueMinutes = table.Column<int>(type: "integer", nullable: true),
                    Active = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_task_priorities", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "task_statuses",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    DepartmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    DisplayOrder = table.Column<int>(type: "integer", nullable: false),
                    KanbanColumn = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    IsInitial = table.Column<bool>(type: "boolean", nullable: false),
                    IsFinal = table.Column<bool>(type: "boolean", nullable: false),
                    AcceptsNewTasks = table.Column<bool>(type: "boolean", nullable: false),
                    ManualMovement = table.Column<bool>(type: "boolean", nullable: false),
                    RequiresJustification = table.Column<bool>(type: "boolean", nullable: false),
                    Active = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_task_statuses", x => x.Id);
                    table.ForeignKey(
                        name: "FK_task_statuses_task_departments_DepartmentId",
                        column: x => x.DepartmentId,
                        principalTable: "task_departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "user_departments",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    DepartmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsPrimary = table.Column<bool>(type: "boolean", nullable: false),
                    IsCoordinator = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_departments", x => new { x.UserId, x.DepartmentId });
                    table.ForeignKey(
                        name: "FK_user_departments_task_departments_DepartmentId",
                        column: x => x.DepartmentId,
                        principalTable: "task_departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_user_departments_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "task_sla_policies",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(140)", maxLength: 140, nullable: false),
                    DepartmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    TaskTypeId = table.Column<Guid>(type: "uuid", nullable: true),
                    PriorityId = table.Column<Guid>(type: "uuid", nullable: true),
                    FirstResponseMinutes = table.Column<int>(type: "integer", nullable: false),
                    ServiceStartMinutes = table.Column<int>(type: "integer", nullable: false),
                    CompletionMinutes = table.Column<int>(type: "integer", nullable: false),
                    BusinessDaysJson = table.Column<string>(type: "jsonb", nullable: false),
                    BusinessStart = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    BusinessEnd = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    AlertBeforeMinutes = table.Column<int>(type: "integer", nullable: false),
                    EscalationMinutes = table.Column<int>(type: "integer", nullable: false),
                    RecalculateOnTransfer = table.Column<bool>(type: "boolean", nullable: false),
                    Active = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_task_sla_policies", x => x.Id);
                    table.ForeignKey(
                        name: "FK_task_sla_policies_task_departments_DepartmentId",
                        column: x => x.DepartmentId,
                        principalTable: "task_departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_task_sla_policies_task_priorities_PriorityId",
                        column: x => x.PriorityId,
                        principalTable: "task_priorities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "task_sla_pause_statuses",
                columns: table => new
                {
                    SlaPolicyId = table.Column<Guid>(type: "uuid", nullable: false),
                    StatusId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_task_sla_pause_statuses", x => new { x.SlaPolicyId, x.StatusId });
                    table.ForeignKey(
                        name: "FK_task_sla_pause_statuses_task_sla_policies_SlaPolicyId",
                        column: x => x.SlaPolicyId,
                        principalTable: "task_sla_policies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_task_sla_pause_statuses_task_statuses_StatusId",
                        column: x => x.StatusId,
                        principalTable: "task_statuses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "task_types",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
                    DefaultPriorityId = table.Column<Guid>(type: "uuid", nullable: true),
                    DefaultSlaPolicyId = table.Column<Guid>(type: "uuid", nullable: true),
                    InitialStatusId = table.Column<Guid>(type: "uuid", nullable: false),
                    Active = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_task_types", x => x.Id);
                    table.ForeignKey(
                        name: "FK_task_types_task_priorities_DefaultPriorityId",
                        column: x => x.DefaultPriorityId,
                        principalTable: "task_priorities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_task_types_task_sla_policies_DefaultSlaPolicyId",
                        column: x => x.DefaultSlaPolicyId,
                        principalTable: "task_sla_policies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_task_types_task_statuses_InitialStatusId",
                        column: x => x.InitialStatusId,
                        principalTable: "task_statuses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "corporate_tasks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Number = table.Column<long>(type: "bigint", nullable: false, defaultValueSql: "nextval('corporate_task_number_seq')"),
                    Protocol = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Title = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
                    TypeId = table.Column<Guid>(type: "uuid", nullable: false),
                    PriorityId = table.Column<Guid>(type: "uuid", nullable: false),
                    StatusId = table.Column<Guid>(type: "uuid", nullable: false),
                    SlaPolicyId = table.Column<Guid>(type: "uuid", nullable: true),
                    SourceDepartmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    CurrentDepartmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatorUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssigneeUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    RequesterUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: true),
                    CustomerCode = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    CustomerName = table.Column<string>(type: "character varying(180)", maxLength: 180, nullable: false),
                    ExternalLink = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    InternalNotes = table.Column<string>(type: "text", nullable: false),
                    DueAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    FirstResponseDueAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ServiceStartDueAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    SlaDueAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    SlaPausedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    AccumulatedPauseMinutes = table.Column<int>(type: "integer", nullable: false),
                    Cancelled = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_corporate_tasks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_corporate_tasks_customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_corporate_tasks_task_departments_CurrentDepartmentId",
                        column: x => x.CurrentDepartmentId,
                        principalTable: "task_departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_corporate_tasks_task_departments_SourceDepartmentId",
                        column: x => x.SourceDepartmentId,
                        principalTable: "task_departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_corporate_tasks_task_priorities_PriorityId",
                        column: x => x.PriorityId,
                        principalTable: "task_priorities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_corporate_tasks_task_sla_policies_SlaPolicyId",
                        column: x => x.SlaPolicyId,
                        principalTable: "task_sla_policies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_corporate_tasks_task_statuses_StatusId",
                        column: x => x.StatusId,
                        principalTable: "task_statuses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_corporate_tasks_task_types_TypeId",
                        column: x => x.TypeId,
                        principalTable: "task_types",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_corporate_tasks_users_AssigneeUserId",
                        column: x => x.AssigneeUserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_corporate_tasks_users_CreatorUserId",
                        column: x => x.CreatorUserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_corporate_tasks_users_RequesterUserId",
                        column: x => x.RequesterUserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "task_type_departments",
                columns: table => new
                {
                    TaskTypeId = table.Column<Guid>(type: "uuid", nullable: false),
                    DepartmentId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_task_type_departments", x => new { x.TaskTypeId, x.DepartmentId });
                    table.ForeignKey(
                        name: "FK_task_type_departments_task_departments_DepartmentId",
                        column: x => x.DepartmentId,
                        principalTable: "task_departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_task_type_departments_task_types_TaskTypeId",
                        column: x => x.TaskTypeId,
                        principalTable: "task_types",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "task_type_statuses",
                columns: table => new
                {
                    TaskTypeId = table.Column<Guid>(type: "uuid", nullable: false),
                    StatusId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_task_type_statuses", x => new { x.TaskTypeId, x.StatusId });
                    table.ForeignKey(
                        name: "FK_task_type_statuses_task_statuses_StatusId",
                        column: x => x.StatusId,
                        principalTable: "task_statuses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_task_type_statuses_task_types_TaskTypeId",
                        column: x => x.TaskTypeId,
                        principalTable: "task_types",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "task_attachments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: false),
                    UploadedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    FileName = table.Column<string>(type: "character varying(260)", maxLength: 260, nullable: false),
                    ContentType = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    StorageKey = table.Column<string>(type: "character varying(600)", maxLength: 600, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_task_attachments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_task_attachments_corporate_tasks_TaskId",
                        column: x => x.TaskId,
                        principalTable: "corporate_tasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_task_attachments_users_UploadedByUserId",
                        column: x => x.UploadedByUserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "task_client_communications",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Action = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Channel = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Message = table.Column<string>(type: "text", nullable: false),
                    Result = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_task_client_communications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_task_client_communications_corporate_tasks_TaskId",
                        column: x => x.TaskId,
                        principalTable: "corporate_tasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_task_client_communications_users_ActorUserId",
                        column: x => x.ActorUserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "task_comments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: false),
                    AuthorUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Body = table.Column<string>(type: "text", nullable: false),
                    MentionedUserIdsJson = table.Column<string>(type: "jsonb", nullable: false),
                    Internal = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_task_comments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_task_comments_corporate_tasks_TaskId",
                        column: x => x.TaskId,
                        principalTable: "corporate_tasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_task_comments_users_AuthorUserId",
                        column: x => x.AuthorUserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "task_history",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    EventType = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Summary = table.Column<string>(type: "text", nullable: false),
                    PreviousValueJson = table.Column<string>(type: "jsonb", nullable: false),
                    NewValueJson = table.Column<string>(type: "jsonb", nullable: false),
                    Source = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Justification = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_task_history", x => x.Id);
                    table.ForeignKey(
                        name: "FK_task_history_corporate_tasks_TaskId",
                        column: x => x.TaskId,
                        principalTable: "corporate_tasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_task_history_users_ActorUserId",
                        column: x => x.ActorUserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "task_notifications",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: false),
                    RecipientUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    EventType = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Message = table.Column<string>(type: "text", nullable: false),
                    Read = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ReadAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_task_notifications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_task_notifications_corporate_tasks_TaskId",
                        column: x => x.TaskId,
                        principalTable: "corporate_tasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_task_notifications_users_RecipientUserId",
                        column: x => x.RecipientUserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "task_participants",
                columns: table => new
                {
                    TaskId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Role = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_task_participants", x => new { x.TaskId, x.UserId });
                    table.ForeignKey(
                        name: "FK_task_participants_corporate_tasks_TaskId",
                        column: x => x.TaskId,
                        principalTable: "corporate_tasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_task_participants_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "task_transfers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: false),
                    FromDepartmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    ToDepartmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    PreviousAssigneeUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    NewAssigneeUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    ActorUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Reason = table.Column<string>(type: "text", nullable: false),
                    SlaRecalculated = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_task_transfers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_task_transfers_corporate_tasks_TaskId",
                        column: x => x.TaskId,
                        principalTable: "corporate_tasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_task_transfers_task_departments_FromDepartmentId",
                        column: x => x.FromDepartmentId,
                        principalTable: "task_departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_task_transfers_task_departments_ToDepartmentId",
                        column: x => x.ToDepartmentId,
                        principalTable: "task_departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_task_transfers_users_ActorUserId",
                        column: x => x.ActorUserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_corporate_tasks_AssigneeUserId",
                table: "corporate_tasks",
                column: "AssigneeUserId");

            migrationBuilder.CreateIndex(
                name: "IX_corporate_tasks_CreatorUserId",
                table: "corporate_tasks",
                column: "CreatorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_corporate_tasks_CurrentDepartmentId_StatusId",
                table: "corporate_tasks",
                columns: new[] { "CurrentDepartmentId", "StatusId" });

            migrationBuilder.CreateIndex(
                name: "IX_corporate_tasks_CustomerId",
                table: "corporate_tasks",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_corporate_tasks_Number",
                table: "corporate_tasks",
                column: "Number",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_corporate_tasks_PriorityId",
                table: "corporate_tasks",
                column: "PriorityId");

            migrationBuilder.CreateIndex(
                name: "IX_corporate_tasks_RequesterUserId",
                table: "corporate_tasks",
                column: "RequesterUserId");

            migrationBuilder.CreateIndex(
                name: "IX_corporate_tasks_SlaDueAt",
                table: "corporate_tasks",
                column: "SlaDueAt");

            migrationBuilder.CreateIndex(
                name: "IX_corporate_tasks_SlaPolicyId",
                table: "corporate_tasks",
                column: "SlaPolicyId");

            migrationBuilder.CreateIndex(
                name: "IX_corporate_tasks_SourceDepartmentId",
                table: "corporate_tasks",
                column: "SourceDepartmentId");

            migrationBuilder.CreateIndex(
                name: "IX_corporate_tasks_StatusId",
                table: "corporate_tasks",
                column: "StatusId");

            migrationBuilder.CreateIndex(
                name: "IX_corporate_tasks_TypeId",
                table: "corporate_tasks",
                column: "TypeId");

            migrationBuilder.CreateIndex(
                name: "IX_task_attachments_TaskId",
                table: "task_attachments",
                column: "TaskId");

            migrationBuilder.CreateIndex(
                name: "IX_task_attachments_UploadedByUserId",
                table: "task_attachments",
                column: "UploadedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_task_client_communications_ActorUserId",
                table: "task_client_communications",
                column: "ActorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_task_client_communications_TaskId_CreatedAt",
                table: "task_client_communications",
                columns: new[] { "TaskId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_task_comments_AuthorUserId",
                table: "task_comments",
                column: "AuthorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_task_comments_TaskId_CreatedAt",
                table: "task_comments",
                columns: new[] { "TaskId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_task_departments_Active",
                table: "task_departments",
                column: "Active");

            migrationBuilder.CreateIndex(
                name: "IX_task_departments_Name",
                table: "task_departments",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_task_history_ActorUserId",
                table: "task_history",
                column: "ActorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_task_history_TaskId_CreatedAt",
                table: "task_history",
                columns: new[] { "TaskId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_task_notifications_RecipientUserId_Read_CreatedAt",
                table: "task_notifications",
                columns: new[] { "RecipientUserId", "Read", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_task_notifications_TaskId",
                table: "task_notifications",
                column: "TaskId");

            migrationBuilder.CreateIndex(
                name: "IX_task_participants_UserId",
                table: "task_participants",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_task_priorities_Name",
                table: "task_priorities",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_task_priorities_SeverityOrder",
                table: "task_priorities",
                column: "SeverityOrder");

            migrationBuilder.CreateIndex(
                name: "IX_task_sla_pause_statuses_StatusId",
                table: "task_sla_pause_statuses",
                column: "StatusId");

            migrationBuilder.CreateIndex(
                name: "IX_task_sla_policies_DepartmentId_TaskTypeId_PriorityId",
                table: "task_sla_policies",
                columns: new[] { "DepartmentId", "TaskTypeId", "PriorityId" });

            migrationBuilder.CreateIndex(
                name: "IX_task_sla_policies_PriorityId",
                table: "task_sla_policies",
                column: "PriorityId");

            migrationBuilder.CreateIndex(
                name: "IX_task_statuses_DepartmentId_DisplayOrder",
                table: "task_statuses",
                columns: new[] { "DepartmentId", "DisplayOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_task_transfers_ActorUserId",
                table: "task_transfers",
                column: "ActorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_task_transfers_FromDepartmentId",
                table: "task_transfers",
                column: "FromDepartmentId");

            migrationBuilder.CreateIndex(
                name: "IX_task_transfers_TaskId_CreatedAt",
                table: "task_transfers",
                columns: new[] { "TaskId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_task_transfers_ToDepartmentId",
                table: "task_transfers",
                column: "ToDepartmentId");

            migrationBuilder.CreateIndex(
                name: "IX_task_type_departments_DepartmentId",
                table: "task_type_departments",
                column: "DepartmentId");

            migrationBuilder.CreateIndex(
                name: "IX_task_type_statuses_StatusId",
                table: "task_type_statuses",
                column: "StatusId");

            migrationBuilder.CreateIndex(
                name: "IX_task_types_Active",
                table: "task_types",
                column: "Active");

            migrationBuilder.CreateIndex(
                name: "IX_task_types_DefaultPriorityId",
                table: "task_types",
                column: "DefaultPriorityId");

            migrationBuilder.CreateIndex(
                name: "IX_task_types_DefaultSlaPolicyId",
                table: "task_types",
                column: "DefaultSlaPolicyId");

            migrationBuilder.CreateIndex(
                name: "IX_task_types_InitialStatusId",
                table: "task_types",
                column: "InitialStatusId");

            migrationBuilder.CreateIndex(
                name: "IX_task_types_Name",
                table: "task_types",
                column: "Name");

            migrationBuilder.CreateIndex(
                name: "IX_user_departments_DepartmentId_IsCoordinator",
                table: "user_departments",
                columns: new[] { "DepartmentId", "IsCoordinator" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "task_attachments");

            migrationBuilder.DropTable(
                name: "task_client_communications");

            migrationBuilder.DropTable(
                name: "task_comments");

            migrationBuilder.DropTable(
                name: "task_history");

            migrationBuilder.DropTable(
                name: "task_notifications");

            migrationBuilder.DropTable(
                name: "task_participants");

            migrationBuilder.DropTable(
                name: "task_sla_pause_statuses");

            migrationBuilder.DropTable(
                name: "task_transfers");

            migrationBuilder.DropTable(
                name: "task_type_departments");

            migrationBuilder.DropTable(
                name: "task_type_statuses");

            migrationBuilder.DropTable(
                name: "user_departments");

            migrationBuilder.DropTable(
                name: "corporate_tasks");

            migrationBuilder.DropTable(
                name: "task_types");

            migrationBuilder.DropTable(
                name: "task_sla_policies");

            migrationBuilder.DropTable(
                name: "task_statuses");

            migrationBuilder.DropTable(
                name: "task_priorities");

            migrationBuilder.DropTable(
                name: "task_departments");

            migrationBuilder.DropColumn(
                name: "JobTitle",
                table: "users");

            migrationBuilder.DropColumn(
                name: "Phone",
                table: "users");

            migrationBuilder.DropColumn(
                name: "CapabilitiesJson",
                table: "group_permissions");

            migrationBuilder.DropSequence(
                name: "corporate_task_number_seq");
        }
    }
}
