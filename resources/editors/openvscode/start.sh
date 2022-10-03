# /bin/sh

scriptdir="$(dirname "$0")"
cd "$scriptdir"

bin/openvscode-server --port 80 --host 0.0.0.0 --without-connection-token --disable-telemetry ${WORKSPACE}
