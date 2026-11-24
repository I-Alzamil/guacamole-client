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

import { DOCUMENT, DestroyRef, Directive, ElementRef, inject, input, output } from '@angular/core';
import { DigestService } from '../index/digest.service';
import { KeyboardEventsService } from '../index/keyboard-events.service';
import { NotificationService } from '../notification/notification.service';

/**
 * Emits whenever the size of the host element changes.
 */
@Directive({ selector: '[guacResize]' })
export class ResizeDirective {

    readonly guacResize = output<{ width: number, height: number }>();

    constructor() {

        const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
        const digest = inject(DigestService);

        let lastWidth = -1;
        let lastHeight = -1;

        const observer = new ResizeObserver(() => {
            if (element.offsetWidth !== lastWidth || element.offsetHeight !== lastHeight) {
                lastWidth = element.offsetWidth;
                lastHeight = element.offsetHeight;
                digest.apply(() => this.guacResize.emit({ width: lastWidth, height: lastHeight }));
            }
        });

        observer.observe(element);
        inject(DestroyRef).onDestroy(() => observer.disconnect());

    }

}

/**
 * Emits upon click or touch, indicating whether shift and/or ctrl (or meta)
 * were held at the time according to the global Guacamole keyboard, which
 * may receive key events that the browser does not associate with the
 * click.
 */
@Directive({
    selector: '[guacClick]',
    host: { '(click)': 'clicked($event)', '(touchstart)': 'clicked($event)' }
})
export class ClickDirective {

    readonly guacClick = output<{ shift: boolean, ctrl: boolean }>();

    private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    private readonly keyboardEvents = inject(KeyboardEventsService);

    clicked(event: Event): void {

        if (!this.element.contains(event.target as Node))
            return;

        const pressed = (this.keyboardEvents.keyboard?.pressed ?? {}) as Record<number, boolean>;

        this.guacClick.emit({
            shift: !!(pressed[0xFFE1] || pressed[0xFFE2]),
            ctrl: !!(pressed[0xFFE3] || pressed[0xFFE4] || pressed[0xFFE7] || pressed[0xFFE8])
        });

    }

}

/**
 * Emits all files dropped onto the host element. While files are being
 * dragged over the element, the CSS classes given by guacDraggedClass are
 * applied.
 */
@Directive({
    selector: '[guacDrop]',
    host: {
        '(dragenter)': 'dragStart($event)',
        '(dragover)': 'dragStart($event)',
        '(dragleave)': 'dragEnd($event)',
        '(drop)': 'drop($event)'
    }
})
export class DropDirective {

    readonly guacDrop = output<FileList>();

    /** Space-separated CSS classes applied while files are dragged over. */
    readonly guacDraggedClass = input<string>();

    /** Whether multiple files may be dropped at once. */
    readonly guacMultiple = input<boolean>(true);

    private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    private readonly notificationService = inject(NotificationService);

    private setDraggedClass(applied: boolean): void {
        for (const className of (this.guacDraggedClass() || '').split(' ').filter(c => c))
            this.element.classList.toggle(className, applied);
    }

    dragStart(e: DragEvent): void {
        e.preventDefault();
        e.stopPropagation();
        this.setDraggedClass(true);
    }

    dragEnd(e: DragEvent): void {
        e.preventDefault();
        e.stopPropagation();
        this.setDraggedClass(false);
    }

    drop(e: DragEvent): void {

        this.dragEnd(e);

        const files = e.dataTransfer?.files;
        if (!files || files.length < 1)
            return;

        if (!this.guacMultiple() && files.length >= 2) {
            this.notificationService.showStatus({
                className: 'error',
                title: 'APP.DIALOG_HEADER_ERROR',
                text: { key: 'APP.ERROR_SINGLE_FILE_ONLY' },
                actions: [this.notificationService.ACKNOWLEDGE_ACTION]
            });
            return;
        }

        this.guacDrop.emit(files);

    }

}

/**
 * Opens a file selection dialog when the host element is clicked, emitting
 * the selected files.
 */
@Directive({
    selector: '[guacUpload]',
    host: { '(click)': 'input.click()' }
})
export class UploadDirective {

    readonly guacUpload = output<FileList>();

    readonly guacMultiple = input<boolean>(true);

    protected readonly input: HTMLInputElement;

    constructor() {

        const document = inject(DOCUMENT);
        const form = document.createElement('form');
        this.input = document.createElement('input');
        this.input.type = 'file';
        form.appendChild(this.input);

        this.input.addEventListener('change', () => {
            if (this.input.files?.length)
                this.guacUpload.emit(this.input.files);
            form.reset();
        });

    }

    ngOnChanges(): void {
        this.input.multiple = this.guacMultiple();
    }

}

/**
 * Callback invoked as a single-finger drag gesture progresses. Returning
 * false prevents the default behavior of the touch event.
 */
export type TouchDragHandler = (inProgress: boolean, startX: number, startY: number,
    currentX: number, currentY: number, deltaX: number, deltaY: number) => boolean | void;

/**
 * Invokes the handler returned by the given function as single-finger drag
 * gestures are performed on the given element.
 */
export function listenTouchDrag(element: HTMLElement, getHandler: () => TouchDragHandler | null | undefined,
        digest: DigestService): void {

    let inProgress = false;
    let startX: number | null = null;
    let startY: number | null = null;
    let currentX = 0;
    let currentY = 0;
    let deltaX = 0;
    let deltaY = 0;

    const notify = (e: TouchEvent) => {
        const handler = getHandler();
        if (inProgress && handler) {
            digest.apply(() => {
                if (handler(true, startX!, startY!, currentX, currentY, deltaX, deltaY) === false)
                    e.preventDefault();
            });
        }
    };

    element.addEventListener('touchmove', (e) => {

        if (e.touches.length !== 1)
            return;

        const x = e.touches[0].clientX;
        const y = e.touches[0].clientY;

        // Init start location and deltas if gesture is starting
        if (!startX || !startY) {
            startX = currentX = x;
            startY = currentY = y;
            deltaX = deltaY = 0;
            inProgress = true;
        }

        // Update deltas if gesture is in progress
        else if (inProgress) {
            deltaX = x - currentX;
            deltaY = y - currentY;
            currentX = x;
            currentY = y;
        }

        notify(e);

    }, { passive: false });

    element.addEventListener('touchend', (e) => {
        if (startX && startY && e.touches.length === 0) {
            notify(e);
            startX = startY = null;
            deltaX = deltaY = 0;
            inProgress = false;
        }
    }, { passive: false });

}

/**
 * Invokes the given handler as single-finger drag gestures are performed on
 * the host element.
 */
@Directive({ selector: '[guacTouchDrag]' })
export class TouchDragDirective {

    readonly guacTouchDrag = input<TouchDragHandler | null>();

    constructor() {
        listenTouchDrag(inject<ElementRef<HTMLElement>>(ElementRef).nativeElement,
            () => this.guacTouchDrag(), inject(DigestService));
    }

}

/**
 * Callback invoked as a two-finger pinch gesture progresses. Returning false
 * prevents the default behavior of the touch event.
 */
export type TouchPinchHandler = (inProgress: boolean, startLength: number, currentLength: number,
    centerX: number, centerY: number) => boolean | void;

/**
 * Invokes the handler returned by the given function as two-finger pinch
 * gestures are performed on the given element.
 */
export function listenTouchPinch(element: HTMLElement, getHandler: () => TouchPinchHandler | null | undefined,
        digest: DigestService): void {

    let startLength: number | null = null;
    let currentLength = 0;
    let centerX = 0;
    let centerY = 0;

    const notify = (e: TouchEvent, inProgress: boolean) => {
        const handler = getHandler();
        if (handler) {
            digest.apply(() => {
                if (handler(inProgress, startLength!, currentLength, centerX, centerY) === false)
                    e.preventDefault();
            });
        }
    };

    element.addEventListener('touchmove', (e) => {

        if (e.touches.length !== 2)
            return;

        const [touchA, touchB] = [e.touches[0], e.touches[1]];
        currentLength = Math.hypot(touchA.clientX - touchB.clientX, touchA.clientY - touchB.clientY);
        centerX = (touchA.clientX + touchB.clientX) / 2;
        centerY = (touchA.clientY + touchB.clientY) / 2;

        if (!startLength)
            startLength = currentLength;

        notify(e, true);

    }, { passive: false });

    element.addEventListener('touchend', (e) => {
        if (startLength && e.touches.length < 2) {
            notify(e, false);
            startLength = null;
        }
    }, { passive: false });

}

/**
 * Invokes the given handler as two-finger pinch gestures are performed on
 * the host element.
 */
@Directive({ selector: '[guacTouchPinch]' })
export class TouchPinchDirective {

    readonly guacTouchPinch = input<TouchPinchHandler | null>();

    constructor() {
        listenTouchPinch(inject<ElementRef<HTMLElement>>(ElementRef).nativeElement,
            () => this.guacTouchPinch(), inject(DigestService));
    }

}
