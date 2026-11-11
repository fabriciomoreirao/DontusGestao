using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AgendaStatusChangedAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "StatusChangedAt",
                table: "agenda_commitments",
                type: "timestamp with time zone",
                nullable: true);
            migrationBuilder.Sql("UPDATE agenda_commitments SET \"StatusChangedAt\" = \"UpdatedAt\" WHERE \"StatusChangedAt\" IS NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "StatusChangedAt",
                table: "agenda_commitments");
        }
    }
}
