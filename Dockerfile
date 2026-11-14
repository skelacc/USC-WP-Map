# Studio Map als ein Container: nginx liefert den statischen Build aus, Port 3000 (usc-wp-map.skela.cc).
# Läuft auf amd64 und arm64. Gebaut wird nur einmal auf der Bau-Maschine; die Import-API gibt es nur lokal (npm run dev).
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.29-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -q -O /dev/null http://127.0.0.1:3000/health || exit 1
