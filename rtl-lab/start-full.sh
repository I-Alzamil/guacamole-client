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
# Starts the full lab: PostgreSQL, guacd, an SSH server, and Guacamole
# (Angular frontend) with the PostgreSQL, TOTP, quickconnect, restrict, and
# display statistics extensions as currently built within this source tree
# (-Pangular-frontend). Each run starts with a fresh database, so guacadmin
# enrolls in TOTP again. Set TOTP=0 to leave out TOTP.
set -e
LAB=$(cd "$(dirname "$0")" && pwd)
SRC=$LAB/..
WAR=${WAR:-$SRC/guacamole/target/guacamole-1.6.1.war}
PORT=${PORT:-18096}
JDBC=$SRC/extensions/guacamole-auth-jdbc/modules/guacamole-auth-jdbc-postgresql

unzip -l "$WAR" | grep -q 'main-.*\.js' || {
    echo "$WAR was not built with -Pangular-frontend" >&2; exit 1; }

rm -f "$LAB"/full-home/extensions/*.jar
JARS="$JDBC/target/guacamole-auth-jdbc-postgresql-1.6.1.jar
$SRC/extensions/guacamole-auth-quickconnect/target/guacamole-auth-quickconnect-1.6.1.jar
$SRC/extensions/guacamole-auth-restrict/target/guacamole-auth-restrict-1.6.1.jar
$SRC/extensions/guacamole-display-statistics/target/guacamole-display-statistics-1.6.1.jar"
[ "${TOTP:-1}" = 0 ] || JARS="$JARS
$SRC/extensions/guacamole-auth-totp/target/guacamole-auth-totp-1.6.1.jar"
for JAR in $JARS; do
    unzip -l "$JAR" | grep -q 'translations/ar.json\|guacamole-auth-jdbc-base' || {
        echo "Missing or outdated: $JAR" >&2; exit 1; }
    cp "$JAR" "$LAB/full-home/extensions/"
done

podman pod rm -f full-lab >/dev/null 2>&1 || true
podman pod create --name full-lab -p "$PORT:8080" >/dev/null
podman run -d --pod full-lab --name full-lab-db -e POSTGRES_DB=guac \
    -e POSTGRES_USER=guac -e POSTGRES_PASSWORD=guac \
    -v "$JDBC/schema/001-create-schema.sql:/docker-entrypoint-initdb.d/001-create-schema.sql:ro,Z" \
    -v "$JDBC/schema/002-create-admin-user.sql:/docker-entrypoint-initdb.d/002-create-admin-user.sql:ro,Z" \
    -v "$LAB/totp-db/003-lab-connection.sql:/docker-entrypoint-initdb.d/003-lab-connection.sql:ro,Z" \
    docker.io/library/postgres:16 >/dev/null
podman run -d --pod full-lab --name full-lab-guacd docker.io/guacamole/guacd:1.6.0 >/dev/null
podman run -d --pod full-lab --name full-lab-ssh -e PASSWORD_ACCESS=true \
    -e USER_NAME=test -e USER_PASSWORD=test docker.io/linuxserver/openssh-server:latest >/dev/null
podman run -d --pod full-lab --name full-lab-web -e GUACD_HOSTNAME=127.0.0.1 \
    -e GUACAMOLE_HOME=/guac-home -v "$LAB/full-home:/guac-home:ro,Z" \
    -v "$(realpath "$WAR"):/opt/guacamole/webapp/guacamole.war:ro,Z" \
    docker.io/guacamole/guacamole:1.6.0 >/dev/null

printf 'Waiting for Guacamole'
for i in $(seq 1 60); do
    curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/guacamole/" | grep -q 200 && break
    printf .; sleep 2
done
echo
echo "Open http://localhost:$PORT/guacamole/  (login: guacadmin / guacadmin)"
[ "${TOTP:-1}" = 0 ] || echo "Scan the QR code with an authenticator app, then enter its code."
echo "Stop with: podman pod rm -f full-lab"
