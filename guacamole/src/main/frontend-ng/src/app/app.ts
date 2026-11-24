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

import { Dir } from '@angular/cdk/bidi';
import { ChangeDetectionStrategy, Component, DOCUMENT, DestroyRef, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, ActivationEnd, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { AuthenticationParameters, AuthenticationService } from './auth/authentication.service';
import { ClientPanelComponent } from './client/thumbnail.components';
import { ClientManagerService } from './client/client-manager.service';
import { ClipboardService } from './clipboard/clipboard.service';
import { DigestService } from './index/digest.service';
import { GuacKeyEvent, KeyboardEventsService } from './index/keyboard-events.service';
import { PageService } from './index/page.service';
import { PendingNavigationService } from './index/route-guards';
import { TranslatePipe } from './locale/translate.pipe';
import { TranslationService } from './locale/translation.service';
import { LoginComponent } from './login/login.component';
import { ModalComponent } from './notification/modal.component';
import { NotificationComponent } from './notification/notification.component';
import { NotificationService } from './notification/notification.service';
import { Field } from './rest/types/field';
import { RestError, RestErrorType } from './rest/types/rest-error';
import { TranslatableMessage } from './rest/types/translatable-message';
import { PreferenceService } from './settings/preference.service';

/**
 * The interval at which the validity of the current session is checked
 * while no connections are active, in milliseconds.
 */
const SESSION_VALIDITY_RECHECK_INTERVAL = 15000;

/**
 * The overall state of the application.
 */
enum ApplicationState {
    AUTOMATIC_LOGIN_REJECTED = 'automaticLoginRejected',
    AWAITING_CREDENTIALS = 'awaitingCredentials',
    FATAL_ERROR = 'fatalError',
    LOADING = 'loading',
    LOGGED_OUT = 'loggedOut',
    READY = 'ready'
}

/**
 * Route data which may be associated with any route.
 */
export interface GuacRouteData {

    /** The translation key of the page title. */
    title?: string;

    /** CSS class to apply to the document body while the route is active. */
    bodyClassName?: string;

}

/**
 * The root component of the Guacamole web application, displaying the
 * current page, login screen, or application-wide error.
 *
 * The text direction of the entire application follows the current
 * language via the Angular CDK bidi Dir directive, such that all components
 * which inject Directionality (and all CSS logical properties) mirror
 * automatically for right-to-left languages.
 */
@Component({
    selector: 'guac-app',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [ClientPanelComponent, Dir, LoginComponent, ModalComponent, NotificationComponent,
        RouterOutlet, TranslatePipe],
    host: { 'class': 'guac-app' },
    template: `
        <!-- Reading the digest version re-renders the application whenever
             state is changed outside of Angular (see DigestService) -->
        @if (digest.version() >= 0 && translationService.ready()) {
            <div class="guac-app-root" [dir]="translationService.direction()">
                @switch (applicationState()) {

                    @case ('loggedOut') {
                        <div class="logged-out-modal">
                            <guac-modal>
                                <div class="notification">
                                    <p>{{ 'APP.INFO_LOGGED_OUT' | translate }}</p>
                                    <p><button [disabled]="reAuthenticating()" (click)="reAuthenticate()">{{ 'APP.ACTION_LOGIN_AGAIN' | translate }}</button></p>
                                </div>
                            </guac-modal>
                        </div>
                    }

                    @case ('fatalError') {
                        <div class="fatal-page-error-modal">
                            <guac-modal>
                                <div class="fatal-page-error">
                                    <h1>{{ 'APP.DIALOG_HEADER_ERROR' | translate }}</h1>
                                    <p>{{ 'APP.ERROR_PAGE_UNAVAILABLE' | translate }}</p>
                                </div>
                            </guac-modal>
                        </div>
                    }

                    @case ('automaticLoginRejected') {
                        <div class="automatic-login-rejected-modal">
                            <guac-modal>
                                <div class="notification">
                                    <p>{{ fatalError()?.translatableMessage | translate }}</p>
                                    <p><button [disabled]="reAuthenticating()" (click)="reAuthenticate()">{{ 'APP.ACTION_LOGIN_AGAIN' | translate }}</button></p>
                                </div>
                            </guac-modal>
                        </div>
                    }

                    @case ('awaitingCredentials') {
                        <guac-login [helpText]="loginHelpText()" [form]="expectedCredentials()"
                                    [values]="acceptedCredentials()" />
                    }

                }

                <!-- The router outlet must always exist such that navigation
                     (and thus authentication) can proceed -->
                <div [hidden]="applicationState() !== 'ready'">

                    @if (notificationService.getStatus(); as status) {
                        <guac-modal class="global-status-modal">
                            <guac-notification [notification]="status" />
                        </guac-modal>
                    }

                    <div id="content">
                        <router-outlet />
                    </div>

                    @if (applicationState() === 'ready') {
                        <div id="other-connections">
                            <guac-client-panel [clientGroups]="clientManager.getManagedClientGroups()" />
                        </div>
                    }

                </div>
            </div>
        }
    `
})
export class App {

    private readonly document = inject(DOCUMENT);
    private readonly authenticationService = inject(AuthenticationService);
    private readonly keyboardEvents = inject(KeyboardEventsService);
    private readonly pendingNavigation = inject(PendingNavigationService);
    private readonly router = inject(Router);

    protected readonly clientManager = inject(ClientManagerService);
    protected readonly digest = inject(DigestService);
    private readonly pageService = inject(PageService);
    protected readonly notificationService = inject(NotificationService);
    protected readonly translationService = inject(TranslationService);

    readonly applicationState = signal<ApplicationState>(ApplicationState.LOADING);
    readonly fatalError = signal<RestError | null>(null);
    readonly loginHelpText = signal<TranslatableMessage | null>(null);
    readonly reAuthenticating = signal(false);
    readonly acceptedCredentials = signal<AuthenticationParameters | null>(null);
    readonly expectedCredentials = signal<Field[] | null>(null);

    constructor() {

        const destroyRef = inject(DestroyRef);

        // Load translations for the preferred language
        this.translationService.use(inject(PreferenceService).preferences.language);

        // Keep document title and body class in sync with the current page
        const title = inject(Title);
        effect(() => title.setTitle(this.translationService.instant(this.pageService.title())));
        effect(() => this.document.body.className = this.pageService.bodyClassName());

        this.initKeyboard(destroyRef);
        this.initSessionValidityCheck(destroyRef);
        this.initClipboard();

        const authEvents = this.authenticationService.events.subscribe(event => {
            switch (event.type) {

                // Display login screen if a whole new set of credentials is
                // needed
                case 'invalidCredentials':
                    this.setApplicationState(ApplicationState.AWAITING_CREDENTIALS);
                    this.loginHelpText.set(null);
                    this.acceptedCredentials.set({});
                    this.expectedCredentials.set(event.error.expected ?? null);
                    break;

                // Prompt for remaining credentials if provided credentials
                // were not enough
                case 'insufficientCredentials':
                    this.setApplicationState(ApplicationState.AWAITING_CREDENTIALS);
                    this.loginHelpText.set(event.error.translatableMessage ?? null);
                    this.acceptedCredentials.set(event.parameters);
                    this.expectedCredentials.set(event.error.expected ?? null);
                    break;

                // Alert user to authentication errors that occur in the
                // absence of an interactive login form
                case 'loginFailed':
                    if (this.applicationState() === ApplicationState.AWAITING_CREDENTIALS
                            || event.error.type === RestErrorType.INSUFFICIENT_CREDENTIALS
                            || event.error.type === RestErrorType.INVALID_CREDENTIALS)
                        break;
                    this.setApplicationState(ApplicationState.AUTOMATIC_LOGIN_REJECTED);
                    this.reAuthenticating.set(false);
                    this.fatalError.set(event.error);
                    break;

                // Replace all content with an error message if the page
                // itself cannot be displayed due to an error
                case 'fatalPageError':
                    this.setApplicationState(ApplicationState.FATAL_ERROR);
                    this.fatalError.set(event.error);
                    break;

                // Replace the overall user interface with an informational
                // message if the user has manually logged out
                case 'logout':
                    this.applicationState.set(ApplicationState.LOGGED_OUT);
                    this.reAuthenticating.set(false);
                    break;

            }
        });

        const routerEvents = this.router.events.subscribe(event => {

            // Ensure new pages always start with clear keyboard state
            if (event instanceof NavigationStart)
                this.keyboardEvents.reset();

            // Update title and CSS class upon successful navigation to a
            // leaf route
            else if (event instanceof ActivationEnd && !event.snapshot.firstChild) {
                this.applicationState.set(ApplicationState.READY);
                const data = collectRouteData(event.snapshot);
                this.pageService.title.set(data.title || 'APP.NAME');
                this.pageService.bodyClassName.set(data.bodyClassName || '');
                this.pageService.setDefaultIcons();
            }

        });

        destroyRef.onDestroy(() => {
            authEvents.unsubscribe();
            routerEvents.unsubscribe();
        });

    }

    private setApplicationState(state: ApplicationState): void {
        this.applicationState.set(state);
        this.pageService.title.set('APP.NAME');
        this.pageService.bodyClassName.set('');
    }

    /**
     * Restarts authentication, returning the user to the home page.
     */
    reAuthenticate(): void {
        this.reAuthenticating.set(true);
        this.pendingNavigation.reset();
        this.router.navigateByUrl('/', { onSameUrlNavigation: 'reload' });
    }

    /**
     * Creates the global keyboard which receives all key events not handled
     * by a specific element, dispatching those events to listeners.
     */
    private initKeyboard(destroyRef: DestroyRef): void {

        // Add default destination for input events
        const sink = new Guacamole.InputSink();
        this.document.body.appendChild(sink.getElement());

        const keyboard = new Guacamole.Keyboard(this.document);
        keyboard.listenTo(sink.getElement());
        this.keyboardEvents.keyboard = keyboard;

        keyboard.onkeydown = (keysym: number) => {

            // Do not handle key events if not logged in
            if (this.applicationState() !== ApplicationState.READY)
                return true;

            const before = new GuacKeyEvent(keysym, keyboard);
            this.keyboardEvents.beforeKeydown.next(before);
            if (before.defaultPrevented)
                return true;

            const keydown = new GuacKeyEvent(keysym, keyboard);
            this.keyboardEvents.keydown.next(keydown);
            return !keydown.defaultPrevented;

        };

        keyboard.onkeyup = (keysym: number) => {

            if (this.applicationState() !== ApplicationState.READY)
                return;

            const before = new GuacKeyEvent(keysym, keyboard);
            this.keyboardEvents.beforeKeyup.next(before);
            if (before.defaultPrevented)
                return;

            this.keyboardEvents.keyup.next(new GuacKeyEvent(keysym, keyboard));

        };

        // Release all keys when window loses focus, or upon form submission
        // (there may not be corresponding keyup events for key presses
        // involved in submitting a form)
        const reset = () => keyboard.reset();
        window.addEventListener('blur', reset);
        this.document.addEventListener('submit', reset);
        destroyRef.onDestroy(() => {
            window.removeEventListener('blur', reset);
            this.document.removeEventListener('submit', reset);
        });

    }

    /**
     * Periodically checks whether the current session is still valid while
     * no connections are active, reshowing the login screen if the session
     * has expired. Active connections already check validity implicitly.
     */
    private initSessionValidityCheck(destroyRef: DestroyRef): void {
        const interval = setInterval(() => {
            if (this.authenticationService.getCurrentToken() && !this.clientManager.hasActiveTunnel()) {
                this.authenticationService.getValidity().then(valid => {
                    if (!valid)
                        this.reAuthenticate();
                });
            }
        }, SESSION_VALIDITY_RECHECK_INTERVAL);
        destroyRef.onDestroy(() => clearInterval(interval));
    }

    /**
     * Re-reads the local clipboard whenever it may have changed.
     */
    private initClipboard(): void {

        const clipboardService = inject(ClipboardService);
        const resync = () => clipboardService.resyncClipboard();

        window.addEventListener('load', resync, true);
        window.addEventListener('copy', resync);
        window.addEventListener('cut', resync);
        window.addEventListener('focus', (event) => {
            // Only recheck clipboard if it's the window itself that gained focus
            if (event.target === window)
                resync();
        }, true);

    }

}

/**
 * Merges the data of the given route and all its ancestors.
 */
function collectRouteData(snapshot: ActivatedRouteSnapshot): GuacRouteData {
    let data: GuacRouteData = {};
    for (let route: ActivatedRouteSnapshot | null = snapshot; route; route = route.parent)
        data = { ...route.data, ...data };
    return data;
}
