# Máquinas de estado

As transições são validadas no servidor. O fluxo padrão avança para o próximo estado e admite apenas saídas excepcionais previstas para cada domínio.

## Comercial

`NovoLead → EmContato → Qualificado → Diagnostico → Apresentacao → Negociacao → Ganho`

Saídas excepcionais: `Perdido`, `Cancelado`.

## Customer Success

`PendenteAgendamento → Agendado → TreinamentoRealizado → EmAcompanhamento → AguardandoCliente → Pausado → EmValidacaoFinal → Finalizado → TransferidoSuporte`

Finalização e transferência exigem confirmação explícita.

## LIA

`AguardandoKickoff → KickoffAgendado → ConfiguracaoInicial → EmTesteCliente → EmAjustes → AguardandoAprovacao → GoLiveAgendado → EmProducaoAssistida → ImplantacaoPrincipalConcluida → ConfigurandoCRC → Concluida`

Saídas excepcionais: `BloqueadaPeloCliente`, `Pausada`, `Cancelada`. Go-live e conclusão exigem confirmação.

## Suporte

`Novo → EmAtendimento → AguardandoCliente/Setor/TI → Resolvido → Encerrado`

Reabertura preserva histórico.

## TI

`Nova → EmTriagem → AguardandoInformacoes → Classificada → EmAnaliseTecnica → Priorizada → EmDesenvolvimento/EmCorrecao → EmTeste → AguardandoHomologacao → AguardandoDeploy → Concluida`

## Financeiro

`Rascunho → PendenteAprovacao → Aprovada → Agendada → Paga`

Saídas: `Vencida`, `Cancelada`, `Estornada`. Aprovação, pagamento e estorno exigem confirmação.
