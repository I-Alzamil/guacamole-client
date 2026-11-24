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
import { FocusDirective } from '../element/focus.directive';
import { TranslatePipe } from '../locale/translate.pipe';
import { FieldComponent } from './field-component';


/**
 * Field which accepts arbitrary text, optionally suggesting the field's
 * options via a datalist.
 */
@Component({
    selector: 'guac-text-field',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, FocusDirective, TranslatePipe],
    host: { class: 'text-field' },
    template: `
        <input type="text" [id]="fieldId()" [attr.name]="field().name"
               [attr.list]="dataListId" [(ngModel)]="model" [disabled]="disabled()"
               [guacFocus]="focused()" autocorrect="off" autocapitalize="off">
        @if (dataListId) {
            <datalist [id]="dataListId">
                @for (option of sortedOptions; track option) {
                    <option [value]="option">{{ getFieldOption(option) | translate }}</option>
                }
            </datalist>
        }
    `
})
export class TextFieldComponent extends FieldComponent {

    get dataListId(): string | null {
        return this.field().options?.length ? this.fieldId() + '-datalist' : null;
    }

    get sortedOptions(): string[] {
        return [...(this.field().options || [])].sort();
    }

}

/**
 * Field which accepts a username.
 */
@Component({
    selector: 'guac-username-field',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, FocusDirective],
    host: { class: 'username-field' },
    template: `
        <input type="text" [id]="fieldId()" [attr.name]="field().name"
               [(ngModel)]="model" [disabled]="disabled()" [guacFocus]="focused()"
               autocomplete="username" autocorrect="off" autocapitalize="off">
    `
})
export class UsernameFieldComponent extends FieldComponent {}

/**
 * Field which accepts an email address.
 */
@Component({
    selector: 'guac-email-field',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, FocusDirective],
    host: { class: 'email-field' },
    template: `
        <input type="email" [id]="fieldId()" [attr.name]="field().name"
               [(ngModel)]="model" [disabled]="disabled()" [guacFocus]="focused()"
               autocorrect="off" autocapitalize="off">
    `
})
export class EmailFieldComponent extends FieldComponent {}

/**
 * Field which accepts a password, with the option to reveal the password.
 */
@Component({
    selector: 'guac-password-field',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, FocusDirective, TranslatePipe],
    host: { class: 'password-field' },
    template: `
        <input [type]="revealed() ? 'text' : 'password'" [id]="fieldId()"
               [attr.name]="field().name" [(ngModel)]="model" [disabled]="disabled()"
               [guacFocus]="focused()" autocorrect="off" autocapitalize="off">
        <div class="icon toggle-password" (click)="revealed.set(!revealed())"
             [title]="(revealed() ? 'FORM.HELP_HIDE_PASSWORD' : 'FORM.HELP_SHOW_PASSWORD') | translate"></div>
    `
})
export class PasswordFieldComponent extends FieldComponent {
    readonly revealed = signal(false);
}

/**
 * Field which accepts a number. The model value is the string form of the
 * number.
 */
@Component({
    selector: 'guac-number-field',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, FocusDirective],
    host: { class: 'number-field' },
    template: `
        <input type="number" [id]="fieldId()" [attr.name]="field().name"
               [ngModel]="model ? +model : null" (ngModelChange)="update($event)"
               [disabled]="disabled()" [guacFocus]="focused()"
               autocorrect="off" autocapitalize="off">
    `
})
export class NumberFieldComponent extends FieldComponent {
    update(value: number | null): void {
        this.model = (value || value === 0) ? value.toString() : '';
    }
}

/**
 * Field which is either checked or unchecked. When checked, the model value
 * is the first option of the field. When unchecked, the model value is empty.
 */
@Component({
    selector: 'guac-checkbox-field',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, FocusDirective],
    host: { class: 'checkbox-field' },
    template: `
        <input type="checkbox" [id]="fieldId()" [attr.name]="field().name"
               [ngModel]="model === field().options?.[0]"
               (ngModelChange)="model = $event ? field().options![0] : ''"
               [disabled]="disabled()" [guacFocus]="focused()"
               autocorrect="off" autocapitalize="off">
    `
})
export class CheckboxFieldComponent extends FieldComponent {}

/**
 * Field whose value is one of a set of predefined options.
 */
@Component({
    selector: 'guac-select-field',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, FocusDirective, TranslatePipe],
    host: { class: 'select-field' },
    template: `
        <select [id]="fieldId()" [attr.name]="field().name" [(ngModel)]="model"
                [disabled]="disabled()" [guacFocus]="focused()">
            @for (option of field().options; track option) {
                <option [ngValue]="option">{{ getFieldOption(option) | translate }}</option>
            }
        </select>
    `
})
export class SelectFieldComponent extends FieldComponent implements OnInit {
    ngOnInit(): void {
        if (!this.model && this.model !== '')
            this.model = '';
    }
}

/**
 * Field which accepts multiple lines of text.
 */
@Component({
    selector: 'guac-text-area-field',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, FocusDirective],
    host: { class: 'text-area-field' },
    template: `
        <textarea [id]="fieldId()" [attr.name]="field().name" [(ngModel)]="model"
                  [disabled]="disabled()" [guacFocus]="focused()"
                  autocorrect="off" autocapitalize="off"></textarea>
    `
})
export class TextAreaFieldComponent extends FieldComponent {}

/**
 * Field which accepts a date in "YYYY-MM-DD" format. The model is updated
 * only once the date has been committed.
 */
@Component({
    selector: 'guac-date-field',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FocusDirective, TranslatePipe],
    host: { class: 'date-field' },
    template: `
        <input type="date" [id]="fieldId()" [attr.name]="field().name"
               [value]="model || ''" (change)="model = $any($event.target).value"
               [disabled]="disabled()" [guacFocus]="focused()"
               [placeholder]="'FORM.FIELD_PLACEHOLDER_DATE' | translate"
               autocorrect="off" autocapitalize="off">
    `
})
export class DateFieldComponent extends FieldComponent {}

/**
 * Field which accepts a time in "HH:MM:SS" format. The model is updated only
 * once the time has been committed.
 */
@Component({
    selector: 'guac-time-field',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FocusDirective, TranslatePipe],
    host: { class: 'time-field' },
    template: `
        <input type="time" step="1" [id]="fieldId()" [attr.name]="field().name"
               [value]="model || ''" (change)="update($any($event.target).value)"
               [disabled]="disabled()" [guacFocus]="focused()"
               [placeholder]="'FORM.FIELD_PLACEHOLDER_TIME' | translate"
               autocorrect="off" autocapitalize="off">
    `
})
export class TimeFieldComponent extends FieldComponent {
    update(value: string): void {
        // Browsers omit seconds when zero
        this.model = /^\d{2}:\d{2}$/.test(value) ? value + ':00' : value;
    }
}

/**
 * Field which immediately redirects the user to another URL, displaying a
 * message while the redirect is in progress.
 */
@Component({
    selector: 'guac-redirect-field',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [TranslatePipe],
    host: { class: 'redirect-field-container' },
    template: `
        <div class="redirect-field">
            @if (field().translatableMessage) {
                <p>{{ field().translatableMessage | translate }}</p>
            }
        </div>
    `
})
export class RedirectFieldComponent extends FieldComponent implements OnInit {
    ngOnInit(): void {
        if (this.field().redirectUrl)
            window.location.href = this.field().redirectUrl!;
    }
}
