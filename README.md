# Dontus — Central de Operações

Plataforma integrada para a jornada operacional da Dontus: Customer 360, Comercial, Sucesso do Cliente, implantação da LIA, Suporte, TI, Financeiro, Compras, Patrimônio, Aprovações, Agenda, Tarefas, Auditoria e Indicadores.

## Desenvolvimento

```bash
npm install
npm run dev
npm run db:generate
npm run build
npm test
```

O ambiente usa persistência D1 no binding lógico `DB`. O banco é inicializado de forma idempotente no primeiro acesso e também possui migration versionada em `drizzle/`.

## Controles essenciais

- máquinas de estado validadas no servidor;
- confirmação explícita em ações sensíveis;
- prevenção de autoaprovação;
- conflito de agenda bloqueado no servidor;
- histórico e auditoria imutáveis;
- decisões V-001 a V-020 registradas com comportamento seguro;
- dados demonstrativos somente por carga explícita do administrador.

## Documentação

- `docs/architecture.md`
- `docs/decision-log.md`
- `docs/permissions.md`
- `docs/state-machines.md`
- `docs/openapi.yaml`
- `docs/runbook.md`
- `docs/traceability.md`
