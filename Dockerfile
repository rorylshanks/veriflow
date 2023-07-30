FROM caddy:2.7-alpine AS caddy

FROM node:slim
RUN apt update && apt upgrade -y && apt install -y ca-certificates
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
WORKDIR /appdata
COPY package.json .
RUN npm i
COPY lib lib
COPY util util
COPY app.js app.js
COPY caddyfile-blank.json /etc/caddy.json
COPY entrypoint.sh /entrypoint.sh

ENTRYPOINT /entrypoint.sh