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
import { FormsModule } from '@angular/forms';
import { FormComponent } from '../form/form.component';
import { PagerComponent, UserItemComponent } from '../list/list.components';
import { orderBy } from '../list/sort-order';
import { GuacDatePipe } from '../locale/date.pipe';
import { TranslatePipe } from '../locale/translate.pipe';
import { UserMenuComponent } from '../navigation/user-menu.component';
import { ConnectionGroupService, ConnectionService, SharingProfileService } from '../rest/connection.services';
import { PermissionService } from '../rest/user.services';
import { SchemaService } from '../rest/schema.service';
import { Form } from '../rest/types/field';
import {
    Connection, ConnectionGroup, ConnectionGroupType, Protocol, ROOT_CONNECTION_GROUP, SharingProfile,
    getProtocolName, getProtocolNamespace
} from '../rest/types/model';
import { ObjectPermissionType, SystemPermissionType } from '../rest/types/permission-set';
import { LocationChooserComponent, ManagementButtonsComponent } from './manage.components';
import { HistoryEntryWrapper, ManagementPermissions, managementPermissionsFromPermissionSet } from './management-permissions';
import { ObjectEditor, ObjectEditorParams } from './object-editor';

/**
 * Editor for connections.
 */
@Component({
    selector: 'guac-manage-connection',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormComponent, FormsModule, GuacDatePipe, LocationChooserComponent, ManagementButtonsComponent,
        PagerComponent, TranslatePipe, UserItemComponent, UserMenuComponent],
    host: { 'class': 'manage-connection view', '[class.loading]': '!loaded()' },
    template: `
        <div class="header">
            <h2>{{ 'MANAGE_CONNECTION.SECTION_HEADER_EDIT_CONNECTION' | translate }}</h2>
            <guac-user-menu />
        </div>

        @if (loaded() && connection(); as connection) {

            <div class="section">
                <table class="properties">
                    <tr>
                        <th>{{ 'MANAGE_CONNECTION.FIELD_HEADER_NAME' | translate }}</th>
                        <td><input type="text" [(ngModel)]="connection.name" autocorrect="off" autocapitalize="off"></td>
                    </tr>
                    <tr>
                        <th>{{ 'MANAGE_CONNECTION.FIELD_HEADER_LOCATION' | translate }}</th>
                        <td><location-chooser [dataSource]="params()!.dataSource" [rootGroup]="rootGroup()"
                                              [(value)]="connection.parentIdentifier" /></td>
                    </tr>
                    <tr>
                        <th>{{ 'MANAGE_CONNECTION.FIELD_HEADER_PROTOCOL' | translate }}</th>
                        <td>
                            <select [(ngModel)]="connection.protocol">
                                @for (protocol of sortedProtocols(); track protocol.name) {
                                    <option [ngValue]="protocol.name">{{ getProtocolName(protocol.name) | translate }}</option>
                                }
                            </select>
                        </td>
                    </tr>
                </table>
            </div>

            <div class="attributes">
                <guac-form namespace="CONNECTION_ATTRIBUTES" [content]="attributes()" [model]="$any(connection.attributes)"
                           [modelOnly]="!managementPermissions()?.canChangeAllAttributes" />
            </div>

            <h2 class="header">{{ 'MANAGE_CONNECTION.SECTION_HEADER_PARAMETERS' | translate }}</h2>
            <div class="section connection-parameters">
                <guac-form [namespace]="getProtocolNamespace(connection.protocol) ?? undefined"
                           [content]="protocols()[connection.protocol!]?.connectionForms" [model]="parameters" />
            </div>

            <management-buttons namespace="MANAGE_CONNECTION" [permissions]="managementPermissions()"
                                [save]="save" [delete]="delete" [clone]="clone" [return]="return" />

            <h2 class="header">{{ 'MANAGE_CONNECTION.SECTION_HEADER_HISTORY' | translate }}</h2>
            <div class="history section">
                @if (!historyEntryWrappers().length) {
                    <p>{{ 'MANAGE_CONNECTION.INFO_CONNECTION_NOT_USED' | translate }}</p>
                } @else {
                    <table>
                        <thead>
                            <tr>
                                <th>{{ 'MANAGE_CONNECTION.TABLE_HEADER_HISTORY_USERNAME' | translate }}</th>
                                <th>{{ 'MANAGE_CONNECTION.TABLE_HEADER_HISTORY_START' | translate }}</th>
                                <th>{{ 'MANAGE_CONNECTION.TABLE_HEADER_HISTORY_DURATION' | translate }}</th>
                                <th>{{ 'MANAGE_CONNECTION.TABLE_HEADER_HISTORY_REMOTEHOST' | translate }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (wrapper of wrapperPage(); track wrapper) {
                                <tr>
                                    <td class="username"><guac-user-item [username]="wrapper.entry.username" /></td>
                                    <td class="start">{{ wrapper.entry.startDate | guacDate: 'MANAGE_CONNECTION.FORMAT_HISTORY_START' }}</td>
                                    <td class="duration">{{ wrapper.durationText | translate: { VALUE: wrapper.duration?.value, UNIT: wrapper.duration?.unit } }}</td>
                                    <td class="remoteHost">{{ wrapper.entry.remoteHost }}</td>
                                </tr>
                            }
                        </tbody>
                    </table>
                }
                <guac-pager [(page)]="wrapperPage" [items]="historyEntryWrappers()" />
            </div>

        }
    `
})
export class ManageConnectionComponent extends ObjectEditor {

    private readonly connectionService = inject(ConnectionService);
    private readonly connectionGroupService = inject(ConnectionGroupService);
    private readonly permissionService = inject(PermissionService);
    private readonly schemaService = inject(SchemaService);

    protected readonly getProtocolName = getProtocolName;
    protected readonly getProtocolNamespace = getProtocolNamespace;

    readonly connection = signal<Connection | null>(null);
    readonly protocols = signal<Record<string, Protocol>>({});
    readonly rootGroup = signal<ConnectionGroup | null>(null);
    readonly attributes = signal<Form[]>([]);
    readonly managementPermissions = signal<ManagementPermissions | null>(null);
    readonly historyEntryWrappers = signal<HistoryEntryWrapper[]>([]);
    readonly wrapperPage = signal<HistoryEntryWrapper[]>([]);

    /** The connection parameters, edited in place. */
    parameters: Record<string, string> = {};

    readonly sortedProtocols = computed(() => orderBy(Object.values(this.protocols()), 'name'));

    protected async load(params: ObjectEditorParams): Promise<void> {

        const { dataSource, identifier, cloneSource } = params;

        const loadConnection = async () => {

            const source = identifier || cloneSource;
            if (!source) {
                this.connection.set({ protocol: 'vnc', parentIdentifier: params.parent, attributes: {} });
                this.parameters = {};
                this.historyEntryWrappers.set([]);
                return;
            }

            const [connection, parameters, history] = await Promise.all([
                this.connectionService.getConnection(dataSource, source),
                this.connectionService.getConnectionParameters(dataSource, source),
                identifier ? this.connectionService.getConnectionHistory(dataSource, identifier) : Promise.resolve([])
            ]);

            // Work on copies, as the originals may be cached
            const copy = structuredClone(connection);
            if (!identifier)
                delete copy.identifier;

            this.connection.set(copy);
            this.parameters = { ...parameters };
            this.historyEntryWrappers.set(history.map(entry => new HistoryEntryWrapper(entry)));

        };

        const [, attributes, permissions, protocols, rootGroup] = await Promise.all([
            loadConnection(),
            this.schemaService.getConnectionAttributes(dataSource),
            this.permissionService.getEffectivePermissions(dataSource, this.authenticationService.getCurrentUsername()!),
            this.schemaService.getProtocols(dataSource),
            this.connectionGroupService.getConnectionGroupTree(dataSource, ROOT_CONNECTION_GROUP, [ObjectPermissionType.ADMINISTER])
        ]);

        this.attributes.set(attributes);
        this.protocols.set(protocols);
        this.rootGroup.set(rootGroup);
        this.managementPermissions.set(managementPermissionsFromPermissionSet(permissions,
            SystemPermissionType.CREATE_CONNECTION, 'connectionPermissions', identifier));

    }

    readonly return = () => this.router.navigateByUrl('/settings/' + this.encode(this.params()!.dataSource) + '/connections');

    readonly clone = () => this.navigateToClone('connections');

    readonly save = () => {
        const connection = this.connection()!;
        connection.parameters = this.parameters;
        return this.connectionService.saveConnection(this.params()!.dataSource, connection);
    };

    readonly delete = () => this.connectionService.deleteConnection(this.params()!.dataSource, this.connection()!);

}

/**
 * Editor for connection groups.
 */
@Component({
    selector: 'guac-manage-connection-group',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormComponent, FormsModule, LocationChooserComponent, ManagementButtonsComponent, TranslatePipe, UserMenuComponent],
    host: { 'class': 'manage-connection-group view', '[class.loading]': '!loaded()' },
    template: `
        <div class="header">
            <h2>{{ 'MANAGE_CONNECTION_GROUP.SECTION_HEADER_EDIT_CONNECTION_GROUP' | translate }}</h2>
            <guac-user-menu />
        </div>

        @if (loaded() && connectionGroup(); as group) {

            <div class="section">
                <table class="properties">
                    <tr>
                        <th>{{ 'MANAGE_CONNECTION_GROUP.FIELD_HEADER_NAME' | translate }}</th>
                        <td><input type="text" [(ngModel)]="group.name" autocorrect="off" autocapitalize="off"></td>
                    </tr>
                    <tr>
                        <th>{{ 'MANAGE_CONNECTION_GROUP.FIELD_HEADER_LOCATION' | translate }}</th>
                        <td><location-chooser [dataSource]="params()!.dataSource" [rootGroup]="rootGroup()"
                                              [(value)]="group.parentIdentifier" /></td>
                    </tr>
                    <tr>
                        <th>{{ 'MANAGE_CONNECTION_GROUP.FIELD_HEADER_TYPE' | translate }}</th>
                        <td>
                            <select [(ngModel)]="group.type">
                                @for (type of types; track type.value) {
                                    <option [ngValue]="type.value">{{ type.label | translate }}</option>
                                }
                            </select>
                        </td>
                    </tr>
                </table>
            </div>

            <div class="attributes">
                <guac-form namespace="CONNECTION_GROUP_ATTRIBUTES" [content]="attributes()" [model]="$any(group.attributes)"
                           [modelOnly]="!managementPermissions()?.canChangeAllAttributes" />
            </div>

            <management-buttons namespace="MANAGE_CONNECTION_GROUP" [permissions]="managementPermissions()"
                                [save]="save" [delete]="delete" [clone]="clone" [return]="return" />

        }
    `
})
export class ManageConnectionGroupComponent extends ObjectEditor {

    private readonly connectionGroupService = inject(ConnectionGroupService);
    private readonly permissionService = inject(PermissionService);
    private readonly schemaService = inject(SchemaService);

    readonly types = [
        { label: 'MANAGE_CONNECTION_GROUP.NAME_TYPE_ORGANIZATIONAL', value: ConnectionGroupType.ORGANIZATIONAL },
        { label: 'MANAGE_CONNECTION_GROUP.NAME_TYPE_BALANCING', value: ConnectionGroupType.BALANCING }
    ];

    readonly connectionGroup = signal<ConnectionGroup | null>(null);
    readonly rootGroup = signal<ConnectionGroup | null>(null);
    readonly attributes = signal<Form[]>([]);
    readonly managementPermissions = signal<ManagementPermissions | null>(null);

    protected async load(params: ObjectEditorParams): Promise<void> {

        const { dataSource, identifier, cloneSource } = params;

        const loadGroup = async () => {

            const source = identifier || cloneSource;
            if (!source) {
                this.connectionGroup.set({
                    type: ConnectionGroupType.ORGANIZATIONAL,
                    parentIdentifier: params.parent || ROOT_CONNECTION_GROUP,
                    attributes: {}
                });
                return;
            }

            const group = structuredClone(await this.connectionGroupService.getConnectionGroup(dataSource, source));
            if (!identifier)
                delete group.identifier;
            this.connectionGroup.set(group);

        };

        const [, attributes, permissions, rootGroup] = await Promise.all([
            loadGroup(),
            this.schemaService.getConnectionGroupAttributes(dataSource),
            this.permissionService.getEffectivePermissions(dataSource, this.authenticationService.getCurrentUsername()!),
            this.connectionGroupService.getConnectionGroupTree(dataSource, ROOT_CONNECTION_GROUP, [ObjectPermissionType.ADMINISTER])
        ]);

        this.attributes.set(attributes);
        this.rootGroup.set(rootGroup);
        this.managementPermissions.set(managementPermissionsFromPermissionSet(permissions,
            SystemPermissionType.CREATE_CONNECTION_GROUP, 'connectionGroupPermissions', identifier));

    }

    readonly return = () => this.router.navigateByUrl('/settings/' + this.encode(this.params()!.dataSource) + '/connections');

    readonly clone = () => this.navigateToClone('connectionGroups');

    readonly save = () => this.connectionGroupService.saveConnectionGroup(this.params()!.dataSource, this.connectionGroup()!);

    readonly delete = () => this.connectionGroupService.deleteConnectionGroup(this.params()!.dataSource, this.connectionGroup()!);

}

/**
 * Editor for sharing profiles.
 */
@Component({
    selector: 'guac-manage-sharing-profile',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormComponent, FormsModule, ManagementButtonsComponent, TranslatePipe, UserMenuComponent],
    host: { 'class': 'manage-sharing-profile view', '[class.loading]': '!loaded()' },
    template: `
        <div class="header">
            <h2>{{ 'MANAGE_SHARING_PROFILE.SECTION_HEADER_EDIT_SHARING_PROFILE' | translate }}</h2>
            <guac-user-menu />
        </div>

        @if (loaded() && sharingProfile(); as profile) {

            <div class="section">
                <table class="properties">
                    <tr>
                        <th>{{ 'MANAGE_SHARING_PROFILE.FIELD_HEADER_NAME' | translate }}</th>
                        <td><input type="text" [(ngModel)]="profile.name" autocorrect="off" autocapitalize="off"></td>
                    </tr>
                    <tr>
                        <th>{{ 'MANAGE_SHARING_PROFILE.FIELD_HEADER_PRIMARY_CONNECTION' | translate }}</th>
                        <td>{{ primaryConnection()?.name }}</td>
                    </tr>
                </table>
            </div>

            <div class="attributes">
                <guac-form namespace="SHARING_PROFILE_ATTRIBUTES" [content]="attributes()" [model]="$any(profile.attributes)"
                           [modelOnly]="!managementPermissions()?.canChangeAllAttributes" />
            </div>

            <h2 class="header">{{ 'MANAGE_SHARING_PROFILE.SECTION_HEADER_PARAMETERS' | translate }}</h2>
            <div class="section connection-parameters">
                <guac-form [namespace]="getProtocolNamespace(primaryConnection()?.protocol) ?? undefined"
                           [content]="protocols()[primaryConnection()?.protocol!]?.sharingProfileForms" [model]="parameters" />
            </div>

            <management-buttons namespace="MANAGE_SHARING_PROFILE" [permissions]="managementPermissions()"
                                [save]="save" [delete]="delete" [clone]="clone" [return]="return" />

        }
    `
})
export class ManageSharingProfileComponent extends ObjectEditor {

    private readonly connectionService = inject(ConnectionService);
    private readonly permissionService = inject(PermissionService);
    private readonly schemaService = inject(SchemaService);
    private readonly sharingProfileService = inject(SharingProfileService);

    protected readonly getProtocolNamespace = getProtocolNamespace;

    readonly sharingProfile = signal<SharingProfile | null>(null);
    readonly primaryConnection = signal<Connection | null>(null);
    readonly protocols = signal<Record<string, Protocol>>({});
    readonly attributes = signal<Form[]>([]);
    readonly managementPermissions = signal<ManagementPermissions | null>(null);

    /** The sharing profile parameters, edited in place. */
    parameters: Record<string, string> = {};

    protected async load(params: ObjectEditorParams): Promise<void> {

        const { dataSource, identifier, cloneSource } = params;

        const loadProfile = async () => {

            const source = identifier || cloneSource;
            let profile: SharingProfile;

            if (!source) {
                profile = { primaryConnectionIdentifier: params.parent, attributes: {} };
                this.parameters = {};
            }
            else {
                const [existing, parameters] = await Promise.all([
                    this.sharingProfileService.getSharingProfile(dataSource, source),
                    this.sharingProfileService.getSharingProfileParameters(dataSource, source)
                ]);
                profile = structuredClone(existing);
                if (!identifier)
                    delete profile.identifier;
                this.parameters = { ...parameters };
            }

            this.sharingProfile.set(profile);
            this.primaryConnection.set(await this.connectionService.getConnection(dataSource, profile.primaryConnectionIdentifier!));

        };

        const [, attributes, protocols, permissions] = await Promise.all([
            loadProfile(),
            this.schemaService.getSharingProfileAttributes(dataSource),
            this.schemaService.getProtocols(dataSource),
            this.permissionService.getEffectivePermissions(dataSource, this.authenticationService.getCurrentUsername()!)
        ]);

        this.attributes.set(attributes);
        this.protocols.set(protocols);
        this.managementPermissions.set(managementPermissionsFromPermissionSet(permissions,
            SystemPermissionType.CREATE_SHARING_PROFILE, 'sharingProfilePermissions', identifier));

    }

    readonly return = () => this.router.navigateByUrl('/settings/' + this.encode(this.params()!.dataSource) + '/connections');

    readonly clone = () => this.navigateToClone('sharingProfiles');

    readonly save = () => {
        const profile = this.sharingProfile()!;
        profile.parameters = this.parameters;
        return this.sharingProfileService.saveSharingProfile(this.params()!.dataSource, profile);
    };

    readonly delete = () => this.sharingProfileService.deleteSharingProfile(this.params()!.dataSource, this.sharingProfile()!);

}
