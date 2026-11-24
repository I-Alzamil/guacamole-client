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
import { Router } from '@angular/router';
import { AuthenticationService } from '../auth/authentication.service';
import { FilterComponent, PagerComponent, SortOrderDirective } from '../list/list.components';
import { SortOrder, orderBy } from '../list/sort-order';
import { GuacDatePipe } from '../locale/date.pipe';
import { TranslatePipe } from '../locale/translate.pipe';
import { DataSourceService } from '../rest/data-source.service';
import { RequestService } from '../rest/request.service';
import { User, UserGroup } from '../rest/types/model';
import { ObjectPermissionCategory, ObjectPermissionType, PermissionSet, SystemPermissionType } from '../rest/types/permission-set';
import { PermissionService, UserGroupService, UserService } from '../rest/user.services';

/**
 * Returns the first data source (in sorted order) in which the current user
 * may create objects with the given system permission, or null if none.
 */
function getDefaultDataSource(permissions: Record<string, PermissionSet> | null,
        createPermission: SystemPermissionType): string | null {
    for (const dataSource of Object.keys(permissions || {}).sort()) {
        const permissionSet = permissions![dataSource];
        if (PermissionSet.hasSystemPermission(permissionSet, SystemPermissionType.ADMINISTER)
                || PermissionSet.hasSystemPermission(permissionSet, createPermission))
            return dataSource;
    }
    return null;
}

/**
 * Base for the user and user group lists, retrieving the objects which the
 * current user may manage, and the data source through which each should be
 * managed.
 */
abstract class ManageableObjectList<T> {

    protected readonly dataSources = inject(AuthenticationService).getAvailableDataSources();
    protected readonly router = inject(Router);

    readonly permissions = signal<Record<string, PermissionSet> | null>(null);

    /** All manageable objects, paired with the data source to use. */
    readonly manageable = signal<{ dataSource: string, object: T }[] | null>(null);

    readonly filtered = signal<{ dataSource: string, object: T }[]>([]);
    readonly page = signal<{ dataSource: string, object: T }[]>([]);

    abstract readonly order: SortOrder;

    readonly sorted = computed(() => orderBy(this.filtered(), this.order.predicate));

    readonly defaultDataSource = computed(() => getDefaultDataSource(this.permissions(), this.createPermission));

    constructor(private readonly createPermission: SystemPermissionType,
            private readonly category: ObjectPermissionCategory,
            retrieve: (dataSource: string, permissionTypes?: string[]) => Promise<Record<string, T>>,
            identify: (object: T) => string) {

        const dataSourceService = inject(DataSourceService);
        const permissionService = inject(PermissionService);
        const requestService = inject(RequestService);
        const username = inject(AuthenticationService).getCurrentUsername()!;

        dataSourceService.apply((dataSource, user) => permissionService.getEffectivePermissions(dataSource, user),
            this.dataSources, username)
        .then(permissions => {

            this.permissions.set(permissions);

            // Return to home if there's nothing to do here
            if (!this.canManage(permissions))
                this.router.navigateByUrl('/');

            // Retrieve all objects if creation is possible, and only
            // modifiable objects otherwise
            const permissionTypes = this.defaultDataSource() !== null
                ? undefined : [ObjectPermissionType.UPDATE, ObjectPermissionType.DELETE];

            return dataSourceService.apply((dataSource, types) => retrieve(dataSource, types), this.dataSources, permissionTypes)
                .then(objects => {

                    const added = new Set<string>();
                    const manageable: { dataSource: string, object: T }[] = [];

                    for (let dataSource of this.dataSources) {
                        for (const object of Object.values(objects[dataSource] || {})) {

                            // Do not add the same object twice
                            const identifier = identify(object);
                            if (added.has(identifier))
                                continue;

                            // Manage through the default data source if the
                            // object cannot be modified within this one
                            if (!PermissionSet.hasSystemPermission(permissions[dataSource], ObjectPermissionType.ADMINISTER)
                                    && !PermissionSet.hasObjectPermission(permissions[dataSource], this.category, ObjectPermissionType.UPDATE, identifier)
                                    && !PermissionSet.hasObjectPermission(permissions[dataSource], this.category, ObjectPermissionType.DELETE, identifier))
                                dataSource = this.defaultDataSource()!;

                            added.add(identifier);
                            manageable.push({ dataSource, object });

                        }
                    }

                    this.manageable.set(manageable);

                });

        }).catch(requestService.DIE);

    }

    private canManage(permissions: Record<string, PermissionSet>): boolean {
        if (this.defaultDataSource() !== null)
            return true;
        return Object.values(permissions).some(permissionSet =>
            PermissionSet.hasObjectPermission(permissionSet, this.category, ObjectPermissionType.UPDATE)
            || PermissionSet.hasObjectPermission(permissionSet, this.category, ObjectPermissionType.DELETE));
    }

    protected readonly encode = encodeURIComponent;

}

/**
 * Lists all users which the current user can manage.
 */
@Component({
    selector: 'guac-settings-users',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FilterComponent, GuacDatePipe, PagerComponent, SortOrderDirective, TranslatePipe],
    host: { 'class': 'settings section users', '[class.loading]': '!manageable()' },
    template: `
        <p>{{ 'SETTINGS_USERS.HELP_USERS' | translate }}</p>

        <div class="toolbar">
            <div class="action-buttons">
                @if (defaultDataSource() !== null) {
                    <a class="add-user button" [href]="'#/manage/' + encode(defaultDataSource()!) + '/users/'">
                        {{ 'SETTINGS_USERS.ACTION_NEW_USER' | translate }}</a>
                }
            </div>
            <guac-filter [items]="manageable()" [(filteredItems)]="filtered" [properties]="filterProperties"
                         [placeholder]="'SETTINGS_USERS.FIELD_PLACEHOLDER_FILTER' | translate" />
        </div>

        <table class="sorted user-list">
            <thead>
                <tr>
                    <th [guacSortOrder]="order" guacSortProperty="object.username" class="username">{{ 'SETTINGS_USERS.TABLE_HEADER_USERNAME' | translate }}</th>
                    <th [guacSortOrder]="order" guacSortProperty='object.attributes["guac-organization"]' class="organization">{{ 'SETTINGS_USERS.TABLE_HEADER_ORGANIZATION' | translate }}</th>
                    <th [guacSortOrder]="order" guacSortProperty='object.attributes["guac-full-name"]' class="full-name">{{ 'SETTINGS_USERS.TABLE_HEADER_FULL_NAME' | translate }}</th>
                    <th [guacSortOrder]="order" guacSortProperty="object.lastActive" class="last-active">{{ 'SETTINGS_USERS.TABLE_HEADER_LAST_ACTIVE' | translate }}</th>
                </tr>
            </thead>
            <tbody>
                @for (item of page(); track item.object.username) {
                    <tr class="user" [class.disabled]="item.object.disabled">
                        <td class="username">
                            <a [href]="'#/manage/' + encode(item.dataSource) + '/users/' + encode(item.object.username)">
                                <div class="icon user"></div>
                                <span class="name">{{ item.object.username }}</span>
                            </a>
                        </td>
                        <td class="organization">{{ item.object.attributes['guac-organization'] }}</td>
                        <td class="full-name">{{ item.object.attributes['guac-full-name'] }}</td>
                        <td class="last-active">{{ item.object.lastActive | guacDate: 'SETTINGS_USERS.FORMAT_DATE' }}</td>
                    </tr>
                }
            </tbody>
        </table>

        <guac-pager [(page)]="page" [pageSize]="25" [items]="sorted()" />
    `
})
export class SettingsUsersComponent extends ManageableObjectList<User> {

    readonly order = new SortOrder(['object.username', '-object.lastActive',
        'object.attributes["guac-organization"]', 'object.attributes["guac-full-name"]']);

    readonly filterProperties = ['object.attributes["guac-full-name"]', 'object.attributes["guac-organization"]',
        'object.lastActive', 'object.username'];

    constructor() {
        const userService = inject(UserService);
        super(SystemPermissionType.CREATE_USER, 'userPermissions',
            (dataSource, types) => userService.getUsers(dataSource, types), user => user.username);
    }

}

/**
 * Lists all user groups which the current user can manage.
 */
@Component({
    selector: 'guac-settings-user-groups',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FilterComponent, PagerComponent, SortOrderDirective, TranslatePipe],
    host: { 'class': 'settings section user-groups', '[class.loading]': '!manageable()' },
    template: `
        <p>{{ 'SETTINGS_USER_GROUPS.HELP_USER_GROUPS' | translate }}</p>

        <div class="toolbar">
            <div class="action-buttons">
                @if (defaultDataSource() !== null) {
                    <a class="add-user-group button" [href]="'#/manage/' + encode(defaultDataSource()!) + '/userGroups/'">
                        {{ 'SETTINGS_USER_GROUPS.ACTION_NEW_USER_GROUP' | translate }}</a>
                }
            </div>
            <guac-filter [items]="manageable()" [(filteredItems)]="filtered" [properties]="['object.identifier']"
                         [placeholder]="'SETTINGS_USER_GROUPS.FIELD_PLACEHOLDER_FILTER' | translate" />
        </div>

        <table class="sorted user-group-list">
            <thead>
                <tr>
                    <th [guacSortOrder]="order" guacSortProperty="object.identifier" class="user-group-name">
                        {{ 'SETTINGS_USER_GROUPS.TABLE_HEADER_USER_GROUP_NAME' | translate }}</th>
                </tr>
            </thead>
            <tbody>
                @for (item of page(); track item.object.identifier) {
                    <tr class="user-group" [class.disabled]="item.object.disabled">
                        <td class="user-group-name">
                            <a [href]="'#/manage/' + encode(item.dataSource) + '/userGroups/' + encode(item.object.identifier)">
                                <div class="icon user-group"></div>
                                <span class="name">{{ item.object.identifier }}</span>
                            </a>
                        </td>
                    </tr>
                }
            </tbody>
        </table>

        <guac-pager [(page)]="page" [pageSize]="25" [items]="sorted()" />
    `
})
export class SettingsUserGroupsComponent extends ManageableObjectList<UserGroup> {

    readonly order = new SortOrder(['object.identifier']);

    constructor() {
        const userGroupService = inject(UserGroupService);
        super(SystemPermissionType.CREATE_USER_GROUP, 'userGroupPermissions',
            (dataSource, types) => userGroupService.getUserGroups(dataSource, types), group => group.identifier);
    }

}
