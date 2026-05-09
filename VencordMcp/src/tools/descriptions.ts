/**
 * Centralized MCP-facing prose. Single source of truth for:
 *  - SERVER_INSTRUCTIONS (initialize handshake)
 *  - TOOL_TITLES + TOOL_DESCRIPTIONS (per-tool registration)
 *  - PARAMS (shared Zod schemas; the .describe() text is the MCP-facing copy)
 *  - SUMMARIES (human-readable text content for tool responses)
 *
 * Tools, helpers, and domain code import from here rather than constructing
 * MCP-facing strings themselves so all copy can be audited and revised here.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Server-level instructions (sent during MCP initialize handshake)
// ---------------------------------------------------------------------------

export const SERVER_INSTRUCTIONS = `\
claude-mcp — bridge between Claude and a running Discord client running the Vencord ClaudeMcp plugin. \
Designed to assist reverse-engineering Discord by introspecting Webpack modules, evaluating expressions, \
and testing patches in a live renderer. The plugin connects out to this server over WebSocket; once \
connected, MCP tools dispatch requests to it.

## Session model

Multiple Discord installs can connect simultaneously. Every connected client is identified by a \
persistent UUID (clientId) the plugin generates on first run and stores in IndexedDB. All \
module-introspection tools accept an optional \`clientId\`; if omitted and exactly one session is \
connected, that session is used; otherwise the call fails with AMBIGUOUS_CLIENT and you should \
call list_sessions first.

## Tools

Session management:
- list_sessions — connected, identified Vencord plugin sessions keyed by clientId.

Module discovery:
- find_modules_by_string — Webpack module ids whose source contains a given substring.
- find_modules_by_regex — Webpack module ids whose source matches a given regex.
Both default to modules Discord has already loaded. Pass \`scope: "all"\` (or \`"unloaded"\`) to also \
search modules in chunks that are not loaded yet; the plugin fetches every chunk file once per \
session and indexes the factories without registering them with webpack. Unloaded hits come back \
with their chunkId.
- load_chunks — register chunks with webpack on demand (\`wreq.e\`), by module id or chunk id. \
Factory bodies still only run when something requires the module (evaluate / inspect do that).

Module inspection:
- read_module_source — full factory source for one module id (loaded, or indexed-but-unloaded).
- match_module_source — regex matches against one module's source, with capture groups and offsets.
- test_module_patch — dry-run a chain of regex/string replacements; reports each match and the \
substitution it would receive, and verifies the patched source still parses.

Live values (refs):
- evaluate — eval an arrow function with resolved modules as input; the return value is awaited \
(async definitions work) and parked in a ref registry under a fresh negative id. That id can be \
passed in place of a module id to subsequent tools.
- inspect — compact preview of any value identified by id (module exports or ref). Same configurable \
truncation caps as evaluate; read-only, no new ref minted.
- release_ref — drop ref slots from the registry. Refs accumulate across the session; release ids \
you no longer need so the registry stays small. Released ids are NOT reused — minting is monotonic.
- search_definition — renderer-only string-search heuristic. Stringifies the function and substring-\
matches every factory source. Cheap and never disturbs the user, but returns "ambiguous" for any \
function whose minified body happens to appear in multiple factories.
- find_definition — high-precision answer via Chrome DevTools Protocol. Reads the function's \
\`[[FunctionLocation]]\` and walks the bundle's factory table. Requires attaching the debugger to \
the renderer, which conflicts with an open DevTools window. **DO NOT pass \`force: true\` without \
asking the user first** — it closes the user's DevTools (and does NOT reopen it). If DevTools is \
open and you have not been authorized to force, prefer \`search_definition\` and surface the \
DEVTOOLS_OPEN error to the user so they can choose.

Misc:
- record_feedback — append free-form notes about claude-mcp itself to FEEDBACK.txt next to the server install.

## Ids

A "moduleId" is whatever Webpack uses for its key in \`__webpack_require__.m\` — typically a numeric \
string like "12345". A "refId" is a negative integer minted by \`evaluate\`. Wherever a tool accepts \
"id" (singular or in arrays), either form works; resolution is automatic based on sign.

## Patch nodes

Patch \`match\` and \`replace\` fields are tagged unions so the wire can carry strings, regexes, or \
function source uniformly:
  { type: "string", value: "..." }
  { type: "regex",  value: { pattern: "...", flags: "..." } }
  { type: "function", value: "(s, g1, g2) => ..." }
Function nodes are eval'd in the renderer; only use them for trusted code that is meant to run \
inside the plugin's context.

## Response Envelope

All tools return { success: true, data, metadata } on success or
{ success: false, error: { code, message, tried, suggestions }, metadata } on error.
Common error codes returned by the bridge layer: NO_CLIENTS, AMBIGUOUS_CLIENT, CLIENT_NOT_FOUND, \
PLUGIN_TIMEOUT, PLUGIN_CALL_FAILED, PLUGIN_PROTOCOL_ERROR, PLUGIN_ERROR. Plugin-side errors carry \
their own codes (MODULE_NOT_FOUND, REF_NOT_FOUND, etc.). \`find_definition\` may additionally \
surface DEVTOOLS_OPEN (DevTools is open and \`force\` was false), DETACHED_MID_CALL (user opened \
DevTools while CDP was in flight), ATTACH_FAILED, NO_LOCATION (function has no [[FunctionLocation]] \
— typically native code), or GET_SOURCE_FAILED.`;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULTS = {
	serverName: 'claude-mcp',
	serverVersion: '0.1.0',
} as const;

// ---------------------------------------------------------------------------
// Shared parameter schemas (Zod .describe() text is MCP-facing copy)
// ---------------------------------------------------------------------------

const PatchMatchNode = z.discriminatedUnion('type', [
	z.object({ type: z.literal('string'), value: z.string() }),
	z.object({
		type: z.literal('regex'),
		value: z.object({
			pattern: z.string(),
			flags: z.string().optional(),
		}),
	}),
	z.object({ type: z.literal('function'), value: z.string() }),
]);

const PatchReplaceNode = PatchMatchNode;

const Replacement = z.object({
	match: PatchMatchNode,
	replace: PatchReplaceNode,
});

export const PARAMS = {
	clientId: z.string().min(1).optional()
		.describe('Target Vencord plugin session by clientId. Optional when exactly one session is connected; required otherwise. Use list_sessions to enumerate.'),

	moduleId: z.union([z.string(), z.number()])
		.describe('Webpack module id (e.g. "12345" or 12345). Negative values are NOT module ids — they are ref ids; see the evaluate tool.'),

	anyId: z.union([z.string(), z.number()])
		.describe('Either a Webpack module id (non-negative integer or its string form) or a negative ref id minted by the evaluate tool. Resolution is automatic based on sign.'),

	idsArray: z.array(z.union([z.string(), z.number()]))
		.describe('Ordered list of ids. Each entry is either a Webpack module id or a ref id; both forms may be mixed.'),

	scope: z.enum(['loaded', 'unloaded', 'all']).optional()
		.describe('Which modules to search. "loaded" (default): only factories already registered in `__webpack_require__.m`. "unloaded": only modules in chunks Discord has not loaded yet. "all": both. The first non-default call fetches and indexes every chunk file (seconds, cached for the session); unloaded hits are returned separately with their chunkId, and the reply includes the index report so skipped or failed chunks are visible.'),

	chunkIdsToLoad: z.array(z.union([z.string(), z.number()])).optional()
		.describe('Chunk ids to register with webpack via `__webpack_require__.e`. Use the chunkId values returned by a scoped find.'),

	moduleIdsToLoad: z.array(z.union([z.string(), z.number()])).optional()
		.describe('Module ids whose containing chunk should be loaded. Resolved through the unloaded-chunk index (built on demand). Already-loaded ids are reported, not an error.'),

	needle: z.string().min(1)
		.describe('Substring to search for inside each module factory\'s source. Case-sensitive. For richer matching use find_modules_by_regex.'),

	pattern: z.string().min(1)
		.describe('Regex source (the part between the slashes). The regex is reconstructed in the plugin via `new RegExp(pattern, flags)`.'),

	flags: z.string().optional()
		.describe('Regex flags (e.g. "i", "gi", "u"). Defaults to no flags. Match-against-source operations auto-add "g" to enumerate all matches.'),

	definition: z.string().min(1)
		.describe('JavaScript source that, when evaluated, produces a function. Typically an arrow function of the form `(modules) => ...` where `modules` is the array of resolved values for `ids`. The function may be async or return a promise; the result is awaited before being parked in the ref registry. The new ref id is returned.'),

	evalTimeoutMs: z.number().int().positive().optional()
		.describe('How long (ms) to wait for the definition\'s result to settle before failing with EVAL_TIMEOUT. Default 30000. Raise it for definitions that await slow work such as chunk loading or network fetches. The wire timeout is extended to match.'),

	replacements: z.array(Replacement).min(1)
		.describe('Ordered list of {match, replace} patch steps. Each step\'s match/replace can be a string node, regex node ({pattern, flags}), or function node (source string eval\'d in the plugin). Steps are applied in order and the chain stops at the first step that matches nothing.'),

	includeFinalSource: z.boolean().optional()
		.describe('When true, the response includes the full patched module source. Off by default because module sources can be tens of KB or larger; the per-step trial entries already report each match and its replacement, which is usually enough. Turn this on only when you genuinely need the full post-patch text.'),

	feedbackMessage: z.string().min(1)
		.describe('Free-form feedback text. Multi-line is fine. Describe the issue, papercut, or suggestion in your own words.'),

	refIdsArray: z.array(z.union([z.number().int().negative(), z.string().regex(/^-\d+$/)])).min(1)
		.describe('Ref ids to release. Each entry is a negative integer (or its string form) previously minted by `evaluate`. Module ids (non-negative) are NOT accepted — modules live in webpack and aren\'t owned by the registry.'),

	findDefinitionForce: z.boolean().optional()
		.describe('Close the renderer\'s DevTools window if it is currently open, so CDP can attach. NOT REOPENED afterwards. Default false. ASK THE USER FIRST before passing true — closing DevTools loses the user\'s console history, breakpoints, watch expressions, and panel state. If DevTools is open and you have not been authorized to force, prefer search_definition or surface the DEVTOOLS_OPEN error so the user can choose.'),

	previewLimits: z.object({
		total: z.number().int().min(0).optional()
			.describe('Hard cap on the final preview string. Default 400.'),
		depth: z.number().int().min(0).optional()
			.describe('Maximum nesting depth before objects/arrays render as `[ClassName]`. Default 2.'),
		keys: z.number().int().min(0).optional()
			.describe('Maximum entries shown per object/array before `...N more`. Default 8.'),
		string: z.number().int().min(0).optional()
			.describe('Maximum chars of a string or function source before per-value truncation. Default 120.'),
	}).optional()
		.describe('Override the preview truncation caps when the default one-line summary hides what you need. Pass only the fields you want to bump; omitted fields keep their defaults. Increase `total` and `string` for verbose values, `depth` for deep object trees, `keys` for many-keyed objects/long arrays.'),
} as const;

// ---------------------------------------------------------------------------
// Tool titles + descriptions
// ---------------------------------------------------------------------------

export const TOOL_TITLES = {
	list_sessions: 'List Sessions',
	find_modules_by_string: 'Find Modules by String',
	find_modules_by_regex: 'Find Modules by Regex',
	read_module_source: 'Read Module Source',
	match_module_source: 'Match Module Source',
	test_module_patch: 'Test Module Patch',
	evaluate: 'Evaluate Against Modules',
	inspect: 'Inspect Value',
	search_definition: 'Search Definition (string match)',
	find_definition: 'Find Definition (CDP)',
	release_ref: 'Release Refs',
	load_chunks: 'Load Chunks',
	record_feedback: 'Record Feedback',
} as const;

export const TOOL_DESCRIPTIONS = {
	list_sessions:
		'List currently connected, identified Vencord plugin sessions. Returns a map keyed by clientId; ' +
		'each value is a session-info object containing connectedAt and identifiedAt timestamps (ISO 8601) ' +
		'plus any additional fields the plugin advertised in its hello handshake (e.g. releaseChannel, ' +
		'buildNumber, vencordVersion, electronVersion, chromiumVersion). Sessions that have connected but ' +
		'not yet sent a valid hello are omitted. The clientId is a UUID persisted by the plugin\'s ' +
		'DataStore and survives Discord restarts.',

	find_modules_by_string:
		'Return the ids of every Webpack module whose factory source contains `needle` as a literal ' +
		'substring (case-sensitive). Equivalent to iterating `Object.keys(__webpack_require__.m)` and ' +
		'filtering by `String(factory).includes(needle)`. Useful for locating modules by a known string ' +
		'literal — error messages, action types, store names, etc. For pattern matching use ' +
		'find_modules_by_regex. Searches loaded modules by default; pass `scope: "all"` to include ' +
		'modules in chunks Discord has not loaded yet (context menus, modals, settings pages are ' +
		'usually lazy). Those come back in `unloaded` with their chunkId; use load_chunks to register them.',

	find_modules_by_regex:
		'Return the ids of every Webpack module whose factory source matches the given regex ' +
		'(`new RegExp(pattern, flags)`). The match is "regex.test(source)" — any single match anywhere ' +
		'in the source qualifies. Use this when the literal-substring approach of find_modules_by_string ' +
		'is too rigid (e.g. minified identifier prefixes, alternation, look-ahead). Same `scope` ' +
		'semantics as find_modules_by_string.',

	read_module_source:
		'Return the full source string of one module factory (`String(__webpack_require__.m[id])`). ' +
		'Use this after locating a module via find_modules_by_string / find_modules_by_regex to inspect ' +
		'the actual code. Errors with MODULE_NOT_FOUND if the id is unknown. Note: factory sources can be ' +
		'large (tens of KB for some Discord modules); if you only need a span around a known location, ' +
		'prefer match_module_source which returns only the matched substrings.',

	match_module_source:
		'Run a regex against one module\'s factory source and return every match as a structured record. ' +
		'Each match contains `matched` (the full match), `index` (offset in the source), and `groups` ' +
		'(numbered capture groups). Non-global regexes are auto-globalified so you always see every ' +
		'occurrence. Use this for surveying patterns, locating specific call sites, or extracting tagged ' +
		'spans without pulling the entire source.',

	test_module_patch:
		'Dry-run a chain of replacement steps against a module\'s source. Each step\'s match/replace is ' +
		'a tagged node ({type: "string"|"regex"|"function", value}). Function nodes are eval\'d in the ' +
		'renderer to produce the actual matcher/replacer. Returns one entry per step; each contains the ' +
		'matches found and the replacement text that would be substituted. Stops at the first step that ' +
		'matches nothing (mirroring how Vencord considers a non-firing replacement a patch failure). The ' +
		'final source is verified to still parse as a function body. Does NOT mutate the live module — ' +
		'`__webpack_require__.m` is untouched. ' +
		'\n\nThe response always includes `finalSourceLength` (chars). The full `finalSource` text is ' +
		'omitted by default to keep replies small; pass `includeFinalSource: true` only when you need it.',

	evaluate:
		'Resolve each id in `ids` to a value (modules via `__webpack_require__(id)`, refs via the ref ' +
		'registry), eval `definition` to get a function, call that function with the resolved array as ' +
		'its single argument, and park the return value in the ref registry under a fresh negative id. ' +
		'The new ref id is returned and can be passed wherever a moduleId is accepted. Typical pattern: ' +
		'`evaluate({ids: [12345], definition: "(m) => m[0].default.someProperty"})` to grab a sub-export ' +
		'as a tracked reference. The function runs in the renderer\'s context, so anything reachable from ' +
		'a module export is fair game (FluxDispatcher, stores, components, etc.). Beware of side effects. ' +
		'\n\nThe return value is awaited, so `async (m) => ...` definitions and returned promises resolve to ' +
		'their settled value before being parked. A rejection surfaces as EVAL_FAILED with the rejection ' +
		'message; a result that does not settle within `timeoutMs` (default 30000) surfaces as EVAL_TIMEOUT ' +
		'and nothing is parked. ' +
		'\n\nThe response includes a compact `preview` string of the value (single-line, truncated). When ' +
		'the default truncation hides what you actually need, pass `previewLimits` to bump the relevant cap ' +
		'— e.g. `previewLimits: {string: 5000}` to see a long string in full, or `{depth: 5, keys: 50}` to ' +
		'walk a deep object tree.',

	inspect:
		'Show a compact preview of a value identified by id, without re-evaluating. The id can be either ' +
		'a Webpack module id (the value previewed is `__webpack_require__(id)`, i.e. the module\'s exports) ' +
		'or a negative ref id minted by `evaluate` (the value previewed is whatever was parked in the ref ' +
		'registry under that id). Read-only — does NOT mint a new ref. Useful for re-checking what an ' +
		'earlier `evaluate` call produced, or eyeballing a module\'s export shape without writing a tiny ' +
		'`evaluate` definition. Same `previewLimits` overrides as `evaluate`: bump `string` for long ' +
		'string values, `depth`/`keys` for deep or wide object trees, `total` to lift the overall char cap.',

	search_definition:
		'Renderer-only string-search heuristic for locating the Webpack module factory whose source ' +
		'contains the given function\'s stringified body. Returns kind: "module" with moduleId for a ' +
		'unique containing factory, "external" if the body is not found in any factory ' +
		'(runtime, native, top-level bundle), or "ambiguous" with the candidate ids when several ' +
		'factories include the same source — common for tiny minified helpers. Cheap and never disturbs ' +
		'the user, but minified bodies frequently collide. For a precise answer use find_definition.',

	find_definition:
		'High-precision answer via Chrome DevTools Protocol: reads the function\'s `[[FunctionLocation]]` ' +
		'and walks the bundle\'s factory table to determine which Webpack module contains it. Returns ' +
		'kind: "module" with moduleId, or "external" when the location lies outside any factory ' +
		'(runtime, top-level bundle, native). Never returns "ambiguous". ' +
		'\n\nIMPLEMENTATION COST: requires attaching `webContents.debugger` to the renderer. Only one ' +
		'CDP client may be attached at a time, so if the user has DevTools open this call fails with ' +
		'DEVTOOLS_OPEN unless `force: true` is passed. **DO NOT pass `force: true` without asking the ' +
		'user first** — it closes the user\'s DevTools (and does NOT reopen it), losing console history, ' +
		'breakpoints, watch expressions, and panel state. The default behavior surfaces DEVTOOLS_OPEN so ' +
		'you can either (a) ask the user to close DevTools / authorize force, or (b) fall back to ' +
		'search_definition. If DevTools is opened by the user mid-call, the call fails with ' +
		'DETACHED_MID_CALL and you should retry.',

	release_ref:
		'Drop one or more ref slots from the plugin\'s ref registry. Each input id must be a negative ' +
		'integer previously minted by `evaluate` (module ids are not accepted — modules are not owned by ' +
		'the registry). Returns `released` (ids actually dropped), `notFound` (ids that were not in the ' +
		'registry — usually because they were already released or never existed), and `remaining` (the ' +
		'registry size after the operation). Released ids are never reused; the next `evaluate` mints a ' +
		'fresh, smaller-by-one negative id. Use this whenever a working set of refs has served its ' +
		'purpose, especially for large captured values that would otherwise pin memory in the renderer.',

	load_chunks:
		'Register one or more lazy chunks with webpack via `__webpack_require__.e`, so their modules ' +
		'appear in `__webpack_require__.m` and every other tool can work on them. Give `chunkIds` ' +
		'(from a scoped find) and/or `moduleIds` (resolved to their chunk through the unloaded-chunk ' +
		'index, which is built on demand). This is exactly what Discord does when a user opens the ' +
		'corresponding UI, including Vencord patching on first require. It does NOT run any module; ' +
		'use evaluate or inspect on the module id afterwards if you need its exports. Loading a module\'s ' +
		'own chunk does not load the sibling chunks its lazy import site would have loaded together; ' +
		'if requiring it then fails, evaluate `Vencord.Webpack.extractAndLoadChunks([...])` against the ' +
		'importing module instead.',

	record_feedback:
		'Record free-form feedback about claude-mcp itself — papercuts, bugs, unintuitive behavior, missing ' +
		'features, anything an agent notices while using the tools. Each call appends a single entry to ' +
		'FEEDBACK.txt at the MCP server\'s installation root (NOT the agent\'s cwd, which can vary). The ' +
		'entry records the timestamp, the agent\'s current working directory, and the verbatim message. ' +
		'Existing entries are never modified. Use this whenever something surprises you, blocks you, or ' +
		'could be smoother — the maintainers review FEEDBACK.txt to drive improvements.',
} as const;

// ---------------------------------------------------------------------------
// Summary templates (human-readable text content for tool responses)
// ---------------------------------------------------------------------------

export const SUMMARIES = {
	feedbackRecorded: (path: string, timestamp: string) =>
		`Feedback appended to ${path} at ${timestamp}`,
	sessionsListed: (count: number) => {
		if (count === 0) return 'No identified sessions';
		const noun = count === 1 ? 'session' : 'sessions';
		return `${count} ${noun} connected`;
	},
	modulesFound: (count: number, unloaded?: number) => {
		const tail = unloaded === undefined ? '' : ` (+${unloaded} in unloaded chunks)`;
		if (count === 0) return `No matching loaded modules${tail}`;
		const noun = count === 1 ? 'module' : 'modules';
		return `${count} matching ${noun}${tail}`;
	},
	chunksLoaded: (chunks: number, alreadyLoaded: number) => {
		const noun = chunks === 1 ? 'chunk' : 'chunks';
		const tail = alreadyLoaded === 0 ? '' : `, ${alreadyLoaded} module(s) were already loaded`;
		return `Loaded ${chunks} ${noun}${tail}`;
	},
	moduleSourceRead: (moduleId: string, length: number) =>
		`Read source of module ${moduleId} (${length} chars)`,
	matchesFound: (moduleId: string, count: number) => {
		const noun = count === 1 ? 'match' : 'matches';
		return `${count} ${noun} in module ${moduleId}`;
	},
	patchTested: (moduleId: string, ok: boolean, stepCount: number) => {
		const status = ok ? 'all steps OK' : 'failed';
		const noun = stepCount === 1 ? 'step' : 'steps';
		return `Patch on module ${moduleId} (${stepCount} ${noun}): ${status}`;
	},
	inspected: (kind: 'module' | 'ref', id: string) =>
		`Inspected ${kind} ${id}`,
	evaluated: (refId: number, idCount: number) => {
		const noun = idCount === 1 ? 'id' : 'ids';
		return `Evaluated against ${idCount} ${noun}; result parked at ref ${refId}`;
	},
	searchDefinitionFound: (kind: 'module' | 'external' | 'ambiguous', detail?: string) => {
		if (kind === 'module') return `Body matched module ${detail} (string-search)`;
		if (kind === 'external') return 'Body not found in any module factory (string-search)';
		return `Ambiguous body match (string-search): ${detail}`;
	},
	findDefinitionFound: (kind: 'module' | 'external', detail?: string) => {
		if (kind === 'module') return `Defined in module ${detail} (CDP)`;
		return 'Defined outside any module factory (CDP)';
	},
	refsReleased: (released: number, notFound: number, remaining: number) => {
		const head = released === 1 ? '1 ref released' : `${released} refs released`;
		const tail = notFound === 0 ? '' : `, ${notFound} not found`;
		return `${head}${tail} (${remaining} remaining)`;
	},
} as const;
