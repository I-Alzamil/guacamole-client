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

import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FocusDirective } from '../element/focus.directive';
import { FieldComponent } from './field-component';

/**
 * Regions (the portion of an IANA time zone name prior to the first slash)
 * which are offered for selection.
 */
const REGIONS = ['Africa', 'America', 'Antarctica', 'Arctic', 'Asia', 'Atlantic',
    'Australia', 'Europe', 'Indian', 'Pacific'];

/**
 * All time zones known to the browser, grouped by region, with each time zone
 * mapped from its human-readable name to its IANA identifier.
 */
function getTimeZones(): Record<string, Record<string, string>> {

    const timeZones: Record<string, Record<string, string>> = {};
    for (const region of REGIONS)
        timeZones[region] = {};

    timeZones['GMT'] = { 'UTC': 'UTC' };

    for (const zone of Intl.supportedValuesOf('timeZone')) {
        const slash = zone.indexOf('/');
        const region = zone.substring(0, slash);
        if (region in timeZones)
            timeZones[region][zone.substring(slash + 1).replace(/_/g, ' ').replace(/\//g, ' / ')] = zone;
    }

    return timeZones;

}

/**
 * Field whose value is an IANA time zone, selected first by region and then
 * by specific time zone.
 */
@Component({
    selector: 'guac-time-zone-field',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, FocusDirective],
    host: { class: 'time-zone-field' },
    template: `
        <select class="time-zone-region" [id]="fieldId()" [disabled]="disabled()"
                [guacFocus]="focused()" [ngModel]="region()" (ngModelChange)="region.set($event)">
            @for (name of regions; track name) {
                <option [ngValue]="name">{{ name }}</option>
            }
        </select>
        <select class="time-zone" [attr.name]="field().name" [(ngModel)]="model"
                [disabled]="disabled() || !region()">
            @for (zone of zonesInRegion(); track zone.value) {
                <option [ngValue]="zone.value">{{ zone.name }}</option>
            }
        </select>
    `
})
export class TimeZoneFieldComponent extends FieldComponent implements OnInit {

    readonly timeZones = getTimeZones();

    readonly regions = Object.keys(this.timeZones).sort();

    readonly region = signal('');

    ngOnInit(): void {

        // Include the current value even if not known to the browser (it may
        // be a legacy alias)
        const model = this.model;
        if (model) {
            const region = model.includes('/') ? model.substring(0, model.indexOf('/')) : 'GMT';
            this.timeZones[region] ??= {};
            if (!Object.values(this.timeZones[region]).includes(model))
                this.timeZones[region][model.substring(model.indexOf('/') + 1).replace(/_/g, ' ')] = model;
            this.region.set(region);
        }

    }

    zonesInRegion(): { name: string, value: string }[] {
        return Object.entries(this.timeZones[this.region()] || {})
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

}
