import { effectiveRate, groupThousands } from '../../engine';
import { NumberField, TextField } from '../../components/Fields';
import { useTrip } from '../../lib/store';

export function Tasa() {
  const { data, mutate } = useTrip();
  const st = data.settings;
  const eff = effectiveRate(st.baseRate, st.cushionPct);

  return (
    <>
      <section className="panel" aria-labelledby="fx-title">
        <div className="panel-head">
          <div>
            <h2 id="fx-title">Tasa del euro</h2>
            <p>Por ahora es manual. En el paso 4 se consulta sola cada día, con esta como respaldo.</p>
          </div>
        </div>
        <div className="grid-fields">
          <NumberField
            label="EUR → COP (base)"
            value={st.baseRate}
            min={1000}
            max={20000}
            suffix="COP"
            onChange={(n) =>
              n !== undefined &&
              mutate((d) => {
                d.settings.baseRate = n;
              })
            }
          />
          <NumberField
            label="Colchón sobre la tasa"
            value={st.cushionPct}
            min={0}
            max={30}
            suffix="%"
            onChange={(n) =>
              mutate((d) => {
                d.settings.cushionPct = n ?? 0;
              })
            }
            hint="Protege contra una subida del euro antes de pagar."
          />
          <NumberField
            label="Ajuste de precios a oct 2027"
            value={st.priceAdjustPct}
            min={-20}
            max={50}
            suffix="%"
            onChange={(n) =>
              mutate((d) => {
                d.settings.priceAdjustPct = n ?? 0;
              })
            }
            hint="Inflación sobre precios estimados de hoy. No afecta lo cotizado."
          />
        </div>
        <p className="fx-applied">
          Tasa aplicada en todos los cálculos: <strong className="num">1 € = {groupThousands(eff)} COP</strong> (base más colchón).
        </p>
      </section>

      <section className="panel" aria-labelledby="sup-title">
        <div className="panel-head">
          <div>
            <h2 id="sup-title">Supuestos del plan</h2>
            <p>Uno por línea. Se muestran aquí y se envían al asistente con cada pregunta.</p>
          </div>
        </div>
        <TextField
          label="Supuestos"
          multiline
          className="tall"
          value={data.assumptions.join('\n')}
          validate={(v) => (v.split('\n').some((l) => l.length > 400) ? 'Cada supuesto debe tener menos de 400 caracteres' : null)}
          onChange={(v) =>
            mutate((d) => {
              d.assumptions = v
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean)
                .slice(0, 40);
            })
          }
        />
      </section>
    </>
  );
}
