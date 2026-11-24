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

import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import fuzzysort from 'fuzzysort';
import { AuthenticationService } from '../auth/authentication.service';
import { ViewportComponent } from '../client/client-zoom.component';
import { DigestService } from '../index/digest.service';
import { TranslatePipe } from '../locale/translate.pipe';
import { ClipboardEvent, KeyEvent, TextBatch, formatTime, generateHeatmapPath, parseEventsWithClipboard } from './player-utils';

/**
 * Displays the display of a session recording, scaled to fit. The display
 * is always laid out left-to-right.
 */
@Component({
    selector: 'guac-player-display',
    changeDetection: ChangeDetectionStrategy.Eager,
    host: { dir: 'ltr' },
    template: `
        <div #main class="guac-player-display">
            <div #container class="guac-player-display-container"></div>
        </div>
    `
})
export class PlayerDisplayComponent {

    readonly display = input<Guacamole.Display | null>();

    private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');
    private readonly container = viewChild.required<ElementRef<HTMLElement>>('container');

    constructor() {

        // Attach display, scaling to fit whenever its size changes
        let previous: Guacamole.Display | null = null;
        effect(() => {

            const display = this.display() ?? null;
            const container = this.container().nativeElement;

            if (previous) {
                container.innerHTML = '';
                previous.onresize = null;
            }

            if (display) {
                container.appendChild(display.getElement());
                display.onresize = () => this.fitDisplay();
                this.fitDisplay();
            }

            previous = display;

        });

        const observer = new ResizeObserver(() => this.fitDisplay());
        effect(() => observer.observe(this.main().nativeElement));
        inject(DestroyRef).onDestroy(() => observer.disconnect());

    }

    fitDisplay(): void {

        const display = this.display();
        if (!display)
            return;

        const width = display.getWidth();
        const height = display.getHeight();
        if (!width || !height)
            return;

        const element = this.main().nativeElement;
        display.scale(Math.min(element.offsetWidth / width, element.offsetHeight / height));

    }

}

/**
 * A circular progress indicator.
 */
@Component({
    selector: 'guac-player-progress-indicator',
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
        <div class="guac-player-progress-text">{{ percentage() }}%</div>
        <div class="guac-player-progress-bar-container" [class.past-halfway]="(progress() || 0) > 0.5">
            <div class="guac-player-progress-bar" [style.transform]="barTransform()"></div>
        </div>
    `
})
export class PlayerProgressIndicatorComponent {

    /** Progress as a value between 0 and 1. */
    readonly progress = input<number | null>();

    readonly percentage = computed(() => Math.floor((this.progress() || 0) * 100));
    readonly barTransform = computed(() => 'rotate(' + (360 * (this.progress() || 0) - 45) + 'deg)');

}

/**
 * Displays the text typed during a session recording, allowing the
 * recording to be searched and seeked by typed text.
 */
@Component({
    selector: 'guac-player-text-view',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, TranslatePipe],
    host: { '[class.fullscreen]': 'fullscreen()' },
    template: `
        <div class="guac-player-text-container">
            <div class="text-controls">
                <div class="filter">
                    <input class="search-string" type="text" [ngModel]="searchPhrase()" (ngModelChange)="searchPhrase.set($event)"
                           [placeholder]="'PLAYER.FIELD_PLACEHOLDER_TEXT_BATCH_FILTER' | translate">
                </div>
                <span class="fullscreen-button" (click)="fullscreen.set(!fullscreen())"></span>
            </div>
            @if (searchPhrase().length) {
                <div class="result-count">{{ 'PLAYER.INFO_NUMBER_OF_RESULTS' | translate: { RESULTS: filteredBatches().length } }}</div>
            }
            <div class="text-batches">
                @for (batch of filteredBatches(); track batch) {
                    <div class="text-batch" (click)="seek.emit(batch.events[0].timestamp)">
                        <div class="timestamp">{{ formatTime(batch.events[0].timestamp) }}</div>
                        <div class="text">@for (event of batch.events; track $index) {<span class="key-event"
                                [class.not-typed]="!event.typed" [class.future]="event.timestamp >= (currentPosition() || 0)">{{ event.text }}</span>}</div>
                    </div>
                }
            </div>
        </div>
    `
})
export class PlayerTextViewComponent {

    protected readonly formatTime = formatTime;

    readonly textBatches = input<TextBatch[]>([]);
    readonly currentPosition = input<number | null>();

    /** Emits the timestamp to seek to when a batch is clicked. */
    readonly seek = output<number>();

    readonly searchPhrase = signal('');
    readonly fullscreen = signal(false);

    readonly filteredBatches = computed(() => {
        const phrase = this.searchPhrase();
        const batches = this.textBatches();
        if (!phrase)
            return batches;
        return fuzzysort.go(phrase, batches, { key: 'simpleValue' }).map(result => result.obj);
    });

}

/**
 * The delay after the last mouse movement before the player controls are
 * hidden, in milliseconds.
 */
const MOUSE_CLEANUP_DELAY = 4000;

/** The maximum rate of key events displayed within the heatmap, per ms. */
const KEY_EVENT_RATE_CAP = 12 / 1000;

/** The maximum rate of frames displayed within the heatmap, per ms. */
const FRAME_RATE_CAP = 10 / 1000;

/**
 * A player for Guacamole session recordings, with playback controls, a
 * heatmap of activity, and a searchable log of typed text.
 */
@Component({
    selector: 'guac-player',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, PlayerDisplayComponent, PlayerProgressIndicatorComponent, PlayerTextViewComponent, TranslatePipe],
    host: { '[class.recent-mouse-movement]': 'recentMouseMovement()', '(mousemove)': 'mouseMoved()' },
    template: `
        <div class="guac-player-container">
            <guac-player-display [display]="recording()?.getDisplay()" (click)="togglePlayback()" />
            <guac-player-text-view [hidden]="!showKeyLog()" [textBatches]="textBatches()"
                                   [currentPosition]="seekPosition() ?? playbackPosition()"
                                   (seek)="seekToTimestamp($event)" />
        </div>

        @if (recording(); as recording) {
            <div class="guac-player-controls" [class.paused]="!recording.isPlaying()" [class.playing]="recording.isPlaying()">

                <input class="guac-player-seek" type="range" min="0" step="1" dir="ltr" [max]="recording.getDuration()"
                       [ngModel]="playbackPosition()" (ngModelChange)="beginSeekRequest($event)" (change)="commitSeekRequest()">

                <div class="heat-map">
                    <svg class="frame-events" [attr.viewBox]="'0 0 ' + HEATMAP_WIDTH + ' ' + HEATMAP_HEIGHT" preserveAspectRatio="none">
                        <path [attr.d]="frameHeatmap()" />
                    </svg>
                    <svg class="key-events" [attr.viewBox]="'0 0 ' + HEATMAP_WIDTH + ' ' + HEATMAP_HEIGHT" preserveAspectRatio="none">
                        <path [attr.d]="keyHeatmap()" />
                    </svg>
                    <div class="legend">
                        <span class="frame-events">{{ 'PLAYER.INFO_FRAME_EVENTS_LEGEND' | translate }}</span>
                        <span class="key-events">{{ 'PLAYER.INFO_KEY_EVENTS_LEGEND' | translate }}</span>
                    </div>
                </div>

                <div class="guac-player-buttons">
                    <button class="guac-player-close" [title]="'PLAYER.ACTION_CLOSE' | translate" (click)="closePlayer()"><span class="close-icon"></span></button>
                    @if (!recording.isPlaying()) {
                        <button class="guac-player-play" [title]="'PLAYER.ACTION_PLAY' | translate" (click)="recording.play()"><span class="play-icon"></span></button>
                    } @else {
                        <button class="guac-player-pause" [title]="'PLAYER.ACTION_PAUSE' | translate" (click)="recording.pause()"><span class="pause-icon"></span></button>
                    }
                    <span class="guac-player-position" dir="ltr">{{ formatTime(playbackPosition()) }} / {{ formatTime(recording.getDuration()) }}</span>
                    @if (textBatches().length) {
                        <span class="guac-player-keys" (click)="showKeyLog.set(!showKeyLog())">{{ 'PLAYER.ACTION_SHOW_KEY_LOG' | translate }}</span>
                    } @else {
                        <span class="guac-player-keys disabled">{{ 'PLAYER.INFO_NO_KEY_LOG' | translate }}</span>
                    }
                </div>

            </div>
        }

        @if (operationMessage(); as message) {
            <div class="guac-player-status">
                <guac-player-progress-indicator [progress]="operationProgress()" />
                <p>{{ message | translate }}</p>
                @if (cancelOperation) {
                    <button class="guac-player-button guac-player-cancel" (click)="cancelOperation()">{{ 'PLAYER.ACTION_CANCEL' | translate }}</button>
                }
            </div>
        }
    `
})
export class PlayerComponent {

    private readonly digest = inject(DigestService);
    private readonly router = inject(Router);
    private readonly route = inject(ActivatedRoute);

    protected readonly formatTime = formatTime;

    readonly HEATMAP_HEIGHT = 100;
    readonly HEATMAP_WIDTH = 1000;

    /** The source of the recording (a tunnel or Blob). */
    readonly src = input<Guacamole.Tunnel | Blob | null>();

    readonly recording = signal<Guacamole.SessionRecording | null>(null);
    readonly playbackPosition = signal(0);
    readonly seekPosition = signal<number | null>(null);
    readonly operationMessage = signal<string | null>(null);
    readonly operationProgress = signal(0);
    readonly textBatches = signal<TextBatch[]>([]);
    readonly showKeyLog = signal(false);
    readonly frameHeatmap = signal('');
    readonly keyHeatmap = signal('');
    readonly recentMouseMovement = signal(false);

    /** Cancels the current operation (loading or seeking), if any. */
    cancelOperation: (() => void) | null = null;

    private pendingSeekRequest = false;
    private resumeAfterSeekRequest = false;
    private mouseActivityTimer: ReturnType<typeof setTimeout> | null = null;

    constructor() {

        // Load the recording whenever the source changes (loading reads and
        // replaces the current recording, which must not be tracked)
        effect(() => {
            const src = this.src() ?? null;
            untracked(() => this.load(src));
        });

        inject(DestroyRef).onDestroy(() => {
            const recording = this.recording();
            recording?.pause();
            recording?.abort();
            if (this.mouseActivityTimer !== null)
                clearTimeout(this.mouseActivityTimer);
        });

    }

    /**
     * Loads the recording from the given source, aborting any recording
     * already loaded.
     */
    private load(src: Guacamole.Tunnel | Blob | null): void {

        this.pendingSeekRequest = false;
        this.playbackPosition.set(0);

        const previous = this.recording();
        if (previous) {
            previous.pause();
            previous.abort();
        }

        if (!src) {
            this.recording.set(null);
            return;
        }

        const recording = new Guacamole.SessionRecording(src as any);
        const events = recording as Guacamole.SessionRecording & {
            onkeyevents?: (events: KeyEvent[]) => void,
            onclipboardevents?: (events: ClipboardEvent[]) => void
        };

        const frameTimestamps: number[] = [];
        let keyTimestamps: number[] = [];
        let keyEvents: KeyEvent[] = [];
        let clipboardEvents: ClipboardEvent[] = [];
        const apply = this.digest.apply.bind(this.digest);

        recording.onload = () => apply(() => {
            this.operationMessage.set(null);
            const duration = recording.getDuration();
            this.frameHeatmap.set(generateHeatmapPath(frameTimestamps, duration, FRAME_RATE_CAP, this.HEATMAP_HEIGHT, this.HEATMAP_WIDTH));
            this.keyHeatmap.set(generateHeatmapPath(keyTimestamps, duration, KEY_EVENT_RATE_CAP, this.HEATMAP_HEIGHT, this.HEATMAP_WIDTH));
        });

        recording.onerror = () => apply(() => this.operationMessage.set(null));

        recording.onprogress = (duration: number, current: number) => apply(() => {
            this.operationProgress.set((src as Blob).size ? current / (src as Blob).size : 0);
            frameTimestamps.push(duration);
        });

        recording.onplay = () => apply();
        recording.onpause = () => apply();

        events.onkeyevents = (received) => apply(() => {
            keyEvents = received;
            keyTimestamps = received.map(event => event.timestamp);
            this.textBatches.set(parseEventsWithClipboard(keyEvents, clipboardEvents));
        });

        events.onclipboardevents = (received) => apply(() => {
            clipboardEvents = received;
            this.textBatches.set(parseEventsWithClipboard(keyEvents, clipboardEvents));
        });

        recording.onseek = (position: number, current: number, total: number) => apply(() => {
            if (recording.isPlaying())
                this.playbackPosition.set(position);
            else {
                this.seekPosition.set(position);
                this.operationProgress.set(current / total);
            }
        });

        this.operationMessage.set('PLAYER.INFO_LOADING_RECORDING');
        this.operationProgress.set(0);
        this.cancelOperation = () => {
            recording.abort();
            this.operationMessage.set(null);
        };

        this.recording.set(recording);
        recording.connect();

    }

    /**
     * Pauses playback while the user drags the seek slider, recording
     * whether playback should resume afterwards.
     */
    beginSeekRequest(position: number): void {

        const recording = this.recording();
        if (recording && !this.pendingSeekRequest) {
            this.resumeAfterSeekRequest = recording.isPlaying();
            recording.pause();
        }

        this.pendingSeekRequest = true;
        this.playbackPosition.set(Number(position));

    }

    commitSeekRequest(): void {
        if (this.recording() && this.pendingSeekRequest)
            this.seekToPlaybackPosition();
        this.pendingSeekRequest = false;
    }

    seekToTimestamp(timestamp: number): void {
        this.playbackPosition.set(timestamp);
        this.seekToPlaybackPosition();
    }

    private seekToPlaybackPosition(): void {

        const recording = this.recording()!;

        this.seekPosition.set(null);
        this.operationMessage.set('PLAYER.INFO_SEEK_IN_PROGRESS');
        this.operationProgress.set(0);

        this.cancelOperation = () => {
            recording.cancel();
            this.playbackPosition.set(this.seekPosition() ?? this.playbackPosition());
        };

        if (this.resumeAfterSeekRequest)
            recording.play();

        recording.seek(this.playbackPosition(), () => this.digest.apply(() => {
            this.seekPosition.set(null);
            this.operationMessage.set(null);
        }));

    }

    togglePlayback(): void {
        const recording = this.recording();
        if (!recording)
            return;
        if (recording.isPlaying())
            recording.pause();
        else
            recording.play();
    }

    closePlayer(): void {
        const dataSource = this.route.snapshot.paramMap.get('dataSource') ?? '';
        this.router.navigateByUrl('/settings/' + encodeURIComponent(dataSource) + '/history');
    }

    /**
     * Shows the player controls for a few seconds after the mouse moves.
     */
    mouseMoved(): void {
        if (this.mouseActivityTimer !== null)
            clearTimeout(this.mouseActivityTimer);
        this.recentMouseMovement.set(true);
        this.mouseActivityTimer = setTimeout(() => {
            this.mouseActivityTimer = null;
            this.recentMouseMovement.set(false);
        }, MOUSE_CLEANUP_DELAY);
    }

}

/**
 * The page playing back the session recording identified within the URL.
 */
@Component({
    selector: 'guac-connection-history-player',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [PlayerComponent, ViewportComponent],
    template: `
        <guac-viewport class="settings view connectionHistoryPlayer">
            <guac-player [src]="tunnel" />
        </guac-viewport>
    `
})
export class ConnectionHistoryPlayerComponent {

    readonly tunnel: Guacamole.Tunnel;

    constructor() {

        const params = inject(ActivatedRoute).snapshot.paramMap;
        const recordingURL = 'api/session/data/' + encodeURIComponent(params.get('dataSource')!)
            + '/history/connections/' + encodeURIComponent(params.get('identifier')!)
            + '/logs/' + encodeURIComponent(params.get('name')!);

        this.tunnel = new Guacamole.StaticHTTPTunnel(recordingURL, false, {
            'Guacamole-Token': inject(AuthenticationService).getCurrentToken() ?? ''
        });

    }

}
