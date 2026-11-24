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
import { AuthenticationService } from '../auth/authentication.service';
import { CacheService } from './cache.service';
import {
    ActiveConnection, Connection, ConnectionGroup, ConnectionHistoryEntry, DirectoryPatch,
    DirectoryPatchResponse, ROOT_CONNECTION_GROUP, SharingProfile, UserCredentials
} from './types/model';

/**
 * Returns the base URL of the REST resources of the given data source.
 */
export function dataSourceUrl(dataSource: string): string {
    return 'api/session/data/' + encodeURIComponent(dataSource);
}

/**
 * Service for operating on connections via the REST API.
 */
@Injectable({ providedIn: 'root' })
export class ConnectionService {

    private readonly authenticationService = inject(AuthenticationService);
    private readonly cacheService = inject(CacheService);

    private invalidate(): void {
        this.cacheService.connections.removeAll();
        this.cacheService.users.removeAll();
    }

    getConnection(dataSource: string, id: string): Promise<Connection> {
        return this.authenticationService.request({
            cache: this.cacheService.connections,
            method: 'GET',
            url: dataSourceUrl(dataSource) + '/connections/' + encodeURIComponent(id)
        });
    }

    getConnectionHistory(dataSource: string, id: string): Promise<ConnectionHistoryEntry[]> {
        return this.authenticationService.request({
            method: 'GET',
            url: dataSourceUrl(dataSource) + '/connections/' + encodeURIComponent(id) + '/history'
        });
    }

    getConnectionParameters(dataSource: string, id: string): Promise<Record<string, string>> {
        return this.authenticationService.request({
            cache: this.cacheService.connections,
            method: 'GET',
            url: dataSourceUrl(dataSource) + '/connections/' + encodeURIComponent(id) + '/parameters'
        });
    }

    /**
     * Creates or updates the given connection. If the connection is new, its
     * identifier is updated to that assigned by the server.
     */
    async saveConnection(dataSource: string, connection: Connection): Promise<void> {

        if (!connection.identifier) {
            const created = await this.authenticationService.request<Connection>({
                method: 'POST',
                url: dataSourceUrl(dataSource) + '/connections',
                body: connection
            });
            connection.identifier = created.identifier;
        }
        else
            await this.authenticationService.request({
                method: 'PUT',
                url: dataSourceUrl(dataSource) + '/connections/' + encodeURIComponent(connection.identifier),
                body: connection
            });

        this.invalidate();

    }

    async patchConnections(dataSource: string, patches: DirectoryPatch<Connection>[]): Promise<DirectoryPatchResponse> {
        const response = await this.authenticationService.request<DirectoryPatchResponse>({
            method: 'PATCH',
            url: dataSourceUrl(dataSource) + '/connections',
            body: patches
        });
        this.invalidate();
        return response;
    }

    async deleteConnection(dataSource: string, connection: Connection): Promise<void> {
        await this.authenticationService.request({
            method: 'DELETE',
            url: dataSourceUrl(dataSource) + '/connections/' + encodeURIComponent(connection.identifier!)
        });
        this.cacheService.connections.removeAll();
    }

}

/**
 * Service for operating on connection groups via the REST API.
 */
@Injectable({ providedIn: 'root' })
export class ConnectionGroupService {

    private readonly authenticationService = inject(AuthenticationService);
    private readonly cacheService = inject(CacheService);

    /**
     * Retrieves the given connection group and all descendants, optionally
     * filtered by the permissions the current user must have.
     */
    getConnectionGroupTree(dataSource: string, connectionGroupID?: string | null,
            permissionTypes?: string[]): Promise<ConnectionGroup> {
        return this.authenticationService.request({
            cache: this.cacheService.connections,
            method: 'GET',
            url: dataSourceUrl(dataSource) + '/connectionGroups/'
                + encodeURIComponent(connectionGroupID || ROOT_CONNECTION_GROUP) + '/tree',
            params: { permission: permissionTypes }
        });
    }

    getConnectionGroup(dataSource: string, connectionGroupID?: string | null): Promise<ConnectionGroup> {
        return this.authenticationService.request({
            cache: this.cacheService.connections,
            method: 'GET',
            url: dataSourceUrl(dataSource) + '/connectionGroups/'
                + encodeURIComponent(connectionGroupID || ROOT_CONNECTION_GROUP)
        });
    }

    async saveConnectionGroup(dataSource: string, connectionGroup: ConnectionGroup): Promise<void> {

        if (!connectionGroup.identifier) {
            const created = await this.authenticationService.request<ConnectionGroup>({
                method: 'POST',
                url: dataSourceUrl(dataSource) + '/connectionGroups',
                body: connectionGroup
            });
            connectionGroup.identifier = created.identifier;
        }
        else
            await this.authenticationService.request({
                method: 'PUT',
                url: dataSourceUrl(dataSource) + '/connectionGroups/' + encodeURIComponent(connectionGroup.identifier),
                body: connectionGroup
            });

        this.cacheService.connections.removeAll();
        this.cacheService.users.removeAll();

    }

    async deleteConnectionGroup(dataSource: string, connectionGroup: ConnectionGroup): Promise<void> {
        await this.authenticationService.request({
            method: 'DELETE',
            url: dataSourceUrl(dataSource) + '/connectionGroups/' + encodeURIComponent(connectionGroup.identifier!)
        });
        this.cacheService.connections.removeAll();
    }

}

/**
 * Service for operating on sharing profiles via the REST API.
 */
@Injectable({ providedIn: 'root' })
export class SharingProfileService {

    private readonly authenticationService = inject(AuthenticationService);
    private readonly cacheService = inject(CacheService);

    getSharingProfile(dataSource: string, id: string): Promise<SharingProfile> {
        return this.authenticationService.request({
            cache: this.cacheService.connections,
            method: 'GET',
            url: dataSourceUrl(dataSource) + '/sharingProfiles/' + encodeURIComponent(id)
        });
    }

    getSharingProfileParameters(dataSource: string, id: string): Promise<Record<string, string>> {
        return this.authenticationService.request({
            cache: this.cacheService.connections,
            method: 'GET',
            url: dataSourceUrl(dataSource) + '/sharingProfiles/' + encodeURIComponent(id) + '/parameters'
        });
    }

    async saveSharingProfile(dataSource: string, sharingProfile: SharingProfile): Promise<void> {

        if (!sharingProfile.identifier) {
            const created = await this.authenticationService.request<SharingProfile>({
                method: 'POST',
                url: dataSourceUrl(dataSource) + '/sharingProfiles',
                body: sharingProfile
            });
            sharingProfile.identifier = created.identifier;
        }
        else
            await this.authenticationService.request({
                method: 'PUT',
                url: dataSourceUrl(dataSource) + '/sharingProfiles/' + encodeURIComponent(sharingProfile.identifier),
                body: sharingProfile
            });

        this.cacheService.connections.removeAll();
        this.cacheService.users.removeAll();

    }

    async deleteSharingProfile(dataSource: string, sharingProfile: SharingProfile): Promise<void> {
        await this.authenticationService.request({
            method: 'DELETE',
            url: dataSourceUrl(dataSource) + '/sharingProfiles/' + encodeURIComponent(sharingProfile.identifier!)
        });
        this.cacheService.connections.removeAll();
    }

}

/**
 * Service for operating on active connections via the REST API.
 */
@Injectable({ providedIn: 'root' })
export class ActiveConnectionService {

    private readonly authenticationService = inject(AuthenticationService);

    getActiveConnection(dataSource: string, id: string): Promise<ActiveConnection> {
        return this.authenticationService.request({
            method: 'GET',
            url: dataSourceUrl(dataSource) + '/activeConnections/' + encodeURIComponent(id)
        });
    }

    getActiveConnections(dataSource: string, permissionTypes?: string[]): Promise<Record<string, ActiveConnection>> {
        return this.authenticationService.request({
            method: 'GET',
            url: dataSourceUrl(dataSource) + '/activeConnections',
            params: { permission: permissionTypes }
        });
    }

    /**
     * Kills the active connections having the given identifiers.
     */
    deleteActiveConnections(dataSource: string, identifiers: string[]): Promise<void> {
        return this.authenticationService.request({
            method: 'PATCH',
            url: dataSourceUrl(dataSource) + '/activeConnections',
            body: identifiers.map(identifier => ({ op: 'remove', path: '/' + identifier }))
        });
    }

    getSharingCredentials(dataSource: string, id: string, sharingProfile: string): Promise<UserCredentials> {
        return this.authenticationService.request({
            method: 'GET',
            url: dataSourceUrl(dataSource) + '/activeConnections/' + encodeURIComponent(id)
                + '/sharingCredentials/' + encodeURIComponent(sharingProfile)
        });
    }

}

/**
 * Service for retrieving connection history via the REST API.
 */
@Injectable({ providedIn: 'root' })
export class HistoryService {

    private readonly authenticationService = inject(AuthenticationService);

    getConnectionHistory(dataSource: string, requiredContents?: string[],
            sortPredicates?: string[]): Promise<ConnectionHistoryEntry[]> {
        return this.authenticationService.request({
            method: 'GET',
            url: dataSourceUrl(dataSource) + '/history/connections',
            params: { contains: requiredContents, order: sortPredicates }
        });
    }

}
