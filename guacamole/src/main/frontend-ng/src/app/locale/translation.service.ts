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

import { Direction } from '@angular/cdk/bidi';
import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import { CacheService } from '../rest/cache.service';
import { LanguageService } from '../rest/language.service';
import { RequestService } from '../rest/request.service';
import { MessageFunction, compileMessage } from './message-format';

/**
 * The language used when a translation string is not defined within the
 * current language.
 */
const FALLBACK_LANGUAGE = 'en';

/**
 * Prefix denoting a translation string which is a reference to another
 * translation string (an angular-translate convention preserved by all
 * Guacamole translation files).
 */
const REFERENCE_PREFIX = '@:';

/**
 * Primary language subtags of languages written right-to-left. Used only if
 * the browser does not support Intl.Locale text info.
 */
const RTL_LANGUAGES = new Set(['ar', 'arc', 'ckb', 'dv', 'fa', 'he', 'iw', 'ku', 'ps', 'sd', 'ug', 'ur', 'yi']);

type TranslationTable = Record<string, string>;

/**
 * Converts a Guacamole language key (such as "pt_BR") into a BCP 47 language
 * tag (such as "pt-BR").
 */
export function toLanguageTag(key: string): string {
    return key.replace(/_/g, '-');
}

/**
 * Determines the text direction of the language having the given key.
 */
export function getLanguageDirection(key: string): Direction {

    const tag = toLanguageTag(key);

    try {
        const locale = new Intl.Locale(tag) as Intl.Locale & {
            getTextInfo?: () => { direction: string },
            textInfo?: { direction: string }
        };
        const textInfo = locale.getTextInfo?.() ?? locale.textInfo;
        if (textInfo)
            return textInfo.direction === 'rtl' ? 'rtl' : 'ltr';
    }
    catch { /* Invalid tag - fall through to static list */ }

    return RTL_LANGUAGES.has(tag.split('-')[0].toLowerCase()) ? 'rtl' : 'ltr';

}

/**
 * Converts an identifier into a form suitable for use within translation
 * keys: all non-alphanumeric characters become underscores, and all letters
 * are uppercase.
 */
export function canonicalize(identifier: string): string {
    return identifier.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase();
}

/**
 * Service providing translation of strings using the translation files served
 * by the Guacamole server (which include strings from installed extensions),
 * with ICU MessageFormat interpolation. The direction (LTR/RTL) and language
 * of the document are kept in sync with the active language.
 */
@Injectable({ providedIn: 'root' })
export class TranslationService {

    private readonly document = inject(DOCUMENT);
    private readonly cacheService = inject(CacheService);
    private readonly languageService = inject(LanguageService);
    private readonly requestService = inject(RequestService);

    private readonly buildIdentifier =
        this.document.querySelector<HTMLMetaElement>('meta[name="build"]')?.content;

    private table: TranslationTable = {};
    private fallbackTable: TranslationTable = {};
    private compiled = new Map<string, MessageFunction | null>();

    /**
     * The key of the language whose translations are currently in use.
     */
    readonly language = signal<string>(FALLBACK_LANGUAGE);

    /**
     * The text direction of the current language.
     */
    readonly direction = computed<Direction>(() => getLanguageDirection(this.language()));

    /**
     * Incremented each time translations are (re)loaded, such that anything
     * reading translations reactively is re-evaluated.
     */
    readonly version = signal(0);

    /**
     * Whether translations have been loaded at least once.
     */
    readonly ready = computed(() => this.version() > 0);

    /**
     * The most recently requested language key. Used to ignore stale loads.
     */
    private requestedLanguage = FALLBACK_LANGUAGE;

    /**
     * Switches to the given language, loading its translations. If the
     * language is not available, the language without its country code is
     * tried, finally falling back to English.
     */
    async use(key: string): Promise<void> {

        this.requestedLanguage = key;

        const [table, fallbackTable, resolvedKey] = await Promise.all([
            this.loadTranslation(key),
            this.loadTranslation(FALLBACK_LANGUAGE),
            this.resolveLanguageKey(key)
        ]);

        if (this.requestedLanguage !== key)
            return;

        this.table = table;
        this.fallbackTable = fallbackTable;
        this.compiled.clear();

        this.language.set(resolvedKey);
        this.updateDocument();
        this.version.update(version => version + 1);

    }

    /**
     * Reloads all translations for the current language. Translations can
     * vary after login, as extensions may provide additional strings.
     */
    refresh(): Promise<void> {
        this.cacheService.languages.removeAll();
        return this.use(this.requestedLanguage);
    }

    /**
     * Returns the translation of the given key, interpolating the given
     * variables. If no translation exists, the key itself is returned.
     */
    instant(key: string | null | undefined, variables?: Record<string, unknown> | null): string {

        // Read version such that reactive consumers update upon reload
        this.version();

        if (!key)
            return '';

        const message = this.getCompiled(key);
        if (!message)
            return key;

        try {
            return message(variables || {});
        }
        catch (e) {
            console.warn('Unable to format translation "' + key + '":', e);
            return key;
        }

    }

    /**
     * Returns whether a translation exists for the given key.
     */
    has(key: string): boolean {
        this.version();
        return this.resolve(key, new Set()) !== null;
    }

    /**
     * Returns the given translation key if a translation exists for that
     * key, or the given default key otherwise.
     */
    withFallback(key: string, defaultKey: string): string {
        return this.has(key) ? key : defaultKey;
    }

    private getCompiled(key: string): MessageFunction | null {

        if (this.compiled.has(key))
            return this.compiled.get(key)!;

        let compiled: MessageFunction | null = null;
        const source = this.resolve(key, new Set());
        if (source !== null) {
            try {
                compiled = compileMessage(source, toLanguageTag(this.language()));
            }

            // Fall back to the English string if the translated string is
            // invalid (some translation files contain malformed strings)
            catch (e) {
                console.warn('Invalid translation string for "' + key + '":', e);
                const fallbackSource = this.resolve(key, new Set(), true);
                if (fallbackSource !== null && fallbackSource !== source) {
                    try {
                        compiled = compileMessage(fallbackSource, FALLBACK_LANGUAGE);
                    }
                    catch { /* No valid translation exists */ }
                }
            }
        }

        this.compiled.set(key, compiled);
        return compiled;

    }

    /**
     * Resolves the raw translation string for the given key, following any
     * "@:OTHER.KEY" references.
     */
    private resolve(key: string, visited: Set<string>, fallbackOnly = false): string | null {

        if (visited.has(key))
            return null;
        visited.add(key);

        const value = fallbackOnly ? this.fallbackTable[key] : (this.table[key] ?? this.fallbackTable[key]);
        if (value === undefined)
            return null;

        if (value.startsWith(REFERENCE_PREFIX))
            return this.resolve(value.substring(REFERENCE_PREFIX.length), visited, fallbackOnly);

        return value;

    }

    private updateDocument(): void {
        const root = this.document.documentElement;
        root.lang = toLanguageTag(this.language());
        root.dir = this.direction();
    }

    /**
     * Returns the variations of the given language key which should be tried,
     * in order of preference.
     */
    private getKeyVariations(key: string): string[] {
        const underscore = key.indexOf('_');
        if (underscore === -1)
            return [key];
        return [key, key.substring(0, underscore)];
    }

    private async resolveLanguageKey(key: string): Promise<string> {
        const languages = await this.languageService.getLanguages().catch(() => ({} as Record<string, string>));
        return this.getKeyVariations(key).find(variation => variation in languages) ?? FALLBACK_LANGUAGE;
    }

    /**
     * Loads and flattens the translation file for the given language,
     * trying each variation of the key in turn. Resolves with an empty table
     * if no translation is available.
     */
    private async loadTranslation(key: string): Promise<TranslationTable> {

        let languages: Record<string, string>;
        try {
            languages = await this.languageService.getLanguages();
        }
        catch {
            return {};
        }

        for (const variation of this.getKeyVariations(key)) {

            if (!(variation in languages))
                continue;

            try {
                const translation = await this.requestService.request<Record<string, unknown>>({
                    cache: this.cacheService.languages,
                    method: 'GET',
                    url: 'translations/' + encodeURIComponent(variation) + '.json',
                    params: { b: this.buildIdentifier || undefined }
                });
                return flatten(translation);
            }
            catch {
                // Try remaining variations
            }

        }

        return {};

    }

}

/**
 * Flattens a nested translation object into a table of dot-separated keys.
 */
function flatten(object: Record<string, unknown>, prefix = '', table: TranslationTable = {}): TranslationTable {
    for (const [name, value] of Object.entries(object)) {
        const key = prefix ? prefix + '.' + name : name;
        if (value !== null && typeof value === 'object')
            flatten(value as Record<string, unknown>, key, table);
        else if (value !== null && value !== undefined)
            table[key] = String(value);
    }
    return table;
}
