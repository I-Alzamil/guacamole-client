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
import { FormsModule } from '@angular/forms';
import { FormComponent } from '../form/form.component';
import { TranslatePipe } from '../locale/translate.pipe';
import { UserMenuComponent } from '../navigation/user-menu.component';
import { DataSourceService } from '../rest/data-source.service';
import { SchemaService } from '../rest/schema.service';
import { Form } from '../rest/types/field';
import { User, UserGroup } from '../rest/types/model';
import { ObjectPermissionType, PermissionFlagSet, PermissionSet, SystemPermissionType } from '../rest/types/permission-set';
import { RestError } from '../rest/types/rest-error';
import { MembershipService, PermissionService, UserGroupService, UserService } from '../rest/user.services';
import {
    ConnectionPermissionEditorComponent, DataSourceTabsComponent, IdentifierSetEditorComponent,
    ManagementButtonsComponent, SystemPermissionEditorComponent
} from './manage.components';
import { ManagementPermissions, managementPermissionsFromPermissionSet } from './management-permissions';
import { ObjectEditor, ObjectEditorParams } from './object-editor';

const EDITOR_IMPORTS = [ConnectionPermissionEditorComponent, DataSourceTabsComponent, FormComponent, FormsModule,
    IdentifierSetEditorComponent, ManagementButtonsComponent, SystemPermissionEditorComponent, TranslatePipe,
    UserMenuComponent];

/**
 * Base for the user and user group editors, which share the same handling
 * of permissions, group memberships, and multiple data sources.
 */
abstract class AccountEditor extends ObjectEditor {

    protected readonly dataSourceService = inject(DataSourceService);
    protected readonly membershipService = inject(MembershipService);
    protected readonly permissionService = inject(PermissionService);
    protected readonly schemaService = inject(SchemaService);
    protected readonly userGroupService = inject(UserGroupService);
    protected readonly userService = inject(UserService);

    protected readonly dataSources = this.authenticationService.getAvailableDataSources();

    readonly attributes = signal<Form[]>([]);
    readonly managementPermissions = signal<Record<string, ManagementPermissions> | null>(null);

    /** The identifiers of all groups the current user may modify. */
    readonly availableGroups = signal<string[]>([]);

    readonly permissionFlags = signal<PermissionFlagSet>(new PermissionFlagSet());

    // Pending changes, modified in place by the editors and applied on save
    permissionsAdded = new PermissionSet();
    permissionsRemoved = new PermissionSet();
    parentGroups: string[] = [];
    parentGroupsAdded: string[] = [];
    parentGroupsRemoved: string[] = [];

    /**
     * Returns the management permissions of the object within the current
     * data source.
     */
    current(): ManagementPermissions | null {
        return this.managementPermissions()?.[this.params()!.dataSource] ?? null;
    }

    /**
     * Resets all pending changes, adopting the given permissions and parent
     * groups. If cloning, those permissions and groups are also treated as
     * additions, such that they are applied to the new object.
     */
    protected resetChanges(permissions: PermissionSet, parentGroups: string[], cloning: boolean): void {
        this.permissionFlags.set(PermissionFlagSet.fromPermissionSet(permissions));
        this.permissionsAdded = cloning ? PermissionSet.copy(permissions) : new PermissionSet();
        this.permissionsRemoved = new PermissionSet();
        this.parentGroups = [...parentGroups];
        this.parentGroupsAdded = cloning ? [...parentGroups] : [];
        this.parentGroupsRemoved = [];
    }

    /**
     * Derives the management permissions within each data source, given
     * whether the object exists within each data source.
     */
    protected async loadManagementPermissions(createPermission: SystemPermissionType,
            category: 'userPermissions' | 'userGroupPermissions', exists: (dataSource: string) => boolean,
            identifier?: string): Promise<void> {

        const permissions = await this.dataSourceService.apply(
            (dataSource, username) => this.permissionService.getEffectivePermissions(dataSource, username),
            this.dataSources, this.authenticationService.getCurrentUsername()!);

        const managementPermissions: Record<string, ManagementPermissions> = {};
        for (const dataSource of this.dataSources) {
            managementPermissions[dataSource] = managementPermissionsFromPermissionSet(permissions[dataSource],
                createPermission, category, exists(dataSource) ? identifier : null);
        }

        this.managementPermissions.set(managementPermissions);

    }

}

/**
 * Editor for users.
 */
@Component({
    selector: 'guac-manage-user',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: EDITOR_IMPORTS,
    host: { 'class': 'manage-user view', '[class.loading]': '!loaded()' },
    template: `
        <div class="header tabbed">
            <h2>{{ 'MANAGE_USER.SECTION_HEADER_EDIT_USER' | translate }}</h2>
            <guac-user-menu />
        </div>

        @if (loaded() && user(); as user) {

            @if (!params()!.cloneSource) {
                <data-source-tabs [permissions]="managementPermissions()" [url]="getUserURL" />
            }

            @if (!current()?.canSaveObject) {
                <div class="section"><p class="notice read-only">{{ 'MANAGE_USER.INFO_READ_ONLY' | translate }}</p></div>
            } @else {

                <div class="section">
                    <table class="properties">
                        <tr>
                            <th>{{ 'MANAGE_USER.FIELD_HEADER_USERNAME' | translate }}</th>
                            <td>
                                @if (!params()!.identifier) {
                                    <input type="text" [(ngModel)]="user.username">
                                } @else {
                                    <span>{{ user.username }}</span>
                                }
                            </td>
                        </tr>
                        <tr>
                            <th>{{ 'MANAGE_USER.FIELD_HEADER_PASSWORD' | translate }}</th>
                            <td><input type="password" [(ngModel)]="user.password"></td>
                        </tr>
                        <tr>
                            <th>{{ 'MANAGE_USER.FIELD_HEADER_PASSWORD_AGAIN' | translate }}</th>
                            <td><input type="password" [(ngModel)]="passwordMatch"></td>
                        </tr>
                        <tr>
                            <th>{{ 'MANAGE_USER.FIELD_HEADER_USER_DISABLED' | translate }}</th>
                            <td><input type="checkbox" [(ngModel)]="user.disabled"></td>
                        </tr>
                    </table>
                </div>

                @if (current()?.canChangeAttributes) {
                    <div class="attributes">
                        <guac-form namespace="USER_ATTRIBUTES" [content]="attributes()" [model]="$any(user.attributes)"
                                   [modelOnly]="!current()?.canChangeAllAttributes" />
                    </div>
                }

                @if (current()?.canChangePermissions) {
                    <system-permission-editor [username]="selfUsername" [dataSource]="params()!.dataSource"
                                              [permissionFlags]="permissionFlags()" [permissionsAdded]="permissionsAdded"
                                              [permissionsRemoved]="permissionsRemoved" />
                }

                <identifier-set-editor header="MANAGE_USER.SECTION_HEADER_USER_GROUPS"
                                       emptyPlaceholder="MANAGE_USER.HELP_NO_USER_GROUPS"
                                       unavailablePlaceholder="MANAGE_USER.INFO_NO_USER_GROUPS_AVAILABLE"
                                       [identifiersAvailable]="availableGroups()" [identifiers]="parentGroups"
                                       [identifiersAdded]="parentGroupsAdded" [identifiersRemoved]="parentGroupsRemoved" />

                @if (current()?.canChangePermissions) {
                    <connection-permission-editor [dataSource]="params()!.dataSource" [permissionFlags]="permissionFlags()"
                                                  [permissionsAdded]="permissionsAdded" [permissionsRemoved]="permissionsRemoved" />
                }

                <management-buttons namespace="MANAGE_USER" [permissions]="current()"
                                    [save]="save" [delete]="delete" [clone]="clone" [return]="return" />

            }

        }
    `
})
export class ManageUserComponent extends AccountEditor {

    readonly user = signal<User | null>(null);

    /** The users having the edited username, keyed by data source. */
    private users: Record<string, User> = {};

    /**
     * The username used to represent the edited user within permission
     * changes, which may differ from the final username of a new user.
     */
    selfUsername = '';

    passwordMatch = '';

    protected async load(params: ObjectEditorParams): Promise<void> {

        const { dataSource, identifier: username, cloneSource } = params;
        this.passwordMatch = '';

        const loadUser = async () => {

            if (username) {
                const [users, permissions, parentGroups] = await Promise.all([
                    this.dataSourceService.apply((ds, name) => this.userService.getUser(ds, name), this.dataSources, username),
                    this.permissionService.getPermissions(dataSource, username)
                        .catch(this.requestService.defaultValue(new PermissionSet())),
                    this.membershipService.getUserGroups(dataSource, username)
                        .catch(this.requestService.defaultValue([]))
                ]);
                this.users = users;
                this.user.set(structuredClone(users[dataSource]) || { username, attributes: {} });
                this.selfUsername = username;
                this.resetChanges(permissions ?? new PermissionSet(), parentGroups ?? [], false);
            }

            else if (cloneSource) {
                const [user, permissions, parentGroups] = await Promise.all([
                    this.userService.getUser(dataSource, cloneSource),
                    this.permissionService.getPermissions(dataSource, cloneSource),
                    this.membershipService.getUserGroups(dataSource, cloneSource)
                ]);
                this.users = {};
                this.user.set(structuredClone(user));
                this.selfUsername = cloneSource;
                this.resetChanges(permissions, parentGroups, true);
            }

            else {
                this.users = {};
                this.user.set({ username: '', attributes: {} });
                this.selfUsername = 'SELF';
                this.resetChanges(new PermissionSet(), [], false);
            }

        };

        const [, userGroups, attributes] = await Promise.all([
            loadUser(),
            this.userGroupService.getUserGroups(dataSource, [ObjectPermissionType.UPDATE]),
            this.schemaService.getUserAttributes(dataSource)
        ]);

        this.attributes.set(attributes);
        this.availableGroups.set(Object.values(userGroups).map(group => group.identifier));
        await this.loadManagementPermissions(SystemPermissionType.CREATE_USER, 'userPermissions',
            ds => ds in this.users, username);

    }

    readonly getUserURL = (dataSource: string) =>
        '/manage/' + this.encode(dataSource) + '/users/' + this.encode(this.params()?.identifier || '');

    readonly return = () => this.router.navigateByUrl('/settings/users');

    readonly clone = () => this.navigateToClone('users');

    readonly save = async () => {

        const user = this.user()!;
        const dataSource = this.params()!.dataSource;

        if ((this.passwordMatch || '') !== (user.password || ''))
            throw new RestError({ translatableMessage: { key: 'MANAGE_USER.ERROR_PASSWORD_MISMATCH' } });

        if (dataSource in this.users)
            await this.userService.saveUser(dataSource, user);
        else
            await this.userService.createUser(dataSource, user);

        // Move any permission changes recorded against the placeholder
        // username to the actual username
        if (this.selfUsername !== user.username) {
            for (const permissions of [this.permissionsAdded, this.permissionsRemoved]) {
                if (permissions.userPermissions[this.selfUsername]) {
                    permissions.userPermissions[user.username] = permissions.userPermissions[this.selfUsername];
                    delete permissions.userPermissions[this.selfUsername];
                }
            }
        }

        await Promise.all([
            this.permissionService.patchPermissions(dataSource, user.username, this.permissionsAdded, this.permissionsRemoved),
            this.membershipService.patchUserGroups(dataSource, user.username, this.parentGroupsAdded, this.parentGroupsRemoved)
        ]);

    };

    readonly delete = () => this.userService.deleteUser(this.params()!.dataSource, this.user()!);

}

/**
 * Editor for user groups.
 */
@Component({
    selector: 'guac-manage-user-group',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: EDITOR_IMPORTS,
    host: { 'class': 'manage-user-group view', '[class.loading]': '!loaded()' },
    template: `
        <div class="header tabbed">
            <h2>{{ 'MANAGE_USER_GROUP.SECTION_HEADER_EDIT_USER_GROUP' | translate }}</h2>
            <guac-user-menu />
        </div>

        @if (loaded() && userGroup(); as group) {

            @if (!params()!.cloneSource) {
                <data-source-tabs [permissions]="managementPermissions()" [url]="getUserGroupURL" />
            }

            @if (!current()?.canSaveObject) {
                <div class="section"><p class="notice read-only">{{ 'MANAGE_USER_GROUP.INFO_READ_ONLY' | translate }}</p></div>
            } @else {

                <div class="section">
                    <table class="properties">
                        <tr>
                            <th>{{ 'MANAGE_USER_GROUP.FIELD_HEADER_USER_GROUP_NAME' | translate }}</th>
                            <td>
                                @if (!params()!.identifier) {
                                    <input type="text" [(ngModel)]="group.identifier">
                                } @else {
                                    <span>{{ group.identifier }}</span>
                                }
                            </td>
                        </tr>
                        <tr>
                            <th>{{ 'MANAGE_USER_GROUP.FIELD_HEADER_USER_GROUP_DISABLED' | translate }}</th>
                            <td><input type="checkbox" [(ngModel)]="group.disabled"></td>
                        </tr>
                    </table>
                </div>

                @if (current()?.canChangeAttributes) {
                    <div class="attributes">
                        <guac-form namespace="USER_GROUP_ATTRIBUTES" [content]="attributes()" [model]="$any(group.attributes)"
                                   [modelOnly]="!current()?.canChangeAllAttributes" />
                    </div>
                }

                @if (current()?.canChangePermissions) {
                    <system-permission-editor [dataSource]="params()!.dataSource" [permissionFlags]="permissionFlags()"
                                              [permissionsAdded]="permissionsAdded" [permissionsRemoved]="permissionsRemoved" />
                }

                <identifier-set-editor header="MANAGE_USER_GROUP.SECTION_HEADER_USER_GROUPS"
                                       emptyPlaceholder="MANAGE_USER_GROUP.HELP_NO_USER_GROUPS"
                                       unavailablePlaceholder="MANAGE_USER_GROUP.INFO_NO_USER_GROUPS_AVAILABLE"
                                       [identifiersAvailable]="availableGroups()" [identifiers]="parentGroups"
                                       [identifiersAdded]="parentGroupsAdded" [identifiersRemoved]="parentGroupsRemoved" />

                <identifier-set-editor header="MANAGE_USER_GROUP.SECTION_HEADER_MEMBER_USER_GROUPS"
                                       emptyPlaceholder="MANAGE_USER_GROUP.HELP_NO_MEMBER_USER_GROUPS"
                                       unavailablePlaceholder="MANAGE_USER_GROUP.INFO_NO_USER_GROUPS_AVAILABLE"
                                       [identifiersAvailable]="availableGroups()" [identifiers]="memberGroups"
                                       [identifiersAdded]="memberGroupsAdded" [identifiersRemoved]="memberGroupsRemoved" />

                <identifier-set-editor header="MANAGE_USER_GROUP.SECTION_HEADER_MEMBER_USERS"
                                       emptyPlaceholder="MANAGE_USER_GROUP.HELP_NO_MEMBER_USERS"
                                       unavailablePlaceholder="MANAGE_USER_GROUP.INFO_NO_USERS_AVAILABLE"
                                       [identifiersAvailable]="availableUsers()" [identifiers]="memberUsers"
                                       [identifiersAdded]="memberUsersAdded" [identifiersRemoved]="memberUsersRemoved" />

                @if (current()?.canChangePermissions) {
                    <connection-permission-editor [dataSource]="params()!.dataSource" [permissionFlags]="permissionFlags()"
                                                  [permissionsAdded]="permissionsAdded" [permissionsRemoved]="permissionsRemoved" />
                }

                <management-buttons namespace="MANAGE_USER_GROUP" [permissions]="current()"
                                    [save]="save" [delete]="delete" [clone]="clone" [return]="return" />

            }

        }
    `
})
export class ManageUserGroupComponent extends AccountEditor {

    readonly userGroup = signal<UserGroup | null>(null);

    /** The identifiers of all users the current user may modify. */
    readonly availableUsers = signal<string[]>([]);

    /** The user groups having the edited identifier, keyed by data source. */
    private userGroups: Record<string, UserGroup> = {};

    memberGroups: string[] = [];
    memberGroupsAdded: string[] = [];
    memberGroupsRemoved: string[] = [];
    memberUsers: string[] = [];
    memberUsersAdded: string[] = [];
    memberUsersRemoved: string[] = [];

    private resetMembers(memberGroups: string[], memberUsers: string[], cloning: boolean): void {
        this.memberGroups = [...memberGroups];
        this.memberGroupsAdded = cloning ? [...memberGroups] : [];
        this.memberGroupsRemoved = [];
        this.memberUsers = [...memberUsers];
        this.memberUsersAdded = cloning ? [...memberUsers] : [];
        this.memberUsersRemoved = [];
    }

    protected async load(params: ObjectEditorParams): Promise<void> {

        const { dataSource, identifier, cloneSource } = params;

        const loadGroup = async () => {

            const source = identifier || cloneSource;
            if (!source) {
                this.userGroups = {};
                this.userGroup.set({ identifier: '', attributes: {} });
                this.resetChanges(new PermissionSet(), [], false);
                this.resetMembers([], [], false);
                return;
            }

            const tolerant = <T>(promise: Promise<T>, value: T) =>
                identifier ? promise.catch(this.requestService.defaultValue(value)) as Promise<T> : promise;

            const [userGroups, permissions, parentGroups, memberGroups, memberUsers] = await Promise.all([
                this.dataSourceService.apply((ds, id) => this.userGroupService.getUserGroup(ds, id),
                    identifier ? this.dataSources : [dataSource], source),
                tolerant(this.permissionService.getPermissions(dataSource, source, true), new PermissionSet()),
                tolerant(this.membershipService.getUserGroups(dataSource, source, true), []),
                tolerant(this.membershipService.getMemberUserGroups(dataSource, source), []),
                tolerant(this.membershipService.getMemberUsers(dataSource, source), [])
            ]);

            this.userGroups = identifier ? userGroups : {};
            this.userGroup.set(structuredClone(userGroups[dataSource]) || { identifier: source, attributes: {} });
            this.resetChanges(permissions ?? new PermissionSet(), parentGroups ?? [], !identifier);
            this.resetMembers(memberGroups ?? [], memberUsers ?? [], !identifier);

        };

        const [, userGroups, users, attributes] = await Promise.all([
            loadGroup(),
            this.userGroupService.getUserGroups(dataSource, [ObjectPermissionType.UPDATE]),
            this.userService.getUsers(dataSource, [ObjectPermissionType.UPDATE]),
            this.schemaService.getUserGroupAttributes(dataSource)
        ]);

        this.attributes.set(attributes);
        this.availableGroups.set(Object.values(userGroups).map(group => group.identifier));
        this.availableUsers.set(Object.values(users).map(user => user.username));
        await this.loadManagementPermissions(SystemPermissionType.CREATE_USER_GROUP, 'userGroupPermissions',
            ds => ds in this.userGroups, identifier);

    }

    readonly getUserGroupURL = (dataSource: string) =>
        '/manage/' + this.encode(dataSource) + '/userGroups/' + this.encode(this.params()?.identifier || '');

    readonly return = () => this.router.navigateByUrl('/settings/userGroups');

    readonly clone = () => this.navigateToClone('userGroups');

    readonly save = async () => {

        const group = this.userGroup()!;
        const dataSource = this.params()!.dataSource;

        if (dataSource in this.userGroups)
            await this.userGroupService.saveUserGroup(dataSource, group);
        else
            await this.userGroupService.createUserGroup(dataSource, group);

        await Promise.all([
            this.permissionService.patchPermissions(dataSource, group.identifier, this.permissionsAdded, this.permissionsRemoved, true),
            this.membershipService.patchUserGroups(dataSource, group.identifier, this.parentGroupsAdded, this.parentGroupsRemoved, true),
            this.membershipService.patchMemberUserGroups(dataSource, group.identifier, this.memberGroupsAdded, this.memberGroupsRemoved),
            this.membershipService.patchMemberUsers(dataSource, group.identifier, this.memberUsersAdded, this.memberUsersRemoved)
        ]);

    };

    readonly delete = () => this.userGroupService.deleteUserGroup(this.params()!.dataSource, this.userGroup()!);

}
