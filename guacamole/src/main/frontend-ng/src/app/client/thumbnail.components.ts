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

import { AfterViewInit, ChangeDetectionStrategy, Component, DoCheck, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { ResizeDirective } from '../element/element.directives';
import { Watchers } from '../element/watchers';
import { orderBy } from '../list/sort-order';
import { TranslatePipe } from '../locale/translate.pipe';
import { ClientManagerService } from './client-manager.service';
import { ConnectionState, ManagedClient, ManagedClientGroup } from './types';

/**
 * Displays a live, scaled-down view of the display of a client.
 */
@Component({
    selector: 'guac-thumbnail',
    changeDetection: ChangeDetectionStrategy.Eager,
    host: { 'class': 'thumbnail-main', 'dir': 'ltr' },
    hostDirectives: [ResizeDirective],
    template: `
        <div class="displayOuter">
            <div class="displayMiddle">
                <div #display class="display"></div>
            </div>
        </div>
    `
})
export class ThumbnailComponent implements AfterViewInit, DoCheck {

    private readonly main = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

    readonly client = input.required<ManagedClient>();

    private readonly displayContainer = viewChild.required<ElementRef<HTMLElement>>('display');

    private readonly watchers = new Watchers();

    private display: Guacamole.Display | null = null;

    private viewReady = false;

    constructor() {

        this.watchers.watch(() => this.client(), managedClient => {
            const displayContainer = this.displayContainer().nativeElement;
            displayContainer.innerHTML = '';
            this.display = managedClient.client.getDisplay();
            displayContainer.appendChild(this.display.getElement());
        });

        this.watchers.watch(() => this.client().managedDisplay.size,
            () => queueMicrotask(() => this.updateDisplayScale()));

        inject(ResizeDirective).guacResize.subscribe(() => this.updateDisplayScale());

    }

    ngAfterViewInit(): void {
        this.viewReady = true;
        this.watchers.check();
    }

    ngDoCheck(): void {
        if (this.viewReady)
            this.watchers.check();
    }

    /**
     * Scales the display to fit within the thumbnail.
     */
    updateDisplayScale(): void {
        if (!this.display)
            return;
        this.display.scale(Math.min(
            this.main.offsetWidth / Math.max(this.display.getWidth(), 1),
            this.main.offsetHeight / Math.max(this.display.getHeight(), 1)
        ));
    }

}

/**
 * Displays thumbnails of all clients within a group, arranged as tiles.
 */
@Component({
    selector: 'guac-tiled-thumbnails',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [ThumbnailComponent],
    host: { 'class': 'tiled-client-grid', '[style.width.px]': 'width', '[style.height.px]': 'height' },
    template: `
        @for (clientRow of getClientGrid(); track $index) {
            <div class="tiled-client-row">
                @for (client of clientRow; track $index) {
                    <div class="tiled-client-cell">
                        @if (client) {
                            <div class="client-tile"><guac-thumbnail [client]="client" /></div>
                        }
                    </div>
                }
            </div>
        }
    `
})
export class TiledThumbnailsComponent {

    readonly clientGroup = input.required<ManagedClientGroup>();

    /** The maximum height of the thumbnail, maintaining window aspect. */
    readonly height = Math.min(window.innerHeight, 128);
    readonly width = window.innerWidth / window.innerHeight * this.height;

    getClientGrid(): (ManagedClient | null)[][] {
        return ManagedClientGroup.getClientGrid(this.clientGroup());
    }

}

/**
 * A panel listing all client groups which are not currently displayed,
 * allowing users to switch between them.
 */
@Component({
    selector: 'guac-client-panel',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [TiledThumbnailsComponent, TranslatePipe],
    host: {
        'class': 'client-panel',
        '[class.has-clients]': 'hasClientGroups()',
        '[class.hidden]': 'panelHidden()'
    },
    template: `
        <div class="client-panel-handle" (click)="panelHidden.set(!panelHidden())"></div>
        <ul #list class="client-panel-connection-list" (wheel)="reorientVerticalScroll($event)">
            @for (clientGroup of sortedGroups(); track clientGroup) {
                @if (!clientGroup.attached) {
                    <li class="client-panel-connection" [class.needs-attention]="hasStatusUpdate(clientGroup)">
                        <button class="close-other-connection" (click)="disconnect(clientGroup)">
                            <img [alt]="'CLIENT.ACTION_DISCONNECT' | translate"
                                 [title]="'CLIENT.ACTION_DISCONNECT' | translate" src="images/x.svg">
                        </button>
                        <a [href]="'#/client/' + getIdentifier(clientGroup)">
                            <guac-tiled-thumbnails [clientGroup]="clientGroup" />
                            <div class="name">{{ getTitle(clientGroup) }}</div>
                        </a>
                    </li>
                }
            }
        </ul>
    `
})
export class ClientPanelComponent {

    private readonly clientManager = inject(ClientManagerService);

    readonly clientGroups = input<ManagedClientGroup[]>([]);

    /** Whether the panel is collapsed. */
    readonly panelHidden = signal(false);

    private readonly list = viewChild.required<ElementRef<HTMLElement>>('list');

    readonly sortedGroups = computed(() => orderBy(this.clientGroups(), '-lastUsed'));

    readonly getIdentifier = ManagedClientGroup.getIdentifier;
    readonly getTitle = ManagedClientGroup.getTitle;

    hasClientGroups(): boolean {
        return this.clientGroups().some(group => !group.attached);
    }

    /**
     * Returns whether any client within the given group has a status update
     * (such as a disconnect) which the user should be made aware of.
     */
    hasStatusUpdate(clientGroup: ManagedClientGroup): boolean {
        return clientGroup.clients.some(client => {
            switch (client.clientState.connectionState) {
                case ConnectionState.CLIENT_ERROR:
                case ConnectionState.TUNNEL_ERROR:
                case ConnectionState.DISCONNECTED:
                    return true;
            }
            return false;
        });
    }

    disconnect(clientGroup: ManagedClientGroup): void {
        this.clientManager.removeManagedClientGroup(ManagedClientGroup.getIdentifier(clientGroup));
    }

    /**
     * Scrolls the horizontal connection list in response to vertical mouse
     * wheel movement. The direction is mirrored when the layout is
     * right-to-left, such that scrolling down always advances through the
     * list.
     */
    reorientVerticalScroll(e: WheelEvent): void {

        if (!e.deltaY)
            return;

        const list = this.list().nativeElement;
        const multiplier = [1, 15, list.offsetWidth][e.deltaMode] ?? 15;
        const direction = getComputedStyle(list).direction === 'rtl' ? -1 : 1;

        list.scrollLeft += direction * e.deltaY * multiplier;
        e.preventDefault();

    }

}
