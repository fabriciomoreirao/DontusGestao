namespace Dontus.Operations.Domain;

public sealed record ScreenDefinition(string Code, string Label, string Area, int Order, bool SupportsIndicators = false);

public static class ScreenCatalog
{
    public const string ViewIndicatorsCapability = "viewIndicators";

    public static readonly IReadOnlyCollection<ScreenDefinition> All =
    [
        new("dashboard", "Dashboard", "Principal", 10),
        new("customers", "Clientes | Customer 360", "Principal", 15),
        new("diary", "Diário de Bordo", "Módulos", 20),
        new("notes", "Anotações", "Módulos", 30),
        new("reminders", "Lembretes", "Módulos", 35),
        new("internalChat", "Chat interno", "Módulos", 40),
        new("tasks", "Tarefas", "Módulos", 50, true),
        new("work", "Agenda", "Módulos", 60, true),
        new("suggestions", "Sugestões", "Módulos", 70, true),
        new("notices", "Avisos", "Módulos", 80),
        new("chat", "WhatsApp", "Módulos", 90),
        new("access", "Acesso", "Módulos", 100, true),
        new("waitingQueue", "Fila de espera", "Operação", 110, true),
        new("support", "Atendimentos", "Operação", 120, true),
        new("commercial", "CRM comercial e CRM retenção", "Operação", 130, true),
        new("cs", "Acompanhamento Ativação, Retenção e Contas estratégicas", "Operação", 140, true),
        new("cancellations", "Cancelamentos", "Operação", 145),
        new("marketing", "Gestão de Marketing", "Operação", 150, true),
        new("ti", "Desenvolvimento", "Operação", 160, true),
        new("lia", "Acompanhamento LIA", "Operação", 170, true),
        new("hr", "Gestão RH", "Operação", 175),
        new("commissions", "Comissões", "Operação", 180, true),
        new("goals", "Metas", "Operação", 190, true),
        new("referrals", "Indicações", "Operação", 200, true),
        new("surveys", "Pesquisa de satisfação", "Administração", 210),
        new("admin", "Administração, Processo seletivo e auditoria", "Administração", 230, true),
    ];

    public static bool Exists(string code) =>
        All.Any(screen => string.Equals(screen.Code, code, StringComparison.OrdinalIgnoreCase));
}
