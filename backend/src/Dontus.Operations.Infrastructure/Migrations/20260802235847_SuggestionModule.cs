using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SuggestionModule : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateSequence(
                name: "suggestion_number_seq");

            migrationBuilder.CreateTable(
                name: "suggestion_priorities",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Color = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    DisplayOrder = table.Column<int>(type: "integer", nullable: false),
                    Active = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_suggestion_priorities", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "suggestion_statuses",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    KanbanColumn = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Color = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    DisplayOrder = table.Column<int>(type: "integer", nullable: false),
                    IsInitial = table.Column<bool>(type: "boolean", nullable: false),
                    Active = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_suggestion_statuses", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "suggestions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Number = table.Column<long>(type: "bigint", nullable: false, defaultValueSql: "nextval('suggestion_number_seq')"),
                    Protocol = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Name = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: true),
                    ResponsibleUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    PriorityId = table.Column<Guid>(type: "uuid", nullable: false),
                    StatusId = table.Column<Guid>(type: "uuid", nullable: false),
                    StrategicClient = table.Column<bool>(type: "boolean", nullable: false),
                    CancellationRisk = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedBy = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_suggestions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_suggestions_customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_suggestions_suggestion_priorities_PriorityId",
                        column: x => x.PriorityId,
                        principalTable: "suggestion_priorities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_suggestions_suggestion_statuses_StatusId",
                        column: x => x.StatusId,
                        principalTable: "suggestion_statuses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_suggestions_users_ResponsibleUserId",
                        column: x => x.ResponsibleUserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "suggestion_comments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SuggestionId = table.Column<Guid>(type: "uuid", nullable: false),
                    AuthorUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Body = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_suggestion_comments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_suggestion_comments_suggestions_SuggestionId",
                        column: x => x.SuggestionId,
                        principalTable: "suggestions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_suggestion_comments_users_AuthorUserId",
                        column: x => x.AuthorUserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_suggestion_comments_AuthorUserId",
                table: "suggestion_comments",
                column: "AuthorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_suggestion_comments_SuggestionId_CreatedAt",
                table: "suggestion_comments",
                columns: new[] { "SuggestionId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_suggestion_priorities_Active_DisplayOrder",
                table: "suggestion_priorities",
                columns: new[] { "Active", "DisplayOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_suggestion_priorities_Name",
                table: "suggestion_priorities",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_suggestion_statuses_Active_DisplayOrder",
                table: "suggestion_statuses",
                columns: new[] { "Active", "DisplayOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_suggestion_statuses_Name",
                table: "suggestion_statuses",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_suggestions_CustomerId",
                table: "suggestions",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_suggestions_Number",
                table: "suggestions",
                column: "Number",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_suggestions_PriorityId",
                table: "suggestions",
                column: "PriorityId");

            migrationBuilder.CreateIndex(
                name: "IX_suggestions_Protocol",
                table: "suggestions",
                column: "Protocol",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_suggestions_ResponsibleUserId",
                table: "suggestions",
                column: "ResponsibleUserId");

            migrationBuilder.CreateIndex(
                name: "IX_suggestions_StatusId_UpdatedAt",
                table: "suggestions",
                columns: new[] { "StatusId", "UpdatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "suggestion_comments");

            migrationBuilder.DropTable(
                name: "suggestions");

            migrationBuilder.DropTable(
                name: "suggestion_priorities");

            migrationBuilder.DropTable(
                name: "suggestion_statuses");

            migrationBuilder.DropSequence(
                name: "suggestion_number_seq");
        }
    }
}
