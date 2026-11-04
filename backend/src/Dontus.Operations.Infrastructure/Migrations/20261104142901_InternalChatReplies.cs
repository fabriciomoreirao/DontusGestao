using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InternalChatReplies : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ReplyToMessageId",
                table: "internal_chat_messages",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_internal_chat_messages_ReplyToMessageId",
                table: "internal_chat_messages",
                column: "ReplyToMessageId");

            migrationBuilder.AddForeignKey(
                name: "FK_internal_chat_messages_internal_chat_messages_ReplyToMessag~",
                table: "internal_chat_messages",
                column: "ReplyToMessageId",
                principalTable: "internal_chat_messages",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_internal_chat_messages_internal_chat_messages_ReplyToMessag~",
                table: "internal_chat_messages");

            migrationBuilder.DropIndex(
                name: "IX_internal_chat_messages_ReplyToMessageId",
                table: "internal_chat_messages");

            migrationBuilder.DropColumn(
                name: "ReplyToMessageId",
                table: "internal_chat_messages");
        }
    }
}
