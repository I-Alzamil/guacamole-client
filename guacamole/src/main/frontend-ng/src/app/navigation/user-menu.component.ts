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

import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { AuthenticationService } from '../auth/authentication.service';
import { TranslatePipe } from '../locale/translate.pipe';
import { RequestService } from '../rest/request.service';
import { UserAttributes } from '../rest/types/model';
import { UserService } from '../rest/user.services';
import { MenuComponent } from './menu.component';
import { MenuAction, PageDefinition } from './page-definition';
import { PageListComponent } from './page-list.component';
import { UserPageService } from './user-page.service';

/**
 * The menu displaying the current user's name, profile, available pages,
 * and actions such as logout.
 */
@Component({
    selector: 'guac-user-menu',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MenuComponent, PageListComponent, TranslatePipe],
    host: { 'class': 'user-menu', '[hidden]': 'isAnonymous()' },
    template: `
        <guac-menu [menuTitle]="username">

            @if (fullName()) {
                <div class="profile">
                    <div class="full-name"><a [attr.href]="userURL()">{{ fullName() }}</a></div>
                    @if (role()) {
                        <div class="organizational-role">{{ role() }}</div>
                    }
                    @if (organization()) {
                        <div class="organization">{{ organization() }}</div>
                    }
                </div>
            }

            <ul class="action-list">
                @for (action of localActions(); track action.name) {
                    <li><a [class]="action.className ?? ''" (click)="action.callback()">{{ action.name | translate }}</a></li>
                }
            </ul>

            <guac-page-list [pages]="pages()" />

            <ul class="action-list">
                @for (action of actions; track action.name) {
                    <li><a [class]="action.className ?? ''" (click)="action.callback()">{{ action.name | translate }}</a></li>
                }
            </ul>

        </guac-menu>
    `
})
export class UserMenuComponent {

    private readonly authenticationService = inject(AuthenticationService);
    private readonly requestService = inject(RequestService);

    /** Actions specific to the current page. */
    readonly localActions = input<MenuAction[]>([]);

    readonly username = this.authenticationService.getCurrentUsername();
    readonly fullName = signal<string | null>(null);
    readonly userURL = signal<string | null>(null);
    readonly organization = signal<string | null>(null);
    readonly role = signal<string | null>(null);
    readonly pages = signal<PageDefinition[] | null>(null);

    readonly actions: MenuAction[] = [{
        name: 'USER_MENU.ACTION_LOGOUT',
        className: 'logout',
        callback: () => this.logout()
    }];

    constructor() {

        inject(UserService).getUser(this.authenticationService.getDataSource()!, this.username!)
            .then(user => {
                this.fullName.set(user.attributes[UserAttributes.FULL_NAME]);
                this.organization.set(user.attributes[UserAttributes.ORGANIZATION]);
                this.role.set(user.attributes[UserAttributes.ORGANIZATIONAL_ROLE]);
                const email = user.attributes[UserAttributes.EMAIL_ADDRESS];
                this.userURL.set(email ? 'mailto:' + email : null);
            }, this.requestService.IGNORE);

        inject(UserPageService).getMainPages().then(pages => this.pages.set(pages), () => {});

    }

    isAnonymous(): boolean {
        return this.authenticationService.isAnonymous();
    }

    logout(): void {
        this.authenticationService.logout().catch(this.requestService.IGNORE);
    }

}
