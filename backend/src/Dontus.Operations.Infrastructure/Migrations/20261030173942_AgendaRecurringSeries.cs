using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AgendaRecurringSeries : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "RecurrenceGroupId",
                table: "agenda_commitments",
                type: "uuid",
                nullable: true);

            // Legacy month repetitions had no series identifier. Recognize only consecutive
            // occurrences through month-end with identical details, created together within five seconds.
            // Ambiguous or separately-created appointments remain individual records.
            migrationBuilder.Sql("""
                WITH normalized AS (
                    SELECT *, ("StartsAt" AT TIME ZONE 'America/Sao_Paulo')::date AS local_date,
                        ("StartsAt" AT TIME ZONE 'America/Sao_Paulo')::time AS local_time,
                        date_trunc('month', "StartsAt" AT TIME ZONE 'America/Sao_Paulo')::date AS local_month,
                        "EndsAt" - "StartsAt" AS duration
                    FROM agenda_commitments WHERE "RecurrenceGroupId" IS NULL
                ), marked AS (
                    SELECT *, CASE WHEN "CreatedAt" - lag("CreatedAt") OVER batch <= interval '5 seconds' THEN 0 ELSE 1 END AS new_batch
                    FROM normalized
                    WINDOW batch AS (PARTITION BY "CreatedBy", "AgendaId", "AgendaTypeId", "ResponsibleUserId", "Title", "Description", local_month, local_time, duration ORDER BY "CreatedAt", "Id")
                ), numbered AS (
                    SELECT *, sum(new_batch) OVER batch AS batch_number
                    FROM marked
                    WINDOW batch AS (PARTITION BY "CreatedBy", "AgendaId", "AgendaTypeId", "ResponsibleUserId", "Title", "Description", local_month, local_time, duration ORDER BY "CreatedAt", "Id")
                ), monthly_batches AS (
                    SELECT array_agg("Id" ORDER BY "CreatedAt", "Id") AS ids
                    FROM numbered
                    GROUP BY "CreatedBy", "AgendaId", "AgendaTypeId", "ResponsibleUserId", "Title", "Description", local_month, local_time, duration, batch_number
                    HAVING count(*) > 1 AND count(DISTINCT local_date) = count(*)
                        AND max("CreatedAt") - min("CreatedAt") <= interval '5 seconds'
                        AND max(local_date) = (local_month + interval '1 month' - interval '1 day')::date
                        AND min(local_date) + (count(*)::int - 1) = max(local_date)
                )
                UPDATE agenda_commitments AS entry SET "RecurrenceGroupId" = batch.ids[1]
                FROM monthly_batches AS batch WHERE entry."Id" = ANY(batch.ids);
                """);

            migrationBuilder.CreateIndex(
                name: "IX_agenda_commitments_RecurrenceGroupId",
                table: "agenda_commitments",
                column: "RecurrenceGroupId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_agenda_commitments_RecurrenceGroupId",
                table: "agenda_commitments");

            migrationBuilder.DropColumn(
                name: "RecurrenceGroupId",
                table: "agenda_commitments");
        }
    }
}
