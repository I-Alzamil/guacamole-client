/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { AuthenticationParameters, AuthenticationService } from '../auth/authentication.service';
import { PatchPointDirective } from '../extension/patches';
import { FormComponent } from '../form/form.component';
import { TranslatePipe } from '../locale/translate.pipe';
import { TranslationService } from '../locale/translation.service';
import { CacheService } from '../rest/cache.service';
import { RequestService } from '../rest/request.service';
import { Field, FieldType } from '../rest/types/field';
import { RestErrorType } from '../rest/types/rest-error';
import { TranslatableMessage } from '../rest/types/translatable-message';

/**
 * The value assigned to fields which have not yet been filled in.
 */
const DEFAULT_FIELD_VALUE = '';

/**
 * The login form, requesting whichever credentials the server has indicated
 * are required.
 */
@Component({
    selector: 'guac-login',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormComponent, PatchPointDirective, TranslatePipe],
    host: {
        'class': 'login-ui',
        '[class.error]': 'loginError()',
        '[class.continuation]': 'isContinuation()',
        '[class.initial]': '!isContinuation()'
    },
    template: `
        <p class="login-error">{{ loginError() | translate }}</p>

        <div class="login-dialog-middle" guacPatchPoint>
            <div class="login-dialog notification">
                <form class="login-form" (submit)="login($event)">

                    <div class="logo"></div>
                    <div class="version">
                        <div class="app-name">{{ 'APP.NAME' | translate }}</div>
                        <div class="version-number">{{ 'APP.VERSION' | translate }}</div>
                    </div>

                    @if (helpText()) {
                        <p>{{ helpText() | translate }}</p>
                    }

                    <div class="login-fields">
                        <guac-form namespace="LOGIN" [content]="remainingFields()"
                                   [model]="enteredValues()" [focused]="relevantField()?.name"
                                   [disabled]="submitted()" />
                    </div>

                    <div class="buttons">
                        <input type="submit" name="login" class="login" [disabled]="submitted()"
                               [value]="'LOGIN.ACTION_LOGIN' | translate">
                        <input type="submit" name="login" class="continue-login" [disabled]="submitted()"
                               [value]="'LOGIN.ACTION_CONTINUE' | translate">
                    </div>

                </form>
            </div>
        </div>
    `
})
export class LoginComponent {

    private readonly authenticationService = inject(AuthenticationService);
    private readonly cacheService = inject(CacheService);
    private readonly requestService = inject(RequestService);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly translationService = inject(TranslationService);

    /** Message providing instructions for completing the login, if any. */
    readonly helpText = input<TranslatableMessage | null | undefined>();

    /** All fields expected by the server. */
    readonly form = input<Field[] | null | undefined>();

    /** Values already provided for the expected fields. */
    readonly values = input<AuthenticationParameters | null | undefined>();

    readonly loginError = signal<TranslatableMessage | null>(null);

    readonly enteredValues = signal<Record<string, string>>({});

    readonly submitted = signal(false);

    /**
     * Whether this login form continues a previous attempt (some values have
     * already been provided).
     */
    readonly isContinuation = computed(() => Object.keys(this.values() || {}).length > 0);

    /**
     * The fields which have not yet been provided.
     */
    readonly remainingFields = computed(() => {
        const values = this.values() || {};
        return (this.form() || []).filter(field => !(field.name in values));
    });

    /**
     * The first field which has not yet been filled in, and thus should
     * receive focus.
     */
    readonly relevantField = signal<Field | null>(null);

    constructor() {

        // Ensure provided values are included within entered values, even if
        // they have no corresponding input fields
        effect(() => {

            const entered: Record<string, string> = { ...untracked(this.enteredValues) };
            Object.assign(entered, this.values() || {});

            // Set default values for all unset fields
            for (const field of this.remainingFields()) {
                if (!entered[field.name])
                    entered[field.name] = DEFAULT_FIELD_VALUE;
            }

            this.enteredValues.set(entered);
            this.relevantField.set(this.remainingFields().find(field => !entered[field.name]) ?? null);

        });

        const subscription = this.authenticationService.events.subscribe(event => {
            switch (event.type) {

                // Update UI to reflect in-progress auth status
                case 'loginPending':
                    this.submitted.set(true);
                    this.loginError.set(null);
                    break;

                // Refresh translations upon success (they may vary by user).
                // The failed navigation is retried by PendingNavigationService.
                case 'login':
                    this.cacheService.languages.removeAll();
                    this.translationService.refresh();
                    break;

                case 'loginFailed':

                    // Initial submission is complete and has failed
                    this.submitted.set(false);

                    // Clear out passwords if the credentials were rejected
                    // for any reason
                    if (event.error.type !== RestErrorType.INSUFFICIENT_CREDENTIALS) {

                        if (event.error.type === RestErrorType.INVALID_CREDENTIALS)
                            this.loginError.set({ key: 'LOGIN.ERROR_INVALID_LOGIN' });
                        else
                            this.loginError.set(event.error.translatableMessage ?? null);

                        // Reset all remaining fields, preserving usernames
                        const entered = this.enteredValues();
                        for (const field of this.remainingFields()) {
                            if (field.type !== FieldType.USERNAME && field.name in entered)
                                entered[field.name] = DEFAULT_FIELD_VALUE;
                        }
                        this.enteredValues.set({ ...entered });

                    }
                    break;

            }
        });

        // Reset state after authentication and routing have succeeded
        const navigation = this.router.events.pipe(filter(event => event instanceof NavigationEnd))
            .subscribe(() => {
                this.enteredValues.set({});
                this.submitted.set(false);
            });

        inject(DestroyRef).onDestroy(() => {
            subscription.unsubscribe();
            navigation.unsubscribe();
        });

    }

    login(event: Event): void {

        event.preventDefault();

        // Values from URL parameters, overridden by those entered in fields
        const urlValues = getQueryParameters(this.router, this.route);
        const authParams = { ...urlValues, ...this.enteredValues() };

        this.authenticationService.authenticate(authParams).catch(this.requestService.IGNORE);

    }

}

/**
 * Returns all query parameters of the current URL.
 */
export function getQueryParameters(router: Router, route?: ActivatedRoute): AuthenticationParameters {
    const params = router.parseUrl(router.url).queryParams;
    return { ...(route?.snapshot.queryParams ?? {}), ...params };
}
