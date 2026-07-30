# Rastreabilidade

| Requisito | Implementação | Teste/evidência |
| --- | --- | --- |
| Customer 360 canônico | `customers`, serviço e tela Customer 360 | teste de criação e auditoria |
| Estados por domínio | `WorkflowPolicy`, endpoint de transição | `WorkflowPolicyTests` |
| Agenda sem conflito | transação serializável e validação de overlap | `OperationsServiceTests` |
| Aprovação sem autoaprovação | `DecideApprovalAsync` | `OperationsServiceTests` |
| Auditoria sensível | `audit_events` na mesma unidade de trabalho | teste de criação e auditoria |
| Decisões V-001..020 | `decision_items`, inicialização idempotente | migration + inicialização |
| Persistência | PostgreSQL e EF Core | migration `InitialCreate` |
| Identidade local | cabeçalhos internos e bypass configurável | proxy web + API autenticada |
| Usuários e grupos | `users`, `access_groups`, associação N:N | `AccessControlServiceTests` |
| Acesso por tela | `group_permissions` e validação na API | usuário limitado + HTTP 403 |
| UX responsiva/acessível | CSS responsivo, labels, foco e teclado | build e testes do frontend |
| Identidade visual | logos oficiais e paleta Dontus | dashboard e Open Graph |
