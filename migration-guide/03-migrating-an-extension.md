# 3. Migrating an extension

The goal is a **file-for-file** port: every AngularJS file gets a twin at the
same relative path under `src/main/frontend-ng/`, with the same names,
comments and structure. Reviewers can then diff old and new side by side.

```
src/main/
├── resources/                     ← untouched (CSS, translations, manifest, old JS)
│   ├── guac-manifest.json
│   ├── fooModule.js
│   ├── config/fooConfig.js
│   ├── controllers/barController.js
│   └── templates/bar.html
└── frontend-ng/                   ← new
    ├── fooModule.ts
    ├── config/fooConfig.ts
    ├── controllers/barController.ts
    └── templates/bar.html
```

## Step 1 — the module file becomes the entry point

AngularJS needed a module declaration and a hook into `index`. Angular needs
neither: the entry file just imports the files that do something.

```js
// fooModule.js (AngularJS)
angular.module('guacFoo', ['form']);
angular.module('index').requires.push('guacFoo');
```

```ts
// fooModule.ts (Angular)
import './config/fooConfig';
```

esbuild follows the imports, so only files reachable from the entry are
bundled. Files that only *register* things (config blocks, run blocks,
directives used in patches) must be imported for their side effects.

## Step 2 — convert each kind of file

| AngularJS | Angular | Example |
| --- | --- | --- |
| `module.config([... formServiceProvider ...])` | top-level code calling `formService.registerFieldType(type, Component)` | [TOTP](04-example-totp.md) |
| `module.run([...])` | `run(() => { inject(...) })` | [OpenID](05-example-patches-and-run-blocks.md#run-blocks) |
| field controller + `templateUrl` | `@Component` extending `FieldComponent`, `template` imported from the `.html` | [TOTP](04-example-totp.md) |
| `module.factory` / `service` | `@Injectable({ providedIn: 'root' })` class | [Quickconnect](05-example-patches-and-run-blocks.md#services) |
| `module.directive` | `@Component`/`@Directive` with `@Input()`s | [Display statistics](05-example-patches-and-run-blocks.md#directives) |
| `ng-controller` inside a patch | `@Directive` with `exportAs`, used as `#ctrl="name"` | [Quickconnect](05-example-patches-and-run-blocks.md#ng-controller-in-patches) |
| directive used in a patch | also call `patchService.registerDirective(Type)` | [Display statistics](05-example-patches-and-run-blocks.md#directives) |

### Inside a controller / directive

| AngularJS | Angular |
| --- | --- |
| `$scope.foo = 1` | `foo = 1` (class field) |
| `$scope.doIt = function () {...}` | `doIt(): void {...}` (method) |
| `$scope.field`, `$scope.model` (field controllers) | `this.field()`, `this.model` (from `FieldComponent`) |
| `$injector.get('svc')` / DI array | `private readonly svc = inject(Service)` |
| `$scope.$watch('x', fn)` | an `@Input() set x(v)` setter, or `watchers.watch(() => this.x, fn)` once + `watchers.check()` in `ngDoCheck` |
| `$scope.$watch(expr, fn, true)` (deep) | `watchers.watch(getter, fn, true)` |
| `$scope.$apply(fn)` | `inject(DigestService).apply(fn)` |
| `$scope.$on('$destroy', fn)` | `ngOnDestroy()` |
| `$rootScope.$on('guacLogout')` | `inject(AuthenticationService).events` → `type === 'logout'` |
| `$location.url(u)` | `inject(Router).navigateByUrl(u)` |
| `$window` | `window` |
| `$http` / `requestService` | `inject(RequestService)` (body under `body`, returns a Promise) |
| `$q` promises | native `Promise` |
| `guacNotification` | `inject(NotificationService)` |
| `ClientIdentifier.toString(...)` | `clientIdentifierToString(...)`, `ClientIdentifierType` |

### Inside a template

| AngularJS | Angular |
| --- | --- |
| `ng-click="f()"` | `(click)="f()"` |
| `ng-submit="f()"` | `(ngSubmit)="f()"` |
| `ng-model="x"` | `[(ngModel)]="x"` (needs a `name` inside a `<form>`) |
| `ng-show="c"` / `ng-hide="c"` | `[hidden]="!c"` / `[hidden]="c"` |
| `ng-if="c"` | `@if (c) { ... }` |
| `ng-repeat="i in list"` | `@for (i of list; track $index) { ... }` |
| `ng-class="{ a: c }"` | `[class.a]="c"` or `[ngClass]="{ a: c }"` |
| `ng-src="{{u}}"` | `[src]="u"` |
| `ng-attr-name="{{n}}"` | `[attr.name]="n"` |
| `ng-disabled="c"` | `[disabled]="c"` |
| `translate="KEY"` | `{{ 'KEY' \| translate }}` |
| `translate="KEY" translate-values="{ A: x }"` | `{{ 'KEY' \| translate:{ A: x } }}` |
| `{{ d \| date:'short' }}` | `{{ d \| guacDate:'short' }}` |
| `guac-focus="c"` | `[guacFocus]="c"` |
| `<my-directive attr="expr">` | `<my-directive [attr]="expr">` |

Remember to list everything a template uses in the component's `imports`
(`FormsModule`, `TranslatePipe`, `FocusDirective`, `NgClass`…).

## Step 3 — imports

Only these modules may be imported; they resolve to the running app:

- `@angular/core`, `@angular/common`, `@angular/forms`, `@angular/router` —
  a curated subset (decorators, `inject`, signals, `NgClass`, `FormsModule`,
  `Router`, …).
- `guacamole-frontend` — the application API: `AuthenticationService`,
  `CacheService`, `ClientMenuService`, `ConnectionService`,
  `ConnectionGroupService`, `DataSourceService`, `DigestService`,
  `FieldComponent`, `FocusDirective`, `GuacDatePipe`, `NotificationService`,
  `PageService`, `PreferenceService`, `RequestService`, `SchemaService`,
  `TranslatePipe`, `TranslationService`, `UserService`, `Watchers`,
  `ClientIdentifierType`, `clientIdentifierToString`, `formService`,
  `patchService`, `run`.

The full list is in
`guacamole/src/main/frontend-ng/src/app/extension/extension-modules.ts`.
If you need something that is not there, it has to be added to that file
(and the app rebuilt) — importing other npm packages that expect Angular will
not work, but self-contained libraries are bundled normally.

`.html` files can be imported as strings:
`import template from '../templates/bar.html';`

## Step 4 — HTML patches

Patches keep their `<meta name="..." content="selector">` header and the
same six operations (`before`, `after`, `replace`, `before-children`,
`after-children`, `replace-children`). Two differences:

1. **Targets.** Only elements of the app marked with `guacPatchPoint` (and
   content inserted by other patches) can be patched. Today these are the
   login dialog (`.login-dialog-middle`), the home page connection list
   (`.all-connections`) and each connection (`.home-connection`), and each
   client display (`guac-client`). A selector that matched elsewhere in
   AngularJS needs a new patch point in the app.
2. **Content.** The body is an Angular template. Variables of the patch point
   are available by name (`item` on a home connection, `client` on a client
   display). Directives and components must be registered with
   `patchService.registerDirective(...)`.

Put the converted patch at the same path under `src/main/frontend-ng/`; the
build copies it over the old one.

## Step 5 — pom.xml

Add the `angular-frontend` profile from
[Building and running](02-building-and-running.md#what-the-profile-does) with
your entry file and the script name already listed in your manifest.

## Step 6 — CSS (optional, recommended)

CSS works unchanged, but for right-to-left languages replace physical
properties with logical ones:

| Physical | Logical |
| --- | --- |
| `margin-left` / `padding-right` | `margin-inline-start` / `padding-inline-end` |
| `left: 0` | `inset-inline-start: 0` |
| `text-align: left` | `text-align: start` |
| `float: right` | `float: inline-end` |
| `border-left` | `border-inline-start` |

See [Translations and RTL](06-translations-and-rtl.md).

## Checklist

- [ ] Every `.js`/`.html` has a twin under `src/main/frontend-ng/`.
- [ ] The entry file imports every file with side effects.
- [ ] Components declare `changeDetection: ChangeDetectionStrategy.Eager`.
- [ ] Inputs of extension classes use `@Input()`, not `input()`.
- [ ] Forms use `FormsModule` from `@angular/forms` (the app's copy).
- [ ] Callbacks from outside Angular go through `DigestService.apply()`.
- [ ] Directives used in patches are passed to `patchService.registerDirective`.
- [ ] `pom.xml` has the `angular-frontend` profile (unless HTML-only).
- [ ] Built with `-Pangular-frontend`, tested in English **and** Arabic.
