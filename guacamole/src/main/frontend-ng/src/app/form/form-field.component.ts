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

import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '../locale/translate.pipe';
import { canonicalize } from '../locale/translation.service';
import { Field } from '../rest/types/field';
import { FIELD_TYPES } from './field-types';

/**
 * Returns a CSS class name derived from the given prefix and the name of the
 * given form or field, as used by the AngularJS application (and thus by any
 * extension CSS).
 */
export function getNameClass(prefix: string, content: { name?: string } | null | undefined): string {
    if (!content?.name)
        return '';
    return prefix + content.name.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
}

/**
 * Generates a random ID suitable for associating a label with a field.
 */
function generateFieldId(): string {
    return 'guac-field-XXXXXXXXXXXXXXXX'.replace(/X/g, () => Math.floor(Math.random() * 36).toString(36))
        + '-' + new Date().getTime().toString(36);
}

/**
 * A labeled field, rendered using the component registered for the field's
 * type. Fields of unknown type are not displayed.
 */
@Component({
    selector: 'guac-form-field',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [NgComponentOutlet, TranslatePipe],
    host: {
        'class': 'labeled-field',
        '[class]': 'nameClass()',
        '[class.empty]': '!values()[field().name]',
        '[hidden]': '!component()'
    },
    template: `
        <div class="field-header">
            <label [attr.for]="fieldId">{{ getFieldHeader() | translate }}</label>
        </div>
        <div class="form-field">
            @if (component(); as component) {
                <ng-container *ngComponentOutlet="component; inputs: {
                    namespace: namespace(),
                    field: field(),
                    values: values(),
                    fieldId: fieldId,
                    disabled: disabled(),
                    focused: focused()
                }" />
            }
        </div>
    `
})
export class FormFieldComponent {

    private readonly fieldTypes = inject(FIELD_TYPES);

    readonly namespace = input<string | undefined>();
    readonly field = input.required<Field>();
    readonly values = input.required<Record<string, string>>();
    readonly disabled = input<boolean>(false);
    readonly focused = input<boolean>(false);

    readonly fieldId = generateFieldId();

    readonly component = computed(() => {
        const component = this.fieldTypes[this.field().type];
        if (!component)
            console.warn('Failed to retrieve field with type "' + this.field().type + '"');
        return component ?? null;
    });

    readonly nameClass = computed(() => getNameClass('labeled-field-', this.field()));

    /**
     * Returns the translation key of the field's header, taking any
     * conditional label into account.
     */
    getFieldHeader(): string {

        const field = this.field();
        const ns = canonicalize(this.namespace() || 'MISSING_NAMESPACE');

        const conditionalLabel = field.conditionalLabel;
        if (conditionalLabel?.labelKey) {

            const depValue = this.values()[conditionalLabel.field] ?? '';

            let conditionMet = false;
            if ('equals' in conditionalLabel)
                conditionMet = depValue === conditionalLabel.equals;
            else if ('notEquals' in conditionalLabel)
                conditionMet = depValue !== conditionalLabel.notEquals;
            else
                console.warn('conditionalLabel for field "' + field.name
                    + '" specifies neither "equals" nor "notEquals"; ignoring.');

            if (conditionMet)
                return ns + '.' + conditionalLabel.labelKey;

        }

        return ns + '.FIELD_HEADER_' + canonicalize(field.name);

    }

}
