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

import { ColorScheme } from '../form/color-scheme';
import { clientIdentifierFromString, clientIdentifierToString } from '../navigation/client-identifier';
import { FilterPattern, IPv4Network, IPv6Network } from './filter-pattern';
import { compilePropertyPath } from './property-path';
import { SortOrder, orderBy } from './sort-order';

describe('compilePropertyPath', () => {

    it('reads nested and bracketed properties', () => {
        const user = { user: { username: 'alice', attributes: { 'guac-full-name': 'Alice' } } };
        expect(compilePropertyPath('user.username')(user)).toBe('alice');
        expect(compilePropertyPath('user.attributes["guac-full-name"]')(user)).toBe('Alice');
        expect(compilePropertyPath('user.missing.deeper')(user)).toBeUndefined();
    });

});

describe('FilterPattern', () => {

    const hosts = [
        { name: 'Web Server', remoteHost: '192.168.1.10' },
        { name: 'Database', remoteHost: '10.0.0.5' },
        { name: 'IPv6 Host', remoteHost: '2001:db8::1' }
    ];

    it('matches all tokens case-insensitively', () => {
        const pattern = new FilterPattern(['name']);
        pattern.compile('web SERVER');
        expect(hosts.filter(pattern.predicate).map(h => h.name)).toEqual(['Web Server']);
        pattern.compile('"web server"');
        expect(hosts.filter(pattern.predicate).length).toBe(1);
        pattern.compile('');
        expect(hosts.filter(pattern.predicate).length).toBe(3);
    });

    it('matches addresses within networks', () => {
        const pattern = new FilterPattern(['remoteHost']);
        pattern.compile('192.168.0.0/16');
        expect(hosts.filter(pattern.predicate).map(h => h.name)).toEqual(['Web Server']);
        pattern.compile('2001:db8::/32');
        expect(hosts.filter(pattern.predicate).map(h => h.name)).toEqual(['IPv6 Host']);
    });

    it('parses networks', () => {
        expect(IPv4Network.parse('10.0.0.0/8')!.contains(IPv4Network.parse('10.1.2.3')!)).toBe(true);
        expect(IPv4Network.parse('300.0.0.1')).toBeNull();
        expect(IPv6Network.parse('::1')!.addressGroups).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    });

});

describe('SortOrder', () => {

    const items = [
        { name: 'bravo', date: 2 },
        { name: 'Alpha', date: 3 },
        { name: 'charlie', date: 1 }
    ];

    it('sorts case-insensitively and toggles direction', () => {

        const order = new SortOrder(['name', '-date']);
        expect(orderBy(items, order.predicate).map(i => i.name)).toEqual(['Alpha', 'bravo', 'charlie']);

        order.togglePrimary('name');
        expect(order.descending).toBe(true);
        expect(orderBy(items, order.predicate).map(i => i.name)).toEqual(['charlie', 'bravo', 'Alpha']);

        order.togglePrimary('date');
        expect(order.primary).toBe('date');
        expect(order.descending).toBe(false);
        expect(order.predicate).toEqual(['date', '-name']);

    });

});

describe('ColorScheme', () => {

    it('round-trips color schemes', () => {
        const original = 'background: rgb:00/00/00;\nforeground: rgb:FF/FF/FF;';
        const scheme = ColorScheme.fromString(original);
        expect(scheme.foreground).toBe('#FFFFFF');
        expect(scheme.toString()).toBe(original);
        scheme.background = '#102030';
        expect(scheme.toString()).toContain('background: rgb:10/20/30;');
        expect(ColorScheme.fromString('foreground: white').foreground).toBe('#FFFFFF');
    });

});

describe('ClientIdentifier', () => {

    it('round-trips client identifiers', () => {
        const id = { dataSource: 'mysql', type: 'c', id: '42' };
        expect(clientIdentifierFromString(clientIdentifierToString(id), null)).toEqual(id);
        expect(clientIdentifierToString({ dataSource: 'default', type: 'c', id: 'SSH Test' })).toBe('U1NIIFRlc3QAYwBkZWZhdWx0');
    });

});
