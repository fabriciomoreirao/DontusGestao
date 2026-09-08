namespace Dontus.Operations.Domain;

public sealed record ScreenDefinition(string Code, string Label, string Area, int Order);

public static class ScreenCatalog
{
    public static readonly IReadOnlyCollection<ScreenDefinition> All =
    [
        new("dashboard", "Dashboard", "Principal", 10),
        new("diary", "Diário de Bordo", "Módulos", 20),
        new("notes", "Anotações", "Módulos", 30),
        new("internalChat", "Chat interno", "Módulos", 40),
        new("tasks", "Tarefas", "Módulos", 50),
        new("work", "Agenda", "Módulos", 60),
        new("suggestions", "Sugestões", "Módulos", 70),
        new("notices", "Avisos", "Módulos", 80),
        new("chat", "WhatsApp", "Módulos", 90),
        new("access", "Acesso", "Módulos", 100),
        new("waitingQueue", "Fila de espera", "Operação", 110),
        new("support", "Atendimentos", "Operação", 120),
        new("commercial", "CRM comercial e retenção", "Operação", 130),
        new("cs", "Acompanhamentos e contas estratégicas", "Operação", 140),
        new("marketing", "Gestão de Marketing", "Operação", 150),
        new("ti", "Desenvolvimento", "Operação", 160),
        new("lia", "Acompanhamento LIA", "Operação", 170),
        new("commissions", "Comissões", "Operação", 180),
        new("goals", "Metas", "Operação", 190),
        new("referrals", "Indicações", "Operação", 200),
        new("surveys", "Pesquisa de satisfação", "Administração", 210),
        new("catalogs", "Configurações das funcionalidades", "Administração", 220),
        new("admin", "Administração, permissões e auditoria", "Administração", 230),
    ];

    public static bool Exists(string code) =>
        All.Any(screen => string.Equals(screen.Code, code, StringComparison.OrdinalIgnoreCase));
}
