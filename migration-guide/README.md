# AngularJS → Angular migration guide

The Guacamole web application frontend has been rewritten from AngularJS 1.x
to Angular 22. This guide explains what changed and how to move your own
AngularJS code, typically a Guacamole extension, to the new frontend.

The server, the REST API, `guac-manifest.json`, and the way extensions are
loaded are **unchanged**. Only the browser-side JavaScript and HTML of an
extension need porting; CSS and translations keep working as they are.

| # | Page | Read it if you… |
| --- | --- | --- |
| 1 | [What changed](01-what-changed.md) | want the big picture |
| 2 | [Building and running](02-building-and-running.md) | need to build the WAR or an extension |
| 3 | [Migrating an extension](03-migrating-an-extension.md) | are porting code — the step-by-step recipe |
| 4 | [Example: TOTP](04-example-totp.md) | want a complete before/after of a real extension |
| 5 | [Example: patches, run blocks, directives](05-example-patches-and-run-blocks.md) | have HTML patches, `module.run`, or directives |
| 6 | [Translations and RTL](06-translations-and-rtl.md) | ship translations or care about Arabic/Hebrew |
| 7 | [Gotchas](07-gotchas.md) | something compiles but does not work |

## The short version

1. Leave `src/main/resources` (CSS, translations, manifest, old JS) alone.
2. Copy each `.js`/`.html` file to the same relative path under
   `src/main/frontend-ng/`, renaming `.js` to `.ts`.
3. Convert each file in place, keeping its names, comments and structure:
   controllers become components or directives, `$scope.x` becomes `this.x`,
   `ng-*` attributes become Angular bindings.
4. Add an `angular-frontend` profile to the extension's `pom.xml` naming the
   entry file and the output script.
5. Build with `mvn -Pangular-frontend package`.

The resulting JAR has the same name, the same manifest, and the same script
name as before — it simply contains the Angular version of the code.

## Where things live

| What | Path |
| --- | --- |
| New frontend | `guacamole/src/main/frontend-ng/` |
| Old frontend (still the default build) | `guacamole/src/main/frontend/` |
| What extensions may import | `guacamole/src/main/frontend-ng/src/app/extension/extension-modules.ts` |
| Extension build tool | `guacamole/src/main/frontend-ng/extension-sdk/build.mjs` |
| Shared Maven setup for extensions | `extensions/pom.xml` (`pluginManagement`) |
| Ported in-repo extensions | `extensions/*/src/main/frontend-ng/` |

> This folder is local only (listed in `.git/info/exclude`), like `rtl-lab/`.
