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

import { ChangeDetectionStrategy, Component, DestroyRef, DoCheck, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ANONYMOUS_USERNAME, AuthenticationService } from '../auth/authentication.service';
import { ClickDirective } from '../element/element.directives';
import { PatchPointDirective } from '../extension/patches';
import { Watchers } from '../element/watchers';
import { KeyboardEventsService } from '../index/keyboard-events.service';
import { orderBy } from '../list/sort-order';
import { TranslatePipe } from '../locale/translate.pipe';
import { TranslationService } from '../locale/translation.service';
import { getQueryParameters } from '../login/login.component';
import { MenuAction } from '../navigation/page-definition';
import { UserPageService } from '../navigation/user-page.service';
import { ModalComponent } from '../notification/modal.component';
import { Notification, NotificationCountdown } from '../notification/notification';
import { NotificationComponent } from '../notification/notification.component';
import { RequestService } from '../rest/request.service';
import { getProtocolNamespace } from '../rest/types/model';
import { ClientManagerService } from './client-manager.service';
import { ClientComponent } from './client.component';
import { ConnectionState, ManagedClient, ManagedClientGroup } from './types';

/**
 * The maximum number of join/leave messages displayed at once.
 */
const MAX_MESSAGES = 3;

/**
 * Displays the number of users sharing a connection, along with transient
 * messages as users join and leave.
 */
@Component({
    selector: 'guac-client-user-count',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [TranslatePipe],
    host: { class: 'client-user-count' },
    template: `
        <span class="client-user-count-value">{{ client().userCount }}</span>
        <ul class="client-user-count-messages">
            @for (message of messages(); track message.id) {
                <li class="client-user-count-message" (animationend)="removeMessage(message.id)">{{ message.text }}</li>
            }
        </ul>
        <ul class="client-user-count-users">
            @for (user of sortedUsers(); track user.username) {
                <li class="client-user-count-user" [class.anonymous]="isAnonymous(user.username)">
                    {{ getUserCountTranslationKey(user.username) | translate: { USERNAME: user.username, COUNT: user.count } }}
                </li>
            }
        </ul>
    `
})
export class ClientUserCountComponent implements DoCheck {

    private readonly translationService = inject(TranslationService);

    readonly client = input.required<ManagedClient>();

    readonly messages = signal<{ id: number, text: string }[]>([]);

    /** The number of connections of each user, as of the last check. */
    private userCounts: Record<string, number> = {};

    private nextMessageId = 0;

    private readonly watchers = new Watchers();

    constructor() {

        // Reset tracked users when the client changes
        this.watchers.watch(() => this.client(), client => {
            this.userCounts = {};
            for (const [username, connections] of Object.entries(client.users))
                this.userCounts[username] = Object.keys(connections).length;
        });

        // Notify as users join and leave
        this.watchers.watch(() => this.client().userCount, (userCount, previous) => {

            if (previous === undefined)
                return;

            const users = this.client().users;
            for (const [username, connections] of Object.entries(users)) {
                const count = Object.keys(connections).length;
                const known = this.userCounts[username] || 0;
                if (count > known)
                    this.notify(username, true);
                else if (count < known)
                    this.notify(username, false);
                this.userCounts[username] = count;
            }

            for (const username of Object.keys(this.userCounts)) {
                if (!users[username]) {
                    this.notify(username, false);
                    delete this.userCounts[username];
                }
            }

        });

    }

    ngDoCheck(): void {
        this.watchers.check();
    }

    private notify(username: string, joined: boolean): void {

        const key = this.isAnonymous(username)
            ? (joined ? 'CLIENT.TEXT_ANONYMOUS_USER_JOINED' : 'CLIENT.TEXT_ANONYMOUS_USER_LEFT')
            : (joined ? 'CLIENT.TEXT_USER_JOINED' : 'CLIENT.TEXT_USER_LEFT');

        const message = { id: this.nextMessageId++, text: this.translationService.instant(key, { USERNAME: username }) };
        this.messages.update(messages => [message, ...messages].slice(0, MAX_MESSAGES));

    }

    removeMessage(id: number): void {
        this.messages.update(messages => messages.filter(message => message.id !== id));
    }

    sortedUsers(): { username: string, count: number }[] {
        return orderBy(Object.entries(this.userCounts).map(([username, count]) => ({ username, count })), 'username');
    }

    isAnonymous(username: string): boolean {
        return username === ANONYMOUS_USERNAME;
    }

    getUserCountTranslationKey(username: string): string {
        return this.isAnonymous(username) ? 'CLIENT.INFO_ANONYMOUS_USER_COUNT' : 'CLIENT.INFO_USER_COUNT';
    }

}

/**
 * All error codes for which automatic reconnection is appropriate when a
 * client error occurs.
 */
const CLIENT_AUTO_RECONNECT: Record<number, boolean> = {
    0x0200: true, 0x0202: true, 0x0203: true, 0x0207: true, 0x0208: true, 0x0301: true, 0x0308: true
};

/**
 * All error codes for which automatic reconnection is appropriate when a
 * tunnel error occurs.
 */
const TUNNEL_AUTO_RECONNECT: Record<number, boolean> = {
    0x0200: true, 0x0202: true, 0x0203: true, 0x0207: true, 0x0208: true, 0x0308: true
};

/**
 * Displays the connection status of a client, including errors, requests
 * for additional parameters, and options for reconnecting.
 */
@Component({
    selector: 'guac-client-notification',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [ModalComponent, NotificationComponent],
    host: { 'class': 'client-status-modal', '[class.shown]': 'status()' },
    template: `
        @if (status(); as status) {
            <guac-modal><guac-notification [notification]="status" /></guac-modal>
        }
    `
})
export class ClientNotificationComponent implements DoCheck {

    private readonly authenticationService = inject(AuthenticationService);
    private readonly clientManager = inject(ClientManagerService);
    private readonly requestService = inject(RequestService);
    private readonly router = inject(Router);
    private readonly translationService = inject(TranslationService);

    readonly client = input.required<ManagedClient>();

    readonly status = signal<Notification | null>(null);

    private readonly LOGOUT_ACTION: MenuAction = {
        name: 'CLIENT.ACTION_LOGOUT',
        className: 'logout button',
        callback: () => this.authenticationService.logout().catch(this.requestService.IGNORE)
    };

    private readonly RECONNECT_ACTION: MenuAction = {
        name: 'CLIENT.ACTION_RECONNECT',
        className: 'reconnect button',
        callback: () => {
            this.clientManager.replaceManagedClient(this.client().id);
            this.status.set(null);
        }
    };

    private readonly RECONNECT_COUNTDOWN: NotificationCountdown = {
        text: 'CLIENT.TEXT_RECONNECT_COUNTDOWN',
        callback: this.RECONNECT_ACTION.callback,
        remaining: 15
    };

    /** Action which returns the user to their home page, if applicable. */
    private navigateHomeAction: MenuAction | null = null;

    constructor() {

        inject(UserPageService).getHomePage().then(homePage => {
            if (this.router.url.split('?')[0] !== homePage.url) {
                this.navigateHomeAction = {
                    name: 'CLIENT.ACTION_NAVIGATE_HOME',
                    className: 'home button',
                    callback: () => this.router.navigateByUrl(homePage.url)
                };
            }
        }, this.requestService.WARN);

        const keyboardEvents = inject(KeyboardEventsService);
        const preventDuringNotification = (event: { preventDefault(): void }) => {
            if (this.status() && this.client().clientProperties.focused)
                event.preventDefault();
        };
        const subscriptions = [
            keyboardEvents.beforeKeydown.subscribe(preventDuringNotification),
            keyboardEvents.beforeKeyup.subscribe(preventDuringNotification)
        ];
        inject(DestroyRef).onDestroy(() => subscriptions.forEach(subscription => subscription.unsubscribe()));

    }

    /** The client state as of the last check. */
    private lastState: unknown[] = [];

    /**
     * Updates the displayed status whenever any relevant client state
     * changes.
     */
    ngDoCheck(): void {

        const client = this.client();
        const state = [client, client.clientState.connectionState, client.requiredParameters, client.protocol, client.forms];
        if (state.every((value, index) => value === this.lastState[index]))
            return;

        this.lastState = state;

        const connectionState = client.clientState.connectionState;
        if (client.requiredParameters && this.canSubmitParameters(connectionState))
            this.notifyParametersRequired(client.requiredParameters);
        else
            this.notifyConnectionState(connectionState);

    }

    private canSubmitParameters(connectionState: ConnectionState): boolean {
        return connectionState === ConnectionState.WAITING || connectionState === ConnectionState.CONNECTED;
    }

    /**
     * Displays the given notification once the current session has been
     * revalidated (the connection may have closed due to session expiry).
     */
    private notifyConnectionClosed(status: Notification): void {
        this.authenticationService.updateCurrentToken(getQueryParameters(this.router))
            .catch(this.requestService.IGNORE)
            .finally(() => this.status.set(status));
    }

    private notifyConnectionState(connectionState: ConnectionState): void {

        this.status.set(null);

        const actions = this.navigateHomeAction
            ? [this.navigateHomeAction, this.RECONNECT_ACTION, this.LOGOUT_ACTION]
            : [this.RECONNECT_ACTION, this.LOGOUT_ACTION];

        const statusCode = this.client().clientState.statusCode;

        switch (connectionState) {

            case ConnectionState.CONNECTING:
            case ConnectionState.WAITING:
                this.status.set({
                    className: 'connecting',
                    title: 'CLIENT.DIALOG_HEADER_CONNECTING',
                    text: { key: 'CLIENT.TEXT_CLIENT_STATUS_' + connectionState.toUpperCase() }
                });
                break;

            case ConnectionState.CLIENT_ERROR:
            case ConnectionState.TUNNEL_ERROR: {

                const isClientError = connectionState === ConnectionState.CLIENT_ERROR;
                const errorPrefix = isClientError ? 'CLIENT.ERROR_CLIENT_' : 'CLIENT.ERROR_TUNNEL_';
                const autoReconnect = isClientError ? CLIENT_AUTO_RECONNECT : TUNNEL_AUTO_RECONNECT;

                this.notifyConnectionClosed({
                    className: 'error',
                    title: 'CLIENT.DIALOG_HEADER_CONNECTION_ERROR',
                    text: {
                        key: this.translationService.withFallback(
                            errorPrefix + statusCode.toString(16).toUpperCase(), errorPrefix + 'DEFAULT')
                    },
                    countdown: (statusCode in autoReconnect) ? { ...this.RECONNECT_COUNTDOWN } : undefined,
                    actions
                });
                break;

            }

            case ConnectionState.DISCONNECTED:
                this.notifyConnectionClosed({
                    title: 'CLIENT.DIALOG_HEADER_DISCONNECTED',
                    text: { key: 'CLIENT.TEXT_CLIENT_STATUS_' + connectionState.toUpperCase() },
                    actions
                });
                break;

        }

    }

    private notifyParametersRequired(requiredParameters: Record<string, string>): void {

        const client = this.client();
        if (!client.protocol || !client.forms)
            return;

        const submit = () => {
            const params = client.requiredParameters;
            client.requiredParameters = null;
            if (params)
                client.sendArguments(params);
        };

        this.status.set({
            className: 'parameters-required',
            formNamespace: getProtocolNamespace(client.protocol) ?? undefined,
            forms: client.forms,
            formModel: requiredParameters,
            formSubmitCallback: submit,
            actions: [
                { name: 'CLIENT.ACTION_CONTINUE', className: 'button', callback: submit },
                {
                    name: 'CLIENT.ACTION_CANCEL',
                    className: 'button',
                    callback: () => {
                        client.requiredParameters = null;
                        client.client.disconnect();
                    }
                }
            ]
        });

    }

}

/**
 * Displays all clients of a group as tiles. Clicking a tile focuses that
 * client; shift-clicking and ctrl-clicking focus multiple clients, such
 * that input is broadcast to all focused clients.
 */
@Component({
    selector: 'guac-tiled-clients',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [ClickDirective, ClientComponent, ClientNotificationComponent, ClientUserCountComponent,
        PatchPointDirective, TranslatePipe],
    template: `
        <div class="tiled-client-grid">
            @for (clientRow of getClientGrid(); track $index) {
                <div class="tiled-client-row">
                    @for (client of clientRow; track $index) {
                        <div class="tiled-client-cell">
                            @if (client) {
                                <div class="client-tile" [class.focused]="client.clientProperties.focused"
                                     [class.shared]="client.isShared()" [class.joined]="client.userCount"
                                     (guacClick)="assignFocus(client, $event.shift, $event.ctrl)">

                                    @if (hasMultipleClients()) {
                                        <h3 class="client-tile-header">
                                            <img class="client-tile-shared-indicator" src="images/share-white.svg">
                                            <span class="client-tile-name">{{ client.title }}</span>
                                            <guac-client-user-count [client]="client" />
                                            <img (click)="closeClient.emit(client)" class="client-tile-disconnect"
                                                 [alt]="'CLIENT.ACTION_DISCONNECT' | translate"
                                                 [title]="'CLIENT.ACTION_DISCONNECT' | translate" src="images/x.svg">
                                        </h3>
                                    }

                                    <guac-client [client]="client" [emulateAbsoluteMouse]="emulateAbsoluteMouse()"
                                                 [guacPatchPoint]="{ client }" />

                                    <guac-client-notification [client]="client" />

                                    @if (!hasMultipleClients()) {
                                        <guac-client-user-count [client]="client" />
                                    }

                                </div>
                            }
                        </div>
                    }
                </div>
            }
        </div>
    `
})
export class TiledClientsComponent implements DoCheck {

    readonly clientGroup = input.required<ManagedClientGroup>();

    readonly emulateAbsoluteMouse = input<boolean>(true);

    /** Emits when the user requests that a client be closed. */
    readonly closeClient = output<ManagedClient>();

    /**
     * Emits the focused client whenever it changes, or null if zero or
     * multiple clients are focused.
     */
    readonly focusedClientChange = output<ManagedClient | null>();

    private lastFocusedClient: ManagedClient | null | undefined = undefined;

    ngDoCheck(): void {
        const focused = this.getFocusedClient();
        if (focused !== this.lastFocusedClient) {
            this.lastFocusedClient = focused;
            queueMicrotask(() => this.focusedClientChange.emit(focused));
        }
    }

    /**
     * Returns the single focused client, or null if zero or multiple clients
     * are focused.
     */
    getFocusedClient(): ManagedClient | null {
        const focused = this.clientGroup().clients.filter(client => client.clientProperties.focused);
        return focused.length === 1 ? focused[0] : null;
    }

    getClientGrid(): (ManagedClient | null)[][] {
        return ManagedClientGroup.getClientGrid(this.clientGroup());
    }

    hasMultipleClients(): boolean {
        return ManagedClientGroup.hasMultipleClients(this.clientGroup());
    }

    /**
     * Updates focus in response to the given client being clicked. Holding
     * ctrl adds the client to the focused clients, while holding shift
     * focuses the rectangular region of clients containing all focused
     * clients.
     */
    assignFocus(client: ManagedClient, shift: boolean, ctrl: boolean): void {

        const group = this.clientGroup();

        // Clear focus of all other clients if not selecting multiple
        if (!shift && !ctrl)
            group.clients.forEach(other => other.clientProperties.focused = false);

        client.clientProperties.focused = true;

        // Fill in any gaps if performing rectangular multi-selection
        if (shift) {

            let minRow = group.rows - 1;
            let minColumn = group.columns - 1;
            let maxRow = 0;
            let maxColumn = 0;

            const grid = ManagedClientGroup.getClientGrid(group);
            grid.forEach((row, rowIndex) => row.forEach((other, column) => {
                if (other?.clientProperties.focused) {
                    minRow = Math.min(minRow, rowIndex);
                    minColumn = Math.min(minColumn, column);
                    maxRow = Math.max(maxRow, rowIndex);
                    maxColumn = Math.max(maxColumn, column);
                }
            }));

            grid.forEach((row, rowIndex) => row.forEach((other, column) => {
                if (other)
                    other.clientProperties.focused = rowIndex >= minRow && rowIndex <= maxRow
                        && column >= minColumn && column <= maxColumn;
            }));

        }

    }

}
