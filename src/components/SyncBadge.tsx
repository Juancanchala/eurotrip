import type { SyncState } from '../data/cloud';
import { useTrip } from '../lib/store';

export function fmtWhen(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  const today = new Date().toDateString() === d.toDateString();
  return today ? `hoy ${time}` : `${d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })} ${time}`;
}

function text(s: SyncState): string {
  switch (s.status) {
    case 'cargando':
      return 'Cargando datos compartidos…';
    case 'guardando':
      return 'Guardando para todos…';
    case 'sincronizado': {
      const when = fmtWhen(s.updatedAt);
      return `Guardado para todos${when ? ` · ${when}` : ''}${s.updatedBy ? ` por ${s.updatedBy}` : ''}`;
    }
    case 'sin_conexion':
      return 'Sin conexión · cambios guardados en este dispositivo';
    case 'solo_local':
      return 'Modo local · sin datos compartidos';
    case 'error':
      return s.message ?? 'Error de sincronización';
  }
}

export function SyncBadge() {
  const { sync } = useTrip();
  return (
    <span className={`sync ${sync.status}`} role="status" title={sync.message}>
      <span className="sync-dot" aria-hidden="true" />
      {text(sync)}
    </span>
  );
}
