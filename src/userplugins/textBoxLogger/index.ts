/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "TextBoxLogger",
    description: "Logs textbox contents to console so you can recover it if the textbox eats it",
    authors: [Devs.LoganDark],

    flux: {
        DRAFT_CHANGE: (data: any) => {
            console.log("%s %s", data.channelId, data.draft);
        }
    }
});
