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

import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FocusDirective } from '../element/focus.directive';
import { LanguageService } from '../rest/language.service';
import { RequestService } from '../rest/request.service';
import { FieldComponent } from './field-component';

/**
 * Field whose value is one of the languages supported by the server.
 */
@Component({
    selector: 'guac-language-field',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, FocusDirective],
    host: { class: 'language-field' },
    template: `
        <select [id]="fieldId()" [attr.name]="field().name" [(ngModel)]="model"
                [guacFocus]="focused()">
            @for (language of languages(); track language.key) {
                <option [value]="language.key" [attr.lang]="language.tag">{{ language.name }}</option>
            }
        </select>
    `
})
export class LanguageFieldComponent extends FieldComponent implements OnInit {

    private readonly languageService = inject(LanguageService);
    private readonly requestService = inject(RequestService);

    readonly languages = signal<{ key: string, name: string, tag: string }[]>([]);

    ngOnInit(): void {

        if (!this.model && this.model !== '')
            this.model = '';

        this.languageService.getLanguages().then(languages => {

            // Use the language without its country code if the specific
            // variant is unavailable (as is done when loading translations)
            const model = this.model;
            if (model && !(model in languages) && model.split('_')[0] in languages)
                this.model = model.split('_')[0];

            this.languages.set(Object.entries(languages)
                .map(([key, name]) => ({ key, name, tag: key.replace(/_/g, '-') }))
                .sort((a, b) => a.key.localeCompare(b.key)));
        }, this.requestService.DIE);

    }

}
