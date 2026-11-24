#!/bin/sh
#
# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
#
# Starts the RTL lab: guacd, an SSH server, and Guacamole (Angular frontend)
# with the "rtl-lab" extension, which provides an English-text "ar" translation.
set -e
LAB=$(cd "$(dirname "$0")" && pwd)
WAR=${WAR:-$LAB/../guacamole/target/guacamole-1.6.1.war}
PORT=${PORT:-18090}

unzip -l "$WAR" | grep -q 'main-.*\.js' || {
    echo "$WAR was not built with -Pangular-frontend" >&2; exit 1; }

# Package the extension (a JAR is just a zip with guac-manifest.json at its
# root), using the chosen variant (extension/variants/*.json) as "ar"
VARIANT=${VARIANT:-arabic}
[ -f "$LAB/extension/variants/$VARIANT.json" ] || {
    echo "No such variant: $VARIANT" >&2; exit 1; }
STAGE=$(mktemp -d)
mkdir "$STAGE/translations"
cp "$LAB/extension/guac-manifest.json" "$STAGE/"
cp "$LAB/extension/variants/$VARIANT.json" "$STAGE/translations/ar.json"
rm -f "$LAB/guac-home/extensions/rtl-lab.jar"
(cd "$STAGE" && zip -qr "$LAB/guac-home/extensions/rtl-lab.jar" .)
rm -rf "$STAGE"

podman pod rm -f rtl-lab >/dev/null 2>&1 || true
podman pod create --name rtl-lab -p "$PORT:8080" >/dev/null
podman run -d --pod rtl-lab --name rtl-lab-guacd docker.io/guacamole/guacd:1.6.0 >/dev/null
podman run -d --pod rtl-lab --name rtl-lab-ssh -e PASSWORD_ACCESS=true \
    -e USER_NAME=test -e USER_PASSWORD=test docker.io/linuxserver/openssh-server:latest >/dev/null
podman run -d --pod rtl-lab --name rtl-lab-web -e GUACD_HOSTNAME=127.0.0.1 \
    -e GUACAMOLE_HOME=/guac-home -v "$LAB/guac-home:/guac-home:ro,Z" \
    -v "$(realpath "$WAR"):/opt/guacamole/webapp/guacamole.war:ro,Z" \
    docker.io/guacamole/guacamole:1.6.0 >/dev/null

printf 'Waiting for Guacamole'
for i in $(seq 1 60); do
    curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/guacamole/" | grep -q 200 && break
    printf .; sleep 2
done
echo
echo "Open http://localhost:$PORT/guacamole/  (login: lab / lab)"
echo "Variant: $VARIANT. Then: user menu > Settings > Preferences > Display language"
