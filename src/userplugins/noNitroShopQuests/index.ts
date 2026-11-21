/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "NoNitroShopQuests",
    description: "Remove Nitro, Shop, Quests tabs and Orbs",
    authors: [Devs.LoganDark],

    bannedKeys: new Set(["nitro-tab-group", "discord-shop", "quests"]),

    patches: [
        { // exclude nitro, shop, quests from DMs list
            find: ";renderDM=(",
            replacement: {
                match: /{let \i=\i\.filter\((\i)=>[^)]+/,
                replace: "$&&&!$self.bannedKeys.has($1.key)"
            }
        },
        { // exclude nitro, shop, quests from alt+arrows
            // ;o>=a.length?o=0:o<0&&(o=a.length-1);
            find: /;(\i)>=(\i)\.length\?\1=0:\1<0&&\(\1=\2\.length-1\);/,
            replacement: [
                {
                    match: /\i\.(?:\i\.)*(?:APPLICATION_STORE|COLLECTIBLES_SHOP|QUEST_HOME)\b/g,
                    replace: "null"
                }
            ]
        },
        { // don't redirect to quests at startup
            find: '"SessionRedirector"',
            replacement: {
                match: /\(0,\i\.\i\)\("SessionRedirector"\)/,
                replace: "false"
            }
        },
        { // remove wishlist tab from profile modals
            find: ',parentComponent:"UserProfileModalV2",',
            replacement: {
                match: /\i\.push\({[^}]+?WISHLIST[^}]*}\)/,
                replace: "(true?null:$&)"
            }
        },
        { // remove orbs from the account popout
            find: 'action:"PRESS_ORBS"',
            replacement: [
                {
                    match: /\(0,\i\.jsx\)\(\i,{popoutContainerRef:\i,scrollerRef:\i,shouldScrollIntoView:\i,onCloseAccountPopout:\i}\)/,
                    replace: "null"
                },
                { // never request the introduction tooltip on the account panel
                    match: /\[\i\.\i\.ORB_WALLET_PROFILE_INTRODUCTION_COACHMARK\]/,
                    replace: "[]"
                }
            ]
        },
        { // remove quest rewards ("Claim Orbs") from Active Now
            find: 'ACTIVITY_PANEL,"NowPlaying")',
            replacement: [
                { // don't ask the server which quests to show
                    match: /\(0,\i\.\i\)\(\i,\i\.\i\.ACTIVITY_PANEL,"NowPlaying"\)/,
                    replace: "void 0"
                },
                { // don't display any quests that are already known
                    match: /(?<=party:\i,quest:)\i\.get\(\i\.id\)/,
                    replace: "void 0"
                }
            ]
        }
    ]
});
