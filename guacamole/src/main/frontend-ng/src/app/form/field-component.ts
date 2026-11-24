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

import { Directive, input } from '@angular/core';
import { canonicalize } from '../locale/translation.service';
import { Field } from '../rest/types/field';

/**
 * Base class for all components which render a specific type of field. The
 * value of the field is read from and written to the shared model object,
 * keyed by field name, just as the AngularJS forms did.
 *
 * Extensions may provide their own field components by extending this class
 * and registering them via the FIELD_TYPES token.
 */
@Directive()
export abstract class FieldComponent {

    /** The translation namespace of the form containing this field. */
    readonly namespace = input<string | undefined>();

    /** The field being rendered. */
    readonly field = input.required<Field>();

    /** The object containing the values of all fields within the form. */
    readonly values = input.required<Record<string, string>>();

    /** The unique ID to assign to the field's primary input element. */
    readonly fieldId = input.required<string>();

    /** Whether the field should be disabled. */
    readonly disabled = input<boolean>(false);

    /** Whether the field should receive focus. */
    readonly focused = input<boolean>(false);

    /**
     * The current value of this field.
     */
    get model(): string {
        return this.values()[this.field().name];
    }

    set model(value: string) {
        this.values()[this.field().name] = value;
    }

    /**
     * Returns the translation key of the label of the given option.
     */
    getFieldOption(value: string | null | undefined): string {
        return canonicalize(this.namespace() || 'MISSING_NAMESPACE')
            + '.FIELD_OPTION_' + canonicalize(this.field().name)
            + '_' + canonicalize(value || 'EMPTY');
    }

}
