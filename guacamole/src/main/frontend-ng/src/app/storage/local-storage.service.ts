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

/**
 * Storage of JSON values which persists in localStorage where allowed,
 * falling back to in-memory storage otherwise.
 */
@Injectable({ providedIn: 'root' })
export class LocalStorageService {

    private readonly storedItems: Record<string, string> = {};

    setItem(key: string, value: unknown): void {

        // Store given value internally
        const data = JSON.stringify(value);
        this.storedItems[key] = data;

        // Additionally store value within localStorage if allowed
        try {
            window.localStorage?.setItem(key, data);
        }
        catch { /* localStorage unavailable */ }

    }

    removeItem(key: string): void {

        delete this.storedItems[key];

        try {
            window.localStorage?.removeItem(key);
        }
        catch { /* localStorage unavailable */ }

    }

    getItem<T = unknown>(key: string): T | null {

        // Attempt to refresh internal storage from localStorage
        try {
            const value = window.localStorage?.getItem(key);
            if (value !== null && value !== undefined)
                this.storedItems[key] = value;
            else
                delete this.storedItems[key];
        }
        catch { /* localStorage unavailable */ }

        const data = this.storedItems[key];
        if (!data)
            return null;

        try {
            return JSON.parse(data) as T;
        }
        catch {
            console.error('Ignoring invalid JSON from localStorage key "' + key + '":', data);
            return null;
        }

    }

}
