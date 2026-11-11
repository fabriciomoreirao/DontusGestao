"use client";

import { ExternalLink, FileText, Upload, X } from "lucide-react";
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
  onRemoveFile?: (index: number) => void;
  onRemovePreview?: () => void;
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
  onRemoveFile,
  onRemovePreview,
}: MediaUploadFieldProps) {
  const openLocalFile = (file: File) => {
    const preview = /^(image\/(png|jpeg|gif|webp|avif)|video\/(mp4|webm|ogg|quicktime)|audio\/(mpeg|wav|ogg|webm|mp4)|application\/pdf)$/.test(file.type);
    const url = URL.createObjectURL(preview ? file : new Blob([file], {type:"application/octet-stream"}));
    if (preview) window.open(url, "_blank", "noopener,noreferrer");
    else {const link = document.createElement("a"); link.href = url; link.download = file.name; link.click();}
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
      {selectedFiles.map((file, index) => <span className="media-upload-selected-row" key={`${file.name}-${file.lastModified}`}><button type="button" key={`${file.name}-${file.lastModified}`} onClick={() => openLocalFile(file)}><FileText size={14} /><span>{file.name}</span><small>{Math.max(1, Math.round(file.size / 1024))} KB</small><ExternalLink size={13} /></button>{onRemoveFile&&<button className="media-upload-remove" type="button" disabled={disabled} aria-label={`Remover ${file.name}`} onClick={()=>onRemoveFile(index)}><X size={16}/></button>}</span>)}
      {previewUrl && selectedFiles.length === 0 && <span className="media-upload-selected-row"><a href={previewUrl} target="_blank" rel="noreferrer"><FileText size={14} /><span>{previewLabel || "Visualizar imagem"}</span><ExternalLink size={13} /></a>{onRemovePreview&&<button type="button" className="media-upload-remove" disabled={disabled} aria-label="Remover arquivo atual" onClick={onRemovePreview}><X size={16}/></button>}</span>}
    </div>}
  </div>;
}
