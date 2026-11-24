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

import { ClientIdentifierType, clientIdentifierToString } from '../navigation/client-identifier';
import { Connection, ConnectionGroup, ConnectionGroupType, SharingProfile } from '../rest/types/model';

/**
 * The type of object represented by a {@link GroupListItem}.
 */
export enum GroupListItemType {
    CONNECTION = 'connection',
    CONNECTION_GROUP = 'connection-group',
    SHARING_PROFILE = 'sharing-profile'
}

/**
 * Function which counts the active connections of a connection or group.
 */
export type ActiveConnectionCounter<T> = (dataSource: string, object: T) => number | null | undefined;

/**
 * Parses the given attribute value as an integer, returning Infinity if the
 * value is not a valid integer (no limit).
 */
function parseIntOrInfinity(value: string | null | undefined): number {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isNaN(parsed) ? Infinity : parsed;
}

/**
 * An item within a hierarchical list of connections, connection groups, and
 * sharing profiles.
 */
export class GroupListItem {

    dataSource!: string;
    identifier?: string;
    name?: string;
    protocol?: string;
    children: GroupListItem[] = [];
    type!: GroupListItemType | string;
    expandable = false;
    balancing = false;
    expanded = false;

    /** The connection, connection group, or sharing profile represented. */
    wrappedItem?: Connection | ConnectionGroup | SharingProfile;

    weight = 0;

    constructor(template: Partial<GroupListItem> = {}) {
        Object.assign(this, template);
    }

    getActiveConnections(): number | null | undefined {
        return null;
    }

    getAvailableConnections(): number | null {
        return null;
    }

    getEffectiveMaxConnections(): number | null {
        return null;
    }

    /**
     * Returns the client identifier for connecting to the represented
     * object, or null if it is not connectable.
     */
    getClientIdentifier(): string | null {

        if (this.type === GroupListItemType.CONNECTION)
            return clientIdentifierToString({
                dataSource: this.dataSource,
                type: ClientIdentifierType.CONNECTION,
                id: this.identifier!
            });

        if (this.type === GroupListItemType.CONNECTION_GROUP && this.balancing)
            return clientIdentifierToString({
                dataSource: this.dataSource,
                type: ClientIdentifierType.CONNECTION_GROUP,
                id: this.identifier!
            });

        return null;

    }

    /**
     * Returns the URL of the client page for the represented object, or null
     * if it is not connectable.
     */
    getClientURL(): string | null {
        const identifier = this.getClientIdentifier();
        return identifier ? '#/client/' + encodeURIComponent(identifier) : null;
    }

    static fromConnection(dataSource: string, connection: Connection, includeSharingProfiles?: boolean,
            countActiveConnections?: ActiveConnectionCounter<Connection> | null): GroupListItem {

        const children = (includeSharingProfiles !== false && connection.sharingProfiles)
            ? connection.sharingProfiles.map(child => GroupListItem.fromSharingProfile(dataSource, child))
            : [];

        const item = new GroupListItem({
            name: connection.name,
            identifier: connection.identifier,
            protocol: connection.protocol,
            dataSource,
            expandable: includeSharingProfiles !== false,
            type: GroupListItemType.CONNECTION,
            children,
            wrappedItem: connection
        });

        item.getActiveConnections = () => countActiveConnections
            ? countActiveConnections(dataSource, connection)
            : connection.activeConnections;

        return item;

    }

    static fromConnectionGroup(dataSource: string, connectionGroup: ConnectionGroup,
            includeConnections?: boolean, includeSharingProfiles?: boolean,
            countActiveConnections?: ActiveConnectionCounter<Connection> | null,
            countActiveConnectionGroups?: ActiveConnectionCounter<ConnectionGroup> | null,
            countUserActiveConnectionGroups?: ActiveConnectionCounter<ConnectionGroup> | null): GroupListItem {

        const children: GroupListItem[] = [];

        if (connectionGroup.childConnections && includeConnections !== false) {
            for (const child of connectionGroup.childConnections)
                children.push(GroupListItem.fromConnection(dataSource, child, includeSharingProfiles, countActiveConnections));
        }

        for (const child of connectionGroup.childConnectionGroups || []) {
            children.push(GroupListItem.fromConnectionGroup(dataSource, child, includeConnections,
                includeSharingProfiles, countActiveConnections, countActiveConnectionGroups,
                countUserActiveConnectionGroups));
        }

        const item = new GroupListItem({
            name: connectionGroup.name,
            identifier: connectionGroup.identifier,
            dataSource,
            type: GroupListItemType.CONNECTION_GROUP,
            balancing: connectionGroup.type === ConnectionGroupType.BALANCING,
            expandable: true,
            children,
            wrappedItem: connectionGroup
        });

        item.getActiveConnections = () => countActiveConnectionGroups
            ? countActiveConnectionGroups(dataSource, connectionGroup)
            : connectionGroup.activeConnections;

        // The maximum number of concurrent connections allowed through this
        // group, considering the limits of the group and its children
        item.getEffectiveMaxConnections = () => {

            const attrs = connectionGroup.attributes ?? {};
            const maxGlobal = parseIntOrInfinity(attrs['max-connections']);
            const maxPerUser = parseIntOrInfinity(attrs['max-connections-per-user']);

            let maxPerConnection = Infinity;
            for (const child of connectionGroup.childConnections || []) {

                const childAttrs = child.attributes ?? {};
                const childMaxGlobal = parseIntOrInfinity(childAttrs['max-connections']);
                const childMaxPerUser = parseIntOrInfinity(childAttrs['max-connections-per-user']);

                // Children without limits do not contribute
                if (childMaxGlobal === Infinity && childMaxPerUser === Infinity)
                    continue;

                maxPerConnection = maxPerConnection === Infinity ? 0 : maxPerConnection;
                maxPerConnection += Math.min(childMaxGlobal, childMaxPerUser);

            }

            const minValue = Math.min(maxGlobal, maxPerUser, maxPerConnection);
            return minValue === Infinity ? null : minValue;

        };

        // The number of connections still available through this group
        item.getAvailableConnections = () => {

            let totalActive = 0;
            if (countActiveConnections) {
                for (const child of connectionGroup.childConnections || [])
                    totalActive += countActiveConnections(dataSource, child) ?? 0;
            }

            if (!countUserActiveConnectionGroups)
                return totalActive;

            const userActive = countUserActiveConnectionGroups(dataSource, connectionGroup) ?? 0;
            return item.getEffectiveMaxConnections()! - Math.max(totalActive, userActive);

        };

        return item;

    }

    static fromSharingProfile(dataSource: string, sharingProfile: SharingProfile): GroupListItem {
        return new GroupListItem({
            name: sharingProfile.name,
            identifier: sharingProfile.identifier,
            dataSource,
            type: GroupListItemType.SHARING_PROFILE,
            wrappedItem: sharingProfile
        });
    }

}
