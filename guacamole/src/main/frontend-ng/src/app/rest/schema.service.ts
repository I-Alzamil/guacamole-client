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
import { AuthenticationService } from '../auth/authentication.service';
import { CacheService } from './cache.service';
import { dataSourceUrl } from './connection.services';
import { Form } from './types/field';
import { Protocol } from './types/model';

/**
 * Service for retrieving schema information (the attributes and parameters
 * which apply to each type of object) via the REST API.
 */
@Injectable({ providedIn: 'root' })
export class SchemaService {

    private readonly authenticationService = inject(AuthenticationService);
    private readonly cacheService = inject(CacheService);

    private get<T>(dataSource: string, resource: string): Promise<T> {
        return this.authenticationService.request({
            cache: this.cacheService.schema,
            method: 'GET',
            url: dataSourceUrl(dataSource) + '/schema/' + resource
        });
    }

    getUserAttributes(dataSource: string): Promise<Form[]> {
        return this.get(dataSource, 'userAttributes');
    }

    getUserPreferenceAttributes(dataSource: string): Promise<Form[]> {
        return this.get(dataSource, 'userPreferenceAttributes');
    }

    getUserGroupAttributes(dataSource: string): Promise<Form[]> {
        return this.get(dataSource, 'userGroupAttributes');
    }

    getConnectionAttributes(dataSource: string): Promise<Form[]> {
        return this.get(dataSource, 'connectionAttributes');
    }

    getSharingProfileAttributes(dataSource: string): Promise<Form[]> {
        return this.get(dataSource, 'sharingProfileAttributes');
    }

    getConnectionGroupAttributes(dataSource: string): Promise<Form[]> {
        return this.get(dataSource, 'connectionGroupAttributes');
    }

    getProtocols(dataSource: string): Promise<Record<string, Protocol>> {
        return this.get(dataSource, 'protocols');
    }

}
