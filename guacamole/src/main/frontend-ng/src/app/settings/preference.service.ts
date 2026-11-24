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
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { AuthenticationService } from '../auth/authentication.service';
import { LocalStorageService } from '../storage/local-storage.service';

const GUAC_PREFERENCES_STORAGE_KEY = 'GUAC_PREFERENCES';

/**
 * All supported input methods.
 */
export enum InputMethod {
    NONE = 'none',
    OSK = 'osk',
    TEXT = 'text'
}

/**
 * All user preferences which are persisted in local storage.
 */
export interface Preferences {
    emulateAbsoluteMouse: boolean;
    inputMethod: InputMethod;
    language: string;
    numberOfRecentConnections: number;
    showRecentConnections: boolean;
    timezone: string;
}

/**
 * Returns the language key preferred by the browser, in the format used
 * internally by Guacamole ("en_US" rather than "en-US").
 */
function getDefaultLanguageKey(): string {
    const language = navigator.languages?.[0] || navigator.language || 'en';
    return language.replace(/-/g, '_');
}

/**
 * Service for retrieving and persisting user preferences.
 */
@Injectable({ providedIn: 'root' })
export class PreferenceService {

    private readonly localStorageService = inject(LocalStorageService);

    readonly preferences: Preferences = {
        emulateAbsoluteMouse: true,
        inputMethod: InputMethod.NONE,
        language: getDefaultLanguageKey(),
        numberOfRecentConnections: 6,
        showRecentConnections: true,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };

    constructor() {

        const storedPreferences = this.localStorageService.getItem<Partial<Preferences>>(GUAC_PREFERENCES_STORAGE_KEY);
        if (storedPreferences)
            Object.assign(this.preferences, storedPreferences);

        // Persist settings when window is unloaded
        window.addEventListener('pagehide', () => this.save());

        // Persist settings upon navigation
        inject(Router).events.pipe(filter(event => event instanceof NavigationEnd))
            .subscribe(() => this.save());

        // Persist settings upon logout
        inject(AuthenticationService).events.pipe(filter(event => event.type === 'logout'))
            .subscribe(() => this.save());

    }

    save(): void {
        this.localStorageService.setItem(GUAC_PREFERENCES_STORAGE_KEY, this.preferences);
    }

}
