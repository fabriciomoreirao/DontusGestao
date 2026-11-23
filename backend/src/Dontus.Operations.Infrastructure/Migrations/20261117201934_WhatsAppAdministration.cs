using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class WhatsAppAdministration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "SuiteBase",
                table: "chat_whatsapp_numbers",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "SuiteClinicId",
                table: "chat_whatsapp_numbers",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "SuiteDontusId",
                table: "chat_whatsapp_numbers",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "SuiteStatus",
                table: "chat_whatsapp_numbers",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "whatsapp_campaigns",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    NumberId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Category = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    ConsentSource = table.Column<string>(type: "text", nullable: false),
                    ScheduledAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    FinishedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    LeaseUntil = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_whatsapp_campaigns", x => x.Id);
                    table.ForeignKey(
                        name: "FK_whatsapp_campaigns_chat_whatsapp_numbers_NumberId",
                        column: x => x.NumberId,
                        principalTable: "chat_whatsapp_numbers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "whatsapp_opt_outs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Phone = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_whatsapp_opt_outs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "whatsapp_templates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    NumberId = table.Column<Guid>(type: "uuid", nullable: false),
                    MetaId = table.Column<string>(type: "text", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Language = table.Column<string>(type: "text", nullable: false),
                    Purpose = table.Column<string>(type: "text", nullable: false),
                    Category = table.Column<string>(type: "text", nullable: false),
                    Body = table.Column<string>(type: "text", nullable: false),
                    HeaderType = table.Column<string>(type: "text", nullable: false),
                    HeaderHandle = table.Column<string>(type: "text", nullable: false),
                    MediaUrl = table.Column<string>(type: "text", nullable: false),
                    VariablesJson = table.Column<string>(type: "text", nullable: false),
                    ButtonsJson = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    RejectionReason = table.Column<string>(type: "text", nullable: false),
                    SyncedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_whatsapp_templates", x => x.Id);
                    table.ForeignKey(
                        name: "FK_whatsapp_templates_chat_whatsapp_numbers_NumberId",
                        column: x => x.NumberId,
                        principalTable: "chat_whatsapp_numbers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "whatsapp_campaign_deliveries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CampaignId = table.Column<Guid>(type: "uuid", nullable: false),
                    TemplateId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Phone = table.Column<string>(type: "text", nullable: false),
                    ParametersJson = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    ExternalId = table.Column<string>(type: "text", nullable: false),
                    Error = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_whatsapp_campaign_deliveries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_whatsapp_campaign_deliveries_whatsapp_campaigns_CampaignId",
                        column: x => x.CampaignId,
                        principalTable: "whatsapp_campaigns",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_whatsapp_campaign_deliveries_whatsapp_templates_TemplateId",
                        column: x => x.TemplateId,
                        principalTable: "whatsapp_templates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_whatsapp_campaign_deliveries_CampaignId_TemplateId_Phone",
                table: "whatsapp_campaign_deliveries",
                columns: new[] { "CampaignId", "TemplateId", "Phone" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_whatsapp_campaign_deliveries_ExternalId",
                table: "whatsapp_campaign_deliveries",
                column: "ExternalId");

            migrationBuilder.CreateIndex(
                name: "IX_whatsapp_campaign_deliveries_TemplateId",
                table: "whatsapp_campaign_deliveries",
                column: "TemplateId");

            migrationBuilder.CreateIndex(
                name: "IX_whatsapp_campaigns_NumberId",
                table: "whatsapp_campaigns",
                column: "NumberId");

            migrationBuilder.CreateIndex(
                name: "IX_whatsapp_opt_outs_Phone",
                table: "whatsapp_opt_outs",
                column: "Phone",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_whatsapp_templates_NumberId_Name_Language",
                table: "whatsapp_templates",
                columns: new[] { "NumberId", "Name", "Language" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "whatsapp_campaign_deliveries");

            migrationBuilder.DropTable(
                name: "whatsapp_opt_outs");

            migrationBuilder.DropTable(
                name: "whatsapp_campaigns");

            migrationBuilder.DropTable(
                name: "whatsapp_templates");

            migrationBuilder.DropColumn(
                name: "SuiteBase",
                table: "chat_whatsapp_numbers");

            migrationBuilder.DropColumn(
                name: "SuiteClinicId",
                table: "chat_whatsapp_numbers");

            migrationBuilder.DropColumn(
                name: "SuiteDontusId",
                table: "chat_whatsapp_numbers");

            migrationBuilder.DropColumn(
                name: "SuiteStatus",
                table: "chat_whatsapp_numbers");
        }
    }
}
