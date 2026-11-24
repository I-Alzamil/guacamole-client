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
 * Builds the Angular frontend portion of an extension into a single script,
 * to be listed within the "js" section of the extension's manifest:
 *
 *     node build.mjs --entry=src/main/frontend-ng/fooModule.ts \
 *                    --outfile=target/classes/foo.min.js \
 *                    [--banner=src/main/resources/license.txt]
 *
 * The banner (typically the license header of the extension) is included
 * only if the given file exists. Each option may alternatively be provided
 * through the EXTENSION_ENTRY, EXTENSION_OUTFILE, and EXTENSION_BANNER
 * environment variables.
 *
 * Imports of Angular ("@angular/...") and of the application itself
 * ("guacamole-frontend") are not bundled, but resolve to the modules of the
 * running application (see loadExtensions() within the application).
 * Templates may be imported from ".html" files.
 */

import { build } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2)
    .map(arg => /^--([^=]+)=(.*)$/.exec(arg))
    .filter(Boolean)
    .map(([, name, value]) => [name, value]));

args.entry ??= process.env.EXTENSION_ENTRY;
args.outfile ??= process.env.EXTENSION_OUTFILE;
args.banner ??= process.env.EXTENSION_BANNER;

if (!args.entry || !args.outfile) {
    console.error('USAGE: node build.mjs --entry=FILE --outfile=FILE [--banner=FILE]');
    process.exit(1);
}

/**
 * Resolves imports of the modules provided by the application to those
 * modules at runtime.
 */
const applicationModules = {
    name: 'guacamole-frontend',
    setup(build) {
        build.onResolve({ filter: /^(@angular\/(core|common|forms|router)|guacamole-frontend)$/ },
            ({ path }) => ({ path, namespace: 'guacamole-frontend' }));
        build.onLoad({ filter: /.*/, namespace: 'guacamole-frontend' }, ({ path }) => ({
            contents: 'module.exports = globalThis.GuacamoleFrontend.modules['
                + JSON.stringify(path) + '];',
            loader: 'js'
        }));
    }
};

await build({
    entryPoints: [args.entry],
    outfile: args.outfile,
    bundle: true,
    format: 'iife',
    minify: true,
    target: 'es2022',
    loader: { '.html': 'text' },
    plugins: [applicationModules],
    banner: args.banner && existsSync(args.banner) ? { js: readFileSync(args.banner, 'utf8') } : undefined,
    tsconfigRaw: {
        compilerOptions: {
            experimentalDecorators: true,
            useDefineForClassFields: false
        }
    },
    logLevel: 'warning'
});
