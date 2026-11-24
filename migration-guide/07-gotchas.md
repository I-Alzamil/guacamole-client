# 7. Gotchas

Things that compile fine but break at runtime, all found while porting the
in-repo extensions.

## The view does not update

**Cause:** Angular 22 makes OnPush the default change detection. With mutable
objects (the AngularJS style the app keeps), OnPush components never notice
changes.

**Fix:** every component declares

```ts
changeDetection: ChangeDetectionStrategy.Eager
```

and state changed from outside Angular (Guacamole client callbacks, timers,
`setTimeout`, raw DOM events) goes through:

```ts
inject(DigestService).apply(() => { this.statistics = stats; });
```

## `[(ngModel)]` stays empty / NG0301 / "No value accessor"

**Cause 1:** you imported `FormsModule` from somewhere else, or built a
custom NgModule. Production builds of the app strip NgModule export scopes,
so the extension receives a special runtime copy of `FormsModule`.

**Fix:** always `import { FormsModule } from '@angular/forms'` in the
extension and list it in `imports`. That import resolves to the right copy.

**Cause 2:** `ngModel` inside a `<form>` without a `name` attribute.

**Fix:** add `name="..."` (quickconnect needed `name="uri"`).

## An `@Input()` never receives a value

**Cause:** signal inputs (`input()`, `input.required()`) declared in
extension classes are not visible to the runtime (JIT) compiler.

**Fix:** use the decorator form in extensions:

```ts
@Input() set client(client: any) { ... }
```

(The app itself uses signal inputs; `FieldComponent.field()` etc. are fine
because they are compiled ahead of time.)

## A patch does nothing

- **Wrong target.** Only elements with `guacPatchPoint` (and content
  inserted by other patches) can be patched. Check the selector against the
  list in [Migrating an extension](03-migrating-an-extension.md#step-4--html-patches).
- **Unknown element.** A component used in the patch was not registered —
  call `patchService.registerDirective(MyComponent)` at module level, and make
  sure that file is imported from the entry file.
- **Stale JAR.** The build copies `src/main/frontend-ng/**/*.html` only with
  `-Pangular-frontend`. `unzip -p your.jar path/to/patch.html` to check.

## Case-sensitive names get lowercased

Never run Angular template text through the browser's HTML parser
(`innerHTML`, `DOMParser`, `<template>`): it lowercases `ngModel`,
`quickconnectController`, `#controller` and so on. The app extracts patch
`<meta>` tags with a regex for this reason; do the same if you process
templates yourself.

## `import` of a package fails or duplicates Angular

Only `@angular/core|common|forms|router` and `guacamole-frontend` resolve to
the running app. Importing e.g. `@angular/cdk` would bundle a **second**
Angular copy that cannot talk to the app. If an extension needs something
that is not exported, add it to `extension-modules.ts` in the app.

## The app loads but my extension is skipped

The console says *Ignoring AngularJS module "…" of an extension built for
the AngularJS frontend*: the JAR still contains the AngularJS script. Rebuild it with `-Pangular-frontend` (and `clean`).

## Old and new files mixed in `target/`

Switching between the two frontends without `clean` leaves files from the
other build in `target/`. Always `mvn clean package` when switching.

## Effects that loop forever

In app code: an `effect()` that reads and writes the same signal, or an input
bound to an array created on each check (`[items]="list.filter(...)"`),
triggers NG0103 loops. Use `computed()` for derived values.

## The license check passes but a license is missing

`generate-license-files.sh` does not fail when a bundled npm package has no
entry in `doc/licenses/` (a shell `if ! grep | sed` bug). After adding a
dependency, check `dist/npm-dependencies.txt` against `doc/licenses/`
manually, and keep to license types the project already has.
