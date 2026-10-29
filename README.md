# Dontus — Central de Operações

Sistema integrado para a jornada operacional da Dontus, com interface React/Vinext, API em C# com ASP.NET Core 10 e banco PostgreSQL 17. O ambiente local completo roda em containers Docker.

## Executar com Docker

Pré-requisito: Docker Desktop com o mecanismo Linux iniciado.

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Depois da inicialização:

- aplicação: http://localhost:3000
- API: http://localhost:8080/api/operations
- OpenAPI: http://localhost:8080/openapi/v1.json
- saúde da API: http://localhost:8080/health/ready
- PostgreSQL: `localhost:5432`
- pgAdmin: http://localhost:5050

Se o sistema for acessado por túnel ou proxy externo, informe apenas o domínio
autorizado em `APP_ALLOWED_ORIGINS` (sem `https://`). Alterações nessa variável
exigem reconstruir o contêiner web.

A API aplica automaticamente as migrations do Entity Framework na inicialização. Na primeira tela, use a ação administrativa de carga demonstrativa para inserir dados de exemplo; nada é carregado silenciosamente.

### Acesso ao PostgreSQL pelo pgAdmin

O Compose inicia o pgAdmin em `http://localhost:5050`. O login padrão é
`admin@dontus.com.br` e a senha é `dontus_pgadmin_change_me`; altere
`PGADMIN_EMAIL` e `PGADMIN_PASSWORD` no `.env`.

O servidor **Dontus PostgreSQL** já aparece cadastrado. Ao abri-lo, informe a senha
definida em `POSTGRES_PASSWORD`. O banco é `dontus`, o usuário é `dontus` e o host
interno é `database`. Exclusões feitas diretamente no pgAdmin não passam pelas
regras de negócio nem pela auditoria da aplicação e podem ser irreversíveis.

### Anexos privados na AWS

Os protocolos são gerados automaticamente no formato `DON-AAAAMMDD-NNNNNN`.
Os anexos são armazenados em bucket S3 privado e acessados por links temporários
de 10 minutos. Antes de iniciar os contêineres, preencha no arquivo `.env` as
variáveis `AWS_ACCESS_KEY_ID` e `AWS_SECRET_ACCESS_KEY` com credenciais novas,
limitadas ao bucket definido por `AWS_S3_BUCKET`. Nunca reutilize credenciais
publicadas em conversas, documentação ou código-fonte.

## Usuários, grupos e permissões

O primeiro usuário administrativo é definido por `LOCAL_USER_EMAIL` e `LOCAL_USER_NAME`. No ambiente padrão, ele é `gestor@dontus.local`.

Na tela **Administração**:

1. crie um grupo;
2. abra o grupo e marque as permissões por tela;
3. cadastre o usuário com o mesmo e-mail utilizado no login;
4. associe um ou mais grupos ao usuário.

A opção **Acesso total ao sistema** concede todas as telas, ações, capacidades e configurações, incluindo o cadastro de links do Portal e novos cadastros. A autorização é resolvida no servidor pelo vínculo ativo com o grupo de sistema Administradores e atualizada a cada requisição; nomes de cargo ou de outros grupos não concedem acesso total.

As permissões disponíveis por tela são visualizar, criar, editar, aprovar e administrar. Um usuário em vários grupos recebe a união das permissões. Usuários não cadastrados ou inativos recebem acesso negado pela API.

Na tela de grupos, o módulo **Tarefas** também oferece permissões específicas para cancelar, alterar status, prioridade ou SLA, encaminhar, assumir, transferir responsabilidade, consultar outros usuários/setores, administrar cadastros e registrar comunicação com o cliente.

O módulo **Atendimento** possui capacidades próprias para enviar mensagens, registrar notas internas, atribuir e transferir conversas, supervisionar outros setores e administrar canais, números WhatsApp e cadastros do chat.

O menu expansível **Cadastros** reúne os submenus Setores, Tipos de tarefa, Prioridades, Status, Políticas de SLA e Colaboradores. A tela possui permissão própria de consulta e administração por grupo.

## Agenda e reservas do Portal

Em **Repetir compromisso → Escolher datas**, marque os dias no calendário; navegue entre meses para escolher datas não consecutivas. O compromisso é criado na data principal e nas datas marcadas, sem duplicações, mantendo horário de Brasília, duração, responsável e colaboradores. Se houver conflito em qualquer data, nenhum compromisso do lote é salvo. A opção está disponível na Agenda, nos agendamentos rápidos e nas novas reservas de sala pelo Portal. A agenda de sala utiliza a largura disponível e quadrados maiores, com rolagem horizontal da grade em telas pequenas.

Cada setor recebe uma agenda automaticamente, tanto nos cadastros de Colaboradores quanto em Tarefas. Em **Colaboradores → Acesso às agendas**, selecione as agendas individuais de cada usuário. O vínculo funcional com um setor não concede acesso automático. Administradores e gestores de agenda mantêm acesso geral. A migração AgendaCalendarPermissions preserva uma única vez os acessos anteriores como permissões por agenda; alterações futuras de setor não modificam essas permissões.

## Módulo de Tarefas

As seleções operacionais utilizam apenas opções cadastradas e ativas. Opções fixas de exemplo e valores encontrados somente no histórico não são acrescentados às listas. Os registros históricos continuam preservados, e os cadastros administrativos permitem consultar e reativar opções inativas. Reiniciar o sistema não reativa prioridades bloqueadas nem recria cadastros excluídos do RH e etapas excluídas de Tarefas.

Em **Cadastros → Políticas de SLA**, informe um número inteiro de dias úteis no campo **Prazo para conclusão**. O prazo pode ser cadastrado e alterado no mesmo formulário.

Na **Gestão RH → Ficha do colaborador → Gestão de férias**, cada período aquisitivo pendente oferece **Finalizar sem datas**. A ação registra somente o saldo restante para completar os 30 dias, sem preencher início ou fim das férias. Uma observação é opcional. A conclusão exige editar RH, verifica a versão do histórico e registra usuário, horário do servidor e auditoria; um período já concluído não pode ser finalizado novamente.

Em **Diário de Bordo**, coordenadores podem escolher **Meu diário** ou um de seus coordenados no seletor ao lado de **Nova atividade**. A consulta inclui atividades manuais e compromissos sob responsabilidade do colaborador, em modo de leitura. Somente vínculos diretos de coordenação com colaboradores ativos e não bloqueados são disponibilizados; os vínculos são mantidos em **Administração → Colaboradores**.

Em **Tarefas** e **Atendimentos**, escolha um setor na lista suspensa para filtrar os registros, ou selecione **Todos os setores** para a visão consolidada. A logo do menu acompanha o tema claro ou escuro independentemente da cor escolhida para os controles do sistema.

Os setores cadastrados em **Colaboradores → Setores** são os mesmos utilizados em Tarefas. Usuários com acesso total, administração de Tarefas ou consulta de outros setores veem todos os setores ativos, mesmo sem vínculos pessoais. Os demais veem os setores em que possuem vínculo ou coordenação. Em **Nova tarefa**, o campo **Setor responsável** permite selecionar o setor autorizado e carrega seus tipos ativos; a etapa inicial do tipo escolhido aparece logo abaixo.

Em **Tipos de tarefa**, selecione os setores e a etapa inicial ativa. A etapa inicial entra automaticamente nas etapas permitidas. Para tipos compartilhados entre vários setores, a etapa inicial deve ser geral. Na inicialização, referências antigas a etapas desativadas são corrigidas somente quando existe uma primeira etapa cadastrada, compatível e inequívoca; a correção é auditada e preserva os status das tarefas existentes.

Agenda e Tarefas são módulos separados. Em **Tarefas** estão disponíveis:

- Kanban com movimentação por arrastar e soltar e visualização em lista;
- filtros por texto, setor, prioridade, responsável e tarefas do usuário;
- setores, tipos, prioridades, status, políticas de SLA e colaboradores configuráveis;
- responsável filtrado pelo setor e fila compartilhada sem responsável;
- encaminhamento entre setores, participantes, comentários e anexos privados na AWS S3;
- alertas internos de atribuição, comentários, encaminhamento e SLA;
- ações separadas para registrar atualização ao cliente e solicitar contato interno;
- histórico imutável com valores anteriores, posteriores, autor, origem e justificativa.

O envio externo por e-mail, WhatsApp ou SMS permanece desativado até a configuração de um provedor. A ação “Notificar cliente” registra a tentativa e informa que a integração está pendente.

Ao cadastrar um usuário ou colaborador, o sistema gera uma senha temporária e envia diretamente ao e-mail cadastrado o nome, o endereço do sistema, o e-mail de login e a senha. O cadastro só é concluído se o envio for aceito pelo SMTP; em caso de falha, nenhum usuário ou vínculo parcial é salvo e o formulário permite tentar novamente. A senha não é exibida na tela nem retornada pela API. As senhas são armazenadas como hash e não podem ser consultadas.

Em **Administração → Colaboradores → Editar**, a ação **Gerar nova senha e enviar por e-mail** exige permissão administrativa, envia os dados ao e-mail salvo, substitui a senha e encerra as sessões anteriores. Colaboradores inativos precisam ser reativados antes da redefinição. A ação fica registrada na auditoria sem a senha. Se o envio falhar ou não estiver configurado, a senha atual é preservada.

Configure no arquivo `.env` as variáveis `SMTP_HOST`, `SMTP_PORT`, `SMTP_USE_SSL`, `SMTP_USERNAME`, `SMTP_PASSWORD` e `SMTP_FROM`, além de `APP_PUBLIC_URL` com o endereço completo usado pelos colaboradores (por exemplo, `https://gestao.suaempresa.com.br`). Recrie o serviço `api` para aplicar a configuração. O padrão `http://localhost:3000` atende apenas ao acesso local. Credenciais reais devem permanecer somente no `.env` do servidor.

O colaborador pode alterar a própria senha no menu da conta, informando a senha atual e confirmando uma nova senha com ao menos 10 caracteres. A operação retorna **Senha alterada com sucesso.**, preserva a sessão atual e funciona independentemente do SMTP. A autorização é resolvida no PostgreSQL.

## Integrações com o Ambiente Dontus

Na ficha do cliente, abra **Dados ambiente Dontus**, informe o **ID do cliente no Ambiente Dontus** e clique em **Vincular e consultar**. A API é percorrida por completo até encontrar o campo `ID` exatamente igual ao informado, relacionando esse cadastro ao campo `Ident` do sisteminha. Os dois identificadores ficam visíveis na ficha. O vínculo é salvo no PostgreSQL e a aba consulta os dados atuais ao ser aberta. **Atualizar consulta** realiza uma nova leitura. O campo `Ident` da API corresponde à identificação do sisteminha; o campo `ID` é o identificador do registro no Ambiente Dontus. Na ficha, novas consultas usam o `ID` do Ambiente salvo no vínculo; no Acesso, a busca usa a identificação `Ident` do sisteminha. O filtro `busca` da API não pesquisa o campo `ID`, por isso a ficha utiliza a listagem geral paginada.

Os campos disponíveis na API são apresentados em Cadastro e identificação, Endereço e Demais informações do ambiente, incluindo campos adicionais, estruturas e valores não informados. O cadastro local é preservado. Uma identificação pode ser vinculada a apenas um cliente. Consultar exige visualizar Clientes; vincular exige também editar Clientes.

Em **Acesso**, informe a identificação do cliente e clique em **Pesquisar**. A lista apresenta nome, usuário, e-mail, tipo **Supervisor / Comum** e status. A lista exibe **10 usuários por página**, com botões Anterior e Próxima. A busca por nome, usuário, e-mail ou ID e o filtro de tipo são aplicados a todos os usuários retornados, antes da paginação; mudar os filtros retorna à primeira página. O botão de casinha **Acessar** consulta novamente a permissão/status do usuário no Dontus e abre o endereço retornado em uma nova aba. Usuários inativos e links não autorizados permanecem sem acesso. O navegador precisa permitir novas abas para o sistema.

Configure `DONTUS_CLIENTS_TOKEN` e `DONTUS_USERS_TOKEN` somente no `.env` do servidor. O Compose encaminha essas variáveis exclusivamente à API C#. Os endereços padrão são `https://ambiente.dontus.com.br/api/APICliente/GetAllClientes` (GET com `skip`, `take`, `busca` e cabeçalho `Token`) e `https://sistema.dontus.com.br/api/Ambiente/listarUsuarios` (POST com `identificacao`, `schema` e token). Para outro servidor Dontus, ajuste `DONTUS_USERS_BASE_URL` e configure explicitamente `DontusIntegration:AllowedLoginHosts` na API com os hosts de login autorizados; o padrão permite `sistema.dontus.com.br`. Redirecionamentos HTTP nas chamadas externas são recusados.

Todas as rotas exigem autenticação e as permissões locais de Clientes ou Acesso, conforme a operação. Vínculos, consultas de usuários e abertura de acesso são auditados sem senhas, tokens ou URLs de login. A lista enviada à tela não contém senhas ou links de entrada; o link é obtido apenas ao clicar em Acessar. As credenciais de integração nunca são enviadas ao navegador.

## CRM e lembretes de contato

Os seletores de vendedor e responsável do CRM utilizam somente colaboradores ativos, não bloqueados e vinculados ao setor ativo **Comercial**, inclusive por vínculo adicional. A lista também está disponível para operadores sem acesso à Administração. Responsáveis antigos permanecem no histórico dos cards; eles não são oferecidos para novas atribuições quando deixam de pertencer ao Comercial.

Valores monetários exibem sempre duas casas decimais: `R$ 129,90` permanece `R$ 129,90`. Os valores unitários podem ser editados ao cadastrar e editar os produtos do lead e da venda direta. Os campos aceitam vírgula ou ponto decimal, inclusive `R$ 1.234,56`; totais e descontos são calculados mantendo os centavos.

Os cards do CRM comercial e de retenção mostram os dias sem interação desde o cadastro ou o último comentário/follow-up de contato. Movimentações de etapa e alterações gerais não reiniciam a contagem. Etapas finais de ganho ou perda e status finalizados mostram zero e interrompem a contagem. Cada card com lembrete pendente exibe um sino; o indicador desaparece após a confirmação ou exclusão do lembrete.

No filtro **Lembretes** do CRM, escolha **Lembretes para hoje**, **Com lembrete agendado** ou **Sem lembrete agendado**. A tela **Lembretes** também possui o filtro de período para hoje. As datas seguem Brasília e respeitam o horário atualizado de lembretes adiados.

## Comissões e indicações: confirmação por competência

Na lista de Comissões, aprove ou reprove cada cliente e informe o motivo. Clique no nome do cliente para consultar dados gerais, utilização e datas de kick off, treinamento e alinhamento único. As regras e os valores são calculados novamente na API ao registrar a decisão; reprovações têm valor a pagar igual a zero.

Em CS, abaixo de 50% de score a comissão é zero; de 50% a menos de 75%, de 75% até 100% (inclusive) e acima de 100% há percentuais editáveis por colaborador, inicialmente 5%, 10% e 15%. Scores de 200% ou mais continuam na última faixa. Configurações antigas mantêm seus três percentuais nas três faixas remuneradas. O valor base usa o lançamento ou a venda vinculada, os produtos contratados e, quando ausentes, a mensalidade do cliente. A supervisão pode revisar a base na aprovação; uma comissão percentual positiva exige valor base informado. PDFs já assinados permanecem preservados; novas assinaturas usam o layout atualizado.

Depois de decidir todos os resultados filtrados, **Enviar confirmação** gera um link por responsável e competência. Em Indicações, a aba **Todas as decisões** reúne aprovadas e reprovadas do mês; busca, responsável, decisão e lembretes são respeitados na geração. O relatório preserva clientes, filtros, score, valores, regras, cálculos e motivos apresentados na geração.

O documento exige login com uma sessão válida, inclusive em ambiente com bypass de desenvolvimento. Somente o usuário vinculado como responsável e a supervisão com permissão de aprovar ou administrar o módulo podem consultar o conteúdo e o PDF. Somente o responsável pode assinar. Vínculos são verificados por ID de usuário ou e-mail, nunca pelo nome exibido.

Para assinar, o responsável marca **Concordo**, desenha sua rubrica no quadro e escolhe **Concordar e confirmar valor**. A API registra o ID, nome e e-mail do usuário autenticado, o horário do servidor, a rubrica, User-Agent, idioma, plataforma, fuso horário e dimensões da tela. O PDF é produzido na confirmação, preservado no banco e disponibilizado em **Baixar PDF assinado**, tanto no documento quanto no histórico de **Confirmações** da competência. O arquivo inclui os clientes, cálculos, decisões, motivos e os dados da assinatura. Confirmações anteriores à exigência de rubrica são identificadas como tal, sem inventar dados de assinatura.

Supervisores podem usar **Adicionar valor manual** para informar cliente, identificação, produto, valor do cliente, comissão e justificativa. O lançamento fica pendente de aprovação ou reprovação e participa do relatório e da assinatura da competência como os demais.

## Formulários do acompanhamento LIA

Em **Configurações da LIA → Formulários do cliente**, crie modelos com perguntas obrigatórias ou opcionais de texto curto, texto longo, seleção, e-mail, data e número. A manutenção exige a permissão de administrar a LIA.

No detalhe do cliente, use **Gerar link de formulário**, escolha um modelo ativo e copie o link. O cliente preenche a página pública sem login. Cada envio registra a data e hora no servidor e aceita uma única resposta. Links já gerados preservam as perguntas originais mesmo após a edição do modelo.

O card indica se os formulários foram respondidos; **Ver respostas** abre uma nova página autenticada com todos os formulários desse acompanhamento e seus horários em Brasília. A lista atualiza ao voltar à janela, a cada 30 segundos ou pelo botão de atualização. Gerar links exige editar a LIA; consultar respostas exige visualizar a LIA. Tokens são aleatórios e armazenados com hash e uma cópia protegida pela chave persistente de Data Protection. As tabelas são criadas pela migration LiaClientForms.

## Atendimento omnichannel

A tela **Atendimento** inclui caixa de entrada em três colunas, pesquisa e filtros,
histórico de mensagens e transferências, notas internas, atribuição, etiquetas,
respostas rápidas, anexos privados, indicadores e telas de configuração separadas
para filas, canais, números WhatsApp, etiquetas e respostas rápidas.

Cada número WhatsApp oficial pertence exclusivamente a um setor. O canal, a fila
e o atendente precisam pertencer ao mesmo setor. Em uma transferência de conversa
WhatsApp, a API exige outro canal WhatsApp com número oficial ativo no destino.

Para integrar a Meta em **Coexistência** (WhatsApp Business App + Cloud API no
mesmo número):

1. use um app Meta aprovado como Tech Provider ou Solution Partner, com Embedded
   Signup e acesso avançado às permissões do WhatsApp;
2. no painel da Meta, assine os campos `messages`, `history`,
   `smb_app_state_sync`, `smb_message_echoes` e `account_update`;
3. configure o webhook
   `https://SEU_DOMINIO/api/integrations/whatsapp/webhook`;
4. crie um canal do tipo **WhatsApp** no setor;
5. em **Configurações > WhatsApp**, escolha **Coexistência · App + API** e informe
   App ID, Configuration ID do Embedded Signup, Business Manager ID, Verify Token
   e App Secret;
6. salve o cadastro e clique em **Conectar com Facebook**. Conclua também a
   confirmação exibida no WhatsApp Business do celular.

O sistema troca o código do Embedded Signup somente no backend, valida
`is_on_biz_app` e `platform_type`, assina a WABA e solicita imediatamente a
sincronização de contatos e do histórico. Não execute `/{phone-number-id}/register`
para um número em coexistência, pois ele já está registrado. O modo **Somente
Cloud API** continua disponível para números sem WhatsApp Business App.

Tokens e segredos são criptografados no banco. As chaves de proteção persistem no
volume Docker `dontus_chat_keys`. O webhook valida o token da assinatura inicial,
a assinatura HMAC `X-Hub-Signature-256` e a idempotência pelo ID da mensagem.
Mensagens enviadas no celular chegam como `smb_message_echoes` e aparecem na
mesma conversa da central; o histórico autorizado é importado sem gerar itens
não lidos.

Para acompanhar ou encerrar:

```powershell
docker compose logs --follow
docker compose down
```

Os dados permanecem no volume `dontus_postgres_data`. Para apagar também a base local, execute conscientemente `docker compose down --volumes`.

## Estrutura

```text
app/                                      interface e proxy da API
backend/src/Dontus.Operations.Api/        endpoints, autenticação e saúde
backend/src/Dontus.Operations.Application/contratos e casos de uso
backend/src/Dontus.Operations.Domain/     entidades e regras de workflow
backend/src/Dontus.Operations.Infrastructure/PostgreSQL, EF Core e auditoria
backend/tests/                            testes automatizados C#
docs/                                     arquitetura, segurança e operação
```

## Desenvolvimento sem containers

Com PostgreSQL disponível localmente:

```powershell
dotnet test backend/Dontus.Operations.slnx
dotnet run --project backend/src/Dontus.Operations.Api
npm install
npm run dev
```

O frontend usa `API_INTERNAL_URL` (padrão `http://localhost:8080`) para encaminhar as requisições à API C#.

A geração e os testes dos PDFs assinados usam `DejaVuSans.ttf` e `DejaVuSans-Bold.ttf`. A imagem Docker da API instala essas fontes. Fora dela, instale as fontes DejaVu em `/usr/share/fonts/truetype/dejavu` ou defina `DONTUS_PDF_FONT_DIR` com a pasta que contém os dois arquivos.

## Experiência e navegação

A navegação oferece **Ctrl+K** (ou **⌘K** no macOS) para localizar ferramentas, favoritos e acessos recentes. O atalho **/** posiciona o cursor na busca de clientes, colaboradores, IDs e protocolos. A busca desconsidera acentos. Favoritos ficam salvos por usuário neste navegador e respeitam as permissões disponíveis na sessão.

O caminho da tela e a navegação rápida ficam na mesma barra da pesquisa, com botões de voltar e avançar nas telas maiores. Em notebooks menores e celulares, o botão ao lado da busca abre o menu sobre o conteúdo, sem reduzir a área de trabalho. Módulos e subáreas mantêm seus endereços ao recarregar e ao percorrer o histórico. **Foco** amplia a área operacional ocultando o menu lateral; **Esc** restaura a navegação. Nos formulários compartilhados, **Tab** permanece dentro da janela e **Esc** fecha o formulário, retornando o foco ao controle que o abriu.

O **Chat interno** ocupa a altura disponível, com rolagem nas mensagens e campo de envio sempre visível. No celular, selecione uma conversa para abri-la em toda a largura; a seta **Voltar às conversas** retorna à lista. A navegação entre a lista e a conversa preserva o texto ainda não enviado.

O indicador de atualização mostra o horário de Brasília da última leitura bem-sucedida da API. Quando uma atualização em segundo plano falha, a interface identifica os dados como pendentes de atualização, mantendo a última leitura disponível. O painel da Fila de espera considera os encaminhamentos operacionais em espera.

## Controles essenciais

- máquinas de estado validadas na API;
- confirmação explícita em ações sensíveis;
- prevenção de autoaprovação;
- usuários e grupos com autorização por tela;
- bloqueio de usuários desconhecidos ou inativos;
- conflito de agenda bloqueado no servidor;
- concorrência otimista por versão;
- histórico e auditoria gravados com a mutação;
- decisões V-001 a V-020 registradas com comportamento seguro;
- dados demonstrativos somente por carga explícita.
