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

import { ConnectionHistoryEntry, Duration } from '../rest/types/model';
import { ObjectPermissionCategory, ObjectPermissionType, PermissionSet, SystemPermissionType } from '../rest/types/permission-set';

/**
 * The actions the current user may perform on an object within a particular
 * data source.
 */
export interface ManagementPermissions {

    /** The identifier of the object, or null if the object does not exist. */
    identifier: string | null;

    canSaveObject: boolean;
    canCloneObject: boolean;
    canDeleteObject: boolean;
    canChangeAttributes: boolean;
    canChangeAllAttributes: boolean;
    canChangePermissions: boolean;

}

/**
 * Determines the management actions available for the object having the
 * given identifier (or for a new object, if no identifier is given).
 */
export function managementPermissionsFromPermissionSet(permissions: PermissionSet,
        createPermission: SystemPermissionType, category: ObjectPermissionCategory,
        identifier?: string | null): ManagementPermissions {

    const isAdmin = PermissionSet.hasSystemPermission(permissions, SystemPermissionType.ADMINISTER);
    const canCreate = PermissionSet.hasSystemPermission(permissions, createPermission);
    const has = (type: ObjectPermissionType) =>
        !!identifier && PermissionSet.hasObjectPermission(permissions, category, type, identifier);

    const canAdminister = has(ObjectPermissionType.ADMINISTER);
    const canUpdate = has(ObjectPermissionType.UPDATE);
    const canDelete = has(ObjectPermissionType.DELETE);
    const exists = !!identifier;

    return {
        identifier: identifier || null,
        canSaveObject: isAdmin || (!exists && canCreate) || canUpdate,
        canCloneObject: exists && (isAdmin || canCreate),
        canDeleteObject: exists && (isAdmin || canDelete),
        canChangeAttributes: !exists || isAdmin || canUpdate,
        canChangeAllAttributes: !exists,
        canChangePermissions: isAdmin || !exists || canAdminister
    };

}

/**
 * Records the granting or revoking of an object permission within the given
 * sets of pending changes, cancelling out any opposite pending change.
 */
export function recordObjectPermissionChange(added: PermissionSet, removed: PermissionSet,
        category: ObjectPermissionCategory, type: string, identifier: string, granted: boolean): void {

    const [from, to] = granted ? [removed, added] : [added, removed];

    if (PermissionSet.hasObjectPermission(from, category, type, identifier))
        PermissionSet.removeObjectPermission(from, category, type, identifier);
    else
        PermissionSet.addObjectPermission(to, category, type, identifier);

}

/**
 * Records the granting or revoking of a system permission within the given
 * sets of pending changes, cancelling out any opposite pending change.
 */
export function recordSystemPermissionChange(added: PermissionSet, removed: PermissionSet,
        type: string, granted: boolean): void {

    const [from, to] = granted ? [removed, added] : [added, removed];

    if (PermissionSet.hasSystemPermission(from, type))
        PermissionSet.removeSystemPermission(from, type);
    else
        PermissionSet.addSystemPermission(to, type);

}

/**
 * A connection history entry, along with its human-readable duration, for
 * display within the connection editor.
 */
export class HistoryEntryWrapper {

    readonly duration: Duration | null = null;

    /** The translation key of the text describing the duration. */
    readonly durationText: string;

    constructor(readonly entry: ConnectionHistoryEntry) {

        this.durationText = entry.active ? 'MANAGE_CONNECTION.INFO_CONNECTION_ACTIVE_NOW'
            : !entry.endDate ? 'MANAGE_CONNECTION.INFO_CONNECTION_DURATION_UNKNOWN'
            : 'MANAGE_CONNECTION.TEXT_HISTORY_DURATION';

        if (entry.endDate && entry.startDate)
            this.duration = new Duration(entry.endDate - entry.startDate);

    }

}
