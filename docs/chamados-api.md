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
| `fullName` | texto | nome completo |
| `whatsapp` | texto | contato com DDD |
| `type` | texto | Desenvolvimento, Tarefa, Reclamação, Sugestão, Elogio, Cancelamento ou Nova contratação |
| `summary` | texto | descrição da solicitação |
| `files` | arquivo, repetível | obrigatório; de 1 a 10 arquivos, com no máximo 25 MB cada |

Exemplo com `curl`:

```bash
curl -X POST "https://SEU_DOMINIO/api/public-service-requests" \
  -H "X-API-Key: SUA_CHAVE_DE_INTEGRACAO" \
  -F "clientId=230489" \
  -F "fullName=Nome do cliente" \
  -F "whatsapp=5599999999999" \
  -F "type=Desenvolvimento" \
  -F "summary=Descrição completa da solicitação" \
  -F "files=@evidencia.png"
```

Resposta de sucesso (`201 Created`):

```json
{
  "id": "uuid-do-card",
  "protocol": "CH-20261009-ABC123",
  "status": "Triagem",
  "classification": "Desenvolvimento",
  "customerMatched": true
}
```

## Formulário pronto

O mesmo fluxo também está disponível pela interface responsiva:

```text
https://SEU_DOMINIO/?public=chamados
```

O cadastro da variável deve ser feito no ambiente do web e da API. Depois de alterar a chave, recrie os dois serviços.
