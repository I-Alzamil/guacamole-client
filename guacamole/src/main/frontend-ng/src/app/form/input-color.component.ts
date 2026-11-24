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

import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

let nextPaletteId = 0;

/**
 * A color swatch which allows the color to be changed using the browser's
 * native color picker. Content projected into this component is displayed
 * as the swatch's label.
 */
@Component({
    selector: 'guac-input-color',
    changeDetection: ChangeDetectionStrategy.Eager,
    host: {
        'class': 'guac-input-color',
        '[class.dark]': 'isDark()',
        '[style.background-color]': 'model()'
    },
    template: `
        <label>
            <ng-content />
            <input type="color" [value]="model()" [attr.list]="paletteId"
                   (change)="model.set($any($event.target).value.toUpperCase())">
        </label>
        <datalist [id]="paletteId">
            @for (color of palette(); track $index) {
                <option [value]="color.toLowerCase()"></option>
            }
        </datalist>
    `,
    styles: `
        label { display: block; cursor: pointer; }
        input { position: absolute; inline-size: 0; block-size: 0; opacity: 0; border: 0; padding: 0; }
    `
})
export class InputColorComponent {

    /** The current color, in "#RRGGBB" format. */
    readonly model = model.required<string>();

    /** Colors to offer as suggestions within the picker. */
    readonly palette = input<string[]>([]);

    readonly paletteId = 'guac-input-color-palette-' + (nextPaletteId++);

    /**
     * Whether the current color is dark enough that the label should be
     * rendered in a light color.
     */
    readonly isDark = computed(() => {

        const rgb = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(this.model() || '');
        if (!rgb)
            return false;

        const luminance = 0.2126 * parseInt(rgb[1], 16)
                        + 0.7152 * parseInt(rgb[2], 16)
                        + 0.0722 * parseInt(rgb[3], 16);

        // 153 is the component value 0.6 converted from 0-1 to the 0-255 range
        return luminance <= 153;

    });

}
