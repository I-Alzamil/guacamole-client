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

import { NgClass, NgStyle } from '@angular/common';
import {
    ApplicationRef, ChangeDetectionStrategy, Component, ComponentRef, Directive, ElementRef,
    EmbeddedViewRef, EnvironmentInjector, InjectionToken, Injector, OnDestroy, TemplateRef, Type,
    ViewContainerRef, afterNextRender, createComponent, inject, input
} from '@angular/core';
import { FocusDirective } from '../element/focus.directive';
import { GuacDatePipe } from '../locale/date.pipe';
import { TranslatePipe } from '../locale/translate.pipe';
import { getExtensionFormsModule } from './forms';

/**
 * The operations which an HTML patch may perform relative to each element
 * matching its CSS selector, as defined by the "name" attribute of the
 * patch's <meta> tag. These are identical to those of the AngularJS
 * application.
 */
type PatchOperationName = 'before' | 'after' | 'replace'
    | 'before-children' | 'after-children' | 'replace-children';

const OPERATIONS: PatchOperationName[] = ['before', 'after', 'replace',
    'before-children', 'after-children', 'replace-children'];

interface PatchOperation {
    name: PatchOperationName;
    selector: string;
}

/**
 * An HTML patch provided by an extension (listed within the "html" section of
 * its manifest): a template fragment and the operations describing where that
 * fragment should be inserted.
 */
interface Patch {
    operations: PatchOperation[];
    template: string;
    component?: Type<unknown>;
}

/**
 * All HTML patches of all installed extensions, in the order provided by the
 * web application.
 */
const patches: Patch[] = [];

/**
 * Directives, components, and pipes which may be used within HTML patches, in
 * addition to those of the application listed in compilePatch().
 */
const patchDeclarations: Type<unknown>[] = [];

/**
 * Service allowing extensions to define the directives, components, and pipes
 * available within their HTML patches, the equivalent of declaring an
 * AngularJS directive (which was then available within all templates).
 */
export const patchService = {

    /**
     * Makes the given directives, components, and/or pipes available within
     * all HTML patches.
     */
    registerDirective(...types: Type<unknown>[]): void {
        patchDeclarations.push(...types);
    }

};

/**
 * Parses and stores the given HTML patches (as returned by the "api/patches"
 * REST endpoint). Patches are parsed exactly as by the AngularJS application:
 * each <meta> tag having a valid operation name and content (CSS selector)
 * defines an operation, and all other content is the template fragment.
 * The fragment is otherwise left exactly as written, as parsing it as HTML
 * would lowercase the case-sensitive names used by Angular templates (such
 * as "ngModel").
 */
export function definePatches(sources: string[]): void {
    for (const source of sources) {

        const operations: PatchOperation[] = [];
        const template = source.replace(/<meta\b[^>]*>/gi, tag => {

            const meta = document.createElement('template');
            meta.innerHTML = tag;
            const element = meta.content.firstElementChild;

            const name = element?.getAttribute('name') as PatchOperationName;
            const selector = element?.getAttribute('content');
            if (!OPERATIONS.includes(name) || !selector)
                return tag;

            operations.push({ name, selector });
            return '';

        });

        if (operations.length)
            patches.push({ operations, template });

    }
}

/**
 * Whether any HTML patches are defined.
 */
export function hasPatches(): boolean {
    return patches.length > 0;
}

/**
 * Receives the TemplateRef of the fragment of a compiled patch.
 */
interface PatchTemplateSink {
    template?: TemplateRef<unknown>;
}

const PATCH_TEMPLATE_SINK = new InjectionToken<PatchTemplateSink>('PATCH_TEMPLATE_SINK');

/**
 * Captures the <ng-template> containing the fragment of a compiled patch.
 */
@Directive({ selector: 'ng-template[guacPatchTemplate]' })
export class PatchTemplateDirective {
    constructor() {
        inject(PATCH_TEMPLATE_SINK).template = inject(TemplateRef);
    }
}

/**
 * Compiles the template fragment of the given patch (once). Within the
 * fragment, all variables provided by the patch point (such as "item" or
 * "client") are available, as are the variables of the AngularJS scope at
 * that point.
 */
function compilePatch(patch: Patch): Type<unknown> {
    return patch.component ??= Component({
        selector: 'guac-patch',
        changeDetection: ChangeDetectionStrategy.Eager,
        imports: [FocusDirective, getExtensionFormsModule(), GuacDatePipe, NgClass, NgStyle,
            PatchTemplateDirective, TranslatePipe, ...patchDeclarations],
        providers: [{ provide: PATCH_TEMPLATE_SINK, useFactory: () => ({}) }],
        template: '<ng-template guacPatchTemplate>' + patch.template + '</ng-template>'
    })(class PatchContext {});
}

/**
 * Marks an element of the application which HTML patches may target. All
 * patches whose selectors match the element (or elements within content
 * inserted by other patches) are applied, with the given variables available
 * to the patch. As the templates of the application are compiled ahead of
 * time, only elements bearing this directive may be patched.
 */
@Directive({ selector: '[guacPatchPoint]' })
export class PatchPointDirective implements OnDestroy {

    /**
     * The variables available to patches applied at this point.
     */
    readonly guacPatchPoint = input<Record<string, unknown> | ''>('');

    private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    private readonly viewContainer = inject(ViewContainerRef);
    private readonly appRef = inject(ApplicationRef);
    private readonly environmentInjector = inject(EnvironmentInjector);
    private readonly injector = inject(Injector);

    private readonly components: ComponentRef<unknown>[] = [];
    private readonly views: EmbeddedViewRef<unknown>[] = [];

    constructor() {
        if (hasPatches())
            afterNextRender(() => this.patch(this.element, 0));
    }

    /**
     * Applies all patches matching the given element, recursively patching
     * any content inserted.
     */
    private patch(element: Element, depth: number): void {

        if (depth > 10)
            return;

        for (const patch of patches) {
            for (const operation of patch.operations) {
                if (element.isConnected && element.matches(operation.selector)) {
                    const nodes = this.render(patch);
                    insert(operation.name, element, nodes);
                    for (const node of nodes) {
                        if (node instanceof Element)
                            [node, ...Array.from(node.querySelectorAll('*'))]
                                .forEach(child => this.patch(child, depth + 1));
                    }
                }
            }
        }

    }

    /**
     * Renders the fragment of the given patch, returning its root nodes.
     */
    private render(patch: Patch): Node[] {

        const component = createComponent(compilePatch(patch), {
            environmentInjector: this.environmentInjector,
            elementInjector: this.injector
        });

        Object.assign(component.instance as object, this.guacPatchPoint() || {});
        this.appRef.attachView(component.hostView);
        component.changeDetectorRef.detectChanges();
        this.components.push(component);

        const view = this.viewContainer.createEmbeddedView(
            component.injector.get(PATCH_TEMPLATE_SINK).template!);
        view.detectChanges();
        this.views.push(view);

        return view.rootNodes;

    }

    ngDoCheck(): void {
        const variables = this.guacPatchPoint() || {};
        for (const component of this.components)
            Object.assign(component.instance as object, variables);
    }

    ngOnDestroy(): void {
        for (const view of this.views)
            view.destroy();
        for (const component of this.components) {
            this.appRef.detachView(component.hostView);
            component.destroy();
        }
    }

}

/**
 * Inserts the given nodes relative to the given element, as dictated by the
 * given patch operation.
 */
function insert(operation: PatchOperationName, element: Element, nodes: Node[]): void {
    switch (operation) {

        case 'before':
            element.before(...nodes);
            break;

        case 'after':
            element.after(...nodes);
            break;

        case 'replace':
            element.after(...nodes);
            (element as HTMLElement).hidden = true;
            break;

        case 'before-children':
            element.prepend(...nodes);
            break;

        case 'after-children':
            element.append(...nodes);
            break;

        case 'replace-children':
            for (const child of Array.from(element.children))
                (child as HTMLElement).hidden = true;
            element.append(...nodes);
            break;

    }
}
