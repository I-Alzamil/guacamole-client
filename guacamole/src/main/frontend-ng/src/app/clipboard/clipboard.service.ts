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

import { DOCUMENT, Injectable, inject } from '@angular/core';
import { Subject, filter } from 'rxjs';
import { AuthenticationService } from '../auth/authentication.service';
import { DigestService } from '../index/digest.service';

/**
 * Arbitrary data which may be stored within the clipboard.
 */
export interface ClipboardData {

    /** The ID of the client which provided this data, if any. */
    source?: string;

    /** The mimetype of the data. */
    type: string;

    /** The data itself, either text or a Blob of binary data. */
    data: string | Blob;

}

/**
 * The amount of time to wait before actually reading the local clipboard
 * via the legacy execCommand() mechanism, in milliseconds.
 */
const CLIPBOARD_READ_DELAY = 100;

function emptyClipboard(): ClipboardData {
    return { type: 'text/plain', data: '' };
}

/**
 * Service for reading and writing the local clipboard and tracking the
 * clipboard contents shared with all connected clients.
 */
@Injectable({ providedIn: 'root' })
export class ClipboardService {

    private readonly document = inject(DOCUMENT);
    private readonly digest = inject(DigestService);

    /**
     * The most recently set clipboard contents, specific to the current
     * session.
     */
    private storedClipboardData: ClipboardData = emptyClipboard();

    /** Emits whenever the clipboard contents change. */
    readonly clipboardChanged = new Subject<ClipboardData>();

    /** Emits whenever a clipboard synchronization begins or ends. */
    readonly syncInProgress = new Subject<boolean>();

    private pendingRead: Promise<ClipboardData> | null = null;

    /**
     * Hidden element used to read and write the local clipboard where the
     * asynchronous Clipboard API is unavailable.
     */
    private readonly clipboardContent: HTMLTextAreaElement;

    private readonly selectionStack: Range[] = [];

    constructor() {

        this.clipboardContent = this.document.createElement('textarea');
        this.clipboardContent.className = 'clipboard-service-target';
        this.document.body.appendChild(this.clipboardContent);

        // Prevent events generated due to execCommand() from bubbling up
        const stopEventPropagation = (e: Event) => e.stopPropagation();
        for (const type of ['cut', 'copy', 'paste', 'input'])
            this.clipboardContent.addEventListener(type, stopEventPropagation);

        // Clipboard contents are specific to the current session
        inject(AuthenticationService).events
            .pipe(filter(event => event.type === 'login' || event.type === 'logout'))
            .subscribe(() => this.storedClipboardData = emptyClipboard());

    }

    private pushSelection(): void {
        const selection = window.getSelection();
        if (selection?.rangeCount)
            this.selectionStack.push(selection.getRangeAt(0));
    }

    private popSelection(): void {
        const range = this.selectionStack.pop();
        if (!range)
            return;
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
    }

    /**
     * Writes the given data to the local clipboard. This is not possible in
     * all browsers, and may require user interaction.
     */
    private async setLocalClipboard(data: ClipboardData): Promise<void> {

        // Use the Clipboard API where available
        if (navigator.clipboard?.writeText && data.type === 'text/plain' && typeof data.data === 'string')
            return navigator.clipboard.writeText(data.data);

        const originalElement = this.document.activeElement as HTMLElement | null;
        this.pushSelection();

        if (typeof data.data === 'string')
            this.clipboardContent.value = data.data;

        this.clipboardContent.focus();
        this.clipboardContent.select();

        // Fall back to the deprecated execCommand(), which remains the only
        // means of writing non-text clipboard data in some browsers
        const copied = this.document.execCommand('copy');

        this.clipboardContent.blur();
        originalElement?.focus();
        this.popSelection();

        if (!copied)
            throw new Error('Clipboard write failed');

    }

    /**
     * Parses the given base64 data URL, returning the corresponding Blob, or
     * null if the URL is not a valid base64 data URL.
     */
    parseDataURL(url: string): Blob | null {

        const result = /^data:([^;]*);base64,([a-zA-Z0-9+/]*[=]*)$/.exec(url);
        if (!result)
            return null;

        const data = atob(result[2]);
        const buffer = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++)
            buffer[i] = data.charCodeAt(i);

        return new Blob([buffer], { type: result[1] });

    }

    /**
     * Reads the local clipboard. Depending on the browser, this may not be
     * possible without user interaction.
     */
    private getLocalClipboard(): Promise<ClipboardData> {

        if (this.pendingRead)
            return this.pendingRead;

        if (navigator.clipboard?.readText)
            return navigator.clipboard.readText().then(text => ({ type: 'text/plain', data: text }));

        const originalElement = this.document.activeElement as HTMLElement | null;

        const read = new Promise<ClipboardData>((resolve, reject) => {

            const performPaste = () => {

                if (!this.document.execCommand('paste')) {
                    reject();
                    return;
                }

                const blob = this.parseDataURL(this.clipboardContent.value);
                if (blob)
                    resolve({ type: blob.type, data: blob });
                else
                    resolve({ type: 'text/plain', data: this.clipboardContent.value });

            };

            // Clipboard can only be read after the element is focused
            setTimeout(() => {
                this.pushSelection();
                this.clipboardContent.blur();
                this.clipboardContent.addEventListener('focus', performPaste, { once: true });
                this.clipboardContent.value = '';
                this.clipboardContent.focus();
                this.clipboardContent.select();
                if (this.document.activeElement !== this.clipboardContent)
                    reject();
            }, CLIPBOARD_READ_DELAY);

        });

        this.pendingRead = read.finally(() => {
            this.clipboardContent.blur();
            originalElement?.focus();
            this.popSelection();
            this.pendingRead = null;
        });

        return this.pendingRead;

    }

    /**
     * Returns the current clipboard contents, reading the local clipboard
     * if possible.
     */
    getClipboard(): Promise<ClipboardData> {
        return this.getLocalClipboard().then(
            data => this.storedClipboardData = data,
            () => this.storedClipboardData);
    }

    /**
     * Sets the clipboard contents, writing to the local clipboard if
     * possible and notifying all listeners.
     */
    setClipboard(data: ClipboardData): Promise<void> {
        return this.setLocalClipboard(data).catch(() => {}).finally(() => this.digest.apply(() => {
            this.storedClipboardData = data;
            this.clipboardChanged.next(data);
            this.syncInProgress.next(false);
        }));
    }

    /**
     * Reads the local clipboard and, if successful, updates the clipboard
     * contents of all clients.
     */
    resyncClipboard(): void {
        this.syncInProgress.next(true);
        this.getLocalClipboard().then(
            data => this.setClipboard(data),
            () => this.syncInProgress.next(false));
    }

}
