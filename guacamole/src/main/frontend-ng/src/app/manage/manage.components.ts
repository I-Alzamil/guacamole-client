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

import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthenticationService } from '../auth/authentication.service';
import { GroupListFilterComponent } from '../group-list/group-list-filter.component';
import { GroupListItem, GroupListItemType } from '../group-list/group-list-item';
import { GroupListComponent } from '../group-list/group-list.component';
import { PagerComponent } from '../list/list.components';
import { TranslatePipe } from '../locale/translate.pipe';
import { canonicalize } from '../locale/translation.service';
import { PageDefinition } from '../navigation/page-definition';
import { PageListComponent } from '../navigation/page-list.component';
import { SectionTabsComponent } from '../navigation/section-tabs.component';
import { NotificationService } from '../notification/notification.service';
import { ConnectionGroupService } from '../rest/connection.services';
import { RequestService } from '../rest/request.service';
import { ConnectionGroup, ROOT_CONNECTION_GROUP } from '../rest/types/model';
import { ObjectPermissionCategory, ObjectPermissionType, PermissionFlagSet, PermissionSet, SystemPermissionType } from '../rest/types/permission-set';
import { PermissionService } from '../rest/user.services';
import { DataSourceService } from '../rest/data-source.service';
import { ManagementPermissions, recordObjectPermissionChange, recordSystemPermissionChange } from './management-permissions';

/**
 * The save, clone, cancel, and delete buttons of an object editor. Saving and
 * deleting return to the previous page upon success, displaying any error
 * otherwise.
 */
@Component({
    selector: 'management-buttons',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [TranslatePipe],
    host: { class: 'action-buttons' },
    template: `
        @if (permissions()?.canSaveObject) {
            <button (click)="saveObject()" class="save">{{ namespace() + '.ACTION_SAVE' | translate }}</button>
        }
        @if (permissions()?.canCloneObject) {
            <button (click)="clone()()" class="clone">{{ namespace() + '.ACTION_CLONE' | translate }}</button>
        }
        <button (click)="return()()" class="cancel">{{ namespace() + '.ACTION_CANCEL' | translate }}</button>
        @if (permissions()?.canDeleteObject) {
            <button (click)="deleteObject()" class="danger delete">{{ namespace() + '.ACTION_DELETE' | translate }}</button>
        }
    `
})
export class ManagementButtonsComponent {

    private readonly notificationService = inject(NotificationService);

    /** The translation namespace of the editor (such as "MANAGE_USER"). */
    readonly namespace = input.required<string>();

    readonly permissions = input<ManagementPermissions | null>();

    readonly save = input.required<() => Promise<unknown>>();
    readonly clone = input.required<() => void>();
    readonly delete = input.required<() => Promise<unknown>>();
    readonly return = input.required<() => void>();

    saveObject(): void {
        this.save()().then(() => this.return()(), this.notificationService.SHOW_REQUEST_ERROR);
    }

    /**
     * Prompts for confirmation before deleting the object.
     */
    deleteObject(): void {
        this.notificationService.showStatus({
            title: this.namespace() + '.DIALOG_HEADER_CONFIRM_DELETE',
            text: { key: this.namespace() + '.TEXT_CONFIRM_DELETE' },
            actions: [
                {
                    name: this.namespace() + '.ACTION_DELETE',
                    className: 'danger',
                    callback: () => {
                        this.delete()().then(() => this.return()(), this.notificationService.SHOW_REQUEST_ERROR);
                        this.notificationService.showStatus(false);
                    }
                },
                { name: this.namespace() + '.ACTION_CANCEL', callback: () => this.notificationService.showStatus(false) }
            ]
        });
    }

}

/**
 * Tabs for switching between the data sources containing an object.
 */
@Component({
    selector: 'data-source-tabs',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [PageListComponent],
    host: { class: 'page-tabs' },
    template: `<guac-page-list [pages]="pages()" />`
})
export class DataSourceTabsComponent {

    /** The management permissions of the object within each data source. */
    readonly permissions = input<Record<string, ManagementPermissions> | null>();

    /** Returns the URL of the editor for the given data source. */
    readonly url = input.required<(dataSource: string) => string>();

    readonly pages = computed<PageDefinition[]>(() => {

        const permissions = this.permissions() || {};
        const pages: PageDefinition[] = [];

        for (const dataSource of Object.keys(permissions).sort()) {

            const managementPermissions = permissions[dataSource];
            const exists = !!managementPermissions.identifier;
            const readOnly = !managementPermissions.canSaveObject;

            // Data sources in which the object neither exists nor can be
            // created are irrelevant
            if (!exists && readOnly)
                continue;

            pages.push({
                name: canonicalize('DATA_SOURCE_' + dataSource) + '.NAME',
                url: this.url()(dataSource),
                className: readOnly ? 'read-only' : (exists ? 'linked' : 'unlinked')
            });

        }

        return pages;

    });

}

/**
 * A dropdown for choosing the parent connection group of an object.
 */
@Component({
    selector: 'location-chooser',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [GroupListComponent],
    host: { class: 'location-chooser' },
    template: `
        <div (click)="menuOpen.set(!menuOpen())" class="location">{{ chosenName() }}</div>
        <div class="dropdown" [hidden]="!menuOpen()">
            <guac-group-list [showRootGroup]="true" [connectionGroups]="rootGroups()"
                             [templates]="{ 'connection-group': group }" />
        </div>

        <ng-template #group let-item>
            <span class="location-chooser-connection-group name" (click)="choose(item)">{{ item.name }}</span>
        </ng-template>
    `
})
export class LocationChooserComponent {

    readonly dataSource = input.required<string>();

    readonly rootGroup = input<ConnectionGroup | null>();

    /** The identifier of the chosen connection group. */
    readonly value = model<string | undefined>();

    readonly menuOpen = signal(false);

    readonly rootGroups = computed(() => {
        const rootGroup = this.rootGroup();
        return rootGroup ? { [this.dataSource()]: rootGroup } : null;
    });

    /** All connection groups within the root group, keyed by identifier. */
    private readonly connectionGroups = computed(() => {
        const groups: Record<string, ConnectionGroup> = {};
        const map = (group: ConnectionGroup) => {
            groups[group.identifier!] = group;
            group.childConnectionGroups?.forEach(map);
        };
        const rootGroup = this.rootGroup();
        if (rootGroup)
            map(rootGroup);
        return groups;
    });

    readonly chosenName = computed(() => this.connectionGroups()[this.value() ?? '']?.name);

    constructor() {
        // Default to the root group if no valid group is chosen
        effect(() => {
            const rootGroup = this.rootGroup();
            const groups = this.connectionGroups();
            const value = untracked(this.value);
            if (rootGroup && (!value || !(value in groups)))
                this.value.set(rootGroup.identifier);
        });
    }

    choose(item: GroupListItem): void {
        this.value.set(item.identifier);
        this.menuOpen.set(false);
    }

}

/**
 * Inserts the given identifier into the given sorted array, if not already
 * present.
 */
function insertSorted(array: string[], identifier: string): void {
    let index = 0;
    while (index < array.length && array[index] < identifier)
        index++;
    if (array[index] !== identifier)
        array.splice(index, 0, identifier);
}

/**
 * Removes the given identifier from the given array, returning whether it
 * was present.
 */
function removeFrom(array: string[], identifier: string): boolean {
    const index = array.indexOf(identifier);
    if (index === -1)
        return false;
    array.splice(index, 1);
    return true;
}

/**
 * An editor for a set of related object identifiers (such as group
 * memberships), tracking which identifiers have been added and removed.
 */
@Component({
    selector: 'identifier-set-editor',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, PagerComponent, TranslatePipe],
    host: { 'class': 'related-objects', '[hidden]': 'isEmpty()' },
    template: `
        <div class="header">
            <h2>{{ header() | translate }}</h2>
            <div class="filter">
                <input class="search-string" type="text" [ngModel]="filterString()" (ngModelChange)="filterString.set($event)"
                       [placeholder]="'SETTINGS_USERS.FIELD_PLACEHOLDER_FILTER' | translate">
            </div>
        </div>
        <div class="section">

            <div class="abbreviated-related-objects">
                @if (!expanded()) {
                    <img src="images/arrows/right.svg" alt="Expand" class="expand" (click)="expanded.set(true)">
                } @else {
                    <img src="images/arrows/down.svg" alt="Collapse" class="collapse" (click)="expanded.set(false)">
                }
                @if (!identifiers()?.length) {
                    <p class="no-related-objects">{{ emptyPlaceholder() | translate }}</p>
                }
                <ul>
                    @for (identifier of filter(identifiers()); track identifier) {
                        <li>
                            <label>
                                @if (isEditable(identifier)) {
                                    <img src="images/x-red.svg" alt="Remove" class="remove" (click)="setPresent(identifier, false)">
                                }
                                <span class="identifier">{{ identifier }}</span>
                            </label>
                        </li>
                    }
                </ul>
            </div>

            <div class="all-related-objects" [hidden]="!expanded()">
                @if (!page().length) {
                    <p class="no-objects-available">{{ unavailablePlaceholder() | translate }}</p>
                }
                <ul>
                    @for (identifier of page(); track identifier) {
                        <li>
                            <label>
                                <input type="checkbox" [ngModel]="isPresent(identifier)"
                                       (ngModelChange)="setPresent(identifier, $event)">
                                <span class="identifier">{{ identifier }}</span>
                            </label>
                        </li>
                    }
                </ul>
                <guac-pager [(page)]="page" [pageSize]="25" [items]="filteredAvailable()" />
            </div>

        </div>
    `
})
export class IdentifierSetEditorComponent {

    readonly header = input.required<string>();
    readonly emptyPlaceholder = input.required<string>();
    readonly unavailablePlaceholder = input.required<string>();

    /** All identifiers which may be added or removed. */
    readonly identifiersAvailable = input<string[] | null>();

    /** The current identifiers, modified in place. */
    readonly identifiers = input<string[] | null>();

    /** Identifiers added, modified in place. */
    readonly identifiersAdded = input.required<string[]>();

    /** Identifiers removed, modified in place. */
    readonly identifiersRemoved = input.required<string[]>();

    readonly expanded = signal(false);
    readonly page = signal<string[]>([]);

    readonly filterString = signal('');

    /**
     * All available identifiers matching the current filter, sorted. This
     * must be a stable array (rather than computed on each check), as it is
     * provided to the pager.
     */
    readonly filteredAvailable = computed(() => this.filter([...(this.identifiersAvailable() || [])].sort()));

    private readonly editable = computed(() => new Set(this.identifiersAvailable() || []));

    constructor() {
        effect(() => this.identifiers()?.sort());
    }

    filter(identifiers: string[] | null | undefined): string[] {
        const filter = this.filterString().toLowerCase();
        return (identifiers || []).filter(identifier => identifier.toLowerCase().includes(filter));
    }

    isEditable(identifier: string): boolean {
        return this.editable().has(identifier);
    }

    isPresent(identifier: string): boolean {
        return !!this.identifiers()?.includes(identifier);
    }

    setPresent(identifier: string, present: boolean): void {

        const identifiers = this.identifiers();
        if (!identifiers)
            return;

        if (present) {
            insertSorted(identifiers, identifier);
            if (!removeFrom(this.identifiersRemoved(), identifier))
                insertSorted(this.identifiersAdded(), identifier);
        }
        else {
            removeFrom(identifiers, identifier);
            if (!removeFrom(this.identifiersAdded(), identifier))
                insertSorted(this.identifiersRemoved(), identifier);
        }

    }

    isEmpty(): boolean {
        return !this.identifiers()?.length && !this.identifiersAvailable()?.length;
    }

}

/**
 * System permission types which may be granted, along with their labels.
 */
const SYSTEM_PERMISSION_TYPES = [
    { label: 'MANAGE_USER.FIELD_HEADER_ADMINISTER_SYSTEM', value: SystemPermissionType.ADMINISTER },
    { label: 'MANAGE_USER.FIELD_HEADER_AUDIT_SYSTEM', value: SystemPermissionType.AUDIT },
    { label: 'MANAGE_USER.FIELD_HEADER_CREATE_NEW_USERS', value: SystemPermissionType.CREATE_USER },
    { label: 'MANAGE_USER.FIELD_HEADER_CREATE_NEW_USER_GROUPS', value: SystemPermissionType.CREATE_USER_GROUP },
    { label: 'MANAGE_USER.FIELD_HEADER_CREATE_NEW_CONNECTIONS', value: SystemPermissionType.CREATE_CONNECTION },
    { label: 'MANAGE_USER.FIELD_HEADER_CREATE_NEW_CONNECTION_GROUPS', value: SystemPermissionType.CREATE_CONNECTION_GROUP },
    { label: 'MANAGE_USER.FIELD_HEADER_CREATE_NEW_SHARING_PROFILES', value: SystemPermissionType.CREATE_SHARING_PROFILE }
];

/**
 * An editor for the system permissions of a user or user group, along with
 * the ability of a user to change their own password.
 */
@Component({
    selector: 'system-permission-editor',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, TranslatePipe],
    host: { class: 'system-permissions' },
    template: `
        <h2 class="header">{{ 'MANAGE_USER.SECTION_HEADER_PERMISSIONS' | translate }}</h2>
        <div class="section">
            <table class="properties">
                @if (canChangeSystemPermissions()) {
                    @for (type of systemPermissionTypes; track type.value) {
                        <tr>
                            <th>{{ type.label | translate }}</th>
                            <td><input type="checkbox" [(ngModel)]="permissionFlags().systemPermissions[type.value]"
                                       (ngModelChange)="systemPermissionChanged(type.value, $event)"></td>
                        </tr>
                    }
                }
                @if (username(); as username) {
                    <tr>
                        <th>{{ 'MANAGE_USER.FIELD_HEADER_CHANGE_OWN_PASSWORD' | translate }}</th>
                        <td><input type="checkbox" [(ngModel)]="permissionFlags().userPermissions['UPDATE'][username]"
                                   (ngModelChange)="userPermissionChanged(username, $event)"></td>
                    </tr>
                }
            </table>
        </div>
    `
})
export class SystemPermissionEditorComponent {

    readonly systemPermissionTypes = SYSTEM_PERMISSION_TYPES;

    readonly dataSource = input.required<string>();

    /** The username of the user being edited, if editing a user. */
    readonly username = input<string | null>();

    readonly permissionFlags = input.required<PermissionFlagSet>();
    readonly permissionsAdded = input.required<PermissionSet>();
    readonly permissionsRemoved = input.required<PermissionSet>();

    /** The effective permissions of the current user. */
    private readonly permissions = signal<Record<string, PermissionSet> | null>(null);

    constructor() {
        const authenticationService = inject(AuthenticationService);
        const permissionService = inject(PermissionService);
        inject(DataSourceService).apply(
            (dataSource, username) => permissionService.getEffectivePermissions(dataSource, username),
            authenticationService.getAvailableDataSources(),
            authenticationService.getCurrentUsername()!
        ).then(permissions => this.permissions.set(permissions), inject(RequestService).DIE);
    }

    canChangeSystemPermissions(): boolean {
        const permissions = this.permissions()?.[this.dataSource()];
        return !!permissions && PermissionSet.hasSystemPermission(permissions, SystemPermissionType.ADMINISTER);
    }

    systemPermissionChanged(type: string, granted: boolean): void {
        recordSystemPermissionChange(this.permissionsAdded(), this.permissionsRemoved(), type, granted);
    }

    userPermissionChanged(username: string, granted: boolean): void {
        recordObjectPermissionChange(this.permissionsAdded(), this.permissionsRemoved(),
            'userPermissions', ObjectPermissionType.UPDATE, username, granted);
    }

}

const CURRENT_CONNECTIONS = 'CURRENT_CONNECTIONS';
const ALL_CONNECTIONS = 'ALL_CONNECTIONS';

/**
 * Context provided to each item template of the connection permission
 * editor.
 */
interface ConnectionPermissionContext {
    flags: PermissionFlagSet;
    changed: (category: ObjectPermissionCategory, identifier: string, granted: boolean) => void;
}

/**
 * An editor for the connection, connection group, and sharing profile
 * permissions of a user or user group.
 */
@Component({
    selector: 'connection-permission-editor',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, GroupListComponent, GroupListFilterComponent, SectionTabsComponent, TranslatePipe],
    host: { class: 'connection-permissions' },
    template: `
        <div class="header tabbed">
            <h2>{{ 'MANAGE_USER.SECTION_HEADER_CONNECTIONS' | translate }}</h2>
            <guac-group-list-filter [connectionGroups]="rootGroups()" [(filteredConnectionGroups)]="filteredRootGroups"
                                    [connectionProperties]="['name', 'protocol']"
                                    [placeholder]="'MANAGE_USER.FIELD_PLACEHOLDER_FILTER' | translate" />
        </div>
        <guac-section-tabs namespace="MANAGE_USER" [(current)]="currentTab" [tabs]="tabs" />
        <div class="section">
            <guac-group-list [context]="context()" [connectionGroups]="filteredRootGroups()" [pageSize]="20"
                             [templates]="{ 'connection': connection, 'sharing-profile': sharingProfile, 'connection-group': connectionGroup }" />
        </div>

        <ng-template #connection let-item let-context="context">
            <div class="connection-permission choice">
                <div class="icon type" [class]="item.protocol"></div>
                <input type="checkbox" [(ngModel)]="context.flags.connectionPermissions.READ[item.identifier]"
                       (ngModelChange)="context.changed('connectionPermissions', item.identifier, $event)">
                <span class="name">{{ item.name }}</span>
            </div>
        </ng-template>

        <ng-template #connectionGroup let-item let-context="context">
            <div class="connection-group-permission choice">
                <div class="icon type"></div>
                <input type="checkbox" [(ngModel)]="context.flags.connectionGroupPermissions.READ[item.identifier]"
                       (ngModelChange)="context.changed('connectionGroupPermissions', item.identifier, $event)">
                <span class="name">{{ item.name }}</span>
            </div>
        </ng-template>

        <ng-template #sharingProfile let-item let-context="context">
            <div class="sharing-profile-permission choice">
                <div class="icon type"></div>
                <input type="checkbox" [(ngModel)]="context.flags.sharingProfilePermissions.READ[item.identifier]"
                       (ngModelChange)="context.changed('sharingProfilePermissions', item.identifier, $event)">
                <span class="name">{{ item.name }}</span>
            </div>
        </ng-template>
    `
})
export class ConnectionPermissionEditorComponent {

    readonly dataSource = input.required<string>();
    readonly permissionFlags = input<PermissionFlagSet | null>();
    readonly permissionsAdded = input.required<PermissionSet>();
    readonly permissionsRemoved = input.required<PermissionSet>();

    readonly tabs = [CURRENT_CONNECTIONS, ALL_CONNECTIONS];
    readonly currentTab = signal<string | null>(ALL_CONNECTIONS);

    readonly filteredRootGroups = signal<Record<string, ConnectionGroup | GroupListItem>>({});

    private readonly allRootGroups = signal<Record<string, GroupListItem> | null>(null);
    private readonly readableRootGroups = signal<Record<string, GroupListItem> | null>(null);

    readonly rootGroups = computed(() =>
        this.currentTab() === CURRENT_CONNECTIONS ? this.readableRootGroups() : this.allRootGroups());

    readonly context = computed<ConnectionPermissionContext | null>(() => {
        const flags = this.permissionFlags();
        return flags ? {
            flags,
            changed: (category, identifier, granted) => recordObjectPermissionChange(this.permissionsAdded(),
                this.permissionsRemoved(), category, ObjectPermissionType.READ, identifier, granted)
        } : null;
    });

    constructor() {

        const connectionGroupService = inject(ConnectionGroupService);
        const requestService = inject(RequestService);
        const tree = signal<ConnectionGroup | null>(null);

        effect(() => {
            connectionGroupService.getConnectionGroupTree(this.dataSource(), ROOT_CONNECTION_GROUP,
                [ObjectPermissionType.ADMINISTER]).then(rootGroup => tree.set(rootGroup), requestService.DIE);
        });

        // Expand all groups containing readable objects, and derive the list
        // of only readable objects
        effect(() => {

            const rootGroup = tree();
            const flags = this.permissionFlags();
            if (!rootGroup || !flags)
                return;

            const dataSource = this.dataSource();
            const item = GroupListItem.fromConnectionGroup(dataSource, rootGroup);
            expandReadable(item, flags);
            const readable = copyReadable(item, flags);

            this.allRootGroups.set({ [dataSource]: item });
            this.readableRootGroups.set({ [dataSource]: readable });
            this.currentTab.set(readable.children.length ? CURRENT_CONNECTIONS : ALL_CONNECTIONS);

        });

    }

}

/**
 * Returns whether the current user has READ permission for the object
 * represented by the given item.
 */
function isReadable(item: GroupListItem, flags: PermissionFlagSet): boolean {
    switch (item.type) {
        case GroupListItemType.CONNECTION:
            return !!flags.connectionPermissions['READ'][item.identifier!];
        case GroupListItemType.CONNECTION_GROUP:
            return !!flags.connectionGroupPermissions['READ'][item.identifier!];
        case GroupListItemType.SHARING_PROFILE:
            return !!flags.sharingProfilePermissions['READ'][item.identifier!];
    }
    return false;
}

/**
 * Expands all items containing readable descendants, returning whether the
 * given item was expanded.
 */
function expandReadable(item: GroupListItem, flags: PermissionFlagSet): boolean {
    if (item.expandable) {
        for (const child of item.children) {
            if (expandReadable(child, flags) || isReadable(child, flags))
                item.expanded = true;
        }
    }
    return item.expanded;
}

/**
 * Returns a copy of the given item containing only readable descendants
 * (and the groups containing them).
 */
function copyReadable(item: GroupListItem, flags: PermissionFlagSet): GroupListItem {
    const copy = new GroupListItem({ ...item });
    copy.children = item.children
        .map(child => copyReadable(child, flags))
        .filter(child => child.children.length || isReadable(item, flags) || isReadable(child, flags));
    return copy;
}
