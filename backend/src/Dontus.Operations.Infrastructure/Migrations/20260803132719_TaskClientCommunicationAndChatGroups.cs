using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class TaskClientCommunicationAndChatGroups : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "CommentId",
                table: "task_attachments",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "CancellationRequest",
                table: "corporate_tasks",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ClientNotificationRequestedAt",
                table: "corporate_tasks",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ClientNotificationState",
                table: "corporate_tasks",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "Pendente");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ClientNotifiedAt",
                table: "corporate_tasks",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ClientNotifiedByUserId",
                table: "corporate_tasks",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ClientWhatsApp",
                table: "corporate_tasks",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "GroupName",
                table: "chat_conversations",
                type: "character varying(180)",
                maxLength: 180,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "GroupParticipantsJson",
                table: "chat_conversations",
                type: "jsonb",
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.AddColumn<bool>(
                name: "IsGroup",
                table: "chat_conversations",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_task_attachments_CommentId",
                table: "task_attachments",
                column: "CommentId");

            migrationBuilder.AddForeignKey(
                name: "FK_task_attachments_task_comments_CommentId",
                table: "task_attachments",
                column: "CommentId",
                principalTable: "task_comments",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_task_attachments_task_comments_CommentId",
                table: "task_attachments");

            migrationBuilder.DropIndex(
                name: "IX_task_attachments_CommentId",
                table: "task_attachments");

            migrationBuilder.DropColumn(
                name: "CommentId",
                table: "task_attachments");

            migrationBuilder.DropColumn(
                name: "CancellationRequest",
                table: "corporate_tasks");

            migrationBuilder.DropColumn(
                name: "ClientNotificationRequestedAt",
                table: "corporate_tasks");

            migrationBuilder.DropColumn(
                name: "ClientNotificationState",
                table: "corporate_tasks");

            migrationBuilder.DropColumn(
                name: "ClientNotifiedAt",
                table: "corporate_tasks");

            migrationBuilder.DropColumn(
                name: "ClientNotifiedByUserId",
                table: "corporate_tasks");

            migrationBuilder.DropColumn(
                name: "ClientWhatsApp",
                table: "corporate_tasks");

            migrationBuilder.DropColumn(
                name: "GroupName",
                table: "chat_conversations");

            migrationBuilder.DropColumn(
                name: "GroupParticipantsJson",
                table: "chat_conversations");

            migrationBuilder.DropColumn(
                name: "IsGroup",
                table: "chat_conversations");
        }
    }
}
