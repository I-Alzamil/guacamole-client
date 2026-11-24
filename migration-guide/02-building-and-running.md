# 2. Building and running

The AngularJS frontend is still the default. Everything Angular is behind the
Maven profile `angular-frontend`.

## The web application

```sh
# WAR with the Angular frontend (Maven downloads Node.js 24 itself)
mvn -pl guacamole -am -Pangular-frontend -DskipTests clean package

# Same, with the frontend alone (needs Node.js >= 24.15)
cd guacamole/src/main/frontend-ng
npm ci
npm run build                     # output in dist/
npx ng test --watch=false         # unit tests
```

Always use `clean` when switching between the two frontends — the exploded
WAR under `target/` otherwise keeps files from the previous build.

`-am` is needed because the 1.6.1 sibling modules (guacamole-ext,
guacamole-common…) are not in your local Maven repository until built.

## Extensions

```sh
# Everything, including extensions (RADIUS needs lgpl-extensions)
mvn -Pangular-frontend,lgpl-extensions -DskipTests clean package

# A single extension
mvn -pl extensions/guacamole-auth-totp -am -Pangular-frontend -DskipTests clean package
```

Without `-Pangular-frontend` every extension builds exactly as before, for the
AngularJS frontend.

### What the profile does

`extensions/pom.xml` holds the shared setup in `pluginManagement`; each
extension only switches it on:

```xml
<!-- extensions/guacamole-auth-totp/pom.xml -->
<profiles>
    <profile>
        <id>angular-frontend</id>
        <properties>
            <frontend.ng.entry>src/main/frontend-ng/totpModule.ts</frontend.ng.entry>
            <frontend.ng.output>totp.min.js</frontend.ng.output>
        </properties>
        <build>
            <plugins>
                <plugin>
                    <groupId>com.github.eirslett</groupId>
                    <artifactId>frontend-maven-plugin</artifactId>
                </plugin>
            </plugins>
        </build>
    </profile>
</profiles>
```

During `process-classes` it:

1. Installs Node.js and runs `npm install` in
   `guacamole/src/main/frontend-ng/extension-sdk`.
2. Runs `node build.mjs --entry=<frontend.ng.entry> --outfile=target/classes/<frontend.ng.output>`
   (esbuild, IIFE, minified, with `license.txt` as banner if present).
3. Copies every `src/main/frontend-ng/**/*.html` over the file of the same
   path in `target/classes`, so patches and templates are replaced too.

`frontend.ng.output` must be the script your manifest already lists under
`"js"`, so the manifest does not change. An extension with only HTML patches
(like JDBC) needs no `pom.xml` change at all — the parent profile already
copies its `frontend-ng` HTML.

## Trying it out

Run the WAR in the official image with your `GUACAMOLE_HOME`:

```sh
podman run -d -p 8080:8080 -e GUACD_HOSTNAME=<guacd-host> \
  -e GUACAMOLE_HOME=/guac-home -v ./guac-home:/guac-home:ro,Z \
  -v ./guacamole/target/guacamole-1.6.1.war:/opt/guacamole/webapp/guacamole.war:ro,Z \
  docker.io/guacamole/guacamole:1.6.0
```

Or use the ready-made labs in `rtl-lab/`:

- `rtl-lab/start.sh` — user-mapping login, SSH connection, RTL lab
  translation (port 18090, `lab` / `lab`).
- `rtl-lab/start-totp.sh` — PostgreSQL + TOTP + display statistics built from
  this tree (port 18095, `guacadmin` / `guacadmin`).

Open the browser console: extension load problems are logged there
("Extensions could not be loaded", "Run block of extension failed",
"Ignoring AngularJS module …").
