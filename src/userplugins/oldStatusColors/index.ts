/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "OldStatusColors",
    description: "Bring back the old status colors",
    authors: [Devs.LoganDark],

    patches: [
        {
            find: ".Masks.STATUS_TYPING",
            replacement: [
                {
                    match: /(?:\i\.)+unsafe_rawColors.GREEN_\w+/g,
                    replace: '$self.fakeColor("#43b581")'
                },
                {
                    match: /(?:\i\.)+unsafe_rawColors.YELLOW_\w+/g,
                    replace: '$self.fakeColor("#faa61a")'
                },
                {
                    match: /(?:\i\.)+unsafe_rawColors.RED_\w+/g,
                    replace: '$self.fakeColor("f04747")'
                },
                {
                    match: /(?:\i\.)+unsafe_rawColors.TWITCH/g,
                    replace: '$self.fakeColor("#593695")'
                },
                {
                    match: /(?:\i\.)+unsafe_rawColors.NEUTRAL_\w+/g,
                    replace: '$self.fakeColor("#808080")'
                }
            ]
        }
    ],

    fakeColor: (hex: string) => ({
        resolve: () => Object.fromEntries(
            (["spring", "hsl", "hex", "int", "rgba"] as const)
                .map(k => [k, () => hex] as const)
        )
    })
});
