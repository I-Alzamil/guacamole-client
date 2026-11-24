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

import { PropertyGetter, compilePropertyPath } from './property-path';

/**
 * An IPv4 network, defined by an address and netmask.
 */
export class IPv4Network {

    constructor(readonly address: number, readonly netmask: number) {}

    /**
     * Returns whether the given network is contained within this network.
     */
    contains(other: IPv4Network): boolean {
        return this.address === (other.address & other.netmask & this.netmask);
    }

    /**
     * Parses the given IPv4 address or CIDR network, returning null if the
     * string is not a valid IPv4 address or network.
     */
    static parse(str: string): IPv4Network | null {

        const match = /^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})(?:\/([0-9]{1,2}))?$/.exec(str);
        if (!match)
            return null;

        let netmask = 0xFFFFFFFF;
        if (match[5]) {
            const bits = parseInt(match[5]);
            if (bits > 0 && bits <= 32)
                netmask = 0xFFFFFFFF << (32 - bits);
        }

        let address = 0;
        for (let i = 1; i <= 4; i++) {
            const octet = parseInt(match[i]);
            if (octet > 255)
                return null;
            address = (address << 8) | octet;
        }

        return new IPv4Network(address, netmask);

    }

}

/**
 * An IPv6 network, defined by an address and netmask, each represented as
 * eight 16-bit groups.
 */
export class IPv6Network {

    constructor(readonly addressGroups: number[], readonly netmaskGroups: number[]) {}

    contains(other: IPv6Network): boolean {
        for (let i = 0; i < 8; i++) {
            if (this.addressGroups[i] !== (other.addressGroups[i] & other.netmaskGroups[i] & this.netmaskGroups[i]))
                return false;
        }
        return true;
    }

    static parse(str: string): IPv6Network | null {

        const match = /^([0-9a-f]{0,4}(?::[0-9a-f]{0,4}){0,7})(?:\/([0-9]{1,3}))?$/.exec(str);
        if (!match)
            return null;

        const netmask = generateNetmask(match[2] ? parseInt(match[2]) : 128);
        const splitAddress = (value: string) => value.split(':').map(group => parseInt(group || '0', 16));

        let address: number[];
        const doubleColon = match[1].indexOf('::');
        if (doubleColon === -1)
            address = splitAddress(match[1]);
        else {
            const left = splitAddress(match[1].substring(0, doubleColon));
            const right = splitAddress(match[1].substring(doubleColon + 2));
            while (left.length + right.length < 8)
                left.push(0);
            address = left.concat(right);
        }

        if (address.length !== 8)
            return null;

        return new IPv6Network(address, netmask);

    }

}

function generateNetmask(bits: number): number[] {

    const netmask: number[] = [];
    bits = Math.min(128, bits);

    while (bits >= 16) {
        netmask.push(0xFFFF);
        bits -= 16;
    }

    if (bits > 0 && bits <= 16)
        netmask.push(0xFFFF & (0xFFFF << (16 - bits)));

    while (netmask.length < 8)
        netmask.push(0);

    return netmask;

}

export type FilterToken =
    | { consumed: string, type: 'LITERAL', value: string }
    | { consumed: string, type: 'IPV4_NETWORK', value: IPv4Network }
    | { consumed: string, type: 'IPV6_NETWORK', value: IPv6Network }
    | { consumed: string, type: 'WHITESPACE', value: string };

/**
 * Token parsers, in order of precedence.
 */
const TOKEN_TYPES: ((str: string) => FilterToken | null)[] = [

    (str) => {
        const match = /^\S+/.exec(str);
        const network = match && IPv4Network.parse(match[0]);
        return network ? { consumed: match![0], type: 'IPV4_NETWORK', value: network } : null;
    },

    (str) => {
        const match = /^\S+/.exec(str);
        const network = match && IPv6Network.parse(match[0]);
        return network ? { consumed: match![0], type: 'IPV6_NETWORK', value: network } : null;
    },

    (str) => {
        const match = /^"([^"]*)"|^\S+/.exec(str);
        if (!match)
            return null;
        return { consumed: match[0], type: 'LITERAL', value: match[1] || match[0] };
    },

    (str) => {
        const match = /^\s+/.exec(str);
        return match ? { consumed: match[0], type: 'WHITESPACE', value: match[0] } : null;
    }

];

/**
 * Splits the given filter string into tokens, discarding whitespace.
 */
export function tokenizeFilter(str: string): FilterToken[] {

    const tokens: FilterToken[] = [];

    while (str) {

        let token: FilterToken | null = null;
        for (const parse of TOKEN_TYPES) {
            token = parse(str);
            if (token)
                break;
        }

        if (!token)
            break;

        str = str.substring(token.consumed.length);
        if (token.type !== 'WHITESPACE')
            tokens.push(token);

    }

    return tokens;

}

/**
 * A filter which matches objects whose properties contain all tokens of a
 * search string. Tokens which are IP addresses or networks match any
 * property containing an address within that network.
 */
export class FilterPattern {

    private readonly getters: PropertyGetter[];

    /**
     * Returns whether the given object matches the most recently compiled
     * pattern. All objects match if no pattern has been compiled.
     */
    predicate: (object: unknown) => boolean = () => true;

    constructor(expressions: string[]) {
        this.getters = expressions.map(compilePropertyPath);
    }

    private matchesString(object: unknown, str: string): boolean {
        return this.getters.some(getter => String(getter(object)).toLowerCase().includes(str));
    }

    private matchesNetwork<N extends { contains(other: N): boolean }>(object: unknown, network: N,
            separator: RegExp, parse: (str: string) => N | null): boolean {
        return this.getters.some(getter => String(getter(object)).split(separator).some(address => {
            const value = parse(address);
            return !!value && network.contains(value);
        }));
    }

    private matchesToken(object: unknown, token: FilterToken): boolean {
        switch (token.type) {
            case 'LITERAL':
                return this.matchesString(object, token.value);
            case 'IPV4_NETWORK':
                return this.matchesNetwork(object, token.value, /[^0-9.]+/, IPv4Network.parse);
            case 'IPV6_NETWORK':
                return this.matchesNetwork(object, token.value, /[^0-9A-Fa-f:]+/, IPv6Network.parse);
            default:
                return false;
        }
    }

    /**
     * Compiles the given search string, updating the predicate of this
     * filter.
     */
    compile(pattern: string | null | undefined): void {

        if (!pattern) {
            this.predicate = () => true;
            return;
        }

        const tokens = tokenizeFilter(pattern.toLowerCase());
        this.predicate = (object) => tokens.every(token => this.matchesToken(object, token));

    }

}
