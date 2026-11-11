"use client";

import { Upload } from "lucide-react";
import FilePreview, {LocalFilePreview} from "@/app/FilePreview";
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
      {selectedFiles.map((file, index) => <LocalFilePreview key={`${file.name}-${file.lastModified}`} file={file} disabled={disabled} onRemove={onRemoveFile?()=>onRemoveFile(index):undefined}/>)}
      {previewUrl && selectedFiles.length === 0 && <FilePreview url={previewUrl} name={previewLabel || "Arquivo atual"} disabled={disabled} onRemove={onRemovePreview}/>}

    </div>}
  </div>;
}
