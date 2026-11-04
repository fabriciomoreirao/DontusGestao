using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Dontus.Operations.Infrastructure;

public sealed class InternalChatService(
    OperationsDbContext db,
    IConfiguration configuration, RealtimeBroker? realtime = null) : IInternalChatService
{
    private sealed record PollOption(string Text, List<Guid> VoterUserIds);
    private sealed record PollPayload(string Question, List<PollOption> Options);
    private sealed record PinPayload(Guid MessageId, bool Pinned);
    private static readonly JsonSerializerOptions ChatJsonOptions = new(JsonSerializerDefaults.Web);
    private const long MaxAttachmentBytes = 50 * 1024 * 1024;
    private readonly string filesRoot = Path.GetFullPath(configuration["InternalChat:FilesPath"]
        ?? Path.Combine(AppContext.BaseDirectory, "internal-chat-files"));

    public async Task<InternalChatModuleDto> GetModuleAsync(ActorContext actor, CancellationToken cancellationToken = default, int historyDays = 30)
    {
        actor.RequirePermission("internalChat", "view");
        var actorUser = await GetActorUserAsync(actor, cancellationToken);
        var users = await db.Users.AsNoTracking()
            .Where(user => user.Active && user.BlockedAt == null)
            .OrderBy(user => user.DisplayName)
            .Select(user => new { user.Id, user.DisplayName, user.Email, user.Department, user.JobTitle,
                user.IsCoordinator, user.UpdatedAt, HasPhoto = user.PhotoDataUrl != "" })
            .ToDictionaryAsync(user => user.Id, cancellationToken);
        var userPhotos = users.ToDictionary(entry => entry.Key,
            entry => ProfilePhotoUrls.For(entry.Key, entry.Value.UpdatedAt, entry.Value.HasPhoto));
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
        var historySince = DateTimeOffset.UtcNow.AddDays(-Math.Clamp(historyDays, 30, 36500));
        var messages = await db.InternalChatMessages.AsNoTracking()
            .Where(message => roomIds.Contains(message.RoomId) && (message.CreatedAt >= historySince || message.UpdatedAt >= historySince || message.EditedAt >= historySince || message.DeletedAt >= historySince || message.Type == "pin"
                || db.InternalChatMessageReceipts.Any(receipt => receipt.MessageId == message.Id && receipt.ReadAt >= historySince)))
            .OrderByDescending(message => message.CreatedAt)
            .ToListAsync(cancellationToken);

        // Unread state must include messages older than the loaded history window.
        var unreadByRoom = await (from message in db.InternalChatMessages.AsNoTracking()
            join member in db.InternalChatRoomMembers.AsNoTracking() on message.RoomId equals member.RoomId
            where member.UserId == actorUser.Id && message.SenderUserId != actorUser.Id
                && message.Type != "pin" && message.DeletedAt == null && message.CreatedAt >= member.JoinedAt
                && message.CreatedAt > (member.LastReadAt ?? member.JoinedAt)
            group message by message.RoomId into roomMessages
            select new { RoomId = roomMessages.Key, Count = roomMessages.Count() })
            .ToDictionaryAsync(entry => entry.RoomId, entry => entry.Count, cancellationToken);
        var membersByRoom = members.ToLookup(member => member.RoomId);
        var messagesByRoom = messages.ToLookup(message => message.RoomId);
        var messageIds = messages.Select(message => message.Id).ToArray();
        var replyIds = messages.Where(message => message.ReplyToMessageId.HasValue).Select(message => message.ReplyToMessageId!.Value).Distinct().ToArray();
        var replyMessages = await db.InternalChatMessages.AsNoTracking()
            .Where(message => replyIds.Contains(message.Id) && roomIds.Contains(message.RoomId))
            .ToDictionaryAsync(message => message.Id, cancellationToken);
        var receiptsByMessage = (await db.InternalChatMessageReceipts.AsNoTracking()
            .Where(receipt => messageIds.Contains(receipt.MessageId)).ToListAsync(cancellationToken)).ToLookup(receipt => receipt.MessageId);
        var reactionsByMessage = (await db.InternalChatMessageReactions.AsNoTracking()
            .Where(reaction => messageIds.Contains(reaction.MessageId)).ToListAsync(cancellationToken)).ToLookup(reaction => reaction.MessageId);

        var roomDtos = rooms.Select(room =>
        {
            var roomMembers = membersByRoom[room.Id].ToArray();
            var actorMembership = roomMembers.Single(member => member.UserId == actorUser.Id);
            var directPartner = roomMembers
                .Where(member => member.UserId != actorUser.Id)
                .Select(member => users.GetValueOrDefault(member.UserId))
                .FirstOrDefault(user => user is not null);
            var displayName = room.IsGroup
                ? room.Name
                : directPartner?.DisplayName ?? "Conversa privada";
            var displayPhoto = room.IsGroup
                ? (string.IsNullOrEmpty(room.PhotoDataUrl) ? "" : $"/api/internal-chat-photos/room/{room.Id}?v={room.UpdatedAt.ToUnixTimeMilliseconds()}")
                : (directPartner is null ? "" : userPhotos.GetValueOrDefault(directPartner.Id, ""));
            var allRoomMessages = messagesByRoom[room.Id]
                .OrderBy(message => message.CreatedAt)
                .ToArray();
            var pinned = new Dictionary<Guid, bool>();
            foreach (var pinEvent in allRoomMessages.Where(message => message.Type == "pin"))
            {
                try
                {
                    var payload = JsonSerializer.Deserialize<PinPayload>(pinEvent.Body, ChatJsonOptions);
                    if (payload is not null) pinned[payload.MessageId] = payload.Pinned;
                }
                catch (JsonException) { }
            }
            var roomMessages = allRoomMessages.Where(message => message.Type != "pin" && message.CreatedAt >= actorMembership.JoinedAt)
                .OrderBy(message => message.CreatedAt)
                .Select(message =>
                {
                    var sender = users.GetValueOrDefault(message.SenderUserId);
                    var original = message.ReplyToMessageId.HasValue ? replyMessages.GetValueOrDefault(message.ReplyToMessageId.Value) : null;
                    var recipients = roomMembers.Where(member => member.UserId != message.SenderUserId && member.JoinedAt <= message.CreatedAt).Select(member => member.UserId).ToHashSet();
                    var reads = receiptsByMessage[message.Id].Where(receipt => recipients.Contains(receipt.UserId)).ToArray();
                    var receiptState = recipients.Count > 0 && reads.Length == recipients.Count
                        ? "seen"
                        : "delivered";
                    return new InternalChatMessageDto(
                        message.Id, message.RoomId, message.SenderUserId,
                        sender?.DisplayName ?? "Colaborador removido", userPhotos.GetValueOrDefault(message.SenderUserId, ""),
                        sender?.IsCoordinator ?? false,
                        message.DeletedAt.HasValue ? "text" : message.Type, message.DeletedAt.HasValue ? "" : message.Body, message.DeletedAt.HasValue ? "" : message.FileName, message.DeletedAt.HasValue ? "" : message.ContentType,
                        !message.DeletedAt.HasValue && !string.IsNullOrWhiteSpace(message.StorageKey), !message.DeletedAt.HasValue && pinned.GetValueOrDefault(message.Id), receiptState, message.CreatedAt, message.EditedAt, message.DeletedAt, message.Version)
                    {
                        ReplyTo = !message.DeletedAt.HasValue && original is not null && original.RoomId == room.Id && original.CreatedAt >= actorMembership.JoinedAt
                            ? new InternalChatReplyDto(original.Id, users.GetValueOrDefault(original.SenderUserId)?.DisplayName ?? "Colaborador removido",
                                original.DeletedAt.HasValue ? "text" : original.Type, original.DeletedAt.HasValue ? "" : original.Body,
                                original.DeletedAt.HasValue ? "" : original.FileName, original.DeletedAt) : null,
                        SeenAt = reads.Select(receipt => (DateTimeOffset?)receipt.ReadAt).Max(),
                        SeenByCount = reads.Length,
                        RecipientCount = recipients.Count,
                        Reactions = message.DeletedAt.HasValue ? [] : reactionsByMessage[message.Id].GroupBy(reaction => reaction.Emoji)
                            .OrderBy(group => group.Min(reaction => reaction.ReactedAt)).Select(group => new InternalChatReactionDto(group.Key, group.Count(),
                                group.Select(reaction => reaction.UserId).ToArray(), group.Select(reaction => users.GetValueOrDefault(reaction.UserId)?.DisplayName ?? "Colaborador removido").ToArray())).ToArray(),
                    };
                }).ToArray();
            return new InternalChatRoomDto(
                room.Id, displayName, displayPhoto, room.IsGroup, room.CreatedByUserId,
                room.CreatedByUserId == actorUser.Id || roomMembers.Any(member => member.UserId == actorUser.Id && member.IsAdmin),
                actorMembership.ArchivedAt.HasValue,
                unreadByRoom.GetValueOrDefault(room.Id),
                room.LastMessageAt, roomMembers.Select(member => member.UserId).ToArray(), roomMessages);
        }).ToArray();

        return new InternalChatModuleDto(
            actorUser.Id,
            users.Values.Select(user => new InternalChatUserDto(
                user.Id, user.DisplayName, user.Email, user.Department, userPhotos.GetValueOrDefault(user.Id, ""),
                user.JobTitle, user.IsCoordinator, realtime?.GetPresence(user.Id).IsOnline ?? false, realtime?.GetPresence(user.Id).LastSeenAt)).ToArray(),
            roomDtos);
    }

    public async Task<Guid> CreateRoomAsync(CreateInternalChatRoomCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("internalChat", "create");
        var actorUser = await GetActorUserAsync(actor, cancellationToken);
        if (command.IsGroup && !actorUser.IsCoordinator)
            throw new DomainException("Somente coordenadores podem criar grupos no chat interno.", 403);
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
        await ValidateReplyAsync(room.Id, actorUser.Id, command.ReplyToMessageId, cancellationToken);
        var message = new InternalChatMessage
        {
            RoomId = room.Id,
            ReplyToMessageId = command.ReplyToMessageId,
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

    private async Task<InternalChatMessage> OwnMessageAsync(Guid roomId, Guid messageId, long version, ActorContext actor, CancellationToken ct)
    {
        actor.RequirePermission("internalChat", "create");
        var user = await GetActorUserAsync(actor, ct);
        await GetMemberRoomAsync(roomId, user.Id, ct);
        var message = await db.InternalChatMessages.SingleOrDefaultAsync(entry => entry.Id == messageId && entry.RoomId == roomId, ct)
            ?? throw new DomainException("Mensagem não encontrada.", 404);
        if (message.SenderUserId != user.Id) throw new DomainException("Você pode editar ou excluir apenas suas próprias mensagens.", 403);
        if (message.DeletedAt.HasValue) throw new DomainException("Esta mensagem já foi excluída.", 409);
        if (message.Type == "pin") throw new DomainException("Este registro faz parte do histórico do chat.", 403);
        if (message.Version != version) throw new DomainException("A mensagem foi alterada. Atualize a conversa e tente novamente.", 409);
        return message;
    }

    public async Task EditMessageAsync(EditInternalChatMessageCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        var message = await OwnMessageAsync(command.RoomId, command.MessageId, command.Version, actor, cancellationToken);
        if (message.Type != "text") throw new DomainException("Apenas mensagens de texto podem ser editadas.");
        var body = command.Body.Trim();
        if (body.Length is 0 or > 4000) throw new DomainException("Digite uma mensagem de até 4.000 caracteres.");
        if (message.Body == body) return;
        message.Body = body; message.EditedAt = DateTimeOffset.UtcNow; message.UpdatedAt = message.EditedAt.Value; message.Version++;
        db.AuditEvents.Add(new AuditEvent { ActorEmail = actor.Email, Action = "EditMessage", Resource = "internal_chat_message", ResourceId = message.Id.ToString(), Module = "internalChat", DetailsJson = JsonSerializer.Serialize(new { message.RoomId, message.EditedAt, message.SenderUserId }) });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task DeleteMessageAsync(DeleteInternalChatMessageCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        var message = await OwnMessageAsync(command.RoomId, command.MessageId, command.Version, actor, cancellationToken);
        message.DeletedAt = DateTimeOffset.UtcNow; message.UpdatedAt = message.DeletedAt.Value; message.Version++;
        db.AuditEvents.Add(new AuditEvent { ActorEmail = actor.Email, Action = "DeleteMessage", Resource = "internal_chat_message", ResourceId = message.Id.ToString(), Module = "internalChat", DetailsJson = JsonSerializer.Serialize(new { message.RoomId, message.DeletedAt, message.SenderUserId }) });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<Guid> CreatePollAsync(CreateInternalChatPollCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("internalChat", "create");
        var actorUser = await GetActorUserAsync(actor, cancellationToken);
        var room = await GetMemberRoomAsync(command.RoomId, actorUser.Id, cancellationToken);
        if (!room.IsGroup) throw new DomainException("Enquetes podem ser enviadas somente em grupos.");
        await ValidateReplyAsync(room.Id, actorUser.Id, command.ReplyToMessageId, cancellationToken);
        var question = (command.Question ?? "").Trim();
        if (question.Length < 3 || question.Length > 240)
            throw new DomainException("Informe uma pergunta entre 3 e 240 caracteres.");
        var options = (command.Options ?? [])
            .Select(option => option.Trim())
            .Where(option => option.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        if (options.Length is < 2 or > 8 || options.Any(option => option.Length > 120))
            throw new DomainException("Informe de 2 a 8 opções, com até 120 caracteres cada.");
        var message = new InternalChatMessage
        {
            RoomId = room.Id,
            SenderUserId = actorUser.Id,
            Type = "poll",
            ReplyToMessageId = command.ReplyToMessageId,
            Body = JsonSerializer.Serialize(new PollPayload(question, options.Select(option => new PollOption(option, [])).ToList()), ChatJsonOptions),
        };
        await AddVisibleMessageAsync(room, message, actorUser.Id, cancellationToken);
        AddAudit(actor, "Create", "internal_chat_poll", message.Id.ToString(), new { room.Id, OptionCount = options.Length });
        await db.SaveChangesAsync(cancellationToken);
        return message.Id;
    }

    public async Task VotePollAsync(VoteInternalChatPollCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("internalChat", "create");
        var actorUser = await GetActorUserAsync(actor, cancellationToken);
        var room = await GetMemberRoomAsync(command.RoomId, actorUser.Id, cancellationToken);
        if (!room.IsGroup) throw new DomainException("Enquetes estão disponíveis somente em grupos.");
        var message = await db.InternalChatMessages.SingleOrDefaultAsync(entry => entry.Id == command.MessageId && entry.RoomId == room.Id && entry.DeletedAt == null, cancellationToken)
            ?? throw new DomainException("Enquete não encontrada.", 404);
        if (message.Type != "poll") throw new DomainException("A mensagem selecionada não é uma enquete.");
        PollPayload poll;
        try { poll = JsonSerializer.Deserialize<PollPayload>(message.Body, ChatJsonOptions) ?? throw new JsonException(); }
        catch (JsonException) { throw new DomainException("Não foi possível ler esta enquete."); }
        if (command.OptionIndex < 0 || command.OptionIndex >= poll.Options.Count)
            throw new DomainException("Selecione uma opção válida.");
        foreach (var option in poll.Options) option.VoterUserIds.RemoveAll(id => id == actorUser.Id);
        poll.Options[command.OptionIndex].VoterUserIds.Add(actorUser.Id);
        message.Body = JsonSerializer.Serialize(poll, ChatJsonOptions);
        message.UpdatedAt = DateTimeOffset.UtcNow;
        AddAudit(actor, "Vote", "internal_chat_poll", message.Id.ToString(), new { room.Id, command.OptionIndex });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task SetMessagePinnedAsync(SetInternalChatMessagePinnedCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("internalChat", "edit");
        var actorUser = await GetActorUserAsync(actor, cancellationToken);
        var room = await GetMemberRoomAsync(command.RoomId, actorUser.Id, cancellationToken);
        if (!room.IsGroup) throw new DomainException("Mensagens podem ser fixadas somente em grupos.");
        var exists = await db.InternalChatMessages.AsNoTracking().AnyAsync(entry => entry.Id == command.MessageId && entry.RoomId == room.Id && entry.DeletedAt == null && entry.Type != "pin", cancellationToken);
        if (!exists) throw new DomainException("Mensagem não encontrada.", 404);
        db.InternalChatMessages.Add(new InternalChatMessage
        {
            RoomId = room.Id,
            SenderUserId = actorUser.Id,
            Type = "pin",
            Body = JsonSerializer.Serialize(new PinPayload(command.MessageId, command.Pinned), ChatJsonOptions),
        });
        AddAudit(actor, command.Pinned ? "Pin" : "Unpin", "internal_chat_message", command.MessageId.ToString(), new { room.Id });
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task ValidateReplyAsync(Guid roomId, Guid actorUserId, Guid? messageId, CancellationToken cancellationToken)
    {
        if (!messageId.HasValue) return;
        var joinedAt = await db.InternalChatRoomMembers.Where(member => member.RoomId == roomId && member.UserId == actorUserId)
            .Select(member => member.JoinedAt).SingleAsync(cancellationToken);
        if (!await db.InternalChatMessages.AnyAsync(message => message.Id == messageId && message.RoomId == roomId
            && message.CreatedAt >= joinedAt && message.Type != "pin" && message.DeletedAt == null, cancellationToken))
            throw new DomainException("A mensagem escolhida para responder não está disponível nesta conversa.", 404);
    }

    private async Task AddVisibleMessageAsync(InternalChatRoom room, InternalChatMessage message, Guid actorUserId, CancellationToken cancellationToken)
    {
        room.LastMessageAt = message.CreatedAt;
        room.UpdatedAt = DateTimeOffset.UtcNow;
        var memberships = await db.InternalChatRoomMembers.Where(member => member.RoomId == room.Id).ToListAsync(cancellationToken);
        foreach (var membership in memberships)
        {
            membership.ArchivedAt = null;
            if (membership.UserId == actorUserId) membership.LastReadAt = message.CreatedAt;
        }
        db.InternalChatMessages.Add(message);
    }

    public async Task<Guid> UploadAttachmentAsync(UploadInternalChatAttachmentCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("internalChat", "create");
        var actorUser = await GetActorUserAsync(actor, cancellationToken);
        var room = await GetMemberRoomAsync(command.RoomId, actorUser.Id, cancellationToken);
        await ValidateReplyAsync(room.Id, actorUser.Id, command.ReplyToMessageId, cancellationToken);
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
            ReplyToMessageId = command.ReplyToMessageId,
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
        var readAt = DateTimeOffset.UtcNow;
        if (db.Database.ProviderName?.Contains("Npgsql") == true)
        {
            // Multiple open tabs can acknowledge the same message concurrently; retain its first receipt.
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO internal_chat_message_receipts ("RoomId", "MessageId", "UserId", "ReadAt")
                SELECT message."RoomId", message."Id", {actorUser.Id}, {readAt}
                FROM internal_chat_messages message
                WHERE message."RoomId" = {command.RoomId} AND message."SenderUserId" <> {actorUser.Id}
                    AND message."Type" <> 'pin' AND message."DeletedAt" IS NULL
                    AND message."CreatedAt" >= {membership.JoinedAt} AND message."CreatedAt" <= {readAt}
                ON CONFLICT ("MessageId", "UserId") DO NOTHING;
                UPDATE internal_chat_room_members SET "LastReadAt" = GREATEST("LastReadAt", {readAt}), "ArchivedAt" = NULL
                WHERE "RoomId" = {command.RoomId} AND "UserId" = {actorUser.Id};
                """, cancellationToken);
            return;
        }
        var unread = await db.InternalChatMessages.AsNoTracking().Where(message => message.RoomId == command.RoomId
            && message.SenderUserId != actorUser.Id && message.Type != "pin" && message.DeletedAt == null
            && message.CreatedAt >= membership.JoinedAt && message.CreatedAt <= readAt
            && !db.InternalChatMessageReceipts.Any(receipt => receipt.MessageId == message.Id && receipt.UserId == actorUser.Id))
            .Select(message => message.Id).ToArrayAsync(cancellationToken);
        db.InternalChatMessageReceipts.AddRange(unread.Select(id => new InternalChatMessageReceipt
            { RoomId = command.RoomId, MessageId = id, UserId = actorUser.Id, ReadAt = readAt }));
        membership.LastReadAt = readAt;
        membership.ArchivedAt = null;
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task SetMessageReactionAsync(SetInternalChatMessageReactionCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("internalChat", "create");
        var user = await GetActorUserAsync(actor, cancellationToken);
        await GetMemberRoomAsync(command.RoomId, user.Id, cancellationToken);
        var member = await db.InternalChatRoomMembers.AsNoTracking().SingleAsync(entry => entry.RoomId == command.RoomId && entry.UserId == user.Id, cancellationToken);
        var message = await db.InternalChatMessages.AsNoTracking().SingleOrDefaultAsync(entry => entry.Id == command.MessageId && entry.RoomId == command.RoomId
            && entry.CreatedAt >= member.JoinedAt, cancellationToken) ?? throw new DomainException("Mensagem não encontrada.", 404);
        if (message.DeletedAt.HasValue || message.Type == "pin") throw new DomainException("Esta mensagem não aceita reações.", 409);
        var emoji = command.Emoji.Trim();
        if (!new[] { "👍", "❤️", "😂", "😮", "😢", "🙏", "👏", "🎉" }.Contains(emoji)) throw new DomainException("Selecione uma reação válida.");
        var reactedAt = DateTimeOffset.UtcNow;
        if (db.Database.ProviderName?.Contains("Npgsql") == true)
        {
            var changed = command.Reacted
                ? await db.Database.ExecuteSqlInterpolatedAsync($"""
                    INSERT INTO internal_chat_message_reactions ("RoomId", "MessageId", "UserId", "Emoji", "ReactedAt")
                    VALUES ({message.RoomId}, {message.Id}, {user.Id}, {emoji}, {reactedAt})
                    ON CONFLICT ("MessageId", "UserId") DO UPDATE SET "Emoji" = EXCLUDED."Emoji", "ReactedAt" = EXCLUDED."ReactedAt"
                    WHERE internal_chat_message_reactions."Emoji" IS DISTINCT FROM EXCLUDED."Emoji";
                    """, cancellationToken)
                : await db.Database.ExecuteSqlInterpolatedAsync($"""
                    DELETE FROM internal_chat_message_reactions WHERE "MessageId" = {message.Id} AND "UserId" = {user.Id} AND "Emoji" = {emoji};
                    """, cancellationToken);
            if (changed > 0) await db.InternalChatMessages.Where(entry => entry.Id == message.Id)
                .ExecuteUpdateAsync(setters => setters.SetProperty(entry => entry.UpdatedAt, reactedAt), cancellationToken);
            return;
        }
        var existing = await db.InternalChatMessageReactions.SingleOrDefaultAsync(entry => entry.MessageId == message.Id && entry.UserId == user.Id, cancellationToken);
        if (!command.Reacted)
        {
            if (existing is not null && existing.Emoji == emoji) db.InternalChatMessageReactions.Remove(existing);
        }
        else if (existing is null) db.InternalChatMessageReactions.Add(new() { RoomId = message.RoomId, MessageId = message.Id, UserId = user.Id, Emoji = emoji });
        else if (existing.Emoji != emoji) { existing.Emoji = emoji; existing.ReactedAt = DateTimeOffset.UtcNow; }
        if (db.ChangeTracker.HasChanges())
        {
            var tracked = await db.InternalChatMessages.SingleAsync(entry => entry.Id == message.Id, cancellationToken);
            tracked.UpdatedAt = reactedAt;
            await db.SaveChangesAsync(cancellationToken);
        }
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
            .SingleOrDefaultAsync(entry => entry.Id == messageId && entry.DeletedAt == null, cancellationToken)
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
        contentType is "application/pdf" or "text/plain" or "text/csv" or "text/markdown" or "application/csv" or "application/zip" or "application/x-zip-compressed" or
            "application/msword" or "application/vnd.openxmlformats-officedocument.wordprocessingml.document" or
            "application/vnd.ms-excel" or "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" or
            "application/vnd.ms-powerpoint" or "application/vnd.openxmlformats-officedocument.presentationml.presentation";

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
