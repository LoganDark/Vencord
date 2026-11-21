/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    showMessageTimestampsOnHover: {
        description: "Show message timestamps on hover",
        type: OptionType.BOOLEAN,
        default: true,
        restartNeeded: true
    },

    hideDayDividersInChannels: {
        description: "Hide day dividers in channels",
        type: OptionType.BOOLEAN,
        default: true,
        restartNeeded: true
    }
})

export default definePlugin({
    name: "NoTimestamps",
    description: "Removes timestamps from messages and channels",
    authors: [Devs.LoganDark],

    settings,

    patches: [
        { // Prevent dividers from appearing for different days
            find: ".NON_COLLAPSIBLE.has(",
            predicate: () => settings.store.hideDayDividersInChannels,
            replacement: {
                match: /let \i=\(0,[^)]+\)\(\i\.timestamp,"LL"\);[^(]+\(\i\.push\({[^}]+}\),[^)]+\);/g,
                replace: ""
            }
        },
        { // Prevent midnight from splitting message groups
            find: ".additionalName)!==",
            predicate: () => settings.store.hideDayDividersInChannels,
            replacement: {
                // !isSameDay(a.timestamp,b.timestamp)||!isWithin(a.timestamp,b.timestamp,interval)
                match: /!\(0,\i\.\i\)\((\i)\.timestamp,(\i)\.timestamp\)\|\|(?=!\(0,\i\.\i\)\(\1\.timestamp,\2\.timestamp,\i\))/,
                replace: ""
            }
        },
        { // Modify timestamp display for user messages
            // showTimestampOnHover: also matches the module that renders this one
            find: "usernameSpanId:",
            replacement: [
                {
                    predicate: () => !settings.store.showMessageTimestampsOnHover,
                    match: /(?<=let{(?:\i:\i,)*?showTimestampOnHover:\i(?:,\i:\i)*?}=)[^,;]+/g,
                    replace: "{...$&,showTimestamp:false}"
                },
                {
                    predicate: () => settings.store.showMessageTimestampsOnHover,
                    match: /(?<=timestamp:[^,]+,)(?=className:)/g,
                    replace: "isVisibleOnlyOnHover:true,"
                }
            ]
        },
        { // Modify timestamp display for system messages
            find: '"data-accessibility":"desaturate",className:',
            replacement: [
                {
                    predicate: () => !settings.store.showMessageTimestampsOnHover,
                    match: /(?<=let{(?:\i:\i,)*?timestampClassName:\i(?:,\i:\i)*?}=)[^,;]+/g,
                    replace: "{...$&,timestamp:null}"
                },
                {
                    predicate: () => settings.store.showMessageTimestampsOnHover,
                    match: /(?<={timestamp:[^,]+,)(?=timestampFormat:)/g,
                    replace: "isVisibleOnlyOnHover:true,"
                }
            ]
        }
    ]
});
