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

import { Routes } from '@angular/router';
import { GuacRouteData } from './app';
import { routeToUserHomePageGuard, updateCurrentTokenGuard, withOptionalRest } from './index/route-guards';

/**
 * Defines a route requiring authentication, with the given title and body
 * CSS class.
 */
function authenticated(data: GuacRouteData): Pick<Routes[number], 'data' | 'canActivate' | 'runGuardsAndResolvers'> {
    return {
        data,
        canActivate: [updateCurrentTokenGuard],
        runGuardsAndResolvers: 'always'
    };
}

/**
 * All routes of the Guacamole web application. URLs match those of the
 * AngularJS application (using hash-based routing) such that existing
 * bookmarks and links continue to work.
 */
export const routes: Routes = [

    // Home screen
    {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./home/home.component').then(m => m.HomeComponent),
        data: { title: 'APP.NAME', bodyClassName: 'home' } satisfies GuacRouteData,
        canActivate: [routeToUserHomePageGuard],
        runGuardsAndResolvers: 'always'
    },

    // Connection import page
    {
        path: 'import/:dataSource/connection',
        loadComponent: () => import('./import/connection-import.component').then(m => m.ConnectionImportComponent),
        ...authenticated({ title: 'APP.NAME', bodyClassName: 'settings' })
    },

    // Connection import file format help page
    {
        path: 'import/connection/file-format-help',
        loadComponent: () => import('./import/connection-import.component').then(m => m.ConnectionImportFileHelpComponent),
        ...authenticated({ title: 'APP.NAME', bodyClassName: 'settings' })
    },

    // Recording player
    {
        path: 'settings/:dataSource/recording/:identifier/:name',
        loadComponent: () => import('./player/player.components').then(m => m.ConnectionHistoryPlayerComponent),
        ...authenticated({ title: 'APP.NAME', bodyClassName: 'settings' })
    },

    // Management screen
    {
        path: 'settings/:dataSource/:tab',
        loadComponent: () => import('./settings/settings-page.component').then(m => m.SettingsPageComponent),
        ...authenticated({ title: 'APP.NAME', bodyClassName: 'settings' })
    },
    {
        path: 'settings/:tab',
        loadComponent: () => import('./settings/settings-page.component').then(m => m.SettingsPageComponent),
        ...authenticated({ title: 'APP.NAME', bodyClassName: 'settings' })
    },

    // Object editors (connection, sharing profile, group, user, user group)
    ...([
        ['connections', () => import('./manage/manage-connection.components').then(m => m.ManageConnectionComponent)],
        ['sharingProfiles', () => import('./manage/manage-connection.components').then(m => m.ManageSharingProfileComponent)],
        ['connectionGroups', () => import('./manage/manage-connection.components').then(m => m.ManageConnectionGroupComponent)],
        ['users', () => import('./manage/manage-user.components').then(m => m.ManageUserComponent)],
        ['userGroups', () => import('./manage/manage-user.components').then(m => m.ManageUserGroupComponent)]
    ] as const).map(([type, loadComponent]) => ({
        matcher: withOptionalRest('manage', ':dataSource', type),
        loadComponent,
        ...authenticated({ title: 'APP.NAME', bodyClassName: 'manage' })
    })),

    // Client view
    {
        path: 'client/:id',
        loadComponent: () => import('./client/client-page.component').then(m => m.ClientPageComponent),
        ...authenticated({ bodyClassName: 'client' })
    },

    // Redirect to home screen if page not found
    {
        path: '**',
        redirectTo: ''
    }

];
