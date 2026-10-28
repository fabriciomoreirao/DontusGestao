using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class CommissionConfirmations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "commission_confirmations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Module = table.Column<string>(type: "text", nullable: false),
                    Scope = table.Column<string>(type: "text", nullable: false),
                    Competence = table.Column<string>(type: "text", nullable: false),
                    EmployeeKey = table.Column<string>(type: "text", nullable: false),
                    EmployeeName = table.Column<string>(type: "text", nullable: false),
                    TokenHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ProtectedToken = table.Column<string>(type: "text", nullable: false),
                    SnapshotJson = table.Column<string>(type: "text", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    AgreedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    InvalidatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_commission_confirmations", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_commission_confirmations_Module_Scope_Competence_EmployeeKey",
                table: "commission_confirmations",
                columns: new[] { "Module", "Scope", "Competence", "EmployeeKey" });

            migrationBuilder.CreateIndex(
                name: "IX_commission_confirmations_TokenHash",
                table: "commission_confirmations",
                column: "TokenHash",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "commission_confirmations");
        }
    }
}
