/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "NoMobileStatuses",
    description: "Hide the mobile phone icon in statuses",
    authors: [Devs.LoganDark],

    patches: [
        {
            find: "}isMobileOnline(",
            replacement: {
                match: /(?<=}isMobileOnline\(\i\){)[^}]+?(?=})/g,
                replace: "return false"
            }
        }
    ]
});
