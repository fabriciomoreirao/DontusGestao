# API pública de chamados

Esta API recebe solicitações do sistema externo e cria o card diretamente na etapa **Triagem** do módulo **Chamados**.

## Autenticação

Envie a chave configurada na variável `PUBLIC_SERVICE_REQUESTS_API_KEY`:

```http
X-API-Key: SUA_CHAVE_DE_INTEGRACAO
```

Não exponha a chave no navegador. O sistema externo deve chamar a API pelo próprio servidor.

## Consultar o contrato

```http
GET /api/public-service-requests
```

A resposta informa os tipos aceitos, limites de arquivo e os campos obrigatórios.

## Abrir chamado

```http
POST /api/public-service-requests
Content-Type: multipart/form-data
```

Campos:

| Campo | Formato | Regra |
| --- | --- | --- |
| `clientId` | texto | exatamente 6 números do ID do cliente |
| `companyName` | texto | nome da empresa (`fullName` continua aceito como alias de compatibilidade) |
| `whatsapp` | texto | contato com DDD |
| `type` | texto | Dúvida sobre o sistema, Tarefa, Reclamação, Sugestão, Bug, Cancelamento ou Nova contratação |
| `summary` | texto | descrição da solicitação, de 10 a 1.000 caracteres |
| `files` | arquivo, repetível | obrigatório; de 1 a 5 arquivos, com no máximo 25 MB cada |

Exemplo com `curl`:

```bash
curl -X POST "https://SEU_DOMINIO/api/public-service-requests" \
  -H "X-API-Key: SUA_CHAVE_DE_INTEGRACAO" \
  -F "clientId=230489" \
  -F "companyName=Nome da empresa" \
  -F "whatsapp=5599999999999" \
  -F "type=Bug" \
  -F "summary=Descrição completa da solicitação" \
  -F "files=@evidencia.png"
```

Resposta de sucesso (`201 Created`):

```json
{
  "id": "uuid-do-card",
  "protocol": "C260001",
  "status": "Triagem",
  "classification": "Desenvolvimento",
  "customerMatched": true
}
```

## Formulário pronto

Novos chamados recebem um protocolo no formato `C` + ano com dois dígitos + sequência anual com pelo menos quatro dígitos: `C260001`, `C260002`, `C260003`. O ano segue o horário de Brasília, e a sequência reinicia em `0001` a cada ano. A numeração é reservada na mesma transação do chamado para impedir duplicações em aberturas simultâneas. A exclusão de um chamado não reutiliza seu número. Protocolos anteriores são preservados.

O mesmo fluxo também está disponível pela interface responsiva:

```text
https://SEU_DOMINIO/?public=chamados
```

O cadastro da variável deve ser feito no ambiente do web e da API. Depois de alterar a chave, recrie os dois serviços.
