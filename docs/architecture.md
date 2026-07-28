# Arquitetura

## Decisão

Aplicação web modular em React/TypeScript com renderização Vinext e execução em Cloudflare Workers. A persistência estruturada usa D1/SQLite e acesso por prepared statements. O site é publicado com acesso privado e recebe a identidade do usuário pelo cabeçalho autenticado da plataforma.

## Módulos

| Módulo | Responsabilidade |
| --- | --- |
| Identity & Access | Identidade autenticada, papel, setor e controles contextuais |
| Customer 360 | Cliente canônico e vínculos com todas as jornadas |
| Commercial | Lead, oportunidade, handoff e pós-venda |
| Customer Success | Treinamento, onboarding e adoção |
| LIA | Kick-off, prompt, testes, aprovação, go-live e CRC |
| Support | Ticket, protocolo, configuração e encaminhamento |
| IT Demand | Triagem, prioridade, SLA, execução, teste e deploy |
| Finance | Estorno, contas, boletos, cobrança e DRE |
| Procurement | Compra, suprimento, patrimônio e manutenção |
| Work Management | Tarefas, compromissos, agenda e lembretes |
| Approvals | Decisões, alçada e segregação |
| Reporting | Indicadores derivados do dado transacional |

## Persistência

As tabelas transacionais são `customers`, `work_items`, `appointments`, `approvals`, `activities` e `audit_events`. `decision_items` registra as pendências V-001 a V-020. `users` mantém a evolução futura do catálogo de acesso.

`work_items` é um núcleo de workflow compartilhado: cada item mantém módulo, tipo, cliente, responsável, prioridade, status, prazo, SLA, origem e versão. As regras de estado permanecem específicas por domínio.

## Segurança

- acesso externo protegido pela política privada do Sites;
- identidade encaminhada pela plataforma;
- operações mutáveis passam pela API e geram auditoria;
- prepared statements em todas as consultas;
- concorrência otimista por `version`;
- nenhuma exclusão física exposta;
- operações financeiras e go-live exigem confirmação explícita;
- dados de demonstração são opt-in.
