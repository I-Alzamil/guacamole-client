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

import { canonicalize } from '../../locale/translation.service';
import { Form } from './field';
import { RestError } from './rest-error';

/**
 * Arbitrary attributes associated with an object, keyed by attribute name.
 */
export type Attributes = Record<string, string | null>;

/**
 * A connection, as returned by the Guacamole REST API.
 */
export interface Connection {
    identifier?: string;
    parentIdentifier?: string;
    name?: string;
    protocol?: string;
    parameters?: Record<string, string>;
    attributes: Attributes;
    activeConnections?: number;
    sharingProfiles?: SharingProfile[];
    lastActive?: number;
}

/**
 * The type of a connection group.
 */
export enum ConnectionGroupType {
    BALANCING = 'BALANCING',
    ORGANIZATIONAL = 'ORGANIZATIONAL'
}

/**
 * The identifier of the root connection group of every data source.
 */
export const ROOT_CONNECTION_GROUP = 'ROOT';

/**
 * A connection group, as returned by the Guacamole REST API.
 */
export interface ConnectionGroup {
    identifier?: string;
    parentIdentifier?: string;
    name?: string;
    type: ConnectionGroupType | string;
    childConnections?: Connection[];
    childConnectionGroups?: ConnectionGroup[];
    attributes: Attributes;
    activeConnections?: number;
}

/**
 * Well-known user attributes.
 */
export const UserAttributes = {
    FULL_NAME: 'guac-full-name',
    EMAIL_ADDRESS: 'guac-email-address',
    ORGANIZATION: 'guac-organization',
    ORGANIZATIONAL_ROLE: 'guac-organizational-role'
} as const;

/**
 * A user, as returned by the Guacamole REST API.
 */
export interface User {
    username: string;
    password?: string | null;
    lastActive?: number;
    disabled?: boolean;
    attributes: Attributes;
}

/**
 * A user group, as returned by the Guacamole REST API.
 */
export interface UserGroup {
    identifier: string;
    disabled?: boolean;
    attributes: Attributes;
}

/**
 * A sharing profile, as returned by the Guacamole REST API.
 */
export interface SharingProfile {
    identifier?: string;
    primaryConnectionIdentifier?: string;
    name?: string;
    parameters?: Record<string, string>;
    attributes: Attributes;
}

/**
 * An active connection, as returned by the Guacamole REST API.
 */
export interface ActiveConnection {
    identifier: string;
    connectionIdentifier: string;
    startDate: number;
    remoteHost: string;
    username: string;
    connectable: boolean;
}

/**
 * Credentials which can be used to access a shared connection.
 */
export interface UserCredentials {
    expected: { name: string, type: string }[];
    values: Record<string, string>;
}

/**
 * The type of an activity log associated with a history entry.
 */
export enum ActivityLogType {
    GUACAMOLE_SESSION_RECORDING = 'GUACAMOLE_SESSION_RECORDING',
    SERVER_LOG = 'SERVER_LOG',
    TYPESCRIPT = 'TYPESCRIPT',
    TYPESCRIPT_TIMING = 'TYPESCRIPT_TIMING'
}

export interface ActivityLog {
    type: ActivityLogType | string;
    description: { key: string, variables?: Record<string, unknown> };
}

/**
 * An entry within the connection history, as returned by the Guacamole REST
 * API.
 */
export interface ConnectionHistoryEntry {
    identifier?: string;
    uuid?: string;
    connectionIdentifier?: string;
    connectionName?: string;
    remoteHost?: string;
    startDate: number;
    endDate?: number | null;
    username?: string;
    active?: boolean;
    attributes?: Attributes;
    logs?: Record<string, ActivityLog>;
}

/**
 * A duration expressed as a value and unit appropriate for display.
 */
export class Duration {

    readonly value: number;

    readonly unit: 'day' | 'hour' | 'minute' | 'second';

    constructor(milliseconds: number) {

        const seconds = milliseconds / 1000;
        const round = (value: number) => Math.round(value * 10) / 10;

        if (seconds >= 86400) {
            this.value = round(seconds / 86400);
            this.unit = 'day';
        }
        else if (seconds >= 3600) {
            this.value = round(seconds / 3600);
            this.unit = 'hour';
        }
        else if (seconds >= 60) {
            this.value = round(seconds / 60);
            this.unit = 'minute';
        }
        else {
            this.value = round(seconds);
            this.unit = 'second';
        }

    }

}

/**
 * A protocol supported by the server, as returned by the Guacamole REST API.
 */
export interface Protocol {
    name: string;
    connectionForms: Form[];
    sharingProfileForms: Form[];
}

/**
 * Returns the translation namespace of the protocol having the given name.
 */
export function getProtocolNamespace(protocolName: string | null | undefined): string | null {
    if (!protocolName)
        return null;
    return 'PROTOCOL_' + canonicalize(protocolName);
}

/**
 * Returns the translation key of the human-readable name of the protocol
 * having the given name.
 */
export function getProtocolName(protocolName: string | null | undefined): string {
    return getProtocolNamespace(protocolName) + '.NAME';
}

/**
 * A single operation within a PATCH request against a directory of objects.
 */
export interface DirectoryPatch<T> {
    op: 'add' | 'replace' | 'remove';
    path: string;
    value?: T;
}

/**
 * The outcome of a single operation within a PATCH request.
 */
export interface DirectoryPatchOutcome {
    op: 'add' | 'replace' | 'remove';
    path: string;
    identifier: string;
    error?: RestError;
}

export interface DirectoryPatchResponse {
    patches: DirectoryPatchOutcome[];
}

/**
 * A single operation modifying the relationship between objects.
 */
export interface RelatedObjectPatch {
    op: 'add' | 'remove';
    path: string;
    value: string;
}

/**
 * A single operation modifying a permission.
 */
export interface PermissionPatch {
    op: 'add' | 'remove';
    path: string;
    value: string;
}
