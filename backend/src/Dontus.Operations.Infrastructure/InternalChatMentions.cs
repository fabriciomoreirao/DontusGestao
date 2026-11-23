using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;

namespace Dontus.Operations.Infrastructure;

internal static class InternalChatMentions
{
    public static IReadOnlyCollection<InternalChatMentionDto> Read(string json)
    {
        try { return JsonSerializer.Deserialize<InternalChatMentionDto[]>(json) ?? []; }
        catch (JsonException) { return []; }
    }

    public static bool Fits(string body, InternalChatMentionDto mention) => mention.Start >= 0
        && mention.Length > 1 && mention.Start <= body.Length - mention.Length
        && mention.Length == mention.Name.Length + 1
        && body.Substring(mention.Start, mention.Length) == $"@{mention.Name}"
        && (mention.Start == 0 || !IsWord(body[mention.Start - 1]) && body[mention.Start - 1] != '@')
        && (mention.Start + mention.Length == body.Length || !IsWord(body[mention.Start + mention.Length]));

    private static bool IsWord(char value) => char.IsLetterOrDigit(value) || value == '_';

    public static IReadOnlyCollection<InternalChatMentionDto> Validate(string body,
        IReadOnlyCollection<InternalChatMentionDto>? mentions, IReadOnlyDictionary<Guid, string> participants)
    {
        if (mentions is null || mentions.Count == 0) return [];
        if (mentions.Count > 100) throw new DomainException("Use até 100 marcações por mensagem.");
        var end = 0;
        var result = new List<InternalChatMentionDto>();
        foreach (var mention in mentions.OrderBy(entry => entry.Start))
        {
            if (mention.Name is null || !Fits(body, mention) || mention.Start < end
                || !participants.TryGetValue(mention.UserId, out var name) || mention.Name != name)
                throw new DomainException("Selecione novamente os participantes mencionados nesta conversa.");
            result.Add(mention);
            end = mention.Start + mention.Length;
        }
        return result;
    }

    public static IReadOnlyCollection<InternalChatMentionDto> Reconcile(string before, string after, string json)
    {
        var start = 0;
        while (start < before.Length && start < after.Length && before[start] == after[start]) start++;
        var oldEnd = before.Length; var newEnd = after.Length;
        while (oldEnd > start && newEnd > start && before[oldEnd - 1] == after[newEnd - 1]) { oldEnd--; newEnd--; }
        return Read(json).Select(mention => mention.Start + mention.Length <= start ? mention
            : mention.Start >= oldEnd ? mention with { Start = mention.Start + newEnd - oldEnd } : null)
            .Where(mention => mention is not null && Fits(after, mention)).Select(mention => mention!).ToArray();
    }
}
