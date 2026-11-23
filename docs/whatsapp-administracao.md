# Administração → WhatsApp

Templates, Conexão e Campanhas usam o módulo de permissão `chat`, com
administração e a capacidade `manageWhatsApp`. O envio no chat exige edição,
`sendMessages` e acesso ao setor da conversa.

## Configuração do servidor

As coleções Postman fornecidas documentam os contratos, mas contêm URLs de
exemplo e credenciais vazias. Preencha no `.env` e recrie os serviços api/web:

```dotenv
WABA_CHATWOOT_BASE_URL=https://seu-chatwoot
WABA_CHATWOOT_API_KEY=
WABA_MEOW_BASE_URL=https://seu-meow
WABA_SECURITY_ID=
```

O backend registra a conexão com
`POST /facebook/waba/{waba_id}/registerAmbiente/{phone_id}`, enviando
`chatwoot-api-key` e o JSON `idclinica`, `idDontus`, `base`.
Texto e templates das conexões vinculadas usam os endpoints Meow
`/api/v1/waba/send/text` e `/api/v1/waba/send/template`, com `X-Security-ID`.
Essas credenciais ficam somente no servidor. O módulo local é **WhatsApp**;
o contrato de registro fornecido não define um campo adicional de módulo.

Em Conexão, salve canal, setor, responsável padrão, número, App ID,
Configuration ID, Verify Token e App Secret. Use uma configuração do
Facebook Login for Business para **Embedded Signup v4** e domínio autorizado.
O botão **Iniciar processo** abre o login oficial da Meta. O código é trocado no
backend, a coexistência é validada e a conexão é registrada no Suíte. Se o
registro do Suíte falhar, o cadastro da Meta é preservado para nova tentativa.
Números novos nesta tela usam coexistência, preservando o WhatsApp Business.

## Templates e mensagens

Salvar envia o template à Meta. A lista conserva o status retornado e o motivo
de recusa. O botão atualizar consulta o status oficial; eventos
`message_template_status_update` recebidos no webhook também atualizam a lista.
As variáveis precisam de exemplos e numeração sequencial. Cabeçalhos de mídia
usam o upload de exemplo da Meta e uma URL HTTPS de envio. Botões de URL usam
endereços fixos. Autenticação/OTP não faz parte deste formulário.

Configure o webhook público da aplicação em
`/api/integrations/whatsapp/webhook`, incluindo mensagens, status e atualizações
de templates. Configure `WABA_WEBHOOK_VERIFY_TOKEN` para a validação inicial
do callback pela Meta. O webhook exige assinatura HMAC da Meta ou do gateway
Suíte/Meow, no header `X-Hub-Signature-256: sha256=<hex>`, calculada sobre o
corpo JSON exato em UTF-8. A Meta utiliza o App Secret da conexão; o gateway
utiliza `WABA_WEBHOOK_SECRET`, configurado somente no servidor. Esse segredo
de recebimento é diferente do `WABA_SECURITY_ID` usado na API de envio.
As credenciais reais ficam no `.env`, fora do versionamento. As coleções não
documentam o envelope nem a autenticação dos callbacks personalizados
`waba_status_failed` do Meow; não é aceito um callback sem contrato/assinatura.
Para acompanhar a entrega, encaminhe os eventos canônicos da Meta ao webhook.
O gateway deve encaminhar o envelope `object/entry/changes/value` da Meta,
contendo `messages` ou `statuses`; outros envelopes precisam de adaptador.

Respostas livres no chat exigem uma mensagem real de entrada nas últimas 24
horas; fora da janela, use **Enviar template oficial**. Os envios de templates
revalidam a aprovação na Meta e exigem a autorização do destinatário.

## Campanhas

Importação `.xlsx`, `.xls` e `.csv`, até 5 MB e 5.000 destinatários, com colunas
**Nome** e **Cel**. Colunas adicionais podem fornecer os valores das variáveis
por chave. Telefones são normalizados e duplicados/inválidos são informados.
As opções Pacientes e Contatos selecionam cadastros existentes na central;
as coleções fornecidas não incluem consulta a pacientes do Suíte.

Uma campanha permite até dez templates aprovados da mesma conexão/categoria.
Registre a origem da autorização e revise a prévia antes de salvar. Depois,
defina o disparo imediato ou agendado, em horário de Brasília, na lista.
As tarifas não são fixadas a partir dos prints: a tela oferece o preço oficial
atual da Meta. Cada combinação de destinatário/template é um envio.

O worker consulta a fila a cada dez segundos, usa uma reserva persistida por
campanha e grava o ID retornado pela Meta. Envios interrompidos após iniciar
ficam **Incerta** e exigem conferência no provedor, sem repetição automática.
Cancelar impede os envios pendentes. Os detalhes distinguem aceitação, entrega,
leitura e falha; aceitação da API não equivale a entrega. Os envios aceitos
também aparecem no histórico do chat.

Respostas SAIR, PARE, PARAR, CANCELAR e STOP registram descadastro para novos
templates/campanhas. Mensagens recebidas geram aviso verde no canto superior
direito com cliente, responsável e prévia, respeitando o acesso ao setor.

## Referências

- [Política de mensagens](https://business.whatsapp.com/policy)
- [Embedded Signup v4](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4)
- [Templates oficiais](https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/message_templates/)
- Coleções `WABA_Ambiente_Chatwoot.postman_collection.json` e
  `WABA_Ambiente_Meow.postman_collection.json` fornecidas pelo usuário.
