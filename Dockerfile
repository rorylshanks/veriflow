FROM caddy:2.7-alpine AS caddy

FROM node
RUN apt update && apt upgrade -y && apt install -y ca-certificates supervisor
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY docker/supervisord.conf /etc/supervisord.conf
WORKDIR /appdata
COPY package*.json .
RUN npm i
COPY lib lib
COPY util util
COPY app.js app.js
COPY caddyfile-blank.json caddy.json

ENTRYPOINT ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisord.conf"]
