# Dontus — sistema visual de operações

Base de implementação: UI/UX Pro Max instalada em `C:/Users/elixa/.codex/skills/ui-ux-pro-max`.
Consultas locais: direção enterprise/analytics, navegação por teclado, formulários em React e gráficos temporais.

## Direção aplicada

Interface administrativa com hierarquia clara, superfícies discretas, azul da marca,
ícones Lucide e densidade adequada à leitura de tabelas e kanbans. Fontes Manrope e
Inter já carregadas pelo produto. Números de indicadores usam algarismos tabulares.
A preferência de cor dos controles, os fundos personalizados e os fluxos atuais
continuam sendo respeitados.

## Escala e componentes

- Espaçamento: 4, 8, 12, 16, 24 e 32 px.
- Texto: 14 px no trabalho diário; 12 px em metadados; títulos de página entre 22 e 26 px.
- Controles: altura de 44 px nos formulários; alvos de ícones de 40 px, ampliados para 44 px em telas de toque.
- Cards e painéis: borda semântica, raio de 14–18 px e sombra suave.
- Botões: ação principal destacada; ações secundárias com superfície e borda; foco visível e estado desabilitado identificável.
- Modais e gavetas: cabeçalhos legíveis, fundo separado por scrim e rolagem preservada.
- Seletores pesquisáveis: busca por termos sem acentos, seleção explícita de valor cadastrado, teclado e mensagem de lista vazia.

## Temas e responsividade

Tokens semânticos para texto, superfície, campos e bordas em claro e escuro. O tema
escuro usa superfícies azul-marinho e texto claro. Recuos responsivos de 16 a 24 px,
linhas de filtros que quebram antes de comprimir os campos e tabelas com rolagem
restrita ao próprio quadro. Movimento reduzido respeitado.

## Indicadores de acesso

Consulta autenticada com as mesmas permissões e os mesmos filtros do histórico.
Todo o conjunto filtrado alimenta as métricas. Datas e horas são convertidas para
America/Sao_Paulo. Evolução temporal em colunas/linha; responsáveis, motivos e
clientes em barras, com valores e tabelas acessíveis. Categorias além das primeiras
dez são incluídas em “Demais”, conservando o total. Intervalos sem acessos valem zero.

## Verificação

Validar teclado (setas, Enter, Escape e Tab), abertura de seletores dentro do modal,
filtros preservados entre histórico e indicadores, datas inclusivas e totais sem
dependência da paginação. Conferir contraste nos dois temas e larguras de 375,
768, 1024 e 1440 px quando a ferramenta de navegador estiver disponível.
