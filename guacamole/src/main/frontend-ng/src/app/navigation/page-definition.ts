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
 * A page which may be navigated to.
 */
export interface PageDefinition {

    /**
     * The translation key of the page name. If an array, each element is
     * the name of the page at successively deeper levels of a hierarchy.
     */
    name: string | string[];

    /** The application-relative URL of the page, such as "/settings/users". */
    url: string;

    className?: string;

    /** Relative ordering of the page with respect to other pages. */
    weight?: number;

}

/**
 * An action which may be invoked from a menu.
 */
export interface MenuAction {

    /** The translation key of the action's label. */
    name: string;

    callback: () => void;

    className?: string;

}
