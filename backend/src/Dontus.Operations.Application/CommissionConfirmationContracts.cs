namespace Dontus.Operations.Application;

public sealed record ConfirmationEntry(Guid Id, long Version);
public sealed record GenerateCommissionConfirmation(string Module, string Scope, string Competence,
    IReadOnlyList<ConfirmationEntry> Entries, Dictionary<string, string>? Filters);
public sealed record SignaturePoint(double X, double Y);
public sealed record SignatureStroke(IReadOnlyList<SignaturePoint> Points);
public sealed record SignatureBrowser(string Language, string Platform, string TimeZone, int ScreenWidth, int ScreenHeight);
public sealed record AgreeCommissionConfirmation(bool Agree, IReadOnlyList<SignatureStroke>? Signature = null, SignatureBrowser? Browser = null);
public sealed record CommissionReportRow(Guid Id, long Version, string CustomerName, string Product,
    string CustomerStatus, string SourceStatus, decimal? Score, string UsageStatus, long SaleValueCents,
    long CommissionCents, string RuleLabel, string Decision, string Reason, string DecidedBy, string DecidedAt,
    string KickOffAt, string TrainingAt, string SingleAlignmentAt, string Sector, string CustomerCode = "", bool Manual = false);
public sealed record CommissionReportSnapshot(string Module, string Scope, string Competence, string EmployeeName,
    Dictionary<string, string> Filters, IReadOnlyList<CommissionReportRow> Rows, long TotalCents);
