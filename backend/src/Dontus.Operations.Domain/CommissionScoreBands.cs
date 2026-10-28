using System.Text.Json;

namespace Dontus.Operations.Domain;

public sealed record CommissionScoreBand(decimal Min, decimal? Max, decimal Percentage);
public static class CommissionScoreBands
{
    public static IReadOnlyList<CommissionScoreBand> Parse(JsonElement tiers)
    {
        if(tiers.ValueKind!=JsonValueKind.Array)throw new DomainException("Configure as faixas de score.");
        var bands=new List<CommissionScoreBand>();decimal cursor=0;var entries=tiers.EnumerateArray().ToArray();
        foreach(var tier in entries)
        {
            if(!tier.TryGetProperty("min",out var min)||!min.TryGetDecimal(out var start)||start!=cursor||!tier.TryGetProperty("max",out var max)||!tier.TryGetProperty("percentage",out var percentage)||!percentage.TryGetDecimal(out var rate)||rate<0||rate>100)
                throw new DomainException("As faixas devem ser contínuas e ter comissão entre 0% e 100%.");
            decimal? end=max.ValueKind==JsonValueKind.Null?null:max.TryGetDecimal(out var number)?number:throw new DomainException("Limite de score inválido.");
            if(end.HasValue&&(end<=start||end>100)||!end.HasValue&&(bands.Count!=3||start!=100||entries.Length!=4))throw new DomainException("Configure as quatro faixas de score até a faixa acima de 100%.");
            bands.Add(new(start,end,rate));cursor=end??100;
        }
        if(bands.Count==4&&bands[3].Max is null)
        {
            if(bands[0].Min!=0||bands[0].Max!=50||bands[0].Percentage!=0||bands[1].Min!=50||bands[1].Max!=75||bands[2].Min!=75||bands[2].Max!=100)throw new DomainException("Use as faixas abaixo de 50%, 50% a 75%, 75% a 100% e acima de 100%.");
            return bands;
        }
        if(cursor!=100||bands.Count!=3)throw new DomainException("Configure as faixas de score.");
        // Legacy rules stored the three configured percentages without a separate zero band.
        return [new(0,50,0),new(50,75,bands[0].Percentage),new(75,100,bands[1].Percentage),new(100,null,bands[2].Percentage)];
    }
    public static CommissionScoreBand Select(IReadOnlyList<CommissionScoreBand> bands,decimal score)=>bands.First(b=>b.Max is null?score>100:score>=b.Min&&(b.Max==100?score<=100:score<b.Max));
}
