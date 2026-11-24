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

import { Injectable } from '@angular/core';
import { RequestCache } from './request.service';

/**
 * Shared caches for REST API responses.
 */
@Injectable({ providedIn: 'root' })
export class CacheService {

    /** Cache of connection-related data. */
    readonly connections = new RequestCache();

    /** Cache of available languages and translations. */
    readonly languages = new RequestCache();

    /** Cache of HTML patches. */
    readonly patches = new RequestCache();

    /** Cache of schema (attribute/protocol) data. */
    readonly schema = new RequestCache();

    /** Cache of user-related data. */
    readonly users = new RequestCache();

    /**
     * Clears all caches except for the cache of HTML patches, which does not
     * vary by user.
     */
    clearCaches(): void {
        this.connections.removeAll();
        this.languages.removeAll();
        this.schema.removeAll();
        this.users.removeAll();
    }

}
