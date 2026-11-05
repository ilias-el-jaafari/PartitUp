# Despliegue de PartitUp

PartitUp tiene dos piezas que se despliegan por separado:

- **Frontend** (la web) → **Vercel** (gratis)
- **Backend OMR** (reconocimiento de partituras desde imagen/PDF) → **Railway** (capa gratuita)

Ambos en la nube: una vez desplegados, accedes desde el movil sin necesidad del portatil.

> **Orden recomendado**: despliega primero el backend (Railway) para obtener su URL,
> y luego el frontend (Vercel) configurando esa URL.

---

## 1. Backend OMR en Railway

El backend necesita Java + Audiveris + Tesseract, por eso se despliega con Docker
(el `server/Dockerfile` ya lo prepara todo).

1. Entra en [railway.com](https://railway.com) e inicia sesion con GitHub.
2. **New Project → Deploy from GitHub repo** y elige este repositorio.
3. En la configuracion del servicio (**Settings**):
   - **Root Directory**: `server`
     (asi Railway usa `server/Dockerfile` y `server/railway.json`)
   - **Build**: se detecta automaticamente como Dockerfile.
4. Railway construira la imagen (tarda unos minutos: descarga Audiveris ~69MB).
5. Cuando termine, en **Settings → Networking** pulsa **Generate Domain**.
   Obtendras una URL del tipo `https://partitup-xxxx.up.railway.app`.
6. Comprueba que funciona abriendo `https://partitup-xxxx.up.railway.app/health`
   → debe responder `{"status":"ok", ...}`. El campo `engine` dice qué estrategia
   está activa (`auto` en la imagen de Railway: Audiveris para PDF, oemer para fotos).

> **Nota sobre la capa gratuita**: Railway da un credito mensual de ejecucion.
> Para uso personal/por invitacion es mas que suficiente. Si el servicio se
> "duerme" por inactividad, la primera peticion tardara unos segundos en
> arrancar; las siguientes son rapidas.

---

## 2. Frontend en Vercel

1. Entra en [vercel.com](https://vercel.com) e inicia sesion con GitHub.
2. **Add New → Project** y elige este repositorio.
3. Vercel detecta Vite automaticamente (ya hay un `vercel.json`):
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Root Directory**: `.` (raiz del repo, dejar por defecto)
4. En **Environment Variables** anade:
   - `VITE_OMR_API_URL` = `https://partitup-xxxx.up.railway.app/api`
     (la URL de Railway del paso anterior, **terminada en `/api`**)
5. **Deploy**. En un minuto tendras la URL publica de la app.
6. Abre esa URL en el movil y guardala como acceso directo en la pantalla de inicio.

---

## 3. Como conviven (resumen tecnico)

- El frontend usa `VITE_OMR_API_URL` para saber a donde enviar las imagenes/PDF.
  Si no se define, intenta `/api` (util solo en desarrollo local con proxy).
- El backend solo acepta orígenes de la lista: `https://partit-up.vercel.app`,
  localhost en los puertos de Vite, y (salvo `CORS_ALLOW_VERCEL_PREVIEWS=0`) los
  previews `https://partit-up*.vercel.app`. Para otro dominio, añade
  `CORS_ORIGINS` (lista separada por comas) en el servicio. No hace falta ningún secreto.
- El SoundFont (~8MB) y el motor de notacion se sirven desde Vercel con cache
  de larga duracion; en el movil se descargan una sola vez por dispositivo.

---

## 4. Desarrollo local

```bash
# Terminal 1: backend OMR (requiere Java 21+, Audiveris y Tesseract instalados,
#             o usar Docker: docker build -t partitup-omr server/ && docker run -p 3001:3001 partitup-omr)
cd server
npm install
npm run dev        # escucha en http://localhost:3001

# Terminal 2: frontend
npm install
npm run dev        # http://localhost:5173, con proxy /api -> localhost:3001
```

Para subir solo MusicXML no hace falta el backend; solo se necesita para
imagenes y PDF. Los MIDI no se aceptan: no traen la partitura.

Variables de entorno del servidor (motores, CORS, tamaño de subida) están en el
README, sección «Motores OMR». No hay secretos que commitear.

---

## 5. Verificacion end-to-end

1. Abre la URL de Vercel.
2. Sube una foto o PDF de una partitura coral.
3. Espera a que el backend la convierta (indicador de "Procesando...").
4. Comprueba que las voces aparecen coloreadas e identificadas.
5. Elige tu voz (suena sola). Corrige una nota solo si el reconocimiento falló.
6. Descarga el WAV. El nombre incluye la obra, la voz y la fecha.
