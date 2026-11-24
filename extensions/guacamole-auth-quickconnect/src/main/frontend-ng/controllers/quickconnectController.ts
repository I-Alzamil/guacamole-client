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

import { Directive, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ClientIdentifierType, NotificationService, clientIdentifierToString, patchService } from 'guacamole-frontend';
import { QuickConnectService } from '../services/quickConnectService';

/**
 * The controller for making ad-hoc (quick) connections. Within templates, it
 * is applied to an element with the "quickconnectController" attribute, and
 * accessed through a template reference variable, the equivalent of
 * AngularJS "ng-controller".
 */
@Directive({
    selector: '[quickconnectController]',
    exportAs: 'quickconnectController'
})
export class QuickconnectController {

    // Required services
    private readonly router = inject(Router);
    private readonly guacNotification = inject(NotificationService);
    private readonly quickConnectService = inject(QuickConnectService);

    /**
     * The URI that will be passed in to the extension to create
     * the connection.
     */
    uri: string | null = null;

    /**
     * Saves the connection, creating a new connection or updating the existing
     * connection.
     */
    quickConnect(): void {

        this.quickConnectService.createConnection(this.uri)
        .then((connectionId) => {
            this.router.navigateByUrl('/client/' + clientIdentifierToString({
                dataSource : 'quickconnect',
                type       : ClientIdentifierType.CONNECTION,
                id         : connectionId
            }));
        }, this.guacNotification.SHOW_REQUEST_ERROR);

        return;

    }

}

// Allow use of quickconnectController within HTML patches
patchService.registerDirective(QuickconnectController);
