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
import { CanActivateFn, Router, RouterStateSnapshot, UrlMatchResult, UrlSegment } from '@angular/router';
import { filter } from 'rxjs';
import { AuthenticationService } from '../auth/authentication.service';
import { UserPageService } from '../navigation/user-page.service';

/**
 * Tracks the URL of the most recent navigation attempt, such that the
 * attempt can be retried once the user has logged in. Navigation which fails
 * due to missing credentials is cancelled, leaving the router at its prior
 * URL.
 */
@Injectable({ providedIn: 'root' })
export class PendingNavigationService {

    private url = '/';

    constructor() {
        const router = inject(Router);
        inject(AuthenticationService).events.pipe(filter(event => event.type === 'login'))
            .subscribe(() => router.navigateByUrl(this.url, { onSameUrlNavigation: 'reload' }));
    }

    setUrl(url: string): void {
        this.url = url;
    }

    reset(): void {
        this.url = '/';
    }

}

/**
 * Re-authenticates using the current token, including any parameters within
 * the URL, before allowing navigation to proceed.
 */
function updateCurrentToken(state: RouterStateSnapshot): Promise<boolean> {

    inject(PendingNavigationService).setUrl(state.url);

    const router = inject(Router);
    const authenticationService = inject(AuthenticationService);
    const queryParams = router.parseUrl(state.url).queryParams;

    return authenticationService.updateCurrentToken(queryParams).then(() => true, () => false);

}

/**
 * Guard which ensures the user is authenticated prior to viewing the page.
 */
export const updateCurrentTokenGuard: CanActivateFn = (route, state) => updateCurrentToken(state);

/**
 * Guard which ensures the user is authenticated, redirecting to the user's
 * home page if the requested page is not their home page.
 */
export const routeToUserHomePageGuard: CanActivateFn = async (route, state) => {

    const router = inject(Router);
    const userPageService = inject(UserPageService);

    if (!await updateCurrentToken(state))
        return false;

    try {
        const homePage = await userPageService.getHomePage();
        const path = router.parseUrl(state.url).root.children['primary']?.segments.map(s => s.path).join('/') ?? '';

        // If home page is the requested location, allow through
        if ('/' + path === homePage.url)
            return true;

        return router.parseUrl(homePage.url);
    }

    // If retrieval of home page fails, assume requested page is OK
    catch {
        return true;
    }

};

/**
 * Creates a URL matcher which matches the given fixed path segments,
 * followed by an optional identifier which may itself contain slashes (the
 * equivalent of the AngularJS route parameter syntax ":id*?").
 */
export function withOptionalRest(...segments: string[]) {
    return (url: UrlSegment[]): UrlMatchResult | null => {

        if (url.length < segments.length)
            return null;

        const posParams: Record<string, UrlSegment> = {};
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            if (segment.startsWith(':'))
                posParams[segment.substring(1)] = url[i];
            else if (segment !== url[i].path)
                return null;
        }

        const rest = url.slice(segments.length);
        if (rest.length)
            posParams['id'] = new UrlSegment(rest.map(s => s.path).join('/'), {});

        return { consumed: url, posParams };

    };
}
