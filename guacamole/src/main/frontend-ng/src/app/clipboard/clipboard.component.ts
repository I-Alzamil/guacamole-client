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

import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '../locale/translate.pipe';
import { ClipboardData, ClipboardService } from './clipboard.service';

/**
 * An editor for the shared clipboard contents. The contents are hidden until
 * explicitly revealed by the user.
 */
@Component({
    selector: 'guac-clipboard',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [TranslatePipe],
    host: { class: 'clipboard-editor' },
    template: `
        <textarea #editor class="clipboard" [class.clipboard-contents-hidden]="!contentsShown()"
                  [disabled]="!contentsShown()" (input)="update()" (change)="update()"></textarea>
        @if (!contentsShown()) {
            <div class="clipboard-contents-hidden-hint" (click)="showContents()">
                <p class="clipboard-contents-hidden-hint-text">{{ 'CLIENT.ACTION_SHOW_CLIPBOARD' | translate }}</p>
            </div>
        }
    `
})
export class ClipboardComponent {

    private readonly clipboardService = inject(ClipboardService);

    private readonly editor = viewChild.required<ElementRef<HTMLTextAreaElement>>('editor');

    readonly contentsShown = signal(false);

    constructor() {

        const subscription = this.clipboardService.clipboardChanged.subscribe(data => this.updateEditor(data));
        inject(DestroyRef).onDestroy(() => subscription.unsubscribe());

        this.clipboardService.getClipboard().then(data => this.updateEditor(data), () => {});

    }

    showContents(): void {
        this.contentsShown.set(true);
        setTimeout(() => this.editor().nativeElement.focus(), 0);
    }

    update(): void {
        this.clipboardService.setClipboard({ type: 'text/plain', data: this.editor().nativeElement.value });
    }

    private updateEditor(data: ClipboardData): void {
        if (typeof data.data === 'string')
            this.editor().nativeElement.value = data.data;
    }

}
