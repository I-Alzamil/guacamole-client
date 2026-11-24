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

import { Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { AuthenticationService } from '../auth/authentication.service';
import { RequestService } from '../rest/request.service';
import { Notification, NotificationAction } from './notification';

/**
 * Service for displaying the global status notification (the modal displayed
 * over the entire page).
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {

    private readonly requestService = inject(RequestService);

    private readonly status = signal<Notification | null>(null);

    /**
     * Action which dismisses the current status notification.
     */
    readonly ACKNOWLEDGE_ACTION: NotificationAction = {
        name: 'APP.ACTION_ACKNOWLEDGE',
        callback: () => this.showStatus(false)
    };

    /**
     * Promise error callback which displays the translatable message of any
     * REST error as a status notification.
     */
    readonly SHOW_REQUEST_ERROR = this.requestService.createErrorCallback((error) => {
        this.showStatus({
            className: 'error',
            title: 'APP.DIALOG_HEADER_ERROR',
            text: error.translatableMessage,
            actions: [this.ACKNOWLEDGE_ACTION]
        });
    });

    constructor() {

        // Hide status upon navigation
        inject(Router).events.pipe(filter(event => event instanceof NavigationEnd))
            .subscribe(() => this.showStatus(false));

        // Status notifications are specific to the current session
        inject(AuthenticationService).events
            .pipe(filter(event => event.type === 'login' || event.type === 'logout'))
            .subscribe(() => this.status.set(null));

    }

    /**
     * Returns the current status notification, or null if none is shown.
     */
    getStatus(): Notification | null {
        return this.status();
    }

    /**
     * Shows the given status notification, unless another is already shown.
     * Passing false hides the current notification.
     */
    showStatus(status: Notification | false): void {
        if (!this.status() || !status)
            this.status.set(status || null);
    }

}
