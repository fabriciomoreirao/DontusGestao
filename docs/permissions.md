# Catálogo de permissões

Operações padrão: `View`, `ViewSensitive`, `Create`, `Edit`, `DeleteDraft`, `Cancel`, `Approve`, `Reject`, `Execute`, `Assign`, `ChangePriority`, `ChangeSla`, `Export`, `ViewAudit` e `ManagePermissions`.

| Perfil | Escopo principal | Restrições críticas |
| --- | --- | --- |
| Administrador técnico | Configuração e acesso | Sem acesso financeiro sensível automático |
| Gestão | Dashboards e decisões | Não altera operação sem permissão específica |
| Gestor Comercial | Equipe, metas e política | Não executa finanças |
| Vendedor | Próprio/carteira | Sem boleto, PIX, baixa, estorno ou notas privadas |
| Coordenação CS | Equipe/carteira | Sem desconto ou cobrança |
| Especialista CS | Próprio/carteira | Finalização condicionada a aprovação |
| Implementador LIA | Projetos atribuídos | Go-live exige permissão e aceite |
| Coordenação Suporte | Fila/equipe | Não prioriza backlog de TI |
| Agente Suporte | Próprio/equipe | Sem prioridade, SLA, código ou deploy |
| Gestão TI | Setor/todos | Triagem, prioridade e backlog |
| Desenvolvedor | Atribuídos | Sem autoaprovação de teste/deploy sensível |
| QA | Testes | Não altera requisito |
| Financeiro | Setor/escopo | Não altera assinatura/desconto |
| Aprovador especial | Solicitações da alçada | Sem autoaprovação ou execução |
| Auditor | Leitura autorizada | Sem mutação |

Negação explícita prevalece sobre concessão. Exportação e visualização sensível são permissões independentes e auditadas.
