using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Dontus.Operations.Infrastructure.Migrations;

[DbContext(typeof(OperationsDbContext))]
[Migration("20261111120000_CommercialCommissionWinDates")]
public sealed class CommercialCommissionWinDates : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        WITH details AS (
          SELECT "Id", CASE WHEN pg_input_is_valid("Description", 'jsonb') THEN "Description"::jsonb ELSE '{}'::jsonb END AS payload
          FROM work_items WHERE "Module" = 'commercial' AND "RecordType" !~* 'reten|qualifica|configura'
        ), funnels AS (
          SELECT "Name", CASE WHEN pg_input_is_valid("Description", 'jsonb') THEN "Description"::jsonb ELSE '{}'::jsonb END AS payload
          FROM customer_catalog_options WHERE "Catalog" = 'funnelStage'
        )
        UPDATE work_items AS item
        SET "Description" = jsonb_set(details.payload, '{wonAt}', to_jsonb(COALESCE(
          (SELECT to_char(max(a."CreatedAt") AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') FROM audit_events a WHERE a."Action" = 'SaleWon' AND a."ResourceId" = item."Id"::text),
          NULLIF(details.payload->>'closedAt', ''), NULLIF(details.payload->>'saleDate', ''),
          (SELECT to_char(max(a."CreatedAt") AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') FROM activities a WHERE a."EntityId" = item."Id" AND a."Kind" = 'Status alterado' AND a."Summary" ~* '→.*(ganho|vendid|fechad|contrat|conclu)'),
          to_char(item."UpdatedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))))::text,
          "Version" = item."Version" + 1
        FROM details
        WHERE item."Id" = details."Id" AND jsonb_typeof(details.payload) = 'object'
          AND COALESCE(details.payload->>'kind','') <> 'directSale'
          AND COALESCE(details.payload->>'wonAt','') = ''
          AND COALESCE(details.payload->>'flow', details.payload->>'crmFlow','') !~* 'reten|qualifica'
          AND (
            COALESCE(NULLIF(details.payload->>'stage',''), item."Status") ~* 'ganho|vendid|fechad|contrat|conclu'
            OR EXISTS (
              SELECT 1 FROM funnels f
              WHERE f."Name" = details.payload->>'funnel'
                AND COALESCE(f.payload->>'f','c') NOT IN ('q','r')
                AND COALESCE(f.payload->>'functionality','') !~* 'reten|qualifica'
                AND (
                  EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(f.payload->'s')='array' THEN f.payload->'s' ELSE '[]'::jsonb END) s
                    WHERE s->>0 = COALESCE(NULLIF(details.payload->>'stage',''), item."Status") AND s->>2 IN ('1','true'))
                  OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(f.payload->'stages')='array' THEN f.payload->'stages' ELSE '[]'::jsonb END) s
                    WHERE s->>'name' = COALESCE(NULLIF(details.payload->>'stage',''), item."Status") AND s->>'won'='true')
                )
            )
          );
        """);

    protected override void Down(MigrationBuilder migrationBuilder) { /* Preserve recovered business dates. */ }
}
