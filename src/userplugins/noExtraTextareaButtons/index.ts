/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "NoExtraTextareaButtons",
    description: "Removes all the extra textarea buttons Discord's added since the emoji picker",
    authors: [Devs.LoganDark],

    allowedButtons: new Set(["emoji", "submit"]),

    patches: [
        {
            find: '},"appLauncher"))',
            replacement: {
                match: /(?<=\(0,\i\.jsx\)\("div",{className:\i\.\i,children:)(\i)(?=}\))/,
                replace: "$1.filter(node=>$self.allowedButtons.has(node.key))"
            }
        }
    ]
});
