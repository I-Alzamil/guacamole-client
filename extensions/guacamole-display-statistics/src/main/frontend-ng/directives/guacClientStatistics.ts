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

import { ChangeDetectionStrategy, Component, Input, OnDestroy, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { DigestService, TranslatePipe, patchService } from 'guacamole-frontend';
import template from '../templates/guacClientStatistics.html';

/**
 * A directive which displays frame rendering performance statistics for a
 * Guacamole client.
 */
@Component({
    selector: 'guac-client-statistics',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [NgClass, TranslatePipe],
    template
})
export class GuacClientStatistics implements OnDestroy {

    private readonly digestService = inject(DigestService);

    private currentClient: any = null;

    /**
     * The Guacamole client to display frame rendering statistics for.
     *
     * @type ManagedClient
     */
    @Input()
    set client(client: any) {

        // Assign/remove onstatistics handlers to track the statistics of the
        // current client
        const oldClient = this.currentClient;
        this.currentClient = client;

        if (oldClient)
            oldClient.managedDisplay.display.onstatistics = null;

        client.managedDisplay.display.statisticWindow = 1000;
        client.managedDisplay.display.onstatistics = (stats: any) => this.updateStatistics(stats);

    }

    get client(): any {
        return this.currentClient;
    }

    /**
     * The most recent frame rendering statistics, if any.
     *
     * @type Guacamole.Display.Statistics
     */
    statistics: any = null;

    /**
     * Updates the displayed frame rendering statistics to the values
     * within the given statistics object.
     *
     * @param {!Guacamole.Display.Statistics} stats
     *     An object containing general rendering performance statistics for
     *     the remote desktop, Guacamole server, and Guacamole client.
     */
    private updateStatistics(stats: any): void {
        this.digestService.apply(() => {
            this.statistics = stats;
        });
    }

    /**
     * Returns whether the given value is a defined value that should be
     * rendered within the statistics toolbar.
     *
     * @param {number} value
     *     The value to test.
     *
     * @returns {!boolean}
     *     true if the given value should be rendered within the statistics
     *     toolbar, false otherwise.
     */
    hasValue(value: number): boolean {
        return !!value || value === 0;
    }

    /**
     * Rounds the given numeric value to the nearest hundredth (two decimal places).
     *
     * @param {!number} value
     *     The value to round.
     *
     * @param {!number}
     *     The given value, rounded to the nearest hundredth.
     */
    round(value: number): number {
        return Math.round(value * 100) / 100;
    }

    // Display statistics by default
    isVisible = true;

    // Clear onstatistics handler when directive is being unloaded
    ngOnDestroy(): void {
        if (this.client)
            this.client.managedDisplay.display.onstatistics = null;
    }

}

// Allow use of <guac-client-statistics> within HTML patches
patchService.registerDirective(GuacClientStatistics);
