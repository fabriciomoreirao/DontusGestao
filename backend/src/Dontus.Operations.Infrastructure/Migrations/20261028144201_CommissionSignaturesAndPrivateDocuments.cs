using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class CommissionSignaturesAndPrivateDocuments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BrowserJson",
                table: "commission_confirmations",
                type: "text",
                nullable: false,
                defaultValue: "{}");

            migrationBuilder.AddColumn<Guid>(
                name: "EmployeeUserId",
                table: "commission_confirmations",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EvidenceHash",
                table: "commission_confirmations",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "SignatureJson",
                table: "commission_confirmations",
                type: "text",
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.AddColumn<string>(
                name: "SignedByEmail",
                table: "commission_confirmations",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "SignedByName",
                table: "commission_confirmations",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "SignedByUserId",
                table: "commission_confirmations",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<byte[]>(
                name: "SignedPdf",
                table: "commission_confirmations",
                type: "bytea",
                nullable: false,
                defaultValue: new byte[0]);

            migrationBuilder.CreateIndex(
                name: "IX_commission_confirmations_EmployeeUserId",
                table: "commission_confirmations",
                column: "EmployeeUserId");
            migrationBuilder.Sql("""
                UPDATE commission_confirmations AS confirmation
                SET "EmployeeUserId" = employee."Id"
                FROM users AS employee
                WHERE lower(confirmation."EmployeeKey") = lower(employee."Id"::text)
                   OR lower(confirmation."EmployeeKey") = lower(employee."Email");
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_commission_confirmations_EmployeeUserId",
                table: "commission_confirmations");

            migrationBuilder.DropColumn(
                name: "BrowserJson",
                table: "commission_confirmations");

            migrationBuilder.DropColumn(
                name: "EmployeeUserId",
                table: "commission_confirmations");

            migrationBuilder.DropColumn(
                name: "EvidenceHash",
                table: "commission_confirmations");

            migrationBuilder.DropColumn(
                name: "SignatureJson",
                table: "commission_confirmations");

            migrationBuilder.DropColumn(
                name: "SignedByEmail",
                table: "commission_confirmations");

            migrationBuilder.DropColumn(
                name: "SignedByName",
                table: "commission_confirmations");

            migrationBuilder.DropColumn(
                name: "SignedByUserId",
                table: "commission_confirmations");

            migrationBuilder.DropColumn(
                name: "SignedPdf",
                table: "commission_confirmations");
        }
    }
}
