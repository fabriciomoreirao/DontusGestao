# Desempenho de operações e permissões por sessão

As permissões efetivas são calculadas no login e gravadas em `local_auth_sessions.AuthorizationJson`.
Alterar grupos, permissões ou vínculos passa a valer no próximo login. O snapshot persiste entre
requisições, reinícios e réplicas da API. Sessões anteriores à migration recebem o snapshot uma vez,
na primeira utilização. Os dados de autorização permanecem no servidor.

Cada requisição continua validando a sessão pelo hash do token, a expiração, a revogação,
o bloqueio do colaborador e seu horário de acesso. Logout, bloqueio e recuperação de senha
continuam interrompendo o acesso imediatamente; essas verificações não dependem do cache.

## Carregamento e sincronização

- O painel usa cache privado por sessão, autorização, versões conhecidas e revisão dos dados,
  com validade máxima de 30 segundos e limite de 64 MiB de JSON por instância.
  Guarda somente os bytes da resposta pronta, evitando reter uma segunda cópia dos objetos
  ou serializar novamente os registros que não fazem parte do delta.
- Chamadas simultâneas equivalentes compartilham a mesma construção do painel. Cancelar uma
  chamada não cancela o trabalho compartilhado por outra aba. Falhas permitem nova tentativa.
- As projeções carregam com até quatro operações concorrentes por construção. Cada projeção
  usa seu próprio escopo e `DbContext`.
- As gravações invalidam o cache local antes de responder. Notificações do PostgreSQL invalidam
  as outras réplicas. A perda ou reconexão do listener invalida a revisão; sem listener ativo,
  o servidor consulta os dados novamente.
- `x-dontus-operations-cursor` identifica mudanças operacionais, independentemente de mensagens,
  presença e digitação do chat interno. `refreshOperations` retorna **204 sem corpo** quando
  não há mudanças. A tela conserva os dados e suas referências nesse caso.
- Os registros alterados continuam sendo enviados por delta, sem consultar os anexos embutidos
  dos registros cuja versão já está no navegador. A conexão saudável continua sem polling HTTP.

## Validação em 18/11/2026

Compilação de produção com PostgreSQL 17 em containers isolados, 6.000 registros sintéticos
(3.000 comerciais e 3.000 atendimentos). O snapshot autorizado carregou 4.000 registros.
Tempos incluem a requisição HTTP local e a leitura do corpo; a primeira carga inclui parsing JSON.

| Cenário                         | Amostras |  Mediana |      P95 |
| ------------------------------- | -------: | -------: | -------: |
| GET com cache                   |       15 | 59,96 ms | 89,34 ms |
| Sincronização sem mudanças, 204 |       30 |  6,16 ms |  7,51 ms |

A primeira carga após reiniciar a API levou **1.148,12 ms**. Com a API já aquecida, a carga
completa de uma nova sessão levou **294,82 ms** na medição final. Os valores são de um ambiente
isolado; o tempo em produção também depende do volume, infraestrutura e rede. O cache acelera
as repetições; cargas completas e mudanças reais ainda executam as consultas necessárias.

Verificações concluídas: suíte backend com 631 testes; após acrescentar testes de cancelamento,
recuperação e separação dos deltas, os 33 testes de cache, acesso, horários e projeções passaram
novamente. Os 408 testes de
frontend, TypeScript, lint do proxy/scripts e builds web/API também passaram. O lint do
`OperationsApp.tsx` mantém os 21 erros e 28 avisos anteriores à alteração, sem novos diagnósticos.
A migration
foi aplicada a um PostgreSQL novo. A validação HTTP confirmou permissões estáveis na sessão,
renovação no login seguinte, revogação no logout e rejeição imediata de colaborador bloqueado.
Uma alteração direta no banco invalidou o painel em cache; a sincronização enviou somente o
registro alterado e a chamada seguinte retornou 204.

## Repetir a medição

Utilize uma API de teste sem gravações concorrentes e com listener ativo. Configure as variáveis
abaixo com uma conta de teste; o script não imprime a senha nem o token e encerra sua sessão ao fim.

```powershell
$env:DONTUS_BENCHMARK_URL = 'http://127.0.0.1:8080'
$env:DONTUS_BENCHMARK_EMAIL = '<conta de teste>'
$env:DONTUS_BENCHMARK_PASSWORD = '<senha de teste>'
node tests/operations-performance.mjs
```

A migration `20261118120000_SessionAuthorizationSnapshot` é aplicada automaticamente pela API
na inicialização. Não há dependência nova nem configuração obrigatória adicional.
