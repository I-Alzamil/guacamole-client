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

import { Directive, HostListener, inject } from '@angular/core';
import { patchService } from 'guacamole-frontend';
import { ClientAuthService } from '../services/clientAuthService';

/**
 * A directive which automatically attempts to log the current user in using
 * SSL/TLS client authentication when the associated element is clicked.
 */
@Directive({ selector: '[guac-ssl-auth]' })
export class GuacSslAuth {

    // Required services
    private readonly clientAuthService = inject(ClientAuthService);

    // Attempt SSL/TLS client authentication upon click
    @HostListener('click', ['$event'])
    elementClicked(event: Event): void {

        // Links with an empty "href" (such as the link within the SSO
        // provider list) must not navigate, as was automatically the case
        // within AngularJS
        event.preventDefault();

        this.clientAuthService.authenticate();

    }

}

// Allow use of guac-ssl-auth within HTML patches
patchService.registerDirective(GuacSslAuth);
