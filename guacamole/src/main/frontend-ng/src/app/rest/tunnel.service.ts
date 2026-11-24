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
import { AuthenticationService } from '../auth/authentication.service';
import { Protocol, SharingProfile, UserCredentials } from './types/model';
import { RestError, RestErrorType } from './types/rest-error';

/**
 * The number of milliseconds to wait after a stream download has completed
 * before cleaning up the hidden iframe used for the download.
 */
const DOWNLOAD_CLEANUP_WAIT = 5000;

/**
 * The maximum size of each chunk of a file upload, in bytes.
 */
const CHUNK_SIZE = 1024 * 1024 * 4;

/**
 * Removes path separators from the given filename, such that it can safely
 * be included within a URL path.
 */
function sanitizeFilename(filename: string): string {
    return filename.replace(/[\\/]+/g, '_');
}

/**
 * Service for operating on the tunnels of in-progress connections via the
 * REST API, including transferring stream data to and from the browser.
 */
@Injectable({ providedIn: 'root' })
export class TunnelService {

    private readonly authenticationService = inject(AuthenticationService);
    private readonly document = inject(DOCUMENT);

    private tunnelUrl(tunnel: string): string {
        return 'api/session/tunnels/' + encodeURIComponent(tunnel);
    }

    /**
     * Returns the absolute URL of the given stream of the given tunnel,
     * including the current authentication token.
     */
    private streamUrl(tunnel: string, stream: Guacamole.InputStream | Guacamole.OutputStream, filename: string): string {
        return location.origin + location.pathname
            + this.tunnelUrl(tunnel)
            + '/streams/' + encodeURIComponent(stream.index)
            + '/' + encodeURIComponent(sanitizeFilename(filename))
            + '?token=' + encodeURIComponent(this.authenticationService.getCurrentToken() ?? '');
    }

    getTunnels(): Promise<string[]> {
        return this.authenticationService.request({ method: 'GET', url: 'api/session/tunnels' });
    }

    getProtocol(tunnel: string): Promise<Protocol> {
        return this.authenticationService.request({ method: 'GET', url: this.tunnelUrl(tunnel) + '/protocol' });
    }

    getSharingProfiles(tunnel: string): Promise<Record<string, SharingProfile>> {
        return this.authenticationService.request({
            method: 'GET',
            url: this.tunnelUrl(tunnel) + '/activeConnection/connection/sharingProfiles'
        });
    }

    getSharingCredentials(tunnel: string, sharingProfile: string): Promise<UserCredentials> {
        return this.authenticationService.request({
            method: 'GET',
            url: this.tunnelUrl(tunnel) + '/activeConnection/sharingCredentials/' + encodeURIComponent(sharingProfile)
        });
    }

    /**
     * Downloads the given stream as a file, using a hidden iframe such that
     * the browser handles the download natively (and the data need not be
     * held in memory).
     */
    downloadStream(tunnel: string, stream: Guacamole.InputStream, mimetype: string, filename: string): void {

        const iframe = this.document.createElement('iframe');
        Object.assign(iframe.style, {
            position: 'fixed', border: 'none', width: '1px', height: '1px', left: '-1px', top: '-1px'
        });
        this.document.body.appendChild(iframe);

        // Automatically remove iframe from DOM when download completes, if
        // browser supports tracking of iframe downloads via the "load" event
        iframe.onload = () => iframe.remove();

        // Acknowledge (and ignore) any received blobs
        stream.onblob = () => stream.sendAck('OK', Guacamole.Status.Code.SUCCESS);

        // Automatically remove iframe from DOM a few seconds after the stream
        // ends, in the browser does NOT fire the "load" event for downloads
        stream.onend = () => setTimeout(() => iframe.remove(), DOWNLOAD_CLEANUP_WAIT);

        iframe.src = this.streamUrl(tunnel, stream, filename);

    }

    /**
     * Uploads the given file to the given stream in chunks, invoking the
     * progress callback with the number of bytes uploaded so far.
     */
    uploadToStream(tunnel: string, stream: Guacamole.OutputStream, file: File,
            progressCallback?: (length: number) => void): Promise<void> {

        const url = this.streamUrl(tunnel, stream, file.name);

        return new Promise((resolve, reject) => {

            const uploadChunk = (offset: number) => {

                const chunk = file.slice(offset, Math.min(offset + CHUNK_SIZE, file.size));
                const xhr = new XMLHttpRequest();
                xhr.open('POST', url, true);

                if (progressCallback && xhr.upload)
                    xhr.upload.addEventListener('progress', e => progressCallback(e.loaded + offset));

                xhr.onreadystatechange = () => {

                    if (xhr.readyState !== XMLHttpRequest.DONE)
                        return;

                    if (xhr.status >= 200 && xhr.status < 300) {
                        offset += CHUNK_SIZE;
                        if (offset < file.size)
                            uploadChunk(offset);
                        else
                            resolve();
                    }

                    else if (xhr.getResponseHeader('Content-Type') === 'application/json')
                        reject(new RestError(JSON.parse(xhr.responseText)));

                    else
                        reject(new RestError({
                            type: RestErrorType.STREAM_ERROR,
                            statusCode: (xhr.status >= 400 && xhr.status < 500)
                                ? Guacamole.Status.Code.CLIENT_FORBIDDEN
                                : Guacamole.Status.Code.SERVER_ERROR,
                            message: 'HTTP ' + xhr.status
                        }));

                };

                xhr.send(chunk);

            };

            uploadChunk(0);

        });

    }

}

/**
 * Returns a link which grants access using the given sharing credentials.
 */
export function getSharingLink(userCredentials: UserCredentials): string {

    const params = userCredentials.expected
        .filter(field => field.type === 'QUERY_PARAMETER')
        .map(field => encodeURIComponent(field.name) + '=' + encodeURIComponent(userCredentials.values[field.name]))
        .join('&');

    return location.origin + location.pathname + '#/' + (params ? '?' + params : '');

}
