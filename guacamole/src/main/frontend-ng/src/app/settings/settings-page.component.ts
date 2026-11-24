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
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { TranslatePipe } from '../locale/translate.pipe';
import { PageDefinition } from '../navigation/page-definition';
import { PageListComponent } from '../navigation/page-list.component';
import { UserMenuComponent } from '../navigation/user-menu.component';
import { UserPageService } from '../navigation/user-page.service';
import { SettingsConnectionHistoryComponent } from './settings-connection-history.component';
import { SettingsConnectionsComponent } from './settings-connections.component';
import { SettingsPreferencesComponent } from './settings-preferences.component';
import { SettingsSessionsComponent } from './settings-sessions.component';
import { SettingsUserGroupsComponent, SettingsUsersComponent } from './settings-users.component';

/**
 * The settings page, displaying the settings tab named within the URL.
 */
@Component({
    selector: 'guac-settings-page',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [PageListComponent, SettingsConnectionHistoryComponent, SettingsConnectionsComponent,
        SettingsPreferencesComponent, SettingsSessionsComponent, SettingsUserGroupsComponent,
        SettingsUsersComponent, TranslatePipe, UserMenuComponent],
    host: { class: 'settings-view view' },
    template: `
        <div class="header tabbed">
            <h2>{{ 'SETTINGS.SECTION_HEADER_SETTINGS' | translate }}</h2>
            <guac-user-menu />
        </div>

        <div class="page-tabs">
            <guac-page-list [pages]="settingsPages()" />
        </div>

        @switch (params().tab) {
            @case ('users') { <guac-settings-users /> }
            @case ('userGroups') { <guac-settings-user-groups /> }
            @case ('connections') { <guac-settings-connections [dataSource]="params().dataSource!" /> }
            @case ('history') { <guac-settings-connection-history [dataSource]="params().dataSource!" /> }
            @case ('sessions') { <guac-settings-sessions /> }
            @case ('preferences') { <guac-settings-preferences /> }
        }
    `
})
export class SettingsPageComponent {

    readonly settingsPages = signal<PageDefinition[] | null>(null);

    /** The tab and data source specified within the URL. */
    readonly params = toSignal(inject(ActivatedRoute).paramMap.pipe(map(params => ({
        tab: params.get('tab'),
        dataSource: params.get('dataSource')
    }))), { requireSync: true });

    constructor() {
        inject(UserPageService).getSettingsPages().then(pages => this.settingsPages.set(pages), () => {});
    }

}
