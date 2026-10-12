ARG CERTS=default

FROM node:22-bookworm AS ssl_default

FROM ssl_default AS ssl_zscaler
COPY --from=certs . ./certs
RUN cp ./certs/zscaler.crt /usr/local/share/ca-certificates/
RUN update-ca-certificates
ENV REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

FROM ssl_${CERTS} AS builder
# Mirror the repo layout (modules/shared next to modules/gameboard) so the
# "file:../shared/..." dependency resolves exactly as it does in local development
# and `npm ci` can use the lockfile. The canonical schema overwrites the lib copy.
COPY --from=util ./js_packages /src/shared/js_packages
COPY --from=util ./schema/PongAPISchema.json /src/shared/js_packages/dw/state-machine/lib/PongAPISchema.json
WORKDIR /src/gameboard
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . ./
RUN npm run build

FROM nginx:1.25.0

LABEL org.opencontainers.image.source=https://github.com/aaron97neu/Discovery-World-Pong
LABEL org.opencontainers.image.licenses=MIT

WORKDIR /usr/share/nginx/html
RUN rm -rf ./*
COPY --from=builder /src/gameboard/build .
EXPOSE 80
ENTRYPOINT ["nginx", "-g", "daemon off;"]
