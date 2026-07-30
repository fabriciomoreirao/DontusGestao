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

As permissões disponíveis por tela são visualizar, criar, editar, aprovar e administrar. Um usuário em vários grupos recebe a união das permissões. Usuários não cadastrados ou inativos recebem acesso negado pela API.

Na tela de grupos, o módulo **Tarefas** também oferece permissões específicas para cancelar, alterar status, prioridade ou SLA, encaminhar, assumir, transferir responsabilidade, consultar outros usuários/setores, administrar cadastros e registrar comunicação com o cliente.

O módulo **Atendimento** possui capacidades próprias para enviar mensagens, registrar notas internas, atribuir e transferir conversas, supervisionar outros setores e administrar canais, números WhatsApp e cadastros do chat.

O menu expansível **Cadastros** reúne os submenus Setores, Tipos de tarefa, Prioridades, Status, Políticas de SLA e Colaboradores. A tela possui permissão própria de consulta e administração por grupo.

## Módulo de Tarefas

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

O sistema não mantém senhas próprias: no Docker local a identidade é encaminhada pelo frontend; em ambiente autenticado, o e-mail vem do provedor da plataforma. A autorização sempre é resolvida no PostgreSQL.

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
