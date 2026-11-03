import { MODULES, type ModuleId } from '../lib/route';

export function Tabs({ current }: { current: ModuleId }) {
  return (
    <nav className="tabs" aria-label="Módulos">
      <ul>
        {MODULES.map((m) => (
          <li key={m.id}>
            <a href={`#/${m.id}`} aria-current={m.id === current ? 'page' : undefined}>
              {m.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
