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

import { ChangeDetectionStrategy, Component, Directive, computed, effect, inject, input, linkedSignal, model, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ANONYMOUS_USERNAME } from '../auth/authentication.service';
import { TranslationService } from '../locale/translation.service';
import { FilterPattern } from './filter-pattern';
import { SortOrder } from './sort-order';

/**
 * A text field which filters the given items, exposing the matching items
 * via the two-way bound filteredItems property.
 */
@Component({
    selector: 'guac-filter',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule],
    host: { class: 'filter' },
    template: `
        <input class="search-string" type="text" [placeholder]="placeholder() ?? ''"
               [ngModel]="searchString()" (ngModelChange)="searchString.set($event)">
    `
})
export class FilterComponent<T> {

    readonly placeholder = input<string | null>();

    /** All items to be filtered. */
    readonly items = input<T[] | null | undefined>();

    /** The property paths which should be searched. */
    readonly properties = input.required<string[]>();

    /** The items matching the current search string. */
    readonly filteredItems = model<T[]>([]);

    readonly searchString = signal('');

    private readonly filterPattern = computed(() => new FilterPattern(this.properties()));

    constructor() {
        effect(() => {
            const pattern = this.filterPattern();
            pattern.compile(this.searchString());
            this.filteredItems.set((this.items() || []).filter(pattern.predicate));
        });
    }

}

const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_PAGE_COUNT = 11;

/**
 * Splits the given items into pages, exposing the current page via the
 * two-way bound page property, and displays controls for navigating between
 * pages.
 */
@Component({
    selector: 'guac-pager',
    changeDetection: ChangeDetectionStrategy.Eager,
    host: { 'class': 'pager', '[hidden]': 'pageNumbers().length <= 1' },
    template: `
        <div class="first-page icon" [class.disabled]="!canSelectPage(1)" (click)="selectPage(1)"></div>
        <div class="prev-page icon" [class.disabled]="!canSelectPage(currentPage() - 1)" (click)="selectPage(currentPage() - 1)"></div>

        @if (pageNumbers()[0] !== 1) {
            <div class="more-pages">...</div>
        }

        <ul class="page-numbers">
            @for (pageNumber of pageNumbers(); track pageNumber) {
                <li class="set-page" [class.current]="pageNumber === currentPage()"
                    (click)="selectPage(pageNumber)">{{ pageNumber }}</li>
            }
        </ul>

        @if (pageNumbers()[pageNumbers().length - 1] !== lastPage()) {
            <div class="more-pages">...</div>
        }

        <div class="next-page icon" [class.disabled]="!canSelectPage(currentPage() + 1)" (click)="selectPage(currentPage() + 1)"></div>
        <div class="last-page icon" [class.disabled]="!canSelectPage(lastPage())" (click)="selectPage(lastPage())"></div>
    `
})
export class PagerComponent<T> {

    readonly items = input<T[] | null | undefined>();

    readonly pageSize = input<number | null | undefined>();

    /** The maximum number of page numbers to display. */
    readonly pageCount = input<number | null | undefined>();

    /** The items within the current page. */
    readonly page = model<T[]>([]);

    private readonly pages = computed(() => {
        const items = this.items() || [];
        const pageSize = this.pageSize() || DEFAULT_PAGE_SIZE;
        const pages: T[][] = [];
        for (let i = 0; i < items.length; i += pageSize)
            pages.push(items.slice(i, i + pageSize));
        return pages;
    });

    readonly lastPage = computed(() => this.pages().length);

    /**
     * The current page number, clamped to the available pages whenever the
     * items change.
     */
    readonly currentPage = linkedSignal<T[][], number>({
        source: this.pages,
        computation: (pages, previous) => Math.min(pages.length, Math.max(1, previous?.value ?? 1))
    });

    readonly pageNumbers = computed(() => {

        const pageCount = this.pageCount() || DEFAULT_PAGE_COUNT;
        const lastPage = this.lastPage();

        let windowStart = this.currentPage() - (pageCount - 1) / 2;
        let windowEnd = windowStart + pageCount - 1;

        // Shift window as necessary to stay within the available pages
        if (windowStart < 1) {
            windowEnd = Math.min(lastPage, windowEnd - windowStart + 1);
            windowStart = 1;
        }
        else if (windowEnd > lastPage) {
            windowStart = Math.max(1, windowStart - windowEnd + lastPage);
            windowEnd = lastPage;
        }

        const numbers: number[] = [];
        for (let pageNumber = windowStart; pageNumber <= windowEnd; pageNumber++)
            numbers.push(pageNumber);
        return numbers;

    });

    constructor() {
        effect(() => {
            const page = this.pages()[this.currentPage() - 1] || [];
            untracked(() => this.page.set(page));
        });
    }

    canSelectPage(page: number): boolean {
        return page !== this.currentPage() && page >= 1 && page <= this.lastPage();
    }

    selectPage(page: number): void {
        if (this.canSelectPage(page))
            this.currentPage.set(page);
    }

}

/**
 * Makes the host element (typically a table header) control the given sort
 * order: clicking the element makes the given property the primary sort
 * property, toggling direction if already primary.
 *
 *     <th [guacSortOrder]="order" guacSortProperty="name">
 */
@Directive({
    selector: '[guacSortOrder]',
    host: {
        'class': 'sortable',
        '[class.sort-primary]': 'guacSortOrder().primary === guacSortProperty()',
        '[class.sort-descending]': 'guacSortOrder().descending',
        '(click)': 'guacSortOrder().togglePrimary(guacSortProperty())'
    }
})
export class SortOrderDirective {

    readonly guacSortOrder = input.required<SortOrder>();

    readonly guacSortProperty = input.required<string>();

}

/**
 * Displays a username, substituting a localized placeholder for the
 * anonymous user.
 */
@Component({
    selector: 'guac-user-item',
    changeDetection: ChangeDetectionStrategy.Eager,
    host: { 'class': 'user-item', '[class.anonymous]': 'isAnonymous()' },
    template: `<span class="username">{{ displayName() }}</span>`
})
export class UserItemComponent {

    private readonly translationService = inject(TranslationService);

    readonly username = input<string | null | undefined>();

    readonly isAnonymous = computed(() => this.username() === ANONYMOUS_USERNAME);

    readonly displayName = computed(() => this.isAnonymous()
        ? this.translationService.instant('LIST.TEXT_ANONYMOUS_USER')
        : this.username());

}
