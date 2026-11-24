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

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthenticationService } from '../auth/authentication.service';
import { FilterComponent, PagerComponent, SortOrderDirective, UserItemComponent } from '../list/list.components';
import { SortOrder, orderBy } from '../list/sort-order';
import { formatGuacDate } from '../locale/date.pipe';
import { TranslatePipe } from '../locale/translate.pipe';
import { TranslationService } from '../locale/translation.service';
import { ClientIdentifierType, clientIdentifierToString } from '../navigation/client-identifier';
import { NotificationService } from '../notification/notification.service';
import { ActiveConnectionService, ConnectionGroupService } from '../rest/connection.services';
import { DataSourceService } from '../rest/data-source.service';
import { RequestService } from '../rest/request.service';
import { ActiveConnection, Connection, ConnectionGroup, ROOT_CONNECTION_GROUP } from '../rest/types/model';

/**
 * An active connection along with the information needed to display it.
 */
interface ActiveConnectionWrapper {
    dataSource: string;
    name?: string;
    startDate: string;
    activeConnection: ActiveConnection;
    checked: boolean;
}

/**
 * Lists all active sessions visible to the current user, allowing those
 * sessions to be killed.
 */
@Component({
    selector: 'guac-settings-sessions',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FilterComponent, FormsModule, PagerComponent, SortOrderDirective, TranslatePipe, UserItemComponent],
    host: { 'class': 'settings section sessions', '[class.loading]': '!wrappers()' },
    template: `
        <p>{{ 'SETTINGS_SESSIONS.HELP_SESSIONS' | translate }}</p>

        <div class="action-buttons">
            <button class="delete-sessions danger" [disabled]="!canDeleteSessions()" (click)="deleteSessions()">
                {{ 'SETTINGS_SESSIONS.ACTION_DELETE' | translate }}</button>
        </div>

        <guac-filter [items]="wrappers()" [(filteredItems)]="filteredWrappers" [properties]="filteredProperties"
                     [placeholder]="'SETTINGS_SESSIONS.FIELD_PLACEHOLDER_FILTER' | translate" />

        <table class="sorted session-list">
            <thead>
                <tr>
                    <th class="select-session"></th>
                    <th [guacSortOrder]="order" guacSortProperty="activeConnection.username">{{ 'SETTINGS_SESSIONS.TABLE_HEADER_SESSION_USERNAME' | translate }}</th>
                    <th [guacSortOrder]="order" guacSortProperty="startDate">{{ 'SETTINGS_SESSIONS.TABLE_HEADER_SESSION_STARTDATE' | translate }}</th>
                    <th [guacSortOrder]="order" guacSortProperty="activeConnection.remoteHost">{{ 'SETTINGS_SESSIONS.TABLE_HEADER_SESSION_REMOTEHOST' | translate }}</th>
                    <th [guacSortOrder]="order" guacSortProperty="name">{{ 'SETTINGS_SESSIONS.TABLE_HEADER_SESSION_CONNECTION_NAME' | translate }}</th>
                </tr>
            </thead>
            <tbody>
                @for (wrapper of wrapperPage(); track wrapper.activeConnection.identifier) {
                    <tr class="session">
                        <td class="select-session"><input type="checkbox" [(ngModel)]="wrapper.checked"></td>
                        <td><guac-user-item [username]="wrapper.activeConnection.username" /></td>
                        <td>{{ wrapper.startDate }}</td>
                        <td>{{ wrapper.activeConnection.remoteHost }}</td>
                        <td><a [attr.href]="getClientURL(wrapper)">{{ wrapper.name }}</a></td>
                    </tr>
                }
            </tbody>
        </table>

        @if (!wrapperPage().length) {
            <p class="placeholder">{{ 'SETTINGS_SESSIONS.INFO_NO_SESSIONS' | translate }}</p>
        }

        <guac-pager [(page)]="wrapperPage" [pageSize]="25" [items]="sortedWrappers()" />
    `
})
export class SettingsSessionsComponent {

    private readonly activeConnectionService = inject(ActiveConnectionService);
    private readonly notificationService = inject(NotificationService);
    private readonly translationService = inject(TranslationService);

    readonly wrappers = signal<ActiveConnectionWrapper[] | null>(null);
    readonly filteredWrappers = signal<ActiveConnectionWrapper[]>([]);
    readonly wrapperPage = signal<ActiveConnectionWrapper[]>([]);

    readonly order = new SortOrder(['activeConnection.username', 'startDate', 'activeConnection.remoteHost', 'name']);
    readonly filteredProperties = ['activeConnection.username', 'startDate', 'activeConnection.remoteHost', 'name'];

    readonly sortedWrappers = computed(() => orderBy(this.filteredWrappers(), this.order.predicate));

    constructor() {

        const dataSources = inject(AuthenticationService).getAvailableDataSources();
        const dataSourceService = inject(DataSourceService);
        const connectionGroupService = inject(ConnectionGroupService);
        const requestService = inject(RequestService);

        Promise.all([
            dataSourceService.apply((dataSource, id) => connectionGroupService.getConnectionGroupTree(dataSource, id),
                dataSources, ROOT_CONNECTION_GROUP),
            dataSourceService.apply(dataSource => this.activeConnectionService.getActiveConnections(dataSource), dataSources)
        ]).then(([rootGroups, allActiveConnections]) => {

            // Map all connections by data source and identifier
            const allConnections: Record<string, Record<string, Connection>> = {};
            const addDescendants = (connections: Record<string, Connection>, group: ConnectionGroup) => {
                group.childConnections?.forEach(connection => connections[connection.identifier!] = connection);
                group.childConnectionGroups?.forEach(child => addDescendants(connections, child));
            };
            for (const [dataSource, rootGroup] of Object.entries(rootGroups))
                addDescendants(allConnections[dataSource] = {}, rootGroup);

            const format = this.translationService.instant('SETTINGS_SESSIONS.FORMAT_STARTDATE');
            const wrappers: ActiveConnectionWrapper[] = [];
            for (const [dataSource, activeConnections] of Object.entries(allActiveConnections)) {
                for (const activeConnection of Object.values(activeConnections)) {
                    // Sessions without a username are not shown
                    if (activeConnection.username === null)
                        continue;
                    wrappers.push({
                        dataSource,
                        name: allConnections[dataSource]?.[activeConnection.connectionIdentifier]?.name,
                        startDate: formatGuacDate(activeConnection.startDate, format),
                        activeConnection,
                        checked: false
                    });
                }
            }

            this.wrappers.set(wrappers);

        }, requestService.DIE);

    }

    getClientURL(wrapper: ActiveConnectionWrapper): string | null {
        if (!wrapper.activeConnection.connectable)
            return null;
        return '#/client/' + encodeURIComponent(clientIdentifierToString({
            dataSource: wrapper.dataSource,
            type: ClientIdentifierType.ACTIVE_CONNECTION,
            id: wrapper.activeConnection.identifier
        }));
    }

    canDeleteSessions(): boolean {
        return !!this.wrappers()?.some(wrapper => wrapper.checked);
    }

    /**
     * Prompts for confirmation before killing all selected sessions.
     */
    deleteSessions(): void {
        this.notificationService.showStatus({
            title: 'SETTINGS_SESSIONS.DIALOG_HEADER_CONFIRM_DELETE',
            text: { key: 'SETTINGS_SESSIONS.TEXT_CONFIRM_DELETE' },
            actions: [
                {
                    name: 'SETTINGS_SESSIONS.ACTION_DELETE',
                    className: 'danger',
                    callback: () => {
                        this.deleteSelectedSessions();
                        this.notificationService.showStatus(false);
                    }
                },
                { name: 'SETTINGS_SESSIONS.ACTION_CANCEL', callback: () => this.notificationService.showStatus(false) }
            ]
        });
    }

    private deleteSelectedSessions(): void {

        const selected = (this.wrappers() || []).filter(wrapper => wrapper.checked);

        const byDataSource: Record<string, string[]> = {};
        for (const wrapper of selected)
            (byDataSource[wrapper.dataSource] ??= []).push(wrapper.activeConnection.identifier);

        Promise.all(Object.entries(byDataSource).map(([dataSource, identifiers]) =>
            this.activeConnectionService.deleteActiveConnections(dataSource, identifiers)))
            .then(() => this.wrappers.update(wrappers => (wrappers || []).filter(wrapper => !selected.includes(wrapper))),
                this.notificationService.SHOW_REQUEST_ERROR);

    }

}
