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

/**
 * A compiled translation string, producing the formatted string for the
 * given variables.
 */
export type MessageFunction = (variables: Record<string, unknown>) => string;

/**
 * Compiles the given translation string, written in the subset of ICU
 * MessageFormat used by Guacamole translation files, for the given language
 * (a BCP 47 tag). Plural categories are determined by the browser
 * (Intl.PluralRules) using the same CLDR data as other MessageFormat
 * implementations. Supported syntax:
 *
 * - "{NAME}": the value of the variable NAME.
 * - "{NAME, plural, =0{...} one{...} other{...}}": the case matching the
 *   exact value of NAME or, failing that, its plural category. "#" within a
 *   case is the value of NAME, formatted as a number.
 * - "{NAME, select, a{...} b{...} other{...}}": the case matching the value of
 *   NAME.
 * - "\{", "\}", "\#", and "\\": literal "{", "}", "#", and "\". Apostrophes
 *   are always literal, as are unmatched "}" outside of arguments.
 *
 * @throws Error
 *     If the translation string is malformed.
 */
export function compileMessage(source: string, language: string): MessageFunction {

    const locale = supportedLocale(language);
    const parser = new Parser(source, {
        pluralRules: new Intl.PluralRules(locale),
        numberFormat: new Intl.NumberFormat(locale)
    });

    const message = parser.parseMessage(false, true);
    return variables => message(variables, null);

}

/**
 * Returns the given language if supported by the browser's Intl API, or
 * English otherwise.
 */
function supportedLocale(language: string): string {
    try {
        return Intl.PluralRules.supportedLocalesOf(language).length ? language : 'en';
    }
    catch {
        return 'en';
    }
}

interface LocaleData {
    pluralRules: Intl.PluralRules;
    numberFormat: Intl.NumberFormat;
}

/**
 * A compiled (part of a) message. The given number is the value of the
 * innermost enclosing plural argument, substituted for "#", if any.
 */
type Part = (variables: Record<string, unknown>, pluralValue: number | null) => string;

class Parser {

    private pos = 0;

    constructor(private readonly source: string, private readonly locale: LocaleData) {}

    atEnd(): boolean {
        return this.pos >= this.source.length;
    }

    error(message: string): Error {
        return new Error(message + ' at position ' + this.pos + ' of "' + this.source + '"');
    }

    /**
     * Parses a message (or the content of a case) up to, but excluding, the
     * next unmatched "}" or the end of the string. Unmatched "}" within the
     * top-level message are literal (as accepted by the MessageFormat
     * implementation previously used, and relied upon by some translations).
     */
    parseMessage(inPlural: boolean, topLevel = false): Part {

        const parts: Part[] = [];
        let text = '';

        const flushText = () => {
            if (text) {
                const literal = text;
                parts.push(() => literal);
                text = '';
            }
        };

        while (!this.atEnd()) {

            const c = this.source[this.pos];

            if (c === '\\' && '\\{}#'.includes(this.source[this.pos + 1] ?? '')) {
                text += this.source[this.pos + 1];
                this.pos += 2;
            }
            else if (c === '{') {
                flushText();
                this.pos++;
                parts.push(this.parseArgument(inPlural));
            }
            else if (c === '}' && !topLevel)
                break;
            else if (c === '#' && inPlural) {
                flushText();
                this.pos++;
                parts.push((variables, pluralValue) =>
                    pluralValue === null ? '#' : this.locale.numberFormat.format(pluralValue));
            }
            else {
                text += c;
                this.pos++;
            }

        }

        flushText();

        if (parts.length === 1)
            return parts[0];

        return (variables, pluralValue) => parts.map(part => part(variables, pluralValue)).join('');

    }

    /**
     * Parses an argument following its opening "{", up to and including its
     * closing "}".
     */
    private parseArgument(inPlural: boolean): Part {

        const name = this.parseIdentifier();

        // Simple variable, such as "{NAME}"
        if (this.consume('}')) {
            return variables => {
                const value = variables[name];
                return value === undefined || value === null ? '' : String(value);
            };
        }

        this.expect(',');
        const type = this.parseIdentifier();
        this.expect(',');
        const cases = this.parseCases(type === 'plural' || (type === 'select' && inPlural));

        if (type === 'plural') {
            return (variables, pluralValue) => {
                const value = Number(variables[name]);
                const exact = cases.get('=' + value);
                const selected = exact ?? cases.get(this.locale.pluralRules.select(value)) ?? cases.get('other');
                return selected ? selected(variables, value) : '';
            };
        }

        if (type === 'select') {
            return (variables, pluralValue) => {
                const selected = cases.get(String(variables[name])) ?? cases.get('other');
                return selected ? selected(variables, pluralValue) : '';
            };
        }

        throw this.error('Unsupported argument type "' + type + '"');

    }

    /**
     * Parses the cases of a plural or select argument, up to and including
     * the closing "}" of the argument.
     */
    private parseCases(inPlural: boolean): Map<string, Part> {

        const cases = new Map<string, Part>();

        while (!this.consume('}')) {

            const key = this.parseIdentifier();
            this.expect('{');
            cases.set(key, this.parseMessage(inPlural));
            this.expect('}');

        }

        if (!cases.size)
            throw this.error('Argument has no cases');

        return cases;

    }

    /**
     * Parses an identifier (variable name, argument type, or case key, such
     * as "=0"), ignoring surrounding whitespace.
     */
    private parseIdentifier(): string {

        this.skipWhitespace();

        const match = /^=?[\p{L}\p{N}_-]+/u.exec(this.source.substring(this.pos));
        if (!match)
            throw this.error('Expected identifier');

        this.pos += match[0].length;
        this.skipWhitespace();
        return match[0];

    }

    /**
     * Consumes the given character (after any whitespace) if present,
     * returning whether it was present.
     */
    private consume(character: string): boolean {
        this.skipWhitespace();
        if (this.source[this.pos] !== character)
            return false;
        this.pos++;
        return true;
    }

    private expect(character: string): void {
        if (!this.consume(character))
            throw this.error('Expected "' + character + '"');
    }

    private skipWhitespace(): void {
        while (!this.atEnd() && /\s/.test(this.source[this.pos]))
            this.pos++;
    }

}
