using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AgendaCalendarPermissions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "user_agenda_calendar_accesses",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CalendarId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_agenda_calendar_accesses", x => new { x.UserId, x.CalendarId });
                    table.ForeignKey(
                        name: "FK_user_agenda_calendar_accesses_agenda_calendars_CalendarId",
                        column: x => x.CalendarId,
                        principalTable: "agenda_calendars",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_user_agenda_calendar_accesses_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_user_agenda_calendar_accesses_CalendarId",
                table: "user_agenda_calendar_accesses",
                column: "CalendarId");
            // Preserve the previous effective access once. Future permissions use calendar IDs only.
            migrationBuilder.Sql("""
                INSERT INTO agenda_calendars ("Id", "Name", "Description", "DepartmentId", "Active", "CreatedAt", "UpdatedAt", "Version")
                SELECT gen_random_uuid(), sector."Name", 'Agenda automática do setor ' || sector."Name" || '.', sector."Id", true, now(), now(), 1
                FROM task_departments sector
                WHERE sector."Active" AND NOT EXISTS (SELECT 1 FROM agenda_calendars c WHERE c."DepartmentId" = sector."Id");

                INSERT INTO user_agenda_calendar_accesses ("UserId", "CalendarId", "CreatedAt")
                SELECT DISTINCT access."UserId", calendar."Id", now()
                FROM (
                    SELECT primary_sector."UserId", primary_sector."DepartmentId" FROM (
                        SELECT DISTINCT ON ("UserId") "UserId", "DepartmentId" FROM user_departments
                        ORDER BY "UserId", "IsPrimary" DESC, "DepartmentId"
                    ) primary_sector
                    UNION SELECT "UserId", "DepartmentId" FROM user_agenda_department_accesses
                ) access JOIN agenda_calendars calendar ON calendar."DepartmentId" = access."DepartmentId"
                ON CONFLICT DO NOTHING;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "user_agenda_calendar_accesses");
        }
    }
}
