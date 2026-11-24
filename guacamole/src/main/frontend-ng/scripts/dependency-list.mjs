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
 * Generates dist/npm-dependencies.txt, listing every NPM package bundled
 * into the build as "name:version" (one per line), for use by the automatic
 * LICENSE/NOTICE generation of the Maven build. The list is derived from
 * the esbuild metafile produced by "ng build --stats-json", which is
 * removed afterwards such that it is not deployed. The production
 * dependencies of each bundled package are included as well, as some
 * packages (such as @messageformat/core) are distributed as pre-built
 * bundles which embed their dependencies. Angular packages are excluded from
 * this, as their bundles never embed dependencies, and their declared
 * dependencies are used only by build-time tooling.
 */

import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve(import.meta.dirname, '..', 'dist');
const statsFile = path.join(dist, 'browser-stats.json');

const stats = JSON.parse(fs.readFileSync(statsFile, 'utf8'));
const coordinates = new Set();

/**
 * Returns the package.json of the NPM package containing the given file, if
 * any.
 */
function findPackage(file) {
    for (let dir = path.dirname(path.resolve(file)); dir !== path.dirname(dir); dir = path.dirname(dir)) {
        const candidate = path.join(dir, 'package.json');
        if (fs.existsSync(candidate)) {
            const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8'));
            if (pkg.name && pkg.version)
                return pkg;
        }
        if (path.basename(dir) === 'node_modules')
            break;
    }
    return null;
}

/**
 * Adds the given package and all its transitive production dependencies.
 */
function addPackage(pkg) {

    const coordinate = pkg.name + ':' + pkg.version;
    if (coordinates.has(coordinate))
        return;

    coordinates.add(coordinate);

    if (pkg.name.startsWith('@angular/'))
        return;

    for (const dependency of Object.keys(pkg.dependencies || {})) {
        const candidate = path.resolve(import.meta.dirname, '..', 'node_modules', dependency, 'package.json');
        if (fs.existsSync(candidate))
            addPackage(JSON.parse(fs.readFileSync(candidate, 'utf8')));
    }

}

for (const input of Object.keys(stats.inputs)) {
    if (!input.includes('node_modules/'))
        continue;
    const pkg = findPackage(input.replace(/^[^:]*:/, ''));
    if (pkg)
        addPackage(pkg);
}

fs.writeFileSync(path.join(dist, 'npm-dependencies.txt'), [...coordinates].sort().join('\n') + '\n');
fs.rmSync(statsFile);
