# Tarefas — referência visual do usuário

O card apresenta título à esquerda e aviso ao cliente no canto superior direito
na mesma linha, seguidos de tipo, prioridade, SLA
e rodapé com setor e responsável. Data de atualização, identificação do cliente,
descrição e envio de arquivos ficam no modal
da tarefa; o card conserva apenas as ações de editar e excluir, conforme permissões.
A referência anexada orienta o modal da tarefa.

O detalhe abre no mesmo contexto em uma gaveta da direita para a esquerda.
Em telas de computador, descrição, anexos e conversa ficam na coluna esquerda;
resumo em seis campos (três colunas e duas linhas), ações em dois campos por linha,
histórico e edição ficam na direita. A descrição tem uma superfície azul suave;
os anexos aparecem em linhas compactas. O cabeçalho possui título, protocolo,
aviso ao cliente, atualização e quatro ações. O layout próprio deste cabeçalho
não recebe a normalização genérica que reposiciona controles de outros módulos. Os controles de
fluxo conservam suas permissões e validações. Transferência de setor fica acessível
em um grupo expansível. Em telas menores as colunas se empilham.

Comentários e histórico começam com cinco registros recentes e revelam mais em
blocos de cinco. O editor compacto oferece emoji, negrito, anexos e envio.
O texto mantém espaços e parágrafos e o negrito é persistido como `**texto**`, sem
aceitar HTML executável. Os temas claro e escuro usam os tokens do sistema.

## Responsável e fila compartilhada

Qualquer colaborador ativo com acesso às tarefas e vínculo ao setor pode assumir
uma tarefa sem responsável, em seu próprio nome, pelo botão visível ao lado do
campo. Uma vez atribuída, somente o responsável atual pode transferi-la a outro
colaborador ativo, inclusive de outro setor. Para os demais, o nome é somente leitura.
A API aplica as mesmas restrições, inclusive ao encaminhar entre setores, e valida
a versão para evitar que duas pessoas assumam o mesmo item simultaneamente.

A tarefa atribuída e seu setor aparecem para o novo responsável. Esse acesso não
libera criar tarefas em outros setores nem consultar as tarefas de terceiros.
