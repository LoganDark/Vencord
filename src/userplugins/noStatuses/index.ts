/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { User } from "@vencord/discord-types";
import { UserStore } from "@webpack/common";

export default definePlugin({
    name: "NoStatuses",
    description: "Hide all activities and custom statuses of other users",
    authors: [Devs.LoganDark],

    patches: [
        { // pass user to hasActivity
            find: /\(0,\i\.\i\)\({activities:\i,status:\i,applicationStream:(?!null)\i,voiceChannel:\i}\)/,
            all: true,
            replacement: {
                match: /(?<=(?:let|,){(?:(?:\i|"[^"]+"):\i(?:=[^,}]+)?,)*?(?:user|currentUser):(\i)(?:=[^,}]+)?(?:,(?:\i|"[^"]+"):\i(?:=[^,}]+)?)*?}=.{0,10000}?\(0,\i\.\i\)\({)(?=activities:\i,status:\i,applicationStream:\i,voiceChannel:\i}\))/g,
                replace: "user:$1,"
            }
        },
        { // pass user to hasActivity in the DM header
            find: ".GameProfileSources.DmHeaderActivity",
            replacement: {
                match: /(?<=\[(\i),\i,\i\]=.{0,100}?\.getUser\(\i\),.{0,200}?\(0,\i\.\i\)\({)(?=activities:\i,status:\i,applicationStream:null)/,
                replace: "user:$1,"
            }
        },
        { // use user in hasActivity
            find: /{activities:\i,status:\i,applicationStream:\i,voiceChannel:\i}=\i;/,
            replacement: {
                match: /(?<=function\((\i)\){)(?=let{activities:)/,
                replace: "if(!$self.shouldAllowUserStatus($1.user))return false;"
            }
        },
        { // empty the status text in member lists, DM lists, friends lists, etc.
            find: '("ActivityStatus")',
            replacement: {
                match: /(?<=\.isBlockedOrIgnored\((\i)\?\.id\))/,
                replace: "||!$self.shouldAllowUserStatus($1)"
            }
        },
        { // remove custom status bubble from all profiles
            find: ".USER_PROFILE_CUSTOM_STATUS_BUBBLE)",
            replacement: {
                match: /(?<=disableToolbar:[^}]+}=\i,\i=)\(0,\i\.\i\)\((\i)\.id\)/,
                replace: "$self.gate($1,$&)"
            }
        },
        { // remove activity section from profile popouts and sidebars
            find: '"PRESS_SHOW_MORE_ACTIVITY",analyticsLocations:',
            replacement: {
                match: /(?<=cards:\i,isOffline:\i}=)\(0,\i\.\i\)\({userId:(\i)\.id,[^}]+}\)/,
                replace: "$self.gate($1,$&,{cards:[],isOffline:true})"
            }
        },
        {
            find: ',parentComponent:"UserProfileModalV2",',
            replacement: [
                { // remove activity tab from profile modals
                    match: /(?<=\(0,\i\.jsx\)\(\i,{user:(\i),currentUser:\i,[^}]*?items:)\i(?=,initialSection:)/,
                    replace: "$self.filterProfileTabs($1,$&)"
                },
                { // empty the activity tab for when it is the only tab and has to stay
                    match: /(?<=\i===\i\.\i\.ACTIVITY\?)(?=\(0,\i\.jsx\)\(\i,{user:(\i),)/,
                    replace: "!$self.shouldAllowUserStatus($1)?null:"
                }
            ]
        }
    ],

    shouldAllowUserStatus(user?: User | null) {
        if (user == null) return false;

        return user.id === UserStore.getCurrentUser()?.id ||
               user.id === "464990590149328906" || // LilyCelebi
               user.id === "522286436892934165" || // Kat-7
               user.id === "231550637672890369"; // {FAMOUS-CORE}
    },

    // Evaluates hooks unconditionally and only then discards their result, so the hook order never changes
    gate<T>(user: User | null | undefined, value: T, fallback?: T) {
        return this.shouldAllowUserStatus(user) ? value : fallback;
    },

    filterProfileTabs(user: User, items: { section: string; }[]) {
        if (this.shouldAllowUserStatus(user)) return items;

        // The modal crashes without any tabs
        const filtered = items.filter(item => item.section !== "ACTIVITY");
        return filtered.length > 0 ? filtered : items;
    }
});
