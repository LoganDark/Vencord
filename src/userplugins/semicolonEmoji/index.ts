/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "SemicolonEmoji",
    description: "Makes ; bring up the emoji autocomplete just like : does",
    authors: [Devs.LoganDark],

    patches: [
        { // let the emoji autocomplete match words starting with ;
            find: '"parentAutocompleteInputValue is null',
            replacement: {
                match: /!(\i)\.startsWith\((\i)\.sentinel\)/,
                replace: "!$self.startsWithSentinel($1,$2.sentinel)"
            }
        },
        { // find ; after an opening parenthesis, like the other sentinels
            find: "didTrimPrefix:",
            replacement: {
                match: /\[(?="[^"\]]+"(?:,"[^"\]]+")*\]\.sort\()/,
                replace: '$&";",'
            }
        }
    ],

    startsWithSentinel(query: string, sentinel: string) {
        return query.startsWith(sentinel) || sentinel === ":" && query.startsWith(";");
    }
});
