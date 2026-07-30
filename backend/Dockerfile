FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY Dontus.Operations.slnx ./
COPY src/Dontus.Operations.Domain/Dontus.Operations.Domain.csproj src/Dontus.Operations.Domain/
COPY src/Dontus.Operations.Application/Dontus.Operations.Application.csproj src/Dontus.Operations.Application/
COPY src/Dontus.Operations.Infrastructure/Dontus.Operations.Infrastructure.csproj src/Dontus.Operations.Infrastructure/
COPY src/Dontus.Operations.Api/Dontus.Operations.Api.csproj src/Dontus.Operations.Api/
RUN dotnet restore src/Dontus.Operations.Api/Dontus.Operations.Api.csproj

COPY src ./src
RUN dotnet publish src/Dontus.Operations.Api/Dontus.Operations.Api.csproj \
    --configuration Release \
    --no-restore \
    --output /app/publish \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
RUN apt-get update \
    && apt-get install --yes --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=app:app /app/publish .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=25s --retries=5 \
  CMD curl --fail --silent http://127.0.0.1:8080/health/ready > /dev/null || exit 1

USER root
ENTRYPOINT ["sh", "-c", "mkdir -p /app/data-protection-keys && chown -R app:app /app/data-protection-keys && exec su -s /bin/sh app -c 'exec dotnet Dontus.Operations.Api.dll'"]
