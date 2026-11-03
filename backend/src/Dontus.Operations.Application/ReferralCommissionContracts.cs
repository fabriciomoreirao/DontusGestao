namespace Dontus.Operations.Application;

public sealed record ReferralCommissionRuleInput(Guid ModuleId, string Type, decimal Percentage, long FixedCents);
