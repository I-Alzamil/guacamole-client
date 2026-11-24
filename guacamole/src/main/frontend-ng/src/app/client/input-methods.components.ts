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

import { AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, effect, inject, input, model, signal, viewChild } from '@angular/core';
import { ResizeDirective } from '../element/element.directives';
import { DigestService } from '../index/digest.service';
import { KeyboardEventsService } from '../index/keyboard-events.service';
import { TranslatePipe } from '../locale/translate.pipe';
import { CacheService } from '../rest/cache.service';
import { RequestService } from '../rest/request.service';

/**
 * An on-screen keyboard, using the given layout. The keyboard always uses a
 * left-to-right layout, as it represents a physical keyboard.
 */
@Component({
    selector: 'guac-osk',
    changeDetection: ChangeDetectionStrategy.Eager,
    host: { 'class': 'osk', 'dir': 'ltr' },
    hostDirectives: [ResizeDirective],
    template: ''
})
export class OskComponent {

    /** The URL of the JSON keyboard layout to use. */
    readonly layout = input<string | null>();

    private keyboard: Guacamole.OnScreenKeyboard | null = null;

    constructor() {

        const main = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
        const cacheService = inject(CacheService);
        const keyboardEvents = inject(KeyboardEventsService);
        const requestService = inject(RequestService);

        // Size keyboard to match its container
        inject(ResizeDirective).guacResize.subscribe(() => this.keyboard?.resize(main.offsetWidth));

        // Load the new keyboard layout whenever it changes
        effect(() => {

            const url = this.layout();

            if (this.keyboard) {
                this.keyboard.getElement().remove();
                this.keyboard = null;
            }

            if (!url)
                return;

            requestService.request<Guacamole.OnScreenKeyboard.Layout>({ cache: cacheService.languages, method: 'GET', url })
                .then(layout => {

                    // Ignore layouts which are no longer current
                    if (this.layout() !== url)
                        return;

                    const keyboard = this.keyboard = new Guacamole.OnScreenKeyboard(layout);
                    main.appendChild(keyboard.getElement());
                    keyboard.resize(main.offsetWidth);

                    keyboard.onkeydown = (keysym: number) => keyboardEvents.syntheticKeydown.next(keysym);
                    keyboard.onkeyup = (keysym: number) => keyboardEvents.syntheticKeyup.next(keysym);

                }, () => {});

        });

    }

}

/**
 * A key button which sends the given keysym, optionally remaining pressed
 * ("sticky") until clicked again.
 */
@Component({
    selector: 'guac-key',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [TranslatePipe],
    template: `
        <button class="key" [class.pressed]="pressed()" [class.sticky]="sticky()"
                (mousedown)="updateKey($event)">{{ text() | translate }}</button>
    `
})
export class KeyComponent {

    private readonly keyboardEvents = inject(KeyboardEventsService);

    readonly text = input.required<string>();
    readonly keysym = input.required<number>();
    readonly sticky = input<boolean>(false);
    readonly pressed = model<boolean>(false);

    constructor() {

        // Send keydown/keyup as the pressed state changes
        let wasPressed = false;
        effect(() => {
            const isPressed = this.pressed();
            if (isPressed)
                this.keyboardEvents.syntheticKeydown.next(this.keysym());
            else if (wasPressed)
                this.keyboardEvents.syntheticKeyup.next(this.keysym());
            wasPressed = isPressed;
        });

    }

    updateKey(event: Event): void {

        if (this.sticky())
            this.pressed.set(!this.pressed());
        else {
            this.keyboardEvents.syntheticKeydown.next(this.keysym());
            this.keyboardEvents.syntheticKeyup.next(this.keysym());
        }

        event.preventDefault();

    }

}

/**
 * The number of characters to include on either side of text input content,
 * allowing the user to delete content via backspace and delete.
 */
const TEXT_INPUT_PADDING = 4;

/**
 * The Unicode codepoint of the character used for padding (zero-width
 * space).
 */
const TEXT_INPUT_PADDING_CODEPOINT = 0x200B;

/**
 * Keys which should be allowed through to the client while the text input
 * has focus. All other keys are expected to be handled via text input.
 */
const ALLOWED_KEYS: Record<number, boolean> = {
    0xFE03: true, /* AltGr */
    0xFF08: true, /* Backspace */
    0xFF09: true, /* Tab */
    0xFF0D: true, /* Enter */
    0xFF1B: true, /* Escape */
    0xFF50: true, /* Home */
    0xFF51: true, /* Left */
    0xFF52: true, /* Up */
    0xFF53: true, /* Right */
    0xFF54: true, /* Down */
    0xFF57: true, /* End */
    0xFF64: true, /* Insert */
    0xFFBE: true, 0xFFBF: true, 0xFFC0: true, 0xFFC1: true, /* F1-F4 */
    0xFFC2: true, 0xFFC3: true, 0xFFC4: true, 0xFFC5: true, /* F5-F8 */
    0xFFC6: true, 0xFFC7: true, 0xFFC8: true, 0xFFC9: true, /* F9-F12 */
    0xFFE1: true, /* Left shift */
    0xFFE2: true, /* Right shift */
    0xFFE3: true, /* Left ctrl */
    0xFFE4: true, /* Right ctrl */
    0xFFE9: true, /* Left alt */
    0xFFEA: true, /* Right alt */
    0xFFED: true, /* Left option (Mac) */
    0xFFEE: true, /* Right option (Mac) */
    0xFFFF: true  /* Delete */
};

/**
 * Returns the X11 keysym corresponding to the given Unicode codepoint, or
 * null if no such keysym exists.
 */
function keysymFromCodepoint(codepoint: number): number | null {

    // Keysyms for control characters
    if (codepoint <= 0x1F || (codepoint >= 0x7F && codepoint <= 0x9F))
        return 0xFF00 | codepoint;

    // Keysyms for ASCII chars
    if (codepoint >= 0x0000 && codepoint <= 0x00FF)
        return codepoint;

    // Keysyms for Unicode
    if (codepoint >= 0x0100 && codepoint <= 0x10FFFF)
        return 0x01000000 | codepoint;

    return null;

}

/**
 * A text field which sends typed text to the focused client as individual
 * key events, supporting input methods such as handwriting recognition and
 * IME composition.
 */
@Component({
    selector: 'guac-text-input',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [KeyComponent],
    host: { 'class': 'text-input' },
    template: `
        <div class="text-input-field"><div class="sent-history">@for (text of sentText(); track $index) {<div class="sent-text">{{ text }}</div>}</div><textarea #target rows="1" class="target" autocorrect="off" autocapitalize="off"
                  (focus)="focusGained()" (blur)="hasFocus = false"
                  (compositionstart)="composingText = true" (compositionend)="composingText = false"
                  (input)="inputReceived($event)" (selectstart)="$event.preventDefault()"></textarea></div><div class="text-input-buttons"><guac-key [keysym]="65507" [sticky]="true" text="CLIENT.NAME_KEY_CTRL" [(pressed)]="ctrlPressed" /><guac-key [keysym]="65513" [sticky]="true" text="CLIENT.NAME_KEY_ALT" [(pressed)]="altPressed" /><guac-key [keysym]="65307" text="CLIENT.NAME_KEY_ESC" /><guac-key [keysym]="65289" text="CLIENT.NAME_KEY_TAB" /></div>
    `
})
export class TextInputComponent implements AfterViewInit {

    private readonly digest = inject(DigestService);
    private readonly keyboardEvents = inject(KeyboardEventsService);

    private readonly target = viewChild.required<ElementRef<HTMLTextAreaElement>>('target');

    /** Recently-sent text, displayed briefly as feedback. */
    readonly sentText = signal<string[]>([]);

    readonly altPressed = signal(false);
    readonly ctrlPressed = signal(false);

    hasFocus = false;

    /** Whether text is currently being composed via an IME. */
    composingText = false;

    constructor() {

        // Block all keys which are not explicitly allowed while focused, as
        // they will be handled via text input instead
        const filter = (event: { keysym: number, preventDefault(): void }) => {
            if (this.hasFocus && !ALLOWED_KEYS[event.keysym])
                event.preventDefault();
        };

        const subscriptions = [
            this.keyboardEvents.beforeKeydown.subscribe(filter),
            this.keyboardEvents.beforeKeyup.subscribe(filter)
        ];

        inject(DestroyRef).onDestroy(() => subscriptions.forEach(subscription => subscription.unsubscribe()));

    }

    ngAfterViewInit(): void {
        this.target().nativeElement.focus();
    }

    focusGained(): void {
        this.hasFocus = true;
        this.resetTextInputTarget(TEXT_INPUT_PADDING);
    }

    private sendKeysym(keysym: number): void {
        this.keyboardEvents.syntheticKeydown.next(keysym);
        this.keyboardEvents.syntheticKeyup.next(keysym);
    }

    private releaseStickyKeys(): void {
        this.altPressed.set(false);
        this.ctrlPressed.set(false);
    }

    private sendCodepoint(codepoint: number): void {

        // Map newlines to Enter
        if (codepoint === 10) {
            this.sendKeysym(0xFF0D);
            this.releaseStickyKeys();
            return;
        }

        const keysym = keysymFromCodepoint(codepoint);
        if (keysym) {
            this.sendKeysym(keysym);
            this.releaseStickyKeys();
        }

    }

    private sendString(content: string): void {

        let sentText = '';

        // Send each codepoint within the string
        for (const character of content) {
            const codepoint = character.codePointAt(0)!;
            if (codepoint !== TEXT_INPUT_PADDING_CODEPOINT) {
                sentText += character;
                this.sendCodepoint(codepoint);
            }
        }

        // Display the text that was sent briefly
        this.sentText.update(texts => [...texts, sentText]);
        setTimeout(() => this.digest.apply(() => this.sentText.update(texts => texts.slice(1))), 1000);

    }

    /**
     * Removes all content from the text input target, replacing it with the
     * given number of padding characters on either side of the cursor.
     */
    private resetTextInputTarget(padding: number): void {
        const target = this.target().nativeElement;
        target.value = String.fromCharCode(TEXT_INPUT_PADDING_CODEPOINT).repeat(padding * 2);
        target.setSelectionRange(padding, padding);
    }

    inputReceived(e: Event): void {

        // Ignore input events during text composition
        if (this.composingText)
            return;

        const target = this.target().nativeElement;
        const content = target.value;
        const expectedLength = TEXT_INPUT_PADDING * 2;

        // If some text has been deleted, send backspace/delete accordingly
        if (content.length < expectedLength) {

            const backspaceCount = TEXT_INPUT_PADDING - (target.selectionStart ?? 0);
            for (let i = 0; i < backspaceCount; i++)
                this.sendKeysym(0xFF08);

            const deleteCount = expectedLength - content.length - backspaceCount;
            for (let i = 0; i < deleteCount; i++)
                this.sendKeysym(0xFFFF);

        }

        // Otherwise, send all text within the target
        else
            this.sendString(content);

        this.resetTextInputTarget(TEXT_INPUT_PADDING);
        e.preventDefault();

    }

}
