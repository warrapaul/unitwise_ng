#!/usr/bin/env bash
set -euo pipefail

FILE="$HOME/.config/ngrok/ngrok.yml"

toggle_config() {
  awk '
    /^[[:space:]]*$/ { print; next }
    /^#/ { sub(/^#/, ""); print; next }
    { print "#" $0 }
  ' "$FILE" > "$FILE.tmp" && mv "$FILE.tmp" "$FILE"
}

cleanup() {
  echo "Stopping..."
  [[ -n "${NG_PID:-}" ]] && kill "$NG_PID" 2>/dev/null
  toggle_config   # flip config back to original state
}
trap cleanup EXIT

# 1. flip to the "endpoints / named tunnel" config
toggle_config

# 2. start Angular dev server
cd /home/warra/Documents/work/ng/unitwise_ng
ng serve --host 0.0.0.0 --port 4200 &
NG_PID=$!

# 3. start ngrok (blocks until you Ctrl+C)
ngrok start unitwise-ng



# #!/usr/bin/env bash

# #ngrok config edit
# cd /home/warra/Documents/work/ng/unitwise_ng
# ng serve --host 0.0.0.0 --port 4200 &
# NG_PID=$!
# trap "kill $NG_PID" EXIT
# ngrok start unitwise-ng
