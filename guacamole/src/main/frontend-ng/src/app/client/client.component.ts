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

import { AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, DoCheck, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { ClipboardService } from '../clipboard/clipboard.service';
import { ResizeDirective, listenTouchDrag, listenTouchPinch } from '../element/element.directives';
import { Watchers } from '../element/watchers';
import { DigestService } from '../index/digest.service';
import { KeyboardEventsService } from '../index/keyboard-events.service';
import { ManagedClientService } from './managed-client.service';
import { ManagedClient } from './types';

/**
 * Displays the remote desktop of a single client, sending all mouse, touch,
 * and keyboard input to that client. The display is always laid out
 * left-to-right, as it represents the physical layout of the remote screen.
 */
@Component({
    selector: 'guac-client',
    changeDetection: ChangeDetectionStrategy.Eager,
    host: {
        'class': 'client-main main',
        'dir': 'ltr',
        '[class.drop-pending]': 'dropPending()',
        '(dragenter)': 'dragStart($event)',
        '(dragover)': 'dragStart($event)',
        '(dragleave)': 'dragEnd($event)',
        '(drop)': 'drop($event)'
    },
    hostDirectives: [ResizeDirective],
    template: `
        <div class="displayOuter">
            <div class="displayMiddle">
                <div #display class="display software-cursor"></div>
            </div>
        </div>
    `
})
export class ClientComponent implements AfterViewInit, DoCheck {

    private readonly digest = inject(DigestService);
    private readonly keyboardEvents = inject(KeyboardEventsService);
    private readonly managedClientService = inject(ManagedClientService);
    private readonly main = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

    /** The client whose display should be shown. */
    readonly client = input.required<ManagedClient>();

    /**
     * Whether touch input should emulate an absolute pointing device (a
     * touchscreen) rather than a relative one (a touchpad).
     */
    readonly emulateAbsoluteMouse = input<boolean>(true);

    readonly dropPending = signal(false);

    private readonly displayContainer = viewChild.required<ElementRef<HTMLElement>>('display');

    private readonly watchers = new Watchers();

    /** Whether the local, hardware cursor is in use. */
    private localCursor = false;

    private guacClient: Guacamole.Client | null = null;
    private display: Guacamole.Display | null = null;

    private mouse!: Guacamole.Mouse;
    private touchScreen!: Guacamole.Mouse.Touchscreen;
    private touchPad!: Guacamole.Mouse.Touchpad;
    private touch!: Guacamole.Touch;

    private clipboardSyncInProgress = false;

    /** State of an in-progress pinch-to-zoom gesture. */
    private initialScale: number | null = null;
    private initialCenterX = 0;
    private initialCenterY = 0;

    private get properties() {
        return this.client().clientProperties;
    }

    constructor() {

        const destroyRef = inject(DestroyRef);

        // Scroll via touch drag and zoom via pinch, and keep the remote
        // display sized to match the main element
        listenTouchDrag(this.main, () => this.clientDrag, this.digest);
        listenTouchPinch(this.main, () => this.clientPinch, this.digest);
        inject(ResizeDirective).guacResize.subscribe(() => this.mainElementResized());

        // Forward key events to the client while focused
        const subscriptions = [

            this.keyboardEvents.keydown.subscribe(event => {
                if (this.properties.focused) {
                    this.guacClient?.sendKeyEvent(1, event.keysym);
                    event.preventDefault();
                }
            }),

            this.keyboardEvents.keyup.subscribe(event => {
                if (this.properties.focused) {
                    this.guacClient?.sendKeyEvent(0, event.keysym);
                    event.preventDefault();
                }
            }),

            this.keyboardEvents.syntheticKeydown.subscribe(keysym => {
                if (this.properties.focused)
                    this.guacClient?.sendKeyEvent(1, keysym);
            }),

            this.keyboardEvents.syntheticKeyup.subscribe(keysym => {
                if (this.properties.focused)
                    this.guacClient?.sendKeyEvent(0, keysym);
            }),

            // Update remote clipboard if local clipboard changes
            inject(ClipboardService).clipboardChanged.subscribe(data => this.client().setClipboard(data)),
            inject(ClipboardService).syncInProgress.subscribe(status => this.clipboardSyncInProgress = status)

        ];

        destroyRef.onDestroy(() => subscriptions.forEach(subscription => subscription.unsubscribe()));

        this.initWatchers();

    }

    private viewReady = false;

    ngAfterViewInit(): void {

        const displayContainer = this.displayContainer().nativeElement;

        this.mouse = new Guacamole.Mouse(displayContainer);
        this.touchScreen = new Guacamole.Mouse.Touchscreen(displayContainer);
        this.touchPad = new Guacamole.Mouse.Touchpad(displayContainer);
        this.touch = new Guacamole.Touch(displayContainer);

        // Ensure focus is regained via mousedown before forwarding event
        this.mouse.on('mousedown', () => document.body.focus());

        this.mouse.onEach(['mousedown', 'mousemove', 'mouseup'], this.handleMouseEvent as unknown as Guacamole.Event.TargetListener);

        // Hide software cursor when mouse leaves display
        this.mouse.on('mouseout', () => this.display?.showCursor(false));

        // Begin watching client state now that the display container exists
        this.viewReady = true;
        this.digest.apply(() => this.watchers.check());

    }

    ngDoCheck(): void {
        if (this.viewReady)
            this.watchers.check();
    }

    private initWatchers(): void {

        // Attach any given managed client
        this.watchers.watch(() => this.client(), managedClient => {

            const displayContainer = this.displayContainer().nativeElement;
            displayContainer.innerHTML = '';

            this.guacClient = managedClient.client;
            this.display = this.guacClient.getDisplay();
            this.display.scale(managedClient.clientProperties.scale);

            const displayElement = this.display.getElement();
            displayContainer.appendChild(displayElement);

            // Do nothing when the display element is clicked on
            displayElement.onclick = (e: MouseEvent) => {
                e.preventDefault();
                return false;
            };

            this.mainElementResized();

        });

        // Update actual view scrollLeft/scrollTop when scroll properties change
        this.watchers.watch(() => this.properties.scrollLeft, scrollLeft => {
            this.main.scrollLeft = scrollLeft;
            this.properties.scrollLeft = this.main.scrollLeft;
        });

        this.watchers.watch(() => this.properties.scrollTop, scrollTop => {
            this.main.scrollTop = scrollTop;
            this.properties.scrollTop = this.main.scrollTop;
        });

        // Update scale when display is resized
        this.watchers.watch(() => this.client().managedDisplay.size,
            () => queueMicrotask(() => this.digest.apply(() => this.updateDisplayScale())));

        // Keep local cursor up-to-date
        this.watchers.watch(() => this.client().managedDisplay.cursor, cursor => {
            if (cursor)
                this.localCursor = this.mouse.setCursor(cursor.canvas, cursor.x, cursor.y);
        });

        // Update touch event handling depending on remote multi-touch
        // support and mouse emulation mode
        this.watchers.watch(() => String(this.client().multiTouchSupport) + this.emulateAbsoluteMouse(), () => {

            this.touch.offEach(['touchstart', 'touchmove', 'touchend'], this.handleTouchEvent as unknown as Guacamole.Event.TargetListener);
            this.touchScreen.offEach(['mousedown', 'mousemove', 'mouseup'], this.handleEmulatedMouseEvent as unknown as Guacamole.Event.TargetListener);
            this.touchPad.offEach(['mousedown', 'mousemove', 'mouseup'], this.handleEmulatedMouseEvent as unknown as Guacamole.Event.TargetListener);

            // Directly forward local touch events
            if (this.client().multiTouchSupport)
                this.touch.onEach(['touchstart', 'touchmove', 'touchend'], this.handleTouchEvent as unknown as Guacamole.Event.TargetListener);

            // Switch to touchscreen if mouse emulation is required and
            // absolute mouse emulation is preferred
            else if (this.emulateAbsoluteMouse())
                this.touchScreen.onEach(['mousedown', 'mousemove', 'mouseup'], this.handleEmulatedMouseEvent as unknown as Guacamole.Event.TargetListener);

            // Use touchpad for mouse emulation if absolute mouse emulation
            // is not preferred
            else
                this.touchPad.onEach(['mousedown', 'mousemove', 'mouseup'], this.handleEmulatedMouseEvent as unknown as Guacamole.Event.TargetListener);

        });

        // Adjust scale if modified externally
        this.watchers.watch(() => this.properties.scale, scale => {

            scale = Math.max(scale, this.properties.minScale);
            scale = Math.min(scale, this.properties.maxScale);

            // Only scale if display is attached
            this.main.style.overflow = (scale === this.properties.minScale) ? 'hidden' : 'auto';
            this.display?.scale(scale);

            // Always update scale to match actual, clamped value
            if (scale !== this.properties.scale)
                this.properties.scale = scale;

        });

        // If autofit is set, the scale should be set to the minimum scale,
        // filling the screen
        this.watchers.watch(() => this.properties.autoFit, autoFit => {
            if (autoFit)
                this.properties.scale = this.properties.minScale;
        });

    }

    /**
     * Updates the scale of the attached display to fit the browser window if
     * necessary, or to at least the minimum scale.
     */
    private updateDisplayScale(): void {

        if (!this.display)
            return;

        // Calculate scale to fit screen
        const properties = this.properties;
        properties.minScale = Math.min(
            this.main.offsetWidth / Math.max(this.display.getWidth(), 1),
            this.main.offsetHeight / Math.max(this.display.getHeight(), 1)
        );

        // Calculate appropriate maximum zoom level
        properties.maxScale = Math.max(properties.minScale, 3);

        // Clamp zoom level, maintain auto-fit
        if (this.display.getScale() < properties.minScale || properties.autoFit)
            properties.scale = properties.minScale;
        else if (this.display.getScale() > properties.maxScale)
            properties.scale = properties.maxScale;

    }

    /**
     * Scrolls the client view such that the mouse cursor is visible.
     */
    private scrollToMouse(mouseState: Guacamole.Mouse.State): void {

        const displayContainer = this.displayContainer().nativeElement;

        // Determine mouse position within view
        const mouseViewX = mouseState.x + displayContainer.offsetLeft - this.main.scrollLeft;
        const mouseViewY = mouseState.y + displayContainer.offsetTop - this.main.scrollTop;

        const viewWidth = this.main.offsetWidth;
        const viewHeight = this.main.offsetHeight;

        const scrollX = mouseViewX > viewWidth ? mouseViewX - viewWidth : (mouseViewX < 0 ? mouseViewX : 0);
        const scrollY = mouseViewY > viewHeight ? mouseViewY - viewHeight : (mouseViewY < 0 ? mouseViewY : 0);

        this.main.scrollLeft += scrollX;
        this.main.scrollTop += scrollY;

    }

    /**
     * Resolves once no clipboard synchronization is in progress, such that
     * mouse events (which may trigger a paste) are only sent after the
     * remote clipboard has been updated.
     */
    private waitForClipboardSync(): Promise<void> {
        return new Promise(resolve => {
            const check = () => this.clipboardSyncInProgress ? setTimeout(check, 10) : resolve();
            check();
        });
    }

    private readonly handleMouseEvent = (event: Guacamole.Mouse.Event) => {

        if (!this.guacClient || !this.display)
            return;

        if (event.type === 'mousedown')
            this.keyboardEvents.updateModifiers(event as unknown as Event);

        event.stopPropagation();
        event.preventDefault();

        this.waitForClipboardSync().then(() => {
            this.display!.showCursor(!this.localCursor);
            this.guacClient!.sendMouseState(event.state, true);
            if (event.type === 'mouseup')
                this.keyboardEvents.updateModifiers(event as unknown as Event);
        });

    };

    private readonly handleEmulatedMouseEvent = (event: Guacamole.Mouse.Event) => {

        if (!this.guacClient || !this.display)
            return;

        if (event.type === 'mousedown')
            this.keyboardEvents.updateModifiers(event as unknown as Event);

        event.stopPropagation();
        event.preventDefault();

        // Ensure software cursor is shown
        this.display.showCursor(true);

        // Ensure mouse is visible by scrolling as needed
        this.scrollToMouse(event.state);

        this.guacClient.sendMouseState(event.state, true);

    };

    private readonly handleTouchEvent = (event: Guacamole.Touch.Event) => {

        if (!this.guacClient || !this.display)
            return;

        event.preventDefault();

        // Do not attempt to render the local cursor for touch events
        this.display.showCursor(false);

        this.guacClient.sendTouchState(event.state, true);

        if (event.type === 'touchstart' || event.type === 'touchend')
            this.keyboardEvents.updateModifiers(event as unknown as Event);

    };

    /**
     * Sends the current size of the main element (the display container) to
     * the client, connecting if not yet connected.
     */
    mainElementResized(): void {

        if (this.guacClient && this.display && this.main.offsetWidth && this.main.offsetHeight) {

            // Connect, if not already connected
            this.managedClientService.connect(this.client(), this.main.offsetWidth, this.main.offsetHeight);

            const pixelDensity = window.devicePixelRatio || 1;
            const width = this.main.offsetWidth * pixelDensity;
            const height = this.main.offsetHeight * pixelDensity;

            if (this.display.getWidth() !== width || this.display.getHeight() !== height)
                this.guacClient.sendSize(width, height);

        }

        queueMicrotask(() => this.digest.apply(() => this.updateDisplayScale()));

    }

    /**
     * Scrolls the display when touch-dragged while emulating an absolute
     * pointing device.
     */
    private readonly clientDrag = (inProgress: boolean, startX: number, startY: number,
            currentX: number, currentY: number, deltaX: number, deltaY: number) => {

        if (this.emulateAbsoluteMouse()) {
            this.properties.scrollLeft -= deltaX;
            this.properties.scrollTop -= deltaY;
        }

        return false;

    };

    /**
     * Zooms the display when pinched, unless pinch gestures are handled by
     * the remote desktop.
     */
    private readonly clientPinch = (inProgress: boolean, startLength: number, currentLength: number,
            centerX: number, centerY: number) => {

        // Do not handle pinch gestures if they would conflict with remote
        // handling of similar gestures
        if (this.client().multiTouchSupport > 1)
            return false;

        // Do not handle pinch gestures while relative mouse is in use
        if (!this.emulateAbsoluteMouse())
            return false;

        if (!inProgress) {
            this.initialScale = null;
            return false;
        }

        const properties = this.properties;

        // Set initial scale if gesture has just started
        if (!this.initialScale) {
            this.initialScale = properties.scale;
            this.initialCenterX = (centerX + properties.scrollLeft) / this.initialScale;
            this.initialCenterY = (centerY + properties.scrollTop) / this.initialScale;
        }

        let currentScale = this.initialScale * currentLength / startLength;
        currentScale = Math.max(currentScale, properties.minScale);
        currentScale = Math.min(currentScale, properties.maxScale);

        // Update scale based on pinch distance, keeping the pinch center
        // fixed
        properties.autoFit = false;
        properties.scale = currentScale;
        properties.scrollLeft = this.initialCenterX * currentScale - centerX;
        properties.scrollTop = this.initialCenterY * currentScale - centerY;

        return false;

    };

    dragStart(e: DragEvent): void {
        e.preventDefault();
        e.stopPropagation();
        this.dropPending.set(true);
    }

    dragEnd(e: DragEvent): void {
        e.preventDefault();
        e.stopPropagation();
        this.dropPending.set(false);
    }

    /**
     * Uploads all files dropped onto the client.
     */
    drop(e: DragEvent): void {
        this.dragEnd(e);
        for (const file of Array.from(e.dataTransfer?.files ?? []))
            this.managedClientService.uploadFile(this.client(), file);
    }

}
