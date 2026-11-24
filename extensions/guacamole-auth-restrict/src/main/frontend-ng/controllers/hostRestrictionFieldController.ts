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
import { FormsModule } from '@angular/forms';
import { FieldComponent, FocusDirective, TranslatePipe, Watchers } from 'guacamole-frontend';
import { HostRestrictionEntry } from '../types/HostRestrictionEntry';
import template from '../templates/hostRestrictionField.html';

/**
 * Parse the provided string into an array containing the objects that
 * represent each of entries that can then be displayed as a more
 * user-friendly field.
 *
 * @param {String} restrString
 *     The string that contains the restrictions, un-parsed and as stored
 *     in the underlying field.
 *
 * @returns {HostRestrictionEntry[]}
 *     An array of objects that represents each of the entries as parsed
 *     out of the string field, and which can be interpreted by the
 *     AngularJS field for display.
 */
const parseRestrictions = function parseRestrictions(restrString) {

    var restrictions = [];

    // If the string is null, undefined, or empty, just return an empty array
    if (!restrString)
        return restrictions;

    // Set up the RegEx and split the string using the separator.
    var restrArray = restrString.split(";");

    // Loop through split string and process each item
    for (let i = 0; i < restrArray.length; i++) {
        var entry = new HostRestrictionEntry();
        entry.host = restrArray[i];
        restrictions.push(entry);
    }

    return restrictions;

};

/**
 * Parse the restrictions in the field into a string that can be stored
 * in an underlying module.
 *
 * @param {HostRestrictionEntry[]} restrictions
 *     The array of restrictions that will be converted to a string.
 *
 * @returns {String}
 *     The string containing the restriction data that can be stored in e.g.
 *     a database.
 */
const storeRestrictions = function storeRestrictions(restrictions) {
    // If there are no members of the array, just return an empty string.
    if (restrictions === null || restrictions.length < 1)
        return '';

    var restrString = '';
    for (let i = 0; i < restrictions.length; i++) {
        // If any of the properties are not defined, skip this one.
        if (!Object.hasOwn(restrictions[i], 'host')
                || restrictions[i].host === null)
            continue;

        // If this is not the first item, then add a semi-colon separator
        if (restrString.length > 0)
            restrString += ';';

        // Add the current host to the list
        restrString += restrictions[i].host;
    }

    return restrString;

};

/**
 * Controller for host restriction fields, which are used to configure a
 * hostname, IP address, or CIDR range, that this restriction applies to.
 */
@Component({
    selector: 'guac-host-restriction-field',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FocusDirective, FormsModule, TranslatePipe],
    template
})
export class HostRestrictionFieldController extends FieldComponent implements DoCheck {

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
     * The restrictions, as objects, that are used by the HTML template to
     * present the restrictions to the user via the web interface.
     *
     * @type HostRestrictionEntry[]
     */
    restrictions: any = [];

    /**
     * Remove the current entry from the list.
     *
     * @param {HostRestrictionEntry} entry
     *     A restriction entry.
     */
    removeEntry(entry) {
        if (entry === null) {
            return;
        }
        for (let i = 0; i < this.restrictions.length; i++) {
            if (this.restrictions[i] === entry) {
                this.restrictions.splice(i,1);
                return;
            }
        }
    }

    /**
     * Add an empty entry to the restriction list.
     */
    addEntry() {
        this.restrictions.push(new HostRestrictionEntry());
    }

    constructor() {

        super();

        // Update the field when the model changes.
        this.watchers.watch(() => this.model, (model) => {
            this.restrictions = parseRestrictions(model);
        });

        // Update string value in model when web form is changed
        this.watchers.watch(() => this.restrictions, (restrictions) => {
            this.model = storeRestrictions(restrictions);
        }, true);

    }

    ngDoCheck(): void {
        this.watchers.check();
    }

}
