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

import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthenticationService } from '../auth/authentication.service';
import { FormComponent } from '../form/form.component';
import { TranslatePipe } from '../locale/translate.pipe';
import { TranslationService } from '../locale/translation.service';
import { Notification } from '../notification/notification';
import { NotificationService } from '../notification/notification.service';
import { SchemaService } from '../rest/schema.service';
import { Field, FieldType, Form } from '../rest/types/field';
import { User } from '../rest/types/model';
import { ObjectPermissionType, PermissionSet, SystemPermissionType } from '../rest/types/permission-set';
import { PermissionService, UserService } from '../rest/user.services';
import { PreferenceService } from './preference.service';

/**
 * Allows the current user to change their preferences, password, and any
 * user attributes designated as preferences.
 */
@Component({
    selector: 'guac-settings-preferences',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormComponent, FormsModule, TranslatePipe],
    host: { 'class': 'preferences', '[class.loading]': 'canUpdateSelf() === null' },
    template: `
        <div class="settings section locale">
            <p>{{ 'SETTINGS_PREFERENCES.HELP_LOCALE' | translate }}</p>
            <guac-form [content]="localeFields" [model]="localeModel" namespace="SETTINGS_PREFERENCES"
                       (change)="localeChanged()" (input)="localeChanged()" />
        </div>

        <h2 class="header">{{ 'SETTINGS_PREFERENCES.SECTION_HEADER_APPEARANCE' | translate }}</h2>
        <div class="settings section appearance">
            <p>{{ 'SETTINGS_PREFERENCES.HELP_APPEARANCE' | translate }}</p>
            <div class="form">
                <table class="fields">
                    <tr>
                        <th>{{ 'SETTINGS_PREFERENCES.FIELD_HEADER_SHOW_RECENT_CONNECTIONS' | translate }}</th>
                        <td><input type="checkbox" [(ngModel)]="preferences.showRecentConnections"></td>
                    </tr>
                    <tr>
                        <th>{{ 'SETTINGS_PREFERENCES.FIELD_HEADER_NUMBER_RECENT_CONNECTIONS' | translate }}</th>
                        <td><input type="number" min="1" max="20" [(ngModel)]="preferences.numberOfRecentConnections"></td>
                    </tr>
                </table>
            </div>
        </div>

        @if (canUpdateSelf()) {
            <h2 class="header">{{ 'SETTINGS_PREFERENCES.SECTION_HEADER_UPDATE_PASSWORD' | translate }}</h2>
            <div class="settings section update-password">
                <p>{{ 'SETTINGS_PREFERENCES.HELP_UPDATE_PASSWORD' | translate }}</p>
                <div class="form">
                    <table class="fields">
                        <tr>
                            <th>{{ 'SETTINGS_PREFERENCES.FIELD_HEADER_PASSWORD_OLD' | translate }}</th>
                            <td><input type="password" [(ngModel)]="oldPassword"></td>
                        </tr>
                        <tr>
                            <th>{{ 'SETTINGS_PREFERENCES.FIELD_HEADER_PASSWORD_NEW' | translate }}</th>
                            <td><input type="password" [(ngModel)]="newPassword"></td>
                        </tr>
                        <tr>
                            <th>{{ 'SETTINGS_PREFERENCES.FIELD_HEADER_PASSWORD_NEW_AGAIN' | translate }}</th>
                            <td><input type="password" [(ngModel)]="newPasswordMatch"></td>
                        </tr>
                    </table>
                </div>
                <div class="action-buttons">
                    <button class="change-password" (click)="updatePassword()">{{ 'SETTINGS_PREFERENCES.ACTION_UPDATE_PASSWORD' | translate }}</button>
                </div>
            </div>
        }

        <h2 class="header">{{ 'SETTINGS_PREFERENCES.SECTION_HEADER_DEFAULT_INPUT_METHOD' | translate }}</h2>
        <div class="settings section input-method">
            <p>{{ 'SETTINGS_PREFERENCES.HELP_DEFAULT_INPUT_METHOD' | translate }}</p>
            <div class="choices">
                @for (method of ['none', 'text', 'osk']; track method) {
                    <div class="choice">
                        <label><input [id]="'ime-' + method" name="input-method" type="radio" [value]="method"
                                      [(ngModel)]="preferences.inputMethod">
                            {{ 'SETTINGS_PREFERENCES.NAME_INPUT_METHOD_' + method.toUpperCase() | translate }}</label>
                        <p class="caption"><label [for]="'ime-' + method">{{ 'SETTINGS_PREFERENCES.HELP_INPUT_METHOD_' + method.toUpperCase() | translate }}</label></p>
                    </div>
                }
            </div>
        </div>

        <h2 class="header">{{ 'SETTINGS_PREFERENCES.SECTION_HEADER_DEFAULT_MOUSE_MODE' | translate }}</h2>
        <div class="settings section mouse-mode">
            <p>{{ 'SETTINGS_PREFERENCES.HELP_DEFAULT_MOUSE_MODE' | translate }}</p>
            <div class="choices">
                <div class="choice">
                    <input name="mouse-mode" type="radio" id="absolute" [value]="true" [(ngModel)]="preferences.emulateAbsoluteMouse">
                    <div class="figure">
                        <label for="absolute"><img src="images/settings/touchscreen.svg" [alt]="'SETTINGS_PREFERENCES.NAME_MOUSE_MODE_ABSOLUTE' | translate"></label>
                        <p class="caption"><label for="absolute">{{ 'SETTINGS_PREFERENCES.HELP_MOUSE_MODE_ABSOLUTE' | translate }}</label></p>
                    </div>
                </div>
                <div class="choice">
                    <input name="mouse-mode" type="radio" id="relative" [value]="false" [(ngModel)]="preferences.emulateAbsoluteMouse">
                    <div class="figure">
                        <label for="relative"><img src="images/settings/touchpad.svg" [alt]="'SETTINGS_PREFERENCES.NAME_MOUSE_MODE_RELATIVE' | translate"></label>
                        <p class="caption"><label for="relative">{{ 'SETTINGS_PREFERENCES.HELP_MOUSE_MODE_RELATIVE' | translate }}</label></p>
                    </div>
                </div>
            </div>
        </div>

        @if (canUpdateSelf() && attributes()?.length && user()) {
            <div class="attributes">
                <guac-form namespace="USER_ATTRIBUTES" [content]="attributes()" [model]="$any(user()!.attributes)" />
                <button class="save" (click)="saveUser()">{{ 'SETTINGS_PREFERENCES.ACTION_SAVE' | translate }}</button>
            </div>
        }
    `
})
export class SettingsPreferencesComponent {

    private readonly notificationService = inject(NotificationService);
    private readonly translationService = inject(TranslationService);
    private readonly userService = inject(UserService);

    private readonly username = inject(AuthenticationService).getCurrentUsername()!;
    private readonly dataSource = inject(AuthenticationService).getDataSource()!;

    readonly preferences = inject(PreferenceService).preferences;

    /** Fields for selecting language and time zone. */
    readonly localeFields: Field[] = [
        { type: FieldType.LANGUAGE, name: 'language' },
        { type: FieldType.TIMEZONE, name: 'timezone' }
    ];

    /**
     * Model of the locale fields. Fields operate on string values, and are
     * copied into the preferences as they change.
     */
    readonly localeModel: Record<string, string> = {
        language: this.preferences.language,
        timezone: this.preferences.timezone
    };

    readonly user = signal<User | null>(null);
    readonly attributes = signal<Form[] | null>(null);
    readonly canUpdateSelf = signal<boolean | null>(null);

    oldPassword = '';
    newPassword = '';
    newPasswordMatch = '';

    private readonly ACKNOWLEDGE_ACTION = {
        name: 'SETTINGS_PREFERENCES.ACTION_ACKNOWLEDGE',
        callback: () => this.notificationService.showStatus(false)
    };

    constructor() {

        inject(PermissionService).getEffectivePermissions(this.dataSource, this.username).then(permissions => {
            this.canUpdateSelf.set(PermissionSet.hasUserPermission(permissions, ObjectPermissionType.UPDATE, this.username)
                || PermissionSet.hasSystemPermission(permissions, SystemPermissionType.ADMINISTER));
        }, () => this.canUpdateSelf.set(false));

        this.userService.getUser(this.dataSource, this.username).then(user => this.user.set(user), () => {});
        inject(SchemaService).getUserPreferenceAttributes(this.dataSource)
            .then(attributes => this.attributes.set(attributes), () => {});

    }

    /**
     * Applies changes to the language and time zone. A new language takes
     * effect immediately, including the direction (LTR/RTL) of the page.
     */
    localeChanged(): void {

        // Field values are committed asynchronously relative to DOM events
        queueMicrotask(() => {

            if (this.localeModel['timezone'])
                this.preferences.timezone = this.localeModel['timezone'];

            const language = this.localeModel['language'];
            if (language && language !== this.preferences.language) {
                this.preferences.language = language;
                this.translationService.use(language);
            }

        });

    }

    private showError(key: string): void {
        this.notificationService.showStatus({
            className: 'error',
            title: 'SETTINGS_PREFERENCES.DIALOG_HEADER_ERROR',
            text: { key },
            actions: [this.ACKNOWLEDGE_ACTION]
        });
    }

    updatePassword(): void {

        if (this.newPasswordMatch !== this.newPassword) {
            this.showError('SETTINGS_PREFERENCES.ERROR_PASSWORD_MISMATCH');
            return;
        }

        if (!this.newPassword) {
            this.showError('SETTINGS_PREFERENCES.ERROR_PASSWORD_BLANK');
            return;
        }

        this.userService.updateUserPassword(this.dataSource, this.username, this.oldPassword, this.newPassword)
            .then(() => {
                this.oldPassword = this.newPassword = this.newPasswordMatch = '';
                this.notificationService.showStatus({
                    text: { key: 'SETTINGS_PREFERENCES.INFO_PASSWORD_CHANGED' },
                    actions: [this.ACKNOWLEDGE_ACTION]
                });
            }, this.notificationService.SHOW_REQUEST_ERROR);

    }

    saveUser(): void {

        const reload: Notification['actions'] = [{
            name: 'SETTINGS_PREFERENCES.ACTION_ACKNOWLEDGE',
            callback: () => this.userService.getUser(this.dataSource, this.username)
                .then(user => this.user.set(user))
                .finally(() => this.notificationService.showStatus(false))
        }];

        this.userService.saveUser(this.dataSource, this.user()!).then(() => this.notificationService.showStatus({
            text: { key: 'SETTINGS_PREFERENCES.INFO_PREFERENCE_ATTRIBUTES_CHANGED' },
            actions: reload
        }), this.notificationService.SHOW_REQUEST_ERROR);

    }

}
