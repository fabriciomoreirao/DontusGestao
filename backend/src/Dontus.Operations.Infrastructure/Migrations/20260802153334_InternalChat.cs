using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Dontus.Operations.Infrastructure.Migrations
{
    public partial class InternalChat : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "internal_chat_rooms",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    IsGroup = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    LastMessageAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_internal_chat_rooms", x => x.Id);
                    table.ForeignKey(
                        name: "FK_internal_chat_rooms_users_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "internal_chat_messages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RoomId = table.Column<Guid>(type: "uuid", nullable: false),
                    SenderUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Body = table.Column<string>(type: "text", nullable: false),
                    FileName = table.Column<string>(type: "character varying(260)", maxLength: 260, nullable: false),
                    ContentType = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    StorageKey = table.Column<string>(type: "character varying(600)", maxLength: 600, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_internal_chat_messages", x => x.Id);
                    table.ForeignKey(name: "FK_internal_chat_messages_internal_chat_rooms_RoomId", column: x => x.RoomId, principalTable: "internal_chat_rooms", principalColumn: "Id", onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(name: "FK_internal_chat_messages_users_SenderUserId", column: x => x.SenderUserId, principalTable: "users", principalColumn: "Id", onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "internal_chat_room_members",
                columns: table => new
                {
                    RoomId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsAdmin = table.Column<bool>(type: "boolean", nullable: false),
                    JoinedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_internal_chat_room_members", x => new { x.RoomId, x.UserId });
                    table.ForeignKey(name: "FK_internal_chat_room_members_internal_chat_rooms_RoomId", column: x => x.RoomId, principalTable: "internal_chat_rooms", principalColumn: "Id", onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(name: "FK_internal_chat_room_members_users_UserId", column: x => x.UserId, principalTable: "users", principalColumn: "Id", onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(name: "IX_internal_chat_rooms_CreatedByUserId", table: "internal_chat_rooms", column: "CreatedByUserId");
            migrationBuilder.CreateIndex(name: "IX_internal_chat_rooms_LastMessageAt", table: "internal_chat_rooms", column: "LastMessageAt");
            migrationBuilder.CreateIndex(name: "IX_internal_chat_messages_RoomId_CreatedAt", table: "internal_chat_messages", columns: new[] { "RoomId", "CreatedAt" });
            migrationBuilder.CreateIndex(name: "IX_internal_chat_messages_SenderUserId", table: "internal_chat_messages", column: "SenderUserId");
            migrationBuilder.CreateIndex(name: "IX_internal_chat_room_members_UserId_RoomId", table: "internal_chat_room_members", columns: new[] { "UserId", "RoomId" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "internal_chat_messages");
            migrationBuilder.DropTable(name: "internal_chat_room_members");
            migrationBuilder.DropTable(name: "internal_chat_rooms");
        }
    }
}
