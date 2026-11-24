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

import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { FormComponent } from '../form/form.component';
import { TranslatePipe } from '../locale/translate.pipe';
import { Notification } from './notification';

/**
 * Displays a single notification, including its text, any associated form,
 * progress, countdown, and actions.
 */
@Component({
    selector: 'guac-notification',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormComponent, TranslatePipe],
    template: `
        @let n = notification();
        <form class="notification" [class]="n.className ?? ''" (submit)="submit($event)">

            @if (n.title) {
                <div class="title-bar">
                    <div class="title">{{ n.title | translate }}</div>
                </div>
            }

            <div class="body">

                @if (n.text) {
                    <p class="text">{{ n.text | translate }}</p>
                }

                @if (n.forms) {
                    <div class="parameters">
                        <guac-form [namespace]="n.formNamespace" [content]="n.forms"
                                   [model]="n.formModel" [modelOnly]="true" />
                    </div>
                }

                @if (n.progress; as progress) {
                    <div class="progress">
                        @if (progress.ratio) {
                            <div class="bar" [style.width.%]="progress.ratio * 100"></div>
                        }
                        @if (progress.text) {
                            <div>{{ progress.text | translate: { PROGRESS: progress.value, UNIT: progress.unit } }}</div>
                        }
                    </div>
                }

                @if (n.countdown?.text) {
                    <p class="countdown-text">{{ n.countdown!.text | translate: { REMAINING: timeRemaining() } }}</p>
                }

            </div>

            @if (n.actions?.length) {
                <div class="buttons">
                    @for (action of n.actions; track $index) {
                        <button type="button" [class]="action.className ?? ''" (click)="action.callback()">{{ action.name | translate }}</button>
                    }
                </div>
            }

        </form>
    `
})
export class NotificationComponent {

    readonly notification = input.required<Notification>();

    /** Seconds remaining in the countdown of the notification, if any. */
    readonly timeRemaining = signal(0);

    constructor() {

        let interval: ReturnType<typeof setInterval> | undefined;
        inject(DestroyRef).onDestroy(() => clearInterval(interval));

        // Restart countdown whenever the notification changes
        effect(() => {

            const countdown = this.notification().countdown;
            clearInterval(interval);
            if (!countdown)
                return;

            this.timeRemaining.set(countdown.remaining);
            interval = setInterval(() => {
                this.timeRemaining.update(remaining => remaining - 1);
                if (this.timeRemaining() <= 0) {
                    clearInterval(interval);
                    countdown.callback?.();
                }
            }, 1000);

        });

    }

    submit(event: Event): void {
        event.preventDefault();
        this.notification().formSubmitCallback?.();
    }

}
