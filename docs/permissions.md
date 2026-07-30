# Usuários, grupos e permissões

## Modelo

- Cada usuário é identificado pelo e-mail autenticado.
- Um usuário pode participar de vários grupos.
- As permissões dos grupos são combinadas por união.
- Grupos inativos deixam de conceder acesso.
- Usuários desconhecidos ou inativos recebem HTTP 403.
- O grupo de sistema `Administradores` não pode perder a permissão de administração.
- O sistema impede a remoção do último administrador ativo.

## Permissões por tela

| Permissão | Efeito |
| --- | --- |
| Visualizar | Exibe a tela e permite consultar seus dados |
| Criar | Permite novos registros e implica visualização |
| Editar | Permite transições e alterações e implica visualização |
| Aprovar | Permite decisões de aprovação e implica visualização |
| Administrar | Permite configuração administrativa e implica visualização |

## Telas controladas

Visão geral, Customer 360, Comercial, Customer Success, Implantação LIA, Suporte, Atendimento omnichannel, Demandas de TI, Financeiro, Compras e Patrimônio, Aprovações, Agenda, Tarefas, Indicadores, Cadastros e Administração.

## Ações específicas de Tarefas

Além das permissões por tela, cada grupo pode receber capacidades independentes: cancelar, alterar status, prioridade ou SLA, encaminhar, assumir, transferir responsabilidade, visualizar tarefas de outros usuários ou setores, gerenciar cadastros, visualizar relatórios e notificar cliente. A API valida essas capacidades em cada operação; ocultar um botão não concede nem revoga autorização.

## Ações específicas de Atendimento

As capacidades do chat são: enviar mensagens, registrar notas internas, atribuir,
transferir, visualizar outros setores, supervisionar, gerenciar canais, configurar
números WhatsApp, gerenciar cadastros do chat e gerar tarefas. A API também restringe
cada conversa aos setores associados ao colaborador.

## Perfis sugeridos

| Grupo | Telas sugeridas | Restrições |
| --- | --- | --- |
| Gestão | Visão geral e Indicadores | Leitura executiva |
| Comercial | Customer 360 e Comercial | Sem acesso financeiro |
| Customer Success | Customer 360, CS, LIA e Agenda | Sem aprovações financeiras |
| Suporte | Customer 360, Suporte e Agenda | Sem prioridade de TI |
| TI | Demandas de TI e Suporte | Deploy sensível continua sujeito às regras do workflow |
| Financeiro | Financeiro e Aprovações | Aprovar deve ser concedido somente a aprovadores |
| Compras | Compras, Patrimônio e Aprovações | Respeitar alçadas |
| Auditoria | Indicadores e Administração em leitura | Sem criação, edição ou aprovação |

A ocultação do menu é apenas uma conveniência visual. Toda operação é novamente autorizada pela API C#.
