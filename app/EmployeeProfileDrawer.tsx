"use client";

import { Activity, BadgeCheck, BriefcaseBusiness, CalendarDays, Camera, Code2, Headphones, ListTodo, Save, Sparkles, UserRound, UsersRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import useDialogFocus from "@/app/useDialogFocus";
import type { EmployeeProfile } from "@/lib/employee-profile";

type WorkItem = { module: string; record_type: string; owner: string; description: string };
type Task = { assigneeName: string; completedAt?: string | null; cancelled: boolean };
type Props = { profileId: string; editable: boolean; items: WorkItem[]; tasks: Task[]; onClose: () => void };
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
const birthday = (day: number | null, month: number | null) => day && month
  ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, month - 1, day))) : "Não informado";

export default function EmployeeProfileDrawer({ profileId, editable, items, tasks, onClose }: Props) {
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [coverDataUrl, setCoverDataUrl] = useState("");
  const [bio, setBio] = useState("");
  const [phrase, setPhrase] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [retry, setRetry] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const drawer = useRef<HTMLElement>(null);
  useDialogFocus(drawer, onClose);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`/api/employee-profiles/${encodeURIComponent(profileId)}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail ?? "Não foi possível abrir o perfil.");
        if (!payload.employee?.id) throw new Error("O perfil retornou dados inválidos.");
        if (controller.signal.aborted) return;
        setProfile(payload); setCoverDataUrl(payload.coverDataUrl); setBio(payload.bio); setPhrase(payload.phrase);
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Não foi possível abrir o perfil.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    return () => controller.abort();
  }, [profileId, retry]);

  const employee = profile?.employee;
  const canEdit = editable && profile?.canEdit === true;
  const assigned = items.filter(item => item.owner === employee?.displayName);
  const serviceCount = assigned.filter(item => item.module === "support" && /atendimento/i.test(item.record_type)).length;
  const trackingCount = assigned.filter(item => {
    if (item.module !== "cs") return false;
    try { const value = JSON.parse(item.description); return value.kind === "csJourney" && !["finished", "cancelled", "cancelledWithoutTraining"].includes(value.phase); }
    catch { return false; }
  }).length;
  const developmentCount = assigned.filter(item => item.module === "ti").length;
  const taskCount = tasks.filter(task => task.assigneeName === employee?.displayName && !task.completedAt && !task.cancelled).length;
  const upload = (file?: File) => {
    setError(""); setSuccess("");
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setError("Selecione uma imagem PNG, JPEG ou WebP."); return; }
    if (file.size > 2 * 1024 * 1024) { setError("A capa deve ter no máximo 2 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => setCoverDataUrl(String(reader.result ?? ""));
    reader.onerror = () => setError("Não foi possível ler a imagem. Selecione o arquivo novamente.");
    reader.readAsDataURL(file);
  };
  const save = async () => {
    if (!profile || !canEdit || saving) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/employee-profiles/me", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ coverDataUrl, bio, phrase, version: profile.version }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail ?? "Não foi possível salvar o perfil.");
      setProfile(payload); setCoverDataUrl(payload.coverDataUrl); setBio(payload.bio); setPhrase(payload.phrase);
      setSuccess("Perfil atualizado com sucesso.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível salvar o perfil."); }
    finally { setSaving(false); }
  };

  return <div className="employee-profile-backdrop" onMouseDown={event => event.currentTarget === event.target && onClose()}>
    <aside ref={drawer} className="employee-profile-drawer" role="dialog" aria-modal="true" aria-label={employee ? `Perfil de ${employee.displayName}` : "Perfil do colaborador"} tabIndex={-1}>
      <header className="employee-profile-cover" data-preview-image={coverDataUrl || undefined} aria-label={coverDataUrl && employee ? `Capa do perfil de ${employee.displayName}` : undefined} style={coverDataUrl ? { backgroundImage: `linear-gradient(rgba(3,12,24,.12),rgba(3,12,24,.76)),url("${coverDataUrl}")` } : undefined}>
        <button className="employee-profile-close" onClick={onClose} aria-label="Fechar perfil"><X size={19}/></button>
        {canEdit && <><input ref={fileInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={event => upload(event.target.files?.[0])}/><button type="button" className="employee-cover-upload" disabled={saving} onClick={() => fileInput.current?.click()}><Camera size={15}/>{coverDataUrl ? "Trocar capa" : "Adicionar capa"}</button></>}
      </header>
      {loading ? <div className="employee-profile-body" role="status">Carregando perfil...</div> : employee && <div className="employee-profile-body">
        <div className={`employee-profile-avatar ${employee.photoDataUrl ? "has-photo" : ""}`} style={employee.photoDataUrl ? { backgroundImage: `url("${employee.photoDataUrl}")` } : undefined}>{!employee.photoDataUrl && (initials(employee.displayName) || <UserRound/>)}{employee.isCoordinator && <i><BadgeCheck size={16}/></i>}</div>
        <div className="employee-profile-heading"><span className="eyebrow">PERFIL DO COLABORADOR</span><h2>{employee.displayName}</h2><p>{employee.jobTitle || employee.departmentName || "Colaborador Dontus"}</p></div>
        <section className="employee-profile-facts"><article><CalendarDays/><span><small>Aniversário</small><strong>{birthday(employee.birthdayDay, employee.birthdayMonth)}</strong></span></article><article><BriefcaseBusiness/><span><small>Departamento</small><strong>{employee.departmentNames.join(" · ") || employee.departmentName || "Não informado"}</strong></span></article><article><UsersRound/><span><small>Supervisor</small><strong>{employee.supervisorName || "Não vinculado"}</strong></span></article></section>
        <section className="employee-profile-metrics"><article><Headphones/><span><strong>{serviceCount}</strong><small>Atendimentos</small></span></article><article><Activity/><span><strong>{trackingCount}</strong><small>Em acompanhamento</small></span></article><article><Code2/><span><strong>{developmentCount}</strong><small>Desenvolvimento</small></span></article><article><ListTodo/><span><strong>{taskCount}</strong><small>Tarefas pendentes</small></span></article></section>
        <section className="employee-profile-quote"><Sparkles size={18}/>{canEdit ? <textarea aria-label="Frase do perfil" value={phrase} maxLength={180} disabled={saving} onChange={event => { setPhrase(event.target.value); setSuccess(""); }} placeholder="Adicione uma frase que representa você..."/> : <p>{phrase || "Nenhuma frase adicionada."}</p>}</section>
        <label className="employee-profile-bio"><span>Biografia</span>{canEdit ? <textarea aria-label="Biografia" value={bio} maxLength={900} rows={7} disabled={saving} onChange={event => { setBio(event.target.value); setSuccess(""); }} placeholder="Conte um pouco sobre sua experiência, responsabilidades e interesses."/> : <p>{bio || "Bio ainda não preenchida."}</p>}</label>
        {error && <p className="employee-profile-error" role="alert">{error}</p>}
        {success && <p className="employee-profile-feedback" role="status">{success}</p>}
        {canEdit && <button className="primary-button employee-profile-save" disabled={saving} onClick={() => void save()}><Save size={16}/>{saving ? "Salvando..." : "Salvar perfil"}</button>}
      </div>}
      {error && !employee && <div className="employee-profile-message"><p className="employee-profile-error" role="alert">{error}</p><button className="secondary-button" onClick={() => { setError(""); setLoading(true); setRetry(value => value + 1); }}>Tentar novamente</button></div>}
    </aside>
  </div>;
}
