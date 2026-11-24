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
 * The type of object a client is connected to.
 */
export enum ClientIdentifierType {
    CONNECTION = 'c',
    CONNECTION_GROUP = 'g',
    ACTIVE_CONNECTION = 'a'
}

/**
 * Uniquely identifies a client: the object it is connected to, the type of
 * that object, and the data source containing that object. Client
 * identifiers are encoded within the URL of the client page.
 */
export interface ClientIdentifier {
    dataSource: string;
    type: ClientIdentifierType | string;
    id: string;
}

function base64urlEncode(value: string): string {
    return btoa(value).replace(/[+/=]/g,
        (str) => ({ '+': '-', '/': '_', '=': '' })[str]!);
}

function base64urlDecode(value: string): string {
    value += (['', '===', '==', '='])[value.length % 4];
    return atob(value.replace(/[-_]/g, (str) => ({ '-': '+', '_': '/' })[str]!));
}

/**
 * Converts the given client identifier into its URL-safe string form.
 */
export function clientIdentifierToString(id: ClientIdentifier): string {
    return base64urlEncode([id.id, id.type, id.dataSource].join('\0'));
}

/**
 * Parses the given string form of a client identifier. Strings which are not
 * valid encoded client identifiers are interpreted as connection identifiers
 * within the given default data source.
 */
export function clientIdentifierFromString(str: string, defaultDataSource: string | null): ClientIdentifier {
    try {
        const values = base64urlDecode(str).split('\0');
        return { id: values[0], type: values[1], dataSource: values[2] };
    }
    catch {
        return {
            id: str,
            type: ClientIdentifierType.CONNECTION,
            dataSource: defaultDataSource || 'default'
        };
    }
}
