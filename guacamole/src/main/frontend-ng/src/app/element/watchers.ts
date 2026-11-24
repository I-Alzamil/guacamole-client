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

/**
 * A minimal equivalent of AngularJS $scope.$watch() for state stored in
 * plain mutable objects. Registered getters are evaluated each time
 * {@link check} is called (typically from ngDoCheck), and the associated
 * callback is invoked whenever a getter's value changes (by identity).
 */
export class Watchers {

    private readonly entries: {
        get: () => unknown;
        callback: (value: any, previous: any) => void;
        deep: boolean;
        last: unknown;
        initialized: boolean;
    }[] = [];

    /**
     * Registers a getter whose value should be watched. The callback is
     * invoked during the first check and whenever the value changes. If deep
     * is true, the value is compared by its contents rather than identity,
     * like the "objectEquality" parameter of AngularJS $scope.$watch(). The
     * previous value is not provided to the callback of a deep watch.
     */
    watch<T>(get: () => T, callback: (value: T, previous: T | undefined) => void, deep = false): void {
        this.entries.push({ get, callback, deep, last: undefined, initialized: false });
    }

    /**
     * Evaluates all watched getters, invoking callbacks for any which have
     * changed. Checking repeats (up to a limit) while callbacks continue to
     * cause changes, as with an AngularJS digest.
     */
    check(): void {
        for (let iteration = 0; iteration < 10; iteration++) {

            let changed = false;
            for (const entry of this.entries) {
                const value = entry.deep ? JSON.stringify(entry.get()) : entry.get();
                if (!entry.initialized || !Object.is(value, entry.last)) {
                    const previous = entry.last;
                    entry.initialized = true;
                    entry.last = value;
                    entry.callback(entry.deep ? entry.get() : value, entry.deep ? undefined : previous);
                    changed = true;
                }
            }

            if (!changed)
                return;

        }
    }

}
