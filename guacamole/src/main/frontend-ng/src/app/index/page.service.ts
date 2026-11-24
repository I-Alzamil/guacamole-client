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

import { DOCUMENT, Injectable, inject, signal } from '@angular/core';

const DEFAULT_SMALL_ICON_URL = 'images/logo-64.png';
const DEFAULT_LARGE_ICON_URL = 'images/logo-144.png';

/**
 * Service tracking page-level state: the document title, the CSS class of
 * the document body, and the page icons.
 */
@Injectable({ providedIn: 'root' })
export class PageService {

    private readonly document = inject(DOCUMENT);

    /**
     * The title of the current page. This is translated if it is a
     * translation key, and used verbatim otherwise.
     */
    readonly title = signal('');

    /** The CSS class applied to the document body. */
    readonly bodyClassName = signal('');

    private readonly smallIcons = Array.from(this.document.querySelectorAll<HTMLLinkElement>(
        'link[rel=icon][href="' + DEFAULT_SMALL_ICON_URL + '"]'));

    private readonly largeIcons = Array.from(this.document.querySelectorAll<HTMLLinkElement>(
        'link[rel=icon][href="' + DEFAULT_LARGE_ICON_URL + '"], link[rel=apple-touch-icon]'));

    /**
     * Generates an icon of the given size from the given canvas, scaling
     * the canvas to fit while maintaining aspect ratio.
     */
    private generateIcon(canvas: HTMLCanvasElement, width: number, height: number): string {

        const icon = this.document.createElement('canvas');
        icon.width = width;
        icon.height = height;

        const scale = Math.min(width / canvas.width, height / canvas.height);
        const scaledWidth = canvas.width * scale;
        const scaledHeight = canvas.height * scale;

        icon.getContext('2d')!.drawImage(canvas,
            (width - scaledWidth) / 2, (height - scaledHeight) / 2, scaledWidth, scaledHeight);

        return icon.toDataURL('image/png');

    }

    /**
     * Sets the page icons to scaled versions of the given canvas.
     */
    setIcons(canvas: HTMLCanvasElement | null | undefined): void {

        if (!canvas)
            return;

        const small = this.generateIcon(canvas, 64, 64);
        const large = this.generateIcon(canvas, 144, 144);

        this.smallIcons.forEach(link => link.href = small);
        this.largeIcons.forEach(link => link.href = large);

    }

    setDefaultIcons(): void {
        this.smallIcons.forEach(link => link.setAttribute('href', DEFAULT_SMALL_ICON_URL));
        this.largeIcons.forEach(link => link.setAttribute('href', DEFAULT_LARGE_ICON_URL));
    }

}
