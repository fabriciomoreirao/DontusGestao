# Rastreabilidade

| Requisito | Implementação | Teste/evidência |
| --- | --- | --- |
| Customer 360 canônico | `customers`, tela Customer 360 | build + fluxo de criação |
| Estados por domínio | `lib/domain.ts`, API de transição | `tests/domain-rules.test.mjs` |
| Agenda sem conflito | `appointments`, validação de overlap | teste funcional HTTP 409 |
| Aprovação sem autoaprovação | `approvals`, `decideApproval` | regra na API |
| Auditoria sensível | `audit_events`, helper `audit` | eventos após mutações |
| Decisões V-001..020 | `decision_items`, Administração | inicialização idempotente |
| Persistência | D1 binding `DB`, migration Drizzle | `drizzle/0000_*.sql` |
| Identidade | cabeçalhos autenticados da plataforma | sessão exibida na Administração |
| UX responsiva/acessível | CSS responsivo, labels, foco e teclado | HTML final e regras CSS |
| Identidade visual | logos oficiais e paleta Dontus | dashboard e Open Graph |
