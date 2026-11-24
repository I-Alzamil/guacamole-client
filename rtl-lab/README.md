# RTL lab

Runs Guacamole with the Angular frontend and an `rtl-lab` extension which
provides an `ar` translation. Two variants are included:

* `arabic` (default): real Arabic, completing the bundled translation for the
  user menu, settings (preferences, sessions, history), and SSH settings.
* `english`: English text labelled as `ar`. Since the text direction is
  derived from the language key, not from the text, the UI is laid out
  right-to-left while remaining readable.

    ./start.sh                  # http://localhost:18090/guacamole/  (lab / lab)
    VARIANT=english ./start.sh
    ./stop.sh

Arabic needs an Arabic font on the viewing machine (e.g. Noto Sans Arabic,
`pacman -S noto-fonts`); otherwise browsers fall back to whatever font has
Arabic glyphs, which may be a monospace font.

* Pick the language: Settings > Preferences > Display language >
  "العربية (مختبر)" / "Arabic (English test)", or set the browser language to Arabic.
* Edit `extension/variants/*.json`, then rerun `./start.sh` (it repackages
  the extension into `guac-home/extensions/rtl-lab.jar`).
* Strings missing from the lab file fall back to the bundled Arabic, then
  English.
* Requires a WAR built with `-Pangular-frontend`; override with `WAR=...`,
  and the port with `PORT=...`.

## TOTP lab

`./start-totp.sh` runs Guacamole (Angular frontend) with PostgreSQL, TOTP,
and display statistics, using the extensions as built within this source tree
with `-Pangular-frontend`. Each run starts with a fresh database.

    ./start-totp.sh             # http://localhost:18095/guacamole/  (guacadmin / guacadmin)
    podman pod rm -f totp-lab

## Full lab

`./start-full.sh` is the same with quickconnect and restrict added
(`TOTP=0 ./start-full.sh` leaves TOTP out).

    ./start-full.sh             # http://localhost:18096/guacamole/  (guacadmin / guacadmin)
    podman pod rm -f full-lab

## PostgreSQL driver

The TOTP and full labs need the PostgreSQL JDBC driver, which is not kept in
git. Download it once into both `lib` directories:

    curl -O --output-dir totp-home/lib https://repo1.maven.org/maven2/org/postgresql/postgresql/42.7.4/postgresql-42.7.4.jar
    cp totp-home/lib/postgresql-42.7.4.jar full-home/lib/
