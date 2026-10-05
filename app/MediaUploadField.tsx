"use client";

import { Upload } from "lucide-react";
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
  className = "",
  inputRef,
  onChange,
}: MediaUploadFieldProps) {
  return <label className={`media-upload-field ${className}`.trim()}>
    <span className="media-upload-label">{label}</span>
    <span className="media-upload-control">
      <span className={`media-upload-selection${selectedText ? " selected" : ""}`}>
        {selectedText || (multiple ? "Selecione os arquivos" : "Selecione um arquivo")}
      </span>
      <span className="media-upload-action" aria-hidden="true"><Upload size={22} /></span>
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} name={name} required={required} disabled={disabled} onChange={onChange} />
    </span>
    <small>{hint}</small>
  </label>;
}
