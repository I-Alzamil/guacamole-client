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

import { Injectable, inject } from '@angular/core';
import { parse as parseCSVData } from 'csv-parse/browser/esm/sync';
import { parse as parseYAMLData } from 'yaml';
import { ConnectionGroupService } from '../rest/connection.services';
import { SchemaService } from '../rest/schema.service';
import { ConnectionGroup, ROOT_CONNECTION_GROUP } from '../rest/types/model';

/**
 * How connections which already exist should be handled during import.
 */
export enum ExistingConnectionMode {
    REJECT = 'REJECT',
    REPLACE = 'REPLACE'
}

/**
 * How the permissions of replaced connections should be handled.
 */
export enum ExistingPermissionMode {
    PRESERVE = 'PRESERVE',
    REPLACE = 'REPLACE'
}

/**
 * Options controlling a connection import.
 */
export interface ConnectionImportConfig {
    existingConnectionMode: ExistingConnectionMode;
    existingPermissionMode: ExistingPermissionMode;
    createMissingGroups: boolean;
}

/**
 * An error encountered while parsing import data, which may be translated.
 */
export class ParseError {

    readonly message: string;
    readonly key: string;
    readonly variables?: Record<string, unknown>;

    constructor(template: { message: string, key?: string, variables?: Record<string, unknown> }) {
        this.message = template.message;
        this.key = template.key || 'APP.TEXT_UNTRANSLATED';
        this.variables = template.key ? template.variables : { MESSAGE: template.message };
    }

}

/**
 * Whether an imported connection creates a new connection or replaces an
 * existing one.
 */
export enum ImportMode {
    CREATE = 'CREATE',
    REPLACE = 'REPLACE'
}

/**
 * A connection parsed from import data.
 */
export class ImportConnection {

    parentIdentifier?: string;
    group?: string;
    identifier?: string;
    name?: string;
    protocol?: string;
    parameters: Record<string, string> = {};
    attributes: Record<string, string> = {};
    users: string[] = [];
    groups: string[] = [];
    importMode = ImportMode.CREATE;
    errors: ParseError[] = [];

    constructor(template: Partial<ImportConnection> = {}) {
        Object.assign(this, template);
        this.parameters ??= {};
        this.attributes ??= {};
        this.users ??= [];
        this.groups ??= [];
        this.errors ??= [];
    }

}

/**
 * The result of parsing import data.
 */
export class ParseResult {

    connectionObjects: ImportConnection[] = [];

    /**
     * The indices of the connection patches to which each user should be
     * granted access, keyed by username.
     */
    users: Record<string, number[]> = {};

    /** As with users, but keyed by user group identifier. */
    groups: Record<string, number[]> = {};

    /** The group path of each connection, keyed by patch index. */
    groupPaths: Record<number, string | undefined> = {};

    /** The errors of each connection, keyed by patch index. */
    errors: Record<number, ParseError[]> = {};

    hasErrors = false;

    connectionCount = 0;

}

const PARAMETER_SUFFIX = ' (parameter)';
const ATTRIBUTE_SUFFIX = ' (attribute)';
const BINARY_CSV_ERROR_MESSAGE = 'Argument must be a Buffer'.toLowerCase();

/**
 * Splits a semicolon-separated list of identifiers, where semicolons may be
 * escaped with backslashes.
 */
function splitIdentifiers(rawIdentifiers: string | undefined): string[] {

    const identifiers = [''];
    let escaped = false;

    for (const ch of rawIdentifiers || '') {
        if (!escaped && ch === '\\')
            escaped = true;
        else if (!escaped && ch === ';')
            identifiers.push('');
        else {
            identifiers[identifiers.length - 1] += ch;
            escaped = false;
        }
    }

    return identifiers.filter(identifier => identifier.length);

}

/**
 * Returns the set of field names within the given forms.
 */
function fieldNames(forms: { fields: { name: string }[] }[]): Record<string, boolean> {
    const names: Record<string, boolean> = {};
    forms.forEach(form => form.fields.forEach(field => names[field.name] = true));
    return names;
}

/**
 * Service which parses connection import data (CSV, JSON, or YAML) into
 * connections, validating the connections against the existing connection
 * hierarchy and protocol schema.
 */
@Injectable({ providedIn: 'root' })
export class ConnectionParseService {

    private readonly connectionGroupService = inject(ConnectionGroupService);
    private readonly schemaService = inject(SchemaService);

    /**
     * Returns a function which transforms each CSV row into a connection,
     * based on the given header row.
     */
    private async getCSVTransformer(dataSource: string, headerRow: string[]): Promise<(row: string[]) => ImportConnection> {

        const [attributeForms, protocols] = await Promise.all([
            this.schemaService.getConnectionAttributes(dataSource),
            this.schemaService.getProtocols(dataSource)
        ]);

        const attributes = fieldNames(attributeForms);
        const protocolParameters: Record<string, Record<string, boolean>> = {};
        for (const [name, protocol] of Object.entries(protocols))
            protocolParameters[name] = fieldNames(protocol.connectionForms);

        type Getter = (row: string[]) => string | undefined;
        type ValueGetter = (row: string[]) => { type?: 'parameters' | 'attributes', name?: string, value?: string, errors?: ParseError[] };

        let nameGetter: Getter | undefined;
        let protocolGetter: Getter | undefined;
        let groupGetter: Getter | undefined;
        let parentIdentifierGetter: Getter | undefined;
        let usersGetter = (row: string[]): string[] => [];
        let userGroupsGetter = (row: string[]): string[] => [];
        const valueGetters: ValueGetter[] = [];

        const headerSet = new Set<string>();

        headerRow.forEach((rawHeader, index) => {

            const header = rawHeader.trim();
            if (headerSet.has(header))
                throw new ParseError({
                    message: 'Duplicate CSV Header: ' + header,
                    key: 'IMPORT.ERROR_DUPLICATE_CSV_HEADER',
                    variables: { HEADER: header }
                });
            headerSet.add(header);

            const fetch: Getter = row => row[index];

            if (header === 'name')
                nameGetter = fetch;
            else if (header === 'protocol')
                protocolGetter = fetch;
            else if (header === 'group')
                groupGetter = fetch;
            else if (header === 'parentIdentifier')
                parentIdentifierGetter = fetch;
            else if (header === 'users')
                usersGetter = row => splitIdentifiers(fetch(row));
            else if (header === 'groups')
                userGroupsGetter = row => splitIdentifiers(fetch(row));
            else if (header.endsWith(PARAMETER_SUFFIX))
                valueGetters.push(row => ({ type: 'parameters', name: header.replace(PARAMETER_SUFFIX, ''), value: fetch(row) }));
            else if (header.endsWith(ATTRIBUTE_SUFFIX))
                valueGetters.push(row => ({ type: 'attributes', name: header.replace(ATTRIBUTE_SUFFIX, ''), value: fetch(row) }));

            // Determine whether ambiguous headers are attributes or
            // parameters based on the protocol of each row
            else
                valueGetters.push(row => {

                    const value = fetch(row);
                    const protocol = protocolGetter?.(row);
                    if (!value || !protocol || !protocolParameters[protocol])
                        return {};

                    const isAttribute = !!attributes[header];
                    const isParameter = !!protocolParameters[protocol][header];
                    const errors: ParseError[] = [];

                    if (isAttribute && isParameter)
                        errors.push(new ParseError({
                            message: 'Ambiguous CSV Header: ' + header,
                            key: 'IMPORT.ERROR_AMBIGUOUS_CSV_HEADER',
                            variables: { HEADER: header }
                        }));
                    else if (!isAttribute && !isParameter)
                        errors.push(new ParseError({
                            message: 'Invalid CSV Header: ' + header,
                            key: 'IMPORT.ERROR_INVALID_CSV_HEADER',
                            variables: { HEADER: header }
                        }));

                    return { type: isAttribute ? 'attributes' : 'parameters', name: header, value, errors };

                });

        });

        if (!nameGetter)
            throw new ParseError({ message: 'The connection name must be provided', key: 'IMPORT.ERROR_REQUIRED_NAME_FILE' });

        if (!protocolGetter)
            throw new ParseError({ message: 'The connection protocol must be provided', key: 'IMPORT.ERROR_REQUIRED_PROTOCOL_FILE' });

        return row => {

            const connection = new ImportConnection({
                name: nameGetter!(row),
                protocol: protocolGetter!(row),
                parentIdentifier: parentIdentifierGetter?.(row),
                group: groupGetter?.(row),
                users: usersGetter(row),
                groups: userGroupsGetter(row)
            });

            for (const getter of valueGetters) {
                const { type, name, value, errors } = getter(row);
                if (type && name && value)
                    connection[type][name] = value;
                if (errors?.length)
                    connection.errors.push(...errors);
            }

            return connection;

        };

    }

    /**
     * Returns a function which resolves the parent group of each connection,
     * and whether the connection replaces an existing connection.
     */
    private async getTreeTransformer(dataSource: string, importConfig: ConnectionImportConfig):
            Promise<(connection: ImportConnection) => ImportConnection> {

        const rootGroup = await this.connectionGroupService.getConnectionGroupTree(dataSource);

        const groupPathsByIdentifier: Record<string, string> = {};
        const groupIdentifiersByPath: Record<string, string> = {};
        const connectionIdsByGroupAndName: Record<string, Record<string, string>> = {};

        const saveLookups = (prefix: string, group: ConnectionGroup) => {
            const currentPath = prefix + group.name;
            groupPathsByIdentifier[group.identifier!] = currentPath;
            groupIdentifiersByPath[currentPath] = group.identifier!;
            for (const connection of group.childConnections || [])
                (connectionIdsByGroupAndName[group.identifier!] ??= {})[connection.name!] = connection.identifier!;
            for (const child of group.childConnectionGroups || [])
                saveLookups(currentPath + '/', child);
        };
        saveLookups('', rootGroup);

        // Connections within the file, keyed by path, for duplicate detection
        const connectionsInFile = new Set<string>();

        return connection => {

            const providedIdentifier = connection.parentIdentifier;
            let group: string;
            let parentIdentifier: string | undefined;

            if (providedIdentifier && connection.group) {
                connection.errors.push(new ParseError({
                    message: 'Only one of group or parentIdentifier can be set',
                    key: 'IMPORT.ERROR_AMBIGUOUS_PARENT_GROUP'
                }));
                return connection;
            }

            else if (providedIdentifier && !groupPathsByIdentifier[providedIdentifier]) {
                connection.errors.push(new ParseError({
                    message: 'No group with identifier: ' + providedIdentifier,
                    key: 'IMPORT.ERROR_INVALID_GROUP_IDENTIFIER',
                    variables: { IDENTIFIER: providedIdentifier }
                }));
                return connection;
            }

            else if (providedIdentifier) {
                parentIdentifier = providedIdentifier;
                group = groupPathsByIdentifier[providedIdentifier];
            }

            else if (connection.group) {

                group = connection.group as unknown as string;
                if (typeof group !== 'string') {
                    connection.errors.push(new ParseError({
                        message: 'Invalid group type - must be a string',
                        key: 'IMPORT.ERROR_INVALID_GROUP_TYPE'
                    }));
                    return connection;
                }

                // Normalize group path to be relative to the root group
                if (group.startsWith('/'))
                    group = ROOT_CONNECTION_GROUP + group;
                else if (!group.startsWith(ROOT_CONNECTION_GROUP))
                    group = ROOT_CONNECTION_GROUP + '/' + group;
                group = group.split('/').filter(segment => segment.length).join('/');

                parentIdentifier = groupIdentifiersByPath[group];
                if (!parentIdentifier && !importConfig.createMissingGroups) {
                    connection.errors.push(new ParseError({
                        message: 'No group found named: ' + connection.group,
                        key: 'IMPORT.ERROR_INVALID_GROUP',
                        variables: { GROUP: connection.group }
                    }));
                    return connection;
                }

            }

            else {
                parentIdentifier = ROOT_CONNECTION_GROUP;
                group = ROOT_CONNECTION_GROUP;
            }

            const path = group + '/' + connection.name;
            if (connectionsInFile.has(path))
                connection.errors.push(new ParseError({
                    message: 'Duplicate connection in file: ' + path,
                    key: 'IMPORT.ERROR_DUPLICATE_CONNECTION_IN_FILE',
                    variables: { NAME: connection.name, PATH: group }
                }));
            connectionsInFile.add(path);

            const existingIdentifier = parentIdentifier
                ? connectionIdsByGroupAndName[parentIdentifier]?.[connection.name!] : undefined;

            let importMode = ImportMode.CREATE;
            let identifier: string | undefined;

            if (existingIdentifier && importConfig.existingConnectionMode === ExistingConnectionMode.REJECT)
                connection.errors.push(new ParseError({
                    message: 'Rejecting update to existing connection: ' + path,
                    key: 'IMPORT.ERROR_REJECT_UPDATE_CONNECTION',
                    variables: { NAME: connection.name, PATH: group }
                }));
            else if (existingIdentifier) {
                identifier = existingIdentifier;
                importMode = ImportMode.REPLACE;
            }

            return new ImportConnection({ ...connection, importMode, group, identifier, parentIdentifier });

        };

    }

    /**
     * Returns a function which validates the fields of each connection,
     * normalizing parameter values to the declared options of each field.
     */
    private async getFieldTransformer(dataSource: string): Promise<(connection: ImportConnection) => ImportConnection> {

        const protocolSchemas = await this.schemaService.getProtocols(dataSource);

        // Map of protocol to parameter name to lowercase option to option
        const protocols: Record<string, Record<string, Record<string, string> | null>> = {};
        for (const [name, { connectionForms }] of Object.entries(protocolSchemas)) {
            const fieldMap: Record<string, Record<string, string> | null> = protocols[name] = {};
            connectionForms.forEach(({ fields }) => fields.forEach(field => {
                fieldMap[field.name] = field.options
                    ? Object.fromEntries(field.options.map(option => [option.trim().toLowerCase(), option]))
                    : null;
            }));
        }

        return connection => {

            const protocol = connection.protocol;

            if (!protocol)
                connection.errors.push(new ParseError({
                    message: 'Missing required protocol field',
                    key: 'IMPORT.ERROR_REQUIRED_PROTOCOL_CONNECTION'
                }));

            if (!protocol || !protocols[protocol])
                connection.errors.push(new ParseError({
                    message: 'Invalid protocol: ' + protocol,
                    key: 'IMPORT.ERROR_INVALID_PROTOCOL',
                    variables: { PROTOCOL: protocol }
                }));

            if (!connection.name)
                connection.errors.push(new ParseError({
                    message: 'Missing required name field',
                    key: 'IMPORT.ERROR_REQUIRED_NAME_CONNECTION'
                }));

            const users = connection.users as unknown;
            if (users) {
                if (Array.isArray(users))
                    connection.users = users.map(user => String(user).trim());
                else
                    connection.errors.push(new ParseError({
                        message: 'Invalid users list - must be an array',
                        key: 'IMPORT.ERROR_INVALID_USERS_TYPE'
                    }));
            }

            const groups = connection.groups as unknown;
            if (groups) {
                if (Array.isArray(groups))
                    connection.groups = groups.map(group => String(group).trim());
                else
                    connection.errors.push(new ParseError({
                        message: 'Invalid groups list - must be an array',
                        key: 'IMPORT.ERROR_INVALID_USER_GROUPS_TYPE'
                    }));
            }

            if (!protocol || !protocols[protocol])
                return connection;

            for (const [name, value] of Object.entries(connection.parameters)) {
                if (value === null)
                    continue;
                const stringValue = String(value);
                const validOption = protocols[protocol][name]?.[stringValue.toLowerCase().trim()];
                connection.parameters[name] = validOption || stringValue;
            }

            for (const [name, value] of Object.entries(connection.attributes)) {
                if (value !== null)
                    connection.attributes[name] = String(value);
            }

            return connection;

        };

    }

    /**
     * Parses and validates the given connection data, which must already
     * have been decoded into an array of connection-like objects.
     */
    private async parseConnectionData(dataSource: string, importConfig: ConnectionImportConfig, connectionData: unknown,
            transform: (data: any) => ImportConnection): Promise<ParseResult> {

        if (!Array.isArray(connectionData))
            throw new ParseError({ message: 'Import data must be a list of connections', key: 'IMPORT.ERROR_ARRAY_REQUIRED' });

        if (!connectionData.length)
            throw new ParseError({ message: 'The provided file is empty', key: 'IMPORT.ERROR_EMPTY_FILE' });

        const [fieldTransformer, treeTransformer] = await Promise.all([
            this.getFieldTransformer(dataSource),
            this.getTreeTransformer(dataSource, importConfig)
        ]);

        const parseResult = new ParseResult();
        let index = 0;

        for (const data of connectionData) {

            const connection = treeTransformer(fieldTransformer(transform(data)));

            if (connection.errors.length)
                parseResult.hasErrors = true;

            parseResult.connectionObjects.push(connection);

            // Replacing a connection without preserving permissions requires
            // two patches (remove, then add); refer to the second
            if (connection.importMode === ImportMode.REPLACE
                    && importConfig.existingPermissionMode !== ExistingPermissionMode.PRESERVE)
                index++;

            parseResult.groupPaths[index] = connection.group;
            parseResult.errors[index] = connection.errors;

            for (const identifier of connection.users)
                (parseResult.users[identifier] ??= []).push(index);

            for (const identifier of connection.groups)
                (parseResult.groups[identifier] ??= []).push(index);

            index++;
            parseResult.connectionCount++;

        }

        return parseResult;

    }

    async parseCSV(dataSource: string, importConfig: ConnectionImportConfig, csvData: string): Promise<ParseResult> {

        let parsedData: string[][];
        try {
            parsedData = parseCSVData(csvData, { skip_empty_lines: true });
        }
        catch (error: any) {
            console.error(error);
            if (String(error.message).trim().toLowerCase() === BINARY_CSV_ERROR_MESSAGE)
                throw new ParseError({ message: 'CSV binary parse attempt error: ' + error.message, key: 'IMPORT.ERROR_DETECTED_INVALID_TYPE' });
            throw new ParseError({
                message: 'CSV Parse Failure: ' + error.message,
                key: 'IMPORT.ERROR_PARSE_FAILURE_CSV',
                variables: { ERROR: error.message }
            });
        }

        const transformer = await this.getCSVTransformer(dataSource, parsedData.length ? parsedData[0] : []);
        return this.parseConnectionData(dataSource, importConfig, parsedData.slice(1), transformer);

    }

    parseYAML(dataSource: string, importConfig: ConnectionImportConfig, yamlData: string): Promise<ParseResult> {

        let connectionData: unknown;
        try {
            connectionData = parseYAMLData(yamlData);
        }
        catch (error: any) {
            console.error(error);
            return Promise.reject(new ParseError({
                message: 'YAML Parse Failure: ' + error.message,
                key: 'IMPORT.ERROR_PARSE_FAILURE_YAML',
                variables: { ERROR: error.message }
            }));
        }

        return this.parseConnectionData(dataSource, importConfig, connectionData, data => new ImportConnection(data));

    }

    parseJSON(dataSource: string, importConfig: ConnectionImportConfig, jsonData: string): Promise<ParseResult> {

        let connectionData: unknown;
        try {
            connectionData = JSON.parse(jsonData);
        }
        catch (error: any) {
            console.error(error);
            return Promise.reject(new ParseError({
                message: 'JSON Parse Failure: ' + error.message,
                key: 'IMPORT.ERROR_PARSE_FAILURE_JSON',
                variables: { ERROR: error.message }
            }));
        }

        return this.parseConnectionData(dataSource, importConfig, connectionData, data => new ImportConnection(data));

    }

}
