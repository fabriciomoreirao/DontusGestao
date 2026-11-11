# Ajustes e validação — 11/11/2026

## Entrega

Aplicação local: http://localhost:3000. API: porta 8080. Mantida a configuração existente do Docker Compose e os volumes de dados.

## Correções

- Tarefas compartilhadas: botão para assumir em nome próprio; após a atribuição, somente o responsável transfere a responsabilidade. Colaboradores ativos de outros setores podem receber e visualizar suas tarefas. Mantidos os cards compactos e o aviso do cliente no canto superior direito.
- Modal da tarefa: edição em camada própria, rolagem e rodapé acessíveis; descrição, anexos, comentários, resumo, ações e histórico seguem a organização solicitada.
- Telefones: campos de edição sem ícone sobreposto; números exibidos com acesso ao WhatsApp do computador.
- Comentários: barra compacta com emoji, negrito, clipe e envio; quebras de linha e links preservados; histórico com os cinco comentários recentes e expansão. Reutilizados os comandos e as permissões dos módulos.
- Chat: aba exclusiva de grupos, gestão de participantes e saída do grupo; tema claro; datas Hoje/Ontem; atualização de presença; gravação, prévia, cancelamento, envio e reprodução de áudio; seleção de GIF junto aos emojis.
- Conclusão de tarefas: aviso ao criador, responsável, coordenadores e comentaristas, com destinatários distintos e proteção contra repetição da mesma transição.
- Agenda: alerta persistente de compromissos Agendados há mais de três dias, com acesso ao compromisso. A contagem só reinicia quando o status muda. Reservas de sala com tipo e participantes, visíveis nas agendas dos convidados.
- Fila de Espera: troca de setor restrita ao criador, atualização da fila e aviso ao destino. Contato feito permanece na fila, sem gerar atendimento automaticamente.
- Anotações: publicação para setor ou Todos; escopo aplicado também à consulta geral. Botão e aba de anotações vinculadas na ficha do cliente.
- Alertas do cliente: preenchimento automático do nome localizado e nome manual quando não houver cliente vinculado.
- Indicadores comerciais: coorte exclusiva de Tráfego Pago para Campanhas/Qualificação, sem duplicar transferências; entrada, fechamento e passagem para outros CRMs. Filtro de CRM nos demais indicadores.
- Retenção: sucesso vinculado ao encaminhamento real para Onboarding Retenção; novos acompanhamentos de retenção permitidos para o mesmo cliente. Ativação mantém a proteção de duplicidade.
- Cancelamentos: leitura de valores em centavos e formatos legados, atualização dos cálculos e separação de valores recuperados, perdidos e em risco.
- Matriz e subtarefa: acesso restrito aos registros vinculados para os respectivos responsáveis; visualização de vídeos e anexos; comentários da subtarefa sincronizados uma vez na matriz.
- Uploads: área ampliada, remoção de arquivos selecionados e gerenciamento de anexos nas sugestões e demais fluxos ajustados. Mantidos limites de quantidade e tamanho e verificações de autorização.
- Contas Estratégicas: salvamento e leitura das features da unidade; uso da área disponível. Filtros do CRM e cards de acompanhamento com distribuição e quebra de conteúdo corrigidas.
- Tipos e origens: validação dos campos configurados no frontend e backend, preservando edições de registros legados sem inventar valores de origem.

## Evidências e limites da validação

- TypeScript: compilação sem emissão, sem erros.
- Frontend: 287 testes automatizados aprovados, incluindo atribuição, comentários/anexos, datas do chat, finanças e coorte comercial.
- Backend: 485 testes automatizados aprovados em Docker, incluindo permissões de atribuição, acesso entre matriz/subtarefa, notificações, convites da agenda, anotações por setor, uploads e repetição de Retenção.
- PostgreSQL local: migração `20261110190937_AgendaStatusChangedAt` aplicada; API autenticada consultada contra o banco local. Consultas sem sessão retornaram 401 e com sessão retornaram 200.
- Navegador: conferidos filtros do CRM, formulário de anotações por setor, apresentação da tarefa e edição sem corte, comentários/telefones, tipo e participantes na agenda e interface de grupos do chat.
- Áudio no navegador: gravação, reprodução, envio e cancelamento verificados com fluxo de áudio sintético. O microfone físico não foi utilizado.
- Os testes de serviço usam banco de testes em memória; a aplicação local e a migração foram verificadas com PostgreSQL. Não foram enviadas mensagens a colaboradores nem alterados grupos reais durante a inspeção visual.

Imagens de conferência ficam em `outputs/`, fora do versionamento. Credenciais, anexos de clientes e logs locais não fazem parte do commit.
