// A calendar day in Brasília selects one message for everyone, including open tabs.
export const businessMessages = [
  "Crescer começa com uma ação bem feita hoje. Vamos transformar foco em resultado.",
  "Cada cliente bem atendido fortalece o futuro da nossa empresa.",
  "Resultados consistentes nascem de pequenas melhorias feitas todos os dias.",
  "Quando o time compartilha o mesmo objetivo, o crescimento ganha força.",
  "Ouça o cliente, encontre oportunidades e transforme aprendizado em evolução.",
  "Planejamento orienta o caminho; execução com qualidade faz a empresa avançar.",
  "Nosso próximo resultado começa na responsabilidade que assumimos agora.",
  "Uma empresa cresce quando suas pessoas aprendem e evoluem juntas.",
  "Metas claras e colaboração diária transformam esforço em conquista.",
  "Melhorar um processo hoje abre espaço para crescer amanhã.",
  "A confiança dos clientes é construída em cada entrega e em cada compromisso.",
  "Priorize o que gera valor e acompanhe o que aproxima o time da meta.",
  "Grandes resultados pedem constância, iniciativa e atenção aos detalhes.",
  "Compartilhar conhecimento multiplica a capacidade de toda a empresa.",
  "Oportunidades de crescimento aparecem quando olhamos os desafios com iniciativa.",
  "Celebre os avanços, aprenda com os números e siga melhorando.",
  "Cada problema resolvido com cuidado é um passo para resultados melhores.",
  "Transforme boas ideias em ações que façam diferença para o cliente.",
  "Uma entrega de qualidade hoje constrói novas oportunidades amanhã.",
  "Crescimento sustentável combina organização, pessoas e clientes satisfeitos.",
  "Acompanhar os resultados ajuda a escolher melhor o próximo passo.",
  "O compromisso de cada pessoa fortalece as conquistas de todo o time.",
  "Trabalhe com propósito: cada melhoria pode ampliar o impacto da empresa.",
  "Quem escuta, aprende; quem aplica o aprendizado, cresce.",
  "Faça do dia de hoje uma oportunidade de elevar nosso padrão de entrega.",
  "Alinhe prioridades, una esforços e avance com clareza em direção à meta.",
  "Agir com consistência transforma desafios em caminhos de crescimento.",
  "Nossa evolução depende das boas decisões que colocamos em prática juntos.",
  "Valorize cada contato: relacionamentos fortes sustentam resultados duradouros.",
  "Inove com simplicidade, execute com cuidado e acompanhe a evolução.",
  "O crescimento da empresa se constrói com atitude, colaboração e melhoria contínua.",
] as const;

export function dashboardMessage(at: number | Date = Date.now()) {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
  return businessMessages[
    Math.floor(Date.parse(day) / 86_400_000) % businessMessages.length
  ];
}
