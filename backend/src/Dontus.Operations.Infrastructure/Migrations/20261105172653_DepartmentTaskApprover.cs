using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class DepartmentTaskApprover : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ApproverUserId",
                table: "task_departments",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_task_departments_ApproverUserId",
                table: "task_departments",
                column: "ApproverUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_task_departments_users_ApproverUserId",
                table: "task_departments",
                column: "ApproverUserId",
                principalTable: "users",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            // Preserve the coordinator previously selected automatically for existing sectors.
            migrationBuilder.Sql("""
                UPDATE task_departments AS department SET "ApproverUserId" = (
                    SELECT account."Id" FROM user_departments AS membership
                    JOIN users AS account ON account."Id" = membership."UserId"
                    WHERE membership."DepartmentId" = department."Id" AND membership."IsCoordinator"
                        AND account."Active" AND account."BlockedAt" IS NULL
                    ORDER BY account."DisplayName", account."Id" LIMIT 1
                );
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_task_departments_users_ApproverUserId",
                table: "task_departments");

            migrationBuilder.DropIndex(
                name: "IX_task_departments_ApproverUserId",
                table: "task_departments");

            migrationBuilder.DropColumn(
                name: "ApproverUserId",
                table: "task_departments");
        }
    }
}
