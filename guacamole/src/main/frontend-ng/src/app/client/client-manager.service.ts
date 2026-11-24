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

import { Injectable, inject } from '@angular/core';
import { filter } from 'rxjs';
import { AuthenticationService } from '../auth/authentication.service';
import { ManagedClientService } from './managed-client.service';
import { ConnectionState, ManagedClient, ManagedClientGroup } from './types';

/**
 * Service which manages all clients and client groups of the current
 * session. Clients persist across navigation (allowing users to switch
 * between connections) and are disconnected upon logout.
 */
@Injectable({ providedIn: 'root' })
export class ClientManagerService {

    private readonly managedClientService = inject(ManagedClientService);

    private managedClients: Record<string, ManagedClient> = {};

    private managedClientGroups: ManagedClientGroup[] = [];

    constructor() {

        // Clients are specific to the current session
        inject(AuthenticationService).events
            .pipe(filter(event => event.type === 'login' || event.type === 'logout'))
            .subscribe(() => this.clear());

        // Disconnect all clients when window is unloaded, warning the user
        // beforehand if any clients are active
        window.addEventListener('pagehide', () => this.clear());
        window.addEventListener('beforeunload', (e) => {
            if (Object.keys(this.managedClients).length > 0) {
                e.preventDefault();
                e.returnValue = true;
            }
        });

    }

    /**
     * Returns all managed clients, keyed by client identifier.
     */
    getManagedClients(): Record<string, ManagedClient> {
        return this.managedClients;
    }

    /**
     * Returns all client groups, in no particular order.
     */
    getManagedClientGroups(): ManagedClientGroup[] {
        return this.managedClientGroups;
    }

    /**
     * Returns whether any client is connecting or connected.
     */
    hasActiveTunnel(): boolean {
        return Object.values(this.managedClients).some(client => {
            switch (client.clientState.connectionState) {
                case ConnectionState.CONNECTING:
                case ConnectionState.WAITING:
                case ConnectionState.CONNECTED:
                    return true;
            }
            return false;
        });
    }

    /**
     * Removes the client having the given identifier from all groups,
     * removing any groups which become empty.
     */
    private ungroupManagedClient(id: string): void {

        for (const group of this.managedClientGroups) {

            const removed = group.clients.filter(client => client.id === id);
            if (!removed.length)
                continue;

            group.clients = group.clients.filter(client => client.id !== id);

            // Clients removed from groups which are not currently displayed
            // must lose focus, as they will next be displayed elsewhere
            if (!group.attached)
                removed.forEach(client => client.clientProperties.focused = false);

            ManagedClientGroup.recalculateTiles(group);

        }

        this.managedClientGroups = this.managedClientGroups.filter(group => group.clients.length);

    }

    /**
     * Disconnects and removes the client having the given identifier,
     * returning whether such a client existed.
     */
    removeManagedClient(id: string): boolean {

        const client = this.managedClients[id];
        if (!client)
            return false;

        this.ungroupManagedClient(id);
        client.client.disconnect();
        delete this.managedClients[id];
        return true;

    }

    /**
     * Disconnects and replaces the client having the given identifier with
     * a new client (for reconnecting), preserving its position within any
     * groups.
     */
    replaceManagedClient(id: string): ManagedClient | undefined {

        const existing = this.managedClients[id];
        if (!existing)
            return undefined;

        const hadFocus = existing.clientProperties.focused;
        existing.client.disconnect();
        delete this.managedClients[id];

        for (const group of this.managedClientGroups) {
            const index = group.clients.findIndex(client => client.id === id);
            if (index === -1)
                continue;
            const replacement = this.managedClients[id] = this.managedClientService.getInstance(id);
            replacement.clientProperties.focused = hadFocus;
            group.clients[index] = replacement;
        }

        return this.managedClients[id];

    }

    /**
     * Returns the client having the given identifier, creating it if
     * necessary. The client is removed from any existing group.
     */
    getManagedClient(id: string): ManagedClient {
        this.ungroupManagedClient(id);
        return this.managedClients[id] ??= this.managedClientService.getInstance(id);
    }

    /**
     * Returns the client group having the given identifier, creating it (and
     * its clients) if necessary.
     */
    getManagedClientGroup(id: string): ManagedClientGroup {

        const existingGroup = this.managedClientGroups.find(group => id === ManagedClientGroup.getIdentifier(group));
        if (existingGroup)
            return existingGroup;

        const clients = ManagedClientGroup.getClientIdentifiers(id).map(clientId => this.getManagedClient(clientId));

        const group = new ManagedClientGroup(clients);
        ManagedClientGroup.verifyFocus(group);
        this.managedClientGroups.push(group);
        return group;

    }

    /**
     * Disconnects and removes the group having the given identifier and all
     * its clients, returning whether such a group existed.
     */
    removeManagedClientGroup(id: string): boolean {

        const removed = this.managedClientGroups.filter(group => ManagedClientGroup.getIdentifier(group) === id);
        this.managedClientGroups = this.managedClientGroups.filter(group => !removed.includes(group));

        for (const group of removed) {
            for (const client of group.clients) {
                if (this.managedClients[client.id]) {
                    this.managedClients[client.id].client.disconnect();
                    delete this.managedClients[client.id];
                }
            }
        }

        return removed.length > 0;

    }

    /**
     * Disconnects and removes all clients and groups.
     */
    clear(): void {
        for (const client of Object.values(this.managedClients))
            client.client.disconnect();
        this.managedClients = {};
        this.managedClientGroups = [];
    }

}
