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
            "Não consigo confirmar um paciente."), actor);

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
            null, true, false, true, false, "", ""), actor);

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
            null, true, false, true, false, "", ""), actor);
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

    private static async Task<(ChatService Service, ActorContext Actor)> InitializeAsync(OperationsDbContext db)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["AccessControl:BootstrapAdminEmail"] = "gestor@dontus.local",
            ["AccessControl:BootstrapAdminName"] = "Gestor Dontus",
        }).Build();
        var access = new AccessControlService(db, configuration);
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
