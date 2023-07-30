#!/bin/bash

/usr/bin/caddy run --config=/etc/caddy.json &
sleep 2
npx nodemon app.js &

wait