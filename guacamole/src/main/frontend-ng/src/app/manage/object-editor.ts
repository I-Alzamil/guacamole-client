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

import { DestroyRef, Directive, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { combineLatest } from 'rxjs';
import { AuthenticationService } from '../auth/authentication.service';
import { RequestService } from '../rest/request.service';

/**
 * The parameters of an object editor, as specified within the URL.
 */
export interface ObjectEditorParams {

    /** The data source containing the object. */
    dataSource: string;

    /** The identifier of the object being edited, if it exists. */
    identifier?: string;

    /** The identifier of the object being cloned, if any. */
    cloneSource?: string;

    /** The identifier of the parent of a new object, if any. */
    parent?: string;

}

/**
 * Base for all object editors (connections, users, etc.), parsing the
 * editor parameters from the URL and (re)loading the editor whenever they
 * change. Editors are reused by the router across URLs, such as when an
 * object is cloned.
 */
@Directive()
export abstract class ObjectEditor implements OnInit {

    protected readonly authenticationService = inject(AuthenticationService);
    protected readonly requestService = inject(RequestService);
    protected readonly router = inject(Router);

    readonly params = signal<ObjectEditorParams | null>(null);

    /** Whether all data required by the editor has been loaded. */
    readonly loaded = signal(false);

    protected readonly encode = encodeURIComponent;

    private readonly route = inject(ActivatedRoute);
    private readonly destroyRef = inject(DestroyRef);

    /**
     * Begins loading the editor. Loading begins only once construction is
     * complete, as the route parameters are emitted synchronously and the
     * services used by subclasses are not available until then.
     */
    ngOnInit(): void {

        const subscription = combineLatest([this.route.paramMap, this.route.queryParamMap]).subscribe(([params, query]) => {

            const editorParams: ObjectEditorParams = {
                dataSource: params.get('dataSource')!,
                identifier: params.get('id') || undefined,
                cloneSource: query.get('clone') || undefined,
                parent: query.get('parent') || undefined
            };

            this.params.set(editorParams);
            this.loaded.set(false);

            this.load(editorParams).then(() => this.loaded.set(true), this.requestService.DIE);

        });

        this.destroyRef.onDestroy(() => subscription.unsubscribe());

    }

    /**
     * Loads all data required to edit the object described by the given
     * parameters.
     */
    protected abstract load(params: ObjectEditorParams): Promise<void>;

    /**
     * Navigates to the editor for a new copy of the current object.
     */
    protected navigateToClone(type: string): void {
        const params = this.params()!;
        this.router.navigate(['/manage', params.dataSource, type], { queryParams: { clone: params.identifier } });
        window.scrollTo(0, 0);
    }

}
