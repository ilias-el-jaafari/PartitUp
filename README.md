# PartitUp

Ensayo coral en el navegador. Subes la partitura (foto, PDF o MusicXML), PartitUp lee las voces y prepara un audio para practicar la tuya: solo, mute y tempo. La corrección nota a nota sigue disponible, pero como salida de emergencia, no como camino habitual.

El objetivo es que la lectura (OMR → MusicXML → voces) y el audio sean lo bastante precisos como para que casi no haga falta tocar nada.

## Como funciona (escritorio y movil)

PartitUp es una aplicacion **100% web**, accesible desde cualquier navegador (movil incluido):

- **Frontend** (Vercel): el renderizado de la partitura, la reproduccion de audio y la
  correccion de voces ocurren en el navegador. Funciona en el movil para checkeos rapidos.
- **Backend OMR** (Railway): es un servicio en la nube, **no se ejecuta en tu portatil**.
  Cuando subes una foto/PDF de una partitura, el movil la envia al servidor en la nube,
  que la convierte a MusicXML y la devuelve. No necesitas tener el portatil encendido.

El portatil solo hace falta durante el **desarrollo** (correr el proyecto en local).
Una vez desplegado, abres la URL de Vercel en el movil y todo funciona.

## SoundFont

El audio usa el SoundFont **GeneralUser GS** en formato comprimido `.sf3` (~8MB),
incluido en `public/soundfonts/GeneralUserGS.sf3`. Se descarga una sola vez por
dispositivo (cacheado via Cache API), por lo que en movil no consume datos en cada uso.

No necesitas subir el `.sf2` completo de 30MB: la version `.sf3` comprimida suena igual
y es mucho mas ligera para movil.

## Desarrollo

```bash
# Frontend
npm install
npm run dev

# Backend OMR (requiere Java 21+ y Audiveris)
cd server
npm install
npm run dev
```

## Qué hace el ensayo

1. Sube MusicXML, una imagen o un PDF. MusicXML no pasa por el servidor OMR.
2. Si hace falta, el servidor reconoce la partitura (`OMR_ENGINE`, ver abajo) y limpia errores típicos de coro: acordes inventados, sílabas basura, partes casi vacías y voces fantasma.
3. Se asignan las cuerdas (SATB, SSA, TTBB, …). Si el nombre de la parte dice «Tenor», se respeta aunque esté escrito en clave de sol.
4. Eliges **tu voz**: suena sola y el resto se atenúa. Solo, mute y tempo siguen en cada cuerda.
5. Descargas WAV (nombre con obra, voz y fecha) o el MusicXML. Si corregiste notas, el MusicXML descargado incluye esas correcciones.

En este navegador se recuerdan las últimas partituras, la voz preferida y el tempo (IndexedDB, sin cuenta).

## Motores OMR

`OMR_ENGINE` elige quién lee la imagen:

| Valor | Cuándo |
| --- | --- |
| `auto` (por defecto) | PDF → Audiveris primero (partitura grabada, menos notas inventadas). Foto → oemer primero. El otro motor se usa si el primero no devuelve nada. |
| `audiveris` | Siempre Audiveris, con oemer de reserva si está instalado. |
| `oemer` | Siempre la red neuronal, con Audiveris de reserva. |

`OMR_FALLBACK=0` desactiva la reserva. La imagen de Railway instala los dos y deja `auto`. La imagen de Hugging Face solo lleva Audiveris (`OMR_ENGINE=audiveris`) porque oemer no cabe en el plan gratuito.

Otras variables del servidor (ningún secreto):

| Variable | Por defecto | Efecto |
| --- | --- | --- |
| `OMR_COLLAPSE_CHORDS` | `1` | Quita acordes y voces minúsculas dentro de una cuerda monódica. `0` conserva polifonía real. |
| `OMR_STRIP_HARMONY` | `1` | Quita cifrados de acorde que el OCR se inventa. |
| `OMR_SHARPEN` | `1` | Máscara suave al preprocesar. No binariza (eso se come las cabezas blancas). |
| `OMR_MAX_WIDTH` / `OMR_MIN_WIDTH` | `3600` / `2600` | Tamaño de la imagen que entra al motor. |
| `OMR_MAX_UPLOAD_MB` | `25` | Tope de subida. |
| `PDF_DPI` | `500` | Resolución al rasterizar PDF. |
| `CORS_ORIGINS` | (vacío) | Orígenes extra, separados por comas. |
| `CORS_ALLOW_VERCEL_PREVIEWS` | `1` | Permite `https://partit-up*.vercel.app`. No abre todos los `*.vercel.app`. |
| `AUDIVERIS_CMD`, `OEMER_CMD`, `USE_XVFB`, `AUDIVERIS_AVAILABLE` | según imagen | Rutas de los motores. |

`GET /health` responde al momento con `status`, `engine` y, cuando ya se han leído, las versiones. No bloquea el arranque.

El frontend solo necesita `VITE_OMR_API_URL` (la URL del servidor terminada en `/api`). Sin ella, en local usa el proxy `/api`.

## Stack

- **Frontend**: Vite + React + TypeScript + Tailwind CSS
- **Renderizado**: Verovio (WASM)
- **Audio**: SpessaSynth + GeneralUser GS (.sf3)
- **Backend OMR**: Express + Audiveris y/o oemer
- **Hosting**: Vercel (frontend) + Railway o Hugging Face (backend OMR)

## Tests

```bash
npm test
npm run lint
cd server && npm test && npm run lint
```
