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

import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toCsvBlob, saveBlob } from '../element/download';
import { tokenizeFilter } from '../list/filter-pattern';
import { PagerComponent, SortOrderDirective, UserItemComponent } from '../list/list.components';
import { SortOrder, orderBy } from '../list/sort-order';
import { GuacDatePipe, formatGuacDate } from '../locale/date.pipe';
import { TranslatePipe } from '../locale/translate.pipe';
import { TranslationService } from '../locale/translation.service';
import { HistoryService } from '../rest/connection.services';
import { RequestService } from '../rest/request.service';
import { ActivityLogType, ConnectionHistoryEntry, Duration } from '../rest/types/model';
import { TranslatableMessage } from '../rest/types/translatable-message';

/**
 * A connection history entry along with the information needed to display
 * it.
 */
export class ConnectionHistoryEntryWrapper {

    /** The duration of the connection, in milliseconds. */
    readonly duration: number;

    readonly readableDuration: Duration | null = null;

    /** The translation key of the text describing the duration. */
    readonly readableDurationText: string;

    /** The session recording associated with the entry, if any. */
    readonly sessionRecording: { url: string, description: TranslatableMessage } | null = null;

    constructor(dataSource: string, readonly entry: ConnectionHistoryEntry) {

        this.duration = (entry.endDate ?? 0) - entry.startDate;

        if (entry.endDate && entry.startDate)
            this.readableDuration = new Duration(this.duration);

        this.readableDurationText = entry.endDate
            ? 'SETTINGS_CONNECTION_HISTORY.TEXT_HISTORY_DURATION'
            : 'SETTINGS_CONNECTION_HISTORY.INFO_CONNECTION_DURATION_UNKNOWN';

        const name = Object.keys(entry.logs || {})
            .find(key => entry.logs![key].type === ActivityLogType.GUACAMOLE_SESSION_RECORDING);

        if (entry.identifier && name) {
            this.sessionRecording = {
                url: '#/settings/' + encodeURIComponent(dataSource)
                    + '/recording/' + encodeURIComponent(entry.identifier)
                    + '/' + encodeURIComponent(name),
                description: entry.logs![name].description
            };
        }

    }

}

/**
 * Sort predicates which are supported by the REST API, mapped from their
 * equivalent client-side predicates.
 */
const API_SORT_PROPERTIES: Record<string, string> = {
    'entry.startDate': 'startDate',
    '-entry.startDate': '-startDate'
};

/**
 * Searches and displays the connection history of a data source.
 */
@Component({
    selector: 'guac-settings-connection-history',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, GuacDatePipe, PagerComponent, SortOrderDirective, TranslatePipe, UserItemComponent],
    host: { class: 'settings section connectionHistory' },
    template: `
        <p>{{ 'SETTINGS_CONNECTION_HISTORY.HELP_CONNECTION_HISTORY' | translate }}</p>

        <form class="filter" (ngSubmit)="search()">
            <input class="search-string" type="text" name="search" [(ngModel)]="searchString"
                   [placeholder]="'SETTINGS_CONNECTION_HISTORY.FIELD_PLACEHOLDER_FILTER' | translate">
            <input class="search-button" type="submit" [value]="'SETTINGS_CONNECTION_HISTORY.ACTION_SEARCH' | translate">
            <button type="button" (click)="downloadCSV()">{{ 'SETTINGS_CONNECTION_HISTORY.ACTION_DOWNLOAD' | translate }}</button>
        </form>

        <div class="results">
            <table class="sorted history-list">
                <thead>
                    <tr>
                        <th [guacSortOrder]="order" guacSortProperty="entry.username">{{ 'SETTINGS_CONNECTION_HISTORY.TABLE_HEADER_SESSION_USERNAME' | translate }}</th>
                        <th [guacSortOrder]="order" guacSortProperty="entry.startDate">{{ 'SETTINGS_CONNECTION_HISTORY.TABLE_HEADER_SESSION_STARTDATE' | translate }}</th>
                        <th [guacSortOrder]="order" guacSortProperty="duration">{{ 'SETTINGS_CONNECTION_HISTORY.TABLE_HEADER_SESSION_DURATION' | translate }}</th>
                        <th [guacSortOrder]="order" guacSortProperty="entry.connectionName">{{ 'SETTINGS_CONNECTION_HISTORY.TABLE_HEADER_SESSION_CONNECTION_NAME' | translate }}</th>
                        <th [guacSortOrder]="order" guacSortProperty="entry.remoteHost">{{ 'SETTINGS_CONNECTION_HISTORY.TABLE_HEADER_SESSION_REMOTEHOST' | translate }}</th>
                        <th>{{ 'SETTINGS_CONNECTION_HISTORY.TABLE_HEADER_SESSION_LOGS' | translate }}</th>
                    </tr>
                </thead>
                <tbody [class.loading]="!wrappers()">
                    @for (wrapper of page(); track wrapper) {
                        <tr class="history">
                            <td><guac-user-item [username]="wrapper.entry.username" /></td>
                            <td>{{ wrapper.entry.startDate | guacDate: 'SETTINGS_CONNECTION_HISTORY.FORMAT_DATE' }}</td>
                            <td>{{ wrapper.readableDurationText | translate: { VALUE: wrapper.readableDuration?.value, UNIT: wrapper.readableDuration?.unit } }}</td>
                            <td>{{ wrapper.entry.connectionName }}</td>
                            <td>{{ wrapper.entry.remoteHost }}</td>
                            <td>
                                @if (wrapper.sessionRecording; as recording) {
                                    <a class="history-session-recording" [href]="recording.url"
                                       [title]="recording.description | translate">
                                        <span class="history-action-description">{{ 'SETTINGS_CONNECTION_HISTORY.ACTION_VIEW_RECORDING' | translate }}</span>
                                    </a>
                                }
                            </td>
                        </tr>
                    }
                </tbody>
            </table>

            @if (wrappers()?.length === 0) {
                <p class="placeholder">{{ 'SETTINGS_CONNECTION_HISTORY.INFO_NO_HISTORY' | translate }}</p>
            }

            <guac-pager [(page)]="page" [pageSize]="25" [items]="sorted()" />
        </div>
    `
})
export class SettingsConnectionHistoryComponent {

    private readonly historyService = inject(HistoryService);
    private readonly requestService = inject(RequestService);
    private readonly translationService = inject(TranslationService);

    readonly dataSource = input.required<string>();

    readonly wrappers = signal<ConnectionHistoryEntryWrapper[] | null>(null);
    readonly page = signal<ConnectionHistoryEntryWrapper[]>([]);

    searchString = '';

    readonly order = new SortOrder(['-entry.startDate', '-duration', 'entry.username',
        'entry.connectionName', 'entry.remoteHost']);

    readonly sorted = computed(() => orderBy(this.wrappers(), this.order.predicate));

    constructor() {
        effect(() => {
            this.dataSource();
            untracked(() => this.search());
        });
    }

    /**
     * Retrieves the history entries which contain all tokens of the current
     * search string.
     */
    search(): void {

        this.wrappers.set(null);

        const requiredContents = tokenizeFilter(this.searchString)
            .map(token => token.type === 'LITERAL' ? token.value : token.consumed);

        const sortPredicate = this.order.predicate
            .map(name => API_SORT_PROPERTIES[name])
            .filter(name => !!name);

        const dataSource = this.dataSource();
        this.historyService.getConnectionHistory(dataSource, requiredContents, sortPredicate)
            .then(entries => this.wrappers.set(entries.map(entry => new ConnectionHistoryEntryWrapper(dataSource, entry))),
                this.requestService.DIE);

    }

    /**
     * Downloads the current search results as a CSV file.
     */
    downloadCSV(): void {

        const t = (key: string) => this.translationService.instant('SETTINGS_CONNECTION_HISTORY.' + key);
        const format = t('FORMAT_DATE');

        const records: unknown[][] = [[
            t('TABLE_HEADER_SESSION_USERNAME'),
            t('TABLE_HEADER_SESSION_STARTDATE'),
            t('TABLE_HEADER_SESSION_DURATION'),
            t('TABLE_HEADER_SESSION_CONNECTION_NAME'),
            t('TABLE_HEADER_SESSION_REMOTEHOST')
        ]];

        for (const wrapper of this.sorted()) {
            records.push([
                wrapper.entry.username,
                formatGuacDate(wrapper.entry.startDate, format),
                wrapper.duration / 1000,
                wrapper.entry.connectionName,
                wrapper.entry.remoteHost
            ]);
        }

        saveBlob(toCsvBlob(records), t('FILENAME_HISTORY_CSV'));

    }

}
