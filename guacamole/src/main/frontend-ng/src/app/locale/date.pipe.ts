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

import { formatDate } from '@angular/common';
import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslationService } from './translation.service';

/**
 * Formats the given date using the given format string, which uses the same
 * syntax as the AngularJS "date" filter (and thus the date formats within the
 * translation files). Invalid formats fall back to ISO 8601.
 */
export function formatGuacDate(value: number | string | Date | null | undefined, format: string): string {

    if (value === null || value === undefined || value === '')
        return '';

    try {
        return formatDate(value, format, 'en-US');
    }
    catch {
        return new Date(value).toISOString();
    }

}

/**
 * Formats a date using the format string having the given translation key:
 *
 *     {{ user.lastActive | guacDate: 'SETTINGS_USERS.FORMAT_DATE' }}
 */
@Pipe({ name: 'guacDate', pure: false })
export class GuacDatePipe implements PipeTransform {

    private readonly translationService = inject(TranslationService);

    transform(value: number | string | Date | null | undefined, formatKey: string): string {
        return formatGuacDate(value, this.translationService.instant(formatKey));
    }

}
