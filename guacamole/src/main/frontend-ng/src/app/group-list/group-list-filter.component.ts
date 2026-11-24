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

import { ChangeDetectionStrategy, Component, computed, effect, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FilterPattern } from '../list/filter-pattern';
import { ConnectionGroup } from '../rest/types/model';
import { GroupListItem, GroupListItemType } from './group-list-item';

type GroupMap = Record<string, ConnectionGroup | GroupListItem>;

/**
 * Recursively flattens the given connection group, such that all
 * descendant connections and groups become direct children.
 */
function flattenConnectionGroup(connectionGroup: ConnectionGroup): ConnectionGroup {

    const flattened: ConnectionGroup = {
        ...connectionGroup,
        childConnections: [...(connectionGroup.childConnections || [])],
        childConnectionGroups: [...(connectionGroup.childConnectionGroups || [])]
    };

    for (const child of connectionGroup.childConnectionGroups || []) {
        const flattenedChild = flattenConnectionGroup(child);
        flattened.childConnections!.push(...flattenedChild.childConnections!);
        flattened.childConnectionGroups!.push(...flattenedChild.childConnectionGroups!);
    }

    return flattened;

}

/**
 * Recursively flattens the given group list item, such that all descendant
 * items become direct children.
 */
function flattenGroupListItem(item: GroupListItem): GroupListItem {

    const flattened = new GroupListItem({ ...item, children: [...item.children] });
    flattened.getActiveConnections = item.getActiveConnections;

    for (const child of item.children) {
        if (child.type === GroupListItemType.CONNECTION_GROUP)
            flattened.children.push(...flattenGroupListItem(child).children);
    }

    return flattened;

}

/**
 * A text field which filters the connections and connection groups within a
 * set of root connection groups. While filtering, the hierarchy is
 * flattened such that all matching objects are visible.
 */
@Component({
    selector: 'guac-group-list-filter',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule],
    host: { class: 'group-list-filter filter' },
    template: `
        <input class="search-string" type="text" [placeholder]="placeholder() ?? ''"
               [ngModel]="searchString()" (ngModelChange)="searchString.set($event)">
    `
})
export class GroupListFilterComponent {

    readonly placeholder = input<string | null>();

    /** The root connection groups to filter, keyed by data source. */
    readonly connectionGroups = input<GroupMap | null | undefined>();

    /** The property paths of connections which should be searched. */
    readonly connectionProperties = input<string[]>(['name']);

    /** The property paths of connection groups which should be searched. */
    readonly connectionGroupProperties = input<string[]>(['name']);

    /** The filtered root connection groups. */
    readonly filteredConnectionGroups = model<GroupMap>({});

    readonly searchString = signal('');

    private readonly connectionFilter = computed(() => new FilterPattern(this.connectionProperties()));
    private readonly connectionGroupFilter = computed(() => new FilterPattern(this.connectionGroupProperties()));

    constructor() {
        effect(() => {

            const searchString = this.searchString();
            const connectionFilter = this.connectionFilter();
            const connectionGroupFilter = this.connectionGroupFilter();
            const connectionGroups = this.connectionGroups() || {};

            connectionFilter.compile(searchString);
            connectionGroupFilter.compile(searchString);

            if (!searchString) {
                this.filteredConnectionGroups.set(connectionGroups);
                return;
            }

            const filtered: GroupMap = {};
            for (const [dataSource, connectionGroup] of Object.entries(connectionGroups)) {

                if (connectionGroup instanceof GroupListItem) {
                    const item = flattenGroupListItem(connectionGroup);
                    item.children = item.children.filter(child => {
                        switch (child.type) {
                            case GroupListItemType.CONNECTION:
                                return connectionFilter.predicate(child.wrappedItem);
                            case GroupListItemType.CONNECTION_GROUP:
                                return connectionGroupFilter.predicate(child.wrappedItem);
                        }
                        return true;
                    });
                    filtered[dataSource] = item;
                }

                else {
                    const group = flattenConnectionGroup(connectionGroup);
                    group.childConnections = group.childConnections!.filter(connectionFilter.predicate);
                    group.childConnectionGroups = group.childConnectionGroups!.filter(connectionGroupFilter.predicate);
                    filtered[dataSource] = group;
                }

            }

            this.filteredConnectionGroups.set(filtered);

        });
    }

}
