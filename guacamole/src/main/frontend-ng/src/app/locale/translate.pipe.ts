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

import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslatableMessage } from '../rest/types/translatable-message';
import { TranslationService } from './translation.service';

/**
 * Translates the given translation key (or {@link TranslatableMessage}),
 * interpolating any provided variables:
 *
 *     {{ 'APP.NAME' | translate }}
 *     {{ 'CLIENT.TEXT_USER_JOINED' | translate: { USERNAME: name } }}
 *     {{ error.translatableMessage | translate }}
 *
 * The pipe is impure so that output updates whenever the active language
 * changes. Translation results are cached by the translation service.
 */
@Pipe({ name: 'translate', pure: false })
export class TranslatePipe implements PipeTransform {

    private readonly translationService = inject(TranslationService);

    transform(key: string | TranslatableMessage | null | undefined,
            variables?: Record<string, unknown> | null): string {

        if (key && typeof key === 'object')
            return this.translationService.instant(key.key, key.variables);

        return this.translationService.instant(key, variables);

    }

}
