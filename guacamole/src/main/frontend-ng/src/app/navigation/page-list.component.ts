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

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { TranslatePipe } from '../locale/translate.pipe';
import { PageDefinition } from './page-definition';

/**
 * A hierarchical list of pages. Each level of the hierarchy is displayed
 * only if it contains at least two pages.
 */
@Component({
    selector: 'guac-page-list',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [TranslatePipe],
    host: { 'class': 'page-list', '[hidden]': '!levels().length' },
    template: `
        @for (level of levels(); track $index) {
            <ul class="page-list-level">
                @for (page of level; track page.name) {
                    <li [class]="page.className ?? ''">
                        <a class="home" [class.current]="isCurrentPage(page)" [href]="'#' + page.url"
                           (click)="navigateToPage($event, page)">{{ $any(page.name) | translate }}</a>
                    </li>
                }
            </ul>
        }
    `
})
export class PageListComponent {

    private readonly router = inject(Router);

    readonly pages = input<PageDefinition[] | null | undefined>();

    /**
     * The URL of the current page. Updated on each navigation, as the
     * component is reused when navigating between pages sharing a route
     * (such as the tabs of the settings page).
     */
    private readonly currentURL = toSignal(this.router.events.pipe(
        filter(event => event instanceof NavigationEnd),
        map(() => this.router.url)
    ), { initialValue: this.router.url });

    readonly levels = computed(() => {

        const pages = this.pages() || [];
        const getPageNames = (page: PageDefinition) => Array.isArray(page.name) ? page.name : [page.name];

        // Determine the name hierarchy of the current page
        let currentPageName: string[] = [];
        for (const page of pages) {
            if (this.isCurrentPage(page))
                currentPageName = getPageNames(page);
        }

        const levels: Record<string, PageDefinition>[] = [];

        pages.forEach((page, weight) => {
            const names = getPageNames(page);
            for (let i = 0; i < names.length; i++) {

                const level = levels[i] = levels[i] || {};
                const name = names[i];
                const isCurrentPage = (currentPageName[i] === name);

                // Add a new page entry for the current level, if needed
                level[name] ??= {
                    name,
                    url: isCurrentPage ? this.currentURL() : page.url,
                    className: page.className,
                    weight: page.weight || (weight + i)
                };

                // Only descend deeper into the hierarchy if the current page
                // is a descendant
                if (!isCurrentPage)
                    break;

            }
        });

        // Remove levels which contain fewer than two pages
        return levels
            .map(level => Object.values(level).sort((a, b) => a.weight! - b.weight!))
            .filter(level => level.length >= 2);

    });

    isCurrentPage(page: PageDefinition): boolean {
        return this.currentURL() === page.url;
    }

    navigateToPage(event: Event, page: PageDefinition): void {
        event.preventDefault();
        this.router.navigateByUrl(page.url);
    }

}
