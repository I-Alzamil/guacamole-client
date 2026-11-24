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

import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthenticationService } from '../auth/authentication.service';
import { GroupListFilterComponent } from '../group-list/group-list-filter.component';
import { GroupListItem, GroupListItemType } from '../group-list/group-list-item';
import { GroupListComponent } from '../group-list/group-list.component';
import { TranslatePipe } from '../locale/translate.pipe';
import { ConnectionGroupService } from '../rest/connection.services';
import { RequestService } from '../rest/request.service';
import { ConnectionGroup, ROOT_CONNECTION_GROUP } from '../rest/types/model';
import { ObjectPermissionType, PermissionSet, SystemPermissionType } from '../rest/types/permission-set';
import { PermissionService } from '../rest/user.services';

/**
 * Lists all connections, connection groups, and sharing profiles within a
 * data source which the current user can manage.
 */
@Component({
    selector: 'guac-settings-connections',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [GroupListComponent, GroupListFilterComponent, TranslatePipe],
    host: { 'class': 'settings section connections', '[class.loading]': '!rootGroups() || !permissions()' },
    template: `
        <p>{{ 'SETTINGS_CONNECTIONS.HELP_CONNECTIONS' | translate }}</p>

        <div class="toolbar">
            <div class="action-buttons">
                @if (canCreate(SystemPermissionType.CREATE_CONNECTION)) {
                    <a class="add-connection button" [href]="'#/manage/' + encode(dataSource()) + '/connections/'">
                        {{ 'SETTINGS_CONNECTIONS.ACTION_NEW_CONNECTION' | translate }}</a>
                }
                @if (canCreate(SystemPermissionType.CREATE_CONNECTION_GROUP)) {
                    <a class="add-connection-group button" [href]="'#/manage/' + encode(dataSource()) + '/connectionGroups/'">
                        {{ 'SETTINGS_CONNECTIONS.ACTION_NEW_CONNECTION_GROUP' | translate }}</a>
                }
                @if (canAdminister()) {
                    <a class="import-connections button" [href]="'#/import/' + encode(dataSource()) + '/connection/'">
                        {{ 'SETTINGS_CONNECTIONS.ACTION_IMPORT' | translate }}</a>
                }
            </div>
            <guac-group-list-filter [connectionGroups]="rootGroups()" [(filteredConnectionGroups)]="filteredRootGroups"
                                    [connectionProperties]="['name', 'protocol']"
                                    [placeholder]="'SETTINGS_CONNECTIONS.FIELD_PLACEHOLDER_FILTER' | translate" />
        </div>

        <div class="connection-list">
            <guac-group-list [pageSize]="25" [connectionGroups]="filteredRootGroups()" [decorator]="rootItemDecorator"
                             [templates]="{
                                 'connection': connection,
                                 'sharing-profile': sharingProfile,
                                 'connection-group': connectionGroup,
                                 'new-connection': newConnection,
                                 'new-sharing-profile': newSharingProfile,
                                 'new-connection-group': newConnectionGroup
                             }" />
        </div>

        <ng-template #connection let-item>
            <a [href]="'#/manage/' + encode(item.dataSource) + '/connections/' + encode(item.identifier)"
               class="settings-connection" [class.active]="item.getActiveConnections()">
                <div class="icon type" [class]="item.protocol"></div>
                <span class="name">{{ item.name }}</span>
                @if (item.getActiveConnections()) {
                    <span class="activeUserCount">{{ 'SETTINGS_CONNECTIONS.INFO_ACTIVE_USER_COUNT' | translate: { USERS: item.getActiveConnections() } }}</span>
                }
            </a>
        </ng-template>

        <ng-template #connectionGroup let-item>
            <a [href]="'#/manage/' + encode(item.dataSource) + '/connectionGroups/' + encode(item.identifier)" class="settings-connection-group">
                <div class="icon type"></div>
                <span class="name">{{ item.name }}</span>
            </a>
        </ng-template>

        <ng-template #sharingProfile let-item>
            <a [href]="'#/manage/' + encode(item.dataSource) + '/sharingProfiles/' + encode(item.identifier)" class="settings-sharing-profile">
                <div class="icon type"></div>
                <span class="name">{{ item.name }}</span>
            </a>
        </ng-template>

        <ng-template #newConnection let-item>
            <a [href]="'#/manage/' + encode(item.dataSource) + '/connections/?parent=' + encode(item.wrappedItem.identifier)" class="new-connection">
                <span class="name">{{ 'SETTINGS_CONNECTIONS.ACTION_NEW_CONNECTION' | translate }}</span>
            </a>
        </ng-template>

        <ng-template #newConnectionGroup let-item>
            <a [href]="'#/manage/' + encode(item.dataSource) + '/connectionGroups/?parent=' + encode(item.wrappedItem.identifier)" class="new-connection-group">
                <span class="name">{{ 'SETTINGS_CONNECTIONS.ACTION_NEW_CONNECTION_GROUP' | translate }}</span>
            </a>
        </ng-template>

        <ng-template #newSharingProfile let-item>
            <a [href]="'#/manage/' + encode(item.dataSource) + '/sharingProfiles/?parent=' + encode(item.wrappedItem.identifier)" class="new-sharing-profile">
                <span class="name">{{ 'SETTINGS_CONNECTIONS.ACTION_NEW_SHARING_PROFILE' | translate }}</span>
            </a>
        </ng-template>
    `
})
export class SettingsConnectionsComponent {

    protected readonly SystemPermissionType = SystemPermissionType;
    protected readonly encode = encodeURIComponent;

    /** The data source whose connections should be listed. */
    readonly dataSource = input.required<string>();

    readonly rootGroups = signal<Record<string, ConnectionGroup> | null>(null);
    readonly filteredRootGroups = signal<Record<string, ConnectionGroup | GroupListItem>>({});
    readonly permissions = signal<PermissionSet | null>(null);

    constructor() {

        const connectionGroupService = inject(ConnectionGroupService);
        const permissionService = inject(PermissionService);
        const requestService = inject(RequestService);
        const router = inject(Router);
        const username = inject(AuthenticationService).getCurrentUsername()!;

        effect(() => {

            const dataSource = this.dataSource();
            this.rootGroups.set(null);
            this.permissions.set(null);

            permissionService.getEffectivePermissions(dataSource, username).then(permissions => {

                // Ignore permission to update root group
                permissions = PermissionSet.copy(permissions);
                PermissionSet.removeConnectionGroupPermission(permissions, ObjectPermissionType.UPDATE, ROOT_CONNECTION_GROUP);
                this.permissions.set(permissions);

                // Return to home if there's nothing to do here
                if (!this.canManageConnections())
                    router.navigateByUrl('/');

                return connectionGroupService.getConnectionGroupTree(dataSource, ROOT_CONNECTION_GROUP,
                    [ObjectPermissionType.UPDATE, ObjectPermissionType.DELETE])
                    .then(rootGroup => this.rootGroups.set({ [dataSource]: rootGroup }));

            }).catch(requestService.DIE);

        });

    }

    private hasSystemPermission(type: SystemPermissionType): boolean {
        const permissions = this.permissions();
        return !!permissions && PermissionSet.hasSystemPermission(permissions, type);
    }

    canAdminister(): boolean {
        return this.hasSystemPermission(SystemPermissionType.ADMINISTER);
    }

    canCreate(type: SystemPermissionType): boolean {
        return this.canAdminister() || this.hasSystemPermission(type);
    }

    private canManageConnections(): boolean {

        const permissions = this.permissions();
        if (!permissions)
            return false;

        return this.canCreate(SystemPermissionType.CREATE_CONNECTION)
            || this.canCreate(SystemPermissionType.CREATE_CONNECTION_GROUP)
            || this.canCreate(SystemPermissionType.CREATE_SHARING_PROFILE)
            || PermissionSet.hasConnectionPermission(permissions, ObjectPermissionType.UPDATE)
            || PermissionSet.hasConnectionPermission(permissions, ObjectPermissionType.DELETE)
            || PermissionSet.hasConnectionGroupPermission(permissions, ObjectPermissionType.UPDATE)
            || PermissionSet.hasConnectionGroupPermission(permissions, ObjectPermissionType.DELETE);

    }

    private canUpdate(item: GroupListItem): boolean {
        const permissions = this.permissions();
        if (!permissions)
            return false;
        if (this.canAdminister())
            return true;
        return item.type === GroupListItemType.CONNECTION
            ? PermissionSet.hasConnectionPermission(permissions, ObjectPermissionType.UPDATE, item.identifier)
            : PermissionSet.hasConnectionGroupPermission(permissions, ObjectPermissionType.UPDATE, item.identifier);
    }

    /**
     * Adds placeholder items for creating new objects within each item
     * that the current user may modify.
     */
    readonly rootItemDecorator = (items: GroupListItem[]) => {

        const newItem = (type: string, parent?: GroupListItem) => new GroupListItem({
            type, dataSource: this.dataSource(), weight: 1, wrappedItem: parent?.wrappedItem
        });

        // Root-level items can always be added to (permission permitting)
        const addGroupActions = (children: GroupListItem[], parent?: GroupListItem) => {
            if (parent && !this.canUpdate(parent))
                return;
            if (this.canCreate(SystemPermissionType.CREATE_CONNECTION))
                children.push(newItem('new-connection', parent));
            if (this.canCreate(SystemPermissionType.CREATE_CONNECTION_GROUP))
                children.push(newItem('new-connection-group', parent));
        };

        const decorate = (item: GroupListItem) => {
            if (item.type === GroupListItemType.CONNECTION_GROUP)
                addGroupActions(item.children, item);
            else if (item.type === GroupListItemType.CONNECTION && this.canUpdate(item)
                    && this.canCreate(SystemPermissionType.CREATE_SHARING_PROFILE))
                item.children.push(newItem('new-sharing-profile', item));
            item.children.forEach(decorate);
        };

        items.forEach(decorate);

    };

}
