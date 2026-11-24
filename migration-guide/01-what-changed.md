# 1. What changed

## Why

AngularJS reached end of life in December 2021. Security fixes now exist only
as a paid commercial product (AngularJS "NES"). Angular is MIT-licensed,
maintained in the open, and receives free security fixes — as long as the
project keeps up with its releases (one major version every 6 months, each
supported for 18 months; `ng update` handles most of the work).

## What stayed the same

- **Server and REST API** — not touched.
- **URLs** — hash routing is kept (`#/client/...`, `#/settings/...`, share
  links all still work).
- **Extensions** — still JARs with a `guac-manifest.json`. The server still
  concatenates the `js` files into `app.js`, serves `html` patches through
  `api/patches`, and serves `css` and `translations` as before.
- **Translations** — same JSON files, same ICU message syntax, same `@:KEY`
  references.
- **CSS** — same class names. Extension stylesheets keep matching.
- **guacamole-common-js** — used exactly as before (`Guacamole.Client`,
  tunnels, keyboard, mouse…). Nothing to change there.

## What is different

| Topic | AngularJS | Angular 22 |
| --- | --- | --- |
| Language | JavaScript | TypeScript (compiled by esbuild for extensions) |
| Building blocks | modules, controllers, directives, factories | standalone components, directives, `@Injectable` services |
| Shared state | `$scope`, `$rootScope` | fields on the component (`this.x`), services |
| Change detection | digest cycle, `$scope.$apply()` | zoneless; `DigestService.apply()` plays the role of `$apply` |
| Events | `$rootScope.$broadcast/$on` | typed services, e.g. `AuthenticationService.events` |
| Templates | compiled in the browser, any element can be patched | compiled ahead of time; patches target elements marked `guacPatchPoint` |
| Dependency injection | `['$scope', 'svc', function(...)]` | `inject(Service)` |
| Layout direction | LTR only | LTR and RTL, chosen per language |

## How the app keeps the old "feel"

The rewrite deliberately mirrors the AngularJS application so that ported code
looks familiar:

- **Mutable objects.** Connections, users, clients etc. are still plain
  mutable objects, as in AngularJS. Every component declares
  `ChangeDetectionStrategy.Eager` (Angular 22 defaults to OnPush), so a view
  refreshes whenever anything changes — just like a digest.
- **`DigestService.apply()`.** When state changes outside Angular (a
  `Guacamole.Client` callback, a timer, a WebSocket), call it exactly where
  AngularJS code called `$scope.$apply()`.
- **Same names.** Services, CSS classes, translation keys and file layout
  follow the old code, so a diff between an old and a new file is small.

## How extensions run

```
browser loads index.html
   └─ main.ts: loadExtensions()            (before the app starts)
        ├─ fetch api/patches               (HTML patches)
        ├─ if app.js or patches exist:
        │     load @angular/compiler       (lazy — only if needed)
        │     expose GuacamoleFrontend.modules  (Angular + app APIs)
        │     run app.js                   (your extension code)
        └─ bootstrapApplication(App)
```

Your extension is bundled into a single script that does **not** contain
Angular itself. Its `import ... from '@angular/core'` and
`import ... from 'guacamole-frontend'` resolve to the running application's
copies through `globalThis.GuacamoleFrontend.modules`. Templates in your
extension are compiled in the browser, which is why the Angular compiler is
downloaded — but only when an extension actually needs it.

Old AngularJS extensions do not crash the new frontend: their `angular.module`
calls hit a placeholder that logs a warning and skips them.
