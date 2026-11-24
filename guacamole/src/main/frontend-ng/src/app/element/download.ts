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
 * Prompts the user to save the given Blob as a file having the given name.
 */
export function saveBlob(blob: Blob, filename: string): void {

    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();
    link.remove();

    // Release the object URL once the download has had a chance to begin
    setTimeout(() => URL.revokeObjectURL(url), 60000);

}

/**
 * Encodes a single CSV field, quoting the field if it is not numeric.
 */
function encodeField(field: unknown): string {

    const value = (field === null || field === undefined) ? '' : String(field);
    if (/^[0-9.]*$/.test(value))
        return value;

    return '"' + value.replace(/"/g, '""') + '"';

}

/**
 * Encodes the given records (arrays of fields) as a CSV Blob.
 */
export function toCsvBlob(records: unknown[][]): Blob {
    const csv = records.map(record => record.map(encodeField).join(',')).join('\r\n');
    return new Blob([csv], { type: 'text/csv' });
}
