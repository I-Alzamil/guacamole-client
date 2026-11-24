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

/*
 * NOTE: This session recording player implementation is based on the Session
 * Recording Player for Glyptodon Enterprise which is available at
 * https://github.com/glyptodon/glyptodon-enterprise-player under the
 * following license:
 *
 * Copyright (C) 2019 Glyptodon, Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

import { path } from 'd3-path';
import { curveCatmullRom } from 'd3-shape';

/**
 * Formats the given number of milliseconds as a human-readable duration in
 * the form "H:MM:SS" (or "M:SS" for durations under an hour).
 */
export function formatTime(value: number | null | undefined): string {

    let remaining = Math.floor((value || 0) / 1000);

    // Split into days, hours, minutes, and seconds
    const groups: (number | string)[] = [1, 24, 60, 60];
    for (let i = groups.length - 1; i >= 0; i--) {
        const placeValue = groups[i] as number;
        const digit = remaining % placeValue;
        groups[i] = digit > 9 ? digit : '0' + digit;
        remaining = Math.floor(remaining / placeValue);
    }

    // Strip leading zero groups, but always include minutes and seconds
    return /^[0:]*([0-9]{1,2}(?::[0-9]{2})+)$/.exec(groups.join(':'))![1];

}

/**
 * A key event as produced by Guacamole.KeyEventInterpreter.
 */
export interface KeyEvent {
    timestamp: number;
    pressed: boolean;
    definition: { keysym: number, name: string, value?: string };
}

/**
 * A clipboard event as produced by Guacamole.SessionRecording.
 */
export interface ClipboardEvent {
    timestamp: number;
    data?: string;
}

/**
 * One or more consecutive keystrokes, displayed as a unit.
 */
export interface ConsolidatedKeyEvent {

    /** The text representing the keystrokes. */
    text: string;

    /** Whether the keystrokes produced text (as opposed to key names). */
    typed: boolean;

    timestamp: number;

}

/**
 * A batch of key events occurring close together in time.
 */
export interface TextBatch {

    events: ConsolidatedKeyEvent[];

    /** The plain text of all events within the batch, for searching. */
    simpleValue: string;

}

/**
 * Keysyms for which the key name should be printed alongside the value of
 * the key itself.
 */
const PRINT_NAME_TOO_KEYS: Record<number, boolean> = {
    0xFF09: true, // Tab
    0xFF0D: true, // Return
    0xFF8D: true  // Enter
};

/**
 * Keysyms of modifier keys which, when held, cause other keys to be
 * displayed as keyboard shortcuts.
 */
const SHORTCUT_KEYS: Record<number, boolean> = {
    0xFFE3: true, // Left Control
    0xFFE4: true, // Right Control
    0xFFE7: true, // Left Command (Mac)
    0xFFE8: true, // Right Command (Mac)
    0xFFE9: true, // Left Alt
    0xFFEA: true, // Right Alt
    0xFFEB: true, // Left Super
    0xFFEC: true, // Right Super
    0xFFED: true, // Left Option (Mac)
    0xFFEE: true  // Right Option (Mac)
};

/**
 * Keysyms of all modifier keys, which are not displayed by themselves.
 */
const MODIFIER_KEYS: Record<number, boolean> = {
    0xFFE1: true, // Left Shift
    0xFFE2: true, // Right Shift
    ...SHORTCUT_KEYS
};

const formatKeyName = (name: string) => '<' + name + '>';

/**
 * Groups the given key and clipboard events into batches of text for
 * display. Events separated by more than the given number of milliseconds
 * begin a new batch.
 */
export function parseEventsWithClipboard(rawKeyEvents: KeyEvent[] | null, clipboardEvents: ClipboardEvent[] | null,
        batchSeparation = 5000, consolidateEvents = false): TextBatch[] {

    type Event = (KeyEvent & { isClipboard?: false }) | { isClipboard: true, timestamp: number, data?: string };

    const allEvents: Event[] = [
        ...(rawKeyEvents || []),
        ...(clipboardEvents || []).map(event => ({ isClipboard: true as const, timestamp: event.timestamp, data: event.data }))
    ].sort((a, b) => a.timestamp - b.timestamp);

    const pressedKeys = new Map<number, KeyEvent['definition']>();
    const batches: TextBatch[] = [{ events: [], simpleValue: '' }];
    let lastEventTime = 0;

    for (const event of allEvents) {

        const { timestamp } = event;
        if (batchSeparation >= 0 && (timestamp - lastEventTime) >= batchSeparation)
            batches.push({ events: [], simpleValue: '' });
        lastEventTime = timestamp;

        const currentBatch = batches[batches.length - 1];

        const pushEvent = (text: string, typed: boolean) => {
            const latestEvent = currentBatch.events[currentBatch.events.length - 1];
            if (consolidateEvents && latestEvent && latestEvent.typed === typed)
                latestEvent.text += text;
            else
                currentBatch.events.push({ text, typed, timestamp });
            currentBatch.simpleValue += text;
        };

        if (event.isClipboard) {
            pushEvent('[Clipboard: ' + (event.data || '').substring(0, 50) + ']', false);
            continue;
        }

        const { definition, pressed } = event;
        const { keysym, name, value } = definition;

        // Track modifier state, but do not display modifiers by themselves
        if (MODIFIER_KEYS[keysym]) {
            if (pressed)
                pressedKeys.set(keysym, definition);
            else
                pressedKeys.delete(keysym);
        }

        else if (pressed) {

            // Display keyboard shortcuts as the names of all keys involved
            if ([...pressedKeys.keys()].some(key => SHORTCUT_KEYS[key])) {
                const names = [...pressedKeys.values()].map(pressedKey => pressedKey.name);
                pushEvent('<' + [...names, name].join('+') + '>', false);
            }

            else if (value !== undefined) {
                if (PRINT_NAME_TOO_KEYS[keysym])
                    pushEvent(formatKeyName(name), false);
                pushEvent(value, true);
            }

            else
                pushEvent(formatKeyName(name), false);

        }

    }

    return batches.filter(batch => batch.events.length > 0);

}

/**
 * A Gaussian kernel used to smooth heatmap data.
 */
const GAUSSIAN_KERNEL = [0.0013, 0.1573, 0.6827, 0.1573, 0.0013];

/**
 * The number of buckets into which heatmap data is grouped.
 */
const NUM_BUCKETS = 100;

function smooth(values: number[]): number[] {
    const lookBack = Math.floor(GAUSSIAN_KERNEL.length / 2);
    return values.map((value, index) => GAUSSIAN_KERNEL.reduce((total, weight, kernelIndex) => {
        const valuesIndex = index + kernelIndex - lookBack;
        const contribution = (valuesIndex >= 0 && valuesIndex < values.length) ? values[valuesIndex] : value;
        return total + contribution * weight;
    }, 0));
}

/**
 * Generates an SVG path describing a smoothed heatmap of the given event
 * timestamps over the given duration, with the rate of events capped at the
 * given number of events per millisecond.
 */
export function generateHeatmapPath(timestamps: number[], duration: number, maxRate: number,
        height: number, width: number): string {

    if (!height || !width || !timestamps.length || duration <= 0)
        return '';

    const buckets: number[] = new Array(NUM_BUCKETS).fill(0);
    const bucketDuration = duration / NUM_BUCKETS;
    const maxPossibleBucketValue = Math.max(Math.floor(bucketDuration * maxRate), 1);

    let maxBucketValue = 0;
    let currentBucketIndex = 0;

    for (const timestamp of timestamps) {

        // Timestamps are sorted, so the bucket index only increases
        if (timestamp >= (currentBucketIndex + 1) * bucketDuration)
            currentBucketIndex = Math.min(Math.floor(timestamp / bucketDuration), NUM_BUCKETS - 1);

        buckets[currentBucketIndex] = Math.min(buckets[currentBucketIndex] + 1, maxPossibleBucketValue);
        maxBucketValue = Math.max(maxBucketValue, buckets[currentBucketIndex]);

    }

    const data = smooth(buckets);
    const scaleY = (y: number) => height - (y * height / maxBucketValue);
    const xScale = width / data.length;

    const curvedPath = path();
    const curve = curveCatmullRom(curvedPath);
    curve.lineStart();
    data.forEach((y, i) => curve.point(xScale * i, scaleY(y)));
    curve.lineEnd();
    curvedPath.lineTo(width, scaleY(0));

    // Start at the origin rather than at the first data point, such that
    // the area beneath the curve can be filled
    return 'M0,' + scaleY(0) + 'L0,' + scaleY(data[0]) + curvedPath.toString().replace(/^[^C]*/, '');

}
