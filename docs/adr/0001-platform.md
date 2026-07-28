# ADR 0001 — Plataforma de execução

Status: aceito.

## Contexto

O repositório estava vazio e a entrega exige aplicação web persistente, privada e publicável no ambiente Sites.

## Decisão

Usar React/TypeScript com Vinext e Cloudflare Workers, D1 para dados estruturados e autenticação/controle de acesso fornecidos pela plataforma. Manter arquitetura modular por domínio e um núcleo transversal de workflow.

## Consequências

- publicação e persistência são gerenciadas pela plataforma;
- regras críticas permanecem no servidor;
- integrações externas ficam atrás de contratos futuros e decisões V-001 a V-020;
- a referência .NET/PostgreSQL do documento não é introduzida como segunda stack.
