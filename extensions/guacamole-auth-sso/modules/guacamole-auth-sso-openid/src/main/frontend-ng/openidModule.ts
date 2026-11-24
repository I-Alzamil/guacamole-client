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

import './transformToken';
import { inject } from '@angular/core';
import { AuthenticationService, run } from 'guacamole-frontend';

/**
 * The module for code implementing SSO using OpenID Connect.
 */

/**
 * Redirect to the SSO logout endpoint when the user logs out, allowing
 * Single Logout to occur if configured.
 */
run(function guacSsoOpenidLogout() {

    // Redirect to SSO logout endpoint when user logs out
    inject(AuthenticationService).events.subscribe(event => {
        if (event.type === 'logout')
            window.location.href = 'api/ext/openid/logout';
    });

});
