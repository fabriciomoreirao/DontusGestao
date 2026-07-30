# Runbook local

## Subida e verificação

1. Copiar `.env.example` para `.env` e trocar a senha.
2. Executar `docker compose up --build`.
3. Abrir `http://localhost:3000`.
4. Confirmar `http://localhost:8080/health/ready`.
5. Confirmar os três serviços com `docker compose ps`.

## Banco e migrations

A API executa `Database.MigrateAsync` com tentativas progressivas na inicialização. A migration inicial está versionada em `backend/src/Dontus.Operations.Infrastructure/Migrations`.

Para criar uma nova migration:

```powershell
dotnet ef migrations add NomeDaMudanca `
  --project backend/src/Dontus.Operations.Infrastructure `
  --startup-project backend/src/Dontus.Operations.Api `
  --output-dir Migrations
```

Não editar ou excluir `audit_events` pela aplicação.

## Logs e diagnóstico

```powershell
docker compose ps
docker compose logs --follow api
docker compose logs --follow web
docker compose logs --follow database
```

## Encerramento

`docker compose down` preserva o volume do PostgreSQL. `docker compose down --volumes` apaga os dados locais e deve ser usado somente quando a perda for intencional.
