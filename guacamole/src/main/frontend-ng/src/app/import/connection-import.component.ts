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

import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DropDirective, UploadDirective } from '../element/element.directives';
import { DigestService } from '../index/digest.service';
import { FilterComponent, PagerComponent, SortOrderDirective } from '../list/list.components';
import { SortOrder, orderBy } from '../list/sort-order';
import { TranslatePipe } from '../locale/translate.pipe';
import { TranslationService } from '../locale/translation.service';
import { UserMenuComponent } from '../navigation/user-menu.component';
import { NotificationService } from '../notification/notification.service';
import { ConnectionGroupService, ConnectionService } from '../rest/connection.services';
import { Connection, ConnectionGroup, ConnectionGroupType, DirectoryPatch, DirectoryPatchResponse } from '../rest/types/model';
import { ObjectPermissionType, PermissionSet } from '../rest/types/permission-set';
import { RestError } from '../rest/types/rest-error';
import { TranslatableMessage } from '../rest/types/translatable-message';
import { PermissionService, UserGroupService, UserService } from '../rest/user.services';
import {
    ConnectionImportConfig, ConnectionParseService, ExistingConnectionMode, ExistingPermissionMode, ImportMode,
    ParseError, ParseResult
} from './connection-parse.service';

const CSV_MIME_TYPE = 'text/csv';
const CSV_FILENAME_REGEX = /\.csv$/i;
const JSON_MIME_TYPE = 'application/json';
const JSON_FILENAME_REGEX = /\.json$/i;
const YAML_MIME_TYPES = ['text/x-yaml', 'text/yaml', 'text/yml', 'application/x-yaml', 'application/x-yml',
    'application/yaml', 'application/yml'];
const YAML_FILENAME_REGEX = /\.ya?ml$/i;
const LEGAL_MIME_TYPES = [CSV_MIME_TYPE, JSON_MIME_TYPE, ...YAML_MIME_TYPES];

/**
 * File signatures of ZIP-based formats (such as spreadsheets) which may be
 * mistakenly uploaded as CSV.
 */
const ZIP_SIGNATURES = ['PK\u0003\u0004', 'PK\u0005\u0006', 'PK\u0007\u0008'];

/**
 * A connection which could not be imported, along with the reasons why.
 */
interface ImportConnectionError {
    rowNumber: number;
    name?: string;
    group?: string;
    protocol?: string;
    errors: string[];
}

/**
 * Displays all errors which prevented connections from being imported.
 */
@Component({
    selector: 'connection-import-errors',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FilterComponent, PagerComponent, SortOrderDirective, TranslatePipe],
    host: { 'class': 'errors', '[hidden]': '!hasErrors()' },
    template: `
        <guac-filter [items]="connectionErrors()" [(filteredItems)]="filteredErrors" [properties]="filterProperties"
                     [placeholder]="'IMPORT.FIELD_PLACEHOLDER_FILTER' | translate" />
        <table class="sorted">
            <thead>
                <tr>
                    <th [guacSortOrder]="order" guacSortProperty="rowNumber">{{ 'IMPORT.TABLE_HEADER_ROW_NUMBER' | translate }}</th>
                    <th [guacSortOrder]="order" guacSortProperty="name">{{ 'IMPORT.TABLE_HEADER_NAME' | translate }}</th>
                    <th [guacSortOrder]="order" guacSortProperty="group">{{ 'IMPORT.TABLE_HEADER_GROUP' | translate }}</th>
                    <th [guacSortOrder]="order" guacSortProperty="protocol">{{ 'IMPORT.TABLE_HEADER_PROTOCOL' | translate }}</th>
                    <th [guacSortOrder]="order" guacSortProperty="errors">{{ 'IMPORT.TABLE_HEADER_ERRORS' | translate }}</th>
                </tr>
            </thead>
            <tbody>
                @for (error of errorPage(); track error.rowNumber) {
                    <tr>
                        <td>{{ error.rowNumber }}</td>
                        <td>{{ error.name }}</td>
                        <td>{{ error.group }}</td>
                        <td>{{ error.protocol }}</td>
                        <td class="error-message" [class.has-errors]="error.errors.length">
                            <ul>
                                @for (message of error.errors; track $index) {
                                    <li>{{ message }}</li>
                                }
                            </ul>
                        </td>
                    </tr>
                }
            </tbody>
        </table>
        <guac-pager [(page)]="errorPage" [pageSize]="25" [items]="sortedErrors()" />
    `
})
export class ConnectionImportErrorsComponent {

    private readonly translationService = inject(TranslationService);

    readonly parseResult = input<ParseResult | null>();
    readonly patchFailure = input<RestError | null>();
    readonly patches = input<DirectoryPatch<Connection>[] | null>();

    readonly filteredErrors = signal<ImportConnectionError[]>([]);
    readonly errorPage = signal<ImportConnectionError[]>([]);

    readonly order = new SortOrder(['rowNumber', 'name', 'group', 'protocol', 'errors']);
    readonly filterProperties = ['rowNumber', 'name', 'group', 'protocol', 'errors'];

    readonly sortedErrors = computed(() => orderBy(this.filteredErrors(), this.order.predicate));

    readonly hasErrors = computed(() => !!this.parseResult()?.hasErrors || !!this.patchFailure());

    private translate(error: ParseError | RestError | null | undefined): string | null {
        if (!error)
            return null;
        if (error instanceof ParseError)
            return this.translationService.instant(error.key, error.variables);
        const message = (error as { translatableMessage?: TranslatableMessage }).translatableMessage
            ?? (error as unknown as TranslatableMessage);
        return this.translationService.instant(message.key, message.variables);
    }

    readonly connectionErrors = computed<ImportConnectionError[]>(() => {

        const parseResult = this.parseResult();
        const patchFailure = this.patchFailure();
        const patches = this.patches();

        // Errors reported by the server while applying patches
        if (patchFailure && parseResult && patches) {

            const errors: ImportConnectionError[] = [];
            let removeError: RestError | undefined;
            let row = 0;

            patches.forEach((patch, index) => {

                const apiError = patchFailure.patches?.[index] as { error?: RestError } | undefined;

                // Errors of "remove" patches (which precede the "add" of a
                // replaced connection) are reported with the "add"
                if (patch.op === 'remove') {
                    removeError = apiError?.error;
                    return;
                }

                errors.push({
                    rowNumber: ++row,
                    name: patch.value?.name,
                    group: parseResult.groupPaths[index],
                    protocol: patch.value?.protocol,
                    errors: [removeError, apiError?.error].map(error => this.translate(error)).filter((e): e is string => !!e)
                });

                removeError = undefined;

            });

            return errors;

        }

        // Errors found while parsing
        if (parseResult?.hasErrors) {
            return parseResult.connectionObjects.map((connection, index) => ({
                rowNumber: index + 1,
                name: connection.name,
                group: connection.group,
                protocol: connection.protocol,
                errors: connection.errors.map(error => error instanceof ParseError
                    ? this.translate(error)! : String((error as { message?: string }).message ?? error))
            }));
        }

        return [];

    });

}

/**
 * The connection import page, allowing connections to be imported in bulk
 * from a CSV, JSON, or YAML file.
 */
@Component({
    selector: 'guac-connection-import',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [ConnectionImportErrorsComponent, DropDirective, FormsModule, TranslatePipe, UploadDirective, UserMenuComponent],
    host: { class: 'settings-view view import' },
    template: `
        <div class="header">
            <h2>{{ 'IMPORT.SECTION_HEADER_CONNECTION_IMPORT' | translate }}</h2>
            <guac-user-menu />
        </div>

        @if (fileName()) {
            <div class="file-upload-container file-selected">
                <div class="file-name">{{ fileName() }}</div>
                <button class="danger clear" (click)="cancel()">{{ 'IMPORT.ACTION_CLEAR' | translate }}</button>
            </div>
        } @else {
            <div class="file-upload-container">
                <div class="upload-header">
                    <span class="file-options">{{ 'IMPORT.HELP_UPLOAD_FILE_TYPES' | translate }}</span>
                    <a href="#/import/connection/file-format-help" target="_blank" class="file-help-link">{{ 'IMPORT.ACTION_VIEW_FORMAT_HELP' | translate }}</a>
                </div>
                <div class="drop-target" (guacUpload)="handleFiles($event)" (guacDrop)="handleFiles($event)"
                     [guacMultiple]="false" guacDraggedClass="drop-pending">
                    <div class="title">{{ 'IMPORT.HELP_UPLOAD_DROP_TITLE' | translate }}</div>
                    <a class="browse-link">{{ 'IMPORT.ACTION_BROWSE' | translate }}</a>
                </div>
                <ul class="import-config">
                    <li>
                        <input type="checkbox" id="existing-connection-mode"
                               [ngModel]="config.existingConnectionMode === 'REPLACE'"
                               (ngModelChange)="config.existingConnectionMode = $event ? ExistingConnectionMode.REPLACE : ExistingConnectionMode.REJECT">
                        <label for="existing-connection-mode">{{ 'IMPORT.FIELD_HEADER_EXISTING_CONNECTION_MODE' | translate }}</label>
                        <span class="help" [title]="'IMPORT.HELP_EXISTING_CONNECTION_MODE' | translate"></span>
                    </li>
                    <li>
                        <input type="checkbox" id="existing-permission-mode"
                               [disabled]="config.existingConnectionMode === 'REJECT'"
                               [ngModel]="config.existingPermissionMode === 'REPLACE'"
                               (ngModelChange)="config.existingPermissionMode = $event ? ExistingPermissionMode.REPLACE : ExistingPermissionMode.PRESERVE">
                        <label for="existing-permission-mode">{{ 'IMPORT.FIELD_HEADER_EXISTING_PERMISSION_MODE' | translate }}</label>
                        <span class="help" [title]="'IMPORT.HELP_EXISTING_PERMISSION_MODE' | translate"></span>
                    </li>
                    <li>
                        <input type="checkbox" id="create-missing-groups" [(ngModel)]="config.createMissingGroups">
                        <label for="create-missing-groups">{{ 'IMPORT.FIELD_HEADER_CREATE_MISSING_GROUPS' | translate }}</label>
                        <span class="help" [title]="'IMPORT.HELP_CREATE_MISSING_GROUPS' | translate"></span>
                    </li>
                </ul>
            </div>
        }

        <div class="import-buttons">
            <button (click)="import()" [disabled]="!fileData() || processing()" class="save import">{{ 'IMPORT.ACTION_IMPORT' | translate }}</button>
            <button (click)="cancel()" [disabled]="processing() || !(reading() || fileData())" class="cancel">{{ 'IMPORT.ACTION_CANCEL' | translate }}</button>
        </div>

        @if (isLoading()) {
            <div class="loading"></div>
        }

        <connection-import-errors [parseResult]="parseResult()" [patchFailure]="patchFailure()" [patches]="patches()" />
    `
})
export class ConnectionImportComponent {

    private readonly connectionGroupService = inject(ConnectionGroupService);
    private readonly connectionParseService = inject(ConnectionParseService);
    private readonly connectionService = inject(ConnectionService);
    private readonly digest = inject(DigestService);
    private readonly notificationService = inject(NotificationService);
    private readonly permissionService = inject(PermissionService);
    private readonly router = inject(Router);
    private readonly userGroupService = inject(UserGroupService);
    private readonly userService = inject(UserService);

    protected readonly ExistingConnectionMode = ExistingConnectionMode;
    protected readonly ExistingPermissionMode = ExistingPermissionMode;

    private readonly dataSource = inject(ActivatedRoute).snapshot.paramMap.get('dataSource')!;

    readonly config: ConnectionImportConfig = {
        existingConnectionMode: ExistingConnectionMode.REJECT,
        existingPermissionMode: ExistingPermissionMode.PRESERVE,
        createMissingGroups: false
    };

    readonly fileName = signal<string | null>(null);
    readonly fileData = signal<string | null>(null);
    readonly reading = signal(false);
    readonly processing = signal(false);
    readonly parseResult = signal<ParseResult | null>(null);
    readonly patches = signal<DirectoryPatch<Connection>[] | null>(null);
    readonly patchFailure = signal<RestError | null>(null);

    private mimeType: string | null = null;
    private fileReader: FileReader | null = null;
    private aborted = false;

    readonly isLoading = computed(() => (!!this.fileName() && !this.fileData() && !this.patchFailure()) || this.processing());

    private resetUploadState(): void {
        this.aborted = false;
        this.reading.set(false);
        this.processing.set(false);
        this.fileData.set(null);
        this.mimeType = null;
        this.fileReader = null;
        this.parseResult.set(null);
        this.patchFailure.set(null);
        this.patches.set(null);
        this.fileName.set(null);
    }

    /**
     * Displays the given error, resetting the import.
     */
    private handleError(error: unknown): void {

        if (!(error instanceof ParseError))
            console.error('Connection import failed:', error);

        this.resetUploadState();

        let text: TranslatableMessage | undefined;
        if (error instanceof ParseError)
            text = { key: error.key || error.message, variables: error.variables };
        else if (error instanceof RestError)
            text = error.translatableMessage;
        else
            text = { key: String(error) };

        this.notificationService.showStatus({
            className: 'error',
            title: 'IMPORT.DIALOG_HEADER_ERROR',
            text,
            actions: [{ name: 'IMPORT.ACTION_ACKNOWLEDGE', callback: () => this.notificationService.showStatus(false) }]
        });

    }

    /**
     * Creates any connection groups referenced by the imported connections
     * which do not yet exist, if requested.
     */
    private async ensureConnectionGroups(parseResult: ParseResult): Promise<void> {

        if (!this.config.createMissingGroups)
            return;

        const rootGroup = await this.connectionGroupService.getConnectionGroupTree(this.dataSource);

        const identifierByPath: Record<string, string> = {};
        const flatten = (group: ConnectionGroup, prefix = '') => {
            const currentPath = prefix ? (prefix + '/' + group.name) : 'ROOT';
            if (group.identifier)
                identifierByPath[currentPath] = group.identifier;
            group.childConnectionGroups?.forEach(child => flatten(child, currentPath));
        };
        flatten(rootGroup);

        // Create each missing group in order, parents first
        for (const connection of parseResult.connectionObjects) {

            if (!connection.group)
                continue;

            let currentPath = 'ROOT';
            for (const segment of connection.group.split('/')) {

                if (!segment || segment === 'ROOT')
                    continue;

                const parentPath = currentPath;
                currentPath = parentPath + '/' + segment;
                if (identifierByPath[currentPath])
                    continue;

                const newGroup: ConnectionGroup = {
                    name: segment,
                    parentIdentifier: identifierByPath[parentPath],
                    type: ConnectionGroupType.ORGANIZATIONAL,
                    attributes: {}
                };
                await this.connectionGroupService.saveConnectionGroup(this.dataSource, newGroup);
                identifierByPath[currentPath] = newGroup.identifier!;

            }
        }

        parseResult.connectionObjects.forEach((connection, index) => {

            if (connection.parentIdentifier)
                return;

            const resolved = identifierByPath[connection.group!];
            if (resolved)
                connection.parentIdentifier = resolved;
            else {
                connection.errors.push(new ParseError({
                    message: 'No group matching: ' + connection.group,
                    key: 'IMPORT.ERROR_INVALID_GROUP',
                    variables: { GROUP: connection.group }
                }));
                parseResult.errors[index] = connection.errors;
                parseResult.hasErrors = true;
            }

        });

    }

    /**
     * Returns the patches which create (or replace) all imported
     * connections.
     */
    private createConnectionPatches(parseResult: ParseResult): DirectoryPatch<Connection>[] {

        const patches: DirectoryPatch<Connection>[] = [];

        for (const connection of parseResult.connectionObjects) {

            const value: Connection = {
                identifier: connection.identifier,
                parentIdentifier: connection.parentIdentifier,
                name: connection.name,
                protocol: connection.protocol,
                parameters: connection.parameters,
                attributes: connection.attributes
            };

            if (connection.importMode === ImportMode.CREATE)
                patches.push({ op: 'add', path: '/', value });
            else if (this.config.existingPermissionMode === ExistingPermissionMode.PRESERVE)
                patches.push({ op: 'replace', path: '/' + connection.identifier, value });
            else {
                patches.push({ op: 'remove', path: '/' + connection.identifier });
                patches.push({ op: 'add', path: '/', value });
            }

        }

        return patches;

    }

    /**
     * Creates any users and user groups referenced by the imported
     * connections which do not yet exist.
     */
    private async createUsersAndGroups(parseResult: ParseResult): Promise<void> {

        const [existingUsers, existingGroups] = await Promise.all([
            this.userService.getUsers(this.dataSource),
            this.userGroupService.getUserGroups(this.dataSource)
        ]);

        await Promise.all([
            this.userService.patchUsers(this.dataSource, Object.keys(parseResult.users)
                .filter(username => !existingUsers[username])
                .map(username => ({ op: 'add', path: '/', value: { username, attributes: {} } }))),
            this.userGroupService.patchUserGroups(this.dataSource, Object.keys(parseResult.groups)
                .filter(identifier => !existingGroups[identifier])
                .map(identifier => ({ op: 'add', path: '/', value: { identifier, attributes: {} } })))
        ]);

    }

    /**
     * Grants READ permission for the imported connections to the users and
     * groups listed for each connection.
     */
    private grantConnectionPermissions(parseResult: ParseResult, response: DirectoryPatchResponse): Promise<unknown> {

        const createPermissionSet = (indices: number[]) => new PermissionSet({
            connectionPermissions: Object.fromEntries(indices.map(index =>
                [response.patches[index].identifier, [ObjectPermissionType.READ]]))
        });

        return Promise.all([
            ...Object.entries(parseResult.users).map(([identifier, indices]) =>
                this.permissionService.patchPermissions(this.dataSource, identifier, createPermissionSet(indices), new PermissionSet(), false)),
            ...Object.entries(parseResult.groups).map(([identifier, indices]) =>
                this.permissionService.patchPermissions(this.dataSource, identifier, createPermissionSet(indices), new PermissionSet(), true))
        ]);

    }

    private async handleParseSuccess(parseResult: ParseResult): Promise<void> {

        this.processing.set(false);
        this.parseResult.set(parseResult);
        if (parseResult.hasErrors)
            return;

        this.patches.set(null);
        this.patchFailure.set(null);
        this.processing.set(true);

        let patches: DirectoryPatch<Connection>[] | null = null;

        try {

            await this.ensureConnectionGroups(parseResult);
            if (parseResult.hasErrors) {
                this.processing.set(false);
                this.parseResult.set(Object.assign(new ParseResult(), parseResult));
                return;
            }

            patches = this.createConnectionPatches(parseResult);
            this.patches.set(patches);

            const response = await this.connectionService.patchConnections(this.dataSource, patches);

            try {
                await this.createUsersAndGroups(parseResult);
                await this.grantConnectionPermissions(parseResult, response);
            }
            catch (error) {
                this.processing.set(false);
                this.handleError(error);
                return;
            }

            this.processing.set(false);
            this.notificationService.showStatus({
                className: 'success',
                title: 'IMPORT.DIALOG_HEADER_SUCCESS',
                text: { key: 'IMPORT.INFO_CONNECTIONS_IMPORTED_SUCCESS', variables: { NUMBER: parseResult.connectionCount } },
                actions: [{
                    name: 'IMPORT.ACTION_ACKNOWLEDGE',
                    callback: () => {
                        this.notificationService.showStatus(false);
                        this.router.navigateByUrl('/settings/' + encodeURIComponent(this.dataSource) + '/connections');
                    }
                }]
            });

        }

        catch (error) {
            this.processing.set(false);
            if (!patches)
                this.handleError(error);
            else
                this.patchFailure.set(error as RestError);
        }

    }

    import(): void {

        const mimeType = this.mimeType;
        const data = this.fileData()!;
        this.processing.set(true);

        let parse: Promise<ParseResult>;
        if (mimeType === JSON_MIME_TYPE)
            parse = this.connectionParseService.parseJSON(this.dataSource, this.config, data);
        else if (mimeType === CSV_MIME_TYPE)
            parse = this.connectionParseService.parseCSV(this.dataSource, this.config, data);
        else if (mimeType && YAML_MIME_TYPES.includes(mimeType))
            parse = this.connectionParseService.parseYAML(this.dataSource, this.config, data);
        else
            parse = Promise.reject(new ParseError({ message: 'Unexpected invalid file type: ' + mimeType }));

        parse.then(result => this.handleParseSuccess(result)).catch(error => this.handleError(error));

    }

    cancel(): void {
        if (this.fileReader) {
            this.aborted = true;
            this.fileReader.abort();
        }
        else
            this.resetUploadState();
    }

    /**
     * Begins reading the first of the given files, if of a supported type.
     */
    handleFiles(files: FileList): void {

        const file = files[0];
        let mimeType = file.type;

        // Infer the type from the filename if the browser did not provide one
        if (!mimeType.trim().length) {
            if (CSV_FILENAME_REGEX.test(file.name))
                mimeType = CSV_MIME_TYPE;
            else if (JSON_FILENAME_REGEX.test(file.name))
                mimeType = JSON_MIME_TYPE;
            else if (YAML_FILENAME_REGEX.test(file.name))
                mimeType = YAML_MIME_TYPES[0];
            else {
                this.handleError(new ParseError({ message: 'Unknown type for file: ' + file.name, key: 'IMPORT.ERROR_DETECTED_INVALID_TYPE' }));
                return;
            }
        }

        else if (!LEGAL_MIME_TYPES.includes(mimeType)) {
            this.handleError(new ParseError({
                message: 'Invalid file type: ' + mimeType,
                key: 'IMPORT.ERROR_INVALID_MIME_TYPE',
                variables: { TYPE: mimeType }
            }));
            return;
        }

        this.fileName.set(file.name);
        this.mimeType = mimeType;
        this.aborted = false;
        this.fileData.set(null);
        this.processing.set(false);
        this.reading.set(true);

        const reader = this.fileReader = new FileReader();
        reader.onloadend = () => this.digest.apply(() => {

            this.reading.set(false);
            this.fileReader = null;

            if (this.aborted) {
                this.resetUploadState();
                return;
            }

            const fileData = reader.result as string;
            if (ZIP_SIGNATURES.some(signature => fileData.startsWith(signature))) {
                this.handleError(new ParseError({ message: 'Invalid file type detected', key: 'IMPORT.ERROR_DETECTED_INVALID_TYPE' }));
                return;
            }

            this.fileData.set(fileData);

        });

        reader.readAsText(file);

    }

}

/**
 * Documentation of the file formats accepted by the connection import page.
 */
@Component({
    selector: 'guac-connection-import-file-help',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [TranslatePipe, UserMenuComponent],
    host: { class: 'import view help' },
    template: `
        <div class="header">
            <h2>{{ 'IMPORT.SECTION_HEADER_HELP_CONNECTION_IMPORT_FILE' | translate }}</h2>
            <guac-user-menu />
        </div>

        <h2>{{ 'IMPORT.HELP_FILE_TYPE_HEADER' | translate }}</h2>
        <p>{{ 'IMPORT.HELP_FILE_TYPE_DESCRIPTION' | translate }}</p>

        <h2>{{ 'IMPORT.SECTION_HEADER_CSV' | translate }}</h2>
        <p>{{ 'IMPORT.HELP_CSV_DESCRIPTION' | translate }}</p>
        <p>{{ 'IMPORT.HELP_CSV_MORE_DETAILS' | translate }}</p>
        <pre dir="ltr">{{ 'IMPORT.HELP_CSV_EXAMPLE' | translate }}</pre>

        <h2>{{ 'IMPORT.SECTION_HEADER_JSON' | translate }}</h2>
        <p>{{ 'IMPORT.HELP_JSON_DESCRIPTION' | translate }}</p>
        <p>{{ 'IMPORT.HELP_JSON_MORE_DETAILS' | translate }}</p>
        <pre dir="ltr">{{ 'IMPORT.HELP_JSON_EXAMPLE' | translate }}</pre>

        <h2>{{ 'IMPORT.SECTION_HEADER_YAML' | translate }}</h2>
        <p>{{ 'IMPORT.HELP_YAML_DESCRIPTION' | translate }}</p>
        <pre dir="ltr">{{ 'IMPORT.HELP_YAML_EXAMPLE' | translate }}</pre>

        <ol class="footnotes">
            <li>{{ 'IMPORT.HELP_SEMICOLON_FOOTNOTE' | translate }}</li>
        </ol>
    `
})
export class ConnectionImportFileHelpComponent {}
