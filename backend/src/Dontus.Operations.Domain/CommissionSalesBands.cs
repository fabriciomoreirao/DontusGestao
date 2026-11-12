using System.Text.Json;

namespace Dontus.Operations.Domain;

public sealed record CommissionSalesBand(long MinCents, long? MaxCents, decimal Percentage);
public static class CommissionSalesBands
{
    public static IReadOnlyList<CommissionSalesBand> Parse(JsonElement element)
    {
        try
        {
            if (element.ValueKind != JsonValueKind.Array || element.GetArrayLength() is < 1 or > 20) throw new InvalidOperationException();
            var bands = element.EnumerateArray().Select(t => new CommissionSalesBand(t.GetProperty("minCents").GetInt64(),
                t.GetProperty("maxCents").ValueKind == JsonValueKind.Null ? null : t.GetProperty("maxCents").GetInt64(), t.GetProperty("percentage").GetDecimal())).ToArray();
            long cursor = 0;
            for (var index = 0; index < bands.Length; index++)
            {
                var band = bands[index];
                if (band.MinCents != cursor || band.MinCents is < 0 or > 100000000000 || band.Percentage is < 0 or > 100
                    || (index == bands.Length - 1 ? band.MaxCents is not null : band.MaxCents is null || band.MaxCents <= cursor || band.MaxCents > 100000000000)) throw new InvalidOperationException();
                cursor = band.MaxCents ?? cursor;
            }
            return bands;
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException or KeyNotFoundException or FormatException or OverflowException)
        { throw new DomainException("As faixas de vendas devem começar em zero, ser contínuas, terminar sem limite e ter percentuais entre 0% e 100%."); }
    }

    public static CommissionSalesBand Select(IReadOnlyList<CommissionSalesBand> bands, long totalCents) =>
        bands.FirstOrDefault(b => totalCents >= b.MinCents && (b.MaxCents is null || totalCents < b.MaxCents))
        ?? throw new DomainException("Não foi possível determinar a faixa do total vendido.");
}
