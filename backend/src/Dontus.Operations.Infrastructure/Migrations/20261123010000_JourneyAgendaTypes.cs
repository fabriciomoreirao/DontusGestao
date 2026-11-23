using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Dontus.Operations.Infrastructure.Migrations;

[DbContext(typeof(OperationsDbContext))]
[Migration("20261123010000_JourneyAgendaTypes")]
public sealed class JourneyAgendaTypes : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        INSERT INTO agenda_types ("Id", "Name", "Description", "Color", "Active", "CreatedAt", "UpdatedAt", "Version")
        SELECT 'f6fce32b-e30f-4a61-922e-e0990fb40d13'::uuid, 'Reunião',
            'Reuniões agendadas na etapa de acompanhamento.', '#2563eb', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1
        WHERE NOT EXISTS (SELECT 1 FROM agenda_types WHERE lower(btrim("Name")) IN ('reunião', 'reuniao'));

        INSERT INTO agenda_types ("Id", "Name", "Description", "Color", "Active", "CreatedAt", "UpdatedAt", "Version")
        SELECT '17da2d84-7756-4518-9b17-c52d4b54beb4'::uuid, 'Treinamento',
            'Treinamentos agendados na etapa de onboarding.', '#7c3aed', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1
        WHERE NOT EXISTS (SELECT 1 FROM agenda_types WHERE lower(btrim("Name")) = 'treinamento');
        """);

    // Catalog records can already be referenced by commitments; keep their history on rollback.
    protected override void Down(MigrationBuilder migrationBuilder) { }
}
