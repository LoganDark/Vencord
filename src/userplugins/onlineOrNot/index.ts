/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    treatIdleStatusAsOffline: {
        description: "Treat idle status as offline",
        type: OptionType.BOOLEAN,
        default: false
    },

    allowStreamingStatus: {
        description: "Allow streaming status",
        type: OptionType.BOOLEAN,
        default: false
    }
})

export default definePlugin({
    name: "OnlineOrNot",
    description: "Remove statuses that cause social anxiety",
    authors: [Devs.LoganDark],

    settings,

    patches: [
        {
            find: 'static displayName="PresenceStore";',
            replacement: [
                {
                    match: /(?<=let{(?:\i:\i,)*?status:\i(?:,\i:\i)*?}=)[^;]+/g,
                    replace: "$self.mapObjectStatus($&)"
                },
                {
                    match: /(?:\i\.)*\i\.status\b/g,
                    replace: "$self.mapStatus($&)"
                }
            ]
        }
    ],

    mapStatus(presence: string) {
        return (
            presence === "offline" ? "offline" :
            presence === "invisible" ? "invisible" :
            presence === "unknown" ? "unknown" :
            (presence === "idle" && !settings.store.treatIdleStatusAsOffline) ? "online" :
            (presence === "streaming" && settings.store.allowStreamingStatus) ? "streaming" :
            "online"
        );
    },

    mapObjectStatus(userObject: any) {
        return { ...userObject, status: this.mapStatus(userObject.status) }
    }
});
