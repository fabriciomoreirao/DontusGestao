namespace Dontus.Operations.Domain;

public sealed record ScreenDefinition(string Code, string Label, string Area, int Order);

public static class ScreenCatalog
{
    public static readonly IReadOnlyCollection<ScreenDefinition> All =
    [
        new("dashboard", "Visão geral", "Operação", 10),
        new("customers", "Customer 360", "Operação", 20),
        new("commercial", "Comercial", "Operação", 30),
        new("cs", "Customer Success", "Operação", 40),
        new("lia", "Implantação LIA", "Operação", 50),
        new("support", "Suporte", "Operação", 60),
        new("ti", "Demandas de TI", "Operação", 70),
        new("finance", "Financeiro", "Gestão", 80),
        new("procurement", "Compras e Patrimônio", "Gestão", 90),
        new("approvals", "Aprovações", "Gestão", 100),
        new("work", "Agenda", "Gestão", 110),
        new("tasks", "Tarefas", "Gestão", 120),
        new("chat", "Atendimento omnichannel", "Operação", 125),
        new("reporting", "Indicadores", "Gestão", 130),
        new("catalogs", "Cadastros", "Sistema", 140),
        new("admin", "Administração", "Sistema", 150),
    ];

    public static bool Exists(string code) =>
        All.Any(screen => string.Equals(screen.Code, code, StringComparison.OrdinalIgnoreCase));
}
