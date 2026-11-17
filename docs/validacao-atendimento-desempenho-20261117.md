# Atendimentos e carregamento — 17/11/2026

## Diagnóstico e alterações

- Aplicação, API e PostgreSQL locais estavam saudáveis. O endereço ngrok anterior retornava `ERR_NGROK_3200`; a conta disponível não permitiu reativá-lo. Um novo túnel foi iniciado e seu domínio foi incluído em `APP_ALLOWED_ORIGINS`.
- Atendimentos passa a renderizar dez linhas por página, com Anterior/Seguinte, contagem, limites de navegação e retorno à primeira página ao alterar filtros. Fotos dos responsáveis usam um índice reutilizado.
- O snapshot geral deixa de carregar o WhatsApp. As ações desse módulo retornam uma confirmação pequena, sem reconstruir os demais módulos.
- A consulta dedicada de WhatsApp aplica autorização, pesquisa e filtros antes de buscar dez conversas. Somente a conversa aberta recebe cinquenta mensagens; as demais recebem uma prévia. O histórico anterior usa lotes de cinquenta e cursor por horário/ID.
- Indicadores carregam um relatório próprio por período sem mensagens ou anexos. A tabela tem dez linhas por página, mantendo os totais do período.

## Validação

- Frontend: compilação de produção, verificação de tipos e 397 testes aprovados.
- Backend: 627 testes aprovados em .NET 10 com as fontes DejaVu usadas pela imagem da aplicação.
- PostgreSQL isolado: 25 conversas e 3.000 mensagens; a primeira página retornou 59 mensagens. Verificados os cursores com horários iguais, pesquisa, segunda página, métricas e relatório. O banco temporário foi removido.
- Navegador Edge: páginas de 10/10/3 para 23 registros, filtros e limpeza voltando à primeira página, resultado vazio, modal, carregamento separado do WhatsApp e lotes de histórico de 50/100 mensagens. Sem erros de JavaScript.
- Os testes de interface usam respostas simuladas; nenhum atendimento de validação foi inserido no banco da aplicação.
- Após aplicar as imagens: web, saúde da API, endereço externo e relatório responderam HTTP 200; a consulta sem sessão respondeu 401 e a referência de histórico inexistente, 404. Confirmados `chatModule: null` no snapshot geral e limite de dez na consulta dedicada. Os testes de navegador foram repetidos na aplicação atualizada, sem erros.

## Operação

O ambiente continua em `http://localhost:3000`, com saúde da API em
`http://localhost:8080/health/ready`. O acesso externo ativo nesta validação é
`https://caution-tidiness-carpentry.ngrok-free.dev` e depende do processo ngrok
permanecer em execução. Para abrir o túnel novamente, use `ngrok http 3000` e
confira o endereço emitido; alterações de domínio exigem atualizar
`APP_ALLOWED_ORIGINS` e reconstruir a imagem web.

As imagens anteriores foram preservadas com a tag
`before-attendance-20261117`. A atualização usa os mesmos volumes do Compose.
Alterações de outra implementação de WhatsApp que já estavam no workspace foram
preservadas e excluídas das imagens desta atualização.
