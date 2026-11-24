'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { PhoneInput } from '@/app/PhoneLink';
import JobDescription from '@/app/JobDescription';
import { workspaceFileUrl } from '@/lib/workspace-upload';

type Vacancy = { id: string; title: string; vacancy: string; sector: string; isOpen: boolean; description: string; requirements: string; responsibilities: string; benefits: string };
export default function PublicRecruitmentPage({ processId }: { processId?: string }) {
  const [vacancies, setVacancies] = useState<Vacancy[] | null>(null);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setVacancies(null); setError(''); setSent(false);
    fetch(`/api/public-recruitment${processId ? `/${encodeURIComponent(processId)}` : ''}`, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Processo seletivo indisponível.');
      setVacancies(processId ? [data] : data);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a vaga.'); });
    return () => controller.abort();
  }, [processId]);
  const vacancy = processId ? vacancies?.[0] : undefined;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!vacancy?.isOpen || uploading) return;
    const form = new FormData(event.currentTarget);
    const file = form.get('curriculum');
    if (!(file instanceof File) || !file.size) { setError('Selecione seu currículo.'); return; }
    setUploading(true); setError('');
    try {
      const curriculumUrl = await workspaceFileUrl(file, { module: 'admin', sourceId: vacancy.id, public: true });
      const response = await fetch(`/api/public-recruitment/${vacancy.id}`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: form.get('name'), email: form.get('email'), phone: form.get('phone'), notes: form.get('notes'), curriculumUrl }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Não foi possível enviar sua candidatura.');
      setSent(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível enviar sua candidatura.'); }
    finally { setUploading(false); }
  };
  return <main className="external-experience-page public-application"><section className="external-experience-card public-application-card">
    <span className="public-application-logo" role="img" aria-label="Dontus Gestão Odontológica" />
    <span className="eyebrow">DONTUS · GESTÃO ODONTOLÓGICA</span>
    {!vacancies ? <><h1>{error ? 'Processo seletivo indisponível' : 'Carregando a vaga…'}</h1>{error && <p role="alert">{error}</p>}</> : !processId ? <><h1>Vagas abertas</h1><p>Escolha uma vaga para enviar sua candidatura.</p><div className="public-vacancy-list">{vacancies.map(entry => <a href={`/candidatura/${entry.id}`} key={entry.id}><strong>{entry.vacancy || entry.title}</strong><span>{entry.sector}</span><small>Ver vaga e candidatar-se →</small></a>)}{!vacancies.length && <p>Nenhuma vaga aberta no momento.</p>}</div></> : vacancy && <>
      <p className="public-application-sector">{vacancy.sector}</p><h1>{vacancy.vacancy || vacancy.title}</h1>
      {!vacancy.isOpen ? <div className="public-application-closed"><XCircle size={28} /><h2>Inscrições encerradas</h2><p>Este processo seletivo não está mais recebendo candidaturas.</p></div> : sent ? <div className="public-application-success" role="status"><CheckCircle2 size={28} /><h2>Candidatura enviada!</h2><p>Recebemos suas informações. Caso seu perfil avance, entraremos em contato.</p></div> : <>
        <JobDescription {...vacancy} />
        <form className="public-application-form" onSubmit={submit}>
          <h2>Envie sua candidatura</h2><label>Nome completo *<input name="name" required minLength={3} maxLength={240} autoComplete="name" placeholder="Seu nome completo" /></label>
          <div className="public-application-split"><label>Celular (WhatsApp) *<PhoneInput name="phone" required autoComplete="tel" placeholder="(00) 00000-0000" /></label><label>E-mail *<input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="seu@email.com" /></label></div>
          <label className="upload-document-field">Currículo / carta de apresentação *<input name="curriculum" type="file" required /><small>Envie um arquivo sem limite de tamanho no sistema.</small></label>
          <label>Observações adicionais<textarea name="notes" rows={3} maxLength={6000} placeholder="Alguma informação adicional?" /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="public-gradient-button" disabled={uploading} type="submit">{uploading ? 'Enviando candidatura…' : 'Enviar candidatura'}</button>
        </form>
      </>}
    </>}
  </section></main>;
}
