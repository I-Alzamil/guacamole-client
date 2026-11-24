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

import { Injectable, signal } from '@angular/core';

/**
 * Service controlling visibility of the Guacamole menu of the client page.
 * This replaces the guacToggleMenu, guacShowMenu, guacHideMenu, and
 * guacMenuShown events of the AngularJS application, and may be used by
 * extensions.
 */
@Injectable({ providedIn: 'root' })
export class ClientMenuService {

    /** Whether the Guacamole menu is currently shown. */
    readonly shown = signal(false);

    toggle(): void {
        this.shown.update(shown => !shown);
    }

    show(): void {
        this.shown.set(true);
    }

    hide(): void {
        this.shown.set(false);
    }

}
