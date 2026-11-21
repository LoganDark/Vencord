/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "NoReactionAddButton",
    description: "Remove the button to add reactions",
    authors: [Devs.LoganDark],

    patches: [
        {
            find: "reactionsCount:this.props.message.reactions.length",
            replacement: {
                match: /(?<=let{(?:\i:\i,)*?forceHideReactionCreates:\i(?:,\i:\i)*?}=)[^,;]+/g,
                replace: "{...$&,forceHideReactionCreates:true}"
            }
        }
    ]
});
