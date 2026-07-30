# Arquitetura

## Decisão

A solução usa interface React/TypeScript com renderização Vinext e uma API modular em C# sobre ASP.NET Core 10. O PostgreSQL 17 é a fonte de verdade transacional. Docker Compose orquestra web, API e banco no desenvolvimento local.

O frontend não acessa o banco: a rota `/api/operations` atua como BFF e encaminha as chamadas para a API C#. Regras de negócio, autorização, concorrência, transações e auditoria permanecem no servidor.

## Camadas do backend

| Projeto | Responsabilidade |
| --- | --- |
| Domain | Entidades, exceções e políticas de transição |
| Application | Contratos, comandos, DTOs e portas de aplicação |
| Infrastructure | EF Core, PostgreSQL, migrations, consultas e serviços |
| Api | HTTP, autenticação, rate limit, Problem Details, OpenAPI e health checks |
| Tests | Testes de domínio e integração de serviços com banco em memória |

## Módulos

Customer 360, Comercial, Customer Success, LIA, Suporte, TI, Financeiro, Compras, Patrimônio, Agenda, Tarefas, Aprovações, Auditoria e Indicadores compartilham um núcleo operacional, preservando seus estados e validações específicos.

## Persistência

As tabelas transacionais são `customers`, `work_items`, `appointments`, `approvals`, `activities` e `audit_events`. `decision_items` registra V-001 a V-020. As migrations versionadas ficam em `backend/src/Dontus.Operations.Infrastructure/Migrations`.

O controle de acesso usa `users`, `access_groups`, `user_access_groups` e `group_permissions`. A associação usuário–grupo é N:N. Permissões de vários grupos são combinadas por união e sempre reavaliadas na API.

## Segurança

- autenticação local controlada por configuração e habilitada apenas no Compose;
- autorização por usuário, grupo, tela e ação;
- usuário desconhecido ou inativo bloqueado antes da consulta operacional;
- menu filtrado para usabilidade, sem substituir a validação no servidor;
- operações mutáveis autorizadas na API e auditadas;
- EF Core com consultas parametrizadas;
- concorrência otimista por `version`;
- nenhuma exclusão física exposta;
- operações financeiras e go-live exigem confirmação explícita;
- conflito de agenda validado em transação serializável;
- endpoints protegidos por rate limit;
- respostas de erro seguem Problem Details e incluem correlação.
