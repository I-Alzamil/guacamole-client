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

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '../locale/translate.pipe';
import { canonicalize } from '../locale/translation.service';
import { Field, Form } from '../rest/types/field';
import { FormFieldComponent, getNameClass } from './form-field.component';

/**
 * Optional state of a connected client which may affect whether fields are
 * editable (fields corresponding to pending connection argument changes are
 * disabled).
 */
export interface FormClientState {
    arguments?: Record<string, { pending?: boolean }>;
}

/**
 * A set of forms (or a single form, or a flat list of fields), rendering each
 * field and binding its value to the given model object.
 */
@Component({
    selector: 'guac-form',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormFieldComponent, TranslatePipe],
    host: { class: 'form-group' },
    template: `
        @for (form of forms(); track $index) {
            <div class="form" [class]="getNameClass('form-', form)" [hidden]="!containsVisible(form.fields)">
                @if (form.name) {
                    <h3 class="form-header">{{ getSectionHeader(form) | translate }}</h3>
                }
                <div class="fields">
                    @for (field of form.fields; track field.name) {
                        @if (isVisible(field)) {
                            <guac-form-field [namespace]="namespace()" [field]="field"
                                             [values]="values()" [disabled]="isDisabled(field)"
                                             [focused]="field.name === focused()" />
                        }
                    }
                </div>
            </div>
        }
    `
})
export class FormComponent {

    /** The translation namespace of all forms and fields. */
    readonly namespace = input<string | undefined>();

    /** The form(s) or field(s) to display. */
    readonly content = input<Form | Form[] | Field[] | null | undefined>();

    /**
     * The object to which field values are bound, keyed by field name. This
     * object is modified in place as fields are edited.
     */
    readonly model = input<Record<string, string> | null | undefined>();

    /** Whether only fields already present within the model are shown. */
    readonly modelOnly = input<boolean>(false);

    readonly disabled = input<boolean>(false);

    /** The name of the field which should receive focus, if any. */
    readonly focused = input<string | null | undefined>();

    readonly client = input<FormClientState | null | undefined>();

    protected readonly getNameClass = getNameClass;

    private readonly emptyModel: Record<string, string> = {};

    readonly values = computed(() => this.model() || this.emptyModel);

    readonly forms = computed<Form[]>(() => {

        let content = this.content();
        if (!content)
            return [];

        if (!Array.isArray(content))
            content = [content];

        // Wrap a flat list of fields within an anonymous form
        if (content.length && !('fields' in content[0]))
            return [{ fields: content as Field[] }];

        return content as Form[];

    });

    getSectionHeader(form: Form): string {
        if (!form.name)
            return '';
        return canonicalize(this.namespace() || 'MISSING_NAMESPACE')
            + '.SECTION_HEADER_' + canonicalize(form.name);
    }

    isVisible(field: Field): boolean {
        return !this.modelOnly() || field.name in this.values();
    }

    isDisabled(field: Field): boolean {
        return this.disabled() || !!this.client()?.arguments?.[field.name]?.pending;
    }

    containsVisible(fields: Field[] | undefined): boolean {
        return !!fields?.some(field => this.isVisible(field));
    }

}
