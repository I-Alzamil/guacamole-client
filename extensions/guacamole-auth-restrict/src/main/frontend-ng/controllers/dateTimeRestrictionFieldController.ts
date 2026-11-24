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

import { ChangeDetectionStrategy, Component, DoCheck } from '@angular/core';
import { formatDate } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FieldComponent, FocusDirective, TranslatePipe, Watchers } from 'guacamole-frontend';
import template from '../templates/dateTimeRestrictionField.html';

/**
 * Parses the date and time components of the given string into a Date in
 * the UTC timezone. The input string must be in the format
 * YYYY-MM-DDTHH:mm:ss (zero-padded).
 *
 * @param {String} str
 *     The date+time string to parse.
 *
 * @returns {Date}
 *     A Date object, in the UTC timezone, or null if parsing the provided
 *     string fails.
 */
var parseDate = function parseDate(str) {

    // Parse date, return null if parsing fails
    var parsedDate = new Date(str);
    if (isNaN(parsedDate.getTime()))
        return null;

    return parsedDate;

};

/**
 * Controller for date+time restriction fields.
 */
@Component({
    selector: 'guac-date-time-restriction-field',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FocusDirective, FormsModule, TranslatePipe],
    template
})
export class DateTimeRestrictionFieldController extends FieldComponent implements DoCheck {

    private readonly watchers = new Watchers();

    /**
     * Options which dictate the behavior of the input field model, as defined
     * by https://docs.angularjs.org/api/ng/directive/ngModelOptions
     *
     * @type Object.<String, String>
     */
    modelOptions: any = {

        /**
         * Space-delimited list of events on which the model will be updated.
         *
         * @type String
         */
        updateOn : 'blur',

        /**
         * The time zone to use when reading/writing the Date object of the
         * model.
         *
         * @type String
         */
        timezone : 'UTC'

    };

    /**
     * The value of the field as a Date, if valid.
     *
     * @type Date
     */
    typedValue: Date | null = null;

    /**
     * Returns the value of an <input type="datetime-local"> representing the
     * given Date within the timezone of the model options (UTC), as AngularJS
     * did for date/time inputs bound to Date objects.
     */
    toDateTimeLocal(date: Date | null | undefined): string {
        if (!(date instanceof Date) || isNaN(date.getTime()))
            return '';
        return formatDate(date, "yyyy-MM-dd'T'HH:mm:ss", 'en-US', 'UTC');
    }

    /**
     * Returns a Date representing the value of an
     * <input type="datetime-local"> within the timezone of the model options
     * (UTC), as AngularJS did for date/time inputs bound to Date objects.
     */
    fromDateTimeLocal(value: string): Date | null {
        return value ? parseDate(value + 'Z') : null;
    }

    constructor() {

        super();

        // Update typed value when model is changed
        this.watchers.watch(() => this.model, (model) => {
            this.typedValue = (model ? parseDate(model) : null);
        });

        // Update string value in model when typed value is changed
        this.watchers.watch(() => this.typedValue, (typedValue) => {
            this.model = (typedValue ? formatDate(typedValue, "yyyy-MM-dd'T'HH:mm:ssZ", 'en-US', 'UTC') : '');
        });

    }

    ngDoCheck(): void {
        this.watchers.check();
    }

}
