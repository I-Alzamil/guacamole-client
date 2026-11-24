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
import { dataSourceUrl } from './connection.services';
import { DirectoryPatch, DirectoryPatchResponse, PermissionPatch, RelatedObjectPatch, User, UserGroup } from './types/model';
import { OBJECT_PERMISSION_CATEGORIES, PermissionSet } from './types/permission-set';

/**
 * Service for operating on users via the REST API.
 */
@Injectable({ providedIn: 'root' })
export class UserService {

    private readonly authenticationService = inject(AuthenticationService);
    private readonly cacheService = inject(CacheService);

    getUsers(dataSource: string, permissionTypes?: string[]): Promise<Record<string, User>> {
        return this.authenticationService.request({
            cache: this.cacheService.users,
            method: 'GET',
            url: dataSourceUrl(dataSource) + '/users',
            params: { permission: permissionTypes }
        });
    }

    getUser(dataSource: string, username: string): Promise<User> {
        return this.authenticationService.request({
            cache: this.cacheService.users,
            method: 'GET',
            url: dataSourceUrl(dataSource) + '/users/' + encodeURIComponent(username)
        });
    }

    async deleteUser(dataSource: string, user: User): Promise<void> {
        await this.authenticationService.request({
            method: 'DELETE',
            url: dataSourceUrl(dataSource) + '/users/' + encodeURIComponent(user.username)
        });
        this.cacheService.users.removeAll();
    }

    async createUser(dataSource: string, user: User): Promise<void> {
        await this.authenticationService.request({
            method: 'POST',
            url: dataSourceUrl(dataSource) + '/users',
            body: user
        });
        this.cacheService.users.removeAll();
    }

    async saveUser(dataSource: string, user: User): Promise<void> {
        await this.authenticationService.request({
            method: 'PUT',
            url: dataSourceUrl(dataSource) + '/users/' + encodeURIComponent(user.username),
            body: user
        });
        this.cacheService.users.removeAll();
    }

    async updateUserPassword(dataSource: string, username: string,
            oldPassword: string, newPassword: string): Promise<void> {
        await this.authenticationService.request({
            method: 'PUT',
            url: dataSourceUrl(dataSource) + '/users/' + encodeURIComponent(username) + '/password',
            body: { oldPassword, newPassword }
        });
        this.cacheService.users.removeAll();
    }

    async patchUsers(dataSource: string, patches: DirectoryPatch<User>[]): Promise<DirectoryPatchResponse> {
        const response = await this.authenticationService.request<DirectoryPatchResponse>({
            method: 'PATCH',
            url: dataSourceUrl(dataSource) + '/users',
            body: patches
        });
        this.cacheService.users.removeAll();
        return response;
    }

}

/**
 * Service for operating on user groups via the REST API.
 */
@Injectable({ providedIn: 'root' })
export class UserGroupService {

    private readonly authenticationService = inject(AuthenticationService);
    private readonly cacheService = inject(CacheService);

    getUserGroups(dataSource: string, permissionTypes?: string[]): Promise<Record<string, UserGroup>> {
        return this.authenticationService.request({
            cache: this.cacheService.users,
            method: 'GET',
            url: dataSourceUrl(dataSource) + '/userGroups',
            params: { permission: permissionTypes }
        });
    }

    getUserGroup(dataSource: string, identifier: string): Promise<UserGroup> {
        return this.authenticationService.request({
            cache: this.cacheService.users,
            method: 'GET',
            url: dataSourceUrl(dataSource) + '/userGroups/' + encodeURIComponent(identifier)
        });
    }

    async deleteUserGroup(dataSource: string, userGroup: UserGroup): Promise<void> {
        await this.authenticationService.request({
            method: 'DELETE',
            url: dataSourceUrl(dataSource) + '/userGroups/' + encodeURIComponent(userGroup.identifier)
        });
        this.cacheService.users.removeAll();
    }

    async createUserGroup(dataSource: string, userGroup: UserGroup): Promise<void> {
        await this.authenticationService.request({
            method: 'POST',
            url: dataSourceUrl(dataSource) + '/userGroups',
            body: userGroup
        });
        this.cacheService.users.removeAll();
    }

    async saveUserGroup(dataSource: string, userGroup: UserGroup): Promise<void> {
        await this.authenticationService.request({
            method: 'PUT',
            url: dataSourceUrl(dataSource) + '/userGroups/' + encodeURIComponent(userGroup.identifier),
            body: userGroup
        });
        this.cacheService.users.removeAll();
    }

    async patchUserGroups(dataSource: string, patches: DirectoryPatch<UserGroup>[]): Promise<DirectoryPatchResponse> {
        const response = await this.authenticationService.request<DirectoryPatchResponse>({
            method: 'PATCH',
            url: dataSourceUrl(dataSource) + '/userGroups',
            body: patches
        });
        this.cacheService.users.removeAll();
        return response;
    }

}

/**
 * Service for operating on user group memberships via the REST API.
 */
@Injectable({ providedIn: 'root' })
export class MembershipService {

    private readonly authenticationService = inject(AuthenticationService);
    private readonly cacheService = inject(CacheService);

    private getRelatedObjectPatch(identifiersToAdd: string[] = [], identifiersToRemove: string[] = []): RelatedObjectPatch[] {
        return [
            ...identifiersToAdd.map(value => ({ op: 'add' as const, path: '/', value })),
            ...identifiersToRemove.map(value => ({ op: 'remove' as const, path: '/', value }))
        ];
    }

    private getUserGroupsResourceURL(dataSource: string, identifier: string, group?: boolean): string {
        const base = dataSourceUrl(dataSource);
        if (group)
            return base + '/userGroups/' + encodeURIComponent(identifier) + '/userGroups';
        if (identifier === this.authenticationService.getCurrentUsername())
            return base + '/self/userGroups';
        return base + '/users/' + encodeURIComponent(identifier) + '/userGroups';
    }

    private async patch(url: string, add?: string[], remove?: string[]): Promise<void> {
        await this.authenticationService.request({
            method: 'PATCH',
            url,
            body: this.getRelatedObjectPatch(add, remove)
        });
        this.cacheService.users.removeAll();
    }

    /**
     * Returns the identifiers of all user groups of which the given user (or
     * user group, if group is true) is a member.
     */
    getUserGroups(dataSource: string, identifier: string, group?: boolean): Promise<string[]> {
        return this.authenticationService.request({
            cache: this.cacheService.users,
            method: 'GET',
            url: this.getUserGroupsResourceURL(dataSource, identifier, group)
        });
    }

    patchUserGroups(dataSource: string, identifier: string, addToUserGroups?: string[],
            removeFromUserGroups?: string[], group?: boolean): Promise<void> {
        return this.patch(this.getUserGroupsResourceURL(dataSource, identifier, group),
            addToUserGroups, removeFromUserGroups);
    }

    getMemberUsers(dataSource: string, identifier: string): Promise<string[]> {
        return this.authenticationService.request({
            cache: this.cacheService.users,
            method: 'GET',
            url: dataSourceUrl(dataSource) + '/userGroups/' + encodeURIComponent(identifier) + '/memberUsers'
        });
    }

    patchMemberUsers(dataSource: string, identifier: string, usersToAdd?: string[], usersToRemove?: string[]): Promise<void> {
        return this.patch(dataSourceUrl(dataSource) + '/userGroups/' + encodeURIComponent(identifier) + '/memberUsers',
            usersToAdd, usersToRemove);
    }

    getMemberUserGroups(dataSource: string, identifier: string): Promise<string[]> {
        return this.authenticationService.request({
            cache: this.cacheService.users,
            method: 'GET',
            url: dataSourceUrl(dataSource) + '/userGroups/' + encodeURIComponent(identifier) + '/memberUserGroups'
        });
    }

    patchMemberUserGroups(dataSource: string, identifier: string, userGroupsToAdd?: string[],
            userGroupsToRemove?: string[]): Promise<void> {
        return this.patch(dataSourceUrl(dataSource) + '/userGroups/' + encodeURIComponent(identifier) + '/memberUserGroups',
            userGroupsToAdd, userGroupsToRemove);
    }

}

/**
 * Service for operating on permissions via the REST API.
 */
@Injectable({ providedIn: 'root' })
export class PermissionService {

    private readonly authenticationService = inject(AuthenticationService);
    private readonly cacheService = inject(CacheService);

    /**
     * Returns the effective permissions of the given user, including those
     * inherited through group membership.
     */
    async getEffectivePermissions(dataSource: string, username: string): Promise<PermissionSet> {

        const base = dataSourceUrl(dataSource);
        const url = (username === this.authenticationService.getCurrentUsername())
            ? base + '/self/effectivePermissions'
            : base + '/users/' + encodeURIComponent(username) + '/effectivePermissions';

        return new PermissionSet(await this.authenticationService.request({
            cache: this.cacheService.users,
            method: 'GET',
            url
        }));

    }

    private getPermissionsResourceURL(dataSource: string, identifier: string, group?: boolean): string {
        const base = dataSourceUrl(dataSource);
        if (group)
            return base + '/userGroups/' + encodeURIComponent(identifier) + '/permissions';
        if (identifier === this.authenticationService.getCurrentUsername())
            return base + '/self/permissions';
        return base + '/users/' + encodeURIComponent(identifier) + '/permissions';
    }

    /**
     * Returns the permissions directly granted to the given user (or user
     * group, if group is true).
     */
    async getPermissions(dataSource: string, identifier: string, group?: boolean): Promise<PermissionSet> {
        return new PermissionSet(await this.authenticationService.request({
            cache: this.cacheService.users,
            method: 'GET',
            url: this.getPermissionsResourceURL(dataSource, identifier, group)
        }));
    }

    private addPatchOperations(patch: PermissionPatch[], op: 'add' | 'remove', permissions?: PermissionSet | null): void {

        if (!permissions)
            return;

        for (const category of OBJECT_PERMISSION_CATEGORIES) {
            for (const [identifier, types] of Object.entries(permissions[category] || {})) {
                for (const value of types)
                    patch.push({ op, path: '/' + category + '/' + identifier, value });
            }
        }

        for (const value of permissions.systemPermissions || [])
            patch.push({ op, path: '/systemPermissions', value });

    }

    async patchPermissions(dataSource: string, identifier: string, permissionsToAdd?: PermissionSet | null,
            permissionsToRemove?: PermissionSet | null, group?: boolean): Promise<void> {

        const patch: PermissionPatch[] = [];
        this.addPatchOperations(patch, 'add', permissionsToAdd);
        this.addPatchOperations(patch, 'remove', permissionsToRemove);

        await this.authenticationService.request({
            method: 'PATCH',
            url: this.getPermissionsResourceURL(dataSource, identifier, group),
            body: patch
        });

        this.cacheService.users.removeAll();

    }

}
