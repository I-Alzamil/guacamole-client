# 5. Example: patches, run blocks, services, directives

Snippets from the other in-repo extensions, one per pattern.

## ng-controller in patches

*Quickconnect* inserts a "connect to URI" bar above the connection list with
an HTML patch that uses `ng-controller`.

**Before** — `resources/templates/quickconnectField.html`

```html
<meta name="before" content=".all-connections">
<div class="quickconnect-list-item list-item" ng-controller="quickconnectController">
    <div class="quickconnect-container">
        <form ng-submit="quickConnect()">
            <input type=text class="quickconnect-field" placeholder="{{'QUICKCONNECT.FIELD_PLACEHOLDER_URI' |translate}}" ng-model="uri">
        </form>
    </div>
    <div class="action-buttons">
        <button class="quickconnect-button" ng-click="quickConnect()">{{'QUICKCONNECT.ACTION_CONNECT' | translate}}</button>
    </div>
</div>
```

**After** — `frontend-ng/templates/quickconnectField.html`

```html
<meta name="before" content=".all-connections">
<div class="quickconnect-list-item list-item" quickconnectController #controller="quickconnectController">
    <div class="quickconnect-container">
        <form (ngSubmit)="controller.quickConnect()">
            <input type=text class="quickconnect-field" placeholder="{{'QUICKCONNECT.FIELD_PLACEHOLDER_URI' |translate}}" name="uri" [(ngModel)]="controller.uri">
        </form>
    </div>
    <div class="action-buttons">
        <button class="quickconnect-button" (click)="controller.quickConnect()">{{'QUICKCONNECT.ACTION_CONNECT' | translate}}</button>
    </div>
</div>
```

The controller becomes a directive with `exportAs`, so the template gets a
handle on it (`#controller="quickconnectController"`) — the Angular
equivalent of the scope `ng-controller` created.

**Before** — `resources/controllers/quickconnectController.js`

```js
angular.module('guacQuickConnect').controller('quickconnectController', ['$scope', '$injector',
        function manageConnectionController($scope, $injector) {

    // Required types
    var ClientIdentifier    = $injector.get('ClientIdentifier');

    // Required services
    var $location            = $injector.get('$location');
    var guacNotification     = $injector.get('guacNotification');
    var quickConnectService  = $injector.get('quickConnectService');

    $scope.uri = null;

    $scope.quickConnect = function quickConnect() {

        quickConnectService.createConnection($scope.uri)
        .then(function createdConnection(connectionId) {
            $location.url('/client/' + ClientIdentifier.toString({
                dataSource : 'quickconnect',
                type       : ClientIdentifier.Types.CONNECTION,
                id         : connectionId
            }));
        }, guacNotification.SHOW_REQUEST_ERROR);

        return;

    };

}]);
```

**After** — `frontend-ng/controllers/quickconnectController.ts`

```ts
import { Directive, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ClientIdentifierType, NotificationService, clientIdentifierToString, patchService } from 'guacamole-frontend';
import { QuickConnectService } from '../services/quickConnectService';

@Directive({
    selector: '[quickconnectController]',
    exportAs: 'quickconnectController'
})
export class QuickconnectController {

    // Required services
    private readonly router = inject(Router);
    private readonly guacNotification = inject(NotificationService);
    private readonly quickConnectService = inject(QuickConnectService);

    uri: string | null = null;

    quickConnect(): void {

        this.quickConnectService.createConnection(this.uri)
        .then((connectionId) => {
            this.router.navigateByUrl('/client/' + clientIdentifierToString({
                dataSource : 'quickconnect',
                type       : ClientIdentifierType.CONNECTION,
                id         : connectionId
            }));
        }, this.guacNotification.SHOW_REQUEST_ERROR);

        return;

    }

}

// Allow use of quickconnectController within HTML patches
patchService.registerDirective(QuickconnectController);
```

Note how the method body is unchanged apart from `$scope.` → `this.` and the
service names — that is the point of a file-for-file port.

## Services

A `module.factory` becomes an `@Injectable` class; its functions become
methods; `$injector.get(...)` becomes `inject(...)`.

```ts
// frontend-ng/services/quickConnectService.ts
import { Injectable, inject } from '@angular/core';
import { AuthenticationService, CacheService, RequestService } from 'guacamole-frontend';

@Injectable({ providedIn: 'root' })
export class QuickConnectService {

    // Required services
    private readonly authenticationService = inject(AuthenticationService);
    private readonly cacheService          = inject(CacheService);
    private readonly requestService        = inject(RequestService);

    createConnection(uri: string | null): Promise<string> {

        // Build HTTP parameters set
        var httpParameters = {
            token : this.authenticationService.getCurrentToken() ?? undefined
        };

        return this.requestService.request({
            method  : 'POST',
            url     : 'api/session/ext/quickconnect/create',
            params  : httpParameters,
            body    : new URLSearchParams({uri: uri ?? ''}).toString(),
            headers : {'Content-Type': 'application/x-www-form-urlencoded'}
        })
        .then((connectionId: any) => {
            // Clear connections and users from cache.
            this.cacheService.connections.removeAll();
            this.cacheService.users.removeAll();

            // Pass on the connection identifier
            return connectionId.identifier;
        });

    }

}
```

`RequestService.request()` takes `$http`-style options (`method`, `url`,
`params`, `headers`), with the request body under `body` rather than `data`,
and returns a native Promise. A header set to `undefined` suppresses the
app's default no-cache headers.

## Run blocks

*SSO OpenID* redirects to the IdP's logout endpoint when the user logs out.

**Before** — `resources/openidModule.js`

```js
angular.module('guacSsoOpenid', []);

angular.module('guacSsoOpenid').run(['$rootScope', '$window',
        function guacSsoOpenidLogout($rootScope, $window) {

    // Redirect to SSO logout endpoint when user logs out
    $rootScope.$on('guacLogout', function handleLogout() {
        $window.location.href = 'api/ext/openid/logout';
    });

}]);

angular.module('index').requires.push('guacSsoOpenid');
```

**After** — `frontend-ng/openidModule.ts`

```ts
import './transformToken';
import { inject } from '@angular/core';
import { AuthenticationService, run } from 'guacamole-frontend';

run(function guacSsoOpenidLogout() {

    // Redirect to SSO logout endpoint when user logs out
    inject(AuthenticationService).events.subscribe(event => {
        if (event.type === 'logout')
            window.location.href = 'api/ext/openid/logout';
    });

});
```

`run(fn)` executes `fn` once while the application starts, inside Angular's
injection context, so `inject()` works exactly like the DI array did.
`$rootScope` events map to `AuthenticationService.events`
(`loginPending`, `login`, `loginFailed`, `invalidCredentials`,
`insufficientCredentials`, `fatalPageError`, `logout`).

## Directives

*Display statistics* adds a frame-rate bar under each remote display with a
directive used inside a patch.

**Patch** — only the binding syntax changes:

```diff
 <meta name="after" content=".client-tile guac-client">
-<guac-client-statistics client="client"></guac-client-statistics>
+<guac-client-statistics [client]="client"></guac-client-statistics>
```

**Directive** — `scope: { client: '=' }` + `$scope.$watch('client')` become an
`@Input()` setter; `$scope.$apply` becomes `DigestService.apply`:

```js
// Before
$scope.$watch('client', function clientChanged(client, oldClient) {
    if (oldClient)
        oldClient.managedDisplay.display.onstatistics = null;
    client.managedDisplay.display.statisticWindow = 1000;
    client.managedDisplay.display.onstatistics = updateStatistics;
});

var updateStatistics = function updateStatistics(stats) {
    $scope.$apply(function statisticsChanged() {
        $scope.statistics = stats;
    });
};
```

```ts
// After
@Input()
set client(client: any) {
    const oldClient = this.currentClient;
    this.currentClient = client;
    if (oldClient)
        oldClient.managedDisplay.display.onstatistics = null;
    client.managedDisplay.display.statisticWindow = 1000;
    client.managedDisplay.display.onstatistics = (stats: any) => this.updateStatistics(stats);
}

private updateStatistics(stats: any): void {
    this.digestService.apply(() => {
        this.statistics = stats;
    });
}
```

…and at the bottom of the file:

```ts
patchService.registerDirective(GuacClientStatistics);
```

## Watches that are not inputs

When a controller watches its own state (e.g. *restrict*'s time-range
editors), use `Watchers` from `ngDoCheck`:

```ts
private readonly watchers = new Watchers();

constructor() {
    // $scope.$watch('model', fn) — registered once, like in the controller body
    this.watchers.watch(() => this.model, (model) => { /* ... */ });
}

ngDoCheck(): void {
    // the "digest": evaluates all watches, calling callbacks on change
    this.watchers.check();
}
```

Pass `true` as the third argument for a deep watch (compared as JSON; the
callback then gets no previous value).

## HTML-only extensions

*JDBC* only patches the client share menu. Its port is a single file:
`src/main/frontend-ng/html/shared-connection.html`, converted the same way as
the quickconnect patch. No TypeScript, no `pom.xml` change — the parent
profile copies the HTML automatically.
