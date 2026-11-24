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

import { Injectable, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { CacheService } from '../rest/cache.service';
import { RequestOptions, RequestService } from '../rest/request.service';
import { RestError, RestErrorType } from '../rest/types/rest-error';
import { LocalStorageService } from '../storage/local-storage.service';

/**
 * The result of a successful authentication attempt.
 */
export interface AuthenticationResult {
    authToken: string;
    username: string;
    dataSource: string;
    availableDataSources: string[];
}

/**
 * The username associated with anonymous users.
 */
export const ANONYMOUS_USERNAME = '';

/**
 * Parameters submitted as part of an authentication attempt.
 */
export type AuthenticationParameters = Record<string, string | string[]>;

/**
 * Events emitted by {@link AuthenticationService}. These replace the
 * guacLogin*, guacLogout, and guacFatalPageError events broadcast via
 * $rootScope within the AngularJS application.
 */
export type AuthenticationEvent =
    | { type: 'loginPending', parameters: AuthenticationParameters }
    | { type: 'login', authToken: string }
    | { type: 'loginFailed', parameters: AuthenticationParameters, error: RestError }
    | { type: 'invalidCredentials', parameters: AuthenticationParameters, error: RestError }
    | { type: 'insufficientCredentials', parameters: AuthenticationParameters, error: RestError }
    | { type: 'fatalPageError', error: RestError }
    | { type: 'logout', authToken: string | null };

const AUTH_TOKEN_STORAGE_KEY = 'GUAC_AUTH_TOKEN';

/**
 * Service for authenticating with the Guacamole REST API and tracking the
 * resulting authentication token.
 */
@Injectable({ providedIn: 'root' })
export class AuthenticationService {

    private readonly cacheService = inject(CacheService);
    private readonly localStorageService = inject(LocalStorageService);
    private readonly requestService = inject(RequestService);

    /**
     * The result of the most recent successful authentication, or null if
     * not authenticated.
     */
    private readonly result = signal<AuthenticationResult | null>(null);

    /**
     * Stream of all authentication-related events.
     */
    readonly events = new Subject<AuthenticationEvent>();

    constructor() {
        this.requestService.fatalErrorHandler = (error) =>
            this.events.next({ type: 'fatalPageError', error });
    }

    private setAuthenticationResult(data: AuthenticationResult | null): void {

        // Clear the currently-stored result and auth token if the last
        // attempt failed
        if (!data) {
            this.result.set(null);
            this.localStorageService.removeItem(AUTH_TOKEN_STORAGE_KEY);
            return;
        }

        this.result.set(data);

        // Persist only the auth token past tab/window closure, and only if
        // not anonymous
        if (data.username !== ANONYMOUS_USERNAME)
            this.localStorageService.setItem(AUTH_TOKEN_STORAGE_KEY, data.authToken);

    }

    /**
     * Makes a request to authenticate a user using the token REST API
     * endpoint, storing the resulting token and emitting events describing
     * the outcome.
     */
    async authenticate(parameters: AuthenticationParameters | Promise<AuthenticationParameters>): Promise<AuthenticationResult> {

        let requestParams: AuthenticationParameters = {};

        try {

            requestParams = await parameters;
            this.events.next({ type: 'loginPending', parameters: requestParams });

            const body = new URLSearchParams();
            for (const [name, value] of Object.entries(requestParams)) {
                for (const item of Array.isArray(value) ? value : [value])
                    body.append(name, item ?? '');
            }

            const data = await this.requestService.request<AuthenticationResult>({
                method: 'POST',
                url: 'api/tokens',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString()
            });

            const currentToken = this.getCurrentToken();

            // If a new token was received, ensure the old token is
            // invalidated, if any, and notify listeners of the new token
            if (data.authToken !== currentToken) {

                if (currentToken)
                    this.revokeToken(currentToken).catch(() => {});

                this.setAuthenticationResult(data);
                this.events.next({ type: 'login', authToken: data.authToken });

            }

            // Update cached authentication result, even if the token remains
            // the same
            else
                this.setAuthenticationResult(data);

            return data;

        }
        catch (e) {

            if (!(e instanceof RestError)) {
                console.error(e);
                throw e;
            }

            // Notify of generic login failure, for any event consumers that
            // wish to handle all types of failures at once
            this.events.next({ type: 'loginFailed', parameters: requestParams, error: e });

            // Request credentials if provided credentials were invalid
            if (e.type === RestErrorType.INVALID_CREDENTIALS) {
                this.events.next({ type: 'invalidCredentials', parameters: requestParams, error: e });
                this.setAuthenticationResult(null);
            }

            // Request more credentials if provided credentials were not enough
            else if (e.type === RestErrorType.INSUFFICIENT_CREDENTIALS) {
                this.events.next({ type: 'insufficientCredentials', parameters: requestParams, error: e });
                this.setAuthenticationResult(null);
            }

            // Abort rendering of page if an internal error occurs
            else if (e.type === RestErrorType.INTERNAL_ERROR)
                this.events.next({ type: 'fatalPageError', error: e });

            throw e;

        }

    }

    /**
     * Re-authenticates using the current token (if any), along with any
     * additional parameters, such as those present in the URL.
     */
    updateCurrentToken(parameters?: AuthenticationParameters): Promise<AuthenticationResult> {

        const httpParameters: AuthenticationParameters = {};

        const token = this.getCurrentToken();
        if (token)
            httpParameters['token'] = token;

        return this.authenticate({ ...httpParameters, ...parameters });

    }

    /**
     * Determines whether the session associated with the given token (or the
     * current token) is still valid.
     */
    getValidity(token?: string): Promise<boolean> {
        return this.request({ method: 'HEAD', url: 'api/session' }, token)
            .then(() => true, () => false);
    }

    /**
     * Revokes the given authentication token, invalidating its session.
     */
    revokeToken(token: string | null): Promise<void> {
        return this.request({ method: 'DELETE', url: 'api/session' }, token);
    }

    login(username: string, password: string): Promise<AuthenticationResult> {
        return this.authenticate({ username, password });
    }

    /**
     * Logs out the current user, revoking their authentication token.
     */
    logout(): Promise<void> {

        const token = this.getCurrentToken();
        this.setAuthenticationResult(null);
        this.cacheService.clearCaches();

        this.events.next({ type: 'logout', authToken: token });

        return this.revokeToken(token);

    }

    isAnonymous(): boolean {
        return this.getCurrentUsername() === ANONYMOUS_USERNAME;
    }

    getCurrentUsername(): string | null {
        return this.result()?.username ?? null;
    }

    getCurrentToken(): string | null {
        return this.result()?.authToken
            ?? this.localStorageService.getItem<string>(AUTH_TOKEN_STORAGE_KEY);
    }

    getDataSource(): string | null {
        return this.result()?.dataSource ?? null;
    }

    getAvailableDataSources(): string[] {
        return this.result()?.availableDataSources ?? [];
    }

    /**
     * Makes an HTTP request, automatically including the given (or current)
     * authentication token via the "Guacamole-Token" header.
     */
    request<T = any>(options: RequestOptions, token?: string | null): Promise<T> {

        token = token || this.getCurrentToken();

        if (token)
            options = { ...options, headers: { 'Guacamole-Token': token, ...options.headers } };

        return this.requestService.request<T>(options);

    }

}
