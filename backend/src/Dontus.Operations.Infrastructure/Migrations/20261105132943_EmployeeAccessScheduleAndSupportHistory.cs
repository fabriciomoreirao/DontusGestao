using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class EmployeeAccessScheduleAndSupportHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AccessScheduleJson",
                table: "users",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "support_access_reasons",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Active = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_support_access_reasons", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "support_access_logs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AccessedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ActorEmail = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    ActorName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Identification = table.Column<string>(type: "character varying(19)", maxLength: 19, nullable: false),
                    CustomerName = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    TargetUserId = table.Column<long>(type: "bigint", nullable: false),
                    TargetUserName = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    ReasonId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReasonName = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Justification = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_support_access_logs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_support_access_logs_support_access_reasons_ReasonId",
                        column: x => x.ReasonId,
                        principalTable: "support_access_reasons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_support_access_logs_AccessedAt",
                table: "support_access_logs",
                column: "AccessedAt");

            migrationBuilder.CreateIndex(
                name: "IX_support_access_logs_ActorEmail_AccessedAt",
                table: "support_access_logs",
                columns: new[] { "ActorEmail", "AccessedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_support_access_logs_ReasonId_AccessedAt",
                table: "support_access_logs",
                columns: new[] { "ReasonId", "AccessedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_support_access_reasons_Name",
                table: "support_access_reasons",
                column: "Name",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "support_access_logs");

            migrationBuilder.DropTable(
                name: "support_access_reasons");

            migrationBuilder.DropColumn(
                name: "AccessScheduleJson",
                table: "users");
        }
    }
}
