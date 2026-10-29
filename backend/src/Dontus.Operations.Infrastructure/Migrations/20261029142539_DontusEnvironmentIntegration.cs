using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class DontusEnvironmentIntegration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("UPDATE decision_items SET \"DefaultBehavior\" = 'Consulta de clientes e acesso assistido via API; tokens somente no servidor', \"Status\" = 'Implementado' WHERE \"Code\" = 'V-014'");
            migrationBuilder.CreateTable(
                name: "customer_dontus_links",
                columns: table => new
                {
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Identification = table.Column<string>(type: "character varying(19)", maxLength: 19, nullable: false),
                    ExternalClientId = table.Column<long>(type: "bigint", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    LinkedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    LinkedBy = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_customer_dontus_links", x => x.CustomerId);
                    table.ForeignKey(
                        name: "FK_customer_dontus_links_customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_customer_dontus_links_Identification",
                table: "customer_dontus_links",
                column: "Identification",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "customer_dontus_links");
        }
    }
}
