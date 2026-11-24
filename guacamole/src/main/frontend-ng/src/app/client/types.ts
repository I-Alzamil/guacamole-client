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

import { Form } from '../rest/types/field';
import { SharingProfile, UserCredentials } from '../rest/types/model';

/**
 * All possible states of a connection, from the perspective of the client.
 */
export enum ConnectionState {

    /** The connection has not yet been attempted. */
    IDLE = 'IDLE',

    /** The connection is being established. */
    CONNECTING = 'CONNECTING',

    /** Connection established; waiting for the remote desktop server. */
    WAITING = 'WAITING',

    /** The connection is established and remote desktop data is flowing. */
    CONNECTED = 'CONNECTED',

    /** The connection has been closed normally. */
    DISCONNECTED = 'DISCONNECTED',

    /** The connection was closed due to an error reported by the server. */
    CLIENT_ERROR = 'CLIENT_ERROR',

    /** The connection was closed due to a network/tunnel error. */
    TUNNEL_ERROR = 'TUNNEL_ERROR'

}

/**
 * The current state of a Guacamole connection.
 */
export class ManagedClientState {

    connectionState: ConnectionState = ConnectionState.IDLE;

    /** Whether the network connection is currently unstable. */
    tunnelUnstable = false;

    /** The status code of the most recent error, if any. */
    statusCode: number = Guacamole.Status.Code.SUCCESS;

    /**
     * Sets the connection state, unless the connection has already failed
     * (error states are final).
     */
    static setConnectionState(clientState: ManagedClientState, connectionState: ConnectionState, statusCode?: number): void {

        if (clientState.connectionState === ConnectionState.TUNNEL_ERROR
                || clientState.connectionState === ConnectionState.CLIENT_ERROR)
            return;

        clientState.connectionState = connectionState;
        clientState.tunnelUnstable = false;

        if (statusCode)
            clientState.statusCode = statusCode;

    }

    static setTunnelUnstable(clientState: ManagedClientState, unstable: boolean): void {
        clientState.tunnelUnstable = unstable;
    }

}

/**
 * Display and interaction properties of a client.
 */
export class ClientProperties {

    /** Whether the display should be scaled to fit the browser window. */
    autoFit = true;

    scale = 1;
    minScale = 1;
    maxScale = 3;

    /** Whether the client should receive keyboard input. */
    focused = false;

    scrollTop = 0;
    scrollLeft = 0;

}

export interface DisplayDimensions {
    width: number;
    height: number;
}

export interface DisplayCursor {
    canvas: HTMLCanvasElement;
    x: number;
    y: number;
}

/**
 * The display of a client, tracking its size and cursor.
 */
export class ManagedDisplay {

    size: DisplayDimensions = { width: 0, height: 0 };

    cursor?: DisplayCursor;

    constructor(readonly display: Guacamole.Display) {}

}

/**
 * A connection parameter whose value may be changed while the connection is
 * active.
 */
export class ManagedArgument {

    /** Whether a change to the argument value is awaiting acknowledgement. */
    pending = false;

    constructor(readonly name: string, public value: string, readonly stream: Guacamole.OutputStream) {}

    /**
     * Sends the given value to the server, if different from the current
     * value and no other change is pending.
     */
    setValue(value: string): void {
        if (!this.pending && value !== this.value) {
            const writer = new Guacamole.StringWriter(this.stream);
            writer.sendText(value);
            writer.sendEnd();
            this.pending = true;
        }
    }

}

/**
 * All possible states of a file transfer stream.
 */
export enum StreamState {
    IDLE = 'IDLE',
    OPEN = 'OPEN',
    CLOSED = 'CLOSED',
    ERROR = 'ERROR'
}

export class ManagedFileTransferState {

    streamState: StreamState = StreamState.IDLE;

    statusCode: number = Guacamole.Status.Code.SUCCESS;

    /**
     * Sets the stream state, unless the transfer has already failed.
     */
    static setStreamState(transferState: ManagedFileTransferState, streamState: StreamState, statusCode?: number): void {

        if (transferState.streamState === StreamState.ERROR)
            return;

        transferState.streamState = streamState;

        if (statusCode)
            transferState.statusCode = statusCode;

    }

}

/**
 * An upload of a file to a connection.
 */
export class ManagedFileUpload {
    transferState = new ManagedFileTransferState();
    mimetype?: string;
    filename?: string;
    progress?: number;
    length?: number;
}

export enum FileType {
    NORMAL = 'NORMAL',
    DIRECTORY = 'DIRECTORY'
}

/**
 * A file within a filesystem exposed by a connection.
 */
export class ManagedFile {

    mimetype: string;
    streamName: string;
    type: FileType;
    name?: string;
    parent?: ManagedFile;

    /** All files within this directory, keyed by name. */
    files: Record<string, ManagedFile> = {};

    constructor(template: Pick<ManagedFile, 'mimetype' | 'streamName' | 'type'> & Partial<ManagedFile>) {
        this.mimetype = template.mimetype;
        this.streamName = template.streamName;
        this.type = template.type;
        this.name = template.name;
        this.parent = template.parent;
        this.files = template.files || {};
    }

}

/**
 * A filesystem exposed by a connection.
 */
export class ManagedFilesystem {

    currentDirectory: ManagedFile;

    constructor(readonly client: ManagedClient, readonly object: Guacamole.Object,
            readonly name: string, readonly root: ManagedFile) {
        this.currentDirectory = root;
    }

}

/**
 * A link which may be used to share a connection.
 */
export interface ManagedShareLink {
    name?: string;
    href: string;
    sharingProfile: SharingProfile;
    sharingCredentials: UserCredentials;
}

export interface ManagedClientThumbnail {
    timestamp: number;
    canvas: HTMLCanvasElement;
}

/**
 * A pipe stream received before any handler for that pipe was registered.
 */
interface DeferredPipeStream {
    stream: Guacamole.InputStream;
    mimetype: string;
    name: string;
}

export type PipeStreamHandler = (stream: Guacamole.InputStream, mimetype: string, name: string) => void;

/**
 * A Guacamole client and all associated state, independent of any
 * particular view. Clients persist across navigation until explicitly
 * removed.
 */
export class ManagedClient {

    /** The mimetype of audio input sent to the server. */
    static readonly AUDIO_INPUT_MIMETYPE = 'audio/L16;rate=44100,channels=2';

    managedDisplay!: ManagedDisplay;

    /** The name of the connection, if known. */
    name?: string;

    /** The title of the connection, as reported by the remote desktop. */
    title?: string;

    /** The protocol of the connection, if known. */
    protocol: string | null = null;

    /** The parameter forms of the connection's protocol. */
    forms: Form[] = [];

    thumbnail?: ManagedClientThumbnail;

    /**
     * Parameters required by the server to continue connecting, mapped to
     * the values entered so far, or null if nothing is required.
     */
    requiredParameters: Record<string, string> | null = null;

    uploads: ManagedFileUpload[] = [];

    filesystems: ManagedFilesystem[] = [];

    /** The number of users sharing this connection, including this one. */
    userCount = 0;

    /** All users sharing this connection, mapped to their connection IDs. */
    users: Record<string, Record<string, boolean>> = {};

    /** Share links which have been generated, keyed by sharing profile. */
    shareLinks: Record<string, ManagedShareLink> = {};

    /** The number of simultaneous touches supported by the remote desktop. */
    multiTouchSupport = 0;

    clientState = new ManagedClientState();

    clientProperties = new ClientProperties();

    /** Connection parameters which may be changed, keyed by name. */
    arguments: Record<string, ManagedArgument> = {};

    deferredPipeStreams: Record<string, DeferredPipeStream> = {};

    deferredPipeStreamHandlers: Record<string, PipeStreamHandler> = {};

    constructor(readonly id: string, readonly client: Guacamole.Client, readonly tunnel: Guacamole.Tunnel) {}

    /**
     * Sends the given clipboard data to the remote desktop, unless the data
     * originated from this client.
     */
    setClipboard(data: { source?: string, type: string, data: string | Blob }): void {

        if (data.source === this.id)
            return;

        const stream = this.client.createClipboardStream(data.type);

        if (typeof data.data === 'string') {
            const writer = new Guacamole.StringWriter(stream);
            writer.sendText(data.data);
            writer.sendEnd();
        }
        else {
            const writer = new Guacamole.BlobWriter(stream);
            writer.oncomplete = () => writer.sendEnd();
            writer.sendBlob(data.data);
        }

    }

    /**
     * Changes the value of the given connection parameter, if mutable.
     */
    setArgument(name: string, value: string): void {
        this.arguments[name]?.setValue(value);
    }

    /**
     * Sends the given parameter values to the server, typically in response
     * to a request for required parameters.
     */
    sendArguments(values: Record<string, string>): void {
        for (const [name, value] of Object.entries(values)) {
            const writer = new Guacamole.StringWriter(this.client.createArgumentValueStream('text/plain', name));
            writer.sendText(value);
            writer.sendEnd();
        }
    }

    /**
     * Returns the current values of all mutable connection parameters, keyed
     * by parameter name.
     */
    getArgumentModel(): Record<string, string> {
        const model: Record<string, string> = {};
        for (const argument of Object.values(this.arguments))
            model[argument.name] = argument.value;
        return model;
    }

    isShared(): boolean {
        return Object.keys(this.shareLinks).length > 0;
    }

    hasTransfers(): boolean {
        return this.uploads.length > 0;
    }

    /**
     * Registers a handler for the pipe stream having the given name,
     * immediately invoking the handler if that stream was already received.
     */
    registerDeferredPipeHandler(name: string, handler: PipeStreamHandler): void {

        this.deferredPipeStreamHandlers[name] = handler;

        const deferred = this.deferredPipeStreams[name];
        if (deferred) {
            handler(deferred.stream, deferred.mimetype, deferred.name);
            delete this.deferredPipeStreams[name];
        }

    }

    detachDeferredPipeHandler(name: string, handler: PipeStreamHandler): void {
        if (this.deferredPipeStreamHandlers[name] === handler)
            delete this.deferredPipeStreamHandlers[name];
    }

}

/**
 * A group of clients displayed together as tiles.
 */
export class ManagedClientGroup {

    /** The time this group was last used, in milliseconds since epoch. */
    lastUsed = 0;

    /** Whether this group is currently displayed. */
    attached = false;

    clients: ManagedClient[];

    rows: number;

    columns: number;

    private grid: (ManagedClient | null)[][] = [];

    constructor(clients: ManagedClient[] = []) {
        this.clients = clients;
        this.columns = ManagedClientGroup.getColumns(this);
        this.rows = ManagedClientGroup.getRows(this);
    }

    static recalculateTiles(group: ManagedClientGroup): void {
        group.columns = ManagedClientGroup.getColumns(group);
        group.rows = ManagedClientGroup.getRows(group);
    }

    /**
     * Returns the unique identifier of the given group (or list of client
     * identifiers): the client identifiers joined by ".".
     */
    static getIdentifier(group: ManagedClientGroup | string[]): string {
        const ids = Array.isArray(group) ? group : group.clients.map(client => client.id);
        return ids.join('.');
    }

    static getClientIdentifiers(group: ManagedClientGroup | string): string[] {
        if (typeof group === 'string')
            return group.split(/\./);
        return group.clients.map(client => client.id);
    }

    static getColumns(group: ManagedClientGroup): number {
        return group.clients.length ? Math.ceil(Math.sqrt(group.clients.length)) : 0;
    }

    static getRows(group: ManagedClientGroup): number {
        return group.clients.length ? Math.ceil(group.clients.length / ManagedClientGroup.getColumns(group)) : 0;
    }

    static getTitle(group: ManagedClientGroup): string | undefined {
        if (group.clients.length === 1)
            return group.clients[0].title;
        return ManagedClientGroup.getName(group);
    }

    /**
     * Returns a human-readable name for the given group: the names of the
     * focused clients, or of all clients if none are focused.
     */
    static getName(group: ManagedClientGroup): string {

        let relevantClients = group.clients.filter(client => client.clientProperties.focused);
        if (!relevantClients.length)
            relevantClients = group.clients;

        return relevantClients.filter(client => !!client.name).map(client => client.name).join(', ') || '...';

    }

    static hasMultipleClients(group: ManagedClientGroup | null | undefined): boolean {
        return !!group && group.clients.length > 1;
    }

    /**
     * Returns the clients of the given group arranged as a grid. The same
     * array instances are reused between calls.
     */
    static getClientGrid(group: ManagedClientGroup): (ManagedClient | null)[][] {

        let index = 0;
        const grid = group.grid;
        grid.splice(group.rows);

        for (let row = 0; row < group.rows; row++) {
            const currentRow = grid[row] || (grid[row] = []);
            currentRow.splice(group.columns);
            for (let column = 0; column < group.columns; column++)
                currentRow[column] = group.clients[index++] || null;
        }

        return grid;

    }

    /**
     * Ensures at least one client within the group is focused.
     */
    static verifyFocus(group: ManagedClientGroup): void {
        if (group.clients.length && !group.clients.some(client => client.clientProperties.focused))
            group.clients[0].clientProperties.focused = true;
    }

}
