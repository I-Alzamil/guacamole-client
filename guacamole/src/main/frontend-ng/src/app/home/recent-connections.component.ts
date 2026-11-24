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

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { HistoryEntry, HistoryService } from '../history/history.service';
import { TranslatePipe } from '../locale/translate.pipe';
import { ClientIdentifierType, clientIdentifierToString } from '../navigation/client-identifier';
import { Connection, ConnectionGroup } from '../rest/types/model';

/**
 * A recently-used connection which the current user can still access.
 */
interface RecentConnection {
    name?: string;
    entry: HistoryEntry;
}

/**
 * Displays thumbnails of recently-used connections.
 */
@Component({
    selector: 'guac-recent-connections',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [TranslatePipe],
    host: { class: 'recent-connections' },
    template: `
        @if (!recentConnections().length) {
            <p class="placeholder">{{ 'HOME.INFO_NO_RECENT_CONNECTIONS' | translate }}</p>
        }

        @for (recentConnection of recentConnections(); track recentConnection.entry.id) {
            <div class="connection">
                <a [href]="'#/client/' + recentConnection.entry.id">
                    <div class="thumbnail">
                        <img [alt]="recentConnection.name" [src]="recentConnection.entry.thumbnail">
                    </div>
                    <div class="caption">
                        <span class="name">{{ recentConnection.name }}</span>
                    </div>
                </a>
                <div class="remove-recent" (click)="historyService.removeEntry(recentConnection.entry.id)"></div>
            </div>
        }
    `
})
export class RecentConnectionsComponent {

    protected readonly historyService = inject(HistoryService);

    /** The root connection group of each data source. */
    readonly rootGroups = input<Record<string, ConnectionGroup> | null>();

    /**
     * All connections and connection groups visible to the current user,
     * keyed by client identifier.
     */
    private readonly visibleObjects = computed(() => {

        const visibleObjects: Record<string, Connection | ConnectionGroup> = {};

        const addConnection = (dataSource: string, connection: Connection) => {
            visibleObjects[clientIdentifierToString({
                dataSource, type: ClientIdentifierType.CONNECTION, id: connection.identifier!
            })] = connection;
        };

        const addConnectionGroup = (dataSource: string, connectionGroup: ConnectionGroup) => {
            visibleObjects[clientIdentifierToString({
                dataSource, type: ClientIdentifierType.CONNECTION_GROUP, id: connectionGroup.identifier!
            })] = connectionGroup;
            connectionGroup.childConnections?.forEach(child => addConnection(dataSource, child));
            connectionGroup.childConnectionGroups?.forEach(child => addConnectionGroup(dataSource, child));
        };

        for (const [dataSource, rootGroup] of Object.entries(this.rootGroups() || {}))
            addConnectionGroup(dataSource, rootGroup);

        return visibleObjects;

    });

    /**
     * Recent connections which are still visible to the current user.
     */
    readonly recentConnections = computed<RecentConnection[]>(() => {
        const visibleObjects = this.visibleObjects();
        return this.historyService.recentConnections()
            .filter(entry => entry.id in visibleObjects)
            .map(entry => ({ name: visibleObjects[entry.id].name, entry }));
    });

}
