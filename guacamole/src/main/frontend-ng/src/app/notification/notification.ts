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

import { Form } from '../rest/types/field';
import { TranslatableMessage } from '../rest/types/translatable-message';

/**
 * A button which may be associated with a notification.
 */
export interface NotificationAction {

    /** The translation key of the action's label. */
    name: string;

    /** Invoked when the action is selected. */
    callback: () => void;

    /** CSS class to apply to the action's button, if any. */
    className?: string;

}

/**
 * A countdown which may be associated with a notification, invoking a
 * callback once expired.
 */
export interface NotificationCountdown {

    /**
     * The translation key of the countdown text. The number of seconds
     * remaining is provided as the REMAINING variable.
     */
    text: string;

    /** The number of seconds remaining in the countdown. */
    remaining: number;

    /** Invoked once the countdown reaches zero. */
    callback?: () => void;

}

/**
 * Progress which may be associated with a notification.
 */
export interface NotificationProgress {

    /**
     * The translation key of the progress text. The value and unit are
     * provided as the PROGRESS and UNIT variables.
     */
    text?: string;

    value?: number;

    unit?: string;

    /** Progress as a value between 0 and 1. */
    ratio?: number;

}

/**
 * A notification which may be displayed to the user, either as the global
 * status modal or within the notification list of a client.
 */
export interface Notification {

    className?: string;

    /** The translation key of the notification title. */
    title?: string;

    text?: TranslatableMessage;

    formNamespace?: string;

    forms?: Form[];

    formModel?: Record<string, string>;

    formSubmitCallback?: () => void;

    actions?: NotificationAction[];

    progress?: NotificationProgress;

    countdown?: NotificationCountdown;

}
