using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Dontus.Operations.Tests;

public sealed class ChatServiceTests
{
    [Fact]
    public async Task Creates_conversation_with_department_queue_and_automatic_protocol()
    {
        await using var db = CreateContext();
        var (service, actor) = await InitializeAsync(db);
        var channel = await db.ChatChannels.FirstAsync(x => x.Type == "Interno");

        var id = await service.CreateConversationAsync(new CreateChatConversationCommand(
            "Clínica Sorriso", "5511999990000", "contato@clinica.local", null,
            "Clínica Sorriso", channel.Id, null, null, "Ajuda com agenda", "Alta",
            "Não consigo confirmar um paciente.", false, null, null), actor);

        var conversation = await db.ChatConversations.SingleAsync(x => x.Id == id);
        Assert.StartsWith("CHAT-", conversation.Protocol);
        Assert.Equal(channel.DepartmentId, conversation.DepartmentId);
        Assert.Single(await db.ChatMessages.Where(x => x.ConversationId == id).ToListAsync());
    }

    [Fact]
    public async Task Rejects_whatsapp_number_when_channel_belongs_to_another_department()
    {
        await using var db = CreateContext();
        var (service, actor) = await InitializeAsync(db);
        var departments = await db.TaskDepartments.Take(2).ToArrayAsync();
        var channelId = await service.SaveChannelAsync(new SaveChatChannelCommand(
            null, "WhatsApp A", "WhatsApp", departments[0].Id,
            (await db.ChatQueues.FirstAsync(x => x.DepartmentId == departments[0].Id)).Id,
            null, true, false, true, false, "", "", false, ""), actor);

        var exception = await Assert.ThrowsAsync<DomainException>(() =>
            service.SaveWhatsAppNumberAsync(new SaveChatWhatsAppNumberCommand(
                null, channelId, departments[1].Id, "Número B", "Atendimento B",
                "5511999991111", "phone-id", "waba", "business", "CloudApi", "", "",
                "token", "verify", "secret", "v23.0", true), actor));

        Assert.Contains("mesmo vínculo exclusivo", exception.Message);
    }

    [Fact]
    public async Task Webhook_is_idempotent_and_routes_message_to_number_department()
    {
        await using var db = CreateContext();
        var (service, actor) = await InitializeAsync(db);
        var department = await db.TaskDepartments.FirstAsync();
        var queue = await db.ChatQueues.FirstAsync(x => x.DepartmentId == department.Id);
        var channelId = await service.SaveChannelAsync(new SaveChatChannelCommand(
            null, "WhatsApp oficial", "WhatsApp", department.Id, queue.Id,
            null, true, false, true, false, "", "", false, ""), actor);
        await service.SaveWhatsAppNumberAsync(new SaveChatWhatsAppNumberCommand(
            null, channelId, department.Id, "Principal", "Dontus", "551130000000",
            "phone-number-id", "waba", "business", "CloudApi", "", "",
            "token", "verify", "secret", "v23.0", true), actor);
        var command = new ReceiveWhatsAppWebhookCommand(
            "wamid.unique", "phone-number-id", "wamid.unique", "5511999992222",
            "Joana", "Entrada", "text", "Preciso de ajuda", null, false,
            """{"object":"whatsapp_business_account"}""");

        await service.ReceiveWebhookAsync(command);
        await service.ReceiveWebhookAsync(command);

        Assert.Single(await db.ChatWebhookEvents.ToListAsync());
        Assert.Single(await db.ChatMessages.Where(x => x.ExternalId == "wamid.unique").ToListAsync());
        Assert.Equal(department.Id, (await db.ChatConversations.SingleAsync()).DepartmentId);
    }

    [Fact]
    public async Task Closes_in_batch_sends_farewell_and_records_satisfaction_report()
    {
        await using var db = CreateContext();
        var (service, actor) = await InitializeAsync(db);
        var channel = await db.ChatChannels.FirstAsync(x => x.Type == "Interno");
        channel.SendClosingMessage = true;
        channel.ClosingMessage = "Obrigado pelo contato. Atendimento finalizado.";
        await db.SaveChangesAsync();

        var firstId = await service.CreateConversationAsync(new CreateChatConversationCommand(
            "Cliente Um", "551199990001", "", null, "Clínica Um", channel.Id,
            null, null, "Financeiro", "Normal", "Preciso da segunda via.", false, null, null), actor);
        var secondId = await service.CreateConversationAsync(new CreateChatConversationCommand(
            "Cliente Dois", "551199990002", "", null, "Clínica Dois", channel.Id,
            null, null, "Agenda", "Normal", "Quero confirmar meu horário.", false, null, null), actor);

        var closed = await service.BatchCloseAsync(
            new BatchCloseChatConversationsCommand([firstId, secondId]), actor);

        Assert.Equal(2, closed);
        Assert.Equal(2, await db.ChatConversations.CountAsync(x => x.Status == "Encerrada"));
        Assert.Equal(2, await db.ChatMessages.CountAsync(x => x.Type == "Despedida"));

        var first = await db.ChatConversations.SingleAsync(x => x.Id == firstId);
        await service.UpdateConversationAsync(new UpdateChatConversationCommand(
            firstId, null, null, null, null, "Financeiro · boleto", 5,
            "Atendimento rápido e claro.", first.Version), actor);

        first = await db.ChatConversations.SingleAsync(x => x.Id == firstId);
        Assert.Equal(5, first.SatisfactionScore);
        Assert.Equal("Financeiro · boleto", first.Subject);
        Assert.NotNull(first.SatisfactionRespondedAt);
    }

    [Fact]
    public async Task Inbox_pages_ten_records_and_searches_beyond_the_old_limit()
    {
        await using var db = CreateContext();
        var (service, actor) = await InitializeAsync(db);
        var rows = await SeedInboxAsync(db, 315);
        var first = await service.GetModuleAsync(actor);
        var second = await service.GetModuleAsync(actor, query: new ChatInboxQuery(Page: 2));
        Assert.Equal(10, first.Conversations.Count);
        Assert.Equal(10, second.Conversations.Count);
        Assert.Empty(first.Conversations.Select(x => x.Id).Intersect(second.Conversations.Select(x => x.Id)));
        Assert.Equal(315, second.Page.Total);
        Assert.Equal(315, first.Metrics.Open);
        var last = await service.GetModuleAsync(actor, query: new ChatInboxQuery(Page: int.MaxValue));
        Assert.Equal(32, last.Page.Number);
        Assert.Equal(5, last.Conversations.Count);
        var search = await service.GetModuleAsync(actor, query: new ChatInboxQuery(Search: rows[^1].Protocol));
        Assert.Equal(rows[^1].Id, Assert.Single(search.Conversations).Id);
    }

    [Fact]
    public async Task Inbox_returns_previews_and_only_fifty_messages_for_selected_conversation()
    {
        await using var db = CreateContext();
        var (service, actor) = await InitializeAsync(db);
        var rows = await SeedInboxAsync(db, 12);
        var timestamp = DateTimeOffset.UtcNow.AddHours(-1);
        foreach (var conversation in rows)
            db.ChatMessages.AddRange(Enumerable.Range(0, 120).Select(i => new ChatMessage
            {
                ConversationId = conversation.Id,
                Body = $"Mensagem {i}",
                CreatedAt = timestamp,
            }));
        await db.SaveChangesAsync();
        var module = await service.GetModuleAsync(actor);
        Assert.True(module.HasMoreMessages);
        Assert.Equal(59, module.Conversations.Sum(x => x.Messages.Count));
        var selected = module.Conversations.Single(x => x.Id == module.SelectedConversationId);
        Assert.Equal(50, selected.Messages.Count);
        var middle = await service.GetMessagesAsync(selected.Id, selected.Messages.First().Id, actor);
        var oldest = await service.GetMessagesAsync(selected.Id, middle.Messages.First().Id, actor);
        Assert.True(middle.HasMore);
        Assert.False(oldest.HasMore);
        Assert.Equal(20, oldest.Messages.Count);
        Assert.Equal(120, selected.Messages.Concat(middle.Messages).Concat(oldest.Messages).Select(x => x.Id).Distinct().Count());
    }

    [Fact]
    public async Task Inbox_and_message_history_enforce_department_and_closed_history_permissions()
    {
        await using var db = CreateContext();
        var (service, actor) = await InitializeAsync(db);
        var rows = await SeedInboxAsync(db, 3);
        var user = await db.Users.SingleAsync(x => x.Email == actor.Email);
        db.UserDepartments.RemoveRange(await db.UserDepartments.Where(x => x.UserId == user.Id && x.DepartmentId != rows[0].DepartmentId).ToListAsync());
        if (!await db.UserDepartments.AnyAsync(x => x.UserId == user.Id && x.DepartmentId == rows[0].DepartmentId))
            db.UserDepartments.Add(new UserDepartment { UserId = user.Id, DepartmentId = rows[0].DepartmentId });
        rows[1].Status = "Encerrada";
        rows[2].DepartmentId = (await db.TaskDepartments.FirstAsync(x => x.Id != rows[0].DepartmentId)).Id;
        await db.SaveChangesAsync();
        var restricted = actor with { FullAccess = false, Permissions = [new("chat", true, false, false, false, false)] };
        Assert.Equal(rows[0].Id, Assert.Single((await service.GetModuleAsync(restricted)).Conversations).Id);
        foreach (var id in new[] { rows[1].Id, rows[2].Id })
            Assert.Equal(404, (await Assert.ThrowsAsync<DomainException>(() => service.GetMessagesAsync(id, null, restricted))).StatusCode);
        Assert.Empty((await service.GetModuleAsync(restricted, query: new ChatInboxQuery(DepartmentId: rows[2].DepartmentId))).Conversations);
    }

    [Fact]
    public async Task Reports_include_the_period_across_inbox_pages_without_message_histories()
    {
        await using var db = CreateContext();
        var (service, actor) = await InitializeAsync(db);
        var rows = await SeedInboxAsync(db, 25);
        db.ChatMessages.Add(new ChatMessage { ConversationId = rows[0].Id, Body = "Histórico privado extenso" });
        await db.SaveChangesAsync();
        var report = await service.GetReportAsync(DateTimeOffset.UtcNow.AddDays(-2), DateTimeOffset.UtcNow.AddDays(1), actor);
        Assert.Equal(25, report.Count);
        Assert.All(report, x => Assert.Empty(x.Messages));
        var restricted = actor with { FullAccess = false, Permissions = [new("chat", true, false, false, false, false, ["viewOtherDepartments"])] };
        Assert.Empty(await service.GetReportAsync(DateTimeOffset.UtcNow.AddDays(-2), DateTimeOffset.UtcNow.AddDays(1), restricted));
    }

    [Theory]
    [InlineData(10, 10)]
    [InlineData(30, 30)]
    [InlineData(50, 50)]
    [InlineData(100, 65)]
    [InlineData(999, 10)]
    public async Task Inbox_respects_allowed_page_sizes(int requested, int expected)
    {
        await using var db = CreateContext();
        var (service, actor) = await InitializeAsync(db);
        await SeedInboxAsync(db, 65);
        var result = await service.GetModuleAsync(actor, query: new ChatInboxQuery(PageSize: requested));
        Assert.Equal(expected, result.Conversations.Count);
        Assert.Equal(65, result.Page.Total);
        Assert.Equal(requested == 999 ? 10 : requested, result.Page.Size);
    }

    private static async Task<ChatConversation[]> SeedInboxAsync(OperationsDbContext db, int count)
    {
        var channel = await db.ChatChannels.FirstAsync();
        var contact = new ChatContact { Name = "Cliente de validação", Phone = "5511999990000" };
        db.ChatContacts.Add(contact);
        var at = DateTimeOffset.UtcNow;
        var rows = Enumerable.Range(0, count).Select(i => new ChatConversation
        {
            Number = i + 1,
            Protocol = $"CHAT-TEST-{i:D5}",
            ContactId = contact.Id,
            ChannelId = channel.Id,
            DepartmentId = channel.DepartmentId,
            QueueId = channel.DefaultQueueId!.Value,
            Subject = $"Assunto {i}",
            CreatedAt = at.AddMinutes(-i),
            LastMessageAt = at.AddMinutes(-i),
        }).ToArray();
        db.ChatConversations.AddRange(rows);
        await db.SaveChangesAsync();
        return rows;
    }

    private static async Task<(ChatService Service, ActorContext Actor)> InitializeAsync(OperationsDbContext db)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["AccessControl:BootstrapAdminEmail"] = "gestor@dontus.local",
            ["AccessControl:BootstrapAdminName"] = "Gestor Dontus",
        }).Build();
        var access = new AccessControlService(db, configuration, new RecordingPasswordEmailSender());
        await access.InitializeAsync();
        var tasks = new TaskService(db);
        await tasks.InitializeAsync();
        var protector = new EphemeralDataProtectionProvider();
        var service = new ChatService(db, protector, new HttpClient());
        await service.InitializeAsync();
        var actor = await access.ResolveActorAsync(new AuthenticatedIdentity("gestor@dontus.local", "Gestor"));
        return (service, actor);
    }

    private static OperationsDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<OperationsDbContext>()
            .UseInMemoryDatabase($"dontus-chat-tests-{Guid.NewGuid():N}")
            .Options;
        return new OperationsDbContext(options);
    }
}
