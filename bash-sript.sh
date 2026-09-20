#!/usr/bin/env bash

#ngrok config edit
cd /home/warra/Documents/work/ng/unitwise_ng
ng serve --host 0.0.0.0 --port 4200 &
NG_PID=$!
trap "kill $NG_PID" EXIT
ngrok start unitwise-ng
