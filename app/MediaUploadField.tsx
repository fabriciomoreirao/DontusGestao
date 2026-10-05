"use client";

import { ExternalLink, FileText, Upload } from "lucide-react";
import type { ChangeEventHandler, Ref } from "react";

type MediaUploadFieldProps = {
  label: string;
  hint: string;
  accept?: string;
  multiple?: boolean;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  selectedText?: string;
  selectedFiles?: readonly File[];
  previewUrl?: string;
  previewLabel?: string;
  className?: string;
  inputRef?: Ref<HTMLInputElement>;
  onChange?: ChangeEventHandler<HTMLInputElement>;
};

export default function MediaUploadField({
  label,
  hint,
  accept,
  multiple,
  name,
  required,
  disabled,
  selectedText,
  selectedFiles = [],
  previewUrl,
  previewLabel,
  className = "",
  inputRef,
  onChange,
}: MediaUploadFieldProps) {
  const openLocalFile = (file: File) => {
    const url = URL.createObjectURL(file);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  return <div className={`media-upload-field ${className}`.trim()}>
    <span className="media-upload-label">{label}</span>
    <label className="media-upload-control">
      <span className={`media-upload-selection${selectedText ? " selected" : ""}`}>
        {selectedText || (multiple ? "Selecione os arquivos" : "Selecione um arquivo")}
      </span>
      <span className="media-upload-action" aria-hidden="true"><Upload size={22} /></span>
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} name={name} required={required} disabled={disabled} onChange={onChange} />
    </label>
    <small>{hint}</small>
    {(selectedFiles.length > 0 || previewUrl) && <div className="media-upload-links" aria-label="Arquivos selecionados">
      {selectedFiles.map((file) => <button type="button" key={`${file.name}-${file.lastModified}`} onClick={() => openLocalFile(file)}><FileText size={14} /><span>{file.name}</span><small>{Math.max(1, Math.round(file.size / 1024))} KB</small><ExternalLink size={13} /></button>)}
      {previewUrl && selectedFiles.length === 0 && <a href={previewUrl} target="_blank" rel="noreferrer"><FileText size={14} /><span>{previewLabel || "Visualizar imagem"}</span><ExternalLink size={13} /></a>}
    </div>}
  </div>;
}
