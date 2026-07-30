using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace Dontus.Operations.Infrastructure;

public sealed class ChatService(
    OperationsDbContext db,
    IDataProtectionProvider protectionProvider,
    HttpClient httpClient,
    ITaskFileStorage? fileStorage = null) : IChatService
{
    private readonly IDataProtector protector = protectionProvider.CreateProtector("Dontus.Chat.MetaCredentials.v1");

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        var departments = await db.TaskDepartments.Where(x => x.Active).ToListAsync(cancellationToken);
        foreach (var department in departments)
        {
            var queue = await db.ChatQueues.SingleOrDefaultAsync(
                x => x.DepartmentId == department.Id && x.Name == "Atendimento", cancellationToken);
            if (queue is null)
            {
                queue = new ChatQueue
                {
                    Name = "Atendimento",
                    Description = $"Fila principal de {department.Name}.",
                    DepartmentId = department.Id,
                };
                db.ChatQueues.Add(queue);
            }

            if (!await db.ChatChannels.AnyAsync(
                    x => x.DepartmentId == department.Id && x.Type == "Interno", cancellationToken))
            {
                db.ChatChannels.Add(new ChatChannel
                {
                    Name = $"Chat interno · {department.Name}",
                    Type = "Interno",
                    DepartmentId = department.Id,
                    DefaultQueueId = queue.Id,
                    GreetingMessage = $"Olá! Você está falando com o setor {department.Name}.",
                });
            }
        }

        if (!await db.ChatTags.AnyAsync(cancellationToken))
        {
            db.ChatTags.AddRange(
                new ChatTag { Name = "Urgente", Color = "#ef4444" },
                new ChatTag { Name = "Cliente estratégico", Color = "#7c3aed" },
                new ChatTag { Name = "Aguardando retorno", Color = "#f59e0b" });
        }

        if (!await db.ChatQuickReplies.AnyAsync(cancellationToken))
        {
            db.ChatQuickReplies.AddRange(
                new ChatQuickReply { Shortcut = "/ola", Title = "Boas-vindas", Body = "Olá! Sou da equipe Dontus. Como posso ajudar?" },
                new ChatQuickReply { Shortcut = "/aguarde", Title = "Em análise", Body = "Recebi sua solicitação e já estou analisando. Retorno em breve." },
                new ChatQuickReply { Shortcut = "/encerrar", Title = "Encerramento", Body = "Conseguimos resolver sua solicitação? Permanecemos à disposição." });
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<ChatModuleDto> GetModuleAsync(ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("chat", "view");
        var allDepartments = actor.HasPermission("chat", "manage") || actor.HasCapability("chat", "viewOtherDepartments");
        var visibleDepartmentIds = await VisibleDepartmentIdsAsync(actor, allDepartments, cancellationToken);

        var departments = await db.TaskDepartments.AsNoTracking()
            .Where(x => allDepartments || visibleDepartmentIds.Contains(x.Id))
            .OrderBy(x => x.Name).ToListAsync(cancellationToken);
        var queues = await db.ChatQueues.AsNoTracking()
            .Where(x => allDepartments || visibleDepartmentIds.Contains(x.DepartmentId))
            .OrderBy(x => x.Name).ToListAsync(cancellationToken);
        var channels = await db.ChatChannels.AsNoTracking()
            .Where(x => allDepartments || visibleDepartmentIds.Contains(x.DepartmentId))
            .OrderBy(x => x.Name).ToListAsync(cancellationToken);
        var numbers = await db.ChatWhatsAppNumbers.AsNoTracking()
            .Where(x => allDepartments || visibleDepartmentIds.Contains(x.DepartmentId))
            .OrderBy(x => x.InternalName).ToListAsync(cancellationToken);
        var users = await db.Users.AsNoTracking().Where(x => x.Active).OrderBy(x => x.DisplayName).ToListAsync(cancellationToken);
        var memberships = await db.UserDepartments.AsNoTracking().ToListAsync(cancellationToken);
        var conversations = await db.ChatConversations.AsNoTracking()
            .Where(x => allDepartments || visibleDepartmentIds.Contains(x.DepartmentId))
            .OrderByDescending(x => x.LastMessageAt).Take(300).ToListAsync(cancellationToken);
        var conversationIds = conversations.Select(x => x.Id).ToArray();
        var contactIds = conversations.Select(x => x.ContactId).ToArray();
        var contacts = await db.ChatContacts.AsNoTracking()
            .Where(x => contactIds.Contains(x.Id)).ToListAsync(cancellationToken);
        var messages = await db.ChatMessages.AsNoTracking()
            .Where(x => conversationIds.Contains(x.ConversationId))
            .OrderBy(x => x.CreatedAt).ToListAsync(cancellationToken);
        var tags = await db.ChatTags.AsNoTracking()
            .Where(x => !x.DepartmentId.HasValue || allDepartments || visibleDepartmentIds.Contains(x.DepartmentId.Value))
            .OrderBy(x => x.Name).ToListAsync(cancellationToken);
        var conversationTags = await db.ChatConversationTags.AsNoTracking()
            .Where(x => conversationIds.Contains(x.ConversationId)).ToListAsync(cancellationToken);
        var transfers = await db.ChatTransfers.AsNoTracking()
            .Where(x => conversationIds.Contains(x.ConversationId)).OrderBy(x => x.CreatedAt).ToListAsync(cancellationToken);
        var quickReplies = await db.ChatQuickReplies.AsNoTracking()
            .Where(x => !x.DepartmentId.HasValue || allDepartments || visibleDepartmentIds.Contains(x.DepartmentId.Value))
            .OrderBy(x => x.Shortcut).ToListAsync(cancellationToken);

        var departmentNames = departments.ToDictionary(x => x.Id, x => x.Name);
        var queueNames = queues.ToDictionary(x => x.Id, x => x.Name);
        var channelNames = channels.ToDictionary(x => x.Id, x => x.Name);
        var userNames = users.ToDictionary(x => x.Id, x => x.DisplayName);
        var contactMap = contacts.ToDictionary(x => x.Id);
        var tagMap = tags.ToDictionary(x => x.Id);

        var now = DateTimeOffset.UtcNow;
        var closedToday = conversations.Count(x => x.ClosedAt >= now.Date);
        var firstResponses = conversations.Where(x => x.FirstResponseAt.HasValue)
            .Select(x => (x.FirstResponseAt!.Value - x.CreatedAt).TotalMinutes).ToArray();
        var resolutions = conversations.Where(x => x.ClosedAt.HasValue)
            .Select(x => (x.ClosedAt!.Value - x.CreatedAt).TotalMinutes).ToArray();

        return new ChatModuleDto(
            conversations.Select(c =>
            {
                var contact = contactMap[c.ContactId];
                return new ChatConversationDto(
                    c.Id, c.Number, c.Protocol,
                    new ChatContactDto(contact.Id, contact.Name, contact.Phone, contact.Email, contact.CustomerId, contact.CompanyName, contact.Notes),
                    c.ChannelId, channelNames.GetValueOrDefault(c.ChannelId, "Canal"), c.DepartmentId,
                    departmentNames.GetValueOrDefault(c.DepartmentId, "Setor"), c.QueueId,
                    queueNames.GetValueOrDefault(c.QueueId, "Fila"), c.AssigneeUserId,
                    c.AssigneeUserId.HasValue ? userNames.GetValueOrDefault(c.AssigneeUserId.Value, "Colaborador") : "",
                    c.Subject, c.Status, c.Priority, c.Favorite, c.UnreadCount, c.LastMessageAt,
                    c.FirstResponseAt, c.ClosedAt, c.SlaDueAt, c.AiSummary, c.Sentiment, c.Version,
                    messages.Where(x => x.ConversationId == c.Id).Select(ToMessageDto).ToArray(),
                    conversationTags.Where(x => x.ConversationId == c.Id && tagMap.ContainsKey(x.TagId))
                        .Select(x => ToTagDto(tagMap[x.TagId])).ToArray(),
                    transfers.Where(x => x.ConversationId == c.Id).Select(x => new ChatTransferDto(
                        x.Id, x.FromDepartmentId, x.ToDepartmentId, x.FromChannelId, x.ToChannelId,
                        x.Reason, userNames.GetValueOrDefault(x.ActorUserId, "Sistema"), x.CreatedAt)).ToArray());
            }).ToArray(),
            departments.Select(x => new ChatDepartmentDto(x.Id, x.Name, x.Active)).ToArray(),
            users.Select(x => new ChatUserDto(x.Id, x.DisplayName, x.Email,
                memberships.Where(m => m.UserId == x.Id).Select(m => m.DepartmentId).ToArray(), x.Active)).ToArray(),
            queues.Select(x => new ChatQueueDto(x.Id, x.Name, x.Description, x.DepartmentId,
                departmentNames.GetValueOrDefault(x.DepartmentId, "Setor"), x.DistributionStrategy, x.Active)).ToArray(),
            channels.Select(x => new ChatChannelDto(x.Id, x.Name, x.Type, x.DepartmentId,
                departmentNames.GetValueOrDefault(x.DepartmentId, "Setor"), x.DefaultQueueId, x.DefaultAssigneeUserId,
                x.Active, x.AiEnabled, x.AllowTransfer, x.AutoCreateTask, x.GreetingMessage, x.AwayMessage)).ToArray(),
            numbers.Select(x => new ChatWhatsAppNumberDto(x.Id, x.ChannelId, x.DepartmentId,
                departmentNames.GetValueOrDefault(x.DepartmentId, "Setor"), x.InternalName, x.DisplayName,
                x.PhoneNumber, x.PhoneNumberId, x.WabaId, x.BusinessManagerId, x.ConnectionMode,
                x.MetaAppId, x.EmbeddedSignupConfigId, x.ApiVersion, x.Status, x.CoexistenceStatus,
                x.CoexistenceError, x.Quality, x.LastSyncAt, x.CoexistenceCompletedAt,
                !string.IsNullOrWhiteSpace(x.AccessTokenProtected),
                !string.IsNullOrWhiteSpace(x.VerifyTokenProtected),
                !string.IsNullOrWhiteSpace(x.AppSecretProtected), x.Active)).ToArray(),
            tags.Select(ToTagDto).ToArray(),
            quickReplies.Select(x => new ChatQuickReplyDto(x.Id, x.Shortcut, x.Title, x.Body, x.DepartmentId, x.Active)).ToArray(),
            new ChatMetricsDto(
                conversations.Count(x => x.Status is "Aberta" or "Em atendimento"),
                conversations.Count(x => x.Status == "Aguardando cliente"),
                conversations.Count(x => !x.AssigneeUserId.HasValue && x.Status != "Encerrada"),
                closedToday,
                firstResponses.Length == 0 ? 0 : Math.Round(firstResponses.Average(), 1),
                resolutions.Length == 0 ? 0 : Math.Round(resolutions.Average(), 1)));
    }

    public async Task<Guid> CreateConversationAsync(CreateChatConversationCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("chat", "create");
        var channel = await db.ChatChannels.SingleOrDefaultAsync(x => x.Id == command.ChannelId && x.Active, cancellationToken)
            ?? throw new DomainException("Canal ativo não encontrado.");
        await RequireDepartmentAccessAsync(actor, channel.DepartmentId, cancellationToken);
        var queueId = command.QueueId ?? channel.DefaultQueueId
            ?? throw new DomainException("O canal precisa de uma fila padrão.");
        await ValidateQueueAndAssigneeAsync(channel.DepartmentId, queueId, command.AssigneeUserId, cancellationToken);

        var phone = NormalizePhone(command.Phone);
        var contact = !string.IsNullOrWhiteSpace(phone)
            ? await db.ChatContacts.FirstOrDefaultAsync(x => x.Phone == phone, cancellationToken)
            : null;
        if (contact is null)
        {
            contact = new ChatContact
            {
                Name = Required(command.ContactName, "Nome do contato"),
                Phone = phone,
                Email = command.Email.Trim(),
                CustomerId = command.CustomerId,
                CompanyName = command.CompanyName.Trim(),
            };
            db.ChatContacts.Add(contact);
        }

        var conversation = new ChatConversation
        {
            Protocol = $"CHAT-TEMP-{Guid.NewGuid():N}",
            ContactId = contact.Id,
            ChannelId = channel.Id,
            DepartmentId = channel.DepartmentId,
            QueueId = queueId,
            AssigneeUserId = command.AssigneeUserId ?? channel.DefaultAssigneeUserId,
            Subject = string.IsNullOrWhiteSpace(command.Subject) ? "Novo atendimento" : command.Subject.Trim(),
            Priority = string.IsNullOrWhiteSpace(command.Priority) ? "Normal" : command.Priority.Trim(),
            SlaDueAt = DateTimeOffset.UtcNow.AddHours(4),
        };
        db.ChatConversations.Add(conversation);
        await db.SaveChangesAsync(cancellationToken);
        conversation.Protocol = $"CHAT-{DateTimeOffset.UtcNow:yyyy}-{conversation.Number:D6}";

        if (!string.IsNullOrWhiteSpace(command.InitialMessage))
            db.ChatMessages.Add(new ChatMessage
            {
                ConversationId = conversation.Id,
                Direction = "Entrada",
                Body = command.InitialMessage.Trim(),
                SenderName = contact.Name,
                Status = "Recebida",
            });
        Audit(actor, "chat.conversation.created", "chat_conversation", conversation.Id, new { conversation.Protocol, conversation.DepartmentId, conversation.ChannelId });
        await db.SaveChangesAsync(cancellationToken);
        return conversation.Id;
    }

    public async Task<Guid> SendMessageAsync(SendChatMessageCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("chat", "edit");
        if (command.Internal) RequireCapabilityOrManage(actor, "internalNotes");
        else RequireCapabilityOrManage(actor, "sendMessages");
        var conversation = await AccessibleConversationAsync(command.ConversationId, actor, cancellationToken);
        if (conversation.Status == "Encerrada")
            throw new DomainException("Reabra a conversa antes de enviar uma mensagem.");
        var user = await CurrentUserAsync(actor, cancellationToken);
        var body = Required(command.Body, command.Internal ? "Nota interna" : "Mensagem");
        var message = new ChatMessage
        {
            ConversationId = conversation.Id,
            Direction = "Saida",
            Body = body,
            Internal = command.Internal,
            SenderUserId = user.Id,
            SenderName = user.DisplayName,
            ReplyToMessageId = command.ReplyToMessageId,
            Status = command.Internal ? "Interna" : "Enviada",
        };

        if (!command.Internal)
        {
            var channel = await db.ChatChannels.AsNoTracking().SingleAsync(x => x.Id == conversation.ChannelId, cancellationToken);
            if (channel.Type == "WhatsApp")
            {
                var number = await db.ChatWhatsAppNumbers.AsNoTracking()
                    .SingleOrDefaultAsync(x => x.ChannelId == channel.Id && x.Active, cancellationToken)
                    ?? throw new DomainException("Este canal não possui um número WhatsApp ativo.");
                var contactPhone = await db.ChatContacts.Where(x => x.Id == conversation.ContactId)
                    .Select(x => x.Phone).SingleAsync(cancellationToken);
                await SendWhatsAppTextAsync(number, contactPhone, body, cancellationToken);
                message.Status = "Aceita pela Meta";
            }
            conversation.FirstResponseAt ??= DateTimeOffset.UtcNow;
        }

        conversation.LastMessageAt = DateTimeOffset.UtcNow;
        conversation.Status = "Em atendimento";
        conversation.UnreadCount = 0;
        conversation.UpdatedAt = DateTimeOffset.UtcNow;
        conversation.Version++;
        db.ChatMessages.Add(message);
        Audit(actor, command.Internal ? "chat.note.created" : "chat.message.sent", "chat_conversation", conversation.Id, new { MessageId = message.Id, command.Internal });
        await db.SaveChangesAsync(cancellationToken);
        return message.Id;
    }

    public async Task UpdateConversationAsync(UpdateChatConversationCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("chat", "edit");
        var conversation = await AccessibleConversationAsync(command.ConversationId, actor, cancellationToken);
        EnsureVersion(conversation, command.Version);
        if (!string.IsNullOrWhiteSpace(command.Status))
        {
            var allowed = new[] { "Aberta", "Em atendimento", "Aguardando cliente", "Aguardando setor", "Resolvida", "Encerrada" };
            if (!allowed.Contains(command.Status)) throw new DomainException("Status de conversa inválido.");
            conversation.Status = command.Status;
            conversation.ClosedAt = command.Status is "Resolvida" or "Encerrada" ? DateTimeOffset.UtcNow : null;
        }
        if (!string.IsNullOrWhiteSpace(command.Priority)) conversation.Priority = command.Priority.Trim();
        if (command.Favorite.HasValue) conversation.Favorite = command.Favorite.Value;
        if (command.MarkRead == true) conversation.UnreadCount = 0;
        Touch(conversation);
        Audit(actor, "chat.conversation.updated", "chat_conversation", conversation.Id, new { command.Status, command.Priority, command.Favorite, command.MarkRead });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task AssignAsync(AssignChatConversationCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("chat", "edit");
        RequireCapabilityOrManage(actor, "assign");
        var conversation = await AccessibleConversationAsync(command.ConversationId, actor, cancellationToken);
        EnsureVersion(conversation, command.Version);
        var queueId = command.QueueId ?? conversation.QueueId;
        await ValidateQueueAndAssigneeAsync(conversation.DepartmentId, queueId, command.AssigneeUserId, cancellationToken);
        conversation.QueueId = queueId;
        conversation.AssigneeUserId = command.AssigneeUserId ?? (await CurrentUserAsync(actor, cancellationToken)).Id;
        Touch(conversation);
        Audit(actor, "chat.conversation.assigned", "chat_conversation", conversation.Id, new { conversation.AssigneeUserId, conversation.QueueId });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task TransferAsync(TransferChatConversationCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("chat", "edit");
        RequireCapabilityOrManage(actor, "transfer");
        var conversation = await AccessibleConversationAsync(command.ConversationId, actor, cancellationToken);
        EnsureVersion(conversation, command.Version);
        var destination = await db.ChatChannels.SingleOrDefaultAsync(x =>
            x.Id == command.ToChannelId && x.DepartmentId == command.ToDepartmentId && x.Active, cancellationToken)
            ?? throw new DomainException("Selecione um canal ativo do setor de destino.");
        var sourceType = await db.ChatChannels.Where(x => x.Id == conversation.ChannelId)
            .Select(x => x.Type).SingleAsync(cancellationToken);
        if (sourceType == "WhatsApp" && destination.Type != "WhatsApp")
            throw new DomainException("Uma conversa WhatsApp só pode ser transferida para outro número WhatsApp oficial.");
        if (destination.Type == "WhatsApp" && !await db.ChatWhatsAppNumbers.AnyAsync(
                x => x.ChannelId == destination.Id && x.DepartmentId == command.ToDepartmentId && x.Active, cancellationToken))
            throw new DomainException("O setor de destino não possui número WhatsApp oficial ativo neste canal.");
        await ValidateQueueAndAssigneeAsync(command.ToDepartmentId, command.ToQueueId, command.ToAssigneeUserId, cancellationToken);
        var actorUser = await CurrentUserAsync(actor, cancellationToken);
        db.ChatTransfers.Add(new ChatTransfer
        {
            ConversationId = conversation.Id,
            FromDepartmentId = conversation.DepartmentId,
            ToDepartmentId = command.ToDepartmentId,
            FromChannelId = conversation.ChannelId,
            ToChannelId = destination.Id,
            FromQueueId = conversation.QueueId,
            ToQueueId = command.ToQueueId,
            FromAssigneeUserId = conversation.AssigneeUserId,
            ToAssigneeUserId = command.ToAssigneeUserId,
            ActorUserId = actorUser.Id,
            Reason = Required(command.Reason, "Motivo"),
        });
        db.ChatMessages.Add(new ChatMessage
        {
            ConversationId = conversation.Id,
            Direction = "Sistema",
            Type = "Transferencia",
            Body = $"Atendimento transferido: {command.Reason.Trim()}",
            Internal = true,
            SenderUserId = actorUser.Id,
            SenderName = actorUser.DisplayName,
            Status = "Interna",
        });
        conversation.DepartmentId = command.ToDepartmentId;
        conversation.ChannelId = destination.Id;
        conversation.QueueId = command.ToQueueId;
        conversation.AssigneeUserId = command.ToAssigneeUserId;
        conversation.Status = "Aguardando setor";
        Touch(conversation);
        Audit(actor, "chat.conversation.transferred", "chat_conversation", conversation.Id, new { command.ToDepartmentId, command.ToChannelId, command.ToQueueId, command.Reason });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<Guid> SaveQueueAsync(SaveChatQueueCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        RequireManage(actor, "manageCatalogs");
        await EnsureDepartmentAsync(command.DepartmentId, cancellationToken);
        var entity = command.Id.HasValue ? await db.ChatQueues.SingleOrDefaultAsync(x => x.Id == command.Id, cancellationToken) : null;
        if (command.Id.HasValue && entity is null) throw new DomainException("Fila não encontrada.", 404);
        entity ??= new ChatQueue { Name = "", DepartmentId = command.DepartmentId };
        entity.Name = Required(command.Name, "Nome");
        entity.Description = command.Description.Trim();
        entity.DepartmentId = command.DepartmentId;
        entity.DistributionStrategy = string.IsNullOrWhiteSpace(command.DistributionStrategy) ? "Manual" : command.DistributionStrategy.Trim();
        entity.Active = command.Active;
        if (!command.Id.HasValue) db.ChatQueues.Add(entity); else Touch(entity);
        Audit(actor, "chat.queue.saved", "chat_queue", entity.Id, new { entity.Name, entity.DepartmentId, entity.Active });
        await db.SaveChangesAsync(cancellationToken);
        return entity.Id;
    }

    public async Task<Guid> SaveChannelAsync(SaveChatChannelCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        RequireManage(actor, "manageChannels");
        await EnsureDepartmentAsync(command.DepartmentId, cancellationToken);
        if (command.DefaultQueueId.HasValue)
            await ValidateQueueAndAssigneeAsync(command.DepartmentId, command.DefaultQueueId.Value, command.DefaultAssigneeUserId, cancellationToken);
        var entity = command.Id.HasValue ? await db.ChatChannels.SingleOrDefaultAsync(x => x.Id == command.Id, cancellationToken) : null;
        if (command.Id.HasValue && entity is null) throw new DomainException("Canal não encontrado.", 404);
        entity ??= new ChatChannel { Name = "", DepartmentId = command.DepartmentId };
        entity.Name = Required(command.Name, "Nome");
        entity.Type = Required(command.Type, "Tipo");
        entity.DepartmentId = command.DepartmentId;
        entity.DefaultQueueId = command.DefaultQueueId;
        entity.DefaultAssigneeUserId = command.DefaultAssigneeUserId;
        entity.Active = command.Active;
        entity.AiEnabled = command.AiEnabled;
        entity.AllowTransfer = command.AllowTransfer;
        entity.AutoCreateTask = command.AutoCreateTask;
        entity.GreetingMessage = command.GreetingMessage.Trim();
        entity.AwayMessage = command.AwayMessage.Trim();
        if (!command.Id.HasValue) db.ChatChannels.Add(entity); else Touch(entity);
        Audit(actor, "chat.channel.saved", "chat_channel", entity.Id, new { entity.Name, entity.Type, entity.DepartmentId, entity.Active });
        await db.SaveChangesAsync(cancellationToken);
        return entity.Id;
    }

    public async Task<Guid> SaveWhatsAppNumberAsync(SaveChatWhatsAppNumberCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        RequireManage(actor, "manageWhatsApp");
        var channel = await db.ChatChannels.SingleOrDefaultAsync(x => x.Id == command.ChannelId, cancellationToken)
            ?? throw new DomainException("Canal não encontrado.");
        if (channel.Type != "WhatsApp") throw new DomainException("O número só pode ser vinculado a um canal do tipo WhatsApp.");
        if (channel.DepartmentId != command.DepartmentId)
            throw new DomainException("O número, o canal e o setor precisam possuir o mesmo vínculo exclusivo.");
        var entity = command.Id.HasValue ? await db.ChatWhatsAppNumbers.SingleOrDefaultAsync(x => x.Id == command.Id, cancellationToken) : null;
        if (command.Id.HasValue && entity is null) throw new DomainException("Número WhatsApp não encontrado.", 404);
        entity ??= new ChatWhatsAppNumber { ChannelId = command.ChannelId, DepartmentId = command.DepartmentId, InternalName = "", DisplayName = "", PhoneNumber = "" };
        entity.ChannelId = command.ChannelId;
        entity.DepartmentId = command.DepartmentId;
        entity.InternalName = Required(command.InternalName, "Nome interno");
        entity.DisplayName = Required(command.DisplayName, "Nome de exibição");
        entity.PhoneNumber = NormalizePhone(Required(command.PhoneNumber, "Número"));
        if (!command.Id.HasValue || !string.IsNullOrWhiteSpace(command.PhoneNumberId))
            entity.PhoneNumberId = command.PhoneNumberId.Trim();
        if (!command.Id.HasValue || !string.IsNullOrWhiteSpace(command.WabaId))
            entity.WabaId = command.WabaId.Trim();
        entity.BusinessManagerId = command.BusinessManagerId.Trim();
        entity.ConnectionMode = command.ConnectionMode == "Coexistence" ? "Coexistence" : "CloudApi";
        entity.MetaAppId = command.MetaAppId.Trim();
        entity.EmbeddedSignupConfigId = command.EmbeddedSignupConfigId.Trim();
        entity.ApiVersion = string.IsNullOrWhiteSpace(command.ApiVersion) ? "v23.0" : command.ApiVersion.Trim();
        entity.Active = command.Active;
        entity.Status = entity.ConnectionMode == "Coexistence"
            ? entity.CoexistenceStatus == "Ativo" ? "Configurado" : "Aguardando conexão"
            : string.IsNullOrWhiteSpace(command.PhoneNumberId) ? "Pendente" : "Configurado";
        if (entity.ConnectionMode == "CloudApi")
        {
            entity.CoexistenceStatus = "Não se aplica";
            entity.CoexistenceError = "";
        }
        else if (entity.CoexistenceStatus == "Não se aplica")
        {
            entity.CoexistenceStatus = "Não iniciado";
        }
        if (!string.IsNullOrWhiteSpace(command.AccessToken)) entity.AccessTokenProtected = protector.Protect(command.AccessToken.Trim());
        if (!string.IsNullOrWhiteSpace(command.VerifyToken)) entity.VerifyTokenProtected = protector.Protect(command.VerifyToken.Trim());
        if (!string.IsNullOrWhiteSpace(command.AppSecret)) entity.AppSecretProtected = protector.Protect(command.AppSecret.Trim());
        if (!command.Id.HasValue) db.ChatWhatsAppNumbers.Add(entity); else Touch(entity);
        Audit(actor, "chat.whatsapp.saved", "chat_whatsapp_number", entity.Id, new { entity.InternalName, entity.PhoneNumber, entity.DepartmentId, entity.Active });
        await db.SaveChangesAsync(cancellationToken);
        return entity.Id;
    }

    public async Task<Guid> CompleteWhatsAppCoexistenceAsync(
        CompleteWhatsAppCoexistenceCommand command,
        ActorContext actor,
        CancellationToken cancellationToken = default)
    {
        RequireManage(actor, "manageWhatsApp");
        var entity = await db.ChatWhatsAppNumbers.SingleOrDefaultAsync(x => x.Id == command.Id, cancellationToken)
            ?? throw new DomainException("Número WhatsApp não encontrado.", 404);
        if (entity.ConnectionMode != "Coexistence")
            throw new DomainException("Este número não está configurado para o modo de coexistência.");
        if (string.IsNullOrWhiteSpace(entity.MetaAppId) || string.IsNullOrWhiteSpace(entity.EmbeddedSignupConfigId))
            throw new DomainException("Informe o App ID e o Configuration ID do Embedded Signup antes de conectar.");
        if (string.IsNullOrWhiteSpace(entity.AppSecretProtected))
            throw new DomainException("Informe o App Secret antes de conectar.");
        if (string.IsNullOrWhiteSpace(entity.VerifyTokenProtected))
            throw new DomainException("Informe o token de verificação do webhook antes de conectar.");

        var appSecret = SafeUnprotect(entity.AppSecretProtected);
        if (string.IsNullOrWhiteSpace(appSecret))
            throw new DomainException("Não foi possível descriptografar o App Secret. Salve a credencial novamente.");

        var tokenResponse = await SendMetaAsync(
            HttpMethod.Post,
            $"{entity.ApiVersion}/oauth/access_token",
            null,
            new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = entity.MetaAppId,
                ["client_secret"] = appSecret,
                ["code"] = Required(command.AuthorizationCode, "Código de autorização"),
            }),
            cancellationToken);
        var accessToken = tokenResponse.RootElement.TryGetProperty("access_token", out var accessTokenElement)
            ? accessTokenElement.GetString() ?? ""
            : "";
        if (string.IsNullOrWhiteSpace(accessToken))
            throw new DomainException("A Meta não retornou uma credencial válida para o Embedded Signup.", 502);

        entity.AccessTokenProtected = protector.Protect(accessToken);
        entity.WabaId = Required(command.WabaId, "WABA ID");
        entity.CoexistenceStatus = "Configurando";
        entity.CoexistenceError = "";
        entity.Status = "Conectando";
        Touch(entity);
        await db.SaveChangesAsync(cancellationToken);

        return await ConfigureCoexistenceAsync(entity, accessToken, actor, cancellationToken);
    }

    public async Task<Guid> RetryWhatsAppCoexistenceAsync(
        Guid id,
        ActorContext actor,
        CancellationToken cancellationToken = default)
    {
        RequireManage(actor, "manageWhatsApp");
        var entity = await db.ChatWhatsAppNumbers.SingleOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new DomainException("Número WhatsApp não encontrado.", 404);
        if (entity.ConnectionMode != "Coexistence")
            throw new DomainException("Este número não está configurado para o modo de coexistência.");
        var accessToken = SafeUnprotect(entity.AccessTokenProtected);
        if (string.IsNullOrWhiteSpace(accessToken) || string.IsNullOrWhiteSpace(entity.WabaId))
            throw new DomainException("Refaça o fluxo Conectar com Facebook para obter uma nova credencial.");
        entity.CoexistenceStatus = "Configurando";
        entity.CoexistenceError = "";
        Touch(entity);
        await db.SaveChangesAsync(cancellationToken);
        return await ConfigureCoexistenceAsync(entity, accessToken, actor, cancellationToken);
    }

    private async Task<Guid> ConfigureCoexistenceAsync(
        ChatWhatsAppNumber entity,
        string accessToken,
        ActorContext actor,
        CancellationToken cancellationToken)
    {
        try
        {
            var phoneResponse = await SendMetaAsync(
                HttpMethod.Get,
                $"{entity.ApiVersion}/{entity.WabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,is_on_biz_app,platform_type",
                accessToken,
                null,
                cancellationToken);
            if (!phoneResponse.RootElement.TryGetProperty("data", out var phoneData) ||
                phoneData.ValueKind != JsonValueKind.Array)
                throw new DomainException("A Meta não retornou os números vinculados à WABA.", 502);

            var configuredPhone = NormalizePhone(entity.PhoneNumber);
            JsonElement? matchedPhone = null;
            foreach (var phone in phoneData.EnumerateArray())
            {
                var displayPhone = phone.TryGetProperty("display_phone_number", out var displayPhoneElement)
                    ? NormalizePhone(displayPhoneElement.GetString() ?? "")
                    : "";
                if (displayPhone == configuredPhone)
                {
                    matchedPhone = phone.Clone();
                    break;
                }
            }
            if (!matchedPhone.HasValue && phoneData.GetArrayLength() == 1)
                matchedPhone = phoneData[0].Clone();
            if (!matchedPhone.HasValue)
                throw new DomainException("O número informado não foi encontrado na WABA selecionada pela Meta.", 422);

            var phoneNode = matchedPhone.Value;
            var phoneNumberId = phoneNode.TryGetProperty("id", out var phoneIdElement)
                ? phoneIdElement.GetString() ?? ""
                : "";
            var isOnBusinessApp = phoneNode.TryGetProperty("is_on_biz_app", out var coexistenceElement) &&
                                  coexistenceElement.ValueKind == JsonValueKind.True;
            var platformType = phoneNode.TryGetProperty("platform_type", out var platformElement)
                ? platformElement.GetString() ?? ""
                : "";
            if (!isOnBusinessApp || !string.Equals(platformType, "CLOUD_API", StringComparison.OrdinalIgnoreCase))
                throw new DomainException(
                    "A Meta não confirmou a coexistência para este número. Conclua no WhatsApp Business a opção Conectar à Plataforma Business.",
                    422);

            entity.PhoneNumberId = Required(phoneNumberId, "Phone Number ID");
            entity.DisplayName = phoneNode.TryGetProperty("verified_name", out var verifiedNameElement)
                ? verifiedNameElement.GetString() ?? entity.DisplayName
                : entity.DisplayName;
            entity.Quality = phoneNode.TryGetProperty("quality_rating", out var qualityElement)
                ? qualityElement.GetString() ?? entity.Quality
                : entity.Quality;
            await db.SaveChangesAsync(cancellationToken);

            await SendMetaAsync(
                HttpMethod.Post,
                $"{entity.ApiVersion}/{entity.WabaId}/subscribed_apps",
                accessToken,
                JsonContent.Create(new { }),
                cancellationToken);

            await SendMetaAsync(
                HttpMethod.Post,
                $"{entity.ApiVersion}/{entity.PhoneNumberId}/smb_app_data",
                accessToken,
                JsonContent.Create(new { messaging_product = "whatsapp", sync_type = "smb_app_state_sync" }),
                cancellationToken);
            await SendMetaAsync(
                HttpMethod.Post,
                $"{entity.ApiVersion}/{entity.PhoneNumberId}/smb_app_data",
                accessToken,
                JsonContent.Create(new { messaging_product = "whatsapp", sync_type = "history" }),
                cancellationToken);

            entity.CoexistenceStatus = "Ativo";
            entity.CoexistenceError = "";
            entity.Status = "Configurado";
            entity.LastSyncAt = DateTimeOffset.UtcNow;
            entity.CoexistenceCompletedAt ??= DateTimeOffset.UtcNow;
            Touch(entity);
            Audit(actor, "chat.whatsapp.coexistence.connected", "chat_whatsapp_number", entity.Id,
                new { entity.PhoneNumberId, entity.WabaId, entity.ConnectionMode });
            await db.SaveChangesAsync(cancellationToken);
            return entity.Id;
        }
        catch (Exception exception)
        {
            entity.CoexistenceStatus = "Erro";
            entity.CoexistenceError = exception.Message.Length > 1500 ? exception.Message[..1500] : exception.Message;
            entity.Status = "Falha na conexão";
            Touch(entity);
            Audit(actor, "chat.whatsapp.coexistence.failed", "chat_whatsapp_number", entity.Id,
                new { Error = entity.CoexistenceError });
            await db.SaveChangesAsync(cancellationToken);
            throw exception is DomainException
                ? exception
                : new DomainException($"Falha ao concluir a coexistência: {exception.Message}", 502);
        }
    }

    public async Task<Guid> SaveTagAsync(SaveChatTagCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        RequireManage(actor, "manageCatalogs");
        var entity = command.Id.HasValue ? await db.ChatTags.SingleOrDefaultAsync(x => x.Id == command.Id, cancellationToken) : null;
        if (command.Id.HasValue && entity is null) throw new DomainException("Etiqueta não encontrada.", 404);
        entity ??= new ChatTag { Name = "" };
        entity.Name = Required(command.Name, "Nome");
        entity.Color = string.IsNullOrWhiteSpace(command.Color) ? "#2563eb" : command.Color.Trim();
        entity.DepartmentId = command.DepartmentId;
        entity.Active = command.Active;
        if (!command.Id.HasValue) db.ChatTags.Add(entity); else Touch(entity);
        Audit(actor, "chat.tag.saved", "chat_tag", entity.Id, new { entity.Name, entity.DepartmentId, entity.Active });
        await db.SaveChangesAsync(cancellationToken);
        return entity.Id;
    }

    public async Task<Guid> SaveQuickReplyAsync(SaveChatQuickReplyCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        RequireManage(actor, "manageCatalogs");
        var entity = command.Id.HasValue ? await db.ChatQuickReplies.SingleOrDefaultAsync(x => x.Id == command.Id, cancellationToken) : null;
        if (command.Id.HasValue && entity is null) throw new DomainException("Resposta rápida não encontrada.", 404);
        entity ??= new ChatQuickReply { Shortcut = "", Title = "", Body = "" };
        entity.Shortcut = Required(command.Shortcut, "Atalho").StartsWith('/') ? command.Shortcut.Trim() : $"/{command.Shortcut.Trim()}";
        entity.Title = Required(command.Title, "Título");
        entity.Body = Required(command.Body, "Mensagem");
        entity.DepartmentId = command.DepartmentId;
        entity.Active = command.Active;
        if (!command.Id.HasValue) db.ChatQuickReplies.Add(entity); else Touch(entity);
        Audit(actor, "chat.quick_reply.saved", "chat_quick_reply", entity.Id, new { entity.Shortcut, entity.DepartmentId, entity.Active });
        await db.SaveChangesAsync(cancellationToken);
        return entity.Id;
    }

    public async Task SetTagAsync(SetChatTagCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("chat", "edit");
        await AccessibleConversationAsync(command.ConversationId, actor, cancellationToken);
        if (!await db.ChatTags.AnyAsync(x => x.Id == command.TagId && x.Active, cancellationToken))
            throw new DomainException("Etiqueta não encontrada.");
        var link = await db.ChatConversationTags.SingleOrDefaultAsync(
            x => x.ConversationId == command.ConversationId && x.TagId == command.TagId, cancellationToken);
        if (command.Remove && link is not null) db.ChatConversationTags.Remove(link);
        if (!command.Remove && link is null)
            db.ChatConversationTags.Add(new ChatConversationTag { ConversationId = command.ConversationId, TagId = command.TagId });
        Audit(actor, command.Remove ? "chat.tag.removed" : "chat.tag.applied", "chat_conversation", command.ConversationId, new { command.TagId });
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<bool> VerifyWebhookAsync(string verifyToken, CancellationToken cancellationToken = default)
    {
        var tokens = await db.ChatWhatsAppNumbers.AsNoTracking()
            .Where(x => x.Active && x.VerifyTokenProtected != "")
            .Select(x => x.VerifyTokenProtected).ToListAsync(cancellationToken);
        return tokens.Any(token => SafeUnprotect(token) == verifyToken);
    }

    public async Task<bool> VerifyWebhookSignatureAsync(string phoneNumberId, string payload, string signature, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(signature) || !signature.StartsWith("sha256=", StringComparison.OrdinalIgnoreCase))
            return false;
        var protectedSecret = await db.ChatWhatsAppNumbers.AsNoTracking()
            .Where(x => (x.PhoneNumberId == phoneNumberId || x.WabaId == phoneNumberId) && x.Active)
            .Select(x => x.AppSecretProtected)
            .FirstOrDefaultAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(protectedSecret)) return false;
        var secret = SafeUnprotect(protectedSecret);
        if (string.IsNullOrWhiteSpace(secret)) return false;
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var computed = hmac.ComputeHash(Encoding.UTF8.GetBytes(payload));
        try
        {
            var received = Convert.FromHexString(signature["sha256=".Length..]);
            return CryptographicOperations.FixedTimeEquals(computed, received);
        }
        catch (FormatException)
        {
            return false;
        }
    }

    public async Task ReceiveWebhookAsync(ReceiveWhatsAppWebhookCommand command, CancellationToken cancellationToken = default)
    {
        if (await db.ChatWebhookEvents.AnyAsync(x => x.EventKey == command.EventKey, cancellationToken)) return;
        var webhook = new ChatWebhookEvent
        {
            EventKey = command.EventKey,
            PhoneNumberId = command.PhoneNumberId,
            PayloadJson = string.IsNullOrWhiteSpace(command.PayloadJson) ? "{}" : command.PayloadJson,
        };
        db.ChatWebhookEvents.Add(webhook);
        try
        {
            var number = await db.ChatWhatsAppNumbers.AsNoTracking()
                .SingleOrDefaultAsync(x => x.PhoneNumberId == command.PhoneNumberId && x.Active, cancellationToken)
                ?? throw new DomainException("Número WhatsApp recebido pelo webhook não está configurado.");
            var channel = await db.ChatChannels.AsNoTracking().SingleAsync(x => x.Id == number.ChannelId, cancellationToken);
            var queueId = channel.DefaultQueueId ?? await db.ChatQueues.Where(x => x.DepartmentId == number.DepartmentId && x.Active)
                .Select(x => x.Id).FirstOrDefaultAsync(cancellationToken);
            if (queueId == Guid.Empty) throw new DomainException("O setor do número não possui fila ativa.");
            var occurredAt = command.OccurredAt ?? DateTimeOffset.UtcNow;
            var inbound = command.Direction != "Saida";
            var phone = NormalizePhone(command.ContactPhone);
            var contact = await db.ChatContacts.FirstOrDefaultAsync(x => x.Phone == phone, cancellationToken);
            if (contact is null)
            {
                contact = new ChatContact { Name = string.IsNullOrWhiteSpace(command.ContactName) ? phone : command.ContactName, Phone = phone };
                db.ChatContacts.Add(contact);
            }
            var conversation = await db.ChatConversations
                .Where(x => x.ContactId == contact.Id && x.ChannelId == number.ChannelId && x.Status != "Encerrada")
                .OrderByDescending(x => x.LastMessageAt).FirstOrDefaultAsync(cancellationToken);
            if (conversation is null)
            {
                conversation = new ChatConversation
                {
                    Protocol = $"CHAT-TEMP-{Guid.NewGuid():N}",
                    ContactId = contact.Id,
                    ChannelId = number.ChannelId,
                    DepartmentId = number.DepartmentId,
                    QueueId = queueId,
                    AssigneeUserId = channel.DefaultAssigneeUserId,
                    Subject = $"WhatsApp · {contact.Name}",
                    UnreadCount = inbound && !command.Historical ? 1 : 0,
                    SlaDueAt = DateTimeOffset.UtcNow.AddHours(4),
                    LastMessageAt = occurredAt,
                };
                db.ChatConversations.Add(conversation);
                await db.SaveChangesAsync(cancellationToken);
                conversation.Protocol = $"CHAT-{DateTimeOffset.UtcNow:yyyy}-{conversation.Number:D6}";
            }
            else
            {
                if (inbound && !command.Historical) conversation.UnreadCount++;
                if (occurredAt > conversation.LastMessageAt) conversation.LastMessageAt = occurredAt;
                if (conversation.Status is "Resolvida" or "Encerrada") conversation.Status = "Aberta";
                Touch(conversation);
            }
            db.ChatMessages.Add(new ChatMessage
            {
                ConversationId = conversation.Id,
                ExternalId = command.ExternalMessageId,
                Direction = command.Direction == "Saida" ? "Saida" : "Entrada",
                Type = string.IsNullOrWhiteSpace(command.Type) ? "Texto" : command.Type,
                Body = string.IsNullOrWhiteSpace(command.Body) ? $"[{command.Type} recebido]" : command.Body,
                SenderName = command.Direction == "Saida" ? "WhatsApp Business" : contact.Name,
                Status = command.Historical ? "Importada" : command.Direction == "Saida" ? "Enviada pelo aplicativo" : "Recebida",
                CreatedAt = occurredAt,
            });
            webhook.Status = "Processado";
            webhook.ProcessedAt = DateTimeOffset.UtcNow;
            webhook.Attempts = 1;
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            webhook.Status = "Falha";
            webhook.Attempts = 1;
            webhook.LastError = ex.Message;
            await db.SaveChangesAsync(cancellationToken);
            throw;
        }
    }

    public async Task<Guid> UploadAttachmentAsync(UploadChatAttachmentCommand command, ActorContext actor, CancellationToken cancellationToken = default)
    {
        actor.RequirePermission("chat", "edit");
        if (fileStorage is null) throw new DomainException("O armazenamento de arquivos do chat não está configurado.", 503);
        if (command.SizeBytes <= 0 || command.SizeBytes > 50 * 1024 * 1024)
            throw new DomainException("O arquivo deve possuir até 50 MB.");
        var conversation = await AccessibleConversationAsync(command.ConversationId, actor, cancellationToken);
        var user = await CurrentUserAsync(actor, cancellationToken);
        var safeName = Path.GetFileName(command.FileName);
        if (string.IsNullOrWhiteSpace(safeName)) throw new DomainException("Nome de arquivo inválido.");
        var key = $"chat/{conversation.Id:N}/{Guid.NewGuid():N}/{safeName}";
        await fileStorage.StoreAsync(key, command.Content, command.ContentType, command.SizeBytes, cancellationToken);
        var message = new ChatMessage
        {
            ConversationId = conversation.Id,
            Direction = "Saida",
            Type = command.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase) ? "Imagem" : "Arquivo",
            Body = safeName,
            Internal = command.Internal,
            SenderUserId = user.Id,
            SenderName = user.DisplayName,
            Status = command.Internal ? "Interna" : "Anexada",
            MediaName = safeName,
            MediaContentType = command.ContentType,
            MediaStorageKey = key,
        };
        db.ChatMessages.Add(message);
        Audit(actor, "chat.attachment.added", "chat_conversation", conversation.Id, new { MessageId = message.Id, safeName, command.SizeBytes, command.Internal });
        conversation.LastMessageAt = DateTimeOffset.UtcNow;
        Touch(conversation);
        await db.SaveChangesAsync(cancellationToken);
        return message.Id;
    }

    public async Task<ChatAttachmentDownloadDto> GetAttachmentDownloadAsync(Guid messageId, ActorContext actor, CancellationToken cancellationToken = default)
    {
        if (fileStorage is null) throw new DomainException("O armazenamento de arquivos do chat não está configurado.", 503);
        var message = await db.ChatMessages.AsNoTracking().SingleOrDefaultAsync(x => x.Id == messageId, cancellationToken)
            ?? throw new DomainException("Arquivo não encontrado.", 404);
        await AccessibleConversationAsync(message.ConversationId, actor, cancellationToken);
        if (string.IsNullOrWhiteSpace(message.MediaStorageKey)) throw new DomainException("Esta mensagem não possui arquivo.", 404);
        return new ChatAttachmentDownloadDto(fileStorage.CreateDownloadUrl(
            message.MediaStorageKey, message.MediaName, message.MediaContentType));
    }

    private async Task SendWhatsAppTextAsync(ChatWhatsAppNumber number, string phone, string body, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(number.AccessTokenProtected) || string.IsNullOrWhiteSpace(number.PhoneNumberId))
            throw new DomainException("A credencial da Meta não está configurada para este número WhatsApp.");
        var token = SafeUnprotect(number.AccessTokenProtected);
        using var request = new HttpRequestMessage(HttpMethod.Post,
            $"https://graph.facebook.com/{number.ApiVersion}/{number.PhoneNumberId}/messages");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        request.Content = JsonContent.Create(new
        {
            messaging_product = "whatsapp",
            recipient_type = "individual",
            to = NormalizePhone(phone),
            type = "text",
            text = new { preview_url = false, body },
        });
        using var response = await httpClient.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new DomainException($"A Meta recusou a mensagem WhatsApp ({(int)response.StatusCode}). Verifique número, token e janela de atendimento.", 502);
    }

    private async Task<JsonDocument> SendMetaAsync(
        HttpMethod method,
        string relativeUrl,
        string? accessToken,
        HttpContent? content,
        CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(method, $"https://graph.facebook.com/{relativeUrl}")
        {
            Content = content,
        };
        if (!string.IsNullOrWhiteSpace(accessToken))
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var response = await httpClient.SendAsync(request, cancellationToken);
        var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var message = $"A Meta recusou a operação ({(int)response.StatusCode}).";
            try
            {
                using var errorDocument = JsonDocument.Parse(responseBody);
                if (errorDocument.RootElement.TryGetProperty("error", out var error) &&
                    error.TryGetProperty("message", out var errorMessage))
                    message = errorMessage.GetString() ?? message;
            }
            catch (JsonException)
            {
                // Não exponha respostas brutas que possam conter credenciais.
            }
            throw new DomainException($"Meta Graph API: {message}", 502);
        }

        try
        {
            return JsonDocument.Parse(string.IsNullOrWhiteSpace(responseBody) ? "{}" : responseBody);
        }
        catch (JsonException)
        {
            throw new DomainException("A Meta retornou uma resposta inválida.", 502);
        }
    }

    private async Task<ChatConversation> AccessibleConversationAsync(Guid id, ActorContext actor, CancellationToken cancellationToken)
    {
        var conversation = await db.ChatConversations.SingleOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new DomainException("Conversa não encontrada.", 404);
        await RequireDepartmentAccessAsync(actor, conversation.DepartmentId, cancellationToken);
        return conversation;
    }

    private async Task RequireDepartmentAccessAsync(ActorContext actor, Guid departmentId, CancellationToken cancellationToken)
    {
        if (actor.HasPermission("chat", "manage") || actor.HasCapability("chat", "viewOtherDepartments")) return;
        var user = await CurrentUserAsync(actor, cancellationToken);
        if (!await db.UserDepartments.AnyAsync(x => x.UserId == user.Id && x.DepartmentId == departmentId, cancellationToken))
            throw new DomainException("Seu usuário não possui acesso ao setor desta conversa.", 403);
    }

    private async Task<Guid[]> VisibleDepartmentIdsAsync(ActorContext actor, bool all, CancellationToken cancellationToken)
    {
        if (all) return await db.TaskDepartments.Select(x => x.Id).ToArrayAsync(cancellationToken);
        var user = await CurrentUserAsync(actor, cancellationToken);
        var ids = await db.UserDepartments.Where(x => x.UserId == user.Id).Select(x => x.DepartmentId).ToArrayAsync(cancellationToken);
        if (ids.Length > 0) return ids;
        return await db.TaskDepartments.Where(x => x.Name == actor.Department).Select(x => x.Id).ToArrayAsync(cancellationToken);
    }

    private async Task ValidateQueueAndAssigneeAsync(Guid departmentId, Guid queueId, Guid? assigneeUserId, CancellationToken cancellationToken)
    {
        if (!await db.ChatQueues.AnyAsync(x => x.Id == queueId && x.DepartmentId == departmentId && x.Active, cancellationToken))
            throw new DomainException("A fila selecionada não pertence ao setor.");
        if (assigneeUserId.HasValue && !await db.UserDepartments.AnyAsync(
                x => x.UserId == assigneeUserId && x.DepartmentId == departmentId, cancellationToken))
            throw new DomainException("O atendente selecionado não pertence ao setor.");
    }

    private async Task EnsureDepartmentAsync(Guid id, CancellationToken cancellationToken)
    {
        if (!await db.TaskDepartments.AnyAsync(x => x.Id == id, cancellationToken))
            throw new DomainException("Setor não encontrado.");
    }

    private async Task<AppUser> CurrentUserAsync(ActorContext actor, CancellationToken cancellationToken) =>
        await db.Users.SingleAsync(x => x.Email == actor.Email, cancellationToken);

    private ChatMessageDto ToMessageDto(ChatMessage x) =>
        new(x.Id, x.ConversationId, x.ExternalId, x.Direction, x.Type, x.Body, x.Internal,
            x.SenderUserId, x.SenderName, x.Status, x.ReplyToMessageId, x.MediaUrl, x.MediaName,
            x.MediaContentType, x.DeliveredAt, x.ReadAt, x.CreatedAt);

    private static ChatTagDto ToTagDto(ChatTag x) => new(x.Id, x.Name, x.Color, x.DepartmentId, x.Active);
    private static string Required(string value, string field) =>
        string.IsNullOrWhiteSpace(value) ? throw new DomainException($"{field} é obrigatório.") : value.Trim();
    private static string NormalizePhone(string value) => new(value.Where(char.IsDigit).ToArray());
    private string SafeUnprotect(string value)
    {
        try { return protector.Unprotect(value); }
        catch { return ""; }
    }
    private static void EnsureVersion(Entity entity, long version)
    {
        if (entity.Version != version) throw new DomainException("A conversa foi alterada por outro usuário.", 409);
    }
    private static void Touch(Entity entity)
    {
        entity.UpdatedAt = DateTimeOffset.UtcNow;
        entity.Version++;
    }
    private static void RequireCapabilityOrManage(ActorContext actor, string capability)
    {
        if (!actor.HasPermission("chat", "manage")) actor.RequireCapability("chat", capability);
    }
    private static void RequireManage(ActorContext actor, string capability)
    {
        actor.RequirePermission("chat", "manage");
        if (!actor.HasCapability("chat", capability))
            throw new DomainException("Seu grupo não possui esta permissão específica do chat.", 403);
    }
    private void Audit(ActorContext actor, string action, string resource, Guid id, object details) =>
        db.AuditEvents.Add(new AuditEvent
        {
            ActorEmail = actor.Email,
            Action = action,
            Resource = resource,
            ResourceId = id.ToString(),
            Module = "chat",
            DetailsJson = JsonSerializer.Serialize(details),
        });
}
