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
 * Permission types which apply to individual objects.
 */
export enum ObjectPermissionType {
    READ = 'READ',
    UPDATE = 'UPDATE',
    DELETE = 'DELETE',
    ADMINISTER = 'ADMINISTER'
}

/**
 * Permission types which apply to the system as a whole.
 */
export enum SystemPermissionType {
    ADMINISTER = 'ADMINISTER',
    AUDIT = 'AUDIT',
    CREATE_USER = 'CREATE_USER',
    CREATE_USER_GROUP = 'CREATE_USER_GROUP',
    CREATE_CONNECTION = 'CREATE_CONNECTION',
    CREATE_CONNECTION_GROUP = 'CREATE_CONNECTION_GROUP',
    CREATE_SHARING_PROFILE = 'CREATE_SHARING_PROFILE'
}

/**
 * Map of object identifiers to the permissions granted for that object.
 */
export type ObjectPermissionMap = Record<string, string[]>;

/**
 * The names of each object permission map within a permission set.
 */
export type ObjectPermissionCategory =
    | 'connectionPermissions'
    | 'connectionGroupPermissions'
    | 'sharingProfilePermissions'
    | 'activeConnectionPermissions'
    | 'userPermissions'
    | 'userGroupPermissions';

export const OBJECT_PERMISSION_CATEGORIES: ObjectPermissionCategory[] = [
    'connectionPermissions',
    'connectionGroupPermissions',
    'sharingProfilePermissions',
    'activeConnectionPermissions',
    'userPermissions',
    'userGroupPermissions'
];

/**
 * A set of permissions, as returned by the Guacamole REST API, along with
 * functions for querying and modifying such sets.
 */
export class PermissionSet implements Record<ObjectPermissionCategory, ObjectPermissionMap> {

    connectionPermissions: ObjectPermissionMap;
    connectionGroupPermissions: ObjectPermissionMap;
    sharingProfilePermissions: ObjectPermissionMap;
    activeConnectionPermissions: ObjectPermissionMap;
    userPermissions: ObjectPermissionMap;
    userGroupPermissions: ObjectPermissionMap;
    systemPermissions: string[];

    constructor(template: Partial<PermissionSet> = {}) {
        this.connectionPermissions = template.connectionPermissions || {};
        this.connectionGroupPermissions = template.connectionGroupPermissions || {};
        this.sharingProfilePermissions = template.sharingProfilePermissions || {};
        this.activeConnectionPermissions = template.activeConnectionPermissions || {};
        this.userPermissions = template.userPermissions || {};
        this.userGroupPermissions = template.userGroupPermissions || {};
        this.systemPermissions = template.systemPermissions || [];
    }

    /**
     * Returns a deep copy of the given permission set.
     */
    static copy(permSet: PermissionSet): PermissionSet {
        return new PermissionSet(structuredClone({ ...permSet }));
    }

    /**
     * Returns whether the given object permission is granted. If no
     * identifier is given, returns whether the permission is granted for any
     * object.
     */
    static hasObjectPermission(permSet: PermissionSet, category: ObjectPermissionCategory,
            type: string, identifier?: string | null): boolean {

        const permMap = permSet[category];
        if (!permMap)
            return false;

        if (!identifier)
            return Object.values(permMap).some(types => types.includes(type));

        return !!permMap[identifier]?.includes(type);

    }

    static hasConnectionPermission(permSet: PermissionSet, type: string, identifier?: string | null): boolean {
        return PermissionSet.hasObjectPermission(permSet, 'connectionPermissions', type, identifier);
    }

    static hasConnectionGroupPermission(permSet: PermissionSet, type: string, identifier?: string | null): boolean {
        return PermissionSet.hasObjectPermission(permSet, 'connectionGroupPermissions', type, identifier);
    }

    static hasSharingProfilePermission(permSet: PermissionSet, type: string, identifier?: string | null): boolean {
        return PermissionSet.hasObjectPermission(permSet, 'sharingProfilePermissions', type, identifier);
    }

    static hasActiveConnectionPermission(permSet: PermissionSet, type: string, identifier?: string | null): boolean {
        return PermissionSet.hasObjectPermission(permSet, 'activeConnectionPermissions', type, identifier);
    }

    static hasUserPermission(permSet: PermissionSet, type: string, identifier?: string | null): boolean {
        return PermissionSet.hasObjectPermission(permSet, 'userPermissions', type, identifier);
    }

    static hasUserGroupPermission(permSet: PermissionSet, type: string, identifier?: string | null): boolean {
        return PermissionSet.hasObjectPermission(permSet, 'userGroupPermissions', type, identifier);
    }

    static hasSystemPermission(permSet: PermissionSet, type: string): boolean {
        return !!permSet.systemPermissions?.includes(type);
    }

    static addSystemPermission(permSet: PermissionSet, type: string): boolean {
        permSet.systemPermissions = permSet.systemPermissions || [];
        if (permSet.systemPermissions.includes(type))
            return false;
        permSet.systemPermissions.push(type);
        return true;
    }

    static removeSystemPermission(permSet: PermissionSet, type: string): boolean {
        permSet.systemPermissions = permSet.systemPermissions || [];
        const index = permSet.systemPermissions.indexOf(type);
        if (index === -1)
            return false;
        permSet.systemPermissions.splice(index, 1);
        return true;
    }

    /**
     * Grants the given object permission, returning whether the permission
     * set was modified.
     */
    static addObjectPermission(permSet: PermissionSet, category: ObjectPermissionCategory,
            type: string, identifier: string): boolean {
        const permMap = permSet[category] = permSet[category] || {};
        const types = permMap[identifier] = permMap[identifier] || [];
        if (types.includes(type))
            return false;
        types.push(type);
        return true;
    }

    /**
     * Revokes the given object permission, returning whether the permission
     * set was modified.
     */
    static removeObjectPermission(permSet: PermissionSet, category: ObjectPermissionCategory,
            type: string, identifier: string): boolean {
        const types = (permSet[category] = permSet[category] || {})[identifier];
        const index = types?.indexOf(type) ?? -1;
        if (index === -1)
            return false;
        types.splice(index, 1);
        return true;
    }

    static removeConnectionGroupPermission(permSet: PermissionSet, type: string, identifier: string): boolean {
        return PermissionSet.removeObjectPermission(permSet, 'connectionGroupPermissions', type, identifier);
    }

    static removeUserPermission(permSet: PermissionSet, type: string, identifier: string): boolean {
        return PermissionSet.removeObjectPermission(permSet, 'userPermissions', type, identifier);
    }

}

/**
 * Map of permission types to the set of identifiers for which that
 * permission is granted, suitable for binding to checkboxes.
 */
export type PermissionFlagMap = Record<string, Record<string, boolean>>;

/**
 * Alternative representation of a {@link PermissionSet} as boolean flags.
 */
export class PermissionFlagSet implements Record<ObjectPermissionCategory, PermissionFlagMap> {

    systemPermissions: Record<string, boolean> = {};
    connectionPermissions: PermissionFlagMap = emptyFlagMap();
    connectionGroupPermissions: PermissionFlagMap = emptyFlagMap();
    sharingProfilePermissions: PermissionFlagMap = emptyFlagMap();
    activeConnectionPermissions: PermissionFlagMap = emptyFlagMap();
    userPermissions: PermissionFlagMap = emptyFlagMap();
    userGroupPermissions: PermissionFlagMap = emptyFlagMap();

    static fromPermissionSet(permissionSet: PermissionSet): PermissionFlagSet {

        const flags = new PermissionFlagSet();

        for (const type of permissionSet.systemPermissions)
            flags.systemPermissions[type] = true;

        for (const category of OBJECT_PERMISSION_CATEGORIES) {
            for (const [identifier, types] of Object.entries(permissionSet[category] || {})) {
                for (const type of types)
                    (flags[category][type] = flags[category][type] || {})[identifier] = true;
            }
        }

        return flags;

    }

}

function emptyFlagMap(): PermissionFlagMap {
    return { READ: {}, UPDATE: {}, DELETE: {}, ADMINISTER: {} };
}
