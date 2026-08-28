using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ClientManagement : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Address",
                table: "customers",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "City",
                table: "customers",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "DueDay",
                table: "customers",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "DueDays",
                table: "customers",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Email",
                table: "customers",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "GraceDays",
                table: "customers",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "InvoiceCompany",
                table: "customers",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Notes",
                table: "customers",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "PaymentMethod",
                table: "customers",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Phone",
                table: "customers",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "ProductVersion",
                table: "customers",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Project",
                table: "customers",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Server",
                table: "customers",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "State",
                table: "customers",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Subscription",
                table: "customers",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Website",
                table: "customers",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "customer_catalog_options",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Catalog = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    Description = table.Column<string>(type: "character varying(600)", maxLength: 600, nullable: false),
                    Active = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_customer_catalog_options", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_customer_catalog_options_Catalog_Active",
                table: "customer_catalog_options",
                columns: new[] { "Catalog", "Active" });

            migrationBuilder.CreateIndex(
                name: "IX_customer_catalog_options_Catalog_Name",
                table: "customer_catalog_options",
                columns: new[] { "Catalog", "Name" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "customer_catalog_options");

            migrationBuilder.DropColumn(
                name: "Address",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "City",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "DueDay",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "DueDays",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "Email",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "GraceDays",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "InvoiceCompany",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "Notes",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "PaymentMethod",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "Phone",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "ProductVersion",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "Project",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "Server",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "State",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "Subscription",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "Website",
                table: "customers");
        }
    }
}
