using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Dontus.Operations.Infrastructure.Migrations;

/// <summary>
/// Índice para os avisos de WhatsApp: /api/whatsapp/notifications busca mensagens por UpdatedAt a cada 15 s
/// por usuário, e sem índice o PostgreSQL lia a tabela chat_messages inteira em cada chamada.
/// CONCURRENTLY constrói o índice sem bloquear a gravação de mensagens (webhooks continuam chegando);
/// por isso roda fora da transação da migration.
/// </summary>
[DbContext(typeof(OperationsDbContext))]
[Migration("20261123020000_ChatMessagesUpdatedAtIndex")]
public sealed class ChatMessagesUpdatedAtIndex : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Uma tentativa anterior interrompida deixa o índice inválido; remove antes de recriar.
        migrationBuilder.Sql("""
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
                           WHERE c.relname = 'IX_chat_messages_UpdatedAt_Id' AND NOT i.indisvalid) THEN
                    DROP INDEX "IX_chat_messages_UpdatedAt_Id";
                END IF;
            END $$;
            """, suppressTransaction: true);
        migrationBuilder.Sql("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS "IX_chat_messages_UpdatedAt_Id"
                ON chat_messages ("UpdatedAt", "Id");
            """, suppressTransaction: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.Sql("""DROP INDEX CONCURRENTLY IF EXISTS "IX_chat_messages_UpdatedAt_Id";""", suppressTransaction: true);
}
