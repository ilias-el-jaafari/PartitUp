# Imagen base Ubuntu 24.04 para coincidir con el paquete .deb de Audiveris.
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Dependencias del sistema:
# - poppler-utils: pdftoppm para extraer paginas de PDF
# - tesseract-ocr + idiomas: OCR de texto que usa Audiveris
# - xvfb: framebuffer virtual (Audiveris arranca AWT aunque sea en batch)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates gnupg \
    poppler-utils \
    tesseract-ocr tesseract-ocr-eng tesseract-ocr-spa \
    xvfb \
    python3 python3-venv python3-pip \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Node.js 22 via repositorio oficial de NodeSource (metodo keyring, fiable).
RUN mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
       | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
       > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Audiveris (el .deb incluye su propio JRE; apt resuelve sus dependencias nativas).
#
# El postinst del .deb ejecuta `xdg-desktop-menu install` para crear un acceso
# directo de escritorio, que falla en contenedores headless (sin entorno grafico).
# Por eso instalamos de forma tolerante, eliminamos ese script de post-instalacion
# (innecesario en un servidor) y completamos la configuracion con dpkg. Finalmente
# verificamos que el binario de Audiveris quedo correctamente instalado.
ARG AUDIVERIS_VERSION=5.10.2
RUN apt-get update \
    && curl -fsSL -o /tmp/audiveris.deb \
       "https://github.com/Audiveris/audiveris/releases/download/${AUDIVERIS_VERSION}/Audiveris-${AUDIVERIS_VERSION}-ubuntu24.04-x86_64.deb" \
    && (apt-get install -y --no-install-recommends /tmp/audiveris.deb || true) \
    && rm -f /var/lib/dpkg/info/audiveris.postinst \
    && dpkg --configure -a \
    && test -x /opt/audiveris/bin/Audiveris \
    && rm /tmp/audiveris.deb \
    && rm -rf /var/lib/apt/lists/*

# Audiveris busca los datos de Tesseract via TESSDATA_PREFIX.
ENV AUDIVERIS_CMD=/opt/audiveris/bin/Audiveris
ENV TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata
ENV USE_XVFB=1

# Por defecto la JVM solo usa el 25% de la RAM del contenedor, insuficiente
# para el OMR de partituras complejas (causa OutOfMemoryError intermitente).
# MaxRAMPercentage se adapta al tamano real del contenedor en Railway.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75.0"

# Audiveris usa Tesseract en modo legacy; el paquete de Ubuntu solo trae datos
# LSTM. Descargamos traineddata con soporte legacy (reconoce nombres de voz,
# titulos y letra en las imagenes). El reconocimiento de notas funciona en
# cualquier caso; esto mejora el OCR de texto.
RUN curl -fsSL -o "${TESSDATA_PREFIX}/eng.traineddata" \
      https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata \
    && curl -fsSL -o "${TESSDATA_PREFIX}/spa.traineddata" \
      https://github.com/tesseract-ocr/tessdata/raw/main/spa.traineddata

# oemer: neural OMR engine (primary). Installed in an isolated venv to avoid
# Ubuntu 24.04's PEP 668 "externally-managed-environment" restriction.
#
# oemer pulls in onnxruntime-gpu, which on a CPU-only host is large and tries to
# load CUDA libraries it can't find. We swap it for the CPU onnxruntime build
# (same `import onnxruntime`, smaller, no CUDA) so inference runs cleanly.
RUN python3 -m venv /opt/oemer-venv \
    && /opt/oemer-venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/oemer-venv/bin/pip install --no-cache-dir oemer \
    && /opt/oemer-venv/bin/pip uninstall -y onnxruntime-gpu \
    && /opt/oemer-venv/bin/pip install --no-cache-dir onnxruntime
ENV OEMER_CMD=/opt/oemer-venv/bin/oemer

# Pre-download oemer's model checkpoints at build time so the first request
# isn't blocked on a network fetch (and works even if egress is restricted).
# Running it once on a blank image triggers the download; recognition failure
# on the blank image is expected and ignored.
RUN /opt/oemer-venv/bin/python -c "from PIL import Image; Image.new('RGB',(400,400),'white').save('/tmp/blank.png')" \
    && (/opt/oemer-venv/bin/oemer /tmp/blank.png -o /tmp || true) \
    && rm -f /tmp/blank.png /tmp/blank*.musicxml

# auto: PDF → Audiveris first (engraved choir scores), photos → oemer first.
# Both engines are installed here; the other is the fallback. Override with
# OMR_ENGINE=audiveris or OMR_ENGINE=oemer. OMR_FALLBACK=0 disables fallback.
ENV OMR_ENGINE=auto

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3001
ENV PORT=3001

CMD ["node", "dist/index.js"]
