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
import { canonicalize } from '../locale/translation.service';
import { ConnectionGroupService } from '../rest/connection.services';
import { DataSourceService } from '../rest/data-source.service';
import { RequestService } from '../rest/request.service';
import { ConnectionGroup, ConnectionGroupType, ROOT_CONNECTION_GROUP } from '../rest/types/model';
import { ObjectPermissionType, PermissionSet, SystemPermissionType } from '../rest/types/permission-set';
import { PermissionService } from '../rest/user.services';
import { ClientIdentifierType, clientIdentifierToString } from './client-identifier';
import { PageDefinition } from './page-definition';

/**
 * The home page assigned to users who can navigate to more than just a single
 * connection.
 */
const SYSTEM_HOME_PAGE: PageDefinition = {
    name: 'USER_MENU.ACTION_NAVIGATE_HOME',
    url: '/'
};

/**
 * Service for determining which pages the current user may access.
 */
@Injectable({ providedIn: 'root' })
export class UserPageService {

    private readonly authenticationService = inject(AuthenticationService);
    private readonly connectionGroupService = inject(ConnectionGroupService);
    private readonly dataSourceService = inject(DataSourceService);
    private readonly permissionService = inject(PermissionService);
    private readonly requestService = inject(RequestService);

    private getRootGroups(): Promise<Record<string, ConnectionGroup>> {
        return this.dataSourceService.apply(
            (dataSource, id) => this.connectionGroupService.getConnectionGroupTree(dataSource, id),
            this.authenticationService.getAvailableDataSources(),
            ROOT_CONNECTION_GROUP);
    }

    private getPermissionSets(): Promise<Record<string, PermissionSet>> {
        return this.dataSourceService.apply(
            (dataSource, username) => this.permissionService.getEffectivePermissions(dataSource, username),
            this.authenticationService.getAvailableDataSources(),
            this.authenticationService.getCurrentUsername()!);
    }

    /**
     * Returns the home page for the current user: the client page of their
     * only connection if they only have access to a single connection and
     * cannot manage anything, or the standard home page otherwise.
     */
    private generateHomePage(rootGroups: Record<string, ConnectionGroup>,
            permissions: Record<string, PermissionSet>): PageDefinition {

        // If user has access to settings pages, return home page and skip
        // evaluation for automatic connections. The Preferences and Sessions
        // pages are always available, so 2 is the minimum.
        if (this.generateSettingsPages(permissions).length > 2)
            return SYSTEM_HOME_PAGE;

        const clientPages = this.getClientPages(rootGroups);
        return (clientPages.length === 1) ? clientPages[0] : SYSTEM_HOME_PAGE;

    }

    private addClientPages(clientPages: PageDefinition[], dataSource: string, connectionGroup: ConnectionGroup): void {

        for (const connection of connectionGroup.childConnections || []) {
            clientPages.push({
                name: connection.name!,
                url: '/client/' + clientIdentifierToString({
                    dataSource,
                    type: ClientIdentifierType.CONNECTION,
                    id: connection.identifier!
                })
            });
        }

        for (const group of connectionGroup.childConnectionGroups || []) {

            // Balancing groups are themselves connectable
            if (group.type === ConnectionGroupType.BALANCING) {
                clientPages.push({
                    name: group.name!,
                    url: '/client/' + clientIdentifierToString({
                        dataSource,
                        type: ClientIdentifierType.CONNECTION_GROUP,
                        id: group.identifier!
                    })
                });
            }

            this.addClientPages(clientPages, dataSource, group);

        }

    }

    /**
     * Returns a page for each connection and balancing group within the
     * given root connection groups.
     */
    getClientPages(rootGroups: Record<string, ConnectionGroup>): PageDefinition[] {
        const clientPages: PageDefinition[] = [];
        for (const [dataSource, rootGroup] of Object.entries(rootGroups))
            this.addClientPages(clientPages, dataSource, rootGroup);
        return clientPages;
    }

    /**
     * Returns a promise which resolves with the home page of the current
     * user.
     */
    async getHomePage(): Promise<PageDefinition> {
        try {
            const [rootGroups, permissions] = await Promise.all([this.getRootGroups(), this.getPermissionSets()]);
            return this.generateHomePage(rootGroups, permissions);
        }
        catch (e) {
            this.requestService.DIE(e);
            throw e;
        }
    }

    private generateSettingsPages(permissionSets: Record<string, PermissionSet>): PageDefinition[] {

        const pages: PageDefinition[] = [];

        const canManageUsers: string[] = [];
        const canManageUserGroups: string[] = [];
        const canManageConnections: string[] = [];
        const canViewConnectionRecords: string[] = [];

        const username = this.authenticationService.getCurrentUsername()!;

        for (const dataSource of this.authenticationService.getAvailableDataSources()) {

            if (!permissionSets[dataSource])
                continue;

            // Ignore permission to update root group and self
            const permissions = PermissionSet.copy(permissionSets[dataSource]);
            PermissionSet.removeConnectionGroupPermission(permissions, ObjectPermissionType.UPDATE, ROOT_CONNECTION_GROUP);
            PermissionSet.removeUserPermission(permissions, ObjectPermissionType.UPDATE, username);

            const system = (type: SystemPermissionType) => PermissionSet.hasSystemPermission(permissions, type);
            const anyOf = (check: (set: PermissionSet, type: string) => boolean) =>
                check(permissions, ObjectPermissionType.UPDATE)
                || check(permissions, ObjectPermissionType.DELETE)
                || check(permissions, ObjectPermissionType.ADMINISTER);

            if (system(SystemPermissionType.ADMINISTER) || system(SystemPermissionType.CREATE_USER)
                    || anyOf(PermissionSet.hasUserPermission))
                canManageUsers.push(dataSource);

            if (system(SystemPermissionType.ADMINISTER) || system(SystemPermissionType.CREATE_USER_GROUP)
                    || anyOf(PermissionSet.hasUserGroupPermission))
                canManageUserGroups.push(dataSource);

            if (system(SystemPermissionType.ADMINISTER) || system(SystemPermissionType.CREATE_CONNECTION)
                    || system(SystemPermissionType.CREATE_CONNECTION_GROUP)
                    || anyOf(PermissionSet.hasConnectionPermission)
                    || anyOf(PermissionSet.hasConnectionGroupPermission))
                canManageConnections.push(dataSource);

            if (system(SystemPermissionType.ADMINISTER) || system(SystemPermissionType.AUDIT))
                canViewConnectionRecords.push(dataSource);

        }

        // Active sessions are always viewable
        pages.push({ name: 'USER_MENU.ACTION_MANAGE_SESSIONS', url: '/settings/sessions' });

        for (const dataSource of canViewConnectionRecords) {
            pages.push({
                name: ['USER_MENU.ACTION_VIEW_HISTORY', canonicalize('DATA_SOURCE_' + dataSource) + '.NAME'],
                url: '/settings/' + encodeURIComponent(dataSource) + '/history'
            });
        }

        if (canManageUsers.length)
            pages.push({ name: 'USER_MENU.ACTION_MANAGE_USERS', url: '/settings/users' });

        if (canManageUserGroups.length)
            pages.push({ name: 'USER_MENU.ACTION_MANAGE_USER_GROUPS', url: '/settings/userGroups' });

        for (const dataSource of canManageConnections) {
            pages.push({
                name: ['USER_MENU.ACTION_MANAGE_CONNECTIONS', canonicalize('DATA_SOURCE_' + dataSource) + '.NAME'],
                url: '/settings/' + encodeURIComponent(dataSource) + '/connections'
            });
        }

        // Preferences are always manageable
        pages.push({ name: 'USER_MENU.ACTION_MANAGE_PREFERENCES', url: '/settings/preferences' });

        return pages;

    }

    /**
     * Returns a promise which resolves with all settings pages accessible by
     * the current user.
     */
    async getSettingsPages(): Promise<PageDefinition[]> {
        try {
            return this.generateSettingsPages(await this.getPermissionSets());
        }
        catch (e) {
            this.requestService.DIE(e);
            throw e;
        }
    }

    /**
     * Returns a promise which resolves with the main pages (home and
     * settings) accessible by the current user.
     */
    async getMainPages(): Promise<PageDefinition[]> {

        let rootGroups: Record<string, ConnectionGroup>;
        let permissions: Record<string, PermissionSet>;
        try {
            [rootGroups, permissions] = await Promise.all([this.getRootGroups(), this.getPermissionSets()]);
        }
        catch (e) {
            this.requestService.DIE(e);
            throw e;
        }

        const pages: PageDefinition[] = [];
        const homePage = this.generateHomePage(rootGroups, permissions);
        const settingsPages = this.generateSettingsPages(permissions);

        // Only include the home page in the list of main pages if the user
        // can navigate elsewhere
        if (homePage === SYSTEM_HOME_PAGE || settingsPages.length)
            pages.push(homePage);

        if (settingsPages.length)
            pages.push({ name: 'USER_MENU.ACTION_MANAGE_SETTINGS', url: settingsPages[0].url });

        return pages;

    }

}
