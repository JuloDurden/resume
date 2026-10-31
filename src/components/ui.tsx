import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { create } from 'zustand'

/* ---------- Champs ---------- */

export function Field({ label, hint, children, inline }: { label?: ReactNode; hint?: ReactNode; children: ReactNode; inline?: boolean }) {
  return (
    <div className={`field${inline ? ' inline' : ''}`}>
      {label && <span className="field-label">{label}</span>}
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  )
}

export function TextInput({ value, onChange, placeholder, type = 'text', autoFocus, className }: { value: string | undefined; onChange: (v: string) => void; placeholder?: string; type?: string; autoFocus?: boolean; className?: string }) {
  return <input className={`input ${className ?? ''}`} type={type} value={value ?? ''} placeholder={placeholder} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />
}

export function TextArea({ value, onChange, minRows = 2, ...rest }: { value: string | undefined; onChange: (v: string) => void; minRows?: number } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [value])
  return <textarea ref={ref} className="input textarea" rows={minRows} value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />
}

export function Select<T extends string | number>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <select
      className="input select"
      value={String(value)}
      onChange={(e) => {
        const o = options.find((x) => String(x.value) === e.target.value)
        if (o) onChange(o.value)
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
      <span className="toggle-label">{label}</span>
    </label>
  )
}

export function Slider({ value, onChange, min, max, step = 1, unit = '', label }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string; label: ReactNode }) {
  return (
    <div className="slider">
      <div className="slider-top">
        <span className="field-label">{label}</span>
        <span className="slider-value">
          {Number.isInteger(step) ? value : value.toFixed(step < 0.1 ? 2 : 1)}
          {unit}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  )
}

export function ColorInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: ReactNode }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <div className="color-input">
      <span className="field-label">{label}</span>
      <div className="color-row">
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)} />
        <input
          className="input mono"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value)
          }}
        />
      </div>
    </div>
  )
}

export function Segmented<T extends string | number>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; title?: string }[] }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button type="button" key={String(o.value)} title={o.title} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------- Modale ---------- */

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ---------- Menu déroulant ---------- */

export function Menu({ trigger, children, align = 'left' }: { trigger: (open: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const on = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', on)
    return () => document.removeEventListener('mousedown', on)
  }, [open])
  return (
    <div className="menu-wrap" ref={ref}>
      {trigger(() => setOpen((o) => !o))}
      {open && <div className={`menu align-${align}`}>{children(() => setOpen(false))}</div>}
    </div>
  )
}

export function MenuItem({ icon, children, onClick, danger }: { icon?: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button className={`menu-item${danger ? ' danger' : ''}`} onClick={onClick}>
      {icon}
      <span>{children}</span>
    </button>
  )
}

/* ---------- Notifications ---------- */

interface Toast {
  id: number
  text: string
  kind: 'ok' | 'error' | 'info'
}
const useToasts = create<{ list: Toast[]; push: (t: Omit<Toast, 'id'>) => void; drop: (id: number) => void }>((set) => ({
  list: [],
  push: (t) => {
    const id = Date.now() + Math.random()
    set((s) => ({ list: [...s.list, { ...t, id }] }))
    setTimeout(() => set((s) => ({ list: s.list.filter((x) => x.id !== id) })), 3200)
  },
  drop: (id) => set((s) => ({ list: s.list.filter((x) => x.id !== id) })),
}))

export const toast = {
  ok: (text: string) => useToasts.getState().push({ text, kind: 'ok' }),
  error: (text: string) => useToasts.getState().push({ text, kind: 'error' }),
  info: (text: string) => useToasts.getState().push({ text, kind: 'info' }),
}

export function Toasts() {
  const list = useToasts((s) => s.list)
  const drop = useToasts((s) => s.drop)
  return (
    <div className="toasts">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => drop(t.id)}>
          {t.text}
        </div>
      ))}
    </div>
  )
}

export function confirmAction(text: string) {
  return window.confirm(text)
}
