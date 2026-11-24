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

import { ChangeDetectionStrategy, Component, DestroyRef, DoCheck, ElementRef, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthenticationService } from '../auth/authentication.service';
import { ClipboardComponent } from '../clipboard/clipboard.component';
import { ClipboardService } from '../clipboard/clipboard.service';
import { TouchDragDirective, UploadDirective } from '../element/element.directives';
import { Watchers } from '../element/watchers';
import { FormComponent } from '../form/form.component';
import { GroupListFilterComponent } from '../group-list/group-list-filter.component';
import { GroupListItem } from '../group-list/group-list-item';
import { GroupListComponent } from '../group-list/group-list.component';
import { KeyboardEventsService } from '../index/keyboard-events.service';
import { PageService } from '../index/page.service';
import { orderBy } from '../list/sort-order';
import { TranslatePipe } from '../locale/translate.pipe';
import { MenuComponent } from '../navigation/menu.component';
import { MenuAction } from '../navigation/page-definition';
import { UserMenuComponent } from '../navigation/user-menu.component';
import { UserPageService } from '../navigation/user-page.service';
import { ConnectionGroupService } from '../rest/connection.services';
import { DataSourceService } from '../rest/data-source.service';
import { RequestService } from '../rest/request.service';
import { TunnelService } from '../rest/tunnel.service';
import { ConnectionGroup, ROOT_CONNECTION_GROUP, SharingProfile, getProtocolNamespace } from '../rest/types/model';
import { InputMethod, PreferenceService } from '../settings/preference.service';
import { ClientManagerService } from './client-manager.service';
import { ClientMenuService } from './client-menu.service';
import { ClientZoomComponent, ViewportComponent } from './client-zoom.component';
import { FileBrowserComponent, FileTransferManagerComponent } from './file-transfer.components';
import { OskComponent, TextInputComponent } from './input-methods.components';
import { ManagedClientService } from './managed-client.service';
import { FullscreenService } from './media.service';
import { TiledClientsComponent } from './tiled-clients.components';
import { ConnectionState, ManagedClient, ManagedClientGroup, ManagedFile, ManagedFilesystem } from './types';

/**
 * The minimum number of pixels a drag gesture must move to result in the
 * menu being shown or hidden.
 */
const MENU_DRAG_DELTA = 64;

/**
 * The maximum X location of the start of a drag gesture for that gesture to
 * result in the menu being shown.
 */
const MENU_DRAG_MARGIN = 64;

/**
 * When showing or hiding the menu via a drag gesture, the maximum number of
 * pixels the touch can move vertically and still affect the menu.
 */
const MENU_DRAG_VERTICAL_TOLERANCE = 10;

/*
 * In order to open the guacamole menu, we need to hit ctrl-alt-shift. There
 * are several possible keysysms for each key.
 */
const SHIFT_KEYS: Record<number, boolean> = { 0xFFE1: true, 0xFFE2: true };
const ALT_KEYS: Record<number, boolean> = {
    0xFFE9: true, 0xFFEA: true, 0xFE03: true, 0xFFE7: true, 0xFFE8: true, 0xFFED: true, 0xFFEE: true
};
const CTRL_KEYS: Record<number, boolean> = { 0xFFE3: true, 0xFFE4: true };
const MENU_KEYS: Record<number, boolean> = { ...SHIFT_KEYS, ...ALT_KEYS, ...CTRL_KEYS };

/**
 * Keysyms for the End key, which is substituted for Delete when pressed
 * with Ctrl+Alt (the browser will not pass Ctrl+Alt+Del through).
 */
const END_KEYS: Record<number, boolean> = { 0xFF57: true, 0xFFB1: true };
const DEL_KEY = 0xFFFF;

/**
 * Returns whether any of the given keys are currently pressed.
 */
function anyPressed(keyboard: Guacamole.Keyboard, keys: Record<number, boolean>): boolean {
    const pressed = keyboard.pressed as Record<number, boolean>;
    return Object.keys(keys).some(keysym => pressed[Number(keysym)]);
}

/**
 * Context made available to the item templates of the connection selection
 * menu.
 */
interface ConnectionListContext {
    attachedClients: Record<string, boolean>;
    updateAttachedClients: (id: string) => void;
}

/**
 * The page displaying one or more connected clients, along with the
 * Guacamole menu.
 */
@Component({
    selector: 'guac-client-page',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [ClientZoomComponent, ClipboardComponent, FileBrowserComponent, FileTransferManagerComponent,
        FormComponent, FormsModule, GroupListComponent, GroupListFilterComponent, MenuComponent,
        OskComponent, TextInputComponent, TiledClientsComponent, TouchDragDirective, TranslatePipe,
        UploadDirective, UserMenuComponent, ViewportComponent],
    templateUrl: './client-page.component.html'
})
export class ClientPageComponent implements DoCheck {

    private readonly clientManager = inject(ClientManagerService);
    private readonly clipboardService = inject(ClipboardService);
    private readonly managedClientService = inject(ManagedClientService);
    private readonly pageService = inject(PageService);
    private readonly requestService = inject(RequestService);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly tunnelService = inject(TunnelService);

    protected readonly menuService = inject(ClientMenuService);

    private readonly preferences = inject(PreferenceService).preferences;

    /** The current state of the Guacamole menu. */
    readonly menu = {
        inputMethod: this.preferences.inputMethod,
        emulateAbsoluteMouse: this.preferences.emulateAbsoluteMouse,

        /** Current values of all mutable connection parameters. */
        connectionParameters: {} as Record<string, string>
    };

    /** The client group currently displayed. */
    readonly clientGroup = signal<ManagedClientGroup | null>(null);

    /** The single focused client, or null if zero or multiple are focused. */
    readonly focusedClient = signal<ManagedClient | null>(null);

    /**
     * The root connection groups of all data sources, if the user has
     * access to more than one connection.
     */
    readonly rootConnectionGroups = signal<Record<string, ConnectionGroup> | null>(null);

    readonly filteredRootConnectionGroups = signal<Record<string, ConnectionGroup | GroupListItem>>({});

    readonly connectionListContext: ConnectionListContext = {
        attachedClients: {},
        updateAttachedClients: (id) => this.addRemoveClient(id, !this.connectionListContext.attachedClients[id])
    };

    /** The sharing profiles available for the focused client. */
    readonly sharingProfiles = signal<Record<string, SharingProfile>>({});

    /** The filesystem currently displayed within the filesystem menu. */
    readonly filesystemMenuContents = signal<ManagedFilesystem | null>(null);

    readonly clientMenuActions: MenuAction[] = [
        { name: 'CLIENT.ACTION_DISCONNECT', className: 'danger disconnect', callback: () => this.disconnect() },
        { name: 'CLIENT.ACTION_FULLSCREEN', className: 'fullscreen action', callback: () => {
            this.fullscreenService.toggleFullscreenMode();
            this.menuService.hide();
        } }
    ];

    protected readonly getProtocolNamespace = getProtocolNamespace;
    protected readonly getName = ManagedClientGroup.getName;

    /** Keys pressed which are being substituted with other keys. */
    private substituteKeysPressed: Record<number, number> = {};

    private readonly watchers = new Watchers();

    private readonly fullscreenService = inject(FullscreenService);

    /** The scrollable body of the Guacamole menu, if shown. */
    private readonly menuBody = viewChild<ElementRef<HTMLElement>>('menuBody');

    constructor() {

        const destroyRef = inject(DestroyRef);
        const keyboardEvents = inject(KeyboardEventsService);

        // Display the clients identified within the URL, updating as the
        // URL changes (the component is reused across client URLs)
        const routeSubscription = this.route.paramMap.subscribe(params => this.reparseRoute(params.get('id') ?? ''));

        // Retrieve root groups if the user has access to multiple
        // connections, allowing connections to be added to the view
        const authenticationService = inject(AuthenticationService);
        const connectionGroupService = inject(ConnectionGroupService);
        const userPageService = inject(UserPageService);
        inject(DataSourceService).apply(
            (dataSource, id) => connectionGroupService.getConnectionGroupTree(dataSource, id),
            authenticationService.getAvailableDataSources(),
            ROOT_CONNECTION_GROUP
        ).then(rootConnectionGroups => {
            if (userPageService.getClientPages(rootConnectionGroups).length > 1)
                this.rootConnectionGroups.set(rootConnectionGroups);
        }, this.requestService.WARN);

        // Populate the editable connection parameters whenever the menu is
        // shown, applying any changes when the menu is hidden
        let menuWasShown = false;
        effect(() => {
            const shown = this.menuService.shown();
            untracked(() => {
                const focusedClient = this.focusedClient();
                if (shown)
                    this.menu.connectionParameters = focusedClient?.getArgumentModel() ?? {};
                else if (menuWasShown)
                    this.applyParameterChanges(focusedClient);
            });
            menuWasShown = shown;
        });

        // Use the focused client's display as the page icon
        this.watchers.watch(() => this.focusedClient()?.thumbnail?.canvas, canvas => this.pageService.setIcons(canvas));

        // Retrieve sharing profiles of the focused client's connection
        this.watchers.watch(() => this.focusedClient()?.tunnel.uuid, uuid => {
            if (!uuid) {
                this.sharingProfiles.set({});
                return;
            }
            this.tunnelService.getSharingProfiles(uuid)
                .then(profiles => this.sharingProfiles.set(profiles), this.requestService.WARN);
        });

        // Keep editable connection parameters up-to-date as the focused
        // client's mutable arguments are discovered
        this.watchers.watch(() => Object.keys(this.focusedClient()?.arguments ?? {}).join('\0'), () => {
            const focusedClient = this.focusedClient();
            if (focusedClient)
                this.menu.connectionParameters = focusedClient.getArgumentModel();
        });

        // Update page title to match the client(s) displayed
        this.watchers.watch(() => {
            const group = this.clientGroup();
            return group ? ManagedClientGroup.getTitle(group) : undefined;
        }, title => this.pageService.title.set(title ?? ''));

        // Refresh filesystem contents whenever the filesystem menu is shown
        this.watchers.watch(() => this.isFilesystemMenuShown(), () => {
            const filesystem = this.filesystemMenuContents();
            if (filesystem)
                this.managedClientService.refreshDirectory(filesystem, filesystem.currentDirectory);
        });

        const subscriptions = [

            // Toggle the menu upon Ctrl+Alt+Shift, blocking all other key
            // events while the menu is shown
            keyboardEvents.beforeKeydown.subscribe(event => {
                if (this.isMenuShortcutPressed(event.keyboard)) {
                    event.preventDefault();
                    event.keyboard.reset();
                    this.menuService.toggle();
                }
                else if (this.menuService.shown())
                    event.preventDefault();
            }),

            keyboardEvents.beforeKeyup.subscribe(event => {
                if (this.menuService.shown())
                    event.preventDefault();
            }),

            // Substitute Delete for End when Ctrl+Alt is held
            keyboardEvents.keydown.subscribe(event => {
                if (END_KEYS[event.keysym] && anyPressed(event.keyboard, ALT_KEYS) && anyPressed(event.keyboard, CTRL_KEYS)) {
                    event.preventDefault();
                    this.substituteKeysPressed[event.keysym] = DEL_KEY;
                    keyboardEvents.syntheticKeydown.next(DEL_KEY);
                }
            }),

            keyboardEvents.keyup.subscribe(event => {
                const substitute = this.substituteKeysPressed[event.keysym];
                if (substitute) {
                    event.preventDefault();
                    keyboardEvents.syntheticKeyup.next(substitute);
                    delete this.substituteKeysPressed[event.keysym];
                }
            })

        ];

        destroyRef.onDestroy(() => {
            routeSubscription.unsubscribe();
            subscriptions.forEach(subscription => subscription.unsubscribe());
            this.setAttachedGroup(null);
            this.menuService.hide();
            this.fullscreenService.setFullscreenMode(false);
        });

    }

    ngDoCheck(): void {
        this.watchers.check();
    }

    /**
     * Returns whether Ctrl+Alt+Shift (and only those keys) are pressed.
     */
    private isMenuShortcutPressed(keyboard: Guacamole.Keyboard): boolean {

        const pressed = keyboard.pressed as Record<number, boolean>;

        // Ensure that the only keys pressed are menu keys
        if (Object.keys(pressed).some(keysym => pressed[Number(keysym)] && !MENU_KEYS[Number(keysym)]))
            return false;

        return anyPressed(keyboard, SHIFT_KEYS) && anyPressed(keyboard, ALT_KEYS) && anyPressed(keyboard, CTRL_KEYS);

    }

    /**
     * Displays the client group identified by the given URL parameter.
     */
    private reparseRoute(id: string): void {

        const previousClients = this.clientGroup()?.clients.slice() ?? [];

        // Replace existing group with new group
        this.setAttachedGroup(this.clientManager.getManagedClientGroup(id));

        const clientGroup = this.clientGroup()!;
        this.connectionListContext.attachedClients = {};
        clientGroup.clients.forEach(client => this.connectionListContext.attachedClients[client.id] = true);

        // Ensure menu is closed if the displayed clients are entirely
        // different
        if (!clientGroup.clients.some(client => previousClients.includes(client)))
            this.menuService.hide();

        // Update newly-attached clients with current contents of clipboard
        this.clipboardService.resyncClipboard();

    }

    /**
     * Attaches the given group (detaching any previous group), removing any
     * clients of the previous group which have disconnected.
     */
    private setAttachedGroup(managedClientGroup: ManagedClientGroup | null): void {

        const current = this.clientGroup();
        if (current === managedClientGroup)
            return;

        if (current) {

            // Remove all disconnected clients from management (the user has
            // seen their status)
            current.clients.filter(client => {
                const connectionState = client.clientState.connectionState;
                return connectionState === ConnectionState.DISCONNECTED
                    || connectionState === ConnectionState.TUNNEL_ERROR
                    || connectionState === ConnectionState.CLIENT_ERROR;
            }).forEach(client => this.clientManager.removeManagedClient(client.id));

            current.attached = false;

        }

        if (managedClientGroup) {
            managedClientGroup.attached = true;
            managedClientGroup.lastUsed = Date.now();
        }

        this.clientGroup.set(managedClientGroup);

    }

    /**
     * Adds or removes the client having the given ID from the current view,
     * by navigating to the URL of the corresponding group.
     */
    addRemoveClient(id: string, remove: boolean): void {

        let ids = ManagedClientGroup.getClientIdentifiers(this.route.snapshot.paramMap.get('id') ?? '');
        if (remove)
            ids = ids.filter(existing => existing !== id);
        else
            ids.push(id);

        this.router.navigateByUrl('/client/' + ManagedClientGroup.getIdentifier(ids));

    }

    /**
     * Sends all connection parameter changes made within the menu to the
     * given client.
     */
    applyParameterChanges(client: ManagedClient | null): void {
        if (!client)
            return;
        for (const [name, value] of Object.entries(this.menu.connectionParameters))
            client.setArgument(name, value);
    }

    focusedClientChanged(newFocusedClient: ManagedClient | null): void {

        const oldFocusedClient = this.focusedClient();
        this.focusedClient.set(newFocusedClient);

        // Apply any parameter changes to the old focused client
        this.applyParameterChanges(oldFocusedClient);

        this.menu.connectionParameters = newFocusedClient?.getArgumentModel() ?? {};

    }

    closeMenu(): void {
        this.menuService.hide();
    }

    /**
     * Shows or hides the menu in response to horizontal drag gestures,
     * otherwise scrolling the menu while it is shown.
     */
    readonly menuDrag = (inProgress: boolean, startX: number, startY: number,
            currentX: number, currentY: number, deltaX: number, deltaY: number) => {

        // Mirror the gesture when the menu is on the right (RTL layout)
        const rtl = document.documentElement.dir === 'rtl';
        const toward = rtl ? startX - currentX : currentX - startX;
        const fromEdge = rtl ? window.innerWidth - startX : startX;

        // Hide menu by swiping it back toward the edge it came from
        if (this.menuService.shown()) {
            if (Math.abs(currentY - startY) < MENU_DRAG_VERTICAL_TOLERANCE && -toward >= MENU_DRAG_DELTA)
                this.menuService.hide();

            // Scroll menu by default (native scrolling is prevented)
            else {
                const menuBody = this.menuBody()?.nativeElement;
                if (menuBody) {
                    menuBody.scrollLeft -= deltaX;
                    menuBody.scrollTop -= deltaY;
                }
            }
        }

        // Show menu by swiping from the edge of the screen
        else if (fromEdge <= MENU_DRAG_MARGIN) {
            if (Math.abs(currentY - startY) < MENU_DRAG_VERTICAL_TOLERANCE && toward >= MENU_DRAG_DELTA)
                this.menuService.show();
        }

        return false;

    };

    showOSK(): boolean {
        return this.menu.inputMethod === InputMethod.OSK;
    }

    showTextInput(): boolean {
        return this.menu.inputMethod === InputMethod.TEXT;
    }

    share(sharingProfile: SharingProfile): void {
        const focusedClient = this.focusedClient();
        if (focusedClient)
            this.managedClientService.createShareLink(focusedClient, sharingProfile).catch(() => {});
    }

    isShared(): boolean {
        return !!this.focusedClient()?.isShared();
    }

    getShareLinks() {
        return orderBy(Object.values(this.focusedClient()?.shareLinks ?? {}), 'name');
    }

    canShareConnection(): boolean {
        return Object.keys(this.sharingProfiles()).length > 0;
    }

    sharingProfileList(): SharingProfile[] {
        return Object.values(this.sharingProfiles());
    }

    isConnectionUnstable(): boolean {
        return !!this.clientGroup()?.clients.some(client => client.clientState.tunnelUnstable);
    }

    /**
     * Disconnects all focused clients.
     */
    disconnect(): void {
        this.clientGroup()?.clients.forEach(client => {
            if (client.clientProperties.focused)
                client.client.disconnect();
        });
        this.menuService.hide();
    }

    /**
     * Closes the given client tile, removing the client from the current
     * view.
     */
    closeClientTile(client: ManagedClient): void {
        this.addRemoveClient(client.id, true);
        this.clientManager.removeManagedClient(client.id);
        const group = this.clientGroup();
        if (group)
            ManagedClientGroup.verifyFocus(group);
    }

    isFilesystemMenuShown(): boolean {
        return !!this.filesystemMenuContents() && this.menuService.shown();
    }

    /**
     * Returns the path from the root of the filesystem to the given file,
     * excluding the root.
     */
    getPath(file: ManagedFile | null | undefined): ManagedFile[] {
        const path: ManagedFile[] = [];
        while (file?.parent) {
            path.unshift(file);
            file = file.parent;
        }
        return path;
    }

    changeDirectory(filesystem: ManagedFilesystem, file: ManagedFile): void {
        this.managedClientService.changeDirectory(filesystem, file);
    }

    uploadFiles(files: FileList): void {
        const filesystem = this.filesystemMenuContents();
        if (!filesystem)
            return;
        for (const file of Array.from(files))
            this.managedClientService.uploadFile(filesystem.client, file, filesystem);
    }

    hasTransfers(): boolean {
        return !!this.clientGroup()?.clients.some(client => client.hasTransfers());
    }

}

