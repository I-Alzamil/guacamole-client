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

import { TranslatableMessage } from './translatable-message';

/**
 * All standard field types defined by the Guacamole REST API. Extensions may
 * define additional types.
 */
export enum FieldType {
    TEXT = 'TEXT',
    EMAIL = 'EMAIL',
    USERNAME = 'USERNAME',
    PASSWORD = 'PASSWORD',
    NUMERIC = 'NUMERIC',
    BOOLEAN = 'BOOLEAN',
    ENUM = 'ENUM',
    MULTILINE = 'MULTILINE',
    LANGUAGE = 'LANGUAGE',
    TIMEZONE = 'TIMEZONE',
    DATE = 'DATE',
    TIME = 'TIME',
    QUERY_PARAMETER = 'QUERY_PARAMETER',
    TERMINAL_COLOR_SCHEME = 'TERMINAL_COLOR_SCHEME',
    REDIRECT = 'REDIRECT'
}

/**
 * Label which replaces a field's standard header while the value of another
 * field satisfies a condition.
 */
export interface ConditionalLabel {
    field: string;
    labelKey: string;
    equals?: string;
    notEquals?: string;
}

/**
 * A field definition, as returned by the Guacamole REST API.
 */
export interface Field {

    /**
     * The name which uniquely identifies this field.
     */
    name: string;

    /**
     * The type of this field. Usually one of {@link FieldType}.
     */
    type: string;

    /**
     * All possible legal values for this field, if applicable.
     */
    options?: string[];

    /**
     * Alternative label to display based on the value of another field.
     */
    conditionalLabel?: ConditionalLabel;

    /**
     * The URL to redirect to, for REDIRECT fields.
     */
    redirectUrl?: string;

    /**
     * Message to display while redirecting, for REDIRECT fields.
     */
    translatableMessage?: TranslatableMessage;

}

/**
 * A named group of fields, as returned by the Guacamole REST API.
 */
export interface Form {

    /**
     * The name which uniquely identifies this form, if any.
     */
    name?: string;

    /**
     * All fields contained within this form.
     */
    fields: Field[];

}
