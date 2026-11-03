# Eurotrip en familia

App para decidir ruta, días y presupuesto del viaje familiar de octubre de 2027
(Medellín → Madrid/Guadarrama, con París y Suiza). Compara escenarios con
costo-beneficio, muestra el itinerario con fechas reales y tiene un asistente
que responde con los cálculos de la app.

## Cómo funciona

- **Motor de cálculo** (`src/engine`): TypeScript puro con pruebas. Toda cifra
  de la pantalla y del asistente sale de aquí.
- **Datos** (`src/data/seed.json`): precios de referencia con rango, estado
  (estimado / cotizado / reservado), fuente y fecha. Se editan desde
  *Datos y precios*; se guardan en el navegador (`localStorage`) a través de
  `src/data/repository.ts`, que se puede cambiar por Supabase o Netlify Blobs
  sin tocar la interfaz.
- **Asistente** (`netlify/functions/agent.ts`): llama a OpenAI desde el
  servidor. El modelo no calcula: usa *function calling* para pedirle al motor
  comparar escenarios, simular noches, evaluar extras o decir qué cotizar.

## Desarrollo local

```bash
npm install
npm run dev        # app en http://localhost:5173 (sin asistente)
npm test           # pruebas del motor, datos y asistente
npm run build      # verificación de tipos + build de producción
```

Para probar también el asistente en local:

```bash
npx netlify-cli dev   # app + funciones en http://localhost:8888
```

con un archivo `.env` local (no se sube a git) basado en `.env.example`.

## Despliegue en Netlify

1. Sube el repositorio a GitHub.
2. En Netlify: **Add new site → Import an existing project → GitHub** y elige
   el repositorio. La configuración se toma de `netlify.toml`
   (build `npm run build`, carpeta `dist`, funciones en `netlify/functions`).
3. En **Site configuration → Environment variables** agrega:
   - `OPENAI_API_KEY` (obligatoria para el asistente)
   - `APP_ACCESS_KEY` (recomendada: clave de la familia)
   - opcionales: `OPENAI_MODEL`, `OPENAI_MAX_TOKENS`, `OPENAI_REASONING_EFFORT`
4. **Deploys → Trigger deploy**. Cada `git push` a `main` vuelve a desplegar.

### Control de costos de OpenAI

- En platform.openai.com crea un **proyecto** solo para esta app, con su propia
  llave y un **límite de gasto mensual** (p. ej. 5 USD).
- La función limita el uso: 20 preguntas/minuto por IP (regla de Netlify),
  más un respaldo de 8/minuto y 60/día por IP, y un tope de tokens por respuesta.

## Seguridad

- Las llaves viven solo en las variables de entorno de Netlify. `.env` está en
  `.gitignore`; `.env.example` no tiene valores.
- El navegador nunca ve la llave de OpenAI.
- El asistente valida toda la entrada (tamaño, historial, datos del viaje) y no
  reenvía al navegador los mensajes de error de OpenAI.
