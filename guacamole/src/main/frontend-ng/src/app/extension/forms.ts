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

import { NgModule, Type } from '@angular/core';
import {
    CheckboxControlValueAccessor, CheckboxRequiredValidator, DefaultValueAccessor, EmailValidator,
    MaxLengthValidator, MaxValidator, MinLengthValidator, MinValidator, NgControlStatus,
    NgControlStatusGroup, NgForm, NgModel, NgModelGroup, NgSelectOption, NumberValueAccessor,
    PatternValidator, RadioControlValueAccessor, RangeValueAccessor, RequiredValidator,
    SelectControlValueAccessor, SelectMultipleControlValueAccessor
} from '@angular/forms';

let extensionFormsModule: Type<unknown> | undefined;

/**
 * Returns the equivalent of FormsModule for use by components compiled at
 * runtime (extension components and HTML patches). FormsModule itself cannot
 * be used, as the list of directives exported by an NgModule is omitted from
 * production builds of the application, being needed only for runtime
 * compilation.
 */
export function getExtensionFormsModule(): Type<unknown> {
    return extensionFormsModule ??= NgModule({
        exports: [
            CheckboxControlValueAccessor, CheckboxRequiredValidator, DefaultValueAccessor, EmailValidator,
            MaxLengthValidator, MaxValidator, MinLengthValidator, MinValidator, NgControlStatus,
            NgControlStatusGroup, NgForm, NgModel, NgModelGroup, NgSelectOption, NumberValueAccessor,
            PatternValidator, RadioControlValueAccessor, RangeValueAccessor, RequiredValidator,
            SelectControlValueAccessor, SelectMultipleControlValueAccessor
        ]
    })(class FormsModule {});
}
