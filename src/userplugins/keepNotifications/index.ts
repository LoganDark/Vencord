/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "KeepNotifications",
    description: "Prevent Discord from deleting notifications from the Notification Center",
    authors: [Devs.LoganDark],

    patches: [
        {
            find: '.on("NOTIFICATION_CLICK",',
            replacement: {
                match: /\i\.close\(\)/g,
                replace: "void 0"
            }
        }
    ]
});
