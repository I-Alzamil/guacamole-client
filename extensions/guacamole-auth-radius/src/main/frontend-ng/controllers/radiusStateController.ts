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

import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FieldComponent } from 'guacamole-frontend';
import template from '../templates/radiusStateField.html';

/**
 * Controller for the "GUAC_RADIUS_STATE" field which is used to pass
 * the RADIUS server state to maintain the session with the RADIUS
 * server.
 */
@Component({
    selector: 'guac-radius-state-field',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule],
    template
})
export class RadiusStateController extends FieldComponent implements OnInit {

    ngOnInit(): void {

        // Populate the hidden field for the connection state
        this.model = (this.field() as any).radiusState;

    }

}
