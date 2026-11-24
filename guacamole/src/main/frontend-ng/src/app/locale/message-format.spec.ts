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

import { compileMessage } from './message-format';

describe('compileMessage', () => {

    const format = (source: string, variables: Record<string, unknown> = {}, language = 'en') =>
        compileMessage(source, language)(variables);

    it('substitutes variables', () => {
        expect(format('Plain text')).toBe('Plain text');
        expect(format('{A} and { B }', { A: 'x', B: 1234 })).toBe('x and 1234');
        expect(format('[{MISSING}]')).toBe('[]');
    });

    it('selects plural cases using the rules of the language', () => {

        const users = '{N, plural, =0{no users} one{# user} other{# users}}';
        expect(format(users, { N: 0 })).toBe('no users');
        expect(format(users, { N: 1 })).toBe('1 user');
        expect(format(users, { N: 1234 })).toBe('1,234 users');

        const arabic = '{N, plural, zero{لا شيء} one{واحد} two{اثنان} few{# قليل} many{# كثير} other{#}}';
        expect(format(arabic, { N: 0 }, 'ar')).toBe('لا شيء');
        expect(format(arabic, { N: 2 }, 'ar')).toBe('اثنان');
        expect(format(arabic, { N: 5 }, 'ar')).toBe('5 قليل');
        expect(format(arabic, { N: 11 }, 'ar')).toBe('11 كثير');

        // Categories missing from the string fall back to "other"
        expect(format('{N, plural, one{one} other{other}}', { N: 2 }, 'ar')).toBe('other');

    });

    it('selects select cases, keeping "#" of enclosing plurals', () => {

        const duration = '{VALUE} {UNIT, select, second{{VALUE, plural, one{second} other{seconds}}} other{}}';
        expect(format(duration, { VALUE: 1, UNIT: 'second' })).toBe('1 second');
        expect(format(duration, { VALUE: 3, UNIT: 'second' })).toBe('3 seconds');
        expect(format(duration, { VALUE: 3, UNIT: 'fortnight' })).toBe('3 ');

        expect(format('{N, plural, other{{S, select, a{# a} other{# b}}}}', { N: 2, S: 'a' })).toBe('2 a');

    });

    it('supports backslash escapes and literal apostrophes', () => {
        expect(format('\\{ "a": 1 \\} \\# \\\\ \\n')).toBe('{ "a": 1 } # \\ \\n');
        expect(format("l'utilisateur {N}", { N: 5 }, 'fr')).toBe("l'utilisateur 5");
        expect(format('# is literal outside plurals')).toBe('# is literal outside plurals');
        expect(format('stray {N}}.', { N: 1 })).toBe('stray 1}.');
    });

    it('rejects malformed strings', () => {
        expect(() => compileMessage('{N, plurale, uno{x} altri{y}}', 'it')).toThrow();
        expect(() => compileMessage('{N, plural, one{x}', 'en')).toThrow();
        expect(() => compileMessage('{}', 'en')).toThrow();
    });

    it('falls back to English plural rules for unknown languages', () => {
        expect(format('{N, plural, one{one} other{other}}', { N: 1 }, 'xx-invalid-')).toBe('one');
    });

});
