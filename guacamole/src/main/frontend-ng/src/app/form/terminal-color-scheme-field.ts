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

import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../locale/translate.pipe';
import { ColorScheme } from './color-scheme';
import { FieldComponent } from './field-component';
import { InputColorComponent } from './input-color.component';

const CUSTOM_COLOR_SCHEME = 'custom';

/**
 * Field whose value is a terminal color scheme: either one of the field's
 * predefined options or a custom scheme defined color by color.
 */
@Component({
    selector: 'guac-terminal-color-scheme-field',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, InputColorComponent, TranslatePipe],
    host: {
        'class': 'terminal-color-scheme-field',
        '[class.custom-color-scheme-details-visible]': 'detailsShown()',
        '[class.custom-color-scheme-details-hidden]': '!detailsShown()'
    },
    template: `
        <select [id]="fieldId()" [attr.name]="field().name"
                [ngModel]="selected()" (ngModelChange)="select($event)">
            @for (option of sortedOptions; track option) {
                <option [ngValue]="option">{{ getFieldOption(option) | translate }}</option>
            }
            <option [ngValue]="CUSTOM">{{ 'COLOR_SCHEME.FIELD_OPTION_CUSTOM' | translate }}</option>
        </select>

        @if (isCustom()) {

            <div class="custom-color-scheme">
                <div class="custom-color-scheme-section default-color foreground">
                    <guac-input-color [model]="custom.foreground" (modelChange)="custom.foreground = $event; update()"
                                      [palette]="defaultPalette">
                        {{ 'COLOR_SCHEME.FIELD_HEADER_FOREGROUND' | translate }}
                    </guac-input-color>
                </div>
                <div class="custom-color-scheme-section default-color background">
                    <guac-input-color [model]="custom.background" (modelChange)="custom.background = $event; update()"
                                      [palette]="defaultPalette">
                        {{ 'COLOR_SCHEME.FIELD_HEADER_BACKGROUND' | translate }}
                    </guac-input-color>
                </div>
                <div class="custom-color-scheme-section palette low-intensity">
                    @for (index of lowIntensity; track index) {
                        <guac-input-color [model]="custom.colors[index]" (modelChange)="custom.colors[index] = $event; update()"
                                          [palette]="defaultPalette">{{ index }}</guac-input-color>
                    }
                </div>
                <div class="custom-color-scheme-section palette high-intensity">
                    @for (index of highIntensity; track index) {
                        <guac-input-color [model]="custom.colors[index]" (modelChange)="custom.colors[index] = $event; update()"
                                          [palette]="defaultPalette">{{ index }}</guac-input-color>
                    }
                </div>
            </div>

            <h4 class="custom-color-scheme-details-header">
                {{ 'COLOR_SCHEME.SECTION_HEADER_DETAILS' | translate }}
                <a class="custom-color-scheme-show-details" (click)="detailsShown.set(true)">{{ 'COLOR_SCHEME.ACTION_SHOW_DETAILS' | translate }}</a>
                <a class="custom-color-scheme-hide-details" (click)="detailsShown.set(false)">{{ 'COLOR_SCHEME.ACTION_HIDE_DETAILS' | translate }}</a>
            </h4>

            <textarea class="custom-color-scheme-details" spellcheck="false" dir="ltr"
                      [ngModel]="model" (ngModelChange)="setDetails($event)"></textarea>

        }
    `
})
export class TerminalColorSchemeFieldComponent extends FieldComponent implements OnInit {

    protected readonly CUSTOM = CUSTOM_COLOR_SCHEME;

    readonly lowIntensity = [0, 1, 2, 3, 4, 5, 6, 7];
    readonly highIntensity = [8, 9, 10, 11, 12, 13, 14, 15];
    readonly defaultPalette = ColorScheme.defaultPalette();

    readonly selected = signal('');
    readonly detailsShown = signal(false);

    custom = new ColorScheme();

    get sortedOptions(): string[] {
        return [...(this.field().options || [])].sort();
    }

    ngOnInit(): void {
        const model = this.model;
        if (model && !this.field().options?.includes(model)) {
            this.custom = ColorScheme.fromString(model);
            this.selected.set(CUSTOM_COLOR_SCHEME);
        }
        else
            this.selected.set(model || '');
    }

    isCustom(): boolean {
        return this.selected() === CUSTOM_COLOR_SCHEME;
    }

    select(value: string): void {
        this.selected.set(value);
        if (!value)
            this.model = '';
        else if (value === CUSTOM_COLOR_SCHEME)
            this.update();
        else
            this.model = value;
    }

    /**
     * Updates the model to reflect the custom color scheme.
     */
    update(): void {
        this.model = this.custom.toString();
    }

    /**
     * Updates the custom color scheme from its manually-edited string form.
     */
    setDetails(value: string): void {
        this.model = value;
        this.custom = ColorScheme.fromString(value);
    }

}
