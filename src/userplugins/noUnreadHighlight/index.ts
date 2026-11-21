/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "NoUnreadHighlight",
    description: "Don't highlight unread private channels",
    authors: [Devs.LoganDark],

    patches: [
        {
            find: '({location:"PrivateChannel"})',
            replacement: [
                {
                    match: /\i\?"interactive-text-default":/,
                    replace: ""
                },
                {
                    match: /(?<=highlighted:)[^,]+/,
                    replace: "false"
                }
            ]
        }
    ]
});
