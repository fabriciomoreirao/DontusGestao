using System.Globalization;
using System.Text.Json;

namespace Dontus.Operations.Domain;

public sealed record EmployeeAccessWindow(int Day, string Start, string End);
public sealed record EmployeeAccessSchedule(bool Enabled, IReadOnlyCollection<EmployeeAccessWindow> Windows);

public static class EmployeeAccessPolicy
{
    public const string DeniedMessage = "Acesso proibido fora do expediente.";
    public const string DeniedCode = "access_outside_hours";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly TimeZoneInfo Zone = TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo");

    public static EmployeeAccessSchedule Read(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new(false, []);
        try { return JsonSerializer.Deserialize<EmployeeAccessSchedule>(json, JsonOptions) ?? new(true, []); }
        catch (JsonException) { return new(true, []); }
    }

    public static string ValidateAndSerialize(EmployeeAccessSchedule schedule)
    {
        var windows = schedule.Windows ?? [];
        if (schedule.Enabled && windows.Count == 0) throw new DomainException("Selecione ao menos um dia e horário de acesso.");
        if (windows.Count > 28) throw new DomainException("Cadastre até 28 intervalos de expediente.");
        foreach (var window in windows)
            if (window.Day is < 0 or > 6 || !Parse(window.Start, out var start) || !Parse(window.End, out var end) || start == end)
                throw new DomainException("Informe dias válidos e horários de início e fim diferentes no formato HH:mm.");
        return JsonSerializer.Serialize(new EmployeeAccessSchedule(schedule.Enabled,
            windows.OrderBy(window => window.Day).ThenBy(window => window.Start).ToArray()), JsonOptions);
    }

    public static DateTimeOffset? RequireAllowed(string json, DateTimeOffset now)
    {
        var schedule = Read(json);
        if (!schedule.Enabled) return null;
        var localDate = TimeZoneInfo.ConvertTime(now, Zone).Date;
        var intervals = new List<(DateTimeOffset Start, DateTimeOffset End)>();
        foreach (var window in schedule.Windows ?? [])
        {
            if (window.Day is < 0 or > 6 || !Parse(window.Start, out var start) || !Parse(window.End, out var end) || start == end)
                throw Denied();
            for (var day = -1; day <= 8; day++)
            {
                var date = localDate.AddDays(day);
                if ((int)date.DayOfWeek != window.Day) continue;
                var from = date.Add(start.ToTimeSpan());
                var until = date.Add(end.ToTimeSpan()).AddDays(end < start ? 1 : 0);
                intervals.Add((ToUtc(from), ToUtc(until)));
            }
        }
        var current = intervals.Where(interval => interval.Start <= now && now < interval.End).ToArray();
        if (current.Length == 0) throw Denied();
        var cutoff = current.Max(interval => interval.End);
        foreach (var interval in intervals.OrderBy(interval => interval.Start))
            if (interval.Start <= cutoff && interval.End > cutoff) cutoff = interval.End;
        return cutoff;
    }

    private static DomainException Denied() => new(DeniedMessage, 401, DeniedCode);
    private static bool Parse(string value, out TimeOnly time) => TimeOnly.TryParseExact(value, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out time);
    private static DateTimeOffset ToUtc(DateTime date) => new DateTimeOffset(date, Zone.GetUtcOffset(date)).ToUniversalTime();
}
