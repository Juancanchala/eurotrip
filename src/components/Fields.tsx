import { useEffect, useId, useState, type ReactNode } from 'react';

/** Acepta "1.234,5", "1234.5" o "1 234". */
export function parseNumber(s: string): number | null {
  const t = s.trim().replace(/\s/g, '');
  if (!t) return null;
  // Si hay coma, la coma es decimal y los puntos son miles.
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

interface NumberFieldProps {
  label: ReactNode;
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  optional?: boolean;
  suffix?: string;
  hint?: ReactNode;
  className?: string;
}

/** Campo numérico que no pelea con el usuario: guarda solo valores válidos y deja escribir libremente. */
export function NumberField({ label, value, onChange, min, max, step, integer, optional, suffix, hint, className }: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value === undefined ? '' : String(value));
  }, [value, focused]);

  const n = parseNumber(text);
  const error =
    text.trim() === ''
      ? optional
        ? null
        : 'Requerido'
      : n === null
        ? 'Número no válido'
        : integer && !Number.isInteger(n)
          ? 'Debe ser entero'
          : min !== undefined && n < min
            ? `Mínimo ${min}`
            : max !== undefined && n > max
              ? `Máximo ${max}`
              : null;

  return (
    <label className={`field${error ? ' invalid' : ''}${className ? ` ${className}` : ''}`} htmlFor={id}>
      <span className="field-label">{label}</span>
      <span className="field-input">
        <input
          id={id}
          inputMode={integer ? 'numeric' : 'decimal'}
          value={text}
          step={step}
          aria-invalid={!!error}
          aria-describedby={error || hint ? `${id}-h` : undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            const t = e.target.value;
            setText(t);
            const v = parseNumber(t);
            if (t.trim() === '' && optional) onChange(undefined);
            else if (v !== null && (!integer || Number.isInteger(v)) && (min === undefined || v >= min) && (max === undefined || v <= max)) onChange(v);
          }}
        />
        {suffix && <span className="field-suffix">{suffix}</span>}
      </span>
      {(error || hint) && (
        <span id={`${id}-h`} className={error ? 'field-error' : 'field-hint'}>
          {error ?? hint}
        </span>
      )}
    </label>
  );
}

export function TextField({
  label,
  value,
  onChange,
  type = 'text',
  validate,
  placeholder,
  multiline,
  className,
}: {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  type?: 'text' | 'url' | 'date';
  /** Devuelve un mensaje de error o null. Si hay error, no se guarda. */
  validate?: (v: string) => string | null;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
}) {
  const id = useId();
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value);
  }, [value, focused]);
  const error = validate ? validate(text) : null;
  const common = {
    id,
    value: text,
    placeholder,
    'aria-invalid': !!error,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  };
  const handle = (t: string) => {
    setText(t);
    if (!validate || !validate(t)) onChange(t);
  };
  return (
    <label className={`field${error ? ' invalid' : ''}${className ? ` ${className}` : ''}`} htmlFor={id}>
      <span className="field-label">{label}</span>
      {multiline ? (
        <textarea {...common} rows={3} onChange={(e) => handle(e.target.value)} />
      ) : (
        <input {...common} type={type} onChange={(e) => handle(e.target.value)} />
      )}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: ReactNode;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <label className={`field${className ? ` ${className}` : ''}`} htmlFor={id}>
      <span className="field-label">{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 99,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Quitar uno: ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <output className="num" aria-live="polite">
        {value}
      </output>
      <button type="button" aria-label={`Agregar uno: ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

export const isUrlOrEmpty = (v: string) => {
  if (!v.trim()) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:' ? null : 'Debe empezar con https://';
  } catch {
    return 'Enlace no válido (debe empezar con https://)';
  }
};

export const isDateOrEmpty = (v: string) => (!v || /^\d{4}-\d{2}-\d{2}$/.test(v) ? null : 'Fecha AAAA-MM-DD');
