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

import { Injectable, inject } from '@angular/core';
import { AuthenticationService, CacheService, RequestService } from 'guacamole-frontend';

/**
 * Service for managing quickConnect extension.
 */
@Injectable({ providedIn: 'root' })
export class QuickConnectService {

    // Required services
    private readonly authenticationService = inject(AuthenticationService);
    private readonly cacheService          = inject(CacheService);
    private readonly requestService        = inject(RequestService);

    /**
     * Makes a request to the REST API to create a connection, returning a
     * promise that can be used for processing the results of the call.
     * 
     * @param {uri} The URI of the connection to create.
     *                          
     * @returns {Promise}
     *     A promise for the HTTP call which will succeed if and only if the
     *     save operation is successful.
     */
    createConnection(uri: string | null): Promise<string> {

        // Build HTTP parameters set
        var httpParameters = {
            token : this.authenticationService.getCurrentToken() ?? undefined
        };

        return this.requestService.request({
            method  : 'POST',
            url     : 'api/session/ext/quickconnect/create',
            params  : httpParameters,
            body    : new URLSearchParams({uri: uri ?? ''}).toString(),
            headers : {'Content-Type': 'application/x-www-form-urlencoded'}
        })
        .then((connectionId: any) => {
            // Clear connections and users from cache.
            this.cacheService.connections.removeAll();
            this.cacheService.users.removeAll();

            // Pass on the connection identifier
            return connectionId.identifier;
        });

    }

}
