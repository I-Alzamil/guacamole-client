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

import { signal } from '@angular/core';
import { compilePropertyPath } from './property-path';

/**
 * Maintains a sorting predicate: a list of property paths in order of
 * precedence, each optionally prefixed with "-" to denote descending order.
 */
export class SortOrder {

    /**
     * The current predicate. Stored as a signal such that anything computed
     * from the sort order (such as a sorted list) updates automatically.
     */
    private readonly state = signal<string[]>([]);

    constructor(predicate: string[]) {
        this.state.set([...predicate]);
    }

    get predicate(): string[] {
        return this.state();
    }

    /** The property which takes precedence over all others. */
    get primary(): string {
        const first = this.state()[0];
        return first.charAt(0) === '-' ? first.substring(1) : first;
    }

    /** Whether the primary property is sorted in descending order. */
    get descending(): boolean {
        return this.state()[0].charAt(0) === '-';
    }

    /**
     * Makes the given property the primary property, sorted in the given
     * direction.
     */
    reorder(name: string, descending?: boolean): void {
        const descendingName = '-' + name;
        this.state.update(predicate => [
            descending ? descendingName : name,
            ...predicate.filter(current => current !== name && current !== descendingName)
        ]);
    }

    isSortedBy(property: string): boolean {
        return this.primary === property;
    }

    /**
     * Makes the given property the primary property, toggling its direction
     * if it is already the primary property.
     */
    togglePrimary(property: string): void {
        this.reorder(property, this.isSortedBy(property) ? !this.descending : false);
    }

}

/**
 * Compares two values using the semantics of the AngularJS orderBy filter:
 * strings are compared case-insensitively, and null/undefined values sort
 * last.
 */
function compareValues(a: unknown, b: unknown): number {

    const normalize = (value: unknown) => typeof value === 'string' ? value.toLowerCase() : value;
    a = normalize(a);
    b = normalize(b);

    if (a === b)
        return 0;

    const aMissing = a === null || a === undefined;
    const bMissing = b === null || b === undefined;
    if (aMissing || bMissing)
        return aMissing ? 1 : -1;

    if (typeof a !== typeof b)
        return typeof a < typeof b ? -1 : 1;

    return (a as any) < (b as any) ? -1 : 1;

}

/**
 * Returns a sorted copy of the given items, ordered by the given predicate
 * (as maintained by {@link SortOrder}).
 */
export function orderBy<T>(items: readonly T[] | null | undefined, predicate: string | string[]): T[] {

    if (!items)
        return [];

    const comparators = (Array.isArray(predicate) ? predicate : [predicate]).map(expression => {
        const descending = expression.charAt(0) === '-';
        const getter = compilePropertyPath(descending || expression.charAt(0) === '+' ? expression.substring(1) : expression);
        return (a: T, b: T) => (descending ? -1 : 1) * compareValues(getter(a), getter(b));
    });

    // Array.prototype.sort is stable, preserving original order of ties
    return [...items].sort((a, b) => {
        for (const comparator of comparators) {
            const result = comparator(a, b);
            if (result)
                return result;
        }
        return 0;
    });

}
