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
import { Subject } from 'rxjs';
import { AuthenticationService } from '../auth/authentication.service';
import { ClipboardService } from '../clipboard/clipboard.service';
import { HistoryService } from '../history/history.service';
import { DigestService } from '../index/digest.service';
import { ClientIdentifier, ClientIdentifierType, clientIdentifierFromString } from '../navigation/client-identifier';
import { ActiveConnectionService, ConnectionGroupService, ConnectionService } from '../rest/connection.services';
import { RequestService } from '../rest/request.service';
import { TunnelService, getSharingLink } from '../rest/tunnel.service';
import { SharingProfile, UserCredentials } from '../rest/types/model';
import { RestError, RestErrorType } from '../rest/types/rest-error';
import { PreferenceService } from '../settings/preference.service';
import { MediaService } from './media.service';
import {
    ConnectionState, FileType, ManagedArgument, ManagedClient, ManagedClientState, ManagedDisplay, ManagedFile,
    ManagedFileTransferState, ManagedFileUpload, ManagedFilesystem, StreamState
} from './types';

/**
 * The minimum amount of time to wait between thumbnail updates, in
 * milliseconds.
 */
const THUMBNAIL_UPDATE_FREQUENCY = 5000;

/**
 * Service which creates and operates on {@link ManagedClient} instances,
 * connecting each client's Guacamole callbacks to application state.
 */
@Injectable({ providedIn: 'root' })
export class ManagedClientService {

    private readonly activeConnectionService = inject(ActiveConnectionService);
    private readonly authenticationService = inject(AuthenticationService);
    private readonly clipboardService = inject(ClipboardService);
    private readonly connectionGroupService = inject(ConnectionGroupService);
    private readonly connectionService = inject(ConnectionService);
    private readonly digest = inject(DigestService);
    private readonly document = inject(DOCUMENT);
    private readonly historyService = inject(HistoryService);
    private readonly mediaService = inject(MediaService);
    private readonly preferenceService = inject(PreferenceService);
    private readonly requestService = inject(RequestService);
    private readonly tunnelService = inject(TunnelService);

    /** Emits the filename of each upload which completes successfully. */
    readonly uploadComplete = new Subject<string>();

    /**
     * Parses the given client identifier string.
     */
    parseIdentifier(id: string): ClientIdentifier {
        return clientIdentifierFromString(id, this.authenticationService.getDataSource());
    }

    /**
     * Returns the connection string to send while connecting, describing
     * the object to connect to and the capabilities of the browser.
     */
    private async getConnectString(identifier: ClientIdentifier, width: number, height: number): Promise<string> {

        // Calculate optimal width/height for display
        const pixelDensity = window.devicePixelRatio || 1;
        const optimalDpi = pixelDensity * 96;

        const params = new URLSearchParams({
            token: this.authenticationService.getCurrentToken() ?? '',
            GUAC_DATA_SOURCE: identifier.dataSource,
            GUAC_ID: identifier.id,
            GUAC_TYPE: identifier.type,
            GUAC_WIDTH: String(Math.floor(width * pixelDensity)),
            GUAC_HEIGHT: String(Math.floor(height * pixelDensity)),
            GUAC_DPI: String(Math.floor(optimalDpi)),
            GUAC_TIMEZONE: this.preferenceService.preferences.timezone
        });

        this.mediaService.supportedAudio.forEach(mimetype => params.append('GUAC_AUDIO', mimetype));
        this.mediaService.supportedVideo.forEach(mimetype => params.append('GUAC_VIDEO', mimetype));
        (await this.mediaService.getSupportedImages()).forEach(mimetype => params.append('GUAC_IMAGE', mimetype));

        return params.toString().replace(/\+/g, '%20');

    }

    /**
     * Requests the creation of a new audio stream, recorded from the user's
     * microphone, re-requesting the stream if it is closed.
     */
    private requestAudioStream(client: Guacamole.Client): void {

        const stream = client.createAudioStream(ManagedClient.AUDIO_INPUT_MIMETYPE);
        const recorder = Guacamole.AudioRecorder.getInstance(stream, ManagedClient.AUDIO_INPUT_MIMETYPE);

        // If no recorder is available, end the stream immediately
        if (!recorder)
            stream.sendEnd();
        else
            recorder.onclose = () => this.requestAudioStream(client);

    }

    /**
     * Creates a new client which will connect to the object identified by
     * the given client identifier. The client will not connect until
     * {@link connect} is called.
     */
    getInstance(id: string): ManagedClient {

        const tunnel: Guacamole.Tunnel = window.WebSocket
            ? new Guacamole.ChainedTunnel(new Guacamole.WebSocketTunnel('websocket-tunnel'), new Guacamole.HTTPTunnel('tunnel'))
            : new Guacamole.HTTPTunnel('tunnel');

        const client = new Guacamole.Client(tunnel);
        const managedClient = new ManagedClient(id, client, tunnel);
        const state = managedClient.clientState;
        const apply = this.digest.apply.bind(this.digest);

        tunnel.onerror = (status: Guacamole.Status) => apply(() =>
            ManagedClientState.setConnectionState(state, ConnectionState.TUNNEL_ERROR, status.code));

        tunnel.onuuid = (uuid: string) => {
            this.tunnelService.getProtocol(uuid).then(protocol => apply(() => {
                managedClient.protocol = protocol.name;
                managedClient.forms = protocol.connectionForms;
            }), this.requestService.WARN);
        };

        tunnel.onstatechange = (tunnelState: number) => apply(() => {
            switch (tunnelState) {
                case Guacamole.Tunnel.State.CONNECTING:
                    ManagedClientState.setConnectionState(state, ConnectionState.CONNECTING);
                    break;
                case Guacamole.Tunnel.State.OPEN:
                    ManagedClientState.setTunnelUnstable(state, false);
                    break;
                case Guacamole.Tunnel.State.UNSTABLE:
                    ManagedClientState.setTunnelUnstable(state, true);
                    break;
                case Guacamole.Tunnel.State.CLOSED:
                    ManagedClientState.setConnectionState(state, ConnectionState.DISCONNECTED);
                    break;
            }
        });

        client.onstatechange = (clientState: number) => apply(() => {
            switch (clientState) {

                case Guacamole.Client.State.IDLE:
                    ManagedClientState.setConnectionState(state, ConnectionState.IDLE);
                    break;

                case Guacamole.Client.State.CONNECTING:
                    ManagedClientState.setConnectionState(state, ConnectionState.CONNECTING);
                    break;

                case Guacamole.Client.State.WAITING:
                    ManagedClientState.setConnectionState(state, ConnectionState.WAITING);
                    break;

                case Guacamole.Client.State.CONNECTED:
                    ManagedClientState.setConnectionState(state, ConnectionState.CONNECTED);

                    // Sync current clipboard data
                    this.clipboardService.getClipboard().then(data => managedClient.setClipboard(data), () => {});

                    // Begin streaming audio input if possible
                    this.requestAudioStream(client);

                    this.updateThumbnail(managedClient);
                    break;

                // Update thumbnail with final display state
                case Guacamole.Client.State.DISCONNECTING:
                case Guacamole.Client.State.DISCONNECTED:
                    this.updateThumbnail(managedClient);
                    break;

            }
        });

        client.onerror = (status: Guacamole.Status) => apply(() => {
            client.disconnect();
            ManagedClientState.setConnectionState(state, ConnectionState.CLIENT_ERROR, status.code);
        });

        client.onjoin = (connectionId: string, username: string) => apply(() => {
            const connections = managedClient.users[username] = managedClient.users[username] || {};
            managedClient.userCount++;
            connections[connectionId] = true;
        });

        client.onleave = (connectionId: string, username: string) => apply(() => {
            const connections = managedClient.users[username] = managedClient.users[username] || {};
            managedClient.userCount--;
            delete connections[connectionId];
            if (!Object.keys(connections).length)
                delete managedClient.users[username];
        });

        // Automatically update the client thumbnail
        client.onsync = () => {
            const thumbnail = managedClient.thumbnail;
            if (!thumbnail || Date.now() - thumbnail.timestamp >= THUMBNAIL_UPDATE_FREQUENCY)
                apply(() => this.updateThumbnail(managedClient));
        };

        // Defer handling of pipe streams until a handler is registered
        client.onpipe = (stream: Guacamole.InputStream, mimetype: string, name: string) => {
            managedClient.deferredPipeStreams[name] = { stream, mimetype, name };
            const handler = managedClient.deferredPipeStreamHandlers[name];
            if (handler) {
                handler(stream, mimetype, name);
                delete managedClient.deferredPipeStreams[name];
            }
        };

        // Track all received connection parameter values which may be
        // changed while the connection is active
        client.onargv = (stream: Guacamole.InputStream, mimetype: string, name: string) => {

            if (mimetype !== 'text/plain')
                return;

            const reader = new Guacamole.StringReader(stream);
            let value = '';
            reader.ontext = (text: string) => value += text;
            reader.onend = () => {
                const argument = new ManagedArgument(name, value,
                    client.createArgumentValueStream('text/plain', name));
                argument.stream.onack = (status: Guacamole.Status) => {
                    // Arguments which reject changes are immutable
                    if (!status.isError())
                        apply(() => managedClient.arguments[name] = argument);
                };
            };

        };

        // Handle any received clipboard data
        client.onclipboard = (stream: Guacamole.InputStream, mimetype: string) => {

            if (/^text\//.exec(mimetype)) {
                const reader = new Guacamole.StringReader(stream);
                let data = '';
                reader.ontext = (text: string) => data += text;
                reader.onend = () => this.clipboardService.setClipboard({
                    source: managedClient.id, type: mimetype, data
                }).catch(() => {});
            }

            else {
                const reader = new Guacamole.BlobReader(stream, mimetype);
                reader.onend = () => this.clipboardService.setClipboard({
                    source: managedClient.id, type: mimetype, data: reader.getBlob()
                }).catch(() => {});
            }

        };

        client.onmultitouch = (layer: Guacamole.Display.VisibleLayer, touches: number) => {
            managedClient.multiTouchSupport = touches;
        };

        client.onname = (name: string) => apply(() => managedClient.title = name);

        // Handle any received files
        client.onfile = (stream: Guacamole.InputStream, mimetype: string, filename: string) =>
            this.tunnelService.downloadStream(tunnel.uuid!, stream, mimetype, filename);

        client.onfilesystem = (object: Guacamole.Object, name: string) => apply(() =>
            managedClient.filesystems.push(this.createFilesystem(managedClient, object, name)));

        // Prompt for any parameters required to continue connecting
        client.onrequired = (parameters: string[]) => apply(() => {
            managedClient.requiredParameters = {};
            for (const name of parameters)
                managedClient.requiredParameters[name] = '';
        });

        // Track display size and cursor
        const display = client.getDisplay();
        const managedDisplay = managedClient.managedDisplay = new ManagedDisplay(display);
        display.onresize = () => apply(() =>
            managedDisplay.size = { width: display.getWidth(), height: display.getHeight() });
        display.oncursor = (canvas: HTMLCanvasElement, x: number, y: number) => apply(() =>
            managedDisplay.cursor = { canvas, x, y });

        this.retrieveName(managedClient);

        return managedClient;

    }

    /**
     * Retrieves and stores the human-readable name of the object the given
     * client is connecting to.
     */
    private retrieveName(managedClient: ManagedClient): void {

        const identifier = this.parseIdentifier(managedClient.id);
        const setName = (name?: string) => this.digest.apply(() => managedClient.name = managedClient.title = name);

        switch (identifier.type) {

            case ClientIdentifierType.CONNECTION:
                this.connectionService.getConnection(identifier.dataSource, identifier.id)
                    .then(connection => setName(connection.name), this.requestService.WARN);
                break;

            case ClientIdentifierType.CONNECTION_GROUP:
                this.connectionGroupService.getConnectionGroup(identifier.dataSource, identifier.id)
                    .then(group => setName(group.name), this.requestService.WARN);
                break;

            case ClientIdentifierType.ACTIVE_CONNECTION:
                this.activeConnectionService.getActiveConnection(identifier.dataSource, identifier.id)
                    .then(activeConnection => {
                        if (activeConnection.connectionIdentifier)
                            return this.connectionService.getConnection(identifier.dataSource, activeConnection.connectionIdentifier)
                                .then(connection => setName(connection.name));
                        return undefined;
                    })
                    .catch(this.requestService.WARN);
                break;

        }

    }

    /**
     * Connects the given client, if not already connected, using the given
     * display dimensions as the optimal size.
     */
    async connect(managedClient: ManagedClient, width: number, height: number): Promise<void> {

        if (managedClient.clientState.connectionState !== ConnectionState.IDLE)
            return;

        const connectString = await this.getConnectString(this.parseIdentifier(managedClient.id), width, height);
        managedClient.client.connect(connectString);

    }

    /**
     * Uploads the given file to the given client, either to the default
     * upload location or to the given directory of the given filesystem.
     */
    uploadFile(managedClient: ManagedClient, file: File, filesystem?: ManagedFilesystem | null,
            directory?: ManagedFile | null): void {

        let stream: Guacamole.OutputStream;
        if (filesystem) {
            const streamName = (directory || filesystem.currentDirectory).streamName + '/' + file.name;
            stream = filesystem.object.createOutputStream(file.type, streamName);
        }
        else
            stream = managedClient.client.createFileStream(file.type, file.name);

        const upload = new ManagedFileUpload();
        upload.filename = file.name;
        upload.mimetype = file.type;
        upload.progress = 0;
        upload.length = file.size;
        ManagedFileTransferState.setStreamState(upload.transferState, StreamState.OPEN);
        managedClient.uploads.push(upload);

        // Upload only once the server has acknowledged the stream
        stream.onack = (status: Guacamole.Status) => {

            stream.onack = null;

            if (status.isError()) {
                this.digest.apply(() =>
                    ManagedFileTransferState.setStreamState(upload.transferState, StreamState.ERROR, status.code));
                return;
            }

            this.tunnelService.uploadToStream(managedClient.tunnel.uuid!, stream, file,
                length => this.digest.apply(() => upload.progress = length))
                .then(() => this.digest.apply(() => {
                    upload.progress = file.size;
                    stream.sendEnd();
                    ManagedFileTransferState.setStreamState(upload.transferState, StreamState.CLOSED);
                    this.uploadComplete.next(file.name);
                }), (error) => this.digest.apply(() => {
                    const statusCode = (error instanceof RestError && error.type === RestErrorType.STREAM_ERROR)
                        ? error.statusCode
                        : Guacamole.Status.Code.SERVER_ERROR;
                    ManagedFileTransferState.setStreamState(upload.transferState, StreamState.ERROR, statusCode);
                    stream.sendEnd();
                }));

        };

    }

    /**
     * Generates a share link for the given client using the given sharing
     * profile.
     */
    async createShareLink(managedClient: ManagedClient, sharingProfile: SharingProfile): Promise<UserCredentials> {
        try {
            const sharingCredentials = await this.tunnelService.getSharingCredentials(
                managedClient.tunnel.uuid!, sharingProfile.identifier!);
            this.digest.apply(() => managedClient.shareLinks[sharingProfile.identifier!] = {
                name: sharingProfile.name,
                href: getSharingLink(sharingCredentials),
                sharingProfile,
                sharingCredentials
            });
            return sharingCredentials;
        }
        catch (e) {
            this.requestService.WARN(e);
            throw e;
        }
    }

    /**
     * Stores a thumbnail of the current display of the given client, both
     * within the client and within the history of recent connections.
     */
    updateThumbnail(managedClient: ManagedClient): void {

        const display = managedClient.client.getDisplay();
        if (!display || display.getWidth() <= 0 || display.getHeight() <= 0)
            return;

        // Scale screenshot to fit within 320x240
        const canvas = display.flatten();
        const scale = Math.min(320 / canvas.width, 240 / canvas.height, 1);

        const thumbnail = this.document.createElement('canvas');
        thumbnail.width = canvas.width * scale;
        thumbnail.height = canvas.height * scale;
        thumbnail.getContext('2d')!.drawImage(canvas,
            0, 0, canvas.width, canvas.height,
            0, 0, thumbnail.width, thumbnail.height);

        managedClient.thumbnail = { timestamp: Date.now(), canvas: thumbnail };
        this.historyService.updateThumbnail(managedClient.id, thumbnail.toDataURL('image/png'));

    }

    private createFilesystem(managedClient: ManagedClient, object: Guacamole.Object, name: string): ManagedFilesystem {

        const root = new ManagedFile({
            mimetype: Guacamole.Object.STREAM_INDEX_MIMETYPE,
            streamName: Guacamole.Object.ROOT_STREAM,
            type: FileType.DIRECTORY
        });

        const filesystem = new ManagedFilesystem(managedClient, object, name, root);
        this.refreshDirectory(filesystem, root);
        return filesystem;

    }

    /**
     * Refreshes the contents of the given directory from the server.
     */
    refreshDirectory(filesystem: ManagedFilesystem, file: ManagedFile): void {

        // Only directories have contents
        if (file.mimetype !== Guacamole.Object.STREAM_INDEX_MIMETYPE)
            return;

        filesystem.object.requestInputStream(file.streamName, (stream: Guacamole.InputStream, mimetype: string) => {

            if (mimetype !== Guacamole.Object.STREAM_INDEX_MIMETYPE) {
                stream.sendAck('Unexpected mimetype', Guacamole.Status.Code.UNSUPPORTED);
                return;
            }

            stream.sendAck('Ready', Guacamole.Status.Code.SUCCESS);

            const reader = new Guacamole.JSONReader(stream);
            reader.onprogress = () => stream.sendAck('Received', Guacamole.Status.Code.SUCCESS);
            reader.onend = () => this.digest.apply(() => {

                file.files = {};

                let expectedPrefix = file.streamName;
                if (expectedPrefix.charAt(expectedPrefix.length - 1) !== '/')
                    expectedPrefix += '/';

                const mimetypes = reader.getJSON() as Record<string, string>;
                for (const [name, childMimetype] of Object.entries(mimetypes)) {

                    if (!name.startsWith(expectedPrefix))
                        continue;

                    const filename = name.substring(expectedPrefix.length);
                    file.files[filename] = new ManagedFile({
                        mimetype: childMimetype,
                        streamName: name,
                        type: childMimetype === Guacamole.Object.STREAM_INDEX_MIMETYPE ? FileType.DIRECTORY : FileType.NORMAL,
                        parent: file,
                        name: filename
                    });

                }

            });

        });

    }

    downloadFile(filesystem: ManagedFilesystem, path: string): void {
        filesystem.object.requestInputStream(path, (stream: Guacamole.InputStream, mimetype: string) => {
            const filename = path.match(/(.*[\\/])?(.*)/)![2];
            this.tunnelService.downloadStream(filesystem.client.tunnel.uuid!, stream, mimetype, filename);
        });
    }

    changeDirectory(filesystem: ManagedFilesystem, file: ManagedFile): void {
        this.refreshDirectory(filesystem, file);
        filesystem.currentDirectory = file;
    }

}
