/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "NoClosingPrivateChannels",
    description: "Hide the close button for DMs",
    authors: [Devs.LoganDark],

    patches: [
        {
            find: "PrivateChannel.renderAvatar:",
            replacement: [
                { // never render the close button
                    match: /\(0,\i\.jsx\)\(\i,{icon:\i\.XSmallIcon,/,
                    replace: "false&&$&"
                },
                { // don't reserve space for it on nameplated DMs
                    match: /("div",{className:\i\(\)\(\i\.\i,{\[\i\.\i\]:)\i(?=}\),children:\[[^\]]{0,40}callMessageId:)/,
                    replace: "$1false"
                }
            ]
        }
    ]
});
