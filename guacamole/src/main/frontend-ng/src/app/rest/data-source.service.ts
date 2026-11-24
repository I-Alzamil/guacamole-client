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

import { Injectable } from '@angular/core';
import { RestError, RestErrorType } from './types/rest-error';

/**
 * Service which invokes REST API functions across multiple data sources.
 */
@Injectable({ providedIn: 'root' })
export class DataSourceService {

    /**
     * Invokes the given function once for each of the given data sources,
     * passing the data source identifier as the first argument, followed by
     * the given arguments. The returned promise resolves with an object
     * mapping each data source to the result of its invocation. Data sources
     * for which the requested object does not exist are omitted. Any other
     * failure rejects the returned promise.
     */
    async apply<A extends unknown[], R>(fn: (dataSource: string, ...args: A) => Promise<R>,
            dataSources: string[], ...args: A): Promise<Record<string, R>> {

        const results: Record<string, R> = {};

        await Promise.all(dataSources.map(async dataSource => {
            try {
                results[dataSource] = await fn(dataSource, ...args);
            }
            catch (e) {
                if (!(e instanceof RestError) || e.type !== RestErrorType.NOT_FOUND)
                    throw e;
            }
        }));

        return results;

    }

}
