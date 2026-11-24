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

import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { RestError, RestErrorType } from './types/rest-error';

/**
 * Cache of the results of GET requests, keyed by URL and parameters. This is
 * the equivalent of an AngularJS $http cache.
 */
export class RequestCache {

    private readonly entries = new Map<string, Promise<unknown>>();

    get<T>(key: string, retrieve: () => Promise<T>): Promise<T> {

        const cached = this.entries.get(key);
        if (cached)
            return cached as Promise<T>;

        // Do not cache failures
        const result = retrieve();
        this.entries.set(key, result);
        result.catch(() => this.entries.delete(key));
        return result;

    }

    removeAll(): void {
        this.entries.clear();
    }

}

/**
 * Description of an HTTP request to be made via {@link RequestService}.
 */
export interface RequestOptions {

    method: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

    url: string;

    params?: Record<string, string | string[] | number | boolean | undefined>;

    /**
     * Additional request headers. A header having the value undefined
     * prevents that header from being sent by default (as with AngularJS
     * $http), such as the "Cache-Control" header normally sent with GET
     * requests.
     */
    headers?: Record<string, string | undefined>;

    body?: unknown;

    /**
     * Cache in which the result of this request should be stored. Only
     * applicable to GET requests.
     */
    cache?: RequestCache;

    responseType?: 'json' | 'text' | 'blob';

}

/**
 * Service for making HTTP requests to the Guacamole REST API. All failures are
 * translated into {@link RestError} where possible, and all requests are
 * represented as Promises.
 */
@Injectable({ providedIn: 'root' })
export class RequestService {

    private readonly http = inject(HttpClient);

    /**
     * Makes the given HTTP request, returning a Promise which resolves with
     * the response body or rejects with a {@link RestError}.
     */
    request<T = any>(options: RequestOptions): Promise<T> {

        if (options.method === 'GET' && options.cache) {
            const key = options.url + '?' + this.toParams(options.params).toString()
                + '#' + (options.headers?.['Guacamole-Token'] || '');
            return options.cache.get(key, () => this.send<T>(options));
        }

        return this.send<T>(options);

    }

    private toParams(params: RequestOptions['params']): HttpParams {
        let httpParams = new HttpParams();
        for (const [name, value] of Object.entries(params || {})) {
            if (value === undefined)
                continue;
            for (const item of Array.isArray(value) ? value : [value])
                httpParams = httpParams.append(name, String(item));
        }
        return httpParams;
    }

    private async send<T>(options: RequestOptions): Promise<T> {

        const requested = options.headers || {};
        let headers = new HttpHeaders(Object.fromEntries(Object.entries(requested)
            .filter((entry): entry is [string, string] => entry[1] !== undefined)));

        // Do not cache the responses of GET requests
        if (options.method === 'GET') {
            for (const name of ['Cache-Control', 'Pragma'])
                if (!(name in requested))
                    headers = headers.set(name, 'no-cache');
        }

        // Use "application/json" content type by default for PATCH requests
        if (options.method === 'PATCH' && !headers.has('Content-Type'))
            headers = headers.set('Content-Type', 'application/json');

        try {
            return await firstValueFrom(this.http.request<T>(options.method, options.url, {
                body: options.body,
                headers,
                params: this.toParams(options.params),
                responseType: (options.responseType || 'json') as 'json'
            }));
        }
        catch (e) {

            if (!(e instanceof HttpErrorResponse))
                throw e;

            // Wrap true error responses within REST Error objects
            if (e.error && typeof e.error === 'object' && !(e.error instanceof ProgressEvent))
                throw new RestError(e.error);

            // Fall back to a generic internal error if the request couldn't
            // even be issued (webapp is down, etc.)
            throw new RestError({ message: 'Unknown failure sending HTTP request' });

        }

    }

    /**
     * Creates a promise error callback which invokes the given callback only
     * if the promise was rejected with a REST error. All other errors are
     * logged.
     */
    createErrorCallback<R>(callback: (error: RestError) => R): (error: unknown) => R | undefined {
        return (error: unknown) => {

            // Invoke given callback ONLY if due to a legitimate REST error
            if (error instanceof RestError)
                return callback(error);

            // Log all other errors
            console.error(error);
            return undefined;

        };
    }

    /**
     * Creates a promise error callback which resolves with the given value if
     * the request failed due to the resource not being found, and rethrows
     * all other errors.
     */
    defaultValue<V>(value: V): (error: unknown) => V | undefined {
        return this.createErrorCallback((error) => {
            if (error.type === RestErrorType.NOT_FOUND)
                return value;
            throw error;
        });
    }

    /**
     * Promise error callback which ignores all REST errors.
     */
    readonly IGNORE = this.createErrorCallback(() => undefined);

    /**
     * Promise error callback which logs all REST errors as warnings.
     */
    readonly WARN = this.createErrorCallback((error) => {
        console.warn(error.type, error.message || error.translatableMessage);
    });

    /**
     * Promise error callback which replaces the entire page with an error
     * notification. This is set by the root application component.
     */
    readonly DIE = this.createErrorCallback((error) => {
        this.fatalErrorHandler?.(error);
        console.error(error.type, error.message || error.translatableMessage);
    });

    /**
     * Handler invoked by {@link DIE}. Set by the authentication service to
     * avoid a circular dependency.
     */
    fatalErrorHandler?: (error: RestError) => void;

}
