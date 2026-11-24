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

import { Injectable } from '@angular/core';

/**
 * Tiny test images of each image format which may be supported by the
 * browser, as base64 data.
 */
const TEST_IMAGES: Record<string, string> = {

    // Safari, Chrome, Firefox, and Edge all support JPEG and PNG
    'image/jpeg':
          '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoH'
        + 'BwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQME'
        + 'BAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU'
        + 'FBQUFBQUFBQUFBQUFBT/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAA'
        + 'AAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAA'
        + 'AAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AVMH/2Q==',

    'image/png':
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEX///+nxBvI'
        + 'AAAACklEQVQI12NgAAAAAgAB4iG8MwAAAABJRU5ErkJggg==',

    // Firefox and Chrome support WebP
    'image/webp': 'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=='

};

/**
 * Service which determines the audio, video, and image formats supported by
 * the browser, such that the server can be informed during the connection
 * handshake.
 */
@Injectable({ providedIn: 'root' })
export class MediaService {

    /** All audio mimetypes supported by Guacamole.AudioPlayer. */
    readonly supportedAudio: string[] = Guacamole.AudioPlayer.getSupportedTypes();

    /** All video mimetypes supported by Guacamole.VideoPlayer. */
    readonly supportedVideo: string[] = Guacamole.VideoPlayer.getSupportedTypes();

    private readonly supportedImages: Promise<string[]> = Promise.all(
        Object.entries(TEST_IMAGES).map(([mimetype, data]) => new Promise<string | null>(resolve => {
            const image = new Image();
            image.onload = image.onerror = () => resolve(image.width === 1 && image.height === 1 ? mimetype : null);
            image.src = 'data:' + mimetype + ';base64,' + data;
        }))
    ).then(results => results.filter((mimetype): mimetype is string => !!mimetype));

    /**
     * Returns all image mimetypes supported by the browser.
     */
    getSupportedImages(): Promise<string[]> {
        return this.supportedImages;
    }

}

/**
 * Service for controlling browser fullscreen mode. While in fullscreen mode,
 * the keyboard is locked (where supported) such that key combinations
 * normally intercepted by the browser are passed through to the remote
 * desktop.
 */
@Injectable({ providedIn: 'root' })
export class FullscreenService {

    constructor() {
        const keyboard = (navigator as Navigator & { keyboard?: { lock(): void, unlock(): void } }).keyboard;
        if (keyboard?.lock) {
            document.addEventListener('fullscreenchange', () => {
                if (document.fullscreenElement)
                    keyboard.lock();
                else
                    keyboard.unlock();
            });
        }
    }

    isInFullscreenMode(): boolean {
        return !!document.fullscreenElement;
    }

    setFullscreenMode(state: boolean): void {
        if (!document.fullscreenEnabled)
            return;
        if (state && !this.isInFullscreenMode())
            document.documentElement.requestFullscreen();
        else if (!state && this.isInFullscreenMode())
            document.exitFullscreen();
    }

    toggleFullscreenMode(): void {
        this.setFullscreenMode(!this.isInFullscreenMode());
    }

}
