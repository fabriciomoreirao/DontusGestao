using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class EmployeeAdministration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "BirthDate",
                table: "users",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "EmployeeLevelId",
                table: "users",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PasswordHash",
                table: "users",
                type: "character varying(512)",
                maxLength: 512,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "PhotoDataUrl",
                table: "users",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateOnly>(
                name: "StartedAt",
                table: "users",
                type: "date",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "employee_levels",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Active = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_employee_levels", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "local_auth_sessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    TokenHash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    RevokedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_local_auth_sessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_local_auth_sessions_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_users_EmployeeLevelId",
                table: "users",
                column: "EmployeeLevelId");

            migrationBuilder.CreateIndex(
                name: "IX_employee_levels_Active",
                table: "employee_levels",
                column: "Active");

            migrationBuilder.CreateIndex(
                name: "IX_employee_levels_Name",
                table: "employee_levels",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_local_auth_sessions_TokenHash",
                table: "local_auth_sessions",
                column: "TokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_local_auth_sessions_UserId_ExpiresAt",
                table: "local_auth_sessions",
                columns: new[] { "UserId", "ExpiresAt" });

            migrationBuilder.AddForeignKey(
                name: "FK_users_employee_levels_EmployeeLevelId",
                table: "users",
                column: "EmployeeLevelId",
                principalTable: "employee_levels",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_users_employee_levels_EmployeeLevelId",
                table: "users");

            migrationBuilder.DropTable(
                name: "employee_levels");

            migrationBuilder.DropTable(
                name: "local_auth_sessions");

            migrationBuilder.DropIndex(
                name: "IX_users_EmployeeLevelId",
                table: "users");

            migrationBuilder.DropColumn(
                name: "BirthDate",
                table: "users");

            migrationBuilder.DropColumn(
                name: "EmployeeLevelId",
                table: "users");

            migrationBuilder.DropColumn(
                name: "PasswordHash",
                table: "users");

            migrationBuilder.DropColumn(
                name: "PhotoDataUrl",
                table: "users");

            migrationBuilder.DropColumn(
                name: "StartedAt",
                table: "users");
        }
    }
}
