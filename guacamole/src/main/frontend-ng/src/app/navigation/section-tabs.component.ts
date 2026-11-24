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

import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { TranslatePipe } from '../locale/translate.pipe';
import { canonicalize } from '../locale/translation.service';

/**
 * A set of tabs, each representing a named section of the page.
 */
@Component({
    selector: 'guac-section-tabs',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [TranslatePipe],
    host: { 'class': 'section-tabs', '[hidden]': '!tabs()?.length' },
    template: `
        <ul>
            @for (name of tabs(); track name) {
                <li>
                    <a [class.current]="current() === name" (click)="current.set(name)">
                        {{ getSectionHeader(name) | translate }}
                    </a>
                </li>
            }
        </ul>
    `
})
export class SectionTabsComponent {

    /** The translation namespace of the section headers. */
    readonly namespace = input<string>();

    /** The name of the currently-selected tab. */
    readonly current = model<string | null>();

    /** The names of all tabs. */
    readonly tabs = input<string[] | null>();

    getSectionHeader(name: string): string {
        if (!name)
            return '';
        return canonicalize(this.namespace() || 'MISSING_NAMESPACE')
            + '.SECTION_HEADER_' + canonicalize(name);
    }

}
