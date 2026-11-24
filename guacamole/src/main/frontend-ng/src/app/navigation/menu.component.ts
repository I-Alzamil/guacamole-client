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

import { ChangeDetectionStrategy, Component, ElementRef, inject, input, signal } from '@angular/core';

/**
 * A dropdown menu. The menu is shown when its title is clicked and hidden
 * when anything outside the menu is clicked.
 */
@Component({
    selector: 'guac-menu',
    changeDetection: ChangeDetectionStrategy.Eager,
    host: {
        'class': 'menu-dropdown',
        '[class.open]': 'menuShown()',
        '(click)': 'menuShown.set(!menuShown())',
        '(document:click)': 'clickOutside($event)'
    },
    template: `
        <div class="menu-title">{{ menuTitle() }}</div>
        <div class="menu-indicator"></div>
        <div class="menu-contents" (click)="clickInside($event)"><ng-content /></div>
    `
})
export class MenuComponent {

    private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

    /** The title of the menu, displayed even while the menu is closed. */
    readonly menuTitle = input<string | null>();

    /**
     * Whether the menu contents are interactive, such that clicking within
     * the contents should not close the menu.
     */
    readonly interactive = input<boolean>(false);

    readonly menuShown = signal(false);

    clickOutside(event: Event): void {
        if (!this.element.contains(event.target as Node))
            this.menuShown.set(false);
    }

    clickInside(event: Event): void {
        if (this.interactive())
            event.stopPropagation();
    }

}
