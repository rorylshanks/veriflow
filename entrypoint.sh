#!/bin/bash

/usr/bin/caddy run --config=/etc/caddy.json &
sleep 2
npx node app.js &

wait