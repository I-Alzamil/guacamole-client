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
 * Service which schedules re-rendering of the application after state has
 * been modified outside of Angular's knowledge, such as within callbacks of
 * Guacamole.Client, Guacamole.Tunnel, or other non-Angular event sources.
 * This serves the same role as $rootScope.$apply() within the AngularJS
 * application.
 *
 * The root component reads the digest signal, so any change to the signal
 * causes the zoneless scheduler to refresh the root view and all components
 * beneath it which use the "Eager" change detection strategy. As OnPush is
 * the default strategy as of Angular 22, all components of this application
 * which display state held in plain mutable objects (such as ManagedClient)
 * must explicitly declare ChangeDetectionStrategy.Eager.
 */
@Injectable({ providedIn: 'root' })
export class DigestService {

    private readonly counter = signal(0);

    /**
     * Read by the root component to establish a reactive dependency.
     */
    readonly version = this.counter.asReadonly();

    /**
     * Invokes the given function (if any), then schedules re-rendering of
     * the application.
     */
    apply<T>(fn?: () => T): T | undefined {
        try {
            return fn?.();
        }
        finally {
            this.counter.update(value => value + 1);
        }
    }

}
