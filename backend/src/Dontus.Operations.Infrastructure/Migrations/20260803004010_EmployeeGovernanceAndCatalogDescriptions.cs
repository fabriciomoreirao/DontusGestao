using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class EmployeeGovernanceAndCatalogDescriptions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "BlockedAt",
                table: "users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsCoordinator",
                table: "users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AlterColumn<string>(
                name: "Description",
                table: "task_departments",
                type: "character varying(600)",
                maxLength: 600,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "suggestion_statuses",
                type: "character varying(600)",
                maxLength: 600,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "suggestion_priorities",
                type: "character varying(600)",
                maxLength: 600,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "employee_levels",
                type: "character varying(600)",
                maxLength: 600,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "agenda_types",
                type: "character varying(600)",
                maxLength: 600,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "agenda_statuses",
                type: "character varying(600)",
                maxLength: 600,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "agenda_calendars",
                type: "character varying(600)",
                maxLength: 600,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "employee_supervisions",
                columns: table => new
                {
                    CoordinatorUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    SubordinateUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_employee_supervisions", x => new { x.CoordinatorUserId, x.SubordinateUserId });
                    table.ForeignKey(
                        name: "FK_employee_supervisions_users_CoordinatorUserId",
                        column: x => x.CoordinatorUserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_employee_supervisions_users_SubordinateUserId",
                        column: x => x.SubordinateUserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_users_IsCoordinator",
                table: "users",
                column: "IsCoordinator");

            migrationBuilder.CreateIndex(
                name: "IX_employee_supervisions_SubordinateUserId",
                table: "employee_supervisions",
                column: "SubordinateUserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "employee_supervisions");

            migrationBuilder.DropIndex(
                name: "IX_users_IsCoordinator",
                table: "users");

            migrationBuilder.DropColumn(
                name: "BlockedAt",
                table: "users");

            migrationBuilder.DropColumn(
                name: "IsCoordinator",
                table: "users");

            migrationBuilder.DropColumn(
                name: "Description",
                table: "suggestion_statuses");

            migrationBuilder.DropColumn(
                name: "Description",
                table: "suggestion_priorities");

            migrationBuilder.DropColumn(
                name: "Description",
                table: "employee_levels");

            migrationBuilder.DropColumn(
                name: "Description",
                table: "agenda_types");

            migrationBuilder.DropColumn(
                name: "Description",
                table: "agenda_statuses");

            migrationBuilder.DropColumn(
                name: "Description",
                table: "agenda_calendars");

            migrationBuilder.AlterColumn<string>(
                name: "Description",
                table: "task_departments",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(600)",
                oldMaxLength: 600);
        }
    }
}
