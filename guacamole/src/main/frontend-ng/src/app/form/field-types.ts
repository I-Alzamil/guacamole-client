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

import { InjectionToken, Type } from '@angular/core';
import { FieldType } from '../rest/types/field';
import {
    CheckboxFieldComponent, DateFieldComponent, EmailFieldComponent, NumberFieldComponent,
    PasswordFieldComponent, RedirectFieldComponent, SelectFieldComponent, TextAreaFieldComponent,
    TextFieldComponent, TimeFieldComponent, UsernameFieldComponent
} from './basic-fields';
import { FieldComponent } from './field-component';
import { LanguageFieldComponent } from './language-field';
import { TerminalColorSchemeFieldComponent } from './terminal-color-scheme-field';
import { TimeZoneFieldComponent } from './time-zone-field';

/**
 * Mapping of field type names to the components which render them.
 */
export type FieldTypeRegistry = Record<string, Type<FieldComponent>>;

/**
 * The components used to render each type of field. Additional field types
 * (such as those defined by extensions) may be added by providing this token
 * with a merged registry:
 *
 *     { provide: FIELD_TYPES, useValue: { ...DEFAULT_FIELD_TYPES, MY_TYPE: MyFieldComponent } }
 */
export const DEFAULT_FIELD_TYPES: FieldTypeRegistry = {
    [FieldType.TEXT]: TextFieldComponent,
    [FieldType.EMAIL]: EmailFieldComponent,
    [FieldType.NUMERIC]: NumberFieldComponent,
    [FieldType.BOOLEAN]: CheckboxFieldComponent,
    [FieldType.USERNAME]: UsernameFieldComponent,
    [FieldType.PASSWORD]: PasswordFieldComponent,
    [FieldType.ENUM]: SelectFieldComponent,
    [FieldType.MULTILINE]: TextAreaFieldComponent,
    [FieldType.LANGUAGE]: LanguageFieldComponent,
    [FieldType.TIMEZONE]: TimeZoneFieldComponent,
    [FieldType.DATE]: DateFieldComponent,
    [FieldType.TIME]: TimeFieldComponent,
    [FieldType.TERMINAL_COLOR_SCHEME]: TerminalColorSchemeFieldComponent,
    [FieldType.REDIRECT]: RedirectFieldComponent
};

/**
 * Service allowing extensions to define additional field types, the
 * equivalent of the "formServiceProvider" of the AngularJS application.
 * Field types must be registered before the application starts, as is the
 * case for all extension code (see loadExtensions()).
 */
export const formService = {

    /**
     * Registers the given component as the component which renders fields
     * of the given type, replacing any component previously registered for
     * that type.
     */
    registerFieldType(type: string, component: Type<FieldComponent>): void {
        DEFAULT_FIELD_TYPES[type] = component;
    }

};

export const FIELD_TYPES = new InjectionToken<FieldTypeRegistry>('FIELD_TYPES', {
    providedIn: 'root',
    factory: () => DEFAULT_FIELD_TYPES
});
