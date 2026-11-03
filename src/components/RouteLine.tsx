import { Fragment } from 'react';
import type { Scenario } from '../engine/types';
import { MODE_LABEL } from '../lib/format';

/** Recorrido como línea de tren: paradas unidas por tramos (continuo = tren, punteado = vuelo). */
export function RouteLine({ scenario, name }: { scenario: Scenario; name: (id: string) => string }) {
  const legs = scenario.legs;
  if (!legs.length) return null;
  const description = [name(legs[0]!.from), ...legs.map((l) => `${MODE_LABEL[l.mode].toLowerCase()} a ${name(l.to)}`)].join(', ');
  return (
    <ol className="rl" aria-label={`Recorrido: ${description}`}>
      <li className="rl-stop">
        <span className="rl-dot" aria-hidden="true" />
        {name(legs[0]!.from)}
      </li>
      {legs.map((l) => (
        <Fragment key={l.id}>
          <li className={`rl-leg ${l.mode}`} aria-hidden="true" title={MODE_LABEL[l.mode]} />
          <li className="rl-stop">
            <span className="rl-dot" aria-hidden="true" />
            {name(l.to)}
          </li>
        </Fragment>
      ))}
    </ol>
  );
}
