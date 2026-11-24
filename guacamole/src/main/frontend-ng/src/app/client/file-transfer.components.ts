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

import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, signal } from '@angular/core';
import { TranslatePipe } from '../locale/translate.pipe';
import { TranslationService } from '../locale/translation.service';
import { ManagedClientService } from './managed-client.service';
import { FileType, ManagedClientGroup, ManagedFile, ManagedFileUpload, ManagedFilesystem, StreamState } from './types';

/**
 * Displays the contents of the current directory of a filesystem. Clicking a
 * file once selects it; clicking again opens it (changing directory or
 * downloading the file).
 */
@Component({
    selector: 'guac-file-browser',
    changeDetection: ChangeDetectionStrategy.Eager,
    host: { class: 'file-browser' },
    template: `
        <div class="current-directory-contents">
            @for (file of sortedFiles(); track file.streamName) {
                <div class="file-browser-file list-item" [class.directory]="isDirectory(file)"
                     [class.normal-file]="file.type === 'NORMAL'" [class.focused]="focusedFile() === file"
                     (click)="fileClicked(file)" (selectstart)="$event.preventDefault()">
                    <div class="caption">
                        <div class="icon"></div>
                        {{ file.name }}
                    </div>
                </div>
            }
        </div>
    `
})
export class FileBrowserComponent {

    private readonly managedClientService = inject(ManagedClientService);

    readonly filesystem = input.required<ManagedFilesystem>();

    readonly focusedFile = signal<ManagedFile | null>(null);

    constructor() {
        // Refresh file browser when any upload completes
        const subscription = this.managedClientService.uploadComplete.subscribe(() => {
            const filesystem = this.filesystem();
            this.managedClientService.refreshDirectory(filesystem, filesystem.currentDirectory);
        });
        inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
    }

    isDirectory(file: ManagedFile): boolean {
        return file.type === FileType.DIRECTORY;
    }

    /**
     * Returns the files within the current directory, directories first,
     * each sorted by name.
     */
    sortedFiles(): ManagedFile[] {
        return Object.values(this.filesystem().currentDirectory.files).sort((a, b) => {
            if (this.isDirectory(a) !== this.isDirectory(b))
                return this.isDirectory(a) ? -1 : 1;
            return (a.name ?? '').localeCompare(b.name ?? '');
        });
    }

    fileClicked(file: ManagedFile): void {

        // Select on first click
        if (this.focusedFile() !== file) {
            this.focusedFile.set(file);
            return;
        }

        // Open on second click
        this.focusedFile.set(null);
        if (this.isDirectory(file))
            this.managedClientService.changeDirectory(this.filesystem(), file);
        else if (file.type === FileType.NORMAL)
            this.managedClientService.downloadFile(this.filesystem(), file.streamName);

    }

}

/**
 * Returns whether the given transfer is still in progress.
 */
function isInProgress(transfer: ManagedFileUpload): boolean {
    switch (transfer.transferState.streamState) {
        case StreamState.IDLE:
        case StreamState.OPEN:
            return true;
        default:
            return false;
    }
}

/**
 * Displays the progress and status of a single file transfer.
 */
@Component({
    selector: 'guac-file-transfer',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [TranslatePipe],
    host: {
        'class': 'transfer',
        '[class.in-progress]': 'isInProgress()',
        '[class.error]': 'hasError()'
    },
    template: `
        <div class="transfer-status">
            <div class="filename">
                <div class="progress"><div class="bar" [style.width.%]="getPercentDone()"></div></div>
                {{ transfer().filename }}
            </div>
            <p class="error-text">{{ getErrorMessage() | translate }}</p>
        </div>
        <div class="text">{{ 'CLIENT.TEXT_FILE_TRANSFER_PROGRESS' | translate: { PROGRESS: getProgressValue(), UNIT: getProgressUnit() } }}</div>
    `
})
export class FileTransferComponent {

    private readonly translationService = inject(TranslationService);

    readonly transfer = input.required<ManagedFileUpload>();

    /**
     * Returns the unit of the progress text: "gb", "mb", "kb", or "b".
     */
    getProgressUnit(): string {
        const bytes = this.transfer().progress ?? 0;
        if (bytes > 1000000000)
            return 'gb';
        if (bytes > 1000000)
            return 'mb';
        if (bytes > 1000)
            return 'kb';
        return 'b';
    }

    getProgressValue(): string | number | undefined {

        const bytes = this.transfer().progress;
        if (!bytes)
            return bytes;

        switch (this.getProgressUnit()) {
            case 'gb': return (bytes / 1000000000).toFixed(1);
            case 'mb': return (bytes / 1000000).toFixed(1);
            case 'kb': return (bytes / 1000).toFixed(1);
            default: return bytes;
        }

    }

    getPercentDone(): number {
        return (this.transfer().progress ?? 0) / (this.transfer().length || 1) * 100;
    }

    isInProgress(): boolean {
        return isInProgress(this.transfer());
    }

    hasError(): boolean {
        return this.transfer().transferState.streamState === StreamState.ERROR;
    }

    /**
     * Returns the translation key of the message describing the current
     * error, if any.
     */
    getErrorMessage(): string {
        const statusCode = this.transfer().transferState.statusCode;
        return this.translationService.withFallback(
            'CLIENT.ERROR_UPLOAD_' + statusCode.toString(16).toUpperCase(), 'CLIENT.ERROR_UPLOAD_DEFAULT');
    }

}

/**
 * Displays all file transfers of all clients within a group.
 */
@Component({
    selector: 'guac-file-transfer-manager',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FileTransferComponent, TranslatePipe],
    host: { class: 'transfer-manager' },
    template: `
        <div class="header">
            <h2>{{ 'CLIENT.SECTION_HEADER_FILE_TRANSFERS' | translate }}</h2>
            <button (click)="clearCompletedTransfers()">{{ 'CLIENT.ACTION_CLEAR_COMPLETED_TRANSFERS' | translate }}</button>
        </div>
        <div class="transfer-manager-body">
            @for (client of clientGroup().clients; track client.id) {
                <div class="transfer-manager-body-section" [hidden]="!client.hasTransfers()">
                    @if (hasMultipleClients()) {
                        <h3>{{ client.name }}</h3>
                    }
                    <div class="transfers">
                        @for (upload of client.uploads; track upload) {
                            <guac-file-transfer [transfer]="upload" />
                        }
                    </div>
                </div>
            }
        </div>
    `
})
export class FileTransferManagerComponent {

    readonly clientGroup = input.required<ManagedClientGroup>();

    hasMultipleClients(): boolean {
        return ManagedClientGroup.hasMultipleClients(this.clientGroup());
    }

    clearCompletedTransfers(): void {
        for (const client of this.clientGroup().clients)
            client.uploads = client.uploads.filter(isInProgress);
    }

}
