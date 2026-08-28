using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AgendaStatuses : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "AgendaStatusId",
                table: "agenda_commitments",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "agenda_statuses",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Color = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Active = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_agenda_statuses", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_agenda_commitments_AgendaStatusId",
                table: "agenda_commitments",
                column: "AgendaStatusId");

            migrationBuilder.CreateIndex(
                name: "IX_agenda_statuses_Active",
                table: "agenda_statuses",
                column: "Active");

            migrationBuilder.CreateIndex(
                name: "IX_agenda_statuses_Name",
                table: "agenda_statuses",
                column: "Name",
                unique: true);

            // Instalações que já possuíam compromissos recebem um status técnico apenas para preservar os dados.
            // Em instalações novas, nenhum status é inserido automaticamente.
            migrationBuilder.Sql("""
                INSERT INTO agenda_statuses ("Id", "Name", "Color", "Active", "CreatedAt", "UpdatedAt", "Version")
                SELECT 'b4212c87-9ecc-4694-b5c9-007727af4b11'::uuid, 'Não definido', '#64748b', TRUE, NOW(), NOW(), 1
                WHERE EXISTS (SELECT 1 FROM agenda_commitments);

                UPDATE agenda_commitments
                SET "AgendaStatusId" = 'b4212c87-9ecc-4694-b5c9-007727af4b11'::uuid
                WHERE "AgendaStatusId" IS NULL;
                """);

            migrationBuilder.AlterColumn<Guid>(
                name: "AgendaStatusId",
                table: "agenda_commitments",
                type: "uuid",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.AddForeignKey(
                name: "FK_agenda_commitments_agenda_statuses_AgendaStatusId",
                table: "agenda_commitments",
                column: "AgendaStatusId",
                principalTable: "agenda_statuses",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_agenda_commitments_agenda_statuses_AgendaStatusId",
                table: "agenda_commitments");

            migrationBuilder.DropTable(
                name: "agenda_statuses");

            migrationBuilder.DropIndex(
                name: "IX_agenda_commitments_AgendaStatusId",
                table: "agenda_commitments");

            migrationBuilder.DropColumn(
                name: "AgendaStatusId",
                table: "agenda_commitments");
        }
    }
}
