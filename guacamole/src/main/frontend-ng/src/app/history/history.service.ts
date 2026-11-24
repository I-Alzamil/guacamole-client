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
import { PreferenceService } from '../settings/preference.service';
import { LocalStorageService } from '../storage/local-storage.service';

const GUAC_HISTORY_STORAGE_KEY = 'GUAC_HISTORY';

/**
 * A recently-used connection, as stored in local storage.
 */
export interface HistoryEntry {

    /** The client identifier of the connection. */
    id: string;

    /** A data URL of a thumbnail of the connection's display. */
    thumbnail: string;

}

/**
 * Service tracking the connections recently used by the current browser.
 */
@Injectable({ providedIn: 'root' })
export class HistoryService {

    private readonly localStorageService = inject(LocalStorageService);
    private readonly preferenceService = inject(PreferenceService);

    /** All recently-used connections, most recent first. */
    readonly recentConnections = signal<HistoryEntry[]>([]);

    constructor() {
        const storedHistory = this.localStorageService.getItem(GUAC_HISTORY_STORAGE_KEY);
        if (Array.isArray(storedHistory))
            this.recentConnections.set(storedHistory);
    }

    private save(): void {
        this.localStorageService.setItem(GUAC_HISTORY_STORAGE_KEY, this.recentConnections());
    }

    /**
     * Removes the entry having the given client identifier, returning
     * whether such an entry existed.
     */
    removeEntry(id: string): boolean {
        const entries = this.recentConnections();
        const remaining = entries.filter(entry => entry.id !== id);
        this.recentConnections.set(remaining);
        this.save();
        return remaining.length !== entries.length;
    }

    /**
     * Updates the thumbnail of the given connection, moving it to the front
     * of the list of recent connections.
     */
    updateThumbnail(id: string, thumbnail: string): void {

        const entries = [{ id, thumbnail }, ...this.recentConnections().filter(entry => entry.id !== id)];
        entries.length = Math.min(entries.length, this.preferenceService.preferences.numberOfRecentConnections);

        this.recentConnections.set(entries);
        this.save();

    }

}
