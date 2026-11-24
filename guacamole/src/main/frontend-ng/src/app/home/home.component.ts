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

import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AuthenticationService } from '../auth/authentication.service';
import { GroupListFilterComponent } from '../group-list/group-list-filter.component';
import { GroupListItem } from '../group-list/group-list-item';
import { GroupListComponent } from '../group-list/group-list.component';
import { TranslatePipe } from '../locale/translate.pipe';
import { UserMenuComponent } from '../navigation/user-menu.component';
import { ConnectionGroupService } from '../rest/connection.services';
import { DataSourceService } from '../rest/data-source.service';
import { RequestService } from '../rest/request.service';
import { ConnectionGroup, ROOT_CONNECTION_GROUP } from '../rest/types/model';
import { PatchPointDirective } from '../extension/patches';
import { PreferenceService } from '../settings/preference.service';
import { RecentConnectionsComponent } from './recent-connections.component';

/**
 * The home page, listing recent connections and all connections available
 * to the current user.
 */
@Component({
    selector: 'guac-home',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [GroupListComponent, GroupListFilterComponent, PatchPointDirective,
        RecentConnectionsComponent, TranslatePipe, UserMenuComponent],
    host: { 'class': 'home-view view', '[class.loading]': '!rootConnectionGroups()' },
    template: `
        <div class="connection-list-ui">

            @if (preferences.showRecentConnections) {
                <div class="header">
                    <h2 id="section-header-recent-connections">{{ 'HOME.SECTION_HEADER_RECENT_CONNECTIONS' | translate }}</h2>
                    <guac-user-menu />
                </div>
                <guac-recent-connections [rootGroups]="rootConnectionGroups()" />
            }

            <div class="header">
                <h2 id="section-header-all-connections">{{ 'HOME.SECTION_HEADER_ALL_CONNECTIONS' | translate }}</h2>
                <guac-group-list-filter [connectionGroups]="rootConnectionGroups()"
                                        [(filteredConnectionGroups)]="filteredRootConnectionGroups"
                                        [placeholder]="'HOME.FIELD_PLACEHOLDER_FILTER' | translate" />
                <guac-user-menu />
            </div>

            <div class="all-connections" guacPatchPoint>
                <guac-group-list [connectionGroups]="filteredRootConnectionGroups()" [pageSize]="20"
                                 [templates]="{ 'connection': connection, 'connection-group': connectionGroup }" />
            </div>

        </div>

        <ng-template #connection let-item>
            <a class="home-connection" [attr.href]="item.getClientURL()" [class.active]="item.getActiveConnections()"
               [guacPatchPoint]="{ item }">
                <div class="icon type" [class]="item.protocol"></div>
                <span class="name">{{ item.name }}</span>
                @if (item.getActiveConnections()) {
                    <span class="activeUserCount">{{ 'HOME.INFO_ACTIVE_USER_COUNT' | translate: { USERS: item.getActiveConnections() } }}</span>
                }
            </a>
        </ng-template>

        <ng-template #connectionGroup let-item>
            <a class="home-connection-group" [attr.href]="item.getClientURL()">
                @if (item.balancing) {
                    <div class="icon type balancer"></div>
                }
                <span class="name">{{ item.name }}</span>
                @if (item.balancing && item.getEffectiveMaxConnections() !== null) {
                    <span class="activeUserCount">{{ 'HOME.INFO_AVAILABLE_CONNECTIONS' | translate: {
                        AVAILABLE: item.getAvailableConnections(), TOTAL: item.getEffectiveMaxConnections() } }}</span>
                }
            </a>
        </ng-template>
    `
})
export class HomeComponent {

    protected readonly preferences = inject(PreferenceService).preferences;

    readonly rootConnectionGroups = signal<Record<string, ConnectionGroup> | null>(null);

    readonly filteredRootConnectionGroups = signal<Record<string, ConnectionGroup | GroupListItem>>({});

    constructor() {

        const authenticationService = inject(AuthenticationService);
        const connectionGroupService = inject(ConnectionGroupService);

        inject(DataSourceService).apply(
            (dataSource, id) => connectionGroupService.getConnectionGroupTree(dataSource, id),
            authenticationService.getAvailableDataSources(),
            ROOT_CONNECTION_GROUP
        ).then(rootGroups => this.rootConnectionGroups.set(rootGroups), inject(RequestService).DIE);

    }

}
