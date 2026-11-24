import { Fragment } from 'react';

function BoldText({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : <Fragment key={index}>{part}</Fragment>)}</>;
}
function DescriptionSection({ title, text }: { title: string; text?: string }) {
  if (!text?.trim()) return null;
  return <section className="job-description-section"><h2>{title}</h2>{text.split(/\r?\n\s*\r?\n/).map((paragraph, index) => {
    const lines = paragraph.split(/\r?\n/);
    return lines.every(line => /^\s*[-•*]\s+/.test(line))
      ? <ul key={index}>{lines.map((line, number) => <li key={number}><BoldText text={line.replace(/^\s*[-•*]\s+/, '')} /></li>)}</ul>
      : <p key={index}><BoldText text={paragraph} /></p>;
  })}</section>;
}
export default function JobDescription({ description, requirements, responsibilities, benefits }: { description?: string; requirements?: string; responsibilities?: string; benefits?: string }) {
  return <div className="public-job-description job-description-sections"><DescriptionSection title="Sobre a vaga" text={description || 'Preencha seus dados para participar do processo seletivo.'} /><DescriptionSection title="Responsabilidades" text={responsibilities} /><DescriptionSection title="Requisitos" text={requirements} /><DescriptionSection title="Benefícios" text={benefits} /></div>;
}
