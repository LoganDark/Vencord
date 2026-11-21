/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "HideActiveNow",
    description: 'Hide "Active Now" sidebar in friends list',
    authors: [Devs.LoganDark],

    patches: [
        {
            find: '"refresh-active-now"',
            replacement: {
                match: /(?=\(0,\i\.jsx\)\("div",{className:\i\.\i,children:\(0,\i\.jsx\)\((?:\i\.)?\i,{}\)}\);return \i=\i===(?:\i\.)+ADD_FRIEND\?)/,
                replace: "true?null:"
            }
        }
    ]
});
