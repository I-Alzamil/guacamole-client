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

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslationService, canonicalize, getLanguageDirection, toLanguageTag } from './translation.service';

describe('TranslationService', () => {

    let service: TranslationService;
    let http: HttpTestingController;

    /**
     * Switches to the given language, answering the requests for available
     * languages and translation files with the given data.
     */
    async function use(language: string, translations: Record<string, object>): Promise<void> {

        const done = service.use(language);

        // Requests are issued asynchronously as each promise resolves
        for (let i = 0; i < 10; i++) {
            await Promise.resolve();
            for (const request of http.match(() => true)) {
                if (request.request.url === 'api/languages')
                    request.flush({ en: 'English', ar: 'العربية' });
                else {
                    const key = /translations\/([^.]+)\.json/.exec(request.request.url)![1];
                    request.flush(translations[key] ?? {});
                }
            }
        }

        await done;

    }

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [provideHttpClient(), provideHttpClientTesting()]
        });
        service = TestBed.inject(TranslationService);
        http = TestBed.inject(HttpTestingController);
    });

    it('determines text direction from the language', () => {
        expect(getLanguageDirection('ar')).toBe('rtl');
        expect(getLanguageDirection('he')).toBe('rtl');
        expect(getLanguageDirection('fa_IR')).toBe('rtl');
        expect(getLanguageDirection('en')).toBe('ltr');
        expect(getLanguageDirection('zh_CN')).toBe('ltr');
    });

    it('converts language keys and identifiers', () => {
        expect(toLanguageTag('pt_BR')).toBe('pt-BR');
        expect(canonicalize('guac-full-name')).toBe('GUAC_FULL_NAME');
    });

    it('interpolates ICU messages and follows references', async () => {

        await use('en', {
            en: {
                APP: { NAME: 'Guacamole', COUNT: '{N, plural, one{# user} other{# users}}' },
                HOME: { TITLE: '@:APP.NAME' }
            }
        });

        expect(service.instant('APP.COUNT', { N: 1 })).toBe('1 user');
        expect(service.instant('APP.COUNT', { N: 3 })).toBe('3 users');
        expect(service.instant('HOME.TITLE')).toBe('Guacamole');
        expect(service.instant('MISSING.KEY')).toBe('MISSING.KEY');

    });

    it('updates the document language and direction', async () => {

        await use('ar', {
            en: { APP: { NAME: 'Guacamole', ONLY_ENGLISH: 'English only' } },
            ar: { APP: { NAME: 'جواكامولي', COUNT: '{N, plural, zero{لا شيء} two{اثنان} other{#}}' } }
        });

        const document = TestBed.inject(DOCUMENT);
        expect(document.documentElement.dir).toBe('rtl');
        expect(document.documentElement.lang).toBe('ar');
        expect(service.direction()).toBe('rtl');

        expect(service.instant('APP.NAME')).toBe('جواكامولي');
        expect(service.instant('APP.COUNT', { N: 2 })).toBe('اثنان');

        // Falls back to English for missing strings
        expect(service.instant('APP.ONLY_ENGLISH')).toBe('English only');

    });

    it('falls back to English for malformed translations', async () => {

        await use('ar', {
            en: { APP: { LINKS: '{N, plural, one{link} other{links}}' } },
            ar: { APP: { LINKS: '{N, plurale, uno{x} altri{y}}' } }
        });

        expect(service.instant('APP.LINKS', { N: 2 })).toBe('links');

    });

});
