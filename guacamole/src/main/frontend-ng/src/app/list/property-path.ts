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
 * Function which retrieves a (possibly nested) property value from an
 * object.
 */
export type PropertyGetter = (object: unknown) => unknown;

const getterCache = new Map<string, PropertyGetter>();

/**
 * Compiles a property path expression, such as "name",
 * "entry.startDate", or 'user.attributes["guac-full-name"]', into a function
 * which retrieves that property from a given object. This replaces the
 * limited subset of AngularJS $parse expressions used for filtering and
 * sorting.
 */
export function compilePropertyPath(path: string): PropertyGetter {

    const cached = getterCache.get(path);
    if (cached)
        return cached;

    const segments: string[] = [];
    const pattern = /([^.[\]]+)|\[\s*(?:"([^"]*)"|'([^']*)'|(\d+))\s*\]/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(path)))
        segments.push(match[1] ?? match[2] ?? match[3] ?? match[4]);

    const getter: PropertyGetter = (object) => {
        let value: any = object;
        for (const segment of segments) {
            if (value === null || value === undefined)
                return undefined;
            value = value[segment];
        }
        return value;
    };

    getterCache.set(path, getter);
    return getter;

}
