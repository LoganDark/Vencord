/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { MainSettingsIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { FluxStore } from "@vencord/discord-types";
import { useSyncExternalStore } from "@webpack/common";

type AddProps<
    B extends {},
    S extends {}
> = B & Omit<S, keyof B>;

type Node<
    T extends Node.Type = Node.Type,
    K extends string = string,
    P extends {} = {}
> = AddProps<Node.Props<T, K>, P>;

/*

n(415506);
var r = n(54381);
n(473749);
var i = n(28682)
  , a = n(30434)
  , o = n(550964)
  , s = n(558731)
  , l = n(465315)
  , c = n(976713)
  , u = n(72704)
  , d = n(555361)
  , f = n(370100)
  , p = n(867694)
  , _ = n(4794)
  , m = n(142118)
  , h = n(149865)
  , g = n(409322)
  , E = n(357660)
  , b = n(706873)
  , y = n(166292);
function O(e) {
    let {node: t} = e;
    switch (t.type) {
    case i.Jq.ROOT:
    case i.Jq.SECTION:
    case i.Jq.SIDEBAR_ITEM:
    case i.Jq.TAB_ITEM:
        throw Error("".concat(t.type, " nodes should never be rendered directly"));
    case i.Jq.PANEL:
        return (0,
        r.jsx)(E.T, { // 357660
            node: t
        });
    case i.Jq.LIST:
        return (0,
        r.jsx)(g.Z, { // 409322
            node: t
        });
    case i.Jq.FIELD_SET:
        return (0,
        r.jsx)(h.Z, { // 149865
            node: t
        });
    case i.Jq.RELATED:
        return (0,
        r.jsx)(b.Z, { // 706873
            node: t
        });
    case i.Jq.CATEGORY:
        return (0,
        r.jsx)(m.Z, { // 142118
            node: t
        });
    case i.Jq.ACCORDION:
        return (0,
        r.jsx)(_.Z, { // 4794
            node: t
        });
    case i.Jq.SPLIT:
        return (0,
        r.jsx)(y.Z, { // 166292
            node: t
        });
    case i.Jq.TOGGLE:
        return (0,
        r.jsx)(p.I, { // 867694
            node: t
        });
    case i.Jq.STATIC:
        return (0,
        r.jsx)(f.Z, { // 370100
            node: t
        });
    case i.Jq.BUTTON:
        return (0,
        r.jsx)(s.I, { // 558731
            node: t
        });
    case i.Jq.SELECT:
        return (0,
        r.jsx)(u.Z, { // 72704
            node: t
        });
    case i.Jq.RADIO:
        return (0,
        r.jsx)(c.Z, { // 976713
            node: t
        });
    case i.Jq.SLIDER:
        return (0,
        r.jsx)(d.Z, { // 555361
            node: t
        });
    case i.Jq.NAVIGATOR:
        return (0,
        r.jsx)(l.Z, { // 465315
            node: t
        });
    case i.Jq.CUSTOM:
        return (0,
        r.jsx)(o.X, { // 550964
            children: (0,
            r.jsx)(t.Component, {})
        })
    }
}
function v(e) {
    let {node: t} = e;
    return t.type === i.Jq.PANEL ? (0,
    r.jsx)(O, {
        node: t
    }) : (0,
    r.jsx)(a.Z, {
        node: t,
        children: (0,
        r.jsx)(O, {
            node: t
        })
    })
}

*/

namespace Node {
    export enum Type {
        ROOT = 0,
        SECTION = 1,
        SIDEBAR_ITEM = 2,
        PANEL = 3,
        SPLIT = 4,
        CATEGORY = 5,
        ACCORDION = 6,
        LIST = 7,
        RELATED = 8,
        FIELD_SET = 9,
        TAB_ITEM = 10,
        STATIC = 11,
        BUTTON = 12,
        TOGGLE = 13,
        SLIDER = 14,
        SELECT = 15,
        RADIO = 16,
        NAVIGATOR = 17,
        CUSTOM = 18
    }

    export type Props<
        T extends Type = Type,
        K extends string = string
    > = { key: K, type: T } & SearchableProps;

    /** Props for nodes that can be searched */
    export type SearchableProps = {
        /** If specified, returns an array of search terms for the node */
        readonly useSearchTerms?: () => string[];

        /** If specified, returns a single search term for the node */
        readonly getLegacySearchKey?: () => string;
    };

    /** Props for nodes that can have a predicate */
    export type PredicateProps = {
        /** If specified, returns whether the node should be shown */
        readonly usePredicate?: () => boolean;
    };

    /** Props for nodes that can have a title */
    export type TitleProps = {
        /** If specified, returns the title to use for the node */
        readonly useTitle?: () => string | NonNullable<React.ReactElement>;
    };

    /** Props for nodes that can have a badge */
    export type BadgeProps = {
        /** If specified, returns the badge to use for the node */
        readonly useBadge?: React.JSXElementConstructor<undefined>;
    };

    /** Props for nodes that can have a subtitle */
    export type SubtitleProps = {
        /** If specified, returns the subtitle to use for the node */
        readonly useSubtitle?: () => string | NonNullable<React.ReactElement>;
    };

    /** Props for nodes that can have an initializer */
    export type InitializeProps = {
        /** If specified, will be called on mount and can return a destructor called on unmount */
        readonly initialize?: () => (() => void) | null | undefined | void;
    };

    export type DisabledProps = {
        /** If specified, returns whether the node is disabled */
        readonly useDisabled?: () => boolean;
    }

    export type ParentProps<C extends readonly Node[]> = {
        /** If specified, returns an array of children for the node */
        readonly buildLayout?: () => C;
    };

    export type EmptyParentProps = {
        /** If specified, returns an empty array */
        readonly buildLayout?: () => readonly [];
    };

    export type CustomParentProps<P extends {} = {}> = {
        /** If specified, the component to use for the node */
        readonly StronglyDiscouragedCustomComponent: React.JSXElementConstructor<P>;
    } & EmptyParentProps;

    /** Props for nodes that can be a parent */
    export type MaybeCustomParentProps<
        C extends readonly Node[],
        P extends {} = {}
    > = ParentProps<C> | CustomParentProps<P>;

    declare class NoticeStore extends FluxStore {
        /** Returns whether this notice should be shown */
        readonly showNotice: () => boolean;

        /** If specified, returns whether to allow closing a panel showing this notice */
        readonly canCloseEarly?: () => boolean;
    }

    /** Props for nodes that can be a field */
    export type FieldProps<V> = {
        /** Returns the current value of the field */
        readonly useValue: () => V;

        /** Called when a new value of the field is selected */
        readonly setValue: (newValue: V) => void;
    };

    export const Root = <
        P extends Root.Props = Root.Props
    >(props: P) => construct(Type.ROOT, "$Root", props);

    export type Root<P extends Root.Props = Root.Props> = Node<Type.ROOT, "$Root", P>;

    export namespace Root {
        export type Props = ParentProps<readonly Section[]>;
    }

    const construct = <
        T extends Node.Type,
        K extends string,
        P extends {}
    >(type: T, key: K, props: P): Node<T, K, P> =>
        ({ key, type, ...props });

    export const Section = <
        K extends string = string,
        P extends Section.Props = Section.Props
    >(key: K, props: P) => construct(Type.SECTION, key, props);

    export type Section<
        K extends string = string,
        P extends Section.Props = Section.Props
    > = Node<Type.SECTION, K, P>;

    export const enum SectionTrailingType {
        BADGE_NEW = 0,
        BADGE_COUNT = 1,
        STRONGLY_DISCOURAGED_CUSTOM = 2
    }

    export namespace Section {
        export type CustomTrailing = {
            /** The type of element to place after the section title */
            readonly type: SectionTrailingType.STRONGLY_DISCOURAGED_CUSTOM;

            /** Returns a function to render the element */
            readonly useCustomDecoration: () => (visibleContent: unknown[], isSelected: boolean) => React.ReactElement;
        };

        export type Props = PredicateProps & {
            /** Whether to always display the section above the search box */
            readonly hoisted?: boolean;

            /** If specified, what to put after the section title */
            readonly trailing?: CustomTrailing;
        } & TitleProps & ParentProps<readonly SidebarItem[]>;
    }

    export const SidebarItem = <
        K extends string = string,
        P extends SidebarItem.Props = SidebarItem.Props
    >(key: K, props: P) => construct(Type.SIDEBAR_ITEM, key, props);

    export type SidebarItem<
        K extends string = string,
        P extends SidebarItem.Props = SidebarItem.Props
    > = Node<Type.SIDEBAR_ITEM, K, P>;

    export namespace SidebarItem {
        export type Props = PredicateProps & {
            /** If specified, the icon to use for the item */
            readonly icon?: React.JSXElementConstructor<{}>;

            /** If specified, the custom component to use for the item */
            readonly stronglyDiscouragedCustomComponent?: React.JSXElementConstructor<{}>;
        } & TitleProps & (({
            /** If specified, called when the item is clicked */
            readonly onClick?: never;
        } & ParentProps<[Panel]>) | ({
            /** If specified, called when the item is clicked */
            readonly onClick: () => void;
        } & EmptyParentProps));
    }

    export const Panel = <
        K extends string = string,
        P extends Panel.Props = Panel.Props
    >(key: K, props: P) => construct(Type.PANEL, key, props);

    export type Panel<
        K extends string = string,
        P extends Panel.Props = Panel.Props
    > = Node<Type.PANEL, K, P>;

    export namespace Panel {
        export type Notice = {
            /** Uses these Flux stores as sources for the notices */
            readonly stores?: readonly NoticeStore[];

            /** The React component to use for the notice */
            readonly element: React.JSXElementConstructor<{}>;
        };

        export type Props = TitleProps & BadgeProps & InitializeProps & {
            /** If specified and `true`, hide the panel when streamer mode is enabled */
            readonly hideInStreamerMode?: boolean;

            /** If specified, can show a notice in the panel */
            readonly notice?: Notice;
        } & MaybeCustomParentProps<readonly Category[] | readonly TabItem[]>;
    }

    export type Child = Panel | Split | Category | Accordion | List | Related | FieldSet | Static | Button | Toggle | Slider | Select | Radio | Navigator | Custom;

    export const Split = <
        K extends string = string,
        P extends Split.Props = Split.Props
    >(key: K, props: P) => construct(Type.SPLIT, key, props);

    export type Split<
        K extends string = string,
        P extends Split.Props = Split.Props
    > = Node<Type.SPLIT, K, P>;

    export namespace Split {
        export type Item = Child;
        export type Props = ParentProps<readonly Item[]>;
    }

    export const Category = <
        K extends string = string,
        P extends Category.Props = Category.Props
    >(key: K, props: P) => construct(Type.CATEGORY, key, props);

    export type Category<
        K extends string = string,
        P extends Category.Props = Category.Props
    > = Node<Type.CATEGORY, K, P>;

    export const enum CategoryNoticeType {
        INLINE_NOTICE = 0,
        STRONGLY_DISCOURAGED_CUSTOM = 1
    }

    export namespace Category {
        export type Notice = Notice.Inline | Notice.Custom;

        export namespace Notice {
            export type Inline = {
                /** The type of the notice */
                readonly noticeType: CategoryNoticeType.INLINE_NOTICE;

                /** Returns the text to use for the notice */
                readonly useText: () => string;
            }

            export type Custom = {
                /** The type of the notice */
                readonly noticeType: CategoryNoticeType.STRONGLY_DISCOURAGED_CUSTOM;

                /** The component to display for the notice */
                readonly notice: React.JSXElementConstructor<{}>;
            }
        }

        export type Item = Child;
        export type Props = InitializeProps & TitleProps & {
            /** If specified, returns an icon to display following the category title */
            readonly useTitleTrailingIcon?: () => React.JSXElementConstructor<{}>;
        } & SubtitleProps & {
            /** If specified, returns the label to use for the category in the subnav */
            readonly useSubnavLabel?: () => string;

            /** If specified, returns a notice to show */
            readonly useNotice?: () => Notice | null;
        } & TitleProps & ParentProps<readonly Item[]>;
    }

    export const Accordion = <
        K extends string = string,
        P extends Accordion.Props = Accordion.Props
    >(key: K, props: P) => construct(Type.ACCORDION, key, props);

    export type Accordion<
        K extends string = string,
        P extends Accordion.Props = Accordion.Props
    > = Node<Type.ACCORDION, K, P>;

    export namespace Accordion {
        export type Props = {
            /** If specified, returns the title to use for the accordion */
            readonly useTitle?: (isExpanded: boolean) => string;

            /** If specified, returns the subtitle to use for the accordion when collapsed */
            readonly useCollapsedSubtitle?: () => string;
        } & ParentProps<readonly Child[]>;
    }

    export const List = <
        K extends string = string,
        P extends List.Props = List.Props
    >(key: K, props: P) => construct(Type.LIST, key, props);

    export type List<
        K extends string = string,
        P extends List.Props = List.Props
    > = Node<Type.LIST, K, P>;

    export namespace List {
        export type Item = Child;

        export type Props = TitleProps & InitializeProps & {
            /** If specified, returns the number of items to display when not collapsed */
            readonly collapseAfter?: number;

            /** If specified, returns the title to use for the list */
            readonly useCollapsibleTitle?: (isExpanded: boolean, numExtra: number) => string;

            /** If specified, returns the subtitle to use for the list when collapsed */
            readonly useCollapsedSubtitle?: () => string;
        } & ParentProps<readonly Item[]>;
    }

    export const TabItem = <
        K extends string = string,
        P extends TabItem.Props = TabItem.Props
    >(key: K, props: P) => construct(Type.TAB_ITEM, key, props);

    export type TabItem<
        K extends string = string,
        P extends TabItem.Props = TabItem.Props
    > = Node<Type.TAB_ITEM, K, P>;

    export namespace TabItem {
        export type Item = Child;
        export type Props = {
            /** Returns the title to use for the node */
            readonly getTitle: () => string;
        } & ParentProps<readonly Child[]>;
    }

    export const Static = <
        K extends string = string,
        P extends Static.Props = Static.Props
    >(key: K, props: P) => construct(Type.STATIC, key, props);

    export type Static<
        K extends string = string,
        P extends Static.Props = Static.Props
    > = Node<Type.STATIC, K, P>;

    export namespace Static {
        export type Props = Required<TitleProps> & SubtitleProps;
    }

    export const Button = <
        K extends string = string,
        P extends Button.Props = Button.Props
    >(key: K, props: P) => construct(Type.BUTTON, key, props);

    export type Button<
        K extends string = string,
        P extends Button.Props = Button.Props
    > = Node<Type.BUTTON, K, P>;

    export namespace Button {
        export type Variant =
            "button" |
            "buttonChildrenWrapper" |
            "buttonChildren" |
            "icon" |
            "loading" |
            "spinnerWrapper" |
            "fadeIn" |
            "spinner-opacity-in" |
            "fadeOut" |
            "spinner-opacity-out" |
            "spinner-transform-in" |
            "spinner-transform-out" |
            "xs" |
            "hasText" |
            "sm" |
            "md" |
            "spinnerItem" |
            "spinner" |
            "spinner-sm" |
            "spinner-xs" |
            "spinner-md" |
            "spinner-lg" |
            "primary" |
            "secondary" |
            "icon-only" |
            "color-mix" |
            "input-accessory" |
            "critical-primary" |
            "critical-secondary" |
            "active" |
            "overlay-primary" |
            "overlay-secondary" |
            "expressive" |
            "expressiveRive" |
            "expressiveBackground" |
            "expressiveFill" |
            "expressiveHoverContainer" |
            "expressiveWrapper" |
            "fullWidth" |
            "rounded";

        export type Props = Required<TitleProps> & SubtitleProps & DisabledProps & {
            /** Returns the label to use for the button */
            readonly useLabel: () => string;

            /** If specified, returns the variant to use for the button */
            readonly useVariant?: () => Variant;

            /** Called when the button is clicked */
            readonly onClick: () => void | Promise<void>;
        };
    }

    export const Toggle = <
        K extends string = string,
        P extends Toggle.Props = Toggle.Props
    >(key: K, props: P) => construct(Type.TOGGLE, key, props);

    export type Toggle<
        K extends string = string,
        P extends Toggle.Props = Toggle.Props
    > = Node<Type.TOGGLE, K, P>;

    export namespace Toggle {
        export type Props = Required<TitleProps> & SubtitleProps & BadgeProps & DisabledProps & {
            /** If specified, returns a warning message for when the toggle is disabled */
            readonly useDisabledMessage?: () => string;
        } & FieldProps<boolean>;
    }

    export const Slider = <
        K extends string = string,
        P extends Slider.Props = Slider.Props
    >(key: K, props: P) => construct(Type.SLIDER, key, props);

    export type Slider<
        K extends string = string,
        P extends Slider.Props = Slider.Props
    > = Node<Type.SLIDER, K, P>;

    export namespace Slider {
        export type Props = Required<TitleProps> & SubtitleProps & {
            /** Returns the initial value of the slider */
            readonly getInitialValue: () => number;

            /** Called when a new value of the slider is selected */
            readonly setValue: (value: number) => void;

            /** The minimum value of the slider */
            readonly minValue: number;

            /** The maximum value of the slider */
            readonly maxValue: number;

            /** If specified, called to render the current value of the slider */
            readonly onValueRender?: (value: number) => string;

            /** If specified, called as the value changes while the user is dragging */
            readonly asValueChanges?: (value: number) => void;

            /** If specified, the positions of markers on the slider */
            readonly markers?: readonly number[];

            /** If specified, called to render the value of each marker */
            readonly onMarkerRender?: (marker: number) => string;

            /** If specified, only values exactly equal to the markers will be allowed */
            readonly stickToMarkers?: boolean;
        } & DisabledProps;
    }

    export const Select = <
        K extends string = string,
        O extends readonly Select.Option[] = readonly Select.Option[],
        P extends Select.Props<O> = Select.Props<O>
    >(key: K, props: P) => construct(Type.SELECT, key, props);

    export type Select<
        K extends string = string,
        O extends readonly Select.Option[] = readonly Select.Option[],
        P extends Select.Props<O> = Select.Props<O>
    > = Node<Type.SELECT, K, P>;

    export namespace Select {
        export type Option<T = any> = { id: string, label: string, value: T };

        export type Props<O extends readonly Option[] = readonly Option[]> = Required<TitleProps> & SubtitleProps & {
            /** Returns an array of {@link Option}s to use for the select */
            readonly useOptions: () => O;

            /** If specified, the field layout of the select */
            readonly fieldLayout?: "vertical" | "horizontal" | "horizontal-responsive";

            /** Whether the user is allowed to clear the select */
            readonly clearable?: boolean;
        } & FieldProps<O[number]["value"]>;
    }

    export const Radio = <
        K extends string = string,
        O extends readonly Radio.Option[] = readonly Radio.Option[],
        P extends Radio.Props<O> = Radio.Props<O>
    >(key: K, props: P) => construct(Type.RADIO, key, props);

    export type Radio<
        K extends string = string,
        O extends readonly Radio.Option[] = readonly Radio.Option[],
        P extends Radio.Props<O> = Radio.Props<O>
    > = Node<Type.RADIO, K, P>;

    export namespace Radio {
        export type Option<T = any> = { name: string, value: T };

        export type Props<O extends readonly Option[] = readonly Option[]> = Required<TitleProps> & SubtitleProps & {
            /** Returns an array of {@link Option}s to use for the radio */
            readonly useOptions: () => O;
        } & FieldProps<O[number]["value"]>;
    }

    export const Navigator = <
        K extends string = string,
        P extends Navigator.Props = Navigator.Props
    >(key: K, props: P) => construct(Type.NAVIGATOR, key, props);

    export type Navigator<
        K extends string = string,
        P extends Navigator.Props = Navigator.Props
    > = Node<Type.NAVIGATOR, K, P>;

    export namespace Navigator {
        export type Props = {
            /** The destination key to navigate to */
            readonly destinationKey: string;
        };
    }

    export const Custom = <
        K extends string = string,
        P extends Custom.Props = Custom.Props
    >(key: K, props: P) => construct(Type.CUSTOM, key, props);

    export type Custom<
        K extends string = string,
        P extends Custom.Props = Custom.Props
    > = Node<Type.CUSTOM, K, P>;

    export namespace Custom {
        export type Props = {
            /** The custom component to render */
            readonly Component: React.JSXElementConstructor<{}>;
        };
    }
}

function makeBuildLayout<T extends readonly Node[]>(layout: T): () => [...T] {
    return () => [...layout];
}

const VENCORD_SECTION = Node.Section("vencord_settings", {
    useTitle: () => "Vencord",
    buildLayout: makeBuildLayout([
        Node.SidebarItem("vencord_sidebar_item", {
            icon: MainSettingsIcon,
            useTitle: () => "Settings",
            buildLayout: makeBuildLayout([
                Node.Panel("vencord_settings_panel", {
                    useTitle: () => "Vencord Settings",
                    // buildLayout: makeBuildLayout([
                    //     Node.TabItem("vencord_settings_tab_item", {
                    //         getTitle: () => "Settings",
                            buildLayout: () => [...categories]
                    //     })
                    // ])
                })
            ])
        })
    ])
});

function useValueSetValue<T>(init: T) {
    const { subscribe, getSnapshot, update } = (() => {
        const { subscribe, notify } = (() => {
            const listeners = new Set<() => void>();

            const subscribe = (onStoreChange: () => void) => {
                const listener = () => { onStoreChange(); };
                listeners.add(listener);
                return () => { listeners.delete(listener); };
            };

            const notify = () => {
                for (const onStoreChange of listeners) {
                    onStoreChange();
                }
            };

            return { subscribe, notify };
        })();

        let value = init;
        const getSnapshot = () => value;
        const update = (newValue: T) => {
            if (newValue === value) return;
            value = newValue;
            notify();
        };

        return { subscribe, getSnapshot, update };
    })();

    const useValue = () => useSyncExternalStore(subscribe, getSnapshot);
    const setValue = update;
    return { useValue, setValue };
}

const categories = [
    Node.Category("vencord_settings_category_quick-actions", {
        useTitle: () => "Quick Actions",
        useSubnavLabel: () => "Quick Actions",
        buildLayout: makeBuildLayout([
            Node.Button("vencord_settings_do-a-thing", {
                useTitle: () => "Do a thing",
                useSubtitle: () => "it's very cool.",
                useLabel: () => "Thing",
                onClick: () => {}
            }),
        ])
    }),

    Node.Category("vencord_settings_category_development", {
        useTitle: () => "Development",
        useSubnavLabel: () => "Development",
        buildLayout: makeBuildLayout([
            Node.Toggle("vencord_settings_custom-css", {
                useTitle: () => "Enable custom CSS",
                useSubtitle: () => "You can turn this off if you are experiencing theming issues",
                ...useValueSetValue(true)
            }),

            Node.Toggle("vencord_settings_react-devtools", {
                useTitle: () => "Enable React Developer Tools",
                useSubtitle: () => "You will see Components and Profiler tabs in DevTools",
                ...useValueSetValue(true)
            })
        ])
    }),

    Node.Category("vencord_settings_category_theming", {
        useTitle: () => "Theming",
        useSubnavLabel: () => "Theming",
        buildLayout: makeBuildLayout([
            Node.Toggle("vencord_settings_borderless-window", {
                useTitle: () => "Disable the window frame",
                useSubtitle: () => "Makes Discord borderless",
                ...useValueSetValue(false)
            }),

            Node.Toggle("vencord_settings_transparent-window", {
                useTitle: () => "Enable window transparency",
                useSubtitle: () => "Only works with themes supporting transparency, and also disables window resizing",
                ...useValueSetValue(false)
            }),

            Node.Toggle("vencord_settings_disable-min-window-size", {
                useTitle: () => "Disable minimum window size",
                useSubtitle: () => "Make Discord as small as you want",
                ...useValueSetValue(false)
            }),

            Node.Select("vencord_settings_window-vibrancy-style", {
                useTitle: () => "Window vibrancy style",
                useSubtitle: () => "Requires restart",
                useOptions: () => [
                    {
                        id: "under-page",
                        label: "Under Page (window tinting)",
                        value: "under-page"
                    },
                    {
                        id: "content",
                        label: "Content",
                        value: "content"
                    },
                    {
                        id: "window",
                        label: "Window",
                        value: "window"
                    },
                    {
                        id: "selection",
                        label: "Selection",
                        value: "selection"
                    },
                    {
                        id: "titlebar",
                        label: "Titlebar",
                        value: "titlebar"
                    },
                    {
                        id: "header",
                        label: "Header",
                        value: "header"
                    },
                    {
                        id: "sidebar",
                        label: "Sidebar",
                        value: "sidebar"
                    },
                    {
                        id: "tooltip",
                        label: "Tooltip",
                        value: "tooltip"
                    },
                    {
                        id: "menu",
                        label: "Menu",
                        value: "menu"
                    },
                    {
                        id: "popover",
                        label: "Popover",
                        value: "popover"
                    },
                    {
                        id: "fullscreen-ui",
                        label: "Fullscreen UI (transparent but slightly muted)",
                        value: "fullscreen-ui"
                    },
                    {
                        id: "hud",
                        label: "HUD (Most transparent)",
                        value: "hud"
                    }
                ],
                fieldLayout: "horizontal",
                clearable: true,
                ...useValueSetValue(undefined)
            })
        ])
    })
];

export default definePlugin({
    name: "Settings2",
    description: "Adds Vencord section to Discord settings",
    authors: [Devs.LoganDark],
    required: true,

    patches: [
        {
            find: ",queryInAppNavigations(",
            replacement: {
                match: /(?:\i\.)+getUserIsStaff\(\)/g,
                replace: "true"
            }
        },
        {
            find: ".PLAYGROUND){",
            replacement: {
                match: /\.PLAYGROUND\){if\(!/,
                replace: "$&true&&"
            }
        },
        {
            find: '("$Root",',
            replacement: {
                match: /\i\("\$Root",(?:\i\.)+ROOT,\i\)/,
                replace: "$self.insertCategory($&)"
            }
        }
    ],

    insertCategory(rootNode: Node.Root) {
        const layout = [...rootNode.buildLayout!()];
        layout.splice(2, 0, VENCORD_SECTION);
        return Node.Root({ buildLayout: () => [...layout] });
    }
});
