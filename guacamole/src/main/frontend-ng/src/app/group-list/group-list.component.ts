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

import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, TemplateRef, computed, effect, inject, input, signal } from '@angular/core';
import { AuthenticationService } from '../auth/authentication.service';
import { PagerComponent } from '../list/list.components';
import { orderBy } from '../list/sort-order';
import { ActiveConnectionService } from '../rest/connection.services';
import { DataSourceService } from '../rest/data-source.service';
import { RequestService } from '../rest/request.service';
import { ConnectionGroup } from '../rest/types/model';
import { GroupListItem, GroupListItemType } from './group-list-item';

/**
 * Context provided to each item template of a {@link GroupListComponent}.
 */
export interface GroupListItemContext<C = unknown> {
    $implicit: GroupListItem;
    item: GroupListItem;
    context: C;
}

/**
 * Map of item type (see {@link GroupListItemType}) to the template used to
 * render items of that type. Types without a template are not displayed.
 */
export type GroupListTemplates = Partial<Record<string, TemplateRef<GroupListItemContext<any>>>>;

/**
 * A hierarchical, paginated list of connections, connection groups, and
 * sharing profiles.
 */
@Component({
    selector: 'guac-group-list',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [NgTemplateOutlet, PagerComponent],
    host: { class: 'group-list' },
    template: `
        <ng-template #nestedItem let-item>
            @if (isVisible(item.type)) {
                <div [class]="item.type" [class.balancer]="item.balancing" [class.expanded]="item.expanded"
                     [class.expandable]="item.expandable" [class.empty]="!item.children.length">

                    <div class="caption">
                        @if (item.expandable) {
                            <div class="icon expand" (click)="toggleExpanded(item)"></div>
                        }
                        <ng-container *ngTemplateOutlet="templates()[item.type]!; context: { $implicit: item, item, context: context() }" />
                    </div>

                    @if (item.expanded) {
                        <div class="children">
                            @for (child of sortByName(item.children); track child) {
                                <div class="list-item">
                                    <ng-container *ngTemplateOutlet="nestedItem; context: { $implicit: child }" />
                                </div>
                            }
                        </div>
                    }

                </div>
            }
        </ng-template>

        <div class="group-list-page">
            @for (item of childrenPage(); track item) {
                <div class="list-item">
                    <ng-container *ngTemplateOutlet="nestedItem; context: { $implicit: item }" />
                </div>
            }
        </div>

        <guac-pager [(page)]="childrenPage" [items]="sortedRootItems()" [pageSize]="pageSize()" />
    `
})
export class GroupListComponent {

    private readonly activeConnectionService = inject(ActiveConnectionService);
    private readonly authenticationService = inject(AuthenticationService);
    private readonly dataSourceService = inject(DataSourceService);
    private readonly requestService = inject(RequestService);

    /** The root connection group (or item) of each data source. */
    readonly connectionGroups = input<Record<string, ConnectionGroup | GroupListItem> | null | undefined>();

    /** Arbitrary context made available to all item templates. */
    readonly context = input<unknown>();

    readonly templates = input.required<GroupListTemplates>();

    /** Whether the root group itself should be displayed. */
    readonly showRootGroup = input<boolean>(false);

    readonly pageSize = input<number | null | undefined>();

    /**
     * Function invoked with the root items whenever they change, allowing
     * items to be modified prior to display.
     */
    readonly decorator = input<((items: GroupListItem[]) => void) | null>();

    readonly childrenPage = signal<GroupListItem[]>([]);

    /** Active connection counts, keyed by data source and connection. */
    private readonly connectionCount = signal<Record<string, Record<string, number>>>({});

    /** Active connection counts of the current user. */
    private userConnectionCount: Record<string, Record<string, number>> = {};

    readonly rootItems = computed(() => {

        const rootItems: GroupListItem[] = [];
        const connectionGroups = this.connectionGroups() || {};

        for (const [dataSource, connectionGroup] of Object.entries(connectionGroups)) {

            const rootItem = (connectionGroup instanceof GroupListItem)
                ? connectionGroup
                : GroupListItem.fromConnectionGroup(dataSource, connectionGroup,
                    this.isVisible(GroupListItemType.CONNECTION),
                    this.isVisible(GroupListItemType.SHARING_PROFILE),
                    (dataSource, connection) => this.connectionCount()[dataSource]?.[connection.identifier!],
                    null,
                    (dataSource, group) => this.countUserActiveConnectionGroups(dataSource, group));

            if (this.showRootGroup())
                rootItems.push(rootItem);
            else
                rootItems.push(...rootItem.children);

        }

        this.decorator()?.(rootItems);
        return rootItems;

    });

    readonly sortedRootItems = computed(() => orderBy(this.rootItems(), ['weight', 'name']));

    constructor() {

        // Retrieve active connection counts whenever the groups change
        effect(() => {

            const dataSources = Object.keys(this.connectionGroups() || {});
            if (!dataSources.length)
                return;

            this.dataSourceService.apply(
                (dataSource) => this.activeConnectionService.getActiveConnections(dataSource),
                dataSources
            ).then(activeConnectionMap => {

                const currentUsername = this.authenticationService.getCurrentUsername();
                const connectionCount: Record<string, Record<string, number>> = {};
                this.userConnectionCount = {};

                for (const [dataSource, activeConnections] of Object.entries(activeConnectionMap)) {
                    const counts = connectionCount[dataSource] = {} as Record<string, number>;
                    const userCounts = this.userConnectionCount[dataSource] = {} as Record<string, number>;
                    for (const activeConnection of Object.values(activeConnections)) {
                        const identifier = activeConnection.connectionIdentifier;
                        counts[identifier] = (counts[identifier] || 0) + 1;
                        if (activeConnection.username === currentUsername)
                            userCounts[identifier] = (userCounts[identifier] || 0) + 1;
                    }
                }

                this.connectionCount.set(connectionCount);

            }, this.requestService.DIE);

        });

    }

    private countUserActiveConnectionGroups(dataSource: string, connectionGroup: ConnectionGroup): number {

        const userConnections = this.userConnectionCount[dataSource];
        if (!userConnections)
            return 0;

        let count = 0;
        for (const child of connectionGroup.childConnections || [])
            count += userConnections[child.identifier!] ?? 0;
        for (const child of connectionGroup.childConnectionGroups || [])
            count += this.countUserActiveConnectionGroups(dataSource, child);

        return count;

    }

    isVisible(type: string): boolean {
        return !!this.templates()[type];
    }

    toggleExpanded(item: GroupListItem): void {
        item.expanded = !item.expanded;
    }

    sortByName(items: GroupListItem[]): GroupListItem[] {
        return orderBy(items, 'name');
    }

}
