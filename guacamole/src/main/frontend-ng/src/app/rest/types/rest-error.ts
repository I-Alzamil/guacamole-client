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

import { Field } from './field';
import { TranslatableMessage } from './translatable-message';

/**
 * The type of error described by a {@link RestError}, mirroring the error
 * types defined by the Guacamole REST API.
 */
export enum RestErrorType {
    BAD_REQUEST = 'BAD_REQUEST',
    INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
    INSUFFICIENT_CREDENTIALS = 'INSUFFICIENT_CREDENTIALS',
    INTERNAL_ERROR = 'INTERNAL_ERROR',
    NOT_FOUND = 'NOT_FOUND',
    PERMISSION_DENIED = 'PERMISSION_DENIED',
    STREAM_ERROR = 'STREAM_ERROR'
}

/**
 * An error returned by the Guacamole REST API.
 */
export class RestError {

    /**
     * Human-readable (untranslated) message describing the error.
     */
    message?: string;

    /**
     * Translatable message describing the error, if any.
     */
    translatableMessage?: TranslatableMessage;

    /**
     * Guacamole protocol status code associated with the error, if any.
     */
    statusCode?: number;

    /**
     * The type of this error.
     */
    type: RestErrorType;

    /**
     * Any fields expected by the server for authentication to succeed, if
     * this is an INSUFFICIENT_CREDENTIALS or INVALID_CREDENTIALS error.
     */
    expected?: Field[];

    /**
     * The outcome of each patch operation, if this error resulted from a
     * failed PATCH request.
     */
    patches: unknown[] | null;

    constructor(template: Partial<RestError> = {}) {
        this.message = template.message;
        this.translatableMessage = template.translatableMessage;
        this.statusCode = template.statusCode;
        this.type = template.type || RestErrorType.INTERNAL_ERROR;
        this.expected = template.expected;
        this.patches = template.patches || null;
    }

}
