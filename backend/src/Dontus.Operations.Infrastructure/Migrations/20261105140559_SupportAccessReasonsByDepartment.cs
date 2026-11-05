using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SupportAccessReasonsByDepartment : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_support_access_reasons_Name",
                table: "support_access_reasons");

            migrationBuilder.AddColumn<Guid>(
                name: "DepartmentId",
                table: "support_access_reasons",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_support_access_reasons_DepartmentId_Name",
                table: "support_access_reasons",
                columns: new[] { "DepartmentId", "Name" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_support_access_reasons_task_departments_DepartmentId",
                table: "support_access_reasons",
                column: "DepartmentId",
                principalTable: "task_departments",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_support_access_reasons_task_departments_DepartmentId",
                table: "support_access_reasons");

            migrationBuilder.DropIndex(
                name: "IX_support_access_reasons_DepartmentId_Name",
                table: "support_access_reasons");

            migrationBuilder.DropColumn(
                name: "DepartmentId",
                table: "support_access_reasons");

            migrationBuilder.CreateIndex(
                name: "IX_support_access_reasons_Name",
                table: "support_access_reasons",
                column: "Name",
                unique: true);
        }
    }
}
