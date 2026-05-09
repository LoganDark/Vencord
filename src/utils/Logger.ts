/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

export class Logger {
    /**
     * Returns the console format args for a title with the specified background colour and black text
     * @param color Background colour
     * @param title Text
     * @returns Array. Destructure this into {@link Logger}.errorCustomFmt or console.log
     *
     * @example logger.error(...Logger.makeTitleElements("white", "Hello"), "World");
     */
    static makeTitle(color: string, title: string): [string, ...string[]] {
        return ["%c %c %s ", "", `background: ${color}; color: black; font-weight: bold; border-radius: 5px;`, title];
    }

    constructor(public name: string, public color: string = "white") { }

    private _log(level: "log" | "error" | "warn" | "info" | "debug", levelColor: string, fmt: any, ...args: any[]) {
        if (IS_REPORTER && IS_WEB && !IS_VESKTOP) {
            console[level]("[Vencord]", this.name + ":", ...args);
            return;
        }

        if (typeof fmt !== "string") {
            args.unshift(fmt);
            fmt = "%o";
        }

        console[level](
            `%c Vencord %c %c ${this.name} %c ${fmt}`,
            `background: ${levelColor}; color: black; font-weight: bold; border-radius: 5px;`,
            "",
            `background: ${this.color}; color: black; font-weight: bold; border-radius: 5px;`,
            "",
            ...args
        );
    }

    public log(fmt: any, ...args: any[]) {
        this._log("log", "#a6d189", fmt, ...args);
    }

    public info(fmt: any, ...args: any[]) {
        this._log("info", "#a6d189", fmt, ...args);
    }

    public error(fmt: any, ...args: any[]) {
        this._log("error", "#e78284", fmt, ...args);
    }

    public warn(fmt: any, ...args: any[]) {
        this._log("warn", "#e5c890", fmt, ...args);
    }

    public debug(fmt: any, ...args: any[]) {
        this._log("debug", "#eebebe", fmt, ...args);
    }
}
