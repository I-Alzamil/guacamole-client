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

import { NAMED_COLORS } from './named-colors';

/**
 * The default 16-color palette of a terminal color scheme.
 */
const DEFAULT_COLORS = [
    '#000000', // Black
    '#993E3E', // Red
    '#3E993E', // Green
    '#99993E', // Brown
    '#3E3E99', // Blue
    '#993E99', // Magenta
    '#3E9999', // Cyan
    '#999999', // White
    '#3E3E3E', // Black
    '#FF6767', // Red
    '#67FF67', // Green
    '#FFFF67', // Brown
    '#6767FF', // Blue
    '#FF67FF', // Magenta
    '#67FFFF', // Cyan
    '#FFFFFF'  // White
];

/**
 * Converts a hexadecimal color ("#RRGGBB") into an X11 color specification
 * ("rgb:RR/GG/BB").
 */
function fromHexColor(color: string): string | null {
    const groups = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(color);
    if (!groups)
        return null;
    return 'rgb:' + groups[1] + '/' + groups[2] + '/' + groups[3];
}

/**
 * Converts an X11 color specification (either "rgb:R/G/B" or a color name)
 * into a hexadecimal color ("#RRGGBB").
 */
function toHexColor(color: string): string | null {

    const toHexComponent = (component: string) => (component + '0').substring(0, 2).toUpperCase();

    const groups = /^rgb:([0-9A-Fa-f]{1,4})\/([0-9A-Fa-f]{1,4})\/([0-9A-Fa-f]{1,4})$/.exec(color);
    if (!groups)
        return NAMED_COLORS[color.toLowerCase()] || null;

    return '#' + toHexComponent(groups[1]) + toHexComponent(groups[2]) + toHexComponent(groups[3]);

}

/**
 * A terminal color scheme, as accepted by the "color-scheme" parameter of
 * the SSH, telnet, and Kubernetes protocols.
 */
export class ColorScheme {

    background = '#000000';

    foreground = '#999999';

    colors: string[] = [...DEFAULT_COLORS];

    /**
     * The string from which this scheme was parsed, if any. Preserved such
     * that unmodified schemes are serialized exactly as provided.
     */
    private originalString?: string;

    /**
     * Returns a copy of the default 16-color palette.
     */
    static defaultPalette(): string[] {
        return [...DEFAULT_COLORS];
    }

    static fromString(str: string): ColorScheme {

        const scheme = new ColorScheme();
        scheme.originalString = str;

        for (const statement of str.split(/;/)) {

            const groups = /^\s*(background|foreground|color([0-9]+))\s*:\s*(\S*)\s*$/.exec(statement);
            if (!groups)
                continue;

            const color = toHexColor(groups[3]);
            if (!color)
                continue;

            if (groups[1] === 'background')
                scheme.background = color;
            else if (groups[1] === 'foreground')
                scheme.foreground = color;
            else
                scheme.colors[parseInt(groups[2])] = color;

        }

        return scheme;

    }

    static equals(a: ColorScheme, b: ColorScheme): boolean {
        return a.foreground === b.foreground
            && a.background === b.background
            && a.colors.length === b.colors.length
            && a.colors.every((color, index) => color === b.colors[index]);
    }

    toString(): string {

        if (this.originalString !== undefined
                && ColorScheme.equals(this, ColorScheme.fromString(this.originalString)))
            return this.originalString;

        let str = 'background: ' + fromHexColor(this.background) + ';\n'
                + 'foreground: ' + fromHexColor(this.foreground) + ';';

        this.colors.forEach((color, index) => {
            str += '\ncolor' + index + ': ' + fromHexColor(color) + ';';
        });

        return str;

    }

}
