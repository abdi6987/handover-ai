# One image, two services on Cloud Run:
#   web:    node server.js   (default command)
#   worker: node worker.js   (video previews, AI comparisons, emails)
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm run build:worker

FROM node:22-bookworm-slim AS run
# ffmpeg: video frames and previews. ImageMagick: RAW/TIFF photos.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg imagemagick ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0 \
    DATA_DIR=/tmp/handover JOB_MODE=worker
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/dist/worker.js ./worker.js
USER node
EXPOSE 8080
CMD ["node", "server.js"]
