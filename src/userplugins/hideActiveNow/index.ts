/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "HideActiveNow",
    description: 'Hide "Active Now" in Friends and various other places',
    authors: [Devs.LoganDark],

    patches: [
        {
            find: '"refresh-active-now"',
            replacement: {
                match: /(?=\(0,\i\.jsx\)\("div",{className:\i\.\i,children:\(0,\i\.jsx\)\((?:\i\.)?\i,{}\)}\);return \i=\i===(?:\i\.)+ADD_FRIEND\?)/,
                replace: "true?null:"
            }
        },
        {
            // Keep occupied voice channels hidden while the voice channels section is collapsed
            find: '"placeholder-channel-id"',
            replacement: {
                match: /(?<=this\.category\.isCollapsed\?)(?=.{0,20}getVoiceStatesForChannel\(this\.record\.id\))/,
                replace: "false&&"
            }
        },
        {
            // Hide the "N in Voice" jump button that points at that section
            find: '"ChannelListUnreadsStore"',
            replacement: {
                match: /(?=\?\i=\{mode:"voice-channels")/,
                replace: "&&false"
            }
        }
    ]
});
