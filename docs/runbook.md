# Runbook

## Verificação

1. Executar `npm run build`.
2. Executar `npm test`.
3. Confirmar a migration em `drizzle/`.
4. Validar que `.openai/hosting.json` contém apenas `project_id` e bindings lógicos.

## Publicação

Publicar somente uma versão construída e testada. A versão precisa corresponder ao commit enviado ao repositório da plataforma. Preferir acesso privado.

## Rollback

Selecionar a última versão salva com status estável e republicá-la. Não executar correções diretamente no ambiente de produção sem uma nova versão.

## Incidente

1. Registrar impacto, início, clientes afetados e contorno.
2. Estabilizar P0 e registrar a demanda imediatamente.
3. Preservar correlação entre ticket, demanda e deploy.
4. Se necessário, realizar rollback.
5. Comunicar usuários e registrar causa, correção e prevenção.

## Banco

As criações são idempotentes. Migrations são a fonte versionada. Não editar ou excluir `audit_events` pela aplicação.
