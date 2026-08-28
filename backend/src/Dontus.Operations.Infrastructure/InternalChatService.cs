using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Dontus.Operations.Infrastructure;

public sealed class InternalChatService(
    OperationsDbContext db,
    IConfiguration configuration) : IInternalChatService
{
    private const long MaxAttachmentBytes = 50 * 1024 * 1024;
    private readonly string filesRoot = Path.GetFullPath(configuration["InternalChat:FilesPath"]
        ?? Path.Combine(AppContext.BaseDirectory, "internal-chat-files"));

    public async Task<InternalChatModuleDto> GetModuleAsync(ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("internalChat", "view");
        var actorUser = await GetActorUserAsync(actor, cancellationToken);
        var users = await db.Users.AsNoTracking()
            .Where(user => user.Active)
            .OrderBy(user => user.DisplayName)
            .ToDictionaryAsync(user => user.Id, cancellationToken);
        var roomIds = await db.InternalChatRoomMembers.AsNoTracking()
            .Where(member => member.UserId == actorUser.Id)
            .Select(member => member.RoomId)
            .ToArrayAsync(cancellationToken);
        var rooms = await db.InternalChatRooms.AsNoTracking()
            .Where(room => roomIds.Contains(room.Id))
            .OrderByDescending(room => room.LastMessageAt)
            .ToListAsync(cancellationToken);
        var members = await db.InternalChatRoomMembers.AsNoTracking()
            .Where(member => roomIds.Contains(member.RoomId))
            .ToListAsync(cancellationToken);
        var messages = await db.InternalChatMessages.AsNoTracking()
            .Where(message => roomIds.Contains(message.RoomId))
            .OrderByDescending(message => message.CreatedAt)
            .Take(2000)
            .ToListAsync(cancellationToken);

        var roomDtos = rooms.Select(room =>
        {
            var roomMembers = members.Where(member => member.RoomId == room.Id).ToArray();
            var actorMembership = roomMembers.Single(member => member.UserId == actorUser.Id);
            var directPartner = roomMembers
                .Where(member => member.UserId != actorUser.Id)
                .Select(member => users.GetValueOrDefault(member.UserId))
                .FirstOrDefault(user => user is not null);
            var displayName = room.IsGroup
                ? room.Name
                : directPartner?.DisplayName ?? "Conversa privada";
            var displayPhoto = room.IsGroup ? room.PhotoDataUrl : directPartner?.PhotoDataUrl ?? "";
            var roomMessages = messages.Where(message => message.RoomId == room.Id)
                .OrderBy(message => message.CreatedAt)
                .Select(message =>
                {
                    var sender = users.GetValueOrDefault(message.SenderUserId);
                    return new InternalChatMessageDto(
                        message.Id, message.RoomId, message.SenderUserId,
                        sender?.DisplayName ?? "Colaborador removido", sender?.PhotoDataUrl ?? "",
                        sender?.IsCoordinator ?? false,
                        message.Type, message.Body, message.FileName, message.ContentType,
                        !string.IsNullOrWhiteSpace(message.StorageKey), message.CreatedAt);
                }).ToArray();
            return new InternalChatRoomDto(
                room.Id, displayName, displayPhoto, room.IsGroup, room.CreatedByUserId,
                room.CreatedByUserId == actorUser.Id || roomMembers.Any(member => member.UserId == actorUser.Id && member.IsAdmin),
                actorMembership.ArchivedAt.HasValue,
                roomMessages.Count(message => message.SenderUserId != actorUser.Id &&
                    message.CreatedAt > (actorMembership.LastReadAt ?? actorMembership.JoinedAt)),
                room.LastMessageAt, roomMembers.Select(member => member.UserId).ToArray(), roomMessages);
        }).ToArray();

        return new InternalChatModuleDto(
            actorUser.Id,
            users.Values.Select(user => new InternalChatUserDto(
                user.Id, user.DisplayName, user.Email, user.Department, user.PhotoDataUrl,
                user.JobTitle, user.IsCoordinator)).ToArray(),
            roomDtos);
    }

    public async Task<Guid> CreateRoomAsync(CreateInternalChatRoomCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("internalChat", "create");
        var actorUser = await GetActorUserAsync(actor, cancellationToken);
        var selectedIds = (command.MemberUserIds ?? [])
            .Where(id => id != actorUser.Id)
            .Distinct()
            .ToArray();
        if (command.IsGroup && selectedIds.Length < 1)
            throw new DomainException("Selecione ao menos um colaborador para o grupo.");
        if (!command.IsGroup && selectedIds.Length != 1)
            throw new DomainException("Selecione um colaborador para iniciar a conversa privada.");
        var validMemberIds = await db.Users.AsNoTracking()
            .Where(user => user.Active && selectedIds.Contains(user.Id))
            .Select(user => user.Id)
            .ToArrayAsync(cancellationToken);
        if (validMemberIds.Length != selectedIds.Length)
            throw new DomainException("Um ou mais colaboradores selecionados não estão disponíveis.");

        if (!command.IsGroup)
        {
            var targetId = validMemberIds[0];
            var existingRoomId = await db.InternalChatRooms.AsNoTracking()
                .Where(room => !room.IsGroup)
                .Where(room => db.InternalChatRoomMembers.Count(member => member.RoomId == room.Id) == 2)
                .Where(room => db.InternalChatRoomMembers.Any(member => member.RoomId == room.Id && member.UserId == actorUser.Id))
                .Where(room => db.InternalChatRoomMembers.Any(member => member.RoomId == room.Id && member.UserId == targetId))
                .Select(room => room.Id)
                .FirstOrDefaultAsync(cancellationToken);
            if (existingRoomId != Guid.Empty) return existingRoomId;
        }

        var name = command.IsGroup ? (command.Name ?? "").Trim() : "";
        if (command.IsGroup && (name.Length < 2 || name.Length > 120))
            throw new DomainException("Informe um nome de grupo entre 2 e 120 caracteres.");
        var room = new InternalChatRoom
        {
            Name = name,
            PhotoDataUrl = command.IsGroup ? NormalizePhoto(command.PhotoDataUrl) : "",
            IsGroup = command.IsGroup,
            CreatedByUserId = actorUser.Id,
        };
        db.InternalChatRooms.Add(room);
        db.InternalChatRoomMembers.Add(new InternalChatRoomMember
        {
            RoomId = room.Id,
            UserId = actorUser.Id,
            IsAdmin = true,
            LastReadAt = DateTimeOffset.UtcNow,
        });
        db.InternalChatRoomMembers.AddRange(validMemberIds.Select(userId => new InternalChatRoomMember
        {
            RoomId = room.Id,
            UserId = userId,
        }));
        AddAudit(actor, "Create", "internal_chat_room", room.Id.ToString(), new { room.IsGroup, MemberCount = validMemberIds.Length + 1 });
        await db.SaveChangesAsync(cancellationToken);
        return room.Id;
    }

    public async Task<Guid> SendMessageAsync(SendInternalChatMessageCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("internalChat", "create");
        var actorUser = await GetActorUserAsync(actor, cancellationToken);
        var room = await GetMemberRoomAsync(command.RoomId, actorUser.Id, cancellationToken);
        var type = (command.Type ?? "text").Trim().ToLowerInvariant();
        if (type is not ("text" or "sticker"))
            throw new DomainException("Tipo de mensagem inválido.");
        var body = (command.Body ?? "").Trim();
        var maxLength = type == "sticker" ? 32 : 4000;
        if (body.Length == 0 || body.Length > maxLength)
            throw new DomainException(type == "sticker" ? "Selecione uma figurinha válida." : "Digite uma mensagem de até 4.000 caracteres.");
        var message = new InternalChatMessage
        {
            RoomId = room.Id,
            SenderUserId = actorUser.Id,
            Type = type,
            Body = body,
        };
        room.LastMessageAt = message.CreatedAt;
        room.UpdatedAt = DateTimeOffset.UtcNow;
        var memberships = await db.InternalChatRoomMembers
            .Where(member => member.RoomId == room.Id)
            .ToListAsync(cancellationToken);
        foreach (var membership in memberships)
        {
            membership.ArchivedAt = null;
            if (membership.UserId == actorUser.Id) membership.LastReadAt = message.CreatedAt;
        }
        db.InternalChatMessages.Add(message);
        await db.SaveChangesAsync(cancellationToken);
        return message.Id;
    }

    public async Task<Guid> UploadAttachmentAsync(UploadInternalChatAttachmentCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("internalChat", "create");
        var actorUser = await GetActorUserAsync(actor, cancellationToken);
        var room = await GetMemberRoomAsync(command.RoomId, actorUser.Id, cancellationToken);
        if (command.SizeBytes <= 0 || command.SizeBytes > MaxAttachmentBytes)
            throw new DomainException("Envie um arquivo de até 50 MB.");
        var contentType = (command.ContentType ?? "application/octet-stream").Trim().ToLowerInvariant();
        if (!IsAllowedContentType(contentType))
            throw new DomainException("Este tipo de arquivo não é permitido no chat.");
        var fileName = Path.GetFileName(command.FileName ?? "arquivo").Trim();
        if (string.IsNullOrWhiteSpace(fileName)) fileName = "arquivo";
        if (fileName.Length > 240) fileName = fileName[..240];
        var extension = Path.GetExtension(fileName);
        if (extension.Length > 10 || extension.Skip(1).Any(character => !char.IsLetterOrDigit(character))) extension = "";
        var storageKey = $"{room.Id:N}/{Guid.NewGuid():N}{extension.ToLowerInvariant()}";
        var fullPath = ResolveStoragePath(storageKey);
        Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);
        await using (var target = new FileStream(fullPath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, true))
            await command.Content.CopyToAsync(target, cancellationToken);

        var type = contentType.StartsWith("image/", StringComparison.Ordinal) ? "image"
            : contentType.StartsWith("video/", StringComparison.Ordinal) ? "video"
            : "file";
        var message = new InternalChatMessage
        {
            RoomId = room.Id,
            SenderUserId = actorUser.Id,
            Type = type,
            Body = "",
            FileName = fileName,
            ContentType = contentType,
            StorageKey = storageKey,
        };
        room.LastMessageAt = message.CreatedAt;
        room.UpdatedAt = DateTimeOffset.UtcNow;
        var memberships = await db.InternalChatRoomMembers
            .Where(member => member.RoomId == room.Id)
            .ToListAsync(cancellationToken);
        foreach (var membership in memberships)
        {
            membership.ArchivedAt = null;
            if (membership.UserId == actorUser.Id) membership.LastReadAt = message.CreatedAt;
        }
        db.InternalChatMessages.Add(message);
        AddAudit(actor, "Upload", "internal_chat_attachment", message.Id.ToString(), new { room.Id, ContentType = contentType, command.SizeBytes });
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch
        {
            File.Delete(fullPath);
            throw;
        }
        return message.Id;
    }

    public async Task SetArchivedAsync(SetInternalChatRoomArchivedCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("internalChat", "edit");
        var actorUser = await GetActorUserAsync(actor, cancellationToken);
        var membership = await db.InternalChatRoomMembers
            .SingleOrDefaultAsync(member => member.RoomId == command.RoomId && member.UserId == actorUser.Id, cancellationToken)
            ?? throw new DomainException("Você não participa desta conversa.", 403);
        membership.ArchivedAt = command.Archived ? DateTimeOffset.UtcNow : null;
        if (command.Archived) membership.LastReadAt = DateTimeOffset.UtcNow;
        AddAudit(actor, command.Archived ? "Archive" : "Unarchive", "internal_chat_room", command.RoomId.ToString(), new { });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task MarkReadAsync(MarkInternalChatRoomReadCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("internalChat", "view");
        var actorUser = await GetActorUserAsync(actor, cancellationToken);
        var membership = await db.InternalChatRoomMembers
            .SingleOrDefaultAsync(member => member.RoomId == command.RoomId && member.UserId == actorUser.Id, cancellationToken)
            ?? throw new DomainException("Você não participa desta conversa.", 403);
        membership.LastReadAt = DateTimeOffset.UtcNow;
        membership.ArchivedAt = null;
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task UpdateGroupAsync(UpdateInternalChatGroupCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("internalChat", "edit");
        var actorUser = await GetActorUserAsync(actor, cancellationToken);
        var room = await db.InternalChatRooms.SingleOrDefaultAsync(entry => entry.Id == command.RoomId, cancellationToken)
            ?? throw new DomainException("Grupo não encontrado.", 404);
        if (!room.IsGroup) throw new DomainException("Somente grupos possuem perfil editável.");
        var membership = await db.InternalChatRoomMembers.AsNoTracking()
            .SingleOrDefaultAsync(member => member.RoomId == room.Id && member.UserId == actorUser.Id, cancellationToken)
            ?? throw new DomainException("Você não participa deste grupo.", 403);
        if (!membership.IsAdmin && room.CreatedByUserId != actorUser.Id)
            throw new DomainException("Somente administradores podem alterar o perfil do grupo.", 403);
        if (command.Name is not null)
        {
            var name = command.Name.Trim();
            if (name.Length < 2 || name.Length > 120)
                throw new DomainException("Informe um nome de grupo entre 2 e 120 caracteres.");
            room.Name = name;
        }
        if (command.PhotoDataUrl is not null) room.PhotoDataUrl = NormalizePhoto(command.PhotoDataUrl);
        room.UpdatedAt = DateTimeOffset.UtcNow;
        AddAudit(actor, "Update", "internal_chat_group", room.Id.ToString(), new { room.Name, HasPhoto = room.PhotoDataUrl.Length > 0 });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<InternalChatAttachmentDto> GetAttachmentAsync(Guid messageId, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("internalChat", "view");
        var actorUser = await GetActorUserAsync(actor, cancellationToken);
        var message = await db.InternalChatMessages.AsNoTracking()
            .SingleOrDefaultAsync(entry => entry.Id == messageId, cancellationToken)
            ?? throw new DomainException("Arquivo não encontrado.", 404);
        if (!await db.InternalChatRoomMembers.AsNoTracking().AnyAsync(member => member.RoomId == message.RoomId && member.UserId == actorUser.Id, cancellationToken))
            throw new DomainException("Você não participa desta conversa.", 403);
        if (string.IsNullOrWhiteSpace(message.StorageKey))
            throw new DomainException("A mensagem não possui arquivo.", 404);
        var fullPath = ResolveStoragePath(message.StorageKey);
        if (!File.Exists(fullPath)) throw new DomainException("O arquivo não está mais disponível.", 404);
        return new InternalChatAttachmentDto(fullPath, message.FileName, message.ContentType);
    }

    private async Task<AppUser> GetActorUserAsync(ActorContext actor, CancellationToken cancellationToken) =>
        await db.Users.SingleOrDefaultAsync(user => user.Active && user.Email == actor.Email, cancellationToken)
        ?? throw new DomainException("Colaborador não encontrado ou inativo.", 404);

    private async Task<InternalChatRoom> GetMemberRoomAsync(Guid roomId, Guid userId, CancellationToken cancellationToken)
    {
        if (!await db.InternalChatRoomMembers.AsNoTracking().AnyAsync(member => member.RoomId == roomId && member.UserId == userId, cancellationToken))
            throw new DomainException("Você não participa desta conversa.", 403);
        return await db.InternalChatRooms.SingleOrDefaultAsync(room => room.Id == roomId, cancellationToken)
            ?? throw new DomainException("Conversa não encontrada.", 404);
    }

    private string ResolveStoragePath(string storageKey)
    {
        var normalized = storageKey.Replace('/', Path.DirectorySeparatorChar);
        var fullPath = Path.GetFullPath(Path.Combine(filesRoot, normalized));
        if (!fullPath.StartsWith(filesRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new DomainException("Caminho de arquivo inválido.", 400);
        return fullPath;
    }

    private static bool IsAllowedContentType(string contentType) =>
        contentType.StartsWith("image/", StringComparison.Ordinal) ||
        contentType.StartsWith("video/", StringComparison.Ordinal) ||
        contentType is "application/pdf" or "text/plain" or "application/zip" or
            "application/msword" or "application/vnd.openxmlformats-officedocument.wordprocessingml.document" or
            "application/vnd.ms-excel" or "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    private static string NormalizePhoto(string? value)
    {
        var photo = value?.Trim() ?? "";
        if (photo.Length == 0) return "";
        if (photo.Length > 3_000_000 ||
            !(photo.StartsWith("data:image/png;base64,", StringComparison.OrdinalIgnoreCase) ||
              photo.StartsWith("data:image/jpeg;base64,", StringComparison.OrdinalIgnoreCase) ||
              photo.StartsWith("data:image/webp;base64,", StringComparison.OrdinalIgnoreCase) ||
              photo.StartsWith("data:image/gif;base64,", StringComparison.OrdinalIgnoreCase)))
            throw new DomainException("Envie uma imagem PNG, JPG, WEBP ou GIF de até 2 MB.");
        return photo;
    }

    private void AddAudit(ActorContext actor, string action, string resource, string resourceId, object details) =>
        db.AuditEvents.Add(new AuditEvent
        {
            ActorEmail = actor.Email,
            Action = action,
            Resource = resource,
            ResourceId = resourceId,
            Module = "internalChat",
            DetailsJson = JsonSerializer.Serialize(details),
        });
}
