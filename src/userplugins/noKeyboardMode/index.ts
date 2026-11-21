/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "NoKeyboardMode",
    description: "Prevent Discord from entering keyboard mode (the blue focus outline)",
    authors: [Devs.LoganDark],

    patches: [
        {
            find: "ACCESSIBILITY_KEYBOARD_MODE_ENABLE:",
            replacement: {
                match: /(?<=ACCESSIBILITY_KEYBOARD_MODE_ENABLE:function\(\)\{)/,
                replace: "return false;"
            }
        },
        // Without this, Tab would be swallowed in text inputs on every press, as keyboard mode never turns on
        {
            find: ".maybeShowKeyboardNavigationExplainerModal()",
            replacement: {
                match: /\(0,\i\.\i\)\(\),\i&&!\i&&\i\.preventDefault\(\)/,
                replace: "void 0"
            }
        },
        // Discord's own Tab handler focuses the chat box, but only if it finds the marker that the rich editor sets.
        // The legacy chat input never sets it, so Tab falls through to the browser. Give it the same marker
        {
            find: ".hasOpenCodeBlock()",
            replacement: {
                match: /disabled:(\i)\|\|\i,(?=required:\i,onChange:this\.handleOnChange)/,
                replace: '$&"data-can-focus":!$1,'
            }
        }
    ]
});
