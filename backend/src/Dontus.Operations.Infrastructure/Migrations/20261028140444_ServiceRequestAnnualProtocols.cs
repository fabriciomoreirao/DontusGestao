using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ServiceRequestAnnualProtocols : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "service_request_protocol_counters",
                columns: table => new
                {
                    Year = table.Column<int>(type: "integer", nullable: false),
                    LastNumber = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_service_request_protocol_counters", x => x.Year);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "service_request_protocol_counters");
        }
    }
}
