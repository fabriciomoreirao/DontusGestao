using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class CancellationAnnualProtocols : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "cancellation_protocol_counters",
                columns: table => new
                {
                    Year = table.Column<int>(type: "integer", nullable: false),
                    LastNumber = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_cancellation_protocol_counters", x => x.Year);
                });

            // Number existing requests in creation order, preserving any protocol already assigned.
            // Invalid or unrelated descriptions are left untouched.
            migrationBuilder.Sql("""
                WITH parsed AS MATERIALIZED (
                    SELECT "Id", "CreatedAt",
                        EXTRACT(YEAR FROM "CreatedAt" AT TIME ZONE 'America/Sao_Paulo')::integer AS year,
                        CASE WHEN pg_input_is_valid("Description", 'jsonb')
                            THEN "Description"::jsonb ELSE '{}'::jsonb END AS detail
                    FROM work_items WHERE "Module" = 'cancellations'
                ), cancellations AS MATERIALIZED (
                    SELECT * FROM parsed WHERE detail->>'kind' = 'cancellationJourney'
                ), existing AS (
                    SELECT year, MAX(SUBSTRING(detail->>'protocol' FROM 4)::bigint) AS last_number
                    FROM cancellations
                    WHERE detail->>'protocol' ~ ('^C' || LPAD((year % 100)::text, 2, '0') || '[0-9]{4,18}$')
                    GROUP BY year
                ), missing AS (
                    SELECT c.*, COALESCE(e.last_number, 0) +
                        ROW_NUMBER() OVER (PARTITION BY c.year ORDER BY c."CreatedAt", c."Id") AS number
                    FROM cancellations c LEFT JOIN existing e USING (year)
                    WHERE COALESCE(c.detail->>'protocol', '') = ''
                )
                UPDATE work_items w SET "Description" = jsonb_set(m.detail, '{protocol}',
                    to_jsonb('C' || LPAD((m.year % 100)::text, 2, '0') ||
                        LPAD(m.number::text, GREATEST(4, LENGTH(m.number::text)), '0')))::text
                FROM missing m WHERE w."Id" = m."Id";

                WITH parsed AS MATERIALIZED (
                    SELECT EXTRACT(YEAR FROM "CreatedAt" AT TIME ZONE 'America/Sao_Paulo')::integer AS year,
                        CASE WHEN pg_input_is_valid("Description", 'jsonb')
                            THEN "Description"::jsonb ELSE '{}'::jsonb END AS detail
                    FROM work_items WHERE "Module" = 'cancellations'
                )
                INSERT INTO cancellation_protocol_counters ("Year", "LastNumber")
                    SELECT year, MAX(SUBSTRING(detail->>'protocol' FROM 4)::bigint)
                    FROM parsed WHERE detail->>'kind' = 'cancellationJourney'
                        AND detail->>'protocol' ~ ('^C' || LPAD((year % 100)::text, 2, '0') || '[0-9]{4,18}$')
                    GROUP BY year;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "cancellation_protocol_counters");
        }
    }
}
