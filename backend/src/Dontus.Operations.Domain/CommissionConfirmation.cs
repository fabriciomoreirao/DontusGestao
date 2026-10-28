namespace Dontus.Operations.Domain;

public sealed class CommissionConfirmation : Entity
{
    public string Module { get; set; } = "commissions";
    public string Scope { get; set; } = "";
    public string Competence { get; set; } = "";
    public string EmployeeKey { get; set; } = "";
    public string EmployeeName { get; set; } = "";
    public Guid? EmployeeUserId { get; set; }
    public string TokenHash { get; set; } = "";
    public string ProtectedToken { get; set; } = "";
    public string SnapshotJson { get; set; } = "{}";
    public string CreatedBy { get; set; } = "";
    public DateTimeOffset? AgreedAt { get; set; }
    public DateTimeOffset? InvalidatedAt { get; set; }
    public Guid? SignedByUserId { get; set; }
    public string SignedByName { get; set; } = "";
    public string SignedByEmail { get; set; } = "";
    public string SignatureJson { get; set; } = "[]";
    public string BrowserJson { get; set; } = "{}";
    public string EvidenceHash { get; set; } = "";
    public byte[] SignedPdf { get; set; } = [];
}
