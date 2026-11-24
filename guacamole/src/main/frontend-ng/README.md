# Guacamole web application frontend (Angular)

This directory contains a rewrite of the Guacamole web application frontend
using Angular 22 (standalone components, signals, zoneless change detection),
replacing the AngularJS 1.x frontend within `../frontend`. Both frontends talk
to the same REST API and are packaged into the same WAR. The AngularJS
frontend remains the default until migration is complete.

## Building

The Angular frontend requires Node.js 24.15 or later.

```sh
# Standalone (output in dist/)
npm ci
npm run build

# Unit tests
npx ng test --watch=false

# As part of the WAR (Maven downloads the required Node.js version)
mvn -pl guacamole -am -Pangular-frontend clean package
```

Always include `clean` when switching between the AngularJS and Angular
frontends, as the exploded WAR within `target/` otherwise retains files from
the previous build.

`npm run build` also writes `dist/npm-dependencies.txt`, listing all bundled
NPM packages for the automatic LICENSE/NOTICE generation of the Maven build.
Each bundled package must have a corresponding entry within `doc/licenses/`.

## Right-to-left languages

The text direction of the entire application follows the active language:

* `TranslationService` determines the direction of each language (using
  `Intl.Locale` text info) and sets the `dir` and `lang` attributes of the
  document.
* The root component wraps the application in the Angular CDK `Dir` directive
  (`@angular/cdk/bidi`), so any component may inject `Directionality`.
* All CSS uses logical properties (`inset-inline-start`,
  `margin-inline-end`, `text-align: start`, ...), so layouts mirror
  automatically. `src/styles/rtl.css` covers the few cases without a
  logical equivalent (background image offsets and directional icons).
* Remote displays, the on-screen keyboard, and the text input are always
  laid out left-to-right, as they represent physical screens and keyboards.

An Arabic translation (`public/translations/ar.json`) is included. Strings
which are not yet translated fall back to English.

As many systems lack a font supporting Arabic script, the Noto Sans Arabic
font (SIL Open Font License, like the bundled Carlito font) is bundled within
`public/fonts/noto-sans-arabic`. It is declared with the `unicode-range` of
Arabic script, and is thus only downloaded if Arabic text is displayed.

## Architecture notes

* **Mutable state and change detection.** Clients, connections, and other
  REST objects are plain mutable objects, as in the AngularJS application.
  State changed outside Angular (Guacamole client/tunnel callbacks, timers,
  etc.) is followed by `DigestService.apply()`, the equivalent of
  `$rootScope.$apply()`. Because OnPush is the default change detection
  strategy as of Angular 22, components declare
  `ChangeDetectionStrategy.Eager`.
* **Events.** `$rootScope` broadcasts are replaced by typed services:
  `AuthenticationService.events` (login, logout, credential prompts),
  `KeyboardEventsService` (key events with `preventDefault()` semantics),
  `ClipboardService.clipboardChanged`, and `ClientMenuService`.
* **Forms.** Each field type is a component extending `FieldComponent`.
  Additional field types can be registered via the `FIELD_TYPES` token.
* **Routing.** Hash-based routing preserves all existing URLs (`#/client/...`,
  `#/settings/...`, share links).
* **Translations** use the subset of ICU MessageFormat found within the
  existing translation files (variables, `plural`, `select`, backslash
  escapes, and `@:KEY` references), implemented by `locale/message-format.ts`
  using the browser's own CLDR plural rules (`Intl.PluralRules`) rather than
  a bundled library and its plural rule data.

## Extensions

Extensions are loaded exactly as before: the server still serves the `js`
files of each `guac-manifest.json` as `app.js`, the `html` patches via
`api/patches`, and the `css` and `translations` as before. Translations and
CSS work unchanged. JavaScript and HTML written for AngularJS must be ported,
file for file, into `src/main/frontend-ng` of the extension (next to
`src/main/resources`), and the extension built with the same
`-Pangular-frontend` profile as the web application. The resulting script
replaces the AngularJS script under the same name, and the ported HTML
replaces the original HTML at the same path, so manifests do not change.

| AngularJS | Angular |
| --- | --- |
| `angular.module(...)` module file | Entry file importing the other files |
| `formServiceProvider.registerFieldType(type, {...})` | `formService.registerFieldType(type, Component)` |
| Field controller + template | Component extending `FieldComponent` |
| `module.run([...])` | `run(() => { inject(...) })` |
| `module.factory(...)` service | `@Injectable({ providedIn: 'root' })` class |
| `module.directive(...)` used within patches | Directive/component + `patchService.registerDirective()` |
| `ng-controller` within a patch | Directive with `exportAs`, referenced as `#ctrl="name"` |
| `$scope.$watch(expr, fn, deep)` | `Watchers.watch(getter, fn, deep)` from `ngDoCheck` |
| `$scope.$apply()` | `DigestService.apply()` |
| `$rootScope.$on('guacLogout')` | `AuthenticationService.events` (`type: 'logout'`) |
| `ng-show`, `ng-click`, `ng-repeat`, `translate="KEY"` | `[hidden]`, `(click)`, `@for`, `{{ 'KEY' \| translate }}` |

Extension code imports Angular (`@angular/core`, `@angular/common`,
`@angular/forms`, `@angular/router`) and the application
(`guacamole-frontend`) as usual; these imports resolve to the running
application (see `src/app/extension/extension-modules.ts` for what is
available). Extensions are built by `extension-sdk/build.mjs` (esbuild only)
and compiled by the browser at runtime, so the Angular compiler is downloaded
only if extensions with JavaScript or HTML patches are installed.

HTML patches use the same `<meta>` operations and CSS selectors as before.
As the application's own templates are compiled ahead of time, patches may
only target elements marked with the `guacPatchPoint` directive (currently
the login dialog, the home page connection list and its connections, and the
client display), as well as content inserted by other patches.

Extensions built for the AngularJS frontend are skipped (with a warning in
the browser console) rather than breaking the application.

## Migration status

| Area | Status |
| --- | --- |
| Core: REST services, authentication, translations, storage, notifications | Done |
| Login, home page, user menu, navigation | Done |
| Forms and all standard field types | Done |
| Client: display, input, menu, clipboard, file transfer, sharing, OSK, text input, tiling | Done |
| Settings: sessions, history (with CSV export), users, groups, connections, preferences | Done |
| Manage: connection, group, sharing profile, user, user group editors | Done |
| Connection import (CSV, JSON, YAML) | Done |
| Session recording player | Done |
| Arabic translation of all pages | Done |
| Arabic translation of connection parameters (except SSH) | Not yet translated (English fallback) |
| Extension support (JavaScript and HTML patches) | Done |
| Bundled extensions ported (TOTP, SSO, RADIUS, restrict, quickconnect, display statistics, JDBC) | Done |
