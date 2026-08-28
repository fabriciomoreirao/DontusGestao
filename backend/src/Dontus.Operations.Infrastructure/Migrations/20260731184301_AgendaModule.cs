using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AgendaModule : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "agenda_calendars",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    DepartmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Active = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_agenda_calendars", x => x.Id);
                    table.ForeignKey(
                        name: "FK_agenda_calendars_task_departments_DepartmentId",
                        column: x => x.DepartmentId,
                        principalTable: "task_departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "agenda_types",
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
                    table.PrimaryKey("PK_agenda_types", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "agenda_commitments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AgendaId = table.Column<Guid>(type: "uuid", nullable: false),
                    AgendaTypeId = table.Column<Guid>(type: "uuid", nullable: false),
                    ResponsibleUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
                    StartsAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    EndsAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_agenda_commitments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_agenda_commitments_agenda_calendars_AgendaId",
                        column: x => x.AgendaId,
                        principalTable: "agenda_calendars",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_agenda_commitments_agenda_types_AgendaTypeId",
                        column: x => x.AgendaTypeId,
                        principalTable: "agenda_types",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_agenda_commitments_users_ResponsibleUserId",
                        column: x => x.ResponsibleUserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "agenda_commitment_participants",
                columns: table => new
                {
                    CommitmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_agenda_commitment_participants", x => new { x.CommitmentId, x.UserId });
                    table.ForeignKey(
                        name: "FK_agenda_commitment_participants_agenda_commitments_Commitmen~",
                        column: x => x.CommitmentId,
                        principalTable: "agenda_commitments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_agenda_commitment_participants_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_agenda_calendars_Active",
                table: "agenda_calendars",
                column: "Active");

            migrationBuilder.CreateIndex(
                name: "IX_agenda_calendars_DepartmentId_Name",
                table: "agenda_calendars",
                columns: new[] { "DepartmentId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_agenda_commitment_participants_UserId",
                table: "agenda_commitment_participants",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_agenda_commitments_AgendaId_StartsAt",
                table: "agenda_commitments",
                columns: new[] { "AgendaId", "StartsAt" });

            migrationBuilder.CreateIndex(
                name: "IX_agenda_commitments_AgendaTypeId",
                table: "agenda_commitments",
                column: "AgendaTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_agenda_commitments_ResponsibleUserId_StartsAt_EndsAt",
                table: "agenda_commitments",
                columns: new[] { "ResponsibleUserId", "StartsAt", "EndsAt" });

            migrationBuilder.CreateIndex(
                name: "IX_agenda_types_Active",
                table: "agenda_types",
                column: "Active");

            migrationBuilder.CreateIndex(
                name: "IX_agenda_types_Name",
                table: "agenda_types",
                column: "Name",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "agenda_commitment_participants");

            migrationBuilder.DropTable(
                name: "agenda_commitments");

            migrationBuilder.DropTable(
                name: "agenda_calendars");

            migrationBuilder.DropTable(
                name: "agenda_types");
        }
    }
}
