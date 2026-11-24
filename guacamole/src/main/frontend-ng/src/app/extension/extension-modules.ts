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

import { AsyncPipe, DecimalPipe, NgClass, NgStyle, NgTemplateOutlet, formatDate } from '@angular/common';
import {
    ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, Directive, ElementRef,
    EventEmitter, HostBinding, HostListener, Injectable, InjectionToken, Injector, Input, NgZone,
    Output, Pipe, Renderer2, ViewChild, ViewContainerRef, afterNextRender, afterRenderEffect,
    computed, contentChild, effect, inject, input, linkedSignal, model, output, signal, untracked,
    viewChild, viewChildren
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthenticationService } from '../auth/authentication.service';
import { ClientMenuService } from '../client/client-menu.service';
import { FocusDirective } from '../element/focus.directive';
import { Watchers } from '../element/watchers';
import { FieldComponent } from '../form/field-component';
import { formService } from '../form/field-types';
import { DigestService } from '../index/digest.service';
import { PageService } from '../index/page.service';
import { GuacDatePipe } from '../locale/date.pipe';
import { TranslatePipe } from '../locale/translate.pipe';
import { TranslationService } from '../locale/translation.service';
import { NotificationService } from '../notification/notification.service';
import { ConnectionGroupService, ConnectionService } from '../rest/connection.services';
import { DataSourceService } from '../rest/data-source.service';
import { RequestService } from '../rest/request.service';
import { SchemaService } from '../rest/schema.service';
import { UserService } from '../rest/user.services';
import { PreferenceService } from '../settings/preference.service';
import { ClientIdentifierType, clientIdentifierToString } from '../navigation/client-identifier';
import { CacheService } from '../rest/cache.service';
import { getExtensionFormsModule } from './forms';
import { patchService } from './patches';
import { run } from './run-blocks';

/**
 * The modules which extension code may import, by module name, and the
 * exports of each available to extensions. Extensions are built separately
 * from the application (see the "extension-sdk" directory), with these
 * imports resolved to the very same instances used by the application at
 * runtime. Only part of each Angular package is exposed, as exposing entire
 * packages would prevent unused parts of Angular from being omitted from the
 * application.
 */
export const EXTENSION_MODULES: Record<string, unknown> = {
    '@angular/common': {
        AsyncPipe, DecimalPipe, NgClass, NgStyle, NgTemplateOutlet, formatDate
    },
    '@angular/core': {
        ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, Directive, ElementRef,
        EventEmitter, HostBinding, HostListener, Injectable, InjectionToken, Injector, Input, NgZone,
        Output, Pipe, Renderer2, ViewChild, ViewContainerRef, afterNextRender, afterRenderEffect,
        computed, contentChild, effect, inject, input, linkedSignal, model, output, signal, untracked,
        viewChild, viewChildren
    },
    '@angular/forms': { FormsModule: getExtensionFormsModule() },
    '@angular/router': { ActivatedRoute, Router, RouterLink },
    'guacamole-frontend': {
        AuthenticationService,
        CacheService,
        ClientIdentifierType,
        ClientMenuService,
        ConnectionGroupService,
        ConnectionService,
        DataSourceService,
        DigestService,
        FieldComponent,
        FocusDirective,
        GuacDatePipe,
        NotificationService,
        PageService,
        PreferenceService,
        RequestService,
        SchemaService,
        TranslatePipe,
        TranslationService,
        UserService,
        Watchers,
        clientIdentifierToString,
        formService,
        patchService,
        run
    }
};
