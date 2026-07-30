using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Dontus.Operations.Infrastructure;

public sealed class OperationsDbContextFactory : IDesignTimeDbContextFactory<OperationsDbContext>
{
    public OperationsDbContext CreateDbContext(string[] args)
    {
        var connectionString =
            Environment.GetEnvironmentVariable("ConnectionStrings__Operations")
            ?? "Host=localhost;Port=5432;Database=dontus;Username=dontus;Password=dontus_local";

        var options = new DbContextOptionsBuilder<OperationsDbContext>()
            .UseNpgsql(connectionString)
            .Options;

        return new OperationsDbContext(options);
    }
}
