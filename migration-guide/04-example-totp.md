# 4. Example: the TOTP extension

`extensions/guacamole-auth-totp` adds a `GUAC_TOTP_CODE` field to the login
form: it shows the enrollment QR code and asks for the 6-digit code. It has
the four typical pieces — a module, a config block, a field controller and
its template — so it is a good model for most extensions.

```
src/main/resources/                         src/main/frontend-ng/
├── totpModule.js                    →      ├── totpModule.ts
├── config/totpConfig.js             →      ├── config/totpConfig.ts
├── controllers/                            ├── controllers/
│   authenticationCodeFieldController.js →  │   authenticationCodeFieldController.ts
└── templates/                              └── templates/
    authenticationCodeField.html     →          authenticationCodeField.html
```

`guac-manifest.json`, `totp.css`, `translations/*.json` and all Java code are
unchanged.

## The module

**Before** — `resources/totpModule.js`

```js
/**
 * Module which provides handling for TOTP multi-factor authentication.
 */
angular.module('guacTOTP', [
    'form'
]);

// Ensure the guacTOTP module is loaded along with the rest of the app
angular.module('index').requires.push('guacTOTP');
```

**After** — `frontend-ng/totpModule.ts`

```ts
/**
 * Module which provides handling for TOTP multi-factor authentication. There
 * are no Angular modules to declare: importing the config block below is all
 * that is needed for it to run when the extension is loaded.
 */
import './config/totpConfig';
```

This file is the build entry (`frontend.ng.entry` in `pom.xml`).

## The config block

**Before** — `resources/config/totpConfig.js`

```js
/**
 * Config block which registers TOTP-specific field types.
 */
angular.module('guacTOTP').config(['formServiceProvider',
    function guacTOTPConfig(formServiceProvider) {

    // Define field for the TOTP code provided by the user
    formServiceProvider.registerFieldType('GUAC_TOTP_CODE', {
        module      : 'guacTOTP',
        controller  : 'authenticationCodeFieldController',
        templateUrl : 'app/ext/totp/templates/authenticationCodeField.html'
    });

}]);
```

**After** — `frontend-ng/config/totpConfig.ts`

```ts
import { formService } from 'guacamole-frontend';
import { AuthenticationCodeFieldController } from '../controllers/authenticationCodeFieldController';

/**
 * Config block which registers TOTP-specific field types.
 */

// Define field for the TOTP code provided by the user
formService.registerFieldType('GUAC_TOTP_CODE', AuthenticationCodeFieldController);
```

The `{ module, controller, templateUrl }` triple collapses into one component
class, because in Angular the controller and its template are one thing.

## The field controller

**Before** — `resources/controllers/authenticationCodeFieldController.js`

```js
angular.module('guacTOTP').controller('authenticationCodeFieldController', ['$scope', '$window',
    function authenticationCodeFieldController($scope, $window) {

    $scope.groupedSecret = $scope.field.secret && $scope.field.secret.match(/.{1,4}/g);

    $scope.detailsShown = false;

    $scope.showDetails = function showDetails() {
        $scope.detailsShown = true;
    };

    $scope.hideDetails = function hideDetails() {
        $scope.detailsShown = false;
    };

    $scope.openKeyURI = function openKeyURI() {
        $window.open($scope.field.keyUri);
    };

}]);
```

**After** — `frontend-ng/controllers/authenticationCodeFieldController.ts`

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FieldComponent, FocusDirective, TranslatePipe } from 'guacamole-frontend';
import template from '../templates/authenticationCodeField.html';

/**
 * The properties of the "GUAC_TOTP_CODE" field, in addition to those of all
 * fields.
 */
interface AuthenticationCodeField {
    name: string;
    secret?: string;
    keyUri?: string;
    qrCode?: string;
    digits?: number;
    mode?: string;
    period?: number;
}

@Component({
    selector: 'guac-totp-authentication-code-field',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, FocusDirective, TranslatePipe],
    template
})
export class AuthenticationCodeFieldController extends FieldComponent {

    get totpField(): AuthenticationCodeField {
        return this.field() as AuthenticationCodeField;
    }

    get groupedSecret(): string[] | null {
        return this.totpField.secret?.match(/.{1,4}/g) ?? null;
    }

    detailsShown = false;

    showDetails(): void {
        this.detailsShown = true;
    }

    hideDetails(): void {
        this.detailsShown = false;
    }

    openKeyURI(): void {
        window.open(this.totpField.keyUri);
    }

}
```

(Doc comments trimmed here; the real files keep the originals word for word.)

What changed, line by line:

| Before | After | Why |
| --- | --- | --- |
| `.controller('name', ['$scope', '$window', fn])` | `@Component({...}) class ... extends FieldComponent` | the field component base class supplies `field`, `model`, `values`, `fieldId`, `disabled` |
| `templateUrl` in the config block | `template` imported from the `.html` file | esbuild inlines it as a string |
| `$scope.field.secret` | `this.totpField.secret` | `field` is a signal input (`this.field()`); the getter adds the TOTP-specific type |
| `$scope.groupedSecret = ...` (computed once) | `get groupedSecret()` | recomputed if the field changes |
| `$scope.detailsShown = false` | `detailsShown = false` | class field |
| `$scope.showDetails = function () {}` | `showDetails(): void {}` | method |
| `$window.open(...)` | `window.open(...)` | no wrapper needed |
| — | `changeDetection: ChangeDetectionStrategy.Eager` | keep AngularJS-style "check everything" behaviour |
| — | `imports: [FormsModule, FocusDirective, TranslatePipe]` | everything the template uses |

## The template

Only the lines that differ are shown; the rest of the file is identical.

```diff
-<div class="totp-code-field" ng-class="{ 'totp-details-visible' : detailsShown }">
+<div class="totp-code-field" [class.totp-details-visible]="detailsShown">

-    <div class="totp-enroll" ng-show="field.qrCode">
+    <div class="totp-enroll" [hidden]="!totpField.qrCode">

-        <p translate="TOTP.HELP_ENROLL_BARCODE"></p>
+        <p>{{ 'TOTP.HELP_ENROLL_BARCODE' | translate }}</p>

-        <div class="totp-qr-code"><img ng-src="{{field.qrCode}}" ng-click="openKeyURI()"></div>
+        <div class="totp-qr-code"><img [src]="totpField.qrCode" (click)="openKeyURI()"></div>

-            <a class="totp-show-details" ng-click="showDetails()">...</a>
-            <a class="totp-hide-details" ng-click="hideDetails()">...</a>
+            <a class="totp-show-details" (click)="showDetails()">...</a>
+            <a class="totp-hide-details" (click)="hideDetails()">...</a>

-                <td><span ng-repeat="group in groupedSecret"
-                          class="totp-detail">{{ group }}</span></td>
+                <td>@for (group of groupedSecret; track $index) {<span
+                          class="totp-detail">{{ group }}</span>}</td>

-                <td><span class="totp-detail">{{ field.digits }}</span></td>
+                <td><span class="totp-detail">{{ totpField.digits }}</span></td>

-        <p translate="TOTP.HELP_ENROLL_VERIFY"
-           translate-values="{ DIGITS : field.digits }"></p>
+        <p>{{ 'TOTP.HELP_ENROLL_VERIFY' | translate:{ DIGITS : totpField.digits } }}</p>

         <input type="text"
                placeholder="{{'TOTP.FIELD_PLACEHOLDER_CODE' |translate}}"
-               ng-attr-name="{{ field.name }}"
-               ng-model="model" autocomplete="off" autocorrect="off" autocapitalize="off" autofocus>
+               [attr.name]="totpField.name"
+               [(ngModel)]="model" autocomplete="off" autocorrect="off" autocapitalize="off"
+               autofocus [guacFocus]="true">
```

`{{ ... | translate }}` interpolations and CSS classes needed no change.

## The pom.xml

```xml
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
```

`totp.min.js` is the name already in the manifest's `"js"` list, so the
manifest stays the same.

## Build and check

```sh
mvn -pl extensions/guacamole-auth-totp -am -Pangular-frontend -DskipTests clean package
unzip -l extensions/guacamole-auth-totp/target/guacamole-auth-totp-1.6.1.jar | grep -E 'min.js|html'
#  4429  totp.min.js                          ← Angular build (~4 KB)
#  2051  templates/authenticationCodeField.html  ← Angular template
```

Then `rtl-lab/start-totp.sh`, log in as `guacadmin`, and you get the
enrollment screen with the QR code.
