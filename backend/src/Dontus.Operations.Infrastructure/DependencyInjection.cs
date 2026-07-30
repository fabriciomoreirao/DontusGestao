using Dontus.Operations.Application;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Dontus.Operations.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddOperationsInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Operations")
            ?? throw new InvalidOperationException("ConnectionStrings:Operations não foi configurada.");

        services.AddDbContext<OperationsDbContext>(options =>
            options.UseNpgsql(connectionString, npgsql =>
            {
                npgsql.MigrationsAssembly(typeof(OperationsDbContext).Assembly.FullName)
                    .EnableRetryOnFailure(5);
                npgsql.UseQuerySplittingBehavior(QuerySplittingBehavior.SplitQuery);
            }));
        services.AddScoped<IOperationsService, OperationsService>();
        services.AddScoped<IAccessControlService, AccessControlService>();
        services.AddSingleton<ITaskFileStorage, S3TaskFileStorage>();
        services.AddScoped<ITaskService, TaskService>();
        var keyPath = configuration["Chat:DataProtectionKeysPath"]
            ?? Path.Combine(AppContext.BaseDirectory, "data-protection-keys");
        services.AddDataProtection()
            .SetApplicationName("Dontus.Operations")
            .PersistKeysToFileSystem(new DirectoryInfo(keyPath));
        services.AddHttpClient<IChatService, ChatService>();
        return services;
    }
}
