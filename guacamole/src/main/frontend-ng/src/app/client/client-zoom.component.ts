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

import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, input } from '@angular/core';
import { TranslatePipe } from '../locale/translate.pipe';
import { ManagedClient } from './types';

/**
 * Controls for changing the zoom level of a client's display.
 */
@Component({
    selector: 'guac-client-zoom',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [TranslatePipe],
    host: { class: 'client-zoom' },
    template: `
        @let properties = client().clientProperties;
        <div class="client-zoom-editor">
            <div (click)="zoomOut()" class="client-zoom-out"><img src="images/settings/zoom-out.svg" alt="-"></div>
            <div class="client-zoom-state">
                <input type="number" [value]="toPercent(properties.scale)"
                       (change)="setZoom($any($event.target).value)">%
            </div>
            <div (click)="zoomIn()" class="client-zoom-in"><img src="images/settings/zoom-in.svg" alt="+"></div>
        </div>
        <div class="client-zoom-autofit">
            <label>
                <input type="checkbox" id="auto-fit" [checked]="properties.autoFit"
                       (change)="setAutoFit($any($event.target).checked)">
                {{ 'CLIENT.TEXT_ZOOM_AUTO_FIT' | translate }}
            </label>
        </div>
    `
})
export class ClientZoomComponent {

    readonly client = input.required<ManagedClient>();

    toPercent(scale: number): number {
        return Math.round(scale * 100);
    }

    zoomIn(): void {
        this.client().clientProperties.autoFit = false;
        this.client().clientProperties.scale += 0.1;
    }

    zoomOut(): void {
        this.client().clientProperties.autoFit = false;
        this.client().clientProperties.scale -= 0.1;
    }

    setZoom(percent: string): void {
        const value = Number(percent);
        if (!isNaN(value) && value > 0) {
            this.client().clientProperties.autoFit = false;
            this.client().clientProperties.scale = Math.round(value) / 100;
        }
    }

    setAutoFit(autoFit: boolean): void {
        this.client().clientProperties.autoFit = autoFit;
        if (!autoFit)
            this.client().clientProperties.scale = 1;
    }

}

/**
 * Container which always matches the visible area of the browser window,
 * scrolling the window as needed to ensure the container remains visible
 * (for example, when the on-screen keyboard of a mobile device is shown).
 */
@Component({
    selector: 'guac-viewport',
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `<div class="viewport"><ng-content /></div>`
})
export class ViewportComponent {

    constructor() {

        const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

        let lastViewportWidth: number | null = null;
        let lastViewportHeight: number | null = null;

        const fitVisibleArea = () => {

            const element = host.firstElementChild as HTMLElement | null;
            if (!element)
                return;

            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            if (viewportWidth !== lastViewportWidth) {
                element.style.width = viewportWidth + 'px';
                lastViewportWidth = viewportWidth;
            }

            if (viewportHeight !== lastViewportHeight) {
                element.style.height = viewportHeight + 'px';
                lastViewportHeight = viewportHeight;
            }

            // Scroll the window rather than the element if the element has
            // been scrolled
            if (element.scrollLeft || element.scrollTop)
                window.scrollTo(window.scrollX + element.scrollLeft, window.scrollY + element.scrollTop);

        };

        window.addEventListener('scroll', fitVisibleArea);
        const pollArea = setInterval(fitVisibleArea, 10);

        inject(DestroyRef).onDestroy(() => {
            window.removeEventListener('scroll', fitVisibleArea);
            clearInterval(pollArea);
        });

    }

}
