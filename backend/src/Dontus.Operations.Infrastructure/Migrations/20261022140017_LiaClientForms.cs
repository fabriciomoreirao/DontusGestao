using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class LiaClientForms : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "lia_forms",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    QuestionsJson = table.Column<string>(type: "text", nullable: false),
                    Active = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_lia_forms", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "lia_form_requests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    FormId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProtectedToken = table.Column<string>(type: "text", nullable: false),
                    TokenHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    FormName = table.Column<string>(type: "text", nullable: false),
                    FormDescription = table.Column<string>(type: "text", nullable: false),
                    QuestionsJson = table.Column<string>(type: "text", nullable: false),
                    AnswersJson = table.Column<string>(type: "text", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    SubmittedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_lia_form_requests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_lia_form_requests_lia_forms_FormId",
                        column: x => x.FormId,
                        principalTable: "lia_forms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_lia_form_requests_work_items_WorkItemId",
                        column: x => x.WorkItemId,
                        principalTable: "work_items",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_lia_form_requests_FormId",
                table: "lia_form_requests",
                column: "FormId");

            migrationBuilder.CreateIndex(
                name: "IX_lia_form_requests_TokenHash",
                table: "lia_form_requests",
                column: "TokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_lia_form_requests_WorkItemId",
                table: "lia_form_requests",
                column: "WorkItemId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "lia_form_requests");

            migrationBuilder.DropTable(
                name: "lia_forms");
        }
    }
}
