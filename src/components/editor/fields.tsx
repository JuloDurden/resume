import { useRef, useState, type KeyboardEvent } from 'react'
import { ArrowDown, ArrowUp, ImagePlus, Plus, Sparkles, Trash2, X } from 'lucide-react'
import type { DateValue } from '../../types'
import { MONTH_OPTIONS } from '../../lib/dates'
import { Icon, PICKABLE_ICONS } from '../../lib/icons'
import { TextArea, toast } from '../ui'

export function DateInput({ value, onChange, disabled }: { value?: DateValue; onChange: (v: DateValue | undefined) => void; disabled?: boolean }) {
  return (
    <div className={`date-input${disabled ? ' disabled' : ''}`}>
      <select className="input select" disabled={disabled} value={value?.month ?? ''} onChange={(e) => onChange({ ...value, month: e.target.value ? Number(e.target.value) : undefined })}>
        <option value="">Mois</option>
        {MONTH_OPTIONS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <input
        className="input"
        disabled={disabled}
        inputMode="numeric"
        placeholder="Année"
        value={value?.year ?? ''}
        onChange={(e) => {
          const y = e.target.value.replace(/\D/g, '').slice(0, 4)
          onChange(y ? { ...value, year: Number(y) } : value?.month ? { month: value.month } : undefined)
        }}
      />
    </div>
  )
}

export function TagsInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState('')
  const [drag, setDrag] = useState<number | null>(null)
  const add = (raw: string) => {
    const parts = raw.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
    if (!parts.length) return
    onChange([...value, ...parts.filter((p) => !value.includes(p))])
    setText('')
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add(text)
    } else if (e.key === 'Backspace' && !text && value.length) {
      onChange(value.slice(0, -1))
    }
  }
  return (
    <div className="tags-input">
      {value.map((t, i) => (
        <span
          key={`${t}-${i}`}
          className={`chip${drag === i ? ' dragging' : ''}`}
          draggable
          onDragStart={() => setDrag(i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (drag === null || drag === i) return
            const next = [...value]
            const [m] = next.splice(drag, 1)
            next.splice(i, 0, m)
            onChange(next)
            setDrag(null)
          }}
          onDragEnd={() => setDrag(null)}
        >
          {t}
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Retirer ${t}`}>
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        value={text}
        placeholder={value.length ? '' : placeholder ?? 'Tapez puis Entrée'}
        onChange={(e) => {
          if (/[,;]/.test(e.target.value)) add(e.target.value)
          else setText(e.target.value)
        }}
        onKeyDown={onKey}
        onBlur={() => text.trim() && add(text)}
        onPaste={(e) => {
          const t = e.clipboardData.getData('text')
          if (/[,;\n]/.test(t)) {
            e.preventDefault()
            add(t)
          }
        }}
      />
    </div>
  )
}

export function BulletsEditor({ value, onChange, onAskClaude }: { value: string[]; onChange: (v: string[]) => void; onAskClaude?: () => void }) {
  const refs = useRef<(HTMLTextAreaElement | null)[]>([])
  const focus = (i: number) => setTimeout(() => refs.current[i]?.focus(), 0)
  const set = (i: number, v: string) => onChange(value.map((b, j) => (j === i ? v : b)))
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= value.length) return
    const next = [...value]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  return (
    <div className="bullets-editor">
      {value.map((b, i) => (
        <div className="bullet-row" key={i}>
          <span className="bullet-dot">•</span>
          <TextArea
            value={b}
            minRows={1}
            placeholder="Action + périmètre + résultat chiffré"
            onChange={(v) => {
              if (v.includes('\n')) {
                const lines = v.split('\n')
                const next = [...value]
                next.splice(i, 1, ...lines.map((l) => l.replace(/^\s*[-•*]\s*/, '')))
                onChange(next)
                focus(i + lines.length - 1)
              } else set(i, v)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !b && value.length > 1) {
                e.preventDefault()
                onChange(value.filter((_, j) => j !== i))
                focus(Math.max(0, i - 1))
              }
            }}
            onFocus={(e) => (refs.current[i] = e.currentTarget)}
          />
          <div className="bullet-actions">
            <button type="button" className="icon-btn xs" onClick={() => move(i, -1)} disabled={i === 0} title="Monter">
              <ArrowUp size={13} />
            </button>
            <button type="button" className="icon-btn xs" onClick={() => move(i, 1)} disabled={i === value.length - 1} title="Descendre">
              <ArrowDown size={13} />
            </button>
            <button type="button" className="icon-btn xs" onClick={() => onChange(value.filter((_, j) => j !== i))} title="Supprimer">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}
      <div className="bullets-foot">
        <button type="button" className="btn ghost sm" onClick={() => onChange([...value, ''])}>
          <Plus size={14} /> Ajouter une puce
        </button>
        {onAskClaude && (
          <button type="button" className="btn ghost sm claude" onClick={onAskClaude}>
            <Sparkles size={14} /> Réécrire avec Claude
          </button>
        )}
      </div>
    </div>
  )
}

export function LevelInput({ value, onChange }: { value?: number; onChange: (v: number) => void }) {
  return (
    <div className="level-input">
      {[0, 1, 2, 3, 4, 5].map((l) => (
        <button type="button" key={l} className={(value ?? 0) >= l && l > 0 ? 'on' : ''} onClick={() => onChange(l)} title={l === 0 ? 'Aucun' : `${l}/5`}>
          {l === 0 ? <X size={11} /> : null}
        </button>
      ))}
    </div>
  )
}

export function IconPicker({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="icon-picker">
      <button type="button" className="icon-btn bordered" onClick={() => setOpen((o) => !o)} title="Choisir une icône">
        <Icon name={value} size={16} />
      </button>
      {open && (
        <div className="icon-grid" onMouseLeave={() => setOpen(false)}>
          {PICKABLE_ICONS.map((n) => (
            <button
              type="button"
              key={n}
              className={n === value ? 'on' : ''}
              onClick={() => {
                onChange(n)
                setOpen(false)
              }}
            >
              <Icon name={n} size={16} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Charge une photo et la réduit pour limiter la taille du document. */
export function PhotoInput({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const onFile = (f: File) => {
    if (!f.type.startsWith('image/')) return toast.error('Choisissez une image.')
    const img = new Image()
    const url = URL.createObjectURL(f)
    img.onload = () => {
      const size = 480
      const s = Math.min(img.width, img.height)
      const c = document.createElement('canvas')
      c.width = c.height = size
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size)
      onChange(c.toDataURL('image/jpeg', 0.88))
      URL.revokeObjectURL(url)
    }
    img.src = url
  }
  return (
    <div className="photo-input">
      {value ? <img src={value} alt="" /> : <div className="photo-empty">Photo</div>}
      <div className="photo-actions">
        <button type="button" className="btn sm" onClick={() => ref.current?.click()}>
          <ImagePlus size={14} /> {value ? 'Changer' : 'Ajouter'}
        </button>
        {value && (
          <button type="button" className="btn ghost sm" onClick={() => onChange(undefined)}>
            Retirer
          </button>
        )}
        <span className="field-hint">Recadrée en carré automatiquement.</span>
      </div>
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </div>
  )
}
