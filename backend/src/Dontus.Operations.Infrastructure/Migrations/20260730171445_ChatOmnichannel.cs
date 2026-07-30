using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ChatOmnichannel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateSequence(
                name: "chat_conversation_number_seq",
                startValue: 10001L);

            migrationBuilder.CreateTable(
                name: "chat_contacts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(180)", maxLength: 180, nullable: false),
                    Phone = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: true),
                    CompanyName = table.Column<string>(type: "text", nullable: false),
                    Notes = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_chat_contacts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_chat_contacts_customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "chat_queues",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
                    DepartmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    DistributionStrategy = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Active = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_chat_queues", x => x.Id);
                    table.ForeignKey(
                        name: "FK_chat_queues_task_departments_DepartmentId",
                        column: x => x.DepartmentId,
                        principalTable: "task_departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "chat_quick_replies",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Shortcut = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Title = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Body = table.Column<string>(type: "text", nullable: false),
                    DepartmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    Active = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_chat_quick_replies", x => x.Id);
                    table.ForeignKey(
                        name: "FK_chat_quick_replies_task_departments_DepartmentId",
                        column: x => x.DepartmentId,
                        principalTable: "task_departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "chat_tags",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Color = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    DepartmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    Active = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_chat_tags", x => x.Id);
                    table.ForeignKey(
                        name: "FK_chat_tags_task_departments_DepartmentId",
                        column: x => x.DepartmentId,
                        principalTable: "task_departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "chat_webhook_events",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EventKey = table.Column<string>(type: "character varying(220)", maxLength: 220, nullable: false),
                    PhoneNumberId = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    PayloadJson = table.Column<string>(type: "jsonb", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    LastError = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ProcessedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_chat_webhook_events", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "chat_channels",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Type = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    DepartmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    DefaultQueueId = table.Column<Guid>(type: "uuid", nullable: true),
                    DefaultAssigneeUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Active = table.Column<bool>(type: "boolean", nullable: false),
                    AiEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    AllowTransfer = table.Column<bool>(type: "boolean", nullable: false),
                    AutoCreateTask = table.Column<bool>(type: "boolean", nullable: false),
                    GreetingMessage = table.Column<string>(type: "text", nullable: false),
                    AwayMessage = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_chat_channels", x => x.Id);
                    table.ForeignKey(
                        name: "FK_chat_channels_chat_queues_DefaultQueueId",
                        column: x => x.DefaultQueueId,
                        principalTable: "chat_queues",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_chat_channels_task_departments_DepartmentId",
                        column: x => x.DepartmentId,
                        principalTable: "task_departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_chat_channels_users_DefaultAssigneeUserId",
                        column: x => x.DefaultAssigneeUserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "chat_conversations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Number = table.Column<long>(type: "bigint", nullable: false, defaultValueSql: "nextval('chat_conversation_number_seq')"),
                    Protocol = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    ContactId = table.Column<Guid>(type: "uuid", nullable: false),
                    ChannelId = table.Column<Guid>(type: "uuid", nullable: false),
                    DepartmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    QueueId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssigneeUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Subject = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Priority = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Favorite = table.Column<bool>(type: "boolean", nullable: false),
                    UnreadCount = table.Column<int>(type: "integer", nullable: false),
                    LastMessageAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    FirstResponseAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ClosedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    SlaDueAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    AiSummary = table.Column<string>(type: "text", nullable: false),
                    Sentiment = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_chat_conversations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_chat_conversations_chat_channels_ChannelId",
                        column: x => x.ChannelId,
                        principalTable: "chat_channels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_chat_conversations_chat_contacts_ContactId",
                        column: x => x.ContactId,
                        principalTable: "chat_contacts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_chat_conversations_chat_queues_QueueId",
                        column: x => x.QueueId,
                        principalTable: "chat_queues",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_chat_conversations_task_departments_DepartmentId",
                        column: x => x.DepartmentId,
                        principalTable: "task_departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_chat_conversations_users_AssigneeUserId",
                        column: x => x.AssigneeUserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "chat_whatsapp_numbers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ChannelId = table.Column<Guid>(type: "uuid", nullable: false),
                    DepartmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    InternalName = table.Column<string>(type: "text", nullable: false),
                    DisplayName = table.Column<string>(type: "text", nullable: false),
                    PhoneNumber = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    PhoneNumberId = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    WabaId = table.Column<string>(type: "text", nullable: false),
                    BusinessManagerId = table.Column<string>(type: "text", nullable: false),
                    AccessTokenProtected = table.Column<string>(type: "text", nullable: false),
                    VerifyTokenProtected = table.Column<string>(type: "text", nullable: false),
                    AppSecretProtected = table.Column<string>(type: "text", nullable: false),
                    ApiVersion = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    Quality = table.Column<string>(type: "text", nullable: false),
                    LastSyncAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Active = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_chat_whatsapp_numbers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_chat_whatsapp_numbers_chat_channels_ChannelId",
                        column: x => x.ChannelId,
                        principalTable: "chat_channels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_chat_whatsapp_numbers_task_departments_DepartmentId",
                        column: x => x.DepartmentId,
                        principalTable: "task_departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "chat_conversation_tags",
                columns: table => new
                {
                    ConversationId = table.Column<Guid>(type: "uuid", nullable: false),
                    TagId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_chat_conversation_tags", x => new { x.ConversationId, x.TagId });
                    table.ForeignKey(
                        name: "FK_chat_conversation_tags_chat_conversations_ConversationId",
                        column: x => x.ConversationId,
                        principalTable: "chat_conversations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_chat_conversation_tags_chat_tags_TagId",
                        column: x => x.TagId,
                        principalTable: "chat_tags",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "chat_messages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ConversationId = table.Column<Guid>(type: "uuid", nullable: false),
                    ExternalId = table.Column<string>(type: "character varying(180)", maxLength: 180, nullable: false),
                    Direction = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Type = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Body = table.Column<string>(type: "text", nullable: false),
                    Internal = table.Column<bool>(type: "boolean", nullable: false),
                    SenderUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    SenderName = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    ReplyToMessageId = table.Column<Guid>(type: "uuid", nullable: true),
                    MediaUrl = table.Column<string>(type: "text", nullable: false),
                    MediaName = table.Column<string>(type: "text", nullable: false),
                    MediaContentType = table.Column<string>(type: "text", nullable: false),
                    DeliveredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ReadAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_chat_messages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_chat_messages_chat_conversations_ConversationId",
                        column: x => x.ConversationId,
                        principalTable: "chat_conversations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_chat_messages_chat_messages_ReplyToMessageId",
                        column: x => x.ReplyToMessageId,
                        principalTable: "chat_messages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_chat_messages_users_SenderUserId",
                        column: x => x.SenderUserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "chat_transfers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ConversationId = table.Column<Guid>(type: "uuid", nullable: false),
                    FromDepartmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    ToDepartmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    FromChannelId = table.Column<Guid>(type: "uuid", nullable: false),
                    ToChannelId = table.Column<Guid>(type: "uuid", nullable: false),
                    FromQueueId = table.Column<Guid>(type: "uuid", nullable: true),
                    ToQueueId = table.Column<Guid>(type: "uuid", nullable: false),
                    FromAssigneeUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    ToAssigneeUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    ActorUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Reason = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_chat_transfers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_chat_transfers_chat_conversations_ConversationId",
                        column: x => x.ConversationId,
                        principalTable: "chat_conversations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_chat_transfers_users_ActorUserId",
                        column: x => x.ActorUserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_chat_channels_DefaultAssigneeUserId",
                table: "chat_channels",
                column: "DefaultAssigneeUserId");

            migrationBuilder.CreateIndex(
                name: "IX_chat_channels_DefaultQueueId",
                table: "chat_channels",
                column: "DefaultQueueId");

            migrationBuilder.CreateIndex(
                name: "IX_chat_channels_DepartmentId_Name",
                table: "chat_channels",
                columns: new[] { "DepartmentId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_chat_contacts_CustomerId",
                table: "chat_contacts",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_chat_contacts_Phone",
                table: "chat_contacts",
                column: "Phone");

            migrationBuilder.CreateIndex(
                name: "IX_chat_conversation_tags_TagId",
                table: "chat_conversation_tags",
                column: "TagId");

            migrationBuilder.CreateIndex(
                name: "IX_chat_conversations_AssigneeUserId",
                table: "chat_conversations",
                column: "AssigneeUserId");

            migrationBuilder.CreateIndex(
                name: "IX_chat_conversations_ChannelId",
                table: "chat_conversations",
                column: "ChannelId");

            migrationBuilder.CreateIndex(
                name: "IX_chat_conversations_ContactId",
                table: "chat_conversations",
                column: "ContactId");

            migrationBuilder.CreateIndex(
                name: "IX_chat_conversations_DepartmentId_Status_LastMessageAt",
                table: "chat_conversations",
                columns: new[] { "DepartmentId", "Status", "LastMessageAt" });

            migrationBuilder.CreateIndex(
                name: "IX_chat_conversations_Number",
                table: "chat_conversations",
                column: "Number",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_chat_conversations_QueueId",
                table: "chat_conversations",
                column: "QueueId");

            migrationBuilder.CreateIndex(
                name: "IX_chat_messages_ConversationId_CreatedAt",
                table: "chat_messages",
                columns: new[] { "ConversationId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_chat_messages_ExternalId",
                table: "chat_messages",
                column: "ExternalId",
                unique: true,
                filter: "\"ExternalId\" <> ''");

            migrationBuilder.CreateIndex(
                name: "IX_chat_messages_ReplyToMessageId",
                table: "chat_messages",
                column: "ReplyToMessageId");

            migrationBuilder.CreateIndex(
                name: "IX_chat_messages_SenderUserId",
                table: "chat_messages",
                column: "SenderUserId");

            migrationBuilder.CreateIndex(
                name: "IX_chat_queues_DepartmentId_Name",
                table: "chat_queues",
                columns: new[] { "DepartmentId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_chat_quick_replies_DepartmentId_Shortcut",
                table: "chat_quick_replies",
                columns: new[] { "DepartmentId", "Shortcut" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_chat_tags_DepartmentId_Name",
                table: "chat_tags",
                columns: new[] { "DepartmentId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_chat_transfers_ActorUserId",
                table: "chat_transfers",
                column: "ActorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_chat_transfers_ConversationId_CreatedAt",
                table: "chat_transfers",
                columns: new[] { "ConversationId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_chat_webhook_events_EventKey",
                table: "chat_webhook_events",
                column: "EventKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_chat_webhook_events_Status_CreatedAt",
                table: "chat_webhook_events",
                columns: new[] { "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_chat_whatsapp_numbers_ChannelId",
                table: "chat_whatsapp_numbers",
                column: "ChannelId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_chat_whatsapp_numbers_DepartmentId",
                table: "chat_whatsapp_numbers",
                column: "DepartmentId");

            migrationBuilder.CreateIndex(
                name: "IX_chat_whatsapp_numbers_PhoneNumber",
                table: "chat_whatsapp_numbers",
                column: "PhoneNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_chat_whatsapp_numbers_PhoneNumberId",
                table: "chat_whatsapp_numbers",
                column: "PhoneNumberId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "chat_conversation_tags");

            migrationBuilder.DropTable(
                name: "chat_messages");

            migrationBuilder.DropTable(
                name: "chat_quick_replies");

            migrationBuilder.DropTable(
                name: "chat_transfers");

            migrationBuilder.DropTable(
                name: "chat_webhook_events");

            migrationBuilder.DropTable(
                name: "chat_whatsapp_numbers");

            migrationBuilder.DropTable(
                name: "chat_tags");

            migrationBuilder.DropTable(
                name: "chat_conversations");

            migrationBuilder.DropTable(
                name: "chat_channels");

            migrationBuilder.DropTable(
                name: "chat_contacts");

            migrationBuilder.DropTable(
                name: "chat_queues");

            migrationBuilder.DropSequence(
                name: "chat_conversation_number_seq");
        }
    }
}
