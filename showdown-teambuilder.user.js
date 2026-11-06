// ==UserScript==
// @name         Pokémon Showdown Teambuilder QOL
// @author       jl
// @namespace    https://github.com/Jake18236/showdown-teambuilder-mod
// @version      19.2.0
// @description  Adds Teambuilder and damage calculator support for some OMs
// @match        https://play.pokemonshowdown.com/*
// @match        https://smogtours.psim.us/*
// @match        https://calc.pokemonshowdown.com/*
// @grant        none
// @run-at       document-start
// @updateURL    https://github.com/Jake18236/Showdown-Teambuilder-Mod/releases/latest/download/showdown-teambuilder.user.js
// @downloadURL  https://github.com/Jake18236/Showdown-Teambuilder-Mod/releases/latest/download/showdown-teambuilder.user.js
// ==/UserScript==

// comments by claude bc documentation is too much work :C
//
// FILE LAYOUT
//   Core: constants and mod metadata, room / patch helpers, server banlists,
//         stat and type transforms, search providers and filters, teambuilder
//         patches, battle patches, DOM decorators, and boot.
//   Features: self-challenge, custom format import, usage stats, and calculator OMs.
(function () {
    'use strict';

    const LOG = '[Teambuilder QOL]';

    const IS_DAMAGE_CALC = location.hostname === 'calc.pokemonshowdown.com';

    // ====================================================================
    // 1. CONSTANTS & UTILITIES
    // ====================================================================

    const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
    const BOOSTABLE_STATS = STATS.slice(1); // everything but hp
    const sumStats = (s) => STATS.reduce((n, st) => n + s[st], 0);
    const copy = (obj) => Object.assign({}, obj);
    const clamp255 = (n) => Math.max(1, Math.min(255, n));
    const clampBaseStats = (stats) => {
        if (!stats) return stats;
        const bounded = copy(stats);
        for (const stat of STATS) bounded[stat] = clamp255(bounded[stat]);
        return bounded;
    };
    const listOf = (s) => s.split(/\s+/).filter(Boolean);
    const setOf = (s) => new Set(listOf(s));
    const capitalize = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase();
    const toSearchId = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const dropEmptyHeaders = (rows) =>
    rows.filter((row, i) => row[0] !== 'header' || (rows[i + 1] && rows[i + 1][0] !== 'header'));

    const MOD = {
        TIER_SHIFT: 'tierShift',
        MIX_AND_MEGA: 'mixAndMega',
        BAD_N_BOOSTED: 'badNBoosted',
        GODLY_GIFT: 'godlyGift',
        CROSS_EVOLUTION: 'crossEvolution',
        SCALEMONS: 'scalemons',
        FRANTIC_FUSIONS: 'franticFusions',
        INHERITANCE: 'inheritance',
        REEVOLUTION: 'reevolution',
        FLIPPED: 'flipped',
        THREE_FIFTY_CUP: 'threeFiftyCup',
        NATURE_SWAP: 'natureSwap',
        CAMOMONS: 'camomons',
        BONUS_TYPE: 'bonusType',
        FORTEMONS: 'fortemons',
        SKETCHMONS: 'sketchmons',
        TYPEMONS: 'typemons',
        STABMONS: 'stabmons',
        // Movepool / ability-list mods (no stat changes of their own)
        CONVERGENCE: 'convergence',
        ALPHABET_CUP: 'alphabetCup',
        ALL_MOVES: 'allMoves', // Camove Chaos: every move is legal
        ALMOST_ANY_ABILITY: 'almostAnyAbility',
    };

    // Format matching is keyword based, so prefixes/suffixes such as
    // "nationaldex" (gen9nationaldexmixandmega) don't break detection.
    const fmtId = (f) => String(f || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const fmtHas = (f, ...keys) => {
        const id = fmtId(f);
        return keys.some((k) => id.includes(k));
    };
    const stripGen = (id) => String(id || '').replace(/^gen\d+/, '');

    // Complete challenge-rule catalog supplied with this version. Presence here means
    // we can parse/name the rule; simulator-only hooks continue to run server-side.
    const SHOWDOWN_RULE_NAMES = Object.freeze([
"Standard AG",
"Standard",
"Standard NEXT",
"Flat Rules",
"Limit Two Restricted",
"Limit One Restricted",
"Standard Doubles",
"Standard OMs",
"Standard NatDex",
"NatDex Mod",
"Standard Draft",
"Obtainable",
"Obtainable Moves",
"Obtainable Abilities",
"Obtainable Formes",
"Obtainable Misc",
"Hoenn Pokedex",
"Sinnoh Pokedex",
"Old Unova Pokedex",
"New Unova Pokedex",
"Kalos Pokedex",
"Old Alola Pokedex",
"New Alola Pokedex",
"Galar Pokedex",
"Isle of Armor Pokedex",
"Crown Tundra Pokedex",
"Galar Expansion Pokedex",
"Paldea Pokedex",
"Kitakami Pokedex",
"Blueberry Pokedex",
"PotD",
"Team Preview",
"Tera Type Preview",
"One vs One",
"Two vs Two",
"Little Cup",
"DC Timer",
"DC Timer Bank",
"Timeout Auto Choose",
"Timer Accelerate",
"Blitz",
"VGC Timer",
"Species Clause",
"Nickname Clause",
"Beat Up Nicknames Mod",
"OHKO Clause",
"Evasion Clause",
"Evasion Abilities Clause",
"Evasion Items Clause",
"Evasion Moves Clause",
"Accuracy Moves Clause",
"Accuracy Trap Clause",
"Sleep Moves Clause",
"Gravity Sleep Clause",
"Endless Battle Clause",
"DryPass Clause",
"Baton Pass Clause",
"One Baton Pass Clause",
"One Boost Passer Clause",
"Baton Pass Stat Clause",
"Speed Pass Clause",
"Baton Pass Trap Clause",
"Baton Pass Stat Trap Clause",
"CFZ Clause",
"Z-Move Clause",
"Not Fully Evolved",
"HP Percentage Mod",
"Exact HP Mod",
"Cancel Mod",
"Sleep Clause Mod",
"Stadium Sleep Clause",
"Switch Priority Clause Mod",
"Desync Clause Mod",
"Deoxys Camouflage Clause Mod",
"Freeze Clause Mod",
"No Freeze Mod",
"Same Type Clause",
"Enforce Same Tera Type",
"Same Color Clause",
"Same Letter Clause",
"Mega Rayquaza Clause",
"Dynamax Clause",
"Terastal Clause",
"Full Arceus Clause",
"Inverse Mod",
"OM Unobtainable Moves",
"STABmons Move Legality",
"Alphabet Cup Move Legality",
"Sketchmons Move Legality",
"Camomons Mod",
"Allow Tradeback",
"LGPE Normal Rules",
"NFE Clause",
"Gems Clause",
"Sketch Post-Gen 7 Moves",
"Mimic Glitch Clause",
"Pomeg Glitch Clause",
"Overflow Stat Mod",
"Forme Clause",
"350 Cup Mod",
"Flipped Mod",
"Scalemons Mod",
"Team Type Preview",
"Open Team Sheets",
"Force Open Team Sheets",
"AAA Restricted Abilities",
"Event Moves Clause",
"Stadium Items Clause",
"NC 2000 Move Legality",
"APT Clause",
"NC 1997 Move Legality",
"Stadium Poke Cup Rentals",
"No Switching",
"Guaranteed Secondary Mod",
"Chimera 1v1 Rule",
"Bonus Type Mod",
"First Blood Rule",
"Tier Shift Mod",
"Revelationmons Mod",
"Re-Evolution Mod",
"Broken Record Mod",
"Force of the Fallen Mod",
"Category Swap Mod",
"Godly Gift Mod",
"VoltTurn Mayhem Mod",
"Convergence Legality",
"Hackmons Forme Legality",
"Species Reveal Clause",
"Frantic Fusions Mod",
"Protean Palace Mod",
"Illusion Level Mod",
"Fervent Impersonation Mod",
"Twisted Dimension Mod",
"Mix and Mega Old Aggronite",
"Bad 'n Boosted Mod",
"Data Preview",
"Rebalance Levels"
]);
    const SHOWDOWN_VALUE_RULE_NAMES = Object.freeze([
"Force Monotype",
"Force Monocolor",
"Force Tera Type",
"Force Select",
"EV Limits",
"Timer Starting",
"Timer Grace",
"Timer Add Per Turn",
"Timer Max Per Turn",
"Timer Max First Turn",
"Item Clause",
"Ability Clause",
"Min Source Gen",
"Picked Team Size",
"Min Team Size",
"EV Limit",
"Max Team Size",
"Max Move Count",
"Max Total Level",
"Min Level",
"Max Level",
"Default Level",
"Adjust Level",
"Adjust Level Down",
"Best Of",
"Allowed Pokemoves",
"Unique Pokemoves"
]);
    const RULE_CATALOG = new Map([...SHOWDOWN_RULE_NAMES, ...SHOWDOWN_VALUE_RULE_NAMES]
        .map((name) => [toSearchId(name), {name, valueRule: SHOWDOWN_VALUE_RULE_NAMES.includes(name)}]));
    const formatGeneration = (format, fallback = null) => {
        const base = String(format || '').split('@@@')[0].trim();
        const match = /^(?:\[\s*gen\s*(\d+)\s*\]|gen\s*(\d+)(?=[^0-9]|$))/i.exec(base);
        return match ? Number(match[1] || match[2]) : fallback;
    };
    // Return structured tokens: never confuse a removal (!Rule), replacement
    // (!!Value Rule = x), ban (-X), or unban (+X) with an added game mod.
    function parseChallengeRule(token) {
        const raw = String(token || '').trim();
        if (!raw) return null;
        const match = /^(!!|!|\+|-|\*)\s*(.*)$/.exec(raw);
        const sign = match ? match[1] : '';
        const text = (match ? match[2] : raw).trim();
        const eq = /^([^=]+?)(?:\s*=\s*(.*))?$/.exec(text);
        const name = eq?.[1]?.trim() || text;
        const value = eq?.[2] === undefined ? null : eq[2].trim();
        const id = toSearchId(name);
        const known = RULE_CATALOG.get(id) || null;
        const fromFormat = window.BattleFormats?.[id] || null;
        const kind = sign === '-' ? 'ban' : sign === '+' ? 'unban' : sign === '*' ? 'restrict'
            : sign === '!' ? 'remove' : sign === '!!' ? 'replace' : value !== null ? 'value' : 'rule';
        return {raw, sign, kind, name: known?.name || name, id, value,
            known: !!known || !!fromFormat || !!MOD_DEFINITIONS.find((d) =>
                d.challengeRule && toSearchId(d.challengeRule) === id),
            valueRule: !!known?.valueRule};
    }
    function formatRuleTokens(format) {
        return String(format || '').split('@@@').slice(1).join('@@@')
            .split(',').map(parseChallengeRule).filter(Boolean);
    }
    // Effective *explicit* custom rules in input order (base-format inherited
    // clauses are handled by the server). Last explicit action wins.
    function explicitRuleState(format) {
        const active = new Map();
        const removed = new Set();
        const operations = formatRuleTokens(format);
        for (const op of operations) {
            if (op.kind === 'remove') {active.delete(op.id); removed.add(op.id);}
            else if (op.kind === 'rule' || op.kind === 'value' || op.kind === 'replace') {
                active.set(op.id, op); removed.delete(op.id);
            }
        }
        return {active, removed, operations};
    }


    // Order matters: first match wins.

    const isNationalDexFormat = (format) => {
        const base = String(format || '').split('@@@')[0];
        let enabled = fmtHas(base, 'nationaldex', 'natdex');
        for (const op of formatRuleTokens(format)) {
            if (op.id === 'natdexmod' || op.id === 'standardnatdex') {
                if (op.kind === 'remove') enabled = false;
                else if (['rule', 'replace'].includes(op.kind)) enabled = true;
            }
        }
        return enabled;
    };

    const isNationalDexMixAndMegaFormat = (format) =>
    isNationalDexFormat(format) && fmtHas(format, 'mixandmega');

    const isStandardMixAndMegaFormat = (format) =>
    fmtHas(format, 'mixandmega') && !isNationalDexFormat(format);

    // `modifySpeciesPriority` mirrors Showdown's onModifySpeciesPriority. Within a priority
    // bracket, modifiers retain their order in the challenge format.
    const MOD_DEFINITIONS = [
        {
            id: MOD.TIER_SHIFT, formatKeywords: ['tiershift'],
            label: 'Tier Shift', challengeRule: 'tiershiftmod',
        },
        {
            id: MOD.MIX_AND_MEGA, formatKeywords: ['mixandmega'],
            label: 'Mix and Mega', challengeRule: 'mixandmegamod',
        },
        {
            id: MOD.BAD_N_BOOSTED, formatKeywords: ['badnboosted', 'staaabnb'],
            label: 'Bad ’n Boosted', challengeRule: 'badnboostedmod',
            modifySpeciesPriority: 2,
            calcOm: 'badnboosted',
        },
        {id: MOD.GODLY_GIFT, formatKeywords: ['godlygift'], label: 'Godly Gift', challengeRule: 'godlygiftmod', modifySpeciesPriority: 3},
        {
            id: MOD.CROSS_EVOLUTION, formatKeywords: ['crossevolution'],
            label: 'Cross Evolution', challengeRule: 'crossevolutionmod', exclusiveGroup: 'fusion',
        },
        {
            id: MOD.SCALEMONS, formatKeywords: ['aaaubers', 'scalemons'],
            label: 'Scalemons', challengeRule: 'scalemonsmod',
            modifySpeciesPriority: 1, calcOm: 'scalemons',
        },
        {
            id: MOD.FRANTIC_FUSIONS, formatKeywords: ['franticfusions'],
            label: 'Frantic Fusions', challengeRule: 'franticfusionsmod', exclusiveGroup: 'fusion',
        },
        {
            id: MOD.INHERITANCE, formatKeywords: ['inheritance'],
            label: 'Inheritance', challengeRule: 'inheritancemod', exclusiveGroup: 'fusion',
        },
        {
            id: MOD.REEVOLUTION, formatKeywords: ['reevolution', 'reevolutionmod'],
            label: 'Re-Evolution', challengeRule: 'reevolutionmod',
        },
        {
            id: MOD.FLIPPED, formatKeywords: ['flipped'],
            label: 'Flipped', challengeRule: 'flippedmod',
            modifySpeciesPriority: 2, calcOm: 'flipped',
        },
        {
            id: MOD.THREE_FIFTY_CUP, formatKeywords: ['350cup'],
            label: '350 Cup', challengeRule: '350cupmod',
            modifySpeciesPriority: 2, calcOm: '350cup',
        },
        {
            id: MOD.NATURE_SWAP, formatKeywords: ['natureswap'],
            label: 'Nature Swap', challengeRule: 'natureswapmod',
        },
        {
            id: MOD.CAMOMONS, formatKeywords: ['camomons', 'camove'],
            label: 'Camomons', challengeRule: 'camomonsmod',
            modifySpeciesPriority: 2,
        },
        {
            id: MOD.FORTEMONS, formatKeywords: ['fortemons'],
            label: 'Fortemons', challengeRule: 'fortemonsmod',
        },
        {
            id: MOD.SKETCHMONS, formatKeywords: ['sketchmons'],
            label: 'Sketchmons', challengeRule: 'sketchmonsmod',
        },
        {id: MOD.BONUS_TYPE, formatKeywords: ['bonustype'], label: 'Bonus Type', challengeRule: 'Bonus Type Mod'},
        {id: MOD.TYPEMONS, providerKeywords: ['typemons'], label: 'Typemons'},
        {id: MOD.STABMONS, providerKeywords: ['stabmons', 'staaab'], label: 'STABmons', challengeRule: 'STABmons Move Legality'},
        {id: MOD.CONVERGENCE, providerKeywords: ['convergence'], label: 'Convergence', challengeRule: 'Convergence Legality'},
        {id: MOD.ALPHABET_CUP, providerKeywords: ['alphabetcup'], label: 'Alphabet Cup'},
        {id: MOD.ALL_MOVES, providerKeywords: ['camove'], label: 'Every Move'},
        {
            id: MOD.ALMOST_ANY_ABILITY,
            providerKeywords: ['pokebilitiesaaa', 'pokeaaa', 'almostanyability', 'aaarestrictedabilities', 'staaab'],
            label: 'Almost Any Ability',
        },
    ];
    const MOD_DEFINITION_BY_ID = new Map(MOD_DEFINITIONS.map((definition) => [definition.id, definition]));
    const MOD_BY_CALC_OM = new Map(MOD_DEFINITIONS
                                   .filter((definition) => definition.calcOm)
                                   .map((definition) => [definition.calcOm, definition.id]));
    const FORMAT_MOD_KEYWORDS = MOD_DEFINITIONS.flatMap((definition) =>
                                                        (definition.formatKeywords || []).map((keyword) => [keyword, definition.id])
                                                       );

    function modFromFormat(format) {
        const id = fmtId(format);
        for (const [keyword, mod] of FORMAT_MOD_KEYWORDS) {
            if (id.includes(keyword)) return mod;
        }
        return null;
    }

    const isFusionMod = (mod) => MOD_DEFINITION_BY_ID.get(mod)?.exclusiveGroup === 'fusion';
    const FUSION_FORMAT_KEYWORDS = [...new Set(MOD_DEFINITIONS
                                               .filter((definition) => definition.exclusiveGroup === 'fusion')
                                               .flatMap((definition) => definition.formatKeywords || []))];
    const isCrossFormat = (format) => fmtHas(format, ...FUSION_FORMAT_KEYWORDS);

    // Provider mods can coexist with the primary format mod (for example,
    // Camove is both Camomons and an all-moves format).
    const FORMAT_PROVIDER_KEYWORDS = MOD_DEFINITIONS.flatMap((definition) =>
                                                             (definition.providerKeywords || []).map((keyword) => [keyword, definition.id])
                                                            );

    // ====================================================================
    // 2. ROOM HELPERS
    // ====================================================================

    const getTeambuilderRoom = () => window.app?.rooms?.teambuilder || null;
    const getActiveTeambuilderRoom = () =>
    getTeambuilderRoom() || (window.room?.curTeam ? window.room : null);
    const getEngine = () => getTeambuilderRoom()?.search?.engine;

    // ---------- format stacking ----------
    //
    // A team's format can carry custom rules ("gen9ou@@@badnboostedmod, flippedmod"), which is how
    // OMs are stacked.

    const asMods = (m) => (Array.isArray(m) ? m : m ? [m] : []);

    // Mods that fight over the same thing: only the first one in the list is used.
    const EXCLUSIVE_MOD_GROUPS = [...MOD_DEFINITIONS.reduce((groups, definition) => {
        if (!definition.exclusiveGroup) return groups;
        if (!groups.has(definition.exclusiveGroup)) groups.set(definition.exclusiveGroup, []);
        groups.get(definition.exclusiveGroup).push(definition.id);
        return groups;
    }, new Map()).values()];

    function resolveExclusive(mods) {
        const out = [];
        for (const mod of mods) {
            const group = EXCLUSIVE_MOD_GROUPS.find((g) => g.includes(mod));
            if (group && out.some((m) => group.includes(m))) continue;
            out.push(mod);
        }
        return out;
    }

    // ModifySpecies event handlers run by priority, high to low. Stable source
    // order within a priority bracket follows the challenge code's rule order. I do that bc its random in showdowns code lol.
    function orderModsByShowdownPriority(mods) {
        return asMods(mods).map((mod, index) => ({
            mod,
            index,
            priority: MOD_DEFINITION_BY_ID.get(mod)?.modifySpeciesPriority || 0,
        })).sort((a, b) =>
                 b.priority - a.priority || a.index - b.index
                ).map(({mod}) => mod);
    }

    // Mods a format string turns on by itself: its own mod, provider mods, and "@@@" rule mods.
    function modsFromFormatString(format) {
        const mods = [];
        const add = (mod) => {if (mod && !mods.includes(mod)) mods.push(mod);};
        const remove = (mod) => {const idx = mods.indexOf(mod); if (idx >= 0) mods.splice(idx, 1);};
        const matchBase = (text) => {
            add(modFromFormat(text));
            const id = fmtId(text);
            for (const [keyword, mod] of FORMAT_PROVIDER_KEYWORDS) if (id.includes(keyword)) add(mod);
        };
        const base = String(format || '').split('@@@')[0].trim();
        matchBase(base);
        if (/^(gen\d+)?(nationaldex|natdex)?aaa$/.test(fmtId(base))) add(MOD.ALMOST_ANY_ABILITY);

        // Do NOT run substring matching on signed rules (a removed rule must not
        // activate its mod). Rules are applied in their source order.
        let unrestrictedAbilities = false;
        let unrestrictedMoves = false;
        for (const op of formatRuleTokens(format)) {
            if (!['rule', 'value', 'replace', 'remove'].includes(op.kind)) continue;
            const on = op.kind !== 'remove';
            const id = op.id;
            if (id === 'obtainable') {
                unrestrictedAbilities = !on;
                unrestrictedMoves = !on;
            } else if (id === 'obtainableabilities') unrestrictedAbilities = !on;
            else if (id === 'obtainablemoves') unrestrictedMoves = !on;

            let matching = MOD_DEFINITIONS.filter((d) =>
                toSearchId(d.challengeRule || '') === id ||
                (d.formatKeywords || []).some((keyword) => id === keyword || id === keyword + 'mod') ||
                (d.providerKeywords || []).some((keyword) => id === keyword ||
                    id === keyword + 'mod' || id === keyword + 'movelegality')
            ).map((d) => d.id);
            // Showdown's current ruleset uses these precise legality names.
            if (id === 'convergencelegality') matching.push(MOD.CONVERGENCE);
            if (id === 'aaarestrictedabilities') matching.push(MOD.ALMOST_ANY_ABILITY);
            if (id === 'godlygiftmod') matching.push(MOD.GODLY_GIFT);
            if (id === 'sketchmonsmovelegality') matching.push(MOD.SKETCHMONS);
            for (const mod of new Set(matching)) on ? add(mod) : remove(mod);
        }
        if (unrestrictedAbilities) add(MOD.ALMOST_ANY_ABILITY);
        if (unrestrictedMoves) add(MOD.ALL_MOVES);
        return mods;
    }

    let modsMemo = null;

    // Every ordered mod that applies to the team being edited. The array is shared (memoized):
    // never mutate it.
    function getActiveMods(room = getActiveTeambuilderRoom()) {
        const team = room?.curTeam;
        isGodlyGiftFormat(room);
        isTierShiftAAAFormat(room); // side effects: start the banlist fetches

        const m = modsMemo;
        if (m && m.team === team && m.format === team?.format) return m.mods;

        const result = Object.freeze(resolveExclusive(modsFromFormatString(team?.format)));
        modsMemo = {team, format: team?.format, mods: result};
        return result;
    }

    // The team's first mod (kept for callers that only care about "the" mod).
    const getActiveMod = (room = getActiveTeambuilderRoom()) => getActiveMods(room)[0] || null;

    // Mods for a search object (move / ability / pokemon / item search). Uses the team being
    // edited when the search belongs to its format, so the team's extras apply too.
    const searchFormatId = (f) => stripGen(fmtId(String(f || '').split('@@@')[0]));
    function modsForSearch(search) {
        if (search?.__qolProviderMods) return search.__qolProviderMods;
        const room = getActiveTeambuilderRoom();
        const team = room?.curTeam;
        const engine = room?.search?.engine;
        // PS strips generation, National Dex, doubles, etc. from search.format.
        // Prefer ownership; comparing the raw format strings loses custom rules.
        const owned = search && [engine?.typedSearch, engine?.moveSearch, engine?.abilitySearch].includes(search);
        if (team && search && (owned || searchFormatId(team.format) === searchFormatId(search.format))) {
            return getActiveMods(room);
        }
        return modsFromFormatString(search?.format);
    }

    // Redraws everything that depends on the team's format / mod list.
    function refreshAfterFormatChange(room) {
        if (!room) return;

        const engine = room.search?.engine;
        if (engine?.filters && !fmtHas(room.curTeam?.format, 'monocolor', 'monocolour')) {
            engine.filters = engine.filters.filter(([type]) => baseFilterType(type) !== 'color');
            if (room.search) room.search.filters = engine.filters;
        }
        for (const search of [engine?.typedSearch, engine?.moveSearch, engine?.abilitySearch]) {
            if (!search) continue;
            search.__qolFusionKey = null;
            clearSearchCache(search);
        }

        try {
            if (room.curSet) {
                refreshTypeIcons(room);
                room.updateStatForm();
                room.updateStatGraph();
            } else {
                room.update?.(); // team view: re-render the set rows and the format button
            }
        } catch (e) {
            console.warn(LOG, 'format refresh failed:', e);
        }

        refreshSearch(room, {clearBase: true});
        // Showdown's native editor may create the EV controls only after its
        // update finishes; recompute once on the next frame, not per mutation.
        if (room.curSet && !room.__qolFormatStatRefreshPending) {
            room.__qolFormatStatRefreshPending = true;
            requestAnimationFrame(() => {
                room.__qolFormatStatRefreshPending = false;
                if (getActiveTeambuilderRoom() !== room || !room.curSet) return;
                try {
                    room.updateStatForm?.();
                    room.updateStatGraph?.();
                } catch (e) { console.warn(LOG, 'Deferred stat refresh failed:', e); }
            });
        }
    }

    // ====================================================================
    // 3. PATCH HELPERS
    // ====================================================================

    function hasPatchTag(fn, tag) {
        while (typeof fn === 'function') {
            if (fn[tag]) return true;
            fn = fn.__original;
        }
        return false;
    }

    // Wraps target[key] exactly once; `wrap(original)` returns the replacement.
    function patchMethod(target, key, tag, wrap) {
        if (!target || typeof target[key] !== 'function') return false;
        if (hasPatchTag(target[key], tag)) return true;

        const original = target[key];
        const wrapped = wrap(original);

        wrapped[tag] = true;
        wrapped.__original = original;
        target[key] = wrapped;
        return true;
    }

    function findPrototypeWithMethod(obj, methodName) {
        let proto = obj;
        while (proto) {
            if (Object.prototype.hasOwnProperty.call(proto, methodName)) return proto;
            proto = Object.getPrototypeOf(proto);
        }
        return null;
    }

    // Patches a method on whatever prototype owns it for the live search engine.
    function patchEngineMethod(key, tag, wrap) {
        return patchMethod(findPrototypeWithMethod(getEngine(), key), key, tag, wrap);
    }

    function patchNativeFormatRefresh() {
        const proto = window.TeambuilderRoom?.prototype;
        const change = patchMethod(proto, 'changeFormat', '__qolNativeFormatChangeRefresh', (original) =>
            function (...args) {
                const before = this.curTeam?.format;
                const result = original.apply(this, args);
                if (this.curTeam?.format !== before) refreshAfterFormatChange(this);
                return result;
            });
        const open = patchMethod(proto, 'edit', '__qolNativeTeamOpenRefresh', (original) =>
            function (...args) {
                const result = original.apply(this, args);
                if (this.curTeam) refreshAfterFormatChange(this);
                return result;
            });
        return change && open;
    }

    // Temporarily makes `dex.species.get` return `targetSpecies` with fields
    // overridden. This is how every mod fakes a stat change without touching
    // Showdown's real dex data.
    function withSpeciesOverrides(dex, targetSpecies, overrides, fn) {
        if (!dex?.species?.get || !targetSpecies) return fn();

        const originalGet = dex.species.get;
        const modified = Object.assign({}, targetSpecies, overrides);

        dex.species.get = function (name) {
            const result = originalGet.call(this, name);
            return result === targetSpecies ? modified : result;
        };

        try {
            return fn();
        } finally {
            dex.species.get = originalGet;
        }
    }

    // A native stat render is recursive: updateStatForm -> getStat/updateStatGraph
    // -> guesser/optimizer -> getStat. All those paths share a Dex instance.
    // Applying a species transform twice is incorrect (35 -> 70 -> 140 in BnB).
    const activeStatOverrides = new WeakMap();
    const isStatOverrideActive = (dex, speciesId) => {
        const active = dex && activeStatOverrides.get(dex);
        return !!active && active.has(toID(speciesId));
    };
    function withSpeciesBaseStats(dex, speciesId, baseStats, fn) {
        if (!dex?.species?.get || !baseStats) return fn();
        const id = toID(speciesId);
        let active = activeStatOverrides.get(dex);
        if (active?.has(id)) return fn(); // already transformed by an outer wrapper
        const species = dex.species.get(speciesId);
        if (!species?.exists) return fn();
        if (!active) { active = new Set(); activeStatOverrides.set(dex, active); }
        active.add(id);
        try {
            return withSpeciesOverrides(dex, species, {baseStats: copy(baseStats)}, fn);
        } finally {
            active.delete(id);
            if (!active.size) activeStatOverrides.delete(dex);
        }
    }

    // Same idea for call sites that read `pokemon.getSpecies()`.
    function withOverriddenGetSpecies(pokemon, shiftedSpecies, fn) {
        if (!pokemon?.getSpecies) return fn();

        const original = pokemon.getSpecies;
        pokemon.getSpecies = () => shiftedSpecies;

        try {
            return fn();
        } finally {
            pokemon.getSpecies = original;
        }
    }

    // ====================================================================
    // 4. SEARCH-RESULT HELPERS
    // ====================================================================

    function refreshSearchUi(room) {
        const ui = room?.search;
        if (!ui) return;
        if (typeof ui.update === 'function') ui.update();
        else if (typeof ui.updateResults === 'function') ui.updateResults();
    }

    const clearSearchCache = (search) => {
        search.__qolProviderPools = null;
        search.baseResults = null;
        search.baseIllegalResults = null;
        search.illegalReasons = null;
    };

    // Throws away the engine's results (and optionally the typed search's
    // cached base results) and redraws the open search list.
    function refreshSearch(room, {clearBase = false} = {}) {
        const engine = room?.search?.engine;
        if (!engine) return;
        if (clearBase && engine.typedSearch) clearSearchCache(engine.typedSearch);
        engine.results = null;
        refreshSearchUi(room);
    }

    // Runs fn with the search temporarily pointed at a different species.
    function withSearchSpecies(search, speciesName, fn) {
        const savedSpecies = search.species;
        const savedSet = search.set;

        search.species = toID(speciesName);
        search.set = Object.assign({}, savedSet, {species: speciesName, name: ''});

        try {
            return fn();
        } finally {
            search.species = savedSpecies;
            search.set = savedSet;
        }
    }

    // Flat result list -> [{header, rows}].
    function splitIntoSections(rows) {
        const sections = [];
        let cur = {header: null, rows: []};
        sections.push(cur);

        for (const row of rows) {
            if (row[0] === 'header') {
                cur = {header: row, rows: []};
                sections.push(cur);
            } else {
                cur.rows.push(row);
            }
        }
        return sections;
    }

    // Adds each move from `extra` that `base` lacks into the section with the
    // same header, so the movepools read as one list.
    function mergeMoveResults(base, extra) {
        const sections = splitIntoSections(base);
        const sectionKey = (s) => (s.header ? String(s.header[1]) : '');
        const byKey = new Map(sections.map((s) => [sectionKey(s), s]));

        const have = new Set(base.filter((r) => r[0] === 'move').map((r) => r[1]));
        const wasSorted = new Map(
            sections.map((s) => {
                const ids = s.rows.map((r) => String(r[1]));
                return [s, ids.every((id, i) => i === 0 || ids[i - 1] <= id)];
            })
        );
        const touched = new Set();

        for (const section of splitIntoSections(extra)) {
            for (const row of section.rows) {
                if (row[0] !== 'move' || have.has(row[1])) continue;
                have.add(row[1]);

                let target = byKey.get(sectionKey(section));
                if (!target) {
                    target = {header: section.header, rows: []};
                    sections.push(target);
                    byKey.set(sectionKey(section), target);
                    wasSorted.set(target, true);
                }

                target.rows.push(row);
                touched.add(target);
            }
        }

        // Keep alphabetical order in any section that already had it.
        for (const s of touched) {
            if (wasSorted.get(s)) s.rows.sort((a, b) => String(a[1]).localeCompare(String(b[1])));
        }

        return sections.flatMap((s) => (s.header ? [s.header, ...s.rows] : s.rows));
    }

    // Adds brand-new move ids (Alphabet Cup letters, National Dex movepool...)
    // under the native "Moves" / "Usually useless moves" headers.
    function addMovesToResults(search, results, species, newIds) {
        let usableHeader = null;
        let uselessHeader = null;
        let lastHeader = null;
        let seenMove = false;

        for (const r of results) {
            if (r[0] === 'header') {
                lastHeader = r;
                const text = String(r[1]);
                if (!uselessHeader && /useless/i.test(text) && !/z-move/i.test(text)) uselessHeader = r;
            } else if (r[0] === 'move' && !seenMove) {
                seenMove = true;
                usableHeader = lastHeader;
            }
        }
        if (usableHeader && usableHeader === uselessHeader) usableHeader = ['header', 'Moves'];

        // Sort the new moves with the client's own "is this useless" check.
        const allIds = results.filter((r) => r[0] === 'move').map((r) => r[1]).concat(newIds);
        const isUsable = (id) => {
            if (typeof search.moveIsNotUseless !== 'function') return true;
            try {
                return !!search.moveIsNotUseless(id, species, allIds, search.set);
            } catch (e) {
                return true;
            }
        };

        const usable = [];
        const useless = [];
        for (const id of newIds) (isUsable(id) ? usable : useless).push(['move', id]);

        const extra = [];
        if (usable.length) extra.push(...(usableHeader ? [usableHeader] : []), ...usable);
        if (useless.length) extra.push(uselessHeader || ['header', 'Usually useless moves'], ...useless);

        return extra.length ? mergeMoveResults(results, extra) : results;
    }

    function pokemonIconHtml(speciesId) {
        const icon = Dex.getPokemonIcon(speciesId);
        if (typeof icon !== 'string') return '';
        // Some client versions return a full <span>, others just the CSS.
        return icon.trim().startsWith('<') ? icon : `<span class="picon" style="${icon}"></span>`;
    }

    // ====================================================================
    // 5. SERVER BANLISTS
    //
    // Banlists live server-side only, so we ask via a silent `/tier` command
    // and parse the `/raw` reply (which is then hidden from chat).
    //   - Named lists: Tier Shift AAA, Godly Gift, Convergence
    //   - Generic: every other format (species / tier bans only)
    // ====================================================================

    const BL = {
        tsa: {command: '/tier tiershiftaaa', loaded: false, sent: false, silent: false},
        gg: {command: '/tier godly gift', loaded: false, sent: false, silent: false},
        conv: {command: '/tier convergence', loaded: false, sent: false, silent: false},
    };

    let tsaBanlist = new Set();
    let godlyGiftRestricted = new Set();
    let convergenceBans = null;

    const BAN_TIER_IDS = new Set([
        'ag', 'uber', 'ou', 'uubl', 'uu', 'rubl', 'ru', 'nubl', 'nu',
        'publ', 'pu', 'zubl', 'zu', 'nfe', 'lc',
    ]);

    // "Uber" -> 'uber'; National Dex's "ND Uber" -> 'uber' as well (judged on National Dex tiers, see
    // natdexTierMap). Null if the token isn't a tier.
    const banTierId = (id) =>
    BAN_TIER_IDS.has(id) ? id : (/^nd/.test(id) && BAN_TIER_IDS.has(id.slice(2)) ? id.slice(2) : null);

    function requestBanlist(key) {
        const b = BL[key];
        if (b.loaded || b.sent) return;
        if (!window.app || typeof app.send !== 'function') return;

        // Install the receiver before sending: a fast server response must not
        // arrive before the suppression hook has been attached.
        patchServerReceive();
        b.sent = true;
        b.silent = true;
        b.sentAt = Date.now();
        app.send(b.command);
    }

    // Checking "is this format active" also kicks off the fetch the first time.
    function formatActive(room, keyword, key) {
        const active = fmtHas(room?.curTeam?.format, keyword);
        if (active) requestBanlist(key);
        return active;
    }

    // The restricted list comes from the generic base banlist (plus custom rules), so nothing
    // is requested here: getMergedBans() asks the server once per format.
    const isGodlyGiftFormat = (room) => modsFromFormatString(room?.curTeam?.format).includes(MOD.GODLY_GIFT);
    const isTierShiftAAAFormat = (room) => formatActive(room, 'tiershiftaaa', 'tsa');
    // The Convergence Megamons challenge code is based on Anything Goes and adds
    // Convergence Legality, !Obtainable Formes and individual +Mega entries.
    // It is NOT Mix and Mega: the Mega formes are starting species, not stone effects.
    // Keep the same path for the eventual standalone Showdown format.
    function isConvergenceMegamons(format) {
        const name = String(format || '').split('@@@')[0];
        if (fmtHas(name, 'convergencemegamons', 'megamonsconvergence')) return true;
        // A removed Convergence rule is not an active Convergence format.
        if (!modsFromFormatString(format).includes(MOD.CONVERGENCE)) return false;
        const ops = formatRuleTokens(format);
        const allowedMega = ops.some((op) => op.kind === 'unban' && /-mega(?:-[a-z0-9]+)?$/i.test(op.name || ''));
        let unblockedFormes = false;
        for (const op of ops) if (op.id === 'obtainableformes') {
            if (op.kind === 'remove') unblockedFormes = true;
            else if (['rule', 'replace'].includes(op.kind)) unblockedFormes = false;
        }
        return allowedMega || unblockedFormes;
    }

    function isConvergenceEnabled(format) {
        return modsFromFormatString(format).includes(MOD.CONVERGENCE) || isConvergenceMegamons(format);
    }

    function explicitlyUnbannedForms(format) {
        const ids = new Set();
        // Follow Showdown custom-rule ordering. A later ban cancels an earlier
        // unban, and a later unban re-enables the form.
        for (const op of formatRuleTokens(format)) {
            if (op.kind !== 'unban' && op.kind !== 'ban') continue;
            const name = String(op.name || '').trim();
            if (!name || /^(?:ability|move|item|type|teratype)\s*:/i.test(name)) continue;
            const id = toID(name);
            if (op.kind === 'unban') ids.add(id);
            else ids.delete(id);
        }
        return ids;
    }

    const isConvergenceFormat = (room) => {
        const format = room?.curTeam?.format;
        if (isConvergenceMegamons(format)) return true;
        const active = isConvergenceEnabled(format);
        if (active) requestBanlist('conv');
        return active;
    };

    // ---------- parsing ----------

    // Splits the `/raw` blob into {Bans: [...], Unbans: [...], ...}.
    // `header` is optional: pass null to skip the "is this the right format" check.
    function parseFormatSectionTokens(html, header) {
        if (!html || (header && !html.includes(header))) return null;

        const doc = new DOMParser().parseFromString(html, 'text/html');
        // The official /formathelp HTML places <summary>Banlist/Ruleset</summary>
        // directly against <b>Ruleset</b>. textContent otherwise becomes
        // 'Banlist/RulesetRuleset - ...', so the old regexp misses EVERY rule.
        doc.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
        doc.querySelectorAll('summary, h2, hr, b').forEach((node) => node.before(doc.createTextNode('\n')));
        const text = doc.body.textContent || '';

        const re = /(^|[^A-Za-z])(Bans|Unbans|Restricted|Restrictions|Unrestricted|Ruleset|Rules|Custom Rules)\s+-\s+/g;
        const marks = [];
        let m;
        while ((m = re.exec(text))) {
            marks.push({
                label: m[2],
                labelStart: m.index + m[1].length,
                bodyStart: m.index + m[0].length,
            });
        }

        const sections = {};
        marks.forEach((mark, i) => {
            const end = i + 1 < marks.length ? marks[i + 1].labelStart : text.length;
            const tokens = text.slice(mark.bodyStart, end).split(',').map((t) => t.trim()).filter(Boolean);
            sections[mark.label] = (sections[mark.label] || []).concat(tokens);
        });

        return sections;
    }

    // Species ids from a "<Label> - a, b, c" list under a given format header.
    function parseNameListFromHtml(html, sectionHeader, listLabel) {
        const sections = parseFormatSectionTokens(html, sectionHeader);
        if (!sections?.[listLabel]) return null;

        const ids = new Set();
        for (const name of sections[listLabel]) {
            const species = Dex.species.get(name);
            if (species?.exists) ids.add(species.id);
        }
        return ids;
    }

    const isBaseForme = (sp) => sp.name === (sp.baseSpecies || sp.name);

    // "Urshifu" bans every forme; "Urshifu-Base" / "Urshifu-Single-Strike" only
    // resolve to Urshifu via aliasing, so they ban that one forme.
    const bansWholeSpecies = (token, sp) =>
    toID(token) === toID(sp.baseSpecies || sp.name);

    // Shared by Convergence and the generic per-format banlists.
    const RESTRICTED_KEY = {abilities: 'restrictedAbilities', moves: 'restrictedMoves', items: 'restrictedItems'};
    function classifyRuleToken(token) {
        const text = String(token || '').trim();
        const typed = /^(pokemon|species|move|ability|item|type|teratype)\s*:\s*(.+)$/i.exec(text);
        const forced = typed?.[1]?.toLowerCase() || '';
        const value = typed ? typed[2].trim() : text;
        if (forced === 'type' || forced === 'teratype') {
            const type = Dex.types?.get?.(value);
            return type?.exists ? {kind: forced === 'type' ? 'types' : 'teraTypes', id: toID(type.name)} : null;
        }
        if (forced === 'pokemon' || forced === 'species') {
            const species = Dex.species.get(value);
            return species?.exists ? {kind: 'species', id: species.id} : null;
        }
        const kinds = {ability: ['abilities', Dex.abilities], move: ['moves', Dex.moves], item: ['items', Dex.items]};
        if (forced) {
            const entry = kinds[forced];
            if (!entry) return null;
            const hit = entry[1].get(value);
            return hit?.exists ? {kind: entry[0], id: hit.id} : null;
        }
        for (const [kind, database] of Object.values(kinds)) {
            const hit = database.get(value);
            if (hit?.exists) return {kind, id: hit.id};
        }
        return null;
    }

    function parseBanSections(sections) {
        const bans = {
            species: new Set(), baseSpecies: new Set(), tiers: new Set(),
            types: new Set(), teraTypes: new Set(),
            unbanned: new Set(), unbannedBase: new Set(),
            unbannedMoves: new Set(), unbannedAbilities: new Set(), unbannedItems: new Set(), abilities: new Set(),
            restricted: new Set(),
            restrictedBase: new Set(),
            restrictedAbilities: new Set(), // "*Comatose": only usable by Pokémon that natively have it
            moves: new Set(), items: new Set(), restrictedMoves: new Set(), restrictedItems: new Set(),
            abilityCombos: new Set(),       // "-Regenerator + Wimp Out": can't have both
            ruleset: [],                    // the format's own rules, in order ("!Obtainable Abilities"...)
        };
        let sawNonSpeciesBan = false;

        for (const token of sections.Bans || []) {
            const id = toID(token);
            const tierId = banTierId(id);
            if (tierId) {
                bans.tiers.add(tierId);
                continue;
            }

            if (/\s\+\s/.test(token)) { // "Regenerator + Wimp Out"
                const parts = token.split('+').map((p) => Dex.abilities.get(p.trim().replace(/^ability\s*:\s*/i, '')));
                if (parts.length >= 2 && parts.every((a) => a?.exists)) bans.abilityCombos.add(comboKey(parts.map((a) => a.id)));
                else sawNonSpeciesBan = true;
                continue;
            }

            let sp = Dex.species.get(token);
            let formeOnly = false;
            if (!sp?.exists && /-base$/i.test(token)) {
                sp = Dex.species.get(token.replace(/-base$/i, ''));
                formeOnly = true; // bans just the base forme, not the whole species
            }
            if (!sp?.exists) {
                const hit = classifyRuleToken(token);
                if (hit) bans[hit.kind].add(hit.id);
                sawNonSpeciesBan = true;
                continue;
            }
            ((formeOnly || !bansWholeSpecies(token, sp)) ? bans.species : bans.baseSpecies).add(sp.id);
        }

        // Do not infer Evasion Abilities Clause merely because some other
        // ability/item/move is banned; it is an independent rule.

        for (const token of sections.Unbans || []) {
            const id = toID(token);
            if (!id) continue;
            const sp = Dex.species.get(token);
            // Mega formes may be absent from the local Pokédex, even though the
            // server explicitly legalizes them. Preserve those species tokens.
            const isSpecies = sp?.exists || /-mega(?:-[a-z0-9]+)?$/i.test(token);
            const typed = isSpecies ? null : classifyRuleToken(token);
            // +Spore, +Arena Trap, +King's Rock, etc. are NOT species unbans.
            // The server's Unbans section contains all these kinds of entries.
            if (typed && typed.kind !== 'species') {
                if (typed.kind === 'moves') bans.unbannedMoves.add(typed.id);
                if (typed.kind === 'abilities') bans.unbannedAbilities.add(typed.id);
                if (typed.kind === 'items') bans.unbannedItems.add(typed.id);
                continue;
            }
            // Retain raw species IDs for formes not yet present in the client Dex.
            bans.unbanned.add(id);
            if (sp?.exists) {
                bans.unbanned.add(sp.id);
                if (bansWholeSpecies(token, sp)) bans.unbannedBase.add(sp.id);
            }
        }

        for (const token of [...(sections.Restricted || []), ...(sections.Restrictions || [])]) {
            const sp = Dex.species.get(token);
            if (!sp?.exists) {
                const hit = classifyRuleToken(token);
                if (hit) bans[RESTRICTED_KEY[hit.kind]].add(hit.id);
                continue;
            }

            const tokenId = toID(token);
            const baseId = toID(sp.baseSpecies || sp.name);

            // Only an explicit base-species entry restricts every forme.
            if (tokenId === toID(sp.name) && sp.id === baseId) {
                bans.restrictedBase.add(baseId);
            } else {
                // Preserve forme-specific restrictions, including aliases.
                bans.restricted.add(sp.id);
            }
        }

        bans.ruleset = (sections.Ruleset || sections.Rules || []).slice();
        return bans;
    }

    const comboKey = (ids) => ids.slice().sort().join('+');

    // `tierId`: the species' tier id when it isn't sp.tier (National Dex); '' = no tier known.
    function isBannedByList(bans, sp, ignoreTiers = false, tierId = undefined) {
        if (!bans || !sp?.exists) return false;

        const baseId = toID(sp.baseSpecies || sp.name);
        if (bans.unbanned.has(sp.id) || bans.unbannedBase.has(baseId)) return false;

        const restricted = bans.restricted.has(sp.id) || bans.restrictedBase.has(baseId);
        return bans.species.has(sp.id) ||
            bans.baseSpecies.has(baseId) ||
            sp.types?.some((type) => bans.types?.has(toID(type))) ||
            (!ignoreTiers && !restricted && bans.tiers.has(tierId ?? toID(sp.tier)));
    }

    // ---------- custom rules ("-X" ban, "+X" unban, "*X" restrict) on top of a base banlist ----------

    const cloneBans = (bans) => {
        const out = {};
        for (const key of Object.keys(bans)) out[key] = Array.isArray(bans[key]) ? bans[key].slice() : new Set(bans[key]);
        return out;
    };

    // Rules apply in the order written, so a later "-X" beats an earlier "+X" and vice versa.
    function applyCustomRuleTokens(base, tokens) {
        const bans = cloneBans(base);

        for (let raw of tokens) {
            raw = raw.trim();
            const sign = raw[0];
            if (sign !== '-' && sign !== '+' && sign !== '*') {
                bans.ruleset.push(raw); // "!Obtainable Abilities", "Terastal Clause"...: rules, not lists
                continue;
            }
            const token = raw.slice(1).trim();
            if (!token) continue;

            if (/\s\+\s/.test(token)) { // ability combination
                const parts = token.split('+').map((p) => Dex.abilities.get(p.trim().replace(/^ability\s*:\s*/i, '')));
                if (parts.length >= 2 && parts.every((a) => a?.exists)) {
                    const key = comboKey(parts.map((a) => a.id));
                    if (sign === '-') bans.abilityCombos.add(key);
                    else if (sign === '+') bans.abilityCombos.delete(key);
                }
                continue;
            }

            const tierId = banTierId(toID(token));
            if (tierId) {
                if (sign === '-') bans.tiers.add(tierId);
                else if (sign === '+') bans.tiers.delete(tierId);
                continue;
            }

            let sp = Dex.species.get(token);
            let formeOnly = false;
            if (!sp?.exists && /-base$/i.test(token)) {
                sp = Dex.species.get(token.replace(/-base$/i, ''));
                formeOnly = true;
            }

            if (!sp?.exists) {
                const hit = classifyRuleToken(token);
                if (hit) {
                    const unbans = hit.kind === 'moves' ? bans.unbannedMoves :
                        hit.kind === 'abilities' ? bans.unbannedAbilities :
                        hit.kind === 'items' ? bans.unbannedItems : null;
                    if (sign === '-') { bans[hit.kind].add(hit.id); unbans?.delete(hit.id); }
                    else if (sign === '+') { bans[hit.kind].delete(hit.id); unbans?.add(hit.id); }
                    else if (RESTRICTED_KEY[hit.kind]) bans[RESTRICTED_KEY[hit.kind]].add(hit.id);
                }
                continue;
            }

            const whole = !formeOnly && bansWholeSpecies(token, sp);

            if (sign === '-') {
                (whole ? bans.baseSpecies : bans.species).add(sp.id);
                bans.unbanned.delete(sp.id);
                if (whole) bans.unbannedBase.delete(sp.id);
            } else if (sign === '+') {
                bans.unbanned.add(sp.id);
                if (whole) bans.unbannedBase.add(sp.id);
                bans.species.delete(sp.id);
                if (whole) bans.baseSpecies.delete(sp.id);
            } else {
                // Only an explicit base-species entry restricts every forme.
                if (whole && sp.id === toID(sp.baseSpecies || sp.name)) bans.restrictedBase.add(sp.id);
                else bans.restricted.add(sp.id);
            }
        }
        return bans;
    }

    // Source: smogon/pokemon-showdown data/rulesets.ts, rule definitions.
    // Named rulesets are expanded locally for UI display without requesting
    // /formathelp for each individual clause (which created needless PMs).
    const SHOWDOWN_RULE_INHERITANCE = Object.freeze({
        standardag: ['Obtainable', 'Team Preview', 'HP Percentage Mod', 'Cancel Mod', 'Endless Battle Clause'],
        standard: ['Standard AG', 'Sleep Clause Mod', 'Species Clause', 'Nickname Clause', 'OHKO Clause', 'Evasion Items Clause', 'Evasion Moves Clause'],
        standardoms: ['Standard AG', 'Species Clause', 'Nickname Clause', 'OHKO Clause', 'Evasion Moves Clause', 'Overflow Stat Mod'],
        standardnatdex: ['Standard AG', 'NatDex Mod', 'Species Clause', 'Nickname Clause', 'OHKO Clause', 'Evasion Clause', 'Sleep Clause Mod'],
        standarddoubles: ['Standard AG', 'Species Clause', 'Nickname Clause', 'OHKO Clause', 'Evasion Moves Clause', 'Gravity Sleep Clause'],
        evasionclause: ['Evasion Abilities Clause', 'Evasion Items Clause', 'Evasion Moves Clause'],
    });
    const SHOWDOWN_RULE_BANLIST = Object.freeze({
        ohkoclause: {moves: ['fissure', 'guillotine', 'horndrill', 'sheercold']},
        // Exact server banlist; do not infer from move.status because other
        // sleep-related moves do not automatically fall under this clause.
        sleepmovesclause: {moves: ['darkvoid', 'grasswhistle', 'hypnosis', 'lovelykiss', 'sing', 'sleeppowder', 'spore', 'yawn']},
        evasionabilitiesclause: {abilities: ['sandveil', 'snowcloak']},
        evasionitemsclause: {items: ['brightpowder', 'laxincense']},
        evasionmovesclause: {moves: ['acupressure', 'doubleteam', 'minimize']},
        accuracymovesclause: {moves: ['flash', 'kinesis', 'leaftornado', 'mirrorshot', 'mudbomb', 'mudslap', 'muddywater', 'nightdaze', 'octazooka', 'sandattack', 'smokescreen']},
        cfzclause: {moves: ['10000000voltthunderbolt', 'aciddownpour', 'alloutpummeling', 'blackholeeclipse', 'bloomdoom', 'breakneckblitz', 'catastropika', 'clangoroussoulblaze', 'continentalcrush', 'corkscrewcrash', 'devastatingdrake', 'extremeevoboost', 'genesissupernova', 'gigavolthavoc', 'guardianofalola', 'hydrovortex', 'infernooverdrive', 'letssnuggleforever', 'lightthatburnsthesky', 'maliciousmoonsault', 'menacingmoonrazemaelstrom', 'neverendingnightmare', 'oceanicoperetta', 'pulverizingpancake', 'savagespinout', 'searingsunrazesmash', 'shatteredpsyche', 'sinisterarrowraid', 'soulstealing7starstrike', 'splinteredstormshards', 'stokedsparksurfer', 'subzeroslammer', 'supersonicskystrike', 'tectonicrage', 'twinkletackle']},
    });

    function resolveClauseRules(bans, format) {
        const effective = new Set();
        // /formathelp's ruleset supplies the named format's server-verified
        // rules, and @@@ tokens supply overrides for imported formats.
        // Inline custom rules are processed in order, never by substring.
        const ops = [...(bans.ruleset || []), ...formatRuleTokens(format).map((op) => op.raw)];
        const activate = (id, path = new Set()) => {
            if (path.has(id)) return;
            effective.add(id);
            const children = SHOWDOWN_RULE_INHERITANCE[id];
            if (children) for (const name of children) activate(toSearchId(name), new Set([...path, id]));
        };
        const deactivate = (id, path = new Set()) => {
            if (path.has(id)) return;
            effective.delete(id);
            const children = SHOWDOWN_RULE_INHERITANCE[id];
            if (children) for (const name of children) deactivate(toSearchId(name), new Set([...path, id]));
        };
        for (const token of ops) {
            const op = parseChallengeRule(token);
            if (!op || !['rule', 'value', 'replace', 'remove'].includes(op.kind)) continue;
            if (op.kind === 'remove') deactivate(op.id);
            else activate(op.id);
        }
        return effective;
    }

    // This is an editor overlay, not a substitute for Showdown's TeamValidator.
    // Especially for team-wide/compound clauses, the server is authoritative.
    function addExplicitClauseBans(bans, format) {
        if (!bans) return bans;
        const effective = resolveClauseRules(bans, format);
        for (const id of effective) {
            const lists = SHOWDOWN_RULE_BANLIST[id];
            if (!lists) continue;
            for (const [kind, entries] of Object.entries(lists)) {
                const unbanned = kind === 'moves' ? bans.unbannedMoves :
                    kind === 'items' ? bans.unbannedItems : bans.unbannedAbilities;
                for (const moveId of entries) if (!unbanned?.has(moveId)) bans[kind].add(moveId);
            }
        }
        if (effective.has('zmoveclause') || effective.has('gemsclause')) {
            for (const [key, item] of Object.entries(window.BattleItems || {})) {
                const id = toID(item?.id || key);
                if (!id || bans.unbannedItems?.has(id)) continue;
                if (effective.has('zmoveclause') && item?.zMove) bans.items.add(id);
                if (effective.has('gemsclause') && item?.isGem) bans.items.add(id);
            }
        }
        return bans;
    }

    // The format's bans with the team's custom rules applied; null until the base list has loaded.
    function getMergedBansForFormat(format, seen = new Set()) {
        const baseId = fmtId(String(format || '').split('@@@')[0]);
        if (!baseId || seen.has(baseId)) return emptyBanSections();
        seen.add(baseId);
        // Convergence has a named list of its own, but is excluded from the
        // generic /tier cache. Keep its bans available to the ability search
        // decorator as well as the movepool provider.
        if (!isConvergenceMegamons(format) && isConvergenceEnabled(format) && convergenceBans) {
            const rules = String(format).split('@@@')[1] || '';
            if (!rules.trim()) return addExplicitClauseBans(cloneBans(convergenceBans), format);
            const tokens = rules.split(',').map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
            return addExplicitClauseBans(applyCustomRuleTokens(convergenceBans, tokens), format);
        }

        const id = genericBanFormatId(format);
        if (!id) return null;

        const entry = requestGenericBanlist(id);
        if (!entry.loaded || !entry.bans) return null;

        const rules = String(format).split('@@@')[1] || '';
        let merged = cloneBans(entry.bans);
        const tokens = rules.split(',').map((t) => t.trim()).filter(Boolean);
        const removed = new Set(tokens.filter((t) => t.startsWith('!')).map((t) => toID(t.slice(1))));
        for (const rule of [...entry.bans.ruleset, ...tokens]) {
            if (/^[!+*-]/.test(rule)) continue;
            const id = toID(rule);
            // Named rules/clause inheritance is handled by resolveClauseRules.
            // They are not independent ladder formats; requesting /formathelp
            // for every rule causes spurious PMs and unusable banlist caches.
            if (removed.has(id) || RULE_CATALOG.has(id) || !window.BattleFormats?.[id]) continue;
            const inherited = getMergedBansForFormat(id, new Set(seen));
            if (!inherited) continue;
            for (const key of Object.keys(merged)) {
                if (merged[key] instanceof Set) for (const value of inherited[key] || []) merged[key].add(value);
            }
        }
        return addExplicitClauseBans(applyCustomRuleTokens(merged, tokens), format);
    }

    const getMergedBans = (room) => getMergedBansForFormat(room?.curTeam?.format);

    function parseTSABanlist(html) {
        const ids = parseNameListFromHtml(html, '[Gen 9] Tier Shift AAA', 'Bans');
        if (!ids) return false;

        tsaBanlist = ids;
        BL.tsa.loaded = true;
        console.log(LOG, 'Loaded Tier Shift AAA banlist:', [...ids]);
        return true;
    }

    function parseGodlyGiftRestricted(html) {
        const ids = parseNameListFromHtml(html, '[Gen 9] Godly Gift', 'Restricted');
        if (!ids) return false;

        godlyGiftRestricted = ids;
        BL.gg.loaded = true;
        console.log(LOG, 'Loaded Godly Gift Restricted list:', [...ids]);
        return true;
    }

    function parseConvergenceBanlist(html) {
        const sections = parseFormatSectionTokens(html, null);
        if (!sections || !Object.keys(sections).length) return false;

        convergenceBans = parseBanSections(sections);
        BL.conv.loaded = true;
        convergenceIndexCache.clear();
        convergenceMoveCache.clear();
        console.log(LOG, 'Loaded Convergence bans');

        // Rebuild the open search once the banlist arrives.
        const room = getTeambuilderRoom();
        if (getActiveMods(room).includes(MOD.CONVERGENCE)) {
            refreshSearch(room, {clearBase: true});
        }
        return true;
    }

    // ---------- generic (every other format) ----------
    //
    // Infer standard tier bans immediately, then fill in the format's declared
    // lists from /formathelp. Named format inheritance is merged at read time.
    const genericBanlists = new Map();

    // Keep the generation in the key: `/tier gen5pu` and `/tier gen9pu` have
    // different inherited bans. Some client versions omit it from search.format,
    // so recover it from the active team when the base format matches.
    function genericBanFormatId(format) {
        let id = fmtId(String(format || '').split('@@@')[0]);
        if (id && !/^gen\d+/.test(id)) {
            const teamId = fmtId(String(getActiveTeambuilderRoom()?.curTeam?.format || '').split('@@@')[0]);
            if (/^gen\d+/.test(teamId) && stripGen(teamId) === id) id = teamId;
        }
        if (!id) return null;
        return id;
    }

    function emptyBanSections() {
        return {
            species: new Set(), baseSpecies: new Set(), tiers: new Set(),
            types: new Set(), teraTypes: new Set(),
            unbanned: new Set(), unbannedBase: new Set(),
            unbannedMoves: new Set(), unbannedAbilities: new Set(), unbannedItems: new Set(), abilities: new Set(),
            restricted: new Set(), restrictedBase: new Set(), restrictedAbilities: new Set(),
            abilityCombos: new Set(), ruleset: [],
            moves: new Set(), items: new Set(), restrictedMoves: new Set(), restrictedItems: new Set(),
        };
    }

    // The lower standard singles tiers ban every tier above them. The current
    // tier membership is read from the format's generation-specific Dex below.
    const STANDARD_TIER_ORDER = [
        'ag', 'uber', 'ou', 'uubl', 'uu', 'rubl', 'ru', 'nubl', 'nu', 'publ', 'pu', 'zubl', 'zu', 'nfe', 'lc',
    ];
    function inferredTierBans(id) {
        const bans = emptyBanSections();
        const genMatch = String(id).match(/^gen(\d+)/);
        if (!genMatch || /nationaldex|natdex/.test(id)) return bans;
        const tier = id.slice(genMatch[0].length);
        const index = STANDARD_TIER_ORDER.indexOf(tier);
        if (index > 0) for (const bannedTier of STANDARD_TIER_ORDER.slice(0, index)) bans.tiers.add(bannedTier);
        return bans;
    }

    // Keep explicit custom rules usable while the format details are loading.
    function requestGenericBanlist(id) {
        let entry = genericBanlists.get(id);
        if (!entry) {
            // The inferred bans are a temporary UI hint, not a complete RuleTable.
            // Convergence must NOT treat this as verified donor legality.
            entry = {loaded: true, verified: false, silent: false, bans: inferredTierBans(id)};
            genericBanlists.set(id, entry);
        }
        if (!entry.sentAt && !entry.verified && window.app?.send) {
            patchServerReceive();
            entry.sentAt = Date.now();
            entry.silent = true;
            app.send('/formathelp ' + id);
        }
        return entry;
    }

    // PMs created by /formathelp and /tier have no request ID. Match their
    // headings against *outstanding* script requests, never against old cache
    // entries: otherwise users' own /tier replies can disappear.
    const SILENT_BANLIST_TIMEOUT = 30000;
    const pendingGenericEntries = () => [...genericBanlists.entries()].filter(([, entry]) =>
        entry.silent && entry.sentAt && Date.now() - entry.sentAt < SILENT_BANLIST_TIMEOUT);
    const namedRequestPending = (key) => {
        const entry = BL[key];
        return !!entry?.silent && !!entry.sentAt && Date.now() - entry.sentAt < SILENT_BANLIST_TIMEOUT;
    };

    function cacheGenericBanlistReply(formatId, html) {
        const sections = parseFormatSectionTokens(html, null);
        if (!sections || !Object.keys(sections).length) return false;
        const entry = genericBanlists.get(formatId) || {loaded: false, verified: false};
        entry.bans = parseBanSections(sections);
        for (const tier of inferredTierBans(formatId).tiers) entry.bans.tiers.add(tier);
        entry.merged = null;
        entry.loaded = true;
        entry.verified = true;
        entry.silent = false;
        genericBanlists.set(formatId, entry);
        convergenceIndexCache.clear();
        convergenceMoveCache.clear();
        const room = getTeambuilderRoom();
        const engine = room?.search?.engine;
        for (const search of [engine?.typedSearch, engine?.moveSearch, engine?.abilitySearch]) {
            if (search) clearSearchCache(search);
        }
        if (engine) refreshSearch(room, {clearBase: true});
        if (room?.curSet && getActiveMods(room).includes(MOD.GODLY_GIFT)) {
            try { room.updateStatForm?.(); room.updateStatGraph?.(); } catch (e) { /* not on screen */ }
        }
        return true;
    }

    function finishGenericBanlistReply(formatId, html) {
        const entry = genericBanlists.get(formatId);
        if (!entry?.silent) return false;
        // Unrecognized responses still belong to the script, but they must
        // not incorrectly mark a placeholder banlist as server-verified.
        if (!cacheGenericBanlistReply(formatId, html)) entry.silent = false;
        return true;
    }

    // /formathelp can also be shown in room chat as |c|~|/raw, as in the
    // user's Alphabet Cup log. Learn its rules without removing that message
    // or creating a hidden /formathelp request. Only accept the exact active
    // format title; never import unrelated room chatter into the team rules.
    function observePublicFormatHelp(packet) {
        if (typeof packet !== 'string' || !packet.includes('/raw')) return;
        const active = getActiveTeambuilderRoom()?.curTeam?.format;
        const id = fmtId(String(active || '').split('@@@')[0]);
        if (!id) return;
        for (const line of packet.split('\n')) {
            const match = /^(?:\|c\|~\|\/raw |\|raw\|)(<div[\s\S]*)/.exec(line);
            if (!match) continue;
            const html = match[1];
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const title = doc.querySelector('h2')?.textContent || '';
            if (fmtId(title) !== id) continue;
            cacheGenericBanlistReply(id, html);
        }
    }

    function handleGenericBanlistRaw(html) {
        if (!html) return false;
        const waiting = pendingGenericEntries();
        if (!waiting.length) return false;
        const title = new DOMParser().parseFromString(html, 'text/html').querySelector('h2')?.textContent || '';
        const normFmt = (id) => id.replace(/natdex/g, 'nationaldex');
        const titleId = normFmt(fmtId(title));
        let formatId = titleId ? waiting.find(([id]) => normFmt(id) === titleId)?.[0] : null;
        if (!formatId && waiting.length === 1 && titleId) {
            // Some formats use aliases, but same-generation alone is NOT a
            // match (it could be another user's manual /tier command).
            const [id] = waiting[0];
            const registeredName = fmtId(window.BattleFormats?.[id]?.name);
            if (registeredName && normFmt(registeredName) === titleId) formatId = id;
        }
        if (!formatId && waiting.length === 1 && !titleId && /<table\b/i.test(html)) {
            // /formathelp may reply with a table when its search finds many
            // matches, rather than a single format's <h2> heading.
            formatId = waiting[0][0];
        }
        return formatId ? finishGenericBanlistReply(formatId, html) : false;
    }

    // First native ability (any slot) of `sp` that the format bans, else null.
    function nativeBannedAbility(bans, sp) {
        if (!bans?.abilities?.size || !sp?.abilities) return null;
        for (const name of Object.values(sp.abilities)) {
            const id = toID(name);
            if (id && bans.abilities.has(id)) return name;
        }
        return null;
    }

    // First banned ability combination ("Regenerator + Wimp Out") among a Pokémon's native abilities.
    function nativeBannedCombo(bans, sp) {
        if (!bans?.abilityCombos?.size || !sp?.abilities) return null;
        const ids = new Set(Object.values(sp.abilities).map((n) => toID(n)).filter(Boolean));
        for (const combo of bans.abilityCombos) {
            if (combo.split('+').every((id) => ids.has(id))) {
                return combo.split('+').map((id) => Dex.abilities.get(id)?.name || id).join(' + ');
            }
        }
        return null;
    }

    // Is `abilityId` banned for this Pokémon? (the ability itself, or, in Pokébilities, a banned
    // combination with one of its native abilities, since they're all active at once.)
    function abilityBanned(bans, abilityId, nativeIds, pokebilities) {
        if (!bans) return false;
        if (bans.abilities.has(abilityId)) return true;
        return !!pokebilities && !!bans.abilityCombos?.size &&
            nativeIds.some((n) => n !== abilityId && bans.abilityCombos.has(comboKey([abilityId, n])));
    }

    function isRestrictedInFormat(search, species) {
        const banFormat =
              getActiveTeambuilderRoom()?.curTeam?.format || search.format;
        const bans = getMergedBansForFormat(banFormat);
        if (!bans?.restricted.size && !bans?.restrictedBase.size) return false;
        const baseId = toID(species.baseSpecies || species.name);
        return bans.restricted.has(species.id) || bans.restrictedBase.has(baseId);
    }
    // ---------- server message receiver ----------

    const RAW_HANDLERS = [
        ['[Gen 9] Tier Shift AAA', 'tsa', parseTSABanlist],
        ['[Gen 9] Godly Gift', 'gg', parseGodlyGiftRestricted],
        ['[Gen 9] Convergence', 'conv', parseConvergenceBanlist],
    ];

    // /tier and /formathelp replies are routed through the special PM target
    // "~". Real server packets normally look like
    //     |pm| userName|~|/raw <div ...>
    // NOT necessarily |pm|~|~|/raw; the old matcher ignored the real packets.
    // Check exactly one side is the ~ command target and only consume replies
    // when a matching script-owned lookup is outstanding. Never block player
    // PMs, room chat, manually requested /tier, or other protocol traffic.
    // https://github.com/smogon/pokemon-showdown/blob/master/PROTOCOL.md
    function scriptPendingBanlist() {
        return Object.keys(BL).some(namedRequestPending) || pendingGenericEntries().length > 0;
    }

    function consumeRawLine(html) {
        let suppress = false;
        for (const [header, key, parse] of RAW_HANDLERS) {
            if (!html.includes(header) || !namedRequestPending(key)) continue;
            try { parse(html); } catch (e) { console.warn(LOG, `Failed to parse ${key} bans:`, e); }
            BL[key].silent = false;
            suppress = true;
        }
        if (!suppress) {
            try {
                if (handleGenericBanlistRaw(html)) suppress = true;
            } catch (e) {
                console.warn(LOG, 'Generic banlist parse failed:', e);
            }
        }
        return suppress;
    }

    function consumeScriptServerPm(line) {
        const match = /^\|pm\|([^|]*)\|([^|]*)\|([\s\S]*)$/.exec(line);
        if (!match) return false;
        // Pokemon Showdown uses the recipient "~" as its command-result PM box.
        // The sender may be the logged-in user's displayed name (with rank and
        // leading space), as in |pm| username|~|/raw ... . Some server/client
        // variants reverse those positions, and older variants use ~ for both.
        const sender = match[1].trim();
        const receiver = match[2].trim();
        if (sender !== '~' && receiver !== '~') return false;
        const message = match[3];
        if (message.startsWith('/raw ')) return consumeRawLine(message.slice(5));

        // /formathelp replies with /error when the requested format doesn't
        // exist. These errors were the main source of phantom PM windows.
        // Mark only one outstanding query as finished; don't hide any other PM.
        if (/^\/error\s+(?:No matched formats found\.|No matched formats found|The format .* does not exist\.?)/i.test(message)) {
            const generic = pendingGenericEntries();
            if (generic.length) {
                generic[0][1].silent = false;
                return true;
            }
            const namedKey = Object.keys(BL).find(namedRequestPending);
            if (namedKey) { BL[namedKey].silent = false; return true; }
        }
        return false;
    }

    // Remove the *entire* protocol PM line before Showdown creates the PM tab.
    // This also works when several messages share a single WebSocket packet.
    function filterSilentServerMessages(data) {
        if (typeof data !== 'string' || !data.includes('|pm|') || !scriptPendingBanlist()) return data;
        const parts = data.split('\n');
        const kept = parts.filter((line) => !consumeScriptServerPm(line));
        return kept.length === parts.length ? data : kept.join('\n');
    }

    function patchServerReceive() {
        return patchMethod(window.app, 'receive', '__qolPatched', (original) =>
            function (data) {
                let payload = data;
                try { observePublicFormatHelp(data); } catch (e) { console.warn(LOG, 'Formathelp observer failed:', e); }
                try { payload = filterSilentServerMessages(data); }
                catch (e) { console.warn(LOG, 'Failed to filter banlist PM:', e); }
                if (!payload || !payload.trim() || /^>[^\n]+\n?$/.test(payload)) return;
                return original.call(this, payload);
            }
        );
    }

    // Tier Shift AAA: ban list applied on top of the Gen 9 pool.
    function patchTsaSearchLegality() {
        return patchMethod(window.BattlePokemonSearch?.prototype, 'getBaseResults', '__qolPatched', (original) =>
                           function () {
            if (!fmtHas(this.format, 'tiershiftaaa')) return original.call(this);

            requestBanlist('tsa'); // no-op once loaded/requested

            // The base legal pool must come from Gen 9, not TSA's stale format data.
            const savedFormat = this.format;
            this.format = 'customgame'; // PS has already stripped the generation prefix.
            let gen9Results;
            try {
                gen9Results = original.call(this);
            } finally {
                this.format = savedFormat;
            }

            return gen9Results.filter((result) => {
                if (result[0] !== this.searchType) return true;
                if (tsaBanlist.has(result[1])) return false;

                // Arceus is banned as a species, so every forme is banned.
                return this.dex.species.get(result[1])?.baseSpecies !== 'Arceus';
            });
        }
                          );
    }

    // ====================================================================
    // 6. PER-MOD STAT MODIFIERS
    // ====================================================================

    const TIER_SHIFT_BOOSTS = {
        UU: 15, RUBL: 15,
        RU: 20, NUBL: 20,
        NU: 25, PUBL: 25,
        PU: 30, ZU: 30, ZUBL: 30, LC: 30, NFE: 30,
    };
    const getTierShiftBoost = (tier) => TIER_SHIFT_BOOSTS[tier] || 0;

    // Null if this tier isn't boosted, so callers fall back to unmodified stats.
    // Species-level modifiers take (species, from): `from` is the stats produced by the
    // mods before this one in the stack (defaults to the species' own base stats).
    function tierShiftModifiedStats(species, from = species?.baseStats) {
        if (!from) return null;

        const boost = getTierShiftBoost(species?.tier);
        if (!boost) return null;

        const stats = copy(from);
        for (const stat of BOOSTABLE_STATS) stats[stat] = clamp255(stats[stat] + boost);
        return stats;
    }

    // Re-Evolution: double the stat difference between this species and its
    // immediately previous evolution stage. Species without a previous stage
    // are unchanged. Base stats are capped at 255, as in the OM.
    function reevolutionModifiedStats(species, from = species?.baseStats,
        dex = getActiveTeambuilderRoom()?.curTeam?.dex || window.Dex) {
        if (!species?.baseStats || !from || !species.prevo) return null;
        const prevo = dex?.species?.get?.(species.prevo);
        if (!prevo?.exists || !prevo.baseStats || prevo.battleOnly) return null;
        const stats = copy(from);
        for (const stat of STATS) {
            stats[stat] = clamp255(stats[stat] + species.baseStats[stat] - prevo.baseStats[stat]);
        }
        return stats;
    }

    // Every base stat of 70 or lower is doubled.
    function badNBoostedModifiedStats(species, from = species.baseStats) {
        const stats = copy(from);
        for (const stat of STATS) {
            if (stats[stat] <= 70) stats[stat] = clamp255(stats[stat] * 2);
            else stats[stat] = clamp255(stats[stat]);
        }
        return stats;
    }

    // HP is unchanged; every other stat is scaled so BST ~= 600.
    function scalemonsModifiedStats(species, from = species.baseStats) {
        const stats = copy(from);
        const pst = BOOSTABLE_STATS.reduce((sum, stat) => sum + stats[stat], 0);
        if (!pst) return stats;

        const scale = 600 - stats.hp;
        for (const stat of BOOSTABLE_STATS) {
            stats[stat] = clamp255(Math.floor(stats[stat] * scale / pst));
        }
        return stats;
    }

    // HP/Atk/Def/SpA/SpD/Spe -> Spe/SpD/SpA/Def/Atk/HP
    function flippedModifiedStats(species, from = species.baseStats) {
        const s = from;
        return {hp: s.spe, atk: s.spd, def: s.spa, spa: s.def, spd: s.atk, spe: s.hp};
    }

    // BST <= 350: every stat (HP included) doubled. Eligibility uses the stats
    // produced by modifiers that run before this transform.
    function threeFiftyCupModifiedStats(species, from = species?.baseStats) {
        if (!species?.baseStats || !from || sumStats(from) > 350) return null;
        const stats = {};
        for (const stat of STATS) stats[stat] = clamp255(from[stat] * 2);
        return stats;
    }

    // Mods whose change depends only on the species (so it can be shown in
    // the search list, the battle speed tooltip, and the stat calculator).
    const SPECIES_STAT_MODIFIERS = {
        [MOD.TIER_SHIFT]: tierShiftModifiedStats,
        [MOD.BAD_N_BOOSTED]: badNBoostedModifiedStats,
        [MOD.SCALEMONS]: scalemonsModifiedStats,
        [MOD.FLIPPED]: flippedModifiedStats,
        [MOD.THREE_FIFTY_CUP]: threeFiftyCupModifiedStats,
        [MOD.REEVOLUTION]: reevolutionModifiedStats,
    };

    // Species-only mods are folded in Showdown priority order. Null if none applies.
    function foldSpeciesStats(mods, species) {
        let stats = null;
        for (const mod of orderModsByShowdownPriority(mods)) {
            const next = SPECIES_STAT_MODIFIERS[mod]?.(
                species, stats || species.baseStats, getActiveTeambuilderRoom()?.curTeam?.dex || window.Dex);
            if (next) stats = clampBaseStats(next);
        }
        return stats;
    }

    // `mods` may be a single mod or the whole ordered list.
    const hasSearchListStats = (mods) => asMods(mods).some((m) => !!SPECIES_STAT_MODIFIERS[m]);

    // Stats used when sorting/rendering the Pokémon search list.
    const searchListStats = (species, mods) => foldSpeciesStats(mods, species) || species.baseStats;

    function speciesModBaseStats(mod, dex, set, from) {
        const species = dex?.species?.get(set?.species);
        return species?.exists ? SPECIES_STAT_MODIFIERS[mod](species, from || species.baseStats, dex) : null;
    }

    // The +stat and -stat base stats trade places. Neutral natures: no change.
    function natureSwapBaseStats(dex, set, from) {
        const species = dex?.species?.get(set?.species);
        const nature = BattleNatures[set?.nature];
        if (!species?.exists || !nature?.plus || !nature?.minus) return null;

        const stats = copy(from || species.baseStats);
        [stats[nature.plus], stats[nature.minus]] = [stats[nature.minus], stats[nature.plus]];
        return stats;
    }

    // One step of the stat fold: (statsSoFar | null, ctx) -> new stats, or null for "no change".
    // ctx = {dex, set, room}. Every transform starts from the species' own stats when given null.
    const MOD_STAT_TRANSFORMS = {
        [MOD.MIX_AND_MEGA]: (from, {dex, set}) => mixAndMegaBaseStats(dex, set, from, 1),
        [MOD.GODLY_GIFT]: (from, {room, set}) => godlyGiftBaseStats(room, set, from),
        [MOD.CROSS_EVOLUTION]: (from, {dex, set}) => crossEvolutionBaseStats(dex, set, from),
        [MOD.FRANTIC_FUSIONS]: (from, {dex, set}) => franticFusionsBaseStats(dex, set, from),
        [MOD.REEVOLUTION]: (from, {dex, set}) => reevolutionModifiedStats(dex?.species?.get(set?.species), from, dex),
        [MOD.NATURE_SWAP]: (from, {dex, set}) => natureSwapBaseStats(dex, set, from),
    };
    for (const mod of Object.keys(SPECIES_STAT_MODIFIERS)) {
        MOD_STAT_TRANSFORMS[mod] = (from, {dex, set}) => speciesModBaseStats(mod, dex, set, from);
    }

    // The Ultra Mix Scalemons multiplier also scales the Mega Stone's stat
    // delta. Capture it from the stats entering Scalemons, not from the
    // already-normalized post-stone BST.
    function getMnmScalemonsScale(mods, ctx) {
        const list = orderModsByShowdownPriority(mods);
        if (!list.includes(MOD.SCALEMONS)) return 1;
        const species = ctx.dex?.species?.get(ctx.set?.species);
        if (!species?.exists) return 1;

        let stats = null;
        let scale = 1;
        for (const mod of list) {
            if (mod === MOD.MIX_AND_MEGA) continue;
            if (mod === MOD.SCALEMONS) {
                const from = stats || species.baseStats;
                const nonHpTotal = BOOSTABLE_STATS.reduce((sum, stat) => sum + from[stat], 0);
                if (nonHpTotal) scale = (600 - from.hp) / nonHpTotal;
            }
            const next = MOD_STAT_TRANSFORMS[mod]?.(stats, ctx);
            if (next) stats = next;
        }
        return scale;
    }

    // Fully modified baseStats, capped after each hook so stacked modifiers cannot exceed the limit.
    function computeModsBaseStats(mods, ctx) {
        const list = orderModsByShowdownPriority(mods);
        if (list.includes(MOD.MIX_AND_MEGA) && list.includes(MOD.SCALEMONS)) {
            let stats = null;
            for (const mod of list) {
                if (mod === MOD.MIX_AND_MEGA) continue;
                const next = MOD_STAT_TRANSFORMS[mod]?.(stats, ctx);
                if (next) stats = clampBaseStats(next);
            }
            return clampBaseStats(mixAndMegaBaseStats(
                ctx.dex, ctx.set, stats, getMnmScalemonsScale(list, ctx)
            ) || stats);
        }

        let stats = null;
        for (const mod of list) {
            const next = MOD_STAT_TRANSFORMS[mod]?.(stats, ctx);
            if (next) stats = clampBaseStats(next);
        }
        return clampBaseStats(stats);
    }

    // Single-mod form, kept for the battle-side callers (battle format = one mod).
    const computeModBaseStats = (mod, ctx) => computeModsBaseStats(mod, ctx);

    // ====================================================================
    // 7. TYPES / NATURE SWAP / CAMOMONS
    // ====================================================================

    // Types come from moves 1 and 2 (blank until a move is set).
    function camomonsTypes(dex, set) {
        if (!dex || !set) return [];
        const typeOf = (id) => {
            if (!id) return null;
            const move = dex.moves.get(id);
            return move?.exists ? move.type : null;
        };
        const t1 = typeOf(set.moves?.[0]);
        const t2 = typeOf(set.moves?.[1]);
        return [...new Set([t1, t2].filter(Boolean))]; // same type -> mono
    }

    // Camomons supplies the typing when active. Its move-based typing overrides
    // Mix and Mega's additional stone typing, even when both mods are combined.
    // Accepts a single mod or the whole list. Null if no mod touches types.
    function modifiedTypes(mods, dex, set) {
        let types = null;
        let hasMixAndMega = false;
        let hasCamomons = false;
        for (const mod of asMods(mods)) {
            let next = null;
            if (mod === MOD.MIX_AND_MEGA) {
                hasMixAndMega = true;
                continue;
            }
            else if (mod === MOD.CROSS_EVOLUTION) next = crossEvolutionTypes(dex, set, types);
            else if (mod === MOD.CAMOMONS) {
                hasCamomons = true;
                next = camomonsTypes(dex, set);
            }
            if (next) types = next;
        }
        if (hasMixAndMega && !hasCamomons) {
            const next = mixAndMegaModifiedTypes(dex, set, types);
            if (next) types = next;
        }
        // Bonus Type Mod grants the Tera Type as an additional typing (without
        // actually Terastallizing). Duplicates are suppressed, so Pokémon can
        // have one, two, or three types as on Showdown.
        if (asMods(mods).includes(MOD.BONUS_TYPE) && set?.teraType && dex?.types?.get) {
            const bonus = dex.types.get(set.teraType);
            if (bonus?.exists) {
                const natural = types || dex.species.get(set.species)?.types || [];
                types = [...new Set([...natural, bonus.name])];
            }
        }
        return types;
    }

    const typeIconsHtml = (types) => types.map((t) => Dex.getTypeIcon(t)).join('');

    function refreshTypeIcons(room) {
        const dex = room?.curTeam?.dex;
        const set = room?.curSet;
        const cell = room?.$?.('.setcell-typeicons');
        if (!dex || !set?.species || !cell?.length) return;

        const types = modifiedTypes(getActiveMods(room), dex, set) || dex.species.get(set.species)?.types || [];
        cell.html(typeIconsHtml(types));
    }

    let nsCamoListenerInstalled = false;
    function installNatureSwapCamomonsListener() {
        if (nsCamoListenerInstalled) return;
        nsCamoListenerInstalled = true;

        document.addEventListener('change', (e) => {
            const name = e.target?.getAttribute?.('name') || '';
            const room = getActiveTeambuilderRoom();
            if (!room) return;
            const mods = getActiveMods(room);

            // rAF so Showdown commits the value to curSet first.
            if (mods.includes(MOD.NATURE_SWAP) && name === 'nature') {
                requestAnimationFrame(() => { room.updateStatForm(); room.updateStatGraph(); });
            } else if (mods.includes(MOD.CAMOMONS) && /^move[1-4]$/.test(name)) {
                requestAnimationFrame(() => refreshTypeIcons(room));
            }
        }, true);
    }

    // ====================================================================
    // 8. MIX AND MEGA
    // ====================================================================

    // Blue/Red Orb and Arceus Plates don't behave like ordinary Mega Stones
    // in the dex (itemUser/megaStone is unreliable for them), so map explicitly.
    const MNM_ARCEUS_PLATE_TYPES = {
        flameplate: 'Fire', splashplate: 'Water', zapplate: 'Electric',
        meadowplate: 'Grass', icicleplate: 'Ice', fistplate: 'Fighting',
        toxicplate: 'Poison', earthplate: 'Ground', skyplate: 'Flying',
        mindplate: 'Psychic', insectplate: 'Bug', stoneplate: 'Rock',
        spookyplate: 'Ghost', dracoplate: 'Dragon', dreadplate: 'Dark',
        ironplate: 'Steel', pixieplate: 'Fairy',
    };

    function resolveSpecialMixAndMegaForme(dex, item) {
        let formeName, baseName;

        if (item.id === 'blueorb') [formeName, baseName] = ['Kyogre-Primal', 'Kyogre'];
        else if (item.id === 'redorb') [formeName, baseName] = ['Groudon-Primal', 'Groudon'];
        else if (MNM_ARCEUS_PLATE_TYPES[item.id]) {
            [formeName, baseName] = [`Arceus-${MNM_ARCEUS_PLATE_TYPES[item.id]}`, 'Arceus'];
        } else return null;

        const formeSpecies = dex.species.get(formeName);
        const baseSpecies = dex.species.get(baseName);
        return formeSpecies?.exists && baseSpecies?.exists ? {formeSpecies, baseSpecies} : null;
    }

    // Which forme an item turns a Pokémon into, and the (non-mega) species
    // that forme's stat changes are measured against.
    function resolveMegaForme(dex, item) {
        if (!item?.exists) return null;
        if (item.zMove || item.zMoveType) return null; // Z-crystals aren't Mega Stones

        const special = resolveSpecialMixAndMegaForme(dex, item);
        if (special) return special;

        const formeName =
              (item.megaStone && Object.values(item.megaStone)[0]) || item.itemUser?.[0];
        if (!formeName) return null;

        const formeSpecies = dex.species.get(formeName);
        if (!formeSpecies?.exists) return null;

        let baseSpecies = formeSpecies;

        if (formeSpecies.name === 'Zygarde-Mega') {
            baseSpecies = dex.species.get('Zygarde-Complete'); // MnM's base forme
        } else if (formeSpecies.isMega && formeSpecies.battleOnly) {
            const battleOnly = Array.isArray(formeSpecies.battleOnly)
            ? formeSpecies.battleOnly[0]
            : formeSpecies.battleOnly;
            baseSpecies = dex.species.get(battleOnly);
        } else if (formeSpecies.baseSpecies) {
            baseSpecies = dex.species.get(formeSpecies.baseSpecies);
        }

        return baseSpecies?.exists ? {formeSpecies, baseSpecies} : null;
    }

    function mixAndMegaStatDelta(dex, item, stat) {
        const forme = resolveMegaForme(dex, item);
        return forme ? forme.formeSpecies.baseStats[stat] - forme.baseSpecies.baseStats[stat] : 0;
    }

    // Shared lookup: {species, forme} (forme may be null) or null if unusable.
    function mnmLookup(dex, set) {
        if (!set?.species || !set?.item || !dex) return null;

        const species = dex.species.get(set.species);
        const item = dex.items.get(set.item);
        if (!species?.exists || !item?.exists) return null;

        return {species, forme: resolveMegaForme(dex, item)};
    }

    function mixAndMegaBaseStats(dex, set, from, scalemonsScale) {
        const m = mnmLookup(dex, set);
        if (!m?.forme) return null;

        if (scalemonsScale === undefined) {
            scalemonsScale = getMnmScalemonsScale(
                getActiveMods(), {dex, set, room: getActiveTeambuilderRoom()}
            );
        }

        const {species, forme} = m;
        const stats = copy(from || species.baseStats);

        // Already the forme the item represents (Zamazenta-Crowned, Palkia-Origin...):
        // don't apply its delta a second time.
        if (species.name === forme.formeSpecies.name || species.name === forme.baseSpecies.name) {
            return stats;
        }

        for (const stat of BOOSTABLE_STATS) {
            const delta = forme.formeSpecies.baseStats[stat] - forme.baseSpecies.baseStats[stat];
            stats[stat] = clamp255(
                stats[stat] + Math.floor(delta * scalemonsScale)
            );
        }
        return stats;
    }

    // Ability: MnM replaces the ability when Mega Evolving, but the set's own
    // ability is still the starting one, so we only preview it.
    function mixAndMegaFutureAbility(dex, set) {
        const m = mnmLookup(dex, set);
        if (!m) return null;

        // Showdown already applies these formes' abilities to the species.
        const {species} = m;
        if (
            species.battleOnly ||
            species.forme === 'Crowned' ||
            species.forme === 'Origin' ||
            species.forme === 'Primal'
        ) {
            return null;
        }

        return m.forme?.formeSpecies.abilities['0'] || null;
    }

    // Ports getFormeChangeDeltas() from the sim's mixandmega mod.
    function mixAndMegaTypeDelta(baseSpecies, formeSpecies) {
        let type = null;
        let formeType = null;

        if (baseSpecies.name === 'Arceus' || baseSpecies.name === 'Silvally') {
            type = formeSpecies.types[0];
            formeType = 'Primary';
        } else if (formeSpecies.types.length > baseSpecies.types.length) {
            type = formeSpecies.types[1]; // mono -> dual: gain the secondary
        } else if (formeSpecies.types.length < baseSpecies.types.length) {
            type = baseSpecies.types[0]; // dual -> mono: gain the mega's base primary
        } else if (formeSpecies.types[1] !== baseSpecies.types[1]) {
            type = formeSpecies.types[1];
        } else if (formeSpecies.types[0] !== baseSpecies.types[0]) {
            type = formeSpecies.types[0];
            formeType = 'Primary';
        }

        return {type, formeType};
    }

    // Applies the delta to the holder's own types (mutateOriginalSpecies()).
    // Null if no mega-stone-like item resolves.
    function mixAndMegaModifiedTypes(dex, set, from) {
        const m = mnmLookup(dex, set);
        if (!m?.forme) return null;

        const delta = mixAndMegaTypeDelta(m.forme.baseSpecies, m.forme.formeSpecies);
        const types = (from || m.species.types).slice();

        if (delta.formeType === 'Primary') {
            const second = types[1];
            return second && second !== delta.type ? [delta.type, second] : [delta.type];
        }

        if (!delta.type) return types;
        if (types[0] === delta.type) return [types[0]];
        return [types[0], delta.type];
    }

    // Pre-Mega speed, including other stacked base-stat mods (e.g. Scalemons
    // and Tier Shift), but excluding the Mega stone's own stat delta.
    function getPreMegaSpeed(set, room = getActiveTeambuilderRoom()) {
        const dex = room?.curTeam?.dex;
        const species = dex?.species?.get(set?.species);
        if (!species?.exists) return 0;

        const mods = getActiveMods(room).filter((mod) => mod !== MOD.MIX_AND_MEGA);
        const baseStats = computeModsBaseStats(mods, {dex, set, room}) || species.baseStats;

        const iv = set.ivs?.spe ?? 31;
        const ev = set.evs?.spe ?? 0;
        const level = set.level || 100;

        let speed =
            Math.floor((Math.floor(2 * baseStats.spe + iv + Math.floor(ev / 4)) * level) / 100) + 5;

        const nature = BattleNatures[set.nature];
        if (nature?.plus === 'spe') speed = Math.floor(speed * 1.1);
        else if (nature?.minus === 'spe') speed = Math.floor(speed * 0.9);

        return speed;
    }

    function updateMixAndMegaSpeedNote(room) {
        const note = room?.$chart?.find('.mnm-speed-note');
        if (!note?.length || !room.curSet) return;
        note.find('.mnm-speed-value').text(getPreMegaSpeed(room.curSet));
    }

    function updateMixAndMegaSpeedNotePosition(room) {
        const note = room?.$chart?.find('.mnm-speed-note');
        if (!note?.length) return;

        const suggested = room.$chart.find('.statform .suggested');
        const hasGuessedSpread =
              suggested.length && !suggested.text().includes('Please choose 4 moves');

        note.css('top', hasGuessedSpread ? '318px' : '300px');
    }

    function renderMixAndMegaSpeedNote(room) {
        const chart = room.$chart;
        if (!chart) return;

        chart.find('.basestatscol').css('position', 'relative');

        if (!chart.find('.mnm-speed-note').length) {
            chart.find('.basestatscol').after($(
                '<div class="mnm-speed-note" style="position:absolute;left:330px;top:350px;z-index:10;">' +
                'Pre-Speed is <span class="mnm-speed-value">0</span></div>'
            ));
        }

        updateMixAndMegaSpeedNote(room);
        updateMixAndMegaSpeedNotePosition(room);
    }

    // ====================================================================
    // 9. FUSIONS: CROSS EVOLUTION / FRANTIC FUSIONS / INHERITANCE
    //    (nickname = the donor / evolution target)
    // ====================================================================

    // Frantic Fusions + Inheritance: any species can fuse with any other
    // (no prevo/NFE rules).
    function resolveFusion(dex, set) {
        if (!dex || !set?.species || !set?.name) return null;

        const species = dex.species.get(set.species);
        const donor = dex.species.get(set.name);
        if (!species?.exists || !donor?.exists) return null;
        if (species.id === donor.id || species.battleOnly || donor.battleOnly) return null;

        return {species, donor};
    }

    // +floor(donor / 4) to every stat except HP.
    function franticFusionsBaseStats(dex, set, from) {
        const ff = resolveFusion(dex, set);
        if (!ff) return null;

        const stats = copy(from || ff.species.baseStats);
        for (const stat of BOOSTABLE_STATS) {
            stats[stat] = clamp255(stats[stat] + Math.floor(ff.donor.baseStats[stat] / 4));
        }
        return stats;
    }

    const isNfe = (species) => species.nfe ?? (species.evos?.length > 0);

    // {species, cross, crossPrevo} if set.name is a legal cross-evolution
    // target for set.species, else null.
    function resolveCrossEvolution(dex, set) {
        if (!dex || !set?.species || !set?.name) return null;

        const species = dex.species.get(set.species);
        const cross = dex.species.get(set.name);
        if (!species?.exists || !cross?.exists || species.id === cross.id) return null;

        if (species.battleOnly || !isNfe(species)) return null;
        if (cross.battleOnly || !cross.prevo) return null;

        const crossPrevo = dex.species.get(cross.prevo);
        if (!crossPrevo?.exists) return null;

        // Base and the target's prevo must be at the same evolution stage.
        if (!crossPrevo.prevo !== !species.prevo) return null;

        return {species, cross, crossPrevo};
    }

    function crossEvolutionBaseStats(dex, set, from) {
        const ce = resolveCrossEvolution(dex, set);
        if (!ce) return null;

        const start = from || ce.species.baseStats;
        const stats = {};
        for (const stat of STATS) {
            stats[stat] = clamp255(
                start[stat] + ce.cross.baseStats[stat] - ce.crossPrevo.baseStats[stat]
            );
        }
        return stats;
    }

    function crossEvolutionTypes(dex, set, from) {
        const ce = resolveCrossEvolution(dex, set);
        if (!ce) return null;

        const types = (from || ce.species.types).slice();
        if (ce.cross.types[0] !== ce.crossPrevo.types[0]) types[0] = ce.cross.types[0];
        if (ce.cross.types[1] !== ce.crossPrevo.types[1]) {
            types[1] = ce.cross.types[1] || ce.cross.types[0];
        }

        return types[0] === types[1] ? [types[0]] : types.filter(Boolean);
    }

    // A restricted Cross Evolution species is legal as an ordinary base, but
    // the server rejects it as the nicknamed donor (see config/formats.ts).
    // Explicitly banned species cannot be donors either.
    function crossEvolutionDonorAllowed(dex, donor, format = getActiveTeambuilderRoom()?.curTeam?.format || '', bansOverride = undefined) {
        if (!donor?.exists || donor.battleOnly || !donor.prevo || donor.gen > dex.gen) return false;
        const bans = bansOverride !== undefined ? bansOverride : (format ? getMergedBansForFormat(format) : null);
        if (bans && (isBannedByList(bans, donor) ||
            bans.restricted.has(donor.id) ||
            bans.restrictedBase.has(toID(donor.baseSpecies || donor.name)))) return false;
        // Match Cross Evolution's validator: outside NatDex, Past/Future
        // species cannot be nickname donors, nor unreleased evolutions.
        const rules = bans && resolveClauseRules(bans, format);
        const natdex = isNationalDexFormat(format) || !!rules?.has('natdexmod');
        if (donor.isNonstandard === 'Future' ||
            (donor.isNonstandard === 'Past' && !natdex) ||
            (donor.isNonstandard === 'CAP' && !rules?.has('+tag:cap'))) return false;
        if (donor.tier === 'Unreleased' && donor.isNonstandard === 'Unobtainable' &&
            !/(?:^|,)\s*\+\s*unobtainable\s*(?:,|$)/i.test(String(format).split('@@@').slice(1).join(','))) return false;
        return true;
    }

    // 1 = unevolved (Pikachu), 2 = evolved once (Clodsire),
    // 3 = evolved twice (Charizard). A missing/cyclic prevo is not an evo.
    function crossEvolutionStage(dex, species) {
        if (!species?.exists) return 0;
        let stage = 1;
        const seen = new Set([species.id]);
        let prev = species.prevo;
        while (prev && stage < 4) {
            const mon = dex.species.get(prev);
            if (!mon?.exists || seen.has(mon.id)) return 0;
            seen.add(mon.id);
            stage++;
            prev = mon.prevo;
        }
        return stage;
    }

    // Showdown /showevo semantics: display an evolution's *delta* from
    // its direct pre-evolution, not the evolved species' finished stats.
    function crossEvolutionDelta(dex, species) {
        const stage = crossEvolutionStage(dex, species);
        if ((stage !== 2 && stage !== 3) || species.battleOnly) return null;
        const prevo = dex.species.get(species.prevo);
        if (!prevo?.exists) return null;
        const stats = {};
        for (const stat of STATS) stats[stat] = species.baseStats[stat] - prevo.baseStats[stat];
        const types = [];
        if (species.types[0] !== prevo.types[0]) types[0] = species.types[0];
        if (species.types[1] !== prevo.types[1]) types[1] = species.types[1] || species.types[0];
        // Preserve which type *slot* changed. Gyarados gains Flying in slot
        // two, while Vaporeon changes the primary slot to Water.
        const changedTypes = [...new Set(types.filter(Boolean))];
        return {stage, stats, types: changedTypes, typeSlots: [types[0] || null, types[1] || null], bst: sumStats(stats)};
    }

    function isCrossEvolutionDonorFilter(engine) {
        return ['ce', 'stage2', 'stage3'].some((kind) => !!getIntoFilterId(engine, kind));
    }

    // Cross-evolved / fused view of `speciesLike` as if nicknamed after
    // `targetId`, or null if that isn't legal. Used by the "into" filters.
    function crossEvolveView(dex, speciesLike, targetId) {
        const target = dex?.species?.get(targetId);
        if (!speciesLike?.name || !target?.exists) return null;

        const set = {species: speciesLike.name, name: target.name};
        const mods = getActiveMods();
        const mod = mods.find(isFusionMod);

        // The rest of the stack is folded in too, so the row shows the whole team's rules.
        if (mod === MOD.INHERITANCE) {
            const inh = resolveFusion(dex, set);
            if (!inh) return null;
            return {
                baseStats: computeModsBaseStats(mods, {dex, set}) || copy(inh.species.baseStats),
                types: modifiedTypes(mods, dex, set) || inh.species.types.slice(),
                abilities: copy(inh.donor.abilities),
            };
        }

        if (mod === MOD.FRANTIC_FUSIONS) {
            const ff = resolveFusion(dex, set);
            if (!ff) return null;
            return {
                baseStats: computeModsBaseStats(mods, {dex, set}) || franticFusionsBaseStats(dex, set),
                types: modifiedTypes(mods, dex, set) || ff.species.types.slice(),
                abilities: null, // row keeps its own abilities
            };
        }

        const ce = resolveCrossEvolution(dex, set);
        if (!ce || !crossEvolutionDonorAllowed(dex, ce.cross)) return null;

        return {
            baseStats: computeModsBaseStats(mods, {dex, set}) || crossEvolutionBaseStats(dex, set),
            types: modifiedTypes(mods, dex, set) || crossEvolutionTypes(dex, set),
            abilities: copy(ce.cross.abilities),
        };
    }

    // ---------- "into X" / "X into" search queries ----------

    // "into <species>" -> target species (Cross Evolution / Frantic Fusions / Inheritance).
    function parseIntoQuery(engine, query) {
        const mods = modsForSearch(engine?.typedSearch);
        if (!mods.some(isFusionMod)) return null;

        const m = String(query || '').trim().match(/^into\s+(.+)$/i);
        if (!m) return null;

        const species = (engine.dex || engine.typedSearch?.dex)?.species?.get(m[1].trim());
        if (!species?.exists || species.battleOnly) return null;
        if (mods.includes(MOD.CROSS_EVOLUTION) && !species.prevo) return null;

        return species;
    }

    // "<species> into" -> base species.
    function parseFromQuery(engine, query) {
        const mods = modsForSearch(engine?.typedSearch);
        if (!mods.some(isFusionMod)) return null;

        const m = String(query || '').trim().match(/^(.+?)\s+Into$/i);
        if (!m) return null;

        const species = (engine.dex || engine.typedSearch?.dex)?.species?.get(m[1].trim());
        if (!species?.exists || species.battleOnly) return null;
        if (mods.includes(MOD.CROSS_EVOLUTION) && !isNfe(species)) return null;

        return species;
    }

    function getIntoFilterId(engine, kind = 'into') {
        const parent = getActiveTeambuilderRoom()?.search?.engine;
        // The actual filter() callback runs on BattlePokemonSearch, while
        // all chips live on DexSearch. Use the current invocation first,
        // and the owning parent only when the typed search is this object.
        const lists = [engine?.__qolActiveFilters, engine?.filters, engine?.typedSearch?.filters];
        if (parent && (parent === engine || parent.typedSearch === engine)) lists.push(parent.filters);
        for (const list of lists) {
            if (!Array.isArray(list)) continue;
            const f = list.find((entry) => entry[0] === kind);
            if (f) return f[1];
        }
        return null;
    }

    // When a Pokémon is picked while an into/from chip is active, work out
    // the species to actually add and the nickname (= donor) to give it.
    function resolveIntoSelection(room, val) {
        const engine = room.search?.engine;
        const dex = room.curTeam?.dex;
        if (!engine) return {val, nickname: null};

        if (isCrossEvolutionDonorFilter(engine) &&
            getActiveMods(room).includes(MOD.CROSS_EVOLUTION) && room.curSet?.species) {
            const candidate = dex?.species?.get(val);
            const source = dex?.species?.get(room.curSet.species);
            const pair = candidate?.exists && source?.exists
                ? resolveCrossEvolution(dex, {species: source.name, name: candidate.name}) : null;
            if (pair && crossEvolutionDonorAllowed(dex, candidate)) {
                return {val: source.name, nickname: candidate.name};
            }
            // A restricted or wrong-stage donor must never become a nickname.
            return {val: source?.name || val, nickname: null};
        }

        const intoId = getIntoFilterId(engine, 'into');
        if (intoId) {
            // "into X": the clicked mon is the base, X is the nickname.
            return {val, nickname: dex?.species?.get(intoId)?.name || null};
        }

        const fromId = getIntoFilterId(engine, 'from');
        if (fromId) {
            // "X into": X is the base, the clicked mon is the nickname.
            const base = dex?.species?.get(fromId);
            const clicked = dex?.species?.get(val);
            if (base?.exists && clicked?.exists) return {val: base.name, nickname: clicked.name};
        }

        return {val, nickname: null};
    }

    // ---------- CE Full List: one virtualized result per legal base + donor ----------
    // Row ids are NOT real species ids. Never pass them to Dex.species.get or
    // Showdown's native PokemonSearch; decode only in this opt-in search path.
    const CE_FULL_PREFIX = 'qolcefull:';
    const ceFullCaches = new WeakMap();
    const ceFullPairId = (base, donor) => CE_FULL_PREFIX + base + ':' + donor;
    function ceFullIds(id) {
        const m = typeof id === 'string' && id.match(/^qolcefull:([a-z0-9]+):([a-z0-9]+)$/);
        return m ? {base: m[1], donor: m[2]} : null;
    }
    function ceFullBanSignature(bans) {
        if (!bans) return 'pending';
        // Banlist contents may arrive asynchronously. Invalidate the pair index
        // when bans/restrictions/unbans change, not just when the format changes.
        return ['species', 'baseSpecies', 'restricted', 'restrictedBase', 'tiers',
            'unbanned', 'unbannedBase', 'moves', 'restrictedMoves', 'abilities', 'ruleset'].map((key) =>
            key + ':' + [...(bans[key] || [])].sort().join(',')).join('|');
    }
    function ceFullSpeciesAvailable(dex, sp, natdex, capAllowed) {
        return !!(sp?.exists && sp.id && sp.gen <= dex.gen && !sp.battleOnly &&
            sp.isNonstandard !== 'Future' && (capAllowed || sp.isNonstandard !== 'CAP') &&
            (natdex || sp.isNonstandard !== 'Past') &&
            !(sp.tier === 'Unreleased' && sp.isNonstandard === 'Unobtainable'));
    }
    function ceFullData(search) {
        const room = getActiveTeambuilderRoom();
        const dex = search.dex;
        const format = room?.curTeam?.format || search.format || '';
        const bans = getMergedBansForFormat(format);
        const rules = resolveClauseRules(bans || emptyBanSections(), format);
        const natdex = isNationalDexFormat(format) || rules.has('natdexmod');
        const mods = modsForSearch(search);
        const signature = format + '|' + ceFullBanSignature(bans) + '|' + mods.join(',') +
            '|' + (window.BattlePokedex ? Object.keys(window.BattlePokedex).length : 0);
        let entries = ceFullCaches.get(dex);
        if (!entries) { entries = new Map(); ceFullCaches.set(dex, entries); }
        let data = entries.get(signature);
        if (data) return data;
        // Keep only one format-index per Dex: avoid retaining giant cross-product
        // indices when the user switches formats repeatedly.
        entries.clear();
        data = {dex, format, bans, mods, pairs: [], bannedPairs: [], byId: new Map(), nativeMoves: new Map(), signature};
        const all = [];
        const seen = new Set();
        for (const id of Object.keys(window.BattlePokedex || {})) {
            const sp = dex.species.get(id);
            if (!sp?.exists || sp.id !== id || seen.has(sp.id) ||
                !ceFullSpeciesAvailable(dex, sp, natdex, rules.has('+tag:cap'))) continue;
            seen.add(sp.id);
            all.push(sp);
        }
        // Include explicitly banned bases and banned/restricted donors in the
        // index too. They must render BELOW legal pairs, not disappear from
        // Full List. Evolution-stage and generation compatibility still apply.
        const bases = all.filter((sp) => isNfe(sp) && crossEvolutionStage(dex, sp) <= 2);
        const donors = all.filter((sp) => !!sp.prevo)
            .map((sp) => ({sp, prevo: dex.species.get(sp.prevo), stage: crossEvolutionStage(dex, sp)}))
            .filter(({prevo, stage}) => prevo?.exists && (stage === 2 || stage === 3));
        // Evaluate species legality ONCE per candidate, not per combination.
        // This matters when the cross-product contains >100,000 pairs.
        const bannedBases = new Set(bases.filter((sp) => bans && isBannedByList(bans, sp)).map((sp) => sp.id));
        const bannedDonors = new Set(donors.filter(({sp}) =>
            !crossEvolutionDonorAllowed(dex, sp, format, bans)).map(({sp}) => sp.id));
        // Pre-compute only the cheap numeric properties. No copies of either
        // learnset are stored in the pair; movepools are looked up once/species.
        for (const base of bases) {
            const baseStage = crossEvolutionStage(dex, base);
            for (const {sp: donor, prevo, stage} of donors) {
                if (baseStage + 1 !== stage || base.id === donor.id) continue;
                const stats = {};
                for (const stat of STATS) stats[stat] = clamp255(
                    base.baseStats[stat] + donor.baseStats[stat] - prevo.baseStats[stat]);
                const types = base.types.slice();
                if (donor.types[0] !== prevo.types[0]) types[0] = donor.types[0];
                if (donor.types[1] !== prevo.types[1]) types[1] = donor.types[1] || donor.types[0];
                const finalTypes = types[0] === types[1] ? [types[0]] : types.filter(Boolean);
                const bannedBase = bannedBases.has(base.id);
                const bannedDonor = bannedDonors.has(donor.id);
                const pair = {id: ceFullPairId(base.id, donor.id), base, donor, stage,
                    baseStats: stats, types: finalTypes, abilities: donor.abilities,
                    bst: sumStats(stats), view: null, banned: bannedBase || bannedDonor};
                (pair.banned ? data.bannedPairs : data.pairs).push(pair);
                data.byId.set(pair.id, pair);
            }
        }
        entries.set(signature, data);
        return data;
    }
    function ceFullPairView(pair, data) {
        // The simple CE delta is already cached. Extra stat/type modifying OM
        // rules still use the existing stack so the preview remains accurate.
        if (data.mods.every((mod) => mod === MOD.CROSS_EVOLUTION)) return pair;
        if (!pair.view) {
            const view = crossEvolveView(data.dex, pair.base, pair.donor.id);
            pair.view = view || {baseStats: pair.baseStats, types: pair.types, abilities: pair.abilities};
        }
        return pair.view;
    }
    function ceFullNativeMoves(data, species) {
        if (data.nativeMoves.has(species.id)) return data.nativeMoves.get(species.id);
        const Search = window.BattleMoveSearch;
        const moves = new Set();
        if (Search?.prototype?.getBaseResults) {
            const formatKey = resolveFormatKey(String(data.format).split('@@@')[0]) ||
                String(data.format).split('@@@')[0].trim();
            const probe = new Search('move', formatKey, {
                species: species.name, name: '', item: '', ability: '', moves: []});
            probe.dex = data.dex;
            probe.species = species.id;
            let native = Search.prototype.getBaseResults;
            while (native.__original) native = native.__original;
            for (const row of native.call(probe)) if (row[0] === 'move') moves.add(row[1]);
        }
        data.nativeMoves.set(species.id, moves);
        return moves;
    }
    function ceFullHasMove(data, pair, moveId) {
        const id = toID(moveId);
        const move = data.dex.moves.get(id);
        if (!moveAllowedByGeneration(data.dex, move, data.format) || data.bans?.moves?.has(id)) return false;
        return ceFullNativeMoves(data, pair.base).has(id) || ceFullNativeMoves(data, pair.donor).has(id);
    }
    function ceFullMatches(data, pair, filters) {
        // Avoid eagerly evaluating expensive stacked-OM views for every pair.
        // Most Full List searches have no filters, or only base/donor/stage filters.
        let view;
        const getView = () => (view ||= ceFullPairView(pair, data));
        for (const [rawType, target] of filters || []) {
            const negated = isNegatedFilterType(rawType);
            const type = baseFilterType(rawType);
            let match = true;
            switch (type) {
                case 'fulllist': case 'realbulk': case 'ce': break;
                case 'stage1': case 'stage2': case 'stage3':
                    match = pair.stage === Number(type.slice(-1)); break;
                case 'into': match = pair.donor.id === toID(target); break;
                case 'from': match = pair.base.id === toID(target); break;
                case 'move': match = ceFullHasMove(data, pair, target); break;
                case 'ability':
                    match = !data.bans?.abilities?.has(toID(target)) &&
                        Object.values(getView().abilities || {}).some((a) => toID(a) === toID(target)); break;
                case 'type': match = getView().types.includes(target); break;
                case 'weak': case 'resists': case 'neutral':
                    match = pokemonMatchesEffectiveness(data.dex, {types:getView().types}, type, target); break;
                case 'egggroup': match = (pair.donor.eggGroups || []).includes(target); break;
                case 'tier': match = pair.base.tier === target; break;
                case 'color': match = isMonoColorSearch(getEngine()) && pokemonColorName(pair.base.color) === pokemonColorName(target); break;
                case 'natdex': case 'hackmons':
                    match = pokemonFormatPool({dex:data.dex,format:data.format}, type).ids.has(pair.base.id); break;
                case 'fe': match = true; break; // Cross Evolution cannot evolve again
                case 'restricted': match = false; break; // restricted donors are excluded
                case 'legendary': case 'boxlegend': case 'mythical': case 'paradox': case 'eeveelution':
                    match = speciesInGroup(pair.base, type) || speciesInGroup(pair.donor, type); break;
                case 'recovery': case 'pivot': case 'removal': case 'hazards': case 'priority': case 'selfko': {
                    const ids = getCustomToggleMoveIds(data.dex, type);
                    match = ids.some((moveId) => ceFullHasMove(data, pair, moveId));
                    break;
                }
                default: break;
            }
            if (negated ? match : !match) return false;
        }
        return true;
    }
    function ceFullResults(search, filters, sortCol, reverseSort, query = '') {
        const data = ceFullData(search);
        search.__qolCeFullData = data;
        const q = toSearchId(query);
        const eligible = (pair) => ceFullMatches(data, pair, filters) && (!q ||
            toSearchId(pair.base.name + pair.donor.name).includes(q) ||
            toSearchId(pair.base.name).includes(q) || toSearchId(pair.donor.name).includes(q));
        let matches = data.pairs.filter(eligible);
        let bannedMatches = data.bannedPairs.filter(eligible);
        if (sortCol) {
            const order = reverseSort ? -1 : 1;
            const value = (pair) => {
                const stats = ceFullPairView(pair, data).baseStats;
                if (sortCol === 'bst') return sumStats(stats);
                if (sortCol === 'def' || sortCol === 'spd') {
                    if ((filters || []).some(([t]) => t === 'realbulk')) return realBulk(stats, sortCol);
                }
                return stats[sortCol] || 0;
            };
            const sortPairs = (list) => {
                if (sortCol === 'name') list.sort((a,b) =>
                    (a.base.name + a.donor.name).localeCompare(b.base.name + b.donor.name) * order);
                else if (STATS.includes(sortCol) || sortCol === 'bst') list.sort((a,b) =>
                    (value(b) - value(a)) * order || a.id.localeCompare(b.id));
            };
            sortPairs(matches);
            sortPairs(bannedMatches);
        }
        // Clear stale labels on each update; rows can move between sections
        // when custom bans or the live format banlist changes.
        search.illegalReasons = {};
        for (const pair of bannedMatches) search.illegalReasons[pair.id] = 'Banned';
        return [['sortpokemon', ''],
            ...(matches.length ? [['header', `Cross Evolutions (${matches.length.toLocaleString()})`],
                ...matches.map((pair) => ['pokemon', pair.id])] : []),
            ...(bannedMatches.length ? [['header', `Banned Cross Evolutions (${bannedMatches.length.toLocaleString()})`],
                ...bannedMatches.map((pair) => ['pokemon', pair.id])] : []),
        ];
    }
    function ceFullFindPair(search, id) {
        if (!ceFullIds(id) || !search?.dex) return null;
        return ceFullData(search).byId.get(id) || null;
    }

    // ---------- live refresh when the nickname changes ----------

    // Each teambuilder room has its own scheduled render. Tracking the set identity
    // (rather than only the text) is important: two different Pokémon can both
    // be nicknamed Charizard and must each get a fresh preview.
    const fusionRefreshPending = new WeakMap();
    const fusionLastRendered = new WeakMap();

    // The old client saves nicknames on `change` (blur), not `input`. For
    // nickname-driven OMs, update the in-memory set on each keystroke so ALL
    // stat, type, and provider calculations see the same species/donor. Native
    // `nicknameChange` still handles persistence on blur; this does not save
    // or rebuild the editor (which would destroy the focused input).
    function refreshFusionSet(room, nicknameOverride = null) {
        const set = room?.curSet;
        const dex = room?.curTeam?.dex;
        if (!set?.species || !dex || !getActiveMods(room).some(isFusionMod)) return;

        const name = nicknameOverride === null ? String(set.name || '').trim()
            : String(nicknameOverride).trim().replace(/\|/g, '');
        set.name = name;

        refreshTypeIcons(room);

        // Showdown's updateStatForm REPLACES the whole current chooser with
        // a stats form. Only call it if that chooser is actually on the Stats
        // tab; updateStatGraph alone updates the visible stat badge elsewhere.
        // Avoid a full room.update(): that replaces the nickname input, too.
        try {
            if (room.curChartType === 'stats') room.updateStatForm?.();
            room.updateStatGraph?.();
        } catch (err) {
            console.warn(LOG, 'Live fusion stat refresh failed:', err);
        }

        // Move/ability legality can change with the fusion donor. Invalidate
        // all three search instances, including the active typed search, and
        // force a fresh query without resetting its text or stealing focus.
        const engine = room.search?.engine;
        if (!engine) return;
        for (const search of new Set([engine.typedSearch, engine.moveSearch, engine.abilitySearch])) {
            if (!search) continue;
            search.__qolFusionKey = null;
            clearSearchCache(search);
        }
        engine.results = null;
        if (room.curChartType === 'move' || room.curChartType === 'abilities' || room.curChartType === 'ability') {
            try {
                const current = room.$?.('input[name=' + room.curChartName + ']')?.val?.();
                room.search.find?.(current === undefined ? '' : current);
            } catch (err) {
                console.warn(LOG, 'Live fusion search refresh failed:', err);
            }
            refreshSearchUi(room);
        }
    }

    function scheduleFusionRefresh(room, nickname = null) {
        const set = room?.curSet;
        if (!set || !getActiveMods(room).some(isFusionMod)) return;
        const name = nickname === null ? String(set.name || '').trim()
            : String(nickname).trim().replace(/\|/g, '');
        const format = room.curTeam?.format;
        const previous = fusionRefreshPending.get(room);
        if (previous) cancelAnimationFrame(previous.frame);

        const pending = {set, name, format, frame: null};
        pending.frame = requestAnimationFrame(() => {
            if (fusionRefreshPending.get(room) !== pending) return;
            fusionRefreshPending.delete(room);
            if (getActiveTeambuilderRoom() !== room || room.curSet !== set ||
                room.curTeam?.format !== format || !getActiveMods(room).some(isFusionMod)) return;

            const last = fusionLastRendered.get(room);
            if (last?.set === set && last.name === name && last.format === format &&
                last.species === set.species) return;

            refreshFusionSet(room, name);
            fusionLastRendered.set(room, {set, name, format, species: set.species});
        });
        fusionRefreshPending.set(room, pending);
    }

    let mnmSpeedListenerInstalled = false;
    function installMnmSpeedNoteListener() {
        if (mnmSpeedListenerInstalled) return;
        mnmSpeedListenerInstalled = true;

        let timer = null;
        const handler = (e) => {
            if (!e.target?.closest?.('.statform')) return;
            const room = getActiveTeambuilderRoom();
            if (!room || !getActiveMods(room).includes(MOD.MIX_AND_MEGA)) return;

            // setTimeout so the slider/number has already taken its new value
            clearTimeout(timer);
            timer = setTimeout(() => updateMixAndMegaSpeedNote(room), 0);
        };

        for (const type of ['input', 'change', 'keyup', 'wheel']) {
            document.addEventListener(type, handler, true);
        }
    }

    let fusionListenerInstalled = false;
    function installFusionNicknameListener() {
        if (fusionListenerInstalled) return;
        fusionListenerInstalled = true;

        const handler = (e) => {
            const input = e.target;
            if (!(input instanceof HTMLInputElement) || input.name !== 'nickname') return;

            const room = getActiveTeambuilderRoom();
            if (!room?.curSet || !getActiveMods(room).some(isFusionMod)) return;
            // Only handle the nickname editor in the current teambuilder,
            // not a similarly named field in a popup or another room.
            if (room.el?.contains && !room.el.contains(input)) return;

            const name = String(input.value || '').trim().replace(/\|/g, '');
            // Keep all synchronous consumers of curSet (including native
            // search handlers) consistent while the user types. The old
            // client will save the set via nicknameChange on blur.
            room.curSet.name = name;
            scheduleFusionRefresh(room, name);
        };

        document.addEventListener('input', handler, true);
        document.addEventListener('change', handler, true);
    }

    // ====================================================================
    // 10. CONVERGENCE
    // ====================================================================

    const CONVERGENCE_FORMAT_ID = 'convergence';

    // Donor icons from every active provider share one map (reset when the chain starts).
    function addDonors(search, donors) {
        if (!search.__qolConvDonors) search.__qolConvDonors = {};
        Object.assign(search.__qolConvDonors, donors);
    }
    const CONVERGENCE_TYPE_ORDER_MATTERS = false;
    const CONVERGENCE_EXCLUDED_DONORS = new Set();

    const convergenceIndexCache = new Map();
    const convergenceMoveCache = new Map();

    function convergenceTypeKey(species) {
        const types = species.types.slice();
        if (!CONVERGENCE_TYPE_ORDER_MATTERS) types.sort();
        return types.join('/');
    }

    // Do not cache Convergence donors globally by generation: the mega-enabled
    // challenge code, the future named format, and ordinary Convergence each have
    // different legal pools. Parse local explicit unbans immediately, even while
    // the /formathelp reply is in flight.
    function getConvergenceGroup(dex, species, format) {
        const megamons = isConvergenceMegamons(format);
        // Showdown's Convergence Legality uses RuleTable.isBannedSpecies for
        // EACH donor, not merely the recipient. This includes Smeargle, whose
        // Sketch-derived move search may otherwise expose essentially every
        // move to Normal-types such as Arceus.
        //
        // Do not build/copy a donor pool from a placeholder inferred banlist:
        // the named format's banlist may still be arriving via /formathelp.
        // Fail closed until we have authoritative bans, while allowing the
        // recipient's own native learnset to appear normally.
        if (megamons) {
            const baseId = genericBanFormatId(format);
            const entry = baseId ? requestGenericBanlist(baseId) : null;
            if (!entry?.verified) return [];
        } else {
            if (!convergenceBans) {
                requestBanlist('conv');
                return [];
            }
        }
        const explicitlyAllowed = megamons ? explicitlyUnbannedForms(format) : new Set();
        // Showdown's convergencelegality also requires donors to be standard,
        // unless +tag:<nonstandard category> explicitly permits that category.
        // +Pokemon-Mega makes a forme selectable; it does NOT, by itself,
        // enable Future/Past donors to transfer moves or abilities.
        const allowedDonorTags = new Set(formatRuleTokens(format)
            .filter((op) => op.kind === 'unban' && /^tag\s*:/i.test(op.name || ''))
            .map((op) => toID(String(op.name).split(':').slice(1).join(':'))));
        const bans = megamons ? getMergedBansForFormat(format) : convergenceBans;
        const bannedIds = bans?.species || new Set();
        const bannedBases = bans?.baseSpecies || new Set();
        const cacheKey = `${dex.gen}|${String(format || 'gen9convergence')}|${megamons ? 'mega' : 'normal'}|${BL.conv.loaded}`;
        let index = convergenceIndexCache.get(cacheKey);
        if (!index) {
            index = new Map();
            for (const id of Object.keys(window.BattlePokedex || {})) {
                const sp = dex.species.get(id);
                if (!sp?.exists || sp.id !== id) continue;
                const allowedByRule = explicitlyAllowed.has(sp.id) ||
                    !!bans?.unbanned?.has(sp.id) ||
                    !!bans?.unbannedBase?.has(toID(sp.baseSpecies || sp.name));
                // The rules explicitly introduce some newer Mega formes into
                // a Gen 9 battle. Their Pokédex generation is not an implicit
                // ban once the challenge code explicitly unbans that forme.
                if (sp.gen > dex.gen && !allowedByRule) continue;
                // Match the simulator's Convergence donor gate: a specific
                // +Mega unban does not bypass its isNonstandard tag check.
                // Conversely, a genuinely standard/unbanned Mega can donate.
                if (sp.isNonstandard && !allowedDonorTags.has(toID(sp.isNonstandard))) continue;
                if (!megamons && sp.battleOnly) continue;
                if (CONVERGENCE_EXCLUDED_DONORS.has(sp.id)) continue;
                // Explicit bans always take priority over the special form rule.
                if (bannedIds.has(sp.id) || bannedBases.has(toID(sp.baseSpecies || sp.name))) {
                    if (!allowedByRule) continue;
                }
                if (bans && isBannedByList(bans, sp)) continue;
                const key = convergenceTypeKey(sp);
                if (!index.has(key)) index.set(key, []);
                index.get(key).push(sp);
            }
            for (const list of index.values()) list.sort((a, b) => a.name.localeCompare(b.name));
            convergenceIndexCache.set(cacheKey, index);
        }
        return index.get(convergenceTypeKey(species)) || [];
    }

    // moveId -> {donorId, header} across the whole typing group.
    function getConvergenceMoveMap(search, base, species) {
        // The inner providers shape each member's moves, so the stack is part of the key.
        const activeFormat = getActiveTeambuilderRoom()?.curTeam?.format || search.format;
        const key = `${search.dex.gen}|${activeFormat}|${convergenceTypeKey(species)}|${search.__qolStackKey}|${search.__qolNatdexMoves ? 1 : 0}`;
        let map = convergenceMoveCache.get(key);
        if (map) return map;

        map = new Map();

        for (const member of getConvergenceGroup(search.dex, species, activeFormat)) {
            const rows = withSearchSpecies(search, member.name, base);
            let header = null;

            for (const row of rows) {
                if (row[0] === 'header') { header = row; continue; }
                if (row[0] !== 'move' || map.has(row[1])) continue;
                map.set(row[1], {donorId: member.id, header});
            }
        }

        convergenceMoveCache.set(key, map);
        return map;
    }

    function convergenceMoveResults(search, base) {
        let results = base();
        if (!search.species) return results;

        // Do not gate the entire Convergence provider on /tier. Some Showdown
        // servers or clients never return a parseable response to the silent
        // request. Build donors immediately, then refresh with legality when
        // the banlist arrives.
        if (!BL.conv.loaded && !isConvergenceMegamons(getActiveTeambuilderRoom()?.curTeam?.format || search.format)) {
            requestBanlist('conv');
        }

        const species = search.dex.species.get(search.species);
        if (!species?.exists) return results;

        const activeFormat = getActiveTeambuilderRoom()?.curTeam?.format || search.format;
        if (isConvergenceMegamons(activeFormat) &&
            (species.isMega || /-mega(?:-[a-z0-9]+)?$/i.test(species.name))) {
            // A Mega with a base species available in SV keeps that base
            // species' natural learnset (Sceptile-Mega can use Shed Tail).
            // A Mega with a dexited base species only receives donor moves.
            const baseSpecies = search.dex.species.get(species.baseSpecies);
            if (baseSpecies?.exists && !baseSpecies.isNonstandard) {
                const baseRows = withSearchSpecies(search, baseSpecies.name, base);
                results = baseRows;
            } else {
                // A Mega's native historical learnset is not automatically legal.
                results = results.filter(row => row[0] !== 'move');
            }
        }

        const map = getConvergenceMoveMap(search, base, species);
        const have = new Set(results.filter((r) => r[0] === 'move').map((r) => r[1]));
        const donors = {};
        const extra = [];
        let lastHeader = null;

        for (const [moveId, info] of map) {
            if (have.has(moveId)) continue;

            if (info.header !== lastHeader) {
                extra.push(info.header);
                lastHeader = info.header;
            }
            extra.push(['move', moveId]);
            donors[moveId] = info.donorId;
        }

        addDonors(search, donors);
        return extra.length ? mergeMoveResults(results, extra) : results;
    }

    // Everything (incl. hidden/special) goes under one "Abilities" header.
    function convergenceAbilityResults(search, base) {
        const results = base();
        if (!search.species) return results;

        // Do not gate the entire Convergence provider on /tier. Some Showdown
        // servers or clients never return a parseable response to the silent
        // request. Build donors immediately, then refresh with legality when
        // the banlist arrives.
        if (!BL.conv.loaded && !isConvergenceMegamons(getActiveTeambuilderRoom()?.curTeam?.format || search.format)) {
            requestBanlist('conv');
        }

        const species = search.dex.species.get(search.species);
        if (!species?.exists) return results;

        const activeFormat = getActiveTeambuilderRoom()?.curTeam?.format || search.format;
        const megaRecipient = isConvergenceMegamons(activeFormat) &&
            (species.isMega || /-mega(?:-[a-z0-9]+)?$/i.test(species.name));
        const notes = results.filter((r) => r[0] === 'html');
        // Mega formes cannot retain their own abilities. They can only select
        // an ability supplied by a non-Mega donor of the same current typing.
        const own = megaRecipient ? [] : results.filter((r) => r[0] === 'ability');
        // Custom-format searches can start with no native abilities. Convergence
        // must still contribute the shared-typing ability pool.
        const seen = new Set(own.map((r) => r[1]));
        const donors = {};
        const extra = [];

        for (const member of getConvergenceGroup(search.dex, species, getActiveTeambuilderRoom()?.curTeam?.format || search.format)) {
            if (member.id === species.id) continue;

            for (const name of Object.values(member.abilities)) {
                const id = toID(name);
                if (!id || seen.has(id)) continue;

                seen.add(id);
                donors[id] = member.id;
                extra.push(['ability', id]);
            }
        }

        extra.sort((a, b) => a[1].localeCompare(b[1]));
        addDonors(search, donors);

        return megaRecipient
            ? [...notes, ['header', 'Converged Abilities'], ...extra]
            : (extra.length ? [...notes, ['header', 'Converged Abilities'], ...own, ...extra] : results);
    }

    // ====================================================================
    // 11. ALPHABET CUP / NATIONAL DEX MOVEPOOL
    // ====================================================================

    // ---------- Alphabet Cup ----------

    const ALPHABET_CUP_FORMAT_ID = 'alphabetcup';
    // The same Dex is shared between normal and custom-rule/National Dex formats.
    // NEVER cache the move pool solely by Dex: whether "Past" moves exist is
    // determined by the active RuleTable (not by an object's .exists field).
    const alphabetCupCache = new WeakMap();
    const moveProviderFormat = (search) =>
        getActiveTeambuilderRoom()?.curTeam?.format || search?.format || '';

    // Mirror the Showdown validator's generation/existence gate *before*
    // applying an OM movepool rule. Alphabet Cup and STABmons both check
    // move.isNonstandard === 'Past' && !ruleTable.has('natdexmod'), plus
    // isZ/isMax/restricted. See data/rulesets.ts in smogon/pokemon-showdown.
    // Explicit custom unbans can override a move/tag, but a move introduced in
    // a future generation can't be simulated in an older Dex.
    const moveFormatRuleCache = new Map();
    function moveFormatRules(format) {
        const key = String(format || '');
        const existing = moveFormatRuleCache.get(key);
        if (existing) return existing;
        const tokens = formatRuleTokens(key);
        const unbans = new Set(tokens.filter((op) => op.kind === 'unban').map((op) => op.id));
        const result = {natdex: isNationalDexFormat(key), lgpe: /^gen7letsgo/.test(fmtId(key.split('@@@')[0])), unbans};
        // Imported codes can be very long, but only a few are edited at once.
        if (moveFormatRuleCache.size >= 40) moveFormatRuleCache.delete(moveFormatRuleCache.keys().next().value);
        moveFormatRuleCache.set(key, result);
        return result;
    }
    function moveAllowedByGeneration(dex, move, format = '') {
        if (!move?.exists || !move.id || move.isZ || move.isMax) return false;
        if (Number.isFinite(move.gen) && move.gen > dex.gen) return false;
        const tag = move.isNonstandard;
        if (!tag || tag === 'Unobtainable') return true; // OM Unobtainable Moves may allow the latter.
        const {natdex, lgpe, unbans} = moveFormatRules(format);
        const explicit = unbans.has(move.id) || unbans.has('move' + move.id) ||
            unbans.has(toSearchId(tag)) || unbans.has('tag' + toSearchId(tag));
        if (tag === 'Past') return natdex || explicit;
        if (tag === 'LGPE') return lgpe || explicit;
        if (tag === 'Future') return explicit;
        // CAP/Let's Go/Legends/Gmax/etc. are not ordinary game moves.
        return explicit;
    }

    // Reuse the eligibility pool across Alphabet Cup, !Obtainable Moves,
    // Sketchmons, and Typemons, while keeping their independent legality rules.
    function getAlphabetCupCache(dex, format = '') {
        let caches = alphabetCupCache.get(dex);
        if (!caches) { caches = new Map(); alphabetCupCache.set(dex, caches); }
        const key = String(format || '');
        let cache = caches.get(key);
        if (cache) return cache;
        cache = {byLetter: new Map(), ids: new Set(), letters: new Map()};
        for (const id of Object.keys(window.BattleMovedex || {})) {
            const move = dex.moves.get(id);
            if (move?.id !== id || !moveAllowedByGeneration(dex, move, format)) continue;
            const letter = move.id.charAt(0);
            if (!/[a-z]/.test(letter)) continue;
            cache.ids.add(id);
            if (!cache.byLetter.has(letter)) cache.byLetter.set(letter, []);
            cache.byLetter.get(letter).push(id);
        }
        caches.set(key, cache);
        return cache;
    }

    // First letter of the species' name and of every pre-evolution's name.
    function alphabetCupLetters(dex, species, format = '') {
        const cache = getAlphabetCupCache(dex, format);
        let letters = cache.letters.get(species.id);
        if (letters) return letters;

        letters = new Set();
        const seen = new Set();
        let cur = species;

        while (cur?.exists && !seen.has(cur.id)) {
            seen.add(cur.id);
            const ch = cur.id.charAt(0);
            if (/[a-z]/.test(ch)) letters.add(ch);
            // Silvally forms have Type: Null as an evolutionary predecessor in
            // the simulator's Alphabet Cup legality rule.
            const prevo = cur.changesFrom === 'Silvally' ? 'Type: Null' : cur.prevo;
            cur = prevo ? dex.species.get(prevo) : null;
        }

        cache.letters.set(species.id, letters);
        return letters;
    }

    function alphabetCupMoveIds(dex, species, format = '') {
        const cache = getAlphabetCupCache(dex, format);
        const ids = [];
        for (const letter of alphabetCupLetters(dex, species, format)) {
            ids.push(...(cache.byLetter.get(letter) || []));
        }
        return ids;
    }

    function alphabetCupCanLearn(dex, species, moveId, format = '') {
        const move = dex.moves.get(moveId);
        if (!moveAllowedByGeneration(dex, move, format) || !getAlphabetCupCache(dex, format).ids.has(move.id)) return false;
        return alphabetCupLetters(dex, species, format).has(move.id.charAt(0));
    }

    // Native learnset check OR Alphabet Cup letter rule (used by Pokémon search filters).
    function pokemonMatchesMove(ctx, original, row, species, moveId) {
        return pokemonMatchesProvider(ctx, original, row, species, 'move', moveId);
    }

    // Use the same effective pools for Pokémon filters and the set editor.
    // Keep native canLearn untouched: providers need it to identify genuine gains.
    function pokemonMatchesProvider(ctx, original, row, species, kind, target) {
        const providers = kind === 'move' ? MOVE_PROVIDERS : ABILITY_PROVIDERS;
        const mods = modsForSearch(ctx);
        if (!mods.some((mod) => providers[mod])) {
            return original.call(ctx, row, [[kind, target]]);
        }
        const format = getActiveTeambuilderRoom()?.curTeam?.format || ctx.format;
        const id = toID(target);
        // Simple gains are membership queries, not requests to render every move
        // or ability for every Pokémon in the dex.
        const simpleMoves = [MOD.STABMONS, MOD.ALPHABET_CUP, MOD.ALL_MOVES, MOD.TYPEMONS];
        const simpleAbilities = [MOD.ALMOST_ANY_ABILITY, MOD.MIX_AND_MEGA];
        if (mods.every((mod) => !providers[mod] || (kind === 'move' ? simpleMoves : simpleAbilities).includes(mod))) {
            const bans = ctx.__qolProviderBans === undefined ? getMergedBansForFormat(format) : ctx.__qolProviderBans;
            const native = original.call(ctx, row, [[kind, target]]);
            if (kind === 'ability') {
                const nativeIds = Object.values(species.abilities || {}).map(toID);
                if (abilityBanned(bans, id, nativeIds, isPokebilitiesFormat(format))) return false;
                if (bans?.restrictedAbilities?.has(id) && !nativeIds.includes(id)) return false;
                return native || (mods.includes(MOD.ALMOST_ANY_ABILITY) && allAbilityIds(ctx.dex).includes(id));
            }
            if (bans?.moves?.has(id)) return false;
            if (!moveAllowedByGeneration(ctx.dex, ctx.dex.moves.get(id), format)) return false;
            if (native) return true;
            if (bans?.restrictedMoves?.has(id)) return false;
            if (mods.includes(MOD.STABMONS) && stabmonsCanLearn(ctx.dex, species, id, isNationalDexFormat(format), format)) return true;
            if (mods.includes(MOD.ALPHABET_CUP) && alphabetCupCanLearn(ctx.dex, species, id, format)) return true;
            return getAlphabetCupCache(ctx.dex, format).ids.has(id) &&
                (mods.includes(MOD.ALL_MOVES) || (mods.includes(MOD.TYPEMONS) && ctx.__qolTypemons === ctx.dex.moves.get(id).type));
        }
        const Search = kind === 'move' ? window.BattleMoveSearch : window.BattleAbilitySearch;
        const into = getIntoFilterId(ctx, 'into');
        const from = getIntoFilterId(ctx, 'from');
        const donorDisplay = isCrossEvolutionDonorFilter(ctx) && mods.includes(MOD.CROSS_EVOLUTION);
        // A CE donor-browser chip must not suppress Into/From's shared moves.
        if (donorDisplay && !into && !from) return original.call(ctx, row, [[kind, target]]);
        const cache = ctx.__qolProviderPools || (ctx.__qolProviderPools = new Map());

        // Cross Evolution's validator (config/formats.ts) checks whether the
        // move is learned by EITHER the base species OR the named evolution.
        // Never infer this from the currently edited set's nickname, or from
        // a provider-expanded set search: both are mutable and can be stale.
        // Query each unmodified *native* learnset in the selected generation.
        if (kind === 'move' && mods.includes(MOD.CROSS_EVOLUTION) && (into || from)) {
            const baseSpecies = from ? ctx.dex.species.get(from) : species;
            const donorSpecies = into ? ctx.dex.species.get(into) : species;
            if (!baseSpecies?.exists || !donorSpecies?.exists ||
                !crossEvolveView(ctx.dex, baseSpecies, donorSpecies.id)) return false;
            const move = ctx.dex.moves.get(id);
            if (!moveAllowedByGeneration(ctx.dex, move, format)) return false;
            const bans = ctx.__qolProviderBans === undefined ? getMergedBansForFormat(format) : ctx.__qolProviderBans;
            if (bans?.moves?.has(id)) return false;

            const formatKey = resolveFormatKey(String(format).split('@@@')[0]) ||
                String(format).split('@@@')[0].trim();
            const lookup = (mon) => {
                const key = ['ce-native', 'move', mon.id, formatKey].join(':');
                if (cache.has(key)) return cache.get(key);
                const probe = new Search('move', formatKey, {species: mon.name, name: '', item: '', ability: '', moves: []});
                probe.dex = ctx.dex;
                probe.species = mon.id;
                // Directly use Showdown's original search function. The
                // providers (which can depend on the edited set) are NOT
                // supposed to influence whether the donor learns a move.
                let native = Search.prototype.getBaseResults;
                while (native.__original) native = native.__original;
                const moves = new Set(native.call(probe)
                    .filter((r) => r[0] === 'move').map((r) => r[1]));
                cache.set(key, moves);
                return moves;
            };
            // A restricted move can be learned natively by a base/donor;
            // restriction means it cannot be gained just through an OM.
            return lookup(baseSpecies).has(id) || lookup(donorSpecies).has(id);
        }
        const cacheKey = [kind, species.id, into || '', from || '', format].join(':');
        if (cache.has(cacheKey)) return cache.get(cacheKey).has(toID(target));
        const room = getActiveTeambuilderRoom();
        let set = room?.curSet?.species && toID(room.curSet.species) === species.id
            ? {...room.curSet} : {species: species.name, name: '', item: '', ability: '', nature: '', moves: []};
        // A filtered cross-evolution must be checked as the *pair* shown
        // to the user, not against a stale nickname on the edited set.
        if (mods.includes(MOD.CROSS_EVOLUTION) && into) {
            const donor = ctx.dex.species.get(into);
            set = {...set, species: species.name, name: donor.name};
        } else if (mods.includes(MOD.CROSS_EVOLUTION) && from) {
            const baseSpecies = ctx.dex.species.get(from);
            set = {...set, species: baseSpecies.name, name: species.name};
        }
        const probe = new Search(kind, resolveFormatKey(String(format).split('@@@')[0]) || String(format).split('@@@')[0].trim(), set);
        probe.__qolProviderMods = mods;
        probe.dex = ctx.dex;
        const rows = probe.getBaseResults();
        const ids = new Set(rows.filter((r) => r[0] === kind &&
            !(probe.__qolGroups || []).some((group) => group.kind === kind && group.test(r[1])))
            .map((r) => r[1]));
        cache.set(cacheKey, ids);
        return ids.has(toID(target)) && (kind !== 'move' ||
            moveAllowedByGeneration(ctx.dex, ctx.dex.moves.get(id), format));
    }

    const stabmonsTypeCache = new WeakMap();
    function stabmonsCanLearn(dex, species, id, natdex, format = '') {
        const move = dex.moves.get(id);
        if (!species?.exists || !species.name || !moveAllowedByGeneration(dex, move, format)) return false;
        let cache = stabmonsTypeCache.get(dex);
        if (!cache) stabmonsTypeCache.set(dex, cache = new Map());
        const key = `${species.id}|${natdex}|${move.gen}`;
        let types = cache.get(key);
        if (!types) {
            types = new Set();
            const minGen = dex.gen === 9 && !natdex ? 9 : species.gen;
            for (let gen = dex.gen; gen >= minGen && gen >= move.gen; gen--) {
                const genDex = Dex.forGen(gen);
                const mon = genDex.species.get(species.name);
                if (!mon?.exists || !mon.name) continue;
                const original = genDex.species.get(mon.changesFrom || mon.name);
                for (const type of original.types || []) types.add(type);
                const baseSpecies = genDex.species.get(mon.baseSpecies || mon.name);
                for (const name of baseSpecies.otherFormes || []) {
                    if (baseSpecies.prevo && genDex.species.get(baseSpecies.prevo).evos?.includes(name)) continue;
                    const forme = genDex.species.get(name);
                    if (forme.exists && !forme.battleOnly && forme.changesFrom === original.name) {
                        for (const type of forme.types || []) types.add(type);
                    }
                }
                const seen = new Set();
                for (let prevo = mon.prevo; prevo && !seen.has(prevo);) {
                    seen.add(prevo);
                    const prior = genDex.species.get(prevo);
                    for (const type of prior.types || []) types.add(type);
                    prevo = prior.prevo;
                }
            }
            cache.set(key, types);
        }
        const minGen = dex.gen === 9 && !natdex ? 9 : species.gen;
        for (let gen = dex.gen; gen >= minGen && gen >= move.gen; gen--) {
            if (types.has(Dex.forGen(gen).moves.get(id).type)) return true;
        }
        return false;
    }

    function stabmonsMoveResults(search, base) {
        const results = base();
        if (!search.species) return results;
        const species = search.dex.species.get(search.species);
        if (!species?.exists) return results;
        const natdex = isNationalDexFormat(getActiveTeambuilderRoom()?.curTeam?.format || search.format);
        const have = new Set(results.filter((r) => r[0] === 'move').map((r) => r[1]));
        const additions = Object.keys(window.BattleMovedex || {}).filter((id) =>
            !have.has(id) && stabmonsCanLearn(search.dex, species, id, natdex, moveProviderFormat(search)));
        return addMovesToResults(search, results, species, additions);
    }

    function alphabetCupMoveResults(search, base) {
        const results = base();
        if (!search.species) return results;

        const species = search.dex.species.get(search.species);
        if (!species?.exists) return results;

        return addMovesToResults(search, results, species, alphabetCupMoveIds(search.dex, species, moveProviderFormat(search)));
    }

    // ---------- Camove Chaos: every move is legal ----------

    const CAMOVE_FORMAT_ID = 'camove';

    function camoveMoveResults(search, base) {
        const results = base();
        if (!search.species) return results;

        const species = search.dex.species.get(search.species);
        if (!species?.exists) return results;

        const have = new Set(results.filter((r) => r[0] === 'move').map((r) => r[1]));
        const add = [...getAlphabetCupCache(search.dex, moveProviderFormat(search)).ids].filter((id) => !have.has(id));
        return add.length ? addMovesToResults(search, results, species, add) : results;
    }

    // Sketchmons gives each Pokémon one move outside its normal movepool. Treat the
    // current native/provider results as that movepool, then only expose extras while
    // the set has not already selected one. Format-specific restricted moves remain
    // server-authoritative, just like the other pasted custom rules.
    function sketchmonsMoveResults(search, base) {
        const results = base();
        if (!search.species) return results;

        const species = search.dex.species.get(search.species);
        if (!species?.exists) return results;

        const legalPool = new Set(results.filter((row) => row[0] === 'move').map((row) => row[1]));
        const selected = (search.set?.moves || []).map((move) => toID(move)).filter(Boolean);
        if (selected.some((move) => !legalPool.has(move))) return results;

        const extras = [...getAlphabetCupCache(search.dex, moveProviderFormat(search)).ids].filter((id) => !legalPool.has(id));
        return extras.length ? addMovesToResults(search, results, species, extras) : results;
    }

    // Typemons: one shared non-native move type for the team.
    function typemonsIllegalTypes(room, search) {
        const dex = room?.curTeam?.dex;
        const team = room?.curSetList;
        const engine = room?.search?.engine;
        const probe = search || engine?.moveSearch || engine?.typedSearch;
        if (!dex || !Array.isArray(team) || typeof probe?.canLearn !== 'function') return [];
        const bans = getMergedBans(room);
        const types = [];
        for (const set of team) {
            const species = set?.species && dex.species.get(set.species);
            if (!species?.exists) continue;
            for (const name of set.moves || []) {
                const move = name && dex.moves.get(name);
                if (!move?.exists) continue;
                if (bans?.moves?.has(move.id) || bans?.restrictedMoves?.has(move.id)) continue;
                let native = true;
                try { native = !!probe.canLearn(species.id, move.id); } catch (e) { /* assume legal */ }
                if (!native) types.push(move.type);
            }
        }
        return types;
    }

    function typemonsType(room = getActiveTeambuilderRoom(), search = null) {
        const team = room?.curTeam;
        if (!team) return null;
        const types = typemonsIllegalTypes(room, search);
        if (team.__qolTypemons && types.includes(team.__qolTypemons)) return team.__qolTypemons;
        return (team.__qolTypemons = types[0] || null);
    }

    function typemonsMoveResults(search, base) {
        const results = base();
        if (!search.species) return results;
        const species = search.dex.species.get(search.species);
        if (!species?.exists) return results;
        // No type locked yet: every Pokémon keeps only its native movepool.
        const type = typemonsType(getActiveTeambuilderRoom(), search);
        if (!type) return results;

        const have = new Set(results.filter((r) => r[0] === 'move').map((r) => r[1]));
        const add = [...getAlphabetCupCache(search.dex, moveProviderFormat(search)).ids].filter((id) =>
                                                                    !have.has(id) && search.dex.moves.get(id).type === type);
        return add.length ? addMovesToResults(search, results, species, add) : results;
    }

    // ---------- National Dex movepool (move-search "natdex" chip) ----------

    const NATDEX_MOVE_FILTER_TYPE = 'mv-natdex'; // = MOVE_FILTER_TYPE + 'natdex'
    const NATDEX_SKIP_NONSTANDARD = new Set(['LGPE', 'Unobtainable', 'CAP', 'Gigantamax']);

    function natdexMoveIds(dex, species) {
        const T = window.BattleTeambuilderTable || {};
        const tables = [T.learnsets];
        for (let g = 1; g <= Math.max(1, dex.gen); g++) tables.push(T['gen' + g]?.learnsets);

        // species + base formes + battleOnly sources + every pre-evolution
        const keys = [];
        const seen = new Set();
        let cur = species;
        while (cur?.exists && !seen.has(cur.id)) {
            seen.add(cur.id);
            keys.push(cur.id, toID(cur.baseSpecies || cur.name));
            for (const b of [].concat(cur.battleOnly || [])) keys.push(toID(b));
            cur = cur.prevo ? dex.species.get(cur.prevo) : null;
        }

        const ids = new Set();

        for (const key of keys) {
            for (const table of tables) {
                const ls = table?.[key];
                if (!ls) continue;

                for (const [moveId, entry] of Object.entries(ls)) {
                    if (entry) ids.add(moveId);
                }
            }
        }

        return [...ids].filter((id) => {
            // Use the current Dex when possible, but fall back to BattleMovedex
            // for National Dex / historical moves such as Sharpen and Barrier.
            const move = dex.moves.get(id);
            const raw = window.BattleMovedex?.[id] || {};

            const exists = move?.exists || !!raw.num;

            if (!exists || (move?.gen ?? raw.gen ?? 0) > dex.gen) return false;

            // Prefer the Dex data, but use raw data for old moves that aren't
            // represented by the current Gen 9 Dex.
            const isZ = move?.isZ ?? raw.isZ;
            const isMax = move?.isMax ?? raw.isMax;
            const isNonstandard = move?.isNonstandard ?? raw.isNonstandard;

            return !isZ &&
                !isMax &&
                !NATDEX_SKIP_NONSTANDARD.has(isNonstandard);
        });
    }

    function augmentWithNatdexMoves(search, results) {
        if (!search.__qolNatdexMoves || !search.species) return results;

        const species = search.dex.species.get(search.species);
        if (!species?.exists) return results;

        const have = new Set(results.filter((r) => r[0] === 'move').map((r) => r[1]));
        const add = natdexMoveIds(search.dex, species).filter((id) => !have.has(id));
        return add.length ? addMovesToResults(search, results, species, add) : results;
    }

    // ====================================================================
    // 12. ABILITY & MOVE SEARCH PROVIDERS
    //
    // One wrapper per search type. The first provider whose format matches
    // builds the base results; `base()` returns the native results for the
    // search's current species (+ National Dex moves for move search).
    // ====================================================================

    // ---------- Almost Any Ability / Pokebilities suggestions ----------

    // Keys are species ids (lowercase, no spaces/punctuation); values are ability names.
    const SUGGESTED_ABILITIES = {
        gholdengo: ['Adaptability', 'Bulletproof', 'Beads of Ruin', 'Earth Eater', 'Fluffy', 'Hadron Engine', 'Levitate', 'Magic Guard', 'Regenerator', 'Surge Surfer', 'Volt Absorb', 'Well-Baked Body'],
        corviknight: ['Fluffy', 'Intimidate', 'Prankster', 'Volt Absorb', 'Water Absorb', 'Well-Baked Body'],
        greattusk: ['Adaptability', 'Fluffy', 'Magic Guard', 'Mold Breaker', 'Regenerator', 'Refrigerate', 'Scrappy', 'Tough Claws', 'Wandering Spirit', 'Water Absorb'],
        roaringmoon: ['Fluffy', 'Magic Guard', 'Regenerator', 'Sword of Ruin', 'Tough Claws'],
        zamazenta: ['Magic Guard', 'Scrappy', 'Sword of Ruin', 'Tough Claws'],
        ironmoth: ['Desolate Land', 'Hadron Engine', 'Sheer Force'],
        manaphy: ['Fluffy', 'Motor Drive', 'Protosynthesis', 'Regenerator', 'Surge Surfer', 'Unaware'],
        pecharunt: ['Corrosion', 'Earth Eater', 'Fluffy', 'Intimidate', 'Prankster'],
        tinglu: ['Bulletproof', 'Fluffy', 'Magic Guard', 'Regenerator', 'Vessel of Ruin', 'Well-Baked Body'],
        deoxysspeed: ['Fluffy', 'Hadron Engine', 'Protean', 'Psychic Surge', 'Sheer Force'],
        landorustherian: ['Desolate Land', 'Fluffy', 'Mold Breaker', 'Regenerator', 'Sword of Ruin', 'Well-Baked Body'],
        moltres: ['Desolate Land', 'Magic Guard'],
        primarina: ['Fluffy', 'Primordial Sea', 'Regenerator', 'Sheer Force', 'Stamina', 'Volt Absorb'],
        screamtail: ['Fluffy', 'Pixilate', 'Regenerator', 'Stamina', 'Unaware'],
        zapdos: ['Intimidate', 'No Guard', 'Primordial Sea'],
        chienpao: ['Adaptability', 'Magic Guard', 'Sword of Ruin'],
        cobalion: ['Earth Eater', 'Magic Guard', 'Well-Baked Body'],
        garchomp: ['Adaptability', "Dragon's Maw", 'Fluffy', 'Regenerator', 'Sword of Ruin'],
        ironhands: ['Earth Eater', 'Regenerator', 'Surge Surfer'],
        irontreads: ['Bulletproof', 'Earth Eater', 'Magic Guard', 'Regenerator', 'Water Absorb', 'Well-Baked Body'],
        kingambit: ['Adaptability', 'Earth Eater', 'Fluffy', 'Sword of Ruin', 'Tinted Lens', 'Tough Claws', 'Well-Baked Body'],
        landorus: ['Desolate Land', 'Fluffy', 'Primordial Sea', 'Well-Baked Body'],
        latios: ['Adaptability', "Dragon's Maw", 'Hadron Engine', 'Tinted Lens'],
        meowscarada: ['Adaptability', 'Magic Guard', 'Sword of Ruin'],
        swampert: ['Regenerator'],
        cinderace: ['Desolate Land', 'Magic Guard', 'Mold Breaker', 'Sword of Ruin'],
        gliscor: ['Fluffy', 'Regenerator', 'Well-Baked Body'],
        ironcrown: ['Earth Eater', 'Hadron Engine', 'Psychic Surge', 'Tinted Lens', 'Well-Baked Body'],
        ogerponwellspring: ['Primordial Sea', 'Sword of Ruin'],
        ogerponhearthflame: ['Desolate Land', 'Magic Guard', 'Sword of Ruin'],
        sinistcha: ['Bulletproof', 'Fluffy', 'Surge Surfer', 'Well-Baked Body'],
        skarmory: ['Fluffy', 'Intimidate', 'Volt Absorb', 'Well-Baked Body'],
        zarude: ['Grassy Surge', 'Sword of Ruin', 'Tough Claws'],
        blissey: ['Magic Guard', 'Unaware'],
        brambleghast: ['Adaptability', 'Fluffy', 'Sword of Ruin'],
        goodrahisui: ['Regenerator'],
        heatran: ['Bulletproof', 'Desolate Land'],
        ogerponcornerstone: ['Rocky Payload', 'Sword of Ruin'],
        okidogi: ['Corrosion', 'Earth Eater', 'Fluffy', 'Well-Baked Body'],
        inteleon: ['Primordial Sea'],
        slitherwing: ['Magic Guard', 'Regenerator', 'Sword of Ruin', 'Tinted Lens'],
        smeargle: ['Prankster'],
        tinkaton: ['Earth Eater', 'Fluffy', 'Levitate', 'Regenerator', 'Well-Baked Body'],
        thundurustherian: ['Primordial Sea', 'Sheer Force', 'Surge Surfer'],
        tornadustherian: ['Magic Guard', 'Sheer Force'],
        ursalunabloodmoon: ['Adaptability', 'Fluffy', 'Unaware', 'Water Absorb'],
        archaludon: ['Primordial Sea'],
        chansey: ['Magic Guard', 'Unaware'],
        chesnaught: ['Flame Body', 'Fluffy', 'Well-Baked Body'],
        cloyster: ['Technician'],
        cresselia: ['Stamina', 'Unaware'],
        deoxysdefense: ['Intimidate', 'Prankster', 'Unaware'],
        empoleon: ['Bulletproof', 'Levitate', 'Vessel of Ruin', 'Volt Absorb'],
        electrodehisui: ['Hadron Engine', 'Magic Guard'],
        garganacl: ['Fluffy'],
        ironboulder: ['Sharpness', 'Sword of Ruin'],
        mamoswine: ['Adaptability', 'Sword of Ruin', 'Technician'],
        mandibuzz: ['Delta Stream', 'Fluffy', 'Magic Guard', 'Unaware', 'Vessel of Ruin', 'Volt Absorb'],
        meloetta: ['Regenerator'],
        polteageist: ['Normalize', 'Pixilate', 'Queenly Majesty'],
        regieleki: ['Pixilate', 'Refrigerate'],
        ribombee: ['Prankster'],
        samurotthisui: ['Adaptability', 'Primordial Sea', 'Prankster', 'Regenerator'],
        sandyshocks: ['Hadron Engine'],
        thundurus: ['Magic Guard', 'Primordial Sea', 'Sheer Force'],
        weezinggalar: ['Earth Eater', 'Fluffy', 'Levitate'],
    };

    const isPokeAAAFormat = (f) => fmtHas(f, 'pokebilitiesaaa', 'pokeaaa', 'pokebilitiesalmostanyability');
    // Pokébilities can be the base format or a stacked custom rule (e.g.
    // Fortemons + [Gen 9] Pokébilities).
    const isPokebilitiesFormat = (f) => fmtHas(f, 'pokebilities');

    const allAbilityCache = new WeakMap();
    function allAbilityIds(dex) {
        let ids = allAbilityCache.get(dex);
        if (ids) return ids;

        ids = [];
        for (const id of Object.keys(window.BattleAbilities || {})) {
            const ability = dex.abilities.get(id);
            if (ability?.exists && ability.id === id && (!ability.gen || ability.gen <= dex.gen) && !ability.isNonstandard && id !== 'noability') ids.push(id);
        }
        ids.sort((a, b) => dex.abilities.get(a).name.localeCompare(dex.abilities.get(b).name));
        allAbilityCache.set(dex, ids);
        return ids;
    }

    // Almost Any Ability (the AAA format, Pokébilities AAA, or any format with "!Obtainable Abilities"):
    // every ability is legal except banned ones; restricted ones only for Pokémon that have them natively.
    // Layout: Native (Pokébilities) / Suggested / the rest / All Abilities / Restricted / Banned.
    function suggestedAbilityResults(search, base) {
        const results = base();
        if (!search.species) return results;

        const dex = search.dex;
        const species = dex.species.get(search.species);
        const format = getActiveTeambuilderRoom()?.curTeam?.format || search.format;
        const bans = getMergedBansForFormat(format); // null until the base list has loaded
        const pokebilities = isPokebilitiesFormat(format);
        const nativeIds = [...new Set(Object.values(species?.abilities || {}).map((n) => toID(n)).filter(Boolean))];

        const seen = new Set();
        const banned = [];
        const restricted = [];

        // True if the ability is usable; otherwise files it under Banned / Restricted.
        const classify = (id) => {
            if (abilityBanned(bans, id, nativeIds, pokebilities)) { banned.push(['ability', id]); return false; }
            if (bans?.restrictedAbilities?.has(id) && !nativeIds.includes(id)) { restricted.push(['ability', id]); return false; }
            return true;
        };

        const abilityRows = (names) => {
            const rows = [];
            for (const name of names) {
                const ability = dex.abilities.get(name);
                if (!ability?.exists || seen.has(ability.id)) continue;
                seen.add(ability.id);
                if (classify(ability.id)) rows.push(['ability', ability.id]);
            }
            return rows;
        };

        const suggestedRows = abilityRows(SUGGESTED_ABILITIES[toID(search.species)] || []);

        const notes = results.filter((r) => r[0] === 'html');
        const kept = [];
        for (const r of results) {
            if (r[0] === 'html') continue;
            if (r[0] === 'ability') {
                // Keep native abilities as a distinct top section only when
                // every native ability is part of the format (Pokébilities).
                // In ordinary AAA-style formats they are just entries in the
                // general ability pool, not a special section.
                if (!pokebilities) continue;
                if (seen.has(r[1])) continue;
                seen.add(r[1]);
                if (!classify(r[1])) continue;
            }
            kept.push(r);
        }
        const rest = pokebilities ? dropEmptyHeaders(kept) : [];

        // Anything the client's own list didn't include.
        const extras = [];
        for (const id of allAbilityIds(dex)) {
            if (seen.has(id)) continue;
            seen.add(id);
            if (classify(id)) extras.push(['ability', id]);
        }

        return [
            ...notes,
            ...(suggestedRows.length ? [['header', 'Suggested Abilities'], ...suggestedRows] : []),
            ...rest,
            ...(extras.length ? [['header', 'All Abilities'], ...extras] : []),
            ...(restricted.length ? [['header', 'Restricted Abilities'], ...restricted] : []),
            ...(banned.length ? [['header', 'Banned Abilities'], ...banned] : []),
        ];
    }

    // Pull rows matching a predicate out of their sections and place them under a dedicated header.
    function groupUnderHeader(results, header, test) {
        if (results.some((r) => r[0] === 'header' && r[1] === header)) return results;
        const hit = [];
        const kept = results.filter((r) => (test(r) ? (hit.push(r), false) : true));
        return hit.length ? [...dropEmptyHeaders(kept), ['header', header], ...hit] : results;
    }

        // Re-applies the Banned / Restricted groups to any result list (also flat search / sort lists).
    // The native getResults() puts unlearnable moves/items under "Illegal results".
    // Our restricted/banned sections must precede that final fallback section,
    // not be appended after it (including after a typed search or sort).
    function placeRuleSectionsBeforeIllegal(results, groups) {
        if (!groups?.length || !results.some((r) => r[0] === 'header' && /illegal results/i.test(r[1]))) return results;
        const special = new Map(groups.map((g) => [g.header, []]));
        const normal = [], illegal = [];
        let section = 'normal';
        for (const row of results) {
            if (row[0] === 'header') {
                if (special.has(row[1])) { section = row[1]; continue; }
                if (/illegal results/i.test(row[1])) { section = 'illegal'; continue; }
                section = 'normal'; normal.push(row);
                continue;
            }
            if (special.has(section)) special.get(section).push(row);
            else if (section === 'illegal') illegal.push(row);
            else normal.push(row);
        }
        return [
            ...dropEmptyHeaders(normal),
            ...groups.flatMap((g) => special.get(g.header)?.length ? [['header', g.header], ...special.get(g.header)] : []),
            ...(illegal.length ? [['header', 'Illegal results'], ...illegal] : []),
        ];
    }

    function applyGroups(results, groups) {
        let out = results;
        for (const g of groups || []) {
            out = groupUnderHeader(out, g.header, (r) => r[0] === g.kind && g.test(r[1]));
        }
        return placeRuleSectionsBeforeIllegal(out, groups);
    }

    // Rebuild ONLY move result sections after native text search, filtering or sorting.
    // Native 'Illegal results' moves must keep their native illegalReasons tags;
    // the header is purely presentational. Never introduce illegal moves when
    // native search didn't return any (normally only while searching/filtering).
    function normalizeMoveLegalitySections(engine, results) {
        if (!Array.isArray(results) || engine.typedSearch?.searchType !== 'move') return results;
        const search = engine.typedSearch;
        const bans = getMergedBansForFormat(getActiveTeambuilderRoom()?.curTeam?.format || search.format);
        const learned = new Set((search.baseResults || []).filter((r) => r[0] === 'move').map((r) => r[1]));
        const normal = [], restricted = [], banned = [], illegal = [];
        let nativeSection = 'normal';
        let normalHasMove = false;
        for (const row of results) {
            if (row[0] === 'header') {
                const header = String(row[1]);
                if (/^(?:Illegal results|Illegal Moves)$/i.test(header)) { nativeSection = 'illegal'; continue; }
                if (/^Banned Moves$/i.test(header)) { nativeSection = 'banned'; continue; }
                if (/^Restricted Moves$/i.test(header)) { nativeSection = 'restricted'; continue; }
                nativeSection = 'normal';
                normal.push(row);
                continue;
            }
            if (row[0] !== 'move') {
                if (nativeSection === 'normal') normal.push(row);
                continue;
            }
            const id = row[1];
            const nativeIllegal = search.illegalReasons?.[id] === 'Illegal';
            // An unlearnable banned move remains illegal rather than appearing
            // under Banned Moves: its native illegal tag must be preserved.
            if (nativeIllegal || nativeSection === 'illegal' ||
                (learned.size && !learned.has(id))) {
                illegal.push(row);
            } else if (bans?.moves?.has(id) || nativeSection === 'banned') {
                banned.push(row);
            } else if (nativeSection === 'restricted') {
                restricted.push(row);
            } else {
                normal.push(row);
                normalHasMove = true;
            }
        }
        let clean = dropEmptyHeaders(normal);
        // Native searches can omit 'Moves' when sorting; insert it only when
        // needed to anchor the banned/illegal sections below the legal results.
        if (normalHasMove && (banned.length || illegal.length) &&
            !clean.some((r) => r[0] === 'header' && String(r[1]) === 'Moves')) {
            const idx = clean.findIndex((r) => r[0] === 'move');
            if (idx >= 0) clean.splice(idx, 0, ['header', 'Moves']);
        }
        return [
            ...clean,
            ...(restricted.length ? [['header', 'Restricted Moves'], ...restricted] : []),
            ...(banned.length ? [['header', 'Banned Moves'], ...banned] : []),
            ...(illegal.length ? [['header', 'Illegal Moves'], ...illegal] : []),
        ];
    }

    // Runs after every engine find(), so the headers survive typing, sorting and filter chips.
    function patchEngineFindBanHeaders() {
        return patchEngineMethod('find', '__qolBanHeadersPatched', (original) =>
            function (...args) {
                const changed = original.apply(this, args);
                try {
                    const groups = this.typedSearch?.__qolGroups;
                    if (Array.isArray(this.results)) {
                        const grouped = groups?.length ? applyGroups(this.results, groups) : this.results;
                        const out = normalizeMoveLegalitySections(this, grouped);
                        if (out !== this.results) {
                            this.results = out;
                            if (typeof this.getFirstResultIndex === 'function') this.selection = this.getFirstResultIndex();
                        }
                    }
                } catch (e) {
                    console.error(LOG, 'Ban header regroup failed:', e);
                }
                return changed;
            }
        );
    }

        function moveBannedAbilitiesToHeader(search, results) {
        search.__qolGroups = null;
        if (!Array.isArray(results)) return results;
        const format = getActiveTeambuilderRoom()?.curTeam?.format || search.format;
        const bans = getMergedBansForFormat(format);
        if (!bans?.abilities.size && !bans?.abilityCombos?.size && !bans?.restrictedAbilities?.size) return results;

        const species = search.species ? search.dex.species.get(search.species) : null;
        const nativeIds = [...new Set(Object.values(species?.abilities || {}).map((n) => toID(n)).filter(Boolean))];
        const pokebilities = isPokebilitiesFormat(format);

        const banned = (id) => abilityBanned(bans, id, nativeIds, pokebilities);
        const restricted = (id) => !banned(id) && !!bans.restrictedAbilities?.has(id) && !nativeIds.includes(id);

        search.__qolGroups = [
            {header: 'Restricted Abilities', kind: 'ability', test: restricted},
            {header: 'Banned Abilities', kind: 'ability', test: banned},
        ];
        return applyGroups(results, search.__qolGroups);
    }

    function moveBannedAbilitiesToHeader(search, results) {
        if (!Array.isArray(results)) return results;
        const format = getActiveTeambuilderRoom()?.curTeam?.format || search.format;
        const bans = getMergedBansForFormat(format);
        if (!bans?.abilities.size && !bans?.abilityCombos?.size && !bans?.restrictedAbilities?.size) return results;

        const species = search.species ? search.dex.species.get(search.species) : null;
        const nativeIds = [...new Set(Object.values(species?.abilities || {}).map((n) => toID(n)).filter(Boolean))];
        const pokebilities = isPokebilitiesFormat(format);
        const banned = (r) => r[0] === 'ability' && abilityBanned(bans, r[1], nativeIds, pokebilities);
        const restricted = (r) => r[0] === 'ability' && !banned(r) &&
            !!bans.restrictedAbilities?.has(r[1]) && !nativeIds.includes(r[1]);
        return groupUnderHeader(groupUnderHeader(results, 'Restricted Abilities', restricted), 'Banned Abilities', banned);
    }

    function moveBannedMovesToHeader(search, results, nativeRows) {
        search.__qolGroups = null;
        if (!Array.isArray(results)) return results;
        const bans = getMergedBansForFormat(getActiveTeambuilderRoom()?.curTeam?.format || search.format);
        if (!bans?.moves?.size && !bans?.restrictedMoves?.size) return results;

        const native = bans.restrictedMoves?.size
            ? new Set(nativeRows().filter((r) => r[0] === 'move').map((r) => r[1]))
            : new Set();
        // Only learned moves belong in Banned Moves. A banned move the
        // Pokemon cannot learn must remain in the native Illegal results.
        // This provider result already includes OM-granted learnsets.
        const learned = new Set(results.filter((r) => r[0] === 'move').map((r) => r[1]));
        const banned = (id) => learned.has(id) && !!bans.moves?.has(id);
        const restricted = (id) => !banned(id) && !!bans.restrictedMoves?.has(id) &&
            !(modsForSearch(search).includes(MOD.STABMONS)
                ? search.canLearn(toID(search.species), id) : native.has(id));

        search.__qolGroups = [
            {header: 'Restricted Moves', kind: 'move', test: restricted},
            {header: 'Banned Moves', kind: 'move', test: banned},
        ];
        return applyGroups(results, search.__qolGroups);
    }

    function patchItemSearchBans() {
        return patchMethod(window.BattleItemSearch?.prototype, 'getBaseResults', '__qolItemBansPatched', (original) =>
                           function (...args) {
            const results = original.apply(this, args);
            this.__qolGroups = null;
            if (!Array.isArray(results)) return results;
            const bans = getMergedBansForFormat(getActiveTeambuilderRoom()?.curTeam?.format || this.format);
            if (!bans) return results;

            const bannedItem = (id) => !!bans.items?.has(id);
            const format = getActiveTeambuilderRoom()?.curTeam?.format || this.format;
            const speciesName = this.set?.species || this.species || getActiveTeambuilderRoom()?.curSet?.species;
            const species = speciesName ? this.dex.species.get(speciesName) : null;
            const baseId = species ? toID(species.baseSpecies || species.name) : '';
            // Mix and Mega restricts SPECIES, not stones: restricted Pokemon
            // cannot use a transformative stone (subject to native item-user
            // exceptions). Keep ordinary held items in the normal list.
            const mnmRestricted = isMnmSearch(this) && !!species?.exists &&
                (bans.restricted.has(species.id) || bans.restrictedBase.has(baseId));
            const restrictedItem = (id) => {
                if (bannedItem(id) || bans.restrictedItems?.has(id)) return !!bans.restrictedItems?.has(id) && !bannedItem(id);
                if (!mnmRestricted) return false;
                const item = this.dex.items.get(id);
                if (!item?.exists || !isMnmStoneItem(this.dex, item)) return false;
                // These exceptions are copied from Mix and Mega's
                // onValidateTeam, not an unconditional stone ban.
                if (!item.megaStone && !item.isPrimalOrb &&
                    (item.itemUser?.includes(species.name) || item.forcedForme === species.name)) return false;
                if (isNationalDexFormat(format) && species.name.startsWith('Necrozma-') && id === 'ultranecroziumz') return false;
                return true;
            };
            this.__qolGroups = [
                {header: 'Restricted Items', kind: 'item', test: restrictedItem},
                {header: 'Banned Moves', kind: 'move', test: (id) => !!bans.moves?.has(id)},
                {header: 'Banned Items', kind: 'item', test: bannedItem},
            ];
            return applyGroups(results, this.__qolGroups);
        });
    }

    // ---------- Frantic Fusions / Inheritance ability list ----------

    // Own abilities stay where they are; the donor's are added right after them.
    // One flat "Abilities" list (hidden/special included), no sub-headers.
    function flattenAbilityResults(results, extraIds = []) {
        const notes = results.filter((r) => r[0] === 'html');
        const seen = new Set();
        const abilities = [];

        for (const r of results) {
            if (r[0] !== 'ability' || seen.has(r[1])) continue;
            seen.add(r[1]);
            abilities.push(r);
        }
        for (const id of extraIds) {
            if (!id || seen.has(id)) continue;
            seen.add(id);
            abilities.push(['ability', id]);
        }

        return [...notes, ['header', 'Abilities'], ...abilities];
    }

    // Frantic Fusions: own abilities + donor's. Inheritance: donor's abilities only.
    function fusionAbilityResults(search, base) {
        const isInheritance = modsForSearch(search).includes(MOD.INHERITANCE);
        const fusion = resolveFusion(search.dex, search.set);

        let results;
        let extraIds = [];

        if (isInheritance) {
            results = fusion
                ? withSpeciesOverrides(search.dex, fusion.species, {abilities: copy(fusion.donor.abilities)}, base)
            : base();
        } else {
            results = base();
            if (fusion) extraIds = Object.values(fusion.donor.abilities).filter(Boolean).map((a) => toID(a));
        }

        return search.species ? flattenAbilityResults(results, extraIds) : results;
    }

    // ---------- Cross Evolution ----------

    // Abilities: show the target's abilities in the ability picker.
    function crossEvolutionAbilityResults(search, base) {
        const ce = resolveCrossEvolution(search.dex, search.set);
        if (!ce || !crossEvolutionDonorAllowed(search.dex, ce.cross)) return base();

        const results = withSpeciesOverrides(search.dex, ce.species, {abilities: copy(ce.cross.abilities)}, base);

        // Only abilities the base species doesn't already have get the icon.
        const own = new Set(Object.values(ce.species.abilities).filter(Boolean).map((a) => toID(a)));
        const donors = {};
        for (const r of results) {
            if (r[0] === 'ability' && !own.has(r[1])) donors[r[1]] = ce.cross.id;
        }
        addDonors(search, donors);

        return results;
    }

    function crossEvolutionMoveResults(search, base) {
        const results = base();

        const ce = resolveCrossEvolution(search.dex, search.set);
        if (!ce || !crossEvolutionDonorAllowed(search.dex, ce.cross)) return results;

        const crossResults = withSearchSpecies(search, ce.cross.name, base);

        // Moves that only exist because of the cross evolution get the target's icon.
        const have = new Set(results.filter((r) => r[0] === 'move').map((r) => r[1]));
        const donors = {};
        for (const r of crossResults) {
            if (r[0] === 'move' && !have.has(r[1])) donors[r[1]] = ce.cross.id;
        }
        addDonors(search, donors);

        return mergeMoveResults(results, crossResults);
    }

    // Inheritance: the donor's movepool fully replaces the mon's own.
    function inheritanceMoveResults(search, base) {
        const inh = resolveFusion(search.dex, search.set);
        return inh ? withSearchSpecies(search, inh.donor.name, base) : base();
    }

    // ---------- Mix and Mega ----------

    // Mirrors the native "Will be X after Mega Evolving" note for real Mega
    // species, triggered by the MnM item instead.
    function mixAndMegaAbilityResults(search, base) {
        const results = base();
        if (!search.set?.item) return results;

        const futureAbility = mixAndMegaFutureAbility(search.dex, search.set);
        if (!futureAbility) return results;

        return [['html', `Will be <strong>${futureAbility}</strong> after Mega Evolving.`], ...results];
    }

    // ---------- provider tables + wrappers ----------

    // Every active mod that has a provider runs, in stack order. Each provider receives the
    // previous one's results as its `base()`, so providers add to each other (Convergence +
    // Alphabet Cup, Cross Evolution + Convergence...).
    const ABILITY_PROVIDERS = {
        [MOD.ALMOST_ANY_ABILITY]: suggestedAbilityResults,
        [MOD.FRANTIC_FUSIONS]: fusionAbilityResults,
        [MOD.INHERITANCE]: fusionAbilityResults,
        [MOD.CROSS_EVOLUTION]: crossEvolutionAbilityResults,
        [MOD.CONVERGENCE]: convergenceAbilityResults,
        [MOD.MIX_AND_MEGA]: mixAndMegaAbilityResults,
    };

    const MOVE_PROVIDERS = {
        [MOD.CROSS_EVOLUTION]: crossEvolutionMoveResults,
        [MOD.INHERITANCE]: inheritanceMoveResults,
        [MOD.CONVERGENCE]: convergenceMoveResults,
        [MOD.ALPHABET_CUP]: alphabetCupMoveResults,
        [MOD.ALL_MOVES]: camoveMoveResults,
        [MOD.SKETCHMONS]: sketchmonsMoveResults,
        [MOD.TYPEMONS]: typemonsMoveResults,
        [MOD.STABMONS]: stabmonsMoveResults,
    };

    function runProviderChain(providers, search, nativeBase) {
        const mods = modsForSearch(search);
        search.__qolStackKey = mods.join(',');
        search.__qolConvDonors = {};

        let base = nativeBase;
        for (const mod of mods) {
            const run = providers[mod];
            if (!run) continue;
            const inner = base;
            base = () => run(search, inner);
        }
        return base();
    }

    function patchAbilitySearchResults() {
        return patchMethod(window.BattleAbilitySearch?.prototype, 'getBaseResults', '__qolAbilityProvidersPatched', (original) =>
                           function () {
            return moveBannedAbilitiesToHeader(
                this, runProviderChain(ABILITY_PROVIDERS, this, () => original.call(this))
            );
        }
                          );
    }

    function patchMoveSearchResults() {
        return patchMethod(window.BattleMoveSearch?.prototype, 'getBaseResults', '__qolMoveProvidersPatched', (original) =>
                           function () {
            // A Convergence provider temporarily changes `this.species` to read
            // each same-typing donor's learnset. Caching one `native` result for
            // the entire call silently reused the recipient's moves for every
            // donor, even though abilities were correctly shared. Cache per
            // species + format instead, without persisting across searches.
            const nativeBySpecies = new Map();
            const nativeRows = () => {
                const format = this.format;
                const key = `${this.species || ''}|${format}|${this.set?.name || ''}|${this.__qolNatdexMoves ? 1 : 0}`;
                if (nativeBySpecies.has(key)) return nativeBySpecies.get(key);
                // Our provider handles STABmons, including absent historical
                // formes. Do not also run the client's unguarded STABmons loop.
                if (modsForSearch(this).includes(MOD.STABMONS)) {
                    this.format = format === 'staaabmons' ? 'qolstab' : format.replace(/stabmons/g, 'qolstab');
                }
                let rows;
                try { rows = augmentWithNatdexMoves(this, original.call(this)); }
                finally { this.format = format; }
                nativeBySpecies.set(key, rows);
                return rows;
            };
            // A provider may augment a native list with otherwise existing but
            // wrong-generation moves. Enforce the same game-generation boundary
            // for the final picker, not only the per-provider caches.
            const format = moveProviderFormat(this);
            const rows = runProviderChain(MOVE_PROVIDERS, this, nativeRows);
            const eligible = rows.filter((row) => row[0] !== 'move' ||
                moveAllowedByGeneration(this.dex, this.dex.moves.get(row[1]), format));
            return moveBannedMovesToHeader(this, eligible, nativeRows);
        }
                          );
    }

    // ---------- cached-result invalidation ----------

    // Move/ability results are cached per search instance. Bust the cache when
    // the nickname (the cross-evo / fusion donor) changes.
    function bustFusionCache(search) {
        if (!search.set) return;
        const mods = modsForSearch(search);
        const parts = [getActiveTeambuilderRoom()?.curTeam?.format || search.format || '', search.species || ''];
        if (mods.includes(MOD.SKETCHMONS)) parts.push(...(search.set.moves || []));
        if (mods.some(isFusionMod)) parts.push(search.set.species || '', search.set.name || '', search.species || '');
        if (mods.includes(MOD.TYPEMONS)) parts.push('typemons', typemonsType(getActiveTeambuilderRoom(), search) || '');
        if (!parts.length) return;
        const key = parts.join('|');
        if (search.__qolFusionKey === key) return;
        search.__qolFusionKey = key;
        clearSearchCache(search);
    }

    // Rebuild the cached move pool whenever the move "natdex" chip is added/removed.
    function syncNatdexMoveCache(search, filters) {
        const on = Array.isArray(filters) && filters.some((f) => f[0] === NATDEX_MOVE_FILTER_TYPE);
        if (on === !!search.__qolNatdexMoves) return;

        search.__qolNatdexMoves = on;
        clearSearchCache(search);
        search.illegalReasons = null;
    }

    function patchSearchCacheInvalidation() {
        const patch = (proto, extra) =>
        patchMethod(proto, 'getResults', '__qolCacheInvalidationPatched', (original) =>
                    function (filters, ...rest) {
            bustFusionCache(this);
            if (extra) extra(this, filters);
            return original.call(this, filters, ...rest);
        }
                   );

        // Non-short-circuiting on purpose: patch both.
        return [
            patch(window.BattleMoveSearch?.prototype, syncNatdexMoveCache),
            patch(window.BattleAbilitySearch?.prototype, null),
        ].every(Boolean);
    }

    // ====================================================================
    // 13. POKÉMON SEARCH FILTERS
    // ====================================================================

    const EFFECT_LABELS = {weak: 'Weak', resists: 'Resists', neutral: 'Neutral'};
    const EFFECT_QUERY_RE = /^(weak|resists|neutral)(?:\s+(.*))?$/i;

    // A negated filter is an ordinary [type, value] tuple whose `type` has a
    // leading "!" (e.g. ['!weak', 'Fire']), so everything that consumes
    // `filters` (dedup, chip removal via "value".split(':')) works unchanged.
    const isNegatedFilterType = (type) => typeof type === 'string' && type.charCodeAt(0) === 33; // '!'
    const negatedFilterType = (type) => (isNegatedFilterType(type) ? type : '!' + type);
    const baseFilterType = (type) => (isNegatedFilterType(type) ? type.slice(1) : type);

    const ALLOWED_POKEMON_FILTER_TYPES = [
        'type', 'color', 'move', 'ability', 'egggroup', 'tier', 'weak', 'resists', 'neutral',
        'natdex', 'hackmons', 'fe', 'recovery', 'pivot', 'priority', 'removal', 'hazards', 'selfko', 'into', 'from',
        'legendary', 'boxlegend', 'mythical', 'paradox', 'eeveelution', 'restricted', 'realbulk',
        'ce', 'stage1', 'stage2', 'stage3', 'fulllist',
    ];
    // Toggle filters take no argument: typing the keyword and picking the
    // single suggestion adds/removes the chip. Value = display label.
    const CUSTOM_TOGGLE_FILTERS = {
        natdex: 'National Dex',
        hackmons: 'Hackmons',
        fe: 'Fully Evolved',
        recovery: 'Recovery',
        pivot: 'Pivot',
        priority: 'Priority',
        removal: 'Removal',
        legendary: 'Legendary',
        boxlegend: 'Box Legends',
        mythical: 'Mythical',
        paradox: 'Paradox',
        eeveelution: 'Eeveelution',
        hazards: 'Hazards',
        selfko: 'Self KO',
        restricted: 'Restricted',
        realbulk: 'Real Bulk',
        ce: 'Show Evo',
        fulllist: 'Full List',
        stage1: 'Stage 1',
        stage2: 'Stage 2',
        stage3: 'Stage 3',
    };


    // Namespaced pseudo-ids so suggestion rows can't collide with real ids.
    const CUSTOM_TOGGLE_PREFIX = 'is ';

    const POKEMON_COLORS = ['Black', 'Blue', 'Brown', 'Gray', 'Green', 'Pink', 'Purple', 'Red', 'White', 'Yellow'];
    const COLOR_ROW_PREFIX = 'color ';
    const pokemonColorName = (value) => POKEMON_COLORS.find((color) =>
        toSearchId(color) === toSearchId(value).replace(/^grey$/, 'gray')) || null;
    const colorRowName = (id) => typeof id === 'string' && id.startsWith(COLOR_ROW_PREFIX)
        ? pokemonColorName(id.slice(COLOR_ROW_PREFIX.length)) : null;

    function isMonoColorSearch(engine) {
        const active = getActiveTeambuilderRoom()?.curTeam?.format;
        return fmtHas(active || engine?.format || '', 'monocolor', 'monocolour');
    }

    function colorSuggestions(query) {
        if (!isMonoColorSearch(getEngine())) return [];
        const q = toSearchId(query).replace(/grey/g, 'gray');
        return POKEMON_COLORS.filter((color) => {
            const id = toSearchId(color);
            return !q || [id, 'color' + id, 'colour' + id].some((name) => name.startsWith(q));
        }).map((color) => ['ability', COLOR_ROW_PREFIX + toSearchId(color), 0, 0]);
    }
    const INTO_PREFIX = 'Into ';
    const FROM_PREFIX = 'From ';

    const isFullyEvolved = (species) => !!species && (!species.evos || species.evos.length === 0);
    // 252 HP / 252 Def or SpD (boosting nature), level 100, 31 IVs.
    function realBulk(baseStats, stat) {
        const hp = baseStats.hp === 1 ? 1 : 2 * baseStats.hp + 204;
        return hp * Math.floor((2 * baseStats[stat] + 99) * 11 / 10);
    }
    const formatBulk = (n) => Math.round(n / 1000) + 'k';
    const hasRealBulk = (engine) => !!getIntoFilterId(engine, 'realbulk');

    function applyRealBulkToRowHtml(html, stats) {
        if (typeof html !== 'string' || !stats) return html;
        return html.replace(/(<em>(Def|SpD)<\/em><br>)[^<]*/g, (m, prefix, label) =>
                            prefix + formatBulk(realBulk(stats, label === 'Def' ? 'def' : 'spd')));
    }

    const SPECIES_GROUPS = {
        // Sub-legendaries + legends (not box, not mythical)
        legendary: setOf(
            'articuno zapdos moltres raikou entei suicune regirock regice registeel latias latios ' +
            'uxie mesprit azelf heatran regigigas cresselia cobalion terrakion virizion ' +
            'tornadus thundurus landorus typenull silvally tapukoko tapulele tapubulu tapufini ' +
            'cosmog cosmoem nihilego buzzwole pheromosa xurkitree celesteela kartana guzzlord ' +
            'poipole naganadel stakataka blacephalon kubfu urshifu regieleki regidrago glastrier ' +
            'spectrier enamorus wochien chienpao tinglu chiyu terapagos'
        ),
        boxlegend: setOf(
            'mewtwo lugia hooh kyogre groudon rayquaza dialga palkia giratina reshiram zekrom kyurem ' +
            'xerneas yveltal zygarde solgaleo lunala necrozma zacian zamazenta eternatus calyrex ' +
            'koraidon miraidon'
        ),
        mythical: setOf(
            'mew celebi jirachi deoxys phione manaphy darkrai shaymin arceus victini keldeo meloetta ' +
            'genesect diancie hoopa volcanion magearna marshadow zeraora meltan melmetal zarude ' +
            'pecharunt ogerpon okidogi munkidori fezandipiti'
        ),
        paradox: setOf(
            'greattusk screamtail brutebonnet fluttermane slitherwing sandyshocks roaringmoon walkingwake ' +
            'gougingfire ragingbolt irontreads ironbundle ironhands ironjugulis ironmoth ironthorns ' +
            'ironvaliant ironleaves ironboulder ironcrown miraidon koraidon'
        ),
        eeveelution: setOf('vaporeon jolteon flareon espeon umbreon leafeon glaceon sylveon eevee'),
    };

    const speciesInGroup = (species, kind) =>
    !!species && (SPECIES_GROUPS[kind]?.has(toID(species.baseSpecies || species.name)) || false);

    const REMOVAL_MOVE_IDS = 'defog rapidspin mortalspin courtchange tidyup';
    const HAZARD_MOVE_IDS = 'stealthrock spikes toxicspikes stickyweb ceaselessedge stoneaxe';
    const PIVOT_MOVE_IDS = 'uturn voltswitch flipturn partingshot chillyreception teleport shedtail';

    const TOGGLE_MOVE_LISTS = {
        recovery: listOf(
            'healorder junglehealing milkdrink moonlight morningsun recover roost shoreup ' +
            'slackoff softboiled strengthsap synthesis wish'
        ),
        pivot: listOf(PIVOT_MOVE_IDS),
        removal: listOf(REMOVAL_MOVE_IDS),
        hazards: listOf(HAZARD_MOVE_IDS),

    };

    // Per-dex cache so we don't rescan the whole movedex per search row.
    const customToggleMoveIdCache = new WeakMap();

    const STONE_PREFIX = 'Stone ';
    const isStoneRowId = (id) => String(id).toLowerCase().startsWith(STONE_PREFIX.toLowerCase());
    const isMnmFormat = (f) => fmtHas(f, 'mixandmega');
    const isMnmSearch = (search) => modsForSearch(search).includes(MOD.MIX_AND_MEGA);

    function requiresHeldItem(sp) {
        return !!sp && !!(
            sp.isMega || sp.isPrimal || sp.requiredItem ||
            (sp.requiredItems && sp.requiredItems.length) || sp.battleOnly
        );
    }

    function isMnmStoneItem(dex, item) {
        if (!item?.exists) return false;
        const forme = resolveMegaForme(dex, item);
        if (!forme) return false;
        if (item.megaStone || resolveSpecialMixAndMegaForme(dex, item)) return true;
        return forme.formeSpecies.name !== forme.baseSpecies.name; // Rusted Sword etc.; skips Soul Dew
    }

    const mnmStoneCache = new WeakMap();
    function getMnmStoneItems(dex) {
        let list = mnmStoneCache.get(dex);
        if (list) return list;

        list = [];
        for (const id of Object.keys(window.BattleItems || {})) {
            const item = dex.items.get(id);
            if (item?.exists && item.id === id && isMnmStoneItem(dex, item)) list.push(item);
        }
        list.sort((a, b) => a.name.localeCompare(b.name));
        mnmStoneCache.set(dex, list);
        return list;
    }

    function stoneSuggestions(engine, query) {
        if (!isMnmSearch(engine?.typedSearch)) return [];
        const q = toSearchId(query);
        if (q.length < 2) return [];

        const dex = engine.dex || engine.typedSearch?.dex;
        if (!dex) return [];

        return getMnmStoneItems(dex)
            .filter((it) => toSearchId(it.name).includes(q))
            .sort((a, b) =>
                  toSearchId(b.name).startsWith(q) - toSearchId(a.name).startsWith(q))
            .slice(0, 8)
            .map((it) => ['ability', STONE_PREFIX + it.id, 0, Math.min(q.length, it.name.length)]);
    }

    // Stats / types / ability of `speciesLike` holding the stone (null if n/a).
    function mnmStoneView(dex, speciesLike, stoneId, mods = getActiveMods(), baseSet = {}) {
        if (!dex || !speciesLike?.name) return null;
        const room = getActiveTeambuilderRoom();
        const set = {...baseSet, species: speciesLike.name, item: stoneId};

        const baseStats = computeModsBaseStats(mods, {dex, set, room}) || mixAndMegaBaseStats(dex, set);
        if (!baseStats) return null;

        const ability = mixAndMegaFutureAbility(dex, set);
        return {
            baseStats,
            types: modifiedTypes(mods, dex, set) || speciesLike.types,
            abilities: ability ? {0: ability} : null,
        };
    }

    function computeCustomToggleMoveIds(dex, kind) {
        if (TOGGLE_MOVE_LISTS[kind]) {
            return TOGGLE_MOVE_LISTS[kind].filter((id) => dex.moves.get(id)?.exists);
        }

        if (kind === 'selfko') {
            const all = typeof dex?.moves?.all === 'function'
                ? dex.moves.all() : Object.values(window.BattleMovedex || {});
            return all.filter((move) => move?.id && move?.exists !== false &&
                (SELF_KO_MOVES.has(move.id) || !!moveField(move, 'selfdestruct')))
                .map((move) => move.id);
        }

        if (kind === 'priority') {
            const all = typeof dex?.moves?.all === 'function'
            ? dex.moves.all()
            : Object.values(window.BattleMovedex || {});

            return all
                .filter((move) =>
                        move?.exists && move.category !== 'Status' && move.id !== 'bide' && move.priority > 0)
                .map((move) => move.id);
        }

        return [];
    }

    function getCustomToggleMoveIds(dex, kind) {
        if (!dex) return [];

        let byKind = customToggleMoveIdCache.get(dex);
        if (!byKind) {
            byKind = {};
            customToggleMoveIdCache.set(dex, byKind);
        }

        if (!byKind[kind]) byKind[kind] = computeCustomToggleMoveIds(dex, kind);
        return byKind[kind];
    }

    // `ctx` is the search instance, `original` native filter() so move-based
    // toggles reuse native 'move' filtering per qualifying move id.
    const toggleMoveMatchCache = new WeakMap(); // search instance -> {format, map}

    // True if the species can learn at least one move from the toggle's move list.
    function canLearnAnyToggleMove(ctx, original, row, species, kind) {
        const format = String(ctx.format || '');
        let cache = toggleMoveMatchCache.get(ctx);
        if (!cache || cache.format !== format) {
            cache = {format, map: new Map()};
            toggleMoveMatchCache.set(ctx, cache);
        }

        const key = kind + '|' + species.id + '|' + (ctx.__qolTypemons || '');
        if (cache.map.has(key)) return cache.map.get(key);

        const result = getCustomToggleMoveIds(ctx.dex, kind)
        .some((moveId) => pokemonMatchesMove(ctx, original, row, species, moveId));
        cache.map.set(key, result);
        return result;
    }

    function pokemonMatchesCustomToggle(ctx, original, row, species, kind) {
        switch (kind) {
            case 'fe':
                return isFullyEvolved(species);
            case 'restricted': return isRestrictedInFormat(ctx, species);
            case 'legendary':
            case 'boxlegend':
            case 'mythical':
            case 'paradox':
            case 'eeveelution':
                return speciesInGroup(species, kind);
            case 'recovery':
            case 'pivot':
            case 'priority':
            case 'removal':
            case 'hazards':
            case 'selfko':
                return canLearnAnyToggleMove(ctx, original, row, species, kind);
            default:
                return true;
        }
    }

    // A native suggestion row colliding with one of our keywords ("natdex" is
    // also a real tier/format id) must be dropped from native results.
    const isReservedToggleCollisionRow = (row) =>
    !!row && Object.prototype.hasOwnProperty.call(CUSTOM_TOGGLE_FILTERS, toSearchId(row[1]));

    // Suggestion rows for toggles that loosely prefix-match the query. Reuses
    // the 'ability' row type; the displayed text is swapped in by the
    // getResultName/renderRow patches below.
    const CUSTOM_TOGGLE_ALIASES = {
        realbulk: ['totalbulk', 'bulk'],
        ce: ['crossevo', 'evos', 'evo', 'evolutions', 'crossevolution', 'cross evolution', 'showevo', 'crosses'],
        fulllist: ['full list', 'fullce', 'all cross evolutions', 'all combos', 'all combinations', 'all evolutions'],
        selfko: ['self ko', 'self-ko', 'self destruct', 'suicide'],
        stage1: ['1', 'stage 1', 'firststage', '1ststage', 'first stage'],
        stage2: ['2', 'stage 2', 'secondstage', '2ndstage', 'second stage'],
        stage3: ['3', 'stage 3', 'thirdstage', '3rdstage', 'third stage'],
    };
    const NO_NEGATE_TOGGLES = new Set(['realbulk', 'ce', 'stage1', 'stage2', 'stage3', 'fulllist']);

    function customToggleSuggestions(query, negated = false) {
        const q = toSearchId(query);
        const rows = [];

        const ceAvailable = getActiveMods().includes(MOD.CROSS_EVOLUTION);
        for (const [key, label] of Object.entries(CUSTOM_TOGGLE_FILTERS)) {
            if (['ce', 'stage1', 'stage2', 'stage3', 'fulllist'].includes(key) && !ceAvailable) continue;
            if (negated && NO_NEGATE_TOGGLES.has(key)) continue;
            const names = [key, label, ...(CUSTOM_TOGGLE_ALIASES[key] || [])].map(toSearchId);
            if (!q || names.some((n) => n.startsWith(q))) {
                rows.push([
                    'ability',
                    CUSTOM_TOGGLE_PREFIX + key,
                    0,
                    prefixMatchEnd(label, query),
                ]);
            }
        }
        return rows;
    }

    // Mirrors DexSearch#addFilter's per-type normalization.
    function normalizePokemonFilterValue(engine, type, value) {
        if (type === 'color') return pokemonColorName(value);
        if (type === 'type' || type === 'weak' || type === 'resists') return engine.capitalizeFirst(value);
        if (type === 'move') return toID(value);
        if (type === 'ability') return engine.dex.abilities.get(value).name;
        if (type === 'tier') {
            const tierTable = {uber: 'Uber', caplc: 'CAP LC', capnfe: 'CAP NFE'};
            const id = toID(value);
            return tierTable[id] || id.toUpperCase();
        }
        if (CUSTOM_TOGGLE_FILTERS[type]) return CUSTOM_TOGGLE_FILTERS[type];
        return value;
    }

    // Pushes a filter chip (deduped). Used by both Pokémon and move search.
    function pushFilterChip(engine, storedType, value) {
        if (!engine.filters) engine.filters = [];
        if (!engine.filters.some((f) => f[0] === storedType && f[1] === value)) {
            engine.filters.push([storedType, value]);
        }
        engine.results = null;
        return true;
    }

    const resetPokemonModes = (engine) => {
        engine.__qolEffectivenessMode = null;
        engine.__qolNegateMode = false;
    };

    // A negated and a positive filter of the same type/value are distinct chips.
    function pushPokemonFilter(engine, type, value, negated) {
        if (engine.sortCol === type) engine.sortCol = null;
        pushFilterChip(engine, negated ? negatedFilterType(type) : type, value);
        resetPokemonModes(engine);
        return true;
    }

    function addPokemonSearchFilter(engine, type, value, negated) {
        if (EFFECT_LABELS[type]) {
            const target = engine.capitalizeFirst(value);
            if (!window.BattleTypeChart?.[toID(target)]) return false;
            return pushPokemonFilter(engine, type, target, negated);
        }
        if (!ALLOWED_POKEMON_FILTER_TYPES.includes(type)) return false;
        if (type === 'color' && (!isMonoColorSearch(engine) || !pokemonColorName(value))) return false;

        return pushPokemonFilter(engine, type, normalizePokemonFilterValue(engine, type, value), negated);
    }

    function resolveTypeName(dex, text) {
        const id = toSearchId(text);
        if (!id) return null;

        for (const typeName of Object.keys(window.BattleTypeChart || {})) {
            if (toSearchId(typeName) === id) return typeName;
        }

        const type = dex?.types?.get?.(text);
        return type?.exists || type?.name ? type.name || text : null;
    }

    function pokemonMatchesEffectiveness(dex, species, searchKind, target) {
        if (!species?.types?.length) return false;

        const typeChart = window.BattleTypeChart;
        if (!typeChart) return false;

        const move = dex?.moves?.get?.(target);
        const attackingType = move?.exists ? move.type : resolveTypeName(dex, target);
        if (!attackingType) return false;

        // BattleTypeChart's outer keys are lowercase ids, damageTaken keys are capitalized.
        const attackingTypeName = capitalize(attackingType);
        let effectiveness = 1;

        for (const defenderType of species.types) {
            const chartValue = typeChart[toSearchId(defenderType)]?.damageTaken?.[attackingTypeName];
            if (chartValue === undefined) return false;

            // damageTaken: 0 neutral, 1 super-effective, 2 resisted, 3 immune
            if (chartValue === 3) {
                effectiveness = 0;
                break;
            }
            if (chartValue === 1) effectiveness *= 2;
            else if (chartValue === 2) effectiveness *= 0.5;
        }

        if (searchKind === 'weak') return effectiveness > 1;
        if (searchKind === 'resists') return effectiveness < 1;
        if (searchKind === 'neutral') return effectiveness === 1;
        return false;
    }

    // Does `species` satisfy one (non-negated) filter?
    function pokemonFilterMatches(search, original, row, species, type, target) {
        if (type === 'ce' || type === 'stage1' || type === 'stage2' || type === 'stage3') {
            if (!modsForSearch(search).includes(MOD.CROSS_EVOLUTION)) return false;
            const stage = crossEvolutionStage(search.dex, species);
            if (type === 'ce') return !!crossEvolutionDelta(search.dex, species);
            return stage === Number(type.slice(-1));
        }
        if (type === 'color') return isMonoColorSearch(getEngine()) && pokemonColorName(species.color) === pokemonColorName(target);
        if (type === 'natdex' || type === 'hackmons') return pokemonFormatPool(search, type).ids.has(species.id);
        if (EFFECT_LABELS[type]) return pokemonMatchesEffectiveness(search.dex, species, type, target);
        if (type === 'into') return !!crossEvolveView(search.dex, species, target);
        if (type === 'from') return !!crossEvolveView(search.dex, search.dex.species.get(target), species.id);
        if (CUSTOM_TOGGLE_FILTERS[type]) return pokemonMatchesCustomToggle(search, original, row, species, type);
        if (type === 'move') return pokemonMatchesMove(search, original, row, species, target);
        if (type === 'ability') return pokemonMatchesProvider(search, original, row, species, type, target);
        // type / ability / egggroup / tier: reuse native logic
        return original.call(search, row, [[type, target]]);
    }

    function patchPokemonFilter() {
        return patchMethod(window.BattlePokemonSearch?.prototype, 'filter', '__qolEffectivenessPatched', (original) =>
                           function (row, filters) {
            if (!filters?.length) return original.call(this, row, filters);
            if (row[0] !== 'pokemon') return true;

            const species = this.dex.species.get(row[1]);
            if (!species?.exists) return false;

            // Active call owns the freshest filters, regardless of how the
            // parent's filter UI commits chip state. Avoid leaking context.
            const previousFilters = this.__qolActiveFilters;
            this.__qolActiveFilters = filters;
            try {
            // Stone chip: judge every other filter on the stone-modified mon.
            const stoneId = filters.find((f) => f[0] === 'stone')?.[1];
            const view = stoneId ? mnmStoneView(this.dex, species, stoneId) : null;
            const judged = view
            ? Object.assign({}, species, {types: view.types, abilities: view.abilities || species.abilities})
            : species;

            for (const [rawType, target] of filters) {
                const negated = isNegatedFilterType(rawType);
                const type = baseFilterType(rawType);

                // Pool chips are membership filters, including their negated forms.
                if (type === 'stone' || type === 'realbulk') continue;

                let matches;
                if (view && type === 'type') {
                    matches = judged.types.includes(target);
                } else if (view && view.abilities && type === 'ability') {
                    matches = Object.values(view.abilities).some((a) => toID(a) === toID(target));
                } else {
                    matches = pokemonFilterMatches(this, original, row, judged, type, target);
                }
                if (negated ? matches : !matches) return false;
            }

            return true;
            } finally {
                this.__qolActiveFilters = previousFilters;
            }
        }
                          );
    }

    // ---------- Pokémon search results: one getResults wrapper ----------
    //   before: remember into/from chips, select the native format pool
    //   after:  apply server banlist, then Godly Gift legality

    // Moves rows matching `isBanned` into the "Illegal results" section (created if the
    // native one doesn't exist) and records why, so they stay visible but greyed out.
    function moveBannedToIllegal(search, rows, isBanned, reasonFor) {
        const illegalIdx = rows.findIndex((r) => r[0] === 'header' && /illegal/i.test(String(r[1])));
        const legal = [];
        const moved = [];

        rows.forEach((row, i) => {
            const inLegalZone = illegalIdx < 0 || i < illegalIdx;
            if (inLegalZone && row[0] === 'pokemon' && isBanned(search.dex.species.get(row[1]))) {
                moved.push(row);
            } else {
                legal.push(row);
            }
        });
        if (!moved.length) return rows;

        if (!search.illegalReasons) search.illegalReasons = {};
        for (const row of moved) {
            search.illegalReasons[row[1]] = reasonFor(search.dex.species.get(row[1]));
        }

        return dropEmptyHeaders(
            illegalIdx < 0
            ? legal.concat([['header', TL(['Illegal results'])], ...moved])
            : legal.concat(moved)
        );
    }

    // Read tiers through PS itself: headers omit banned species and can say
    // "OU by technicality", which is not a tier id.
    function natdexTierMap(search) {
        if (!search?.dex) return null;
        const pool = pokemonFormatPool(search, 'natdex');
        if (pool.tiers) return pool.tiers;
        const map = new Map();
        for (const id of Object.keys(window.BattlePokedex || {})) {
            map.set(id, toID(pool.search.getTier(pool.search.dex.species.get(id))));
        }
        return (pool.tiers = map);
    }

    function formatSpeciesTier(search, species) {
        const dex = search?.dex || getActiveTeambuilderRoom()?.curTeam?.dex;
        const formatSpecies = dex?.species?.get(species.id);
        return toID(formatSpecies?.exists ? formatSpecies.tier : species.tier);
    }

    function applyGenericBans(search, results) {
        const banFormat = getActiveTeambuilderRoom()?.curTeam?.format || search.format;
        const bans = getMergedBansForFormat(banFormat);
        if (!bans) return results;
        const natdexFormat = fmtHas(banFormat, 'natdex', 'nationaldex');
        const tierMap = natdexFormat ? natdexTierMap(search) : null;
        const formatTier = (sp) => natdexFormat ? (tierMap?.get(sp.id) || '') : formatSpeciesTier(search, sp);
        const pokebilities = isPokebilitiesFormat(banFormat);
        const reason = (sp) => {
            if (isBannedByList(bans, sp, false, formatTier(sp))) return 'Banned';
            if (!pokebilities) return null;
            const ability = nativeBannedAbility(bans, sp);
            if (ability) return `Banned ability: ${ability}`;
            const combo = nativeBannedCombo(bans, sp);
            return combo ? `Banned ability combination: ${combo}` : null;
        };
        // Reclassify ALL matching rows, including those already in the native
        // 'Illegal results' bucket. Previously Sneasel in Cross Evolution
        // stayed 'Illegal' even though it was explicitly banned by the server.
        const allowed = [];
        const blocked = [];
        const seen = new Set();
        if (!search.illegalReasons) search.illegalReasons = {};
        for (const row of results) {
            if (row[0] !== 'pokemon') {
                allowed.push(row);
                continue;
            }
            const sp = search.dex.species.get(row[1]);
            const why = reason(sp);
            if (why) {
                if (!seen.has(row[1])) blocked.push(row);
                seen.add(row[1]);
                search.illegalReasons[row[1]] = why;
            } else {
                allowed.push(row);
            }
        }
        if (!blocked.length) return results;
        // The native illegal bucket is kept for truly unavailable species;
        // explicit bans are separated into a labeled 'Banned' section.
        const sections = splitIntoSections(allowed)
            .filter((s) => s.rows.length || s.header?.[1] === 'Banned');
        const clean = sections.flatMap((sec) => (sec.header ? [sec.header, ...sec.rows] : sec.rows));
        return [...clean, ['header', 'Banned'], ...blocked];
    }

    // Cross Evolution's restricted species are legal as ordinary Pokemon but
    // cannot be chosen as cross-evolution donors. Gather them in their own
    // section, regardless of whether a native search originally put them under
    // a tier, the Illegal pool, or the CE donor pool. This also works after
    // native text search and filters have already narrowed the result rows.
    function groupCrossEvolutionRestricted(search, rows) {
        if (!modsForSearch(search).includes(MOD.CROSS_EVOLUTION)) return rows;
        const format = getActiveTeambuilderRoom()?.curTeam?.format || search.format;
        const bans = getMergedBansForFormat(format);
        if (!bans || (!bans.restricted.size && !bans.restrictedBase.size)) return rows;
        const normal = [], restricted = [], banned = [], illegal = [];
        const seen = new Set();
        let section = 'normal';
        let pendingHeader = null;
        const addNormal = (row) => {
            if (pendingHeader) { normal.push(pendingHeader); pendingHeader = null; }
            normal.push(row);
        };
        for (const row of rows) {
            if (row[0] === 'header') {
                const heading = String(row[1]);
                if (/^restricted(?:\b|\s*\()/i.test(heading)) section = 'restricted';
                else if (/^banned(?:\b|\s*\()/i.test(heading)) section = 'banned';
                else if (/illegal/i.test(heading)) section = 'illegal';
                else { section = 'normal'; pendingHeader = row; }
                continue;
            }
            if (row[0] !== 'pokemon') {
                if (section === 'normal') addNormal(row);
                continue;
            }
            const id = row[1];
            if (seen.has(id)) continue;
            seen.add(id);
            const species = search.dex.species.get(id);
            const baseId = toID(species.baseSpecies || species.name);
            const isBanned = isBannedByList(bans, species);
            const isRestricted = !isBanned && (bans.restricted.has(id) || bans.restrictedBase.has(baseId));
            if (isBanned || section === 'banned') {
                banned.push(row);
                if (search.illegalReasons) search.illegalReasons[id] = 'Banned';
            } else if (isRestricted) {
                restricted.push(row);
                // Restricted describes a donor limitation, not an illegal base.
                if (search.illegalReasons && ['Illegal', 'Restricted'].includes(search.illegalReasons[id])) {
                    delete search.illegalReasons[id];
                }
            } else if (section === 'illegal') {
                illegal.push(row);
            } else {
                addNormal(row);
            }
        }
        // Keep sorted/filtered legal rows intact, then append the special
        // sections in the same order regardless of the native header layout.
        return [
            ...dropEmptyHeaders(normal),
            ...(restricted.length ? [['header', 'Restricted'], ...restricted] : []),
            ...(banned.length ? [['header', 'Banned'], ...banned] : []),
            ...(illegal.length ? [['header', 'Illegal results'], ...illegal] : []),
        ];
    }

    // Godly Gift: other Restricted mons move to an "Illegal results" section.
    function applyGodlyGiftLegality(search, results) {
        if (!modsForSearch(search).includes(MOD.GODLY_GIFT)) return results;

        const room = getTeambuilderRoom();
        const isIllegal = room && getGodlyGiftIllegalChecker(room);
        if (!isIllegal) return results;

        return moveBannedToIllegal(search, results, isIllegal, () => 'Only one restricted Pokémon is allowed');
    }

    // Build a separate native search so PS initializes formatType and generation
    // correctly without changing the team's format or the live search's Dex.
    const pokemonFormatPoolCache = new WeakMap();
    function pokemonFormatPool(search, kind) {
        const gen = search.dex.gen;
        const hasNatdexTable = !!window.BattleTeambuilderTable?.[`gen${gen}natdex`];
        // This chip selects a dex, not the National Dex OU banlist. AG includes
        // every standard tier; the team's actual format bans still apply later.
        const format = `gen${gen}${kind === 'natdex'
            ? (hasNatdexTable ? 'nationaldexag' : 'anythinggoes') : 'purehackmons'}`;
        let cache = pokemonFormatPoolCache.get(search);
        if (!cache || cache.dex !== search.dex || cache.table !== window.BattleTeambuilderTable) {
            cache = {dex: search.dex, table: window.BattleTeambuilderTable, pools: new Map()};
            pokemonFormatPoolCache.set(search, cache);
        }
        if (!cache.pools.has(format)) {
            const native = new window.BattlePokemonSearch('pokemon', format);
            const rows = native.getBaseResults();
            cache.pools.set(format, {
                search: native, rows,
                ids: new Set(rows.filter((row) => row[0] === 'pokemon').map((row) => row[1])),
            });
        }
        return cache.pools.get(format);
    }

    // The native search does not parse custom rules or server-side /formathelp.
    // For named Megamons formats, the whitelist only becomes available once the
    // corresponding formathelp response is verified; for imported @@@ formats,
    // explicit +Mega tokens are available immediately.
    function megamonsLegalMegaIds(format, dex = window.Dex) {
        if (!isConvergenceMegamons(format)) return new Set();
        const bans = getMergedBansForFormat(format);
        const allowed = new Set(explicitlyUnbannedForms(format));
        if (bans) for (const id of bans.unbanned) allowed.add(id);
        const result = new Set();
        for (const id of allowed) {
            if (!/-?mega(?:[a-z0-9]+)?$/.test(id)) continue;
            const sp = dex?.species?.get(id);
            if (!sp?.exists || !window.BattlePokedex?.[sp.id]) continue;
            // This is a species/forme whitelist, not permission to use all
            // nonstandard Pokemon or otherwise banned forms.
            if (bans && isBannedByList(bans, sp)) continue;
            result.add(sp.id);
        }
        return result;
    }

    function patchPokemonSearchResults() {
        patchMethod(window.BattlePokemonSearch?.prototype, 'getBaseResults', '__qolUnbannedPoolPatched', (original) =>
            function () {
                const rows = original.call(this);
                const format = getActiveTeambuilderRoom()?.curTeam?.format || this.format;
                const bans = getMergedBansForFormat(format);
                const isMegaConv = isConvergenceMegamons(format);
                const explicit = isMegaConv ? explicitlyUnbannedForms(format) : new Set();
                const legalMegas = megamonsLegalMegaIds(format, this.dex);
                const crossEvo = modsForSearch(this).includes(MOD.CROSS_EVOLUTION);
                const restricted = crossEvo && !!(bans?.restricted?.size || bans?.restrictedBase?.size);
                if (!legalMegas.size && !explicit.size && !bans?.unbanned?.size && !bans?.unbannedBase?.size && !restricted) return rows;
                const have = new Set(rows.filter((r) => r[0] === 'pokemon').map((r) => r[1]));
                const unbannedExtra = [];
                const restrictedExtra = [];
                for (const id of Object.keys(window.BattlePokedex || {})) {
                    const sp = this.dex.species.get(id);
                    if (!sp?.exists || have.has(id)) continue;
                    const baseId = toID(sp.baseSpecies || sp.name);
                    // Cross Evolution's Restricted species are legal BASES;
                    // only using them as a nickname donor is forbidden.
                    const restrictedBase = restricted &&
                        (bans.restricted.has(id) || bans.restrictedBase.has(baseId));
                    const explicitlyAllowed = legalMegas.has(id) || explicit.has(id) ||
                        bans?.unbanned?.has(id) || bans?.unbannedBase?.has(baseId);
                    const allowed = restrictedBase || explicitlyAllowed;
                    if (sp.gen > this.dex.gen && !allowed) continue;
                    if (allowed && (!bans || !isBannedByList(bans, sp))) {
                        (restrictedBase ? restrictedExtra : unbannedExtra).push(['pokemon', id]);
                    }
                }
                return [...rows,
                    ...(unbannedExtra.length ? [['header', 'Explicitly unbanned'], ...unbannedExtra] : []),
                    ...(restrictedExtra.length ? [['header', 'Restricted'], ...restrictedExtra] : []),
                ];
            });
        patchMethod(window.BattlePokemonSearch?.prototype, 'getTier', '__qolPoolTierPatched', (original) =>
            function (species) {
                return this.__qolPokemonPool
                    ? this.__qolPokemonPool.search.getTier(species) : original.call(this, species);
            });
        return patchMethod(window.BattlePokemonSearch?.prototype, 'getResults', '__qolPokemonResultsPatched', (original) =>
                           function (filters, sortCol, reverseSort) {
            if (this.searchType !== 'pokemon') return original.call(this, filters, sortCol, reverseSort);
            const providerRoom = getActiveTeambuilderRoom();
            const providerFormat = providerRoom?.curTeam?.format || this.format;
            const providerKey = JSON.stringify([providerFormat, providerRoom?.curSet,
                providerRoom?.curSetList?.map((set) => [set.species, set.moves])]);
            if (this.__qolProviderKey !== providerKey) {
                this.__qolProviderKey = providerKey;
                this.__qolProviderPools = null;
            }
            this.__qolProviderBans = getMergedBansForFormat(providerFormat);

            if (modsForSearch(this).includes(MOD.CROSS_EVOLUTION) &&
                Array.isArray(filters) && filters.some(([type]) => type === 'fulllist')) {
                this.__qolCeFullMode = true;
                this.illegalReasons = {};
                return ceFullResults(this, filters, sortCol, reverseSort);
            }
            this.__qolCeFullMode = false;

            // A named format's server reply can change its Mega legality AFTER
            // the native search has computed baseResults/baseIllegalResults.
            // Clear BOTH caches before calling its getResults, otherwise a
            // newly legal Mega remains in the native "Illegal results" bucket.
            const legalMegas = megamonsLegalMegaIds(providerFormat, this.dex);
            const megaKey = `${providerFormat}|${[...legalMegas].sort().join(',')}`;
            if (this.__qolMegamonsLegalKey !== megaKey) {
                this.__qolMegamonsLegalKey = megaKey;
                clearSearchCache(this);
            }

            // Remember the active into/from chips for sort().
            const findChip = (kind) => {
                const f = Array.isArray(filters) ? filters.find((e) => e[0] === kind) : null;
                return f ? f[1] : null;
            };
            this.__qolIntoId = findChip('into');
            this.__qolFromId = findChip('from');
            this.__qolStoneId = findChip('stone');
            this.__qolRealBulk = Array.isArray(filters) && filters.some((f) => f[0] === 'realbulk');
            // `sort` is a method of BattlePokemonSearch, NOT the outer DexSearch.
            // Keep the display mode here before calling Showdown's native getResults.
            this.__qolShowEvo = Array.isArray(filters) && filters.some(([type]) => type === 'ce');
            this.__qolCeStage = Array.isArray(filters)
                ? Number(filters.find(([type]) => ['stage1', 'stage2', 'stage3'].includes(type))?.[0].slice(-1)) || 0 : 0;
            this.__qolTypemons = modsForSearch(this).includes(MOD.TYPEMONS)
                ? typemonsType(getActiveTeambuilderRoom(), this) : null;

            // A CE browsing chip switches to the eligible evolution-target
            // pool; unlike the ordinary CE base-species list, this contains
            // Stage 2 and Stage 3 donor species and displays /showevo deltas.
            // Keep the pool separate so removing the chip restores the native list.
            const ceDonorBrowse = modsForSearch(this).includes(MOD.CROSS_EVOLUTION) &&
                Array.isArray(filters) && filters.some(([type]) => ['ce', 'stage1', 'stage2', 'stage3'].includes(type));
            const poolKind = ['natdex', 'hackmons'].find((kind) =>
                Array.isArray(filters) && filters.some(([type]) => type === kind)) || null;
            const pool = poolKind ? pokemonFormatPool(this, poolKind) : null;
            if (this.__qolPokemonPool !== pool) {
                clearSearchCache(this);
                this.__qolPokemonPool = pool;
            }
            if (pool && !this.baseResults) this.baseResults = pool.rows;
            if (ceDonorBrowse) {
                if (!this.__qolCeDonorRows || this.__qolCeDonorKey !== providerFormat) {
                    this.__qolCeDonorKey = providerFormat;
                    this.__qolCeEffectiveRules = null;
                    this.__qolCeDonorRows = [['header', 'Cross Evolution Donors']];
                    for (const id of Object.keys(window.BattlePokedex || {})) {
                        const sp = this.dex.species.get(id);
                        if (!sp?.exists || sp.id !== id || !crossEvolutionStage(this.dex, sp) || sp.battleOnly) continue;
                        // Keep banned/restricted targets visible for their
                        // correct labels, but never include cross-gen/CAP/etc.
                        const rules = this.__qolCeEffectiveRules ||
                            (this.__qolCeEffectiveRules = resolveClauseRules(this.__qolProviderBans || emptyBanSections(), providerFormat));
                        const natdex = isNationalDexFormat(providerFormat) || rules.has('natdexmod');
                        if (sp.gen > this.dex.gen || sp.isNonstandard === 'Future' ||
                            (sp.isNonstandard === 'Past' && !natdex) ||
                            (sp.isNonstandard === 'CAP' && !rules.has('+tag:cap')) ||
                            (sp.isNonstandard === 'Unobtainable' && sp.tier === 'Unreleased')) continue;
                        this.__qolCeDonorRows.push(['pokemon', id]);
                    }
                }
                if (this.__qolCeDonorPool !== this.__qolCeDonorRows) {
                    clearSearchCache(this);
                    this.__qolCeDonorPool = this.__qolCeDonorRows;
                }
                this.baseResults = this.__qolCeDonorRows;
                this.baseIllegalResults = [];
            } else if (this.__qolCeDonorPool) {
                this.__qolCeDonorPool = null;
                clearSearchCache(this);
                if (pool) this.baseResults = pool.rows;
            }

            // Dynamic bans must not stick after a team/rule change. Keep the
            // client's native reasons separately from reasons added below.
            if (this.baseIllegalResults && this.__qolIllegalPool === this.baseIllegalResults) {
                this.illegalReasons = {...this.__qolNativeIllegalReasons};
            }

            let results = original.call(this, filters, sortCol, reverseSort);
            if (!Array.isArray(results)) return results;
            if (this.__qolIllegalPool !== this.baseIllegalResults) {
                this.__qolIllegalPool = this.baseIllegalResults;
                this.__qolNativeIllegalReasons = {...this.illegalReasons};
            }
            if (isMnmSearch(this)) {
                results = dropEmptyHeaders(results.filter(
                    (r) => r[0] !== 'pokemon' || !requiresHeldItem(this.dex.species.get(r[1]))
                ));
            }

            results = applyGenericBans(this, results);
            results = groupCrossEvolutionRestricted(this, results);
            return applyGodlyGiftLegality(this, results);
        }
                          );
    }

    const STONE_SORT = {lead: 150, ability: 118}; // px: icon+name columns, ability column (match the rows)

    function renderItemSortRow(ui) {
        const sortCol = ui.engine?.sortCol;
        const stat = (key, text) =>
        `<button class="sortcol statsortcol${sortCol === key ? ' cur' : ''}" data-qol-sort="${key}">${text}</button>`;

        return '<li class="result"><div class="sortrow">' +
            stat('hp', 'HP') + stat('atk', 'Atk') + stat('def', 'Def') +
            stat('spa', 'SpA') + stat('spd', 'SpD') + stat('spe', 'Spe') + stat('bst', 'BST') +
            '</div></li>';
    }

    // Puts the sort row above the item results (after sorting, so it never gets sorted away).
    function patchItemSearchSortRow() {
        patchMethod(window.BattleItemSearch?.prototype, 'getResults', '__qolItemSortRowPatched', (original) =>
                    function (...args) {
            const results = original.apply(this, args);
            if (!Array.isArray(results) || !isMnmSearch(this)) return results;
            if (!(this.set?.species || getActiveTeambuilderRoom()?.curSet?.species)) return results;
            if (results.some((r) => r[0] === 'html' && String(r[1]).includes('qol-itemsortrow'))) return results;
            return [['html', ITEM_SORT_ROW_HTML], ...results];
        }
                   );
        return true;
    }

    // Fortemons lets a Pokémon hold one of its naturally learned attacking moves
    // as its Forte. Use the ordinary generation learnset table here, rather than
    // the active move-search provider (which may include moves from stacked OMs).
    function fortemonsNativeMoveIds(dex, species) {
        const T = window.BattleTeambuilderTable || {};
        const genTable = T['gen' + (dex?.gen || 9)]?.learnsets;
        const table = genTable || T.learnsets;
        if (!table || !species?.exists) return [];

        const keys = [];
        const seenSpecies = new Set();
        let cur = species;
        while (cur?.exists && !seenSpecies.has(cur.id)) {
            seenSpecies.add(cur.id);
            keys.push(cur.id, toID(cur.baseSpecies || cur.name));
            for (const b of [].concat(cur.battleOnly || [])) keys.push(toID(b));
            cur = cur.prevo ? dex.species.get(cur.prevo) : null;
        }

        const ids = new Set();
        for (const key of keys) {
            const learnset = table[key];
            if (learnset) for (const [id, entry] of Object.entries(learnset)) {
                if (entry) ids.add(id);
            }
        }

        return [...ids].filter((id) => {
            const move = dex.moves.get(id);
            const raw = window.BattleMovedex?.[id] || {};
            if ((!move?.exists && !raw.num) || (move?.gen ?? raw.gen ?? 0) > dex.gen) return false;
            // Fortemons uses damaging moves; its legality rules handle bans.
            if ((move?.category || raw.category) === 'Status') return false;
            const nonstandard = move?.isNonstandard ?? raw.isNonstandard;
            return !['LGPE', 'Unobtainable', 'CAP', 'Gigantamax', 'Past', 'Future'].includes(nonstandard);
        });
    }

    // Expose every native damaging move in the item chooser. Search rows use
    // Showdown's normal move renderer, so users see type/category/power/details.
    function patchItemSearchFortemons() {
        return patchMethod(window.BattleItemSearch?.prototype, 'getBaseResults', '__qolFortemonsItemsPatched', (original) =>
                           function (...args) {
            const results = original.apply(this, args);
            if (!Array.isArray(results) || !modsForSearch(this).includes(MOD.FORTEMONS)) return results;

            const moves = [];
            const seen = new Set(results.filter((row) => row[0] === 'item').map((row) => row[1]));
            const species = this.dex.species.get(this.species || this.set?.species);
            for (const id of fortemonsNativeMoveIds(this.dex, species)) {
                if (seen.has(id)) continue;
                seen.add(id);
                moves.push(['move', id]);
            }
            return moves.length ? [['header', 'Fortemons (naturally learned moves)'], ...moves, ...results] : results;
        });
    }

    // ====================================================================
    // 14. MOVE SEARCH FILTERS
    //
    // Type the keyword with no prefix ("sf", "dance", "stab"...), pick the
    // suggestion at the top, and it becomes a filter chip. Chips AND together
    // and combine with the native Type / Category / Pokémon filters.
    // ====================================================================

    const MOVE_FILTER_TYPE = 'mv-';
    const MOVE_ROW_PREFIX = 'mvf ';
    const COVERAGE_PREFIX = 'Coverage ';

    // ---------- raw move data helpers ----------

    // Client Move objects don't carry every field, so fall back to raw dex data.
    // Client Move objects drop fields like `boosts` and `self`, so prefer the raw
    // BattleMovedex entry and only use the Move object if there isn't one.
    const rawMove = (move, dex) => {
        const id = move?.id;
        return (id && window.BattleMovedex?.[id]) ||
            (id && dex?.moves?.get?.(id)) ||
            {};
    };
    const moveField = (move, key, dex) => move?.[key] ?? rawMove(move, dex)[key];
    const moveFlag = (move, flag) => !!moveField(move, 'flags')?.[flag];
    const isDamaging = (move) => move.category !== 'Status';
    const secondariesOf = (move) =>
    [].concat(moveField(move, 'secondaries') || [], moveField(move, 'secondary') || []).filter(Boolean);
    const hasSecondary = (move) => secondariesOf(move).length > 0;

    // The mon's current typing, including Camomons / Mix and Mega / Cross Evolution.
    function currentTypes(search) {
        const set = search.set;
        const key = [search.species, set?.species, set?.item, set?.name, ...(set?.moves || []).slice(0, 2)].join('|');
        if (search.__qolTypesKey === key) return search.__qolTypes;

        let types = null;
        if (set?.species) {
            types = modifiedTypes(getActiveMods(getActiveTeambuilderRoom()), search.dex, set);
        }
        if (!types?.length) {
            types = search.dex.species.get(search.species || set?.species)?.types || [];
        }

        search.__qolTypesKey = key;
        search.__qolTypes = types;
        return types;
    }

    // Callback-based moves have no usable data in the client dex, so list them.
    const ALWAYS_CRIT_MOVES = setOf('frostbreath stormthrow wickedblow surgingstrikes flowertrick');
    const PHAZE_MOVES = setOf('whirlwind roar dragontail circlethrow');
    const EXTRA_RECOIL_MOVES = setOf('mindblown steelbeam chloroblast highjumpkick supercellslam axekick');
    const HAZARD_MOVES = setOf('spikes toxicspikes stealthrock stickyweb ceaselessedge stoneaxe');
    const HAZARD_CONDITIONS = setOf('spikes toxicspikes stealthrock stickyweb');
    const REMOVAL_MOVES = setOf(REMOVAL_MOVE_IDS);
    const PIVOT_MOVES = setOf(PIVOT_MOVE_IDS + ' batonpass');
    const TRAP_MOVES = setOf(
        'block meanlook spiderweb anchorshot spiritshackle thousandwaves jawlock octolock firespin ' +
        'whirlpool wrap bind clamp infestation magmastorm sandtomb snaptrap thundercage fairylock'
    );
    const TRAP_VOLATILES = setOf('partiallytrapped trapped octolock');
    const REDIRECT_MOVES = setOf('followme ragepowder spotlight');
    const SELF_KO_MOVES = setOf('explosion selfdestruct mistyexplosion memento finalgambit healingwish lunardance');
    const CURE_STATUS_MOVES = setOf(
        'aromatherapy healbell refresh rest junglehealing lunarblessing takeheart sparklingaria ' +
        'smellingsalts wakeupslap purify healingwish lunardance'
    );
    const SPREAD_TARGETS = new Set(['allAdjacentFoes', 'allAdjacent']);
    const FOE_TARGETS = new Set(['normal', 'any', 'adjacentFoe', 'allAdjacentFoes', 'allAdjacent']);
    const isSpreadMove = (m) => SPREAD_TARGETS.has(moveField(m, 'target'));
    // Hits foes AND isn't stopped by Protect (no `protect` flag, or breaksProtect like Feint/Phantom Force)
    const bypassesProtect = (m) =>
    FOE_TARGETS.has(moveField(m, 'target')) &&
          (!moveFlag(m, 'protect') || !!moveField(m, 'breaksProtect'));

    // ---------- status infliction ----------

    const STATUS_NAMES = {brn: 'burn', par: 'paralyze', slp: 'sleep', psn: 'poison', tox: 'poison', frz: 'freeze'};
    const EXTRA_STATUS_MOVES = {
        triattack: ['burn', 'paralyze', 'freeze'],
        direclaw: ['poison', 'paralyze', 'sleep'],
        yawn: ['sleep'],
        mortalspin: ['poison'],
    };

    // Statuses the move can put on the TARGET (Rest etc. are excluded).
    function inflictedStatuses(move) {
        const out = new Set();
        const add = (st) => { if (STATUS_NAMES[st]) out.add(STATUS_NAMES[st]); };

        if (moveField(move, 'target') !== 'self') add(moveField(move, 'status'));
        for (const s of secondariesOf(move)) add(s.status);
        for (const n of EXTRA_STATUS_MOVES[move.id] || []) out.add(n);
        return out;
    }

    // ---------- stat changes ----------

    const BOOST_STAT_KEYS = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion'];

    const SELF_BOOST_TARGETS = new Set(['self', 'allies', 'allySide', 'adjacentAlly', 'adjacentAllyOrSelf']);

    const all = (n) => ({atk: n, def: n, spa: n, spd: n, spe: n});

    // Stat changes on the user (or an ally, e.g. Coaching / Aromatic Mist)
    const BOOST_OVERRIDES = {
        acidarmor: {def: 2}, agility: {spe: 2}, amnesia: {spd: 2}, ancientpower: all(1),
        aquastep: {spe: 1}, aromaticmist: {spd: 1}, aurawheel: {spe: 1}, autotomize: {spe: 2},
        barrier: {def: 2}, bellydrum: {atk: 12}, bulkup: {atk: 1, def: 1}, calmmind: {spa: 1, spd: 1},
        charge: {spd: 1}, chargebeam: {spa: 1}, clangoroussoul: all(1), clangoroussoulblaze: all(1),
        coaching: {atk: 1, def: 1}, coil: {atk: 1, def: 1, accuracy: 1}, cosmicpower: {def: 1, spd: 1},
        cottonguard: {def: 3}, curse: {atk: 1, def: 1, spe: -1}, defendorder: {def: 1, spd: 1},
        defensecurl: {def: 1}, diamondstorm: {def: 2}, doubleteam: {evasion: 1},
        dragondance: {atk: 1, spe: 1}, esperwing: {spe: 1}, extremeevoboost: all(2),
        fierydance: {spa: 1}, filletaway: {atk: 2, spa: 2, spe: 2}, flamecharge: {spe: 1},
        geargup: {atk: 1, spa: 1}, geomancy: {spa: 2, spd: 2, spe: 2}, growth: {atk: 1, spa: 1},
        harden: {def: 1}, honeclaws: {atk: 1, accuracy: 1}, howl: {atk: 1}, irondefense: {def: 2},
        magneticflux: {def: 1, spd: 1}, meditate: {atk: 1}, metalclaw: {atk: 1}, meteormash: {atk: 1},
        minimize: {evasion: 2}, mysticalpower: {spa: 1}, nastyplot: {spa: 2}, noretreat: all(1),
        ominouswind: all(1), poweruppunch: {atk: 1}, psyshieldbash: {def: 1},
        quiverdance: {spa: 1, spd: 1, spe: 1}, rapidspin: {spe: 1}, rockpolish: {spe: 2},
        scaleshot: {def: -1, spe: 1}, sharpen: {atk: 1}, shellsmash: {atk: 2, def: -1, spa: 2, spd: -1, spe: 2},
        shelter: {def: 2}, shiftgear: {atk: 1, spe: 2}, silverwind: all(1), skullbash: {def: 1},
        steelwing: {def: 1}, stuffcheeks: {def: 2}, swordsdance: {atk: 2}, tailglow: {spa: 3},
        takeheart: {spa: 1, spd: 1}, tidyup: {atk: 1, spe: 1}, torchsong: {spa: 1}, trailblaze: {spe: 1},
        victorydance: {atk: 1, def: 1, spe: 1}, withdraw: {def: 1}, workup: {atk: 1, spa: 1},
        electroshot: {spa: 1}, meteorbeam: {spa: 1},
        // self-lowering attacks
        closecombat: {def: -1, spd: -1}, superpower: {atk: -1, def: -1}, overheat: {spa: -2},
        dracometeor: {spa: -2}, leafstorm: {spa: -2}, fleurcannon: {spa: -2}, psychoboost: {spa: -2},
        makeitrain: {spa: -1}, vcreate: {def: -1, spd: -1, spe: -1}, hammerarm: {spe: -1},
        icehammer: {spe: -1}, dragonascent: {def: -1, spd: -1}, hyperspacefury: {def: -1},
        headlongrush: {def: -1, spd: -1}, spinout: {spe: -2}, clangingscales: {def: -1},
    };

    // Stat changes on the target
    const TARGET_BOOST_OVERRIDES = {
        // raises the target
        swagger: {atk: 2}, flatter: {spa: 1}, decorate: {atk: 2, spa: 2}, spicyextract: {atk: 2, def: -2},
        // lowers the target
        growl: {atk: -1}, leer: {def: -1}, tailwhip: {def: -1}, screech: {def: -2}, charm: {atk: -2},
        featherdance: {atk: -2}, sweetscent: {evasion: -2}, scaryface: {spe: -2}, stringshot: {spe: -2},
        cottonspore: {spe: -2}, babydolleyes: {atk: -1}, confide: {spa: -1}, captivate: {spa: -2},
        eerieimpulse: {spa: -2}, metalsound: {spd: -2}, faketears: {spd: -2}, tickle: {atk: -1, def: -1},
        nobleroar: {atk: -1, spa: -1}, partingshot: {atk: -1, spa: -1}, tearfullook: {atk: -1, spa: -1},
        venomdrench: {atk: -1, spa: -1, spe: -1}, strengthsap: {atk: -1}, memento: {atk: -2, spa: -2},
        playnice: {atk: -1}, kinesis: {accuracy: -1}, sandattack: {accuracy: -1}, smokescreen: {accuracy: -1},
        flash: {accuracy: -1}, tarshot: {spe: -1}, toxicthread: {spe: -1}, defog: {evasion: -1},
    };

    // {self: [boostObjects], target: [boostObjects]}
    function moveBoostEffects(move, dex) {
        const fx = {self: [], target: []};

        // Get the actual move from the active Dex.
        const data = rawMove(move, dex);

        // Direct boosts, e.g. Swords Dance.
        if (data.boosts) {
            if (SELF_BOOST_TARGETS.has(data.target)) {
                fx.self.push(data.boosts);
            } else {
                fx.target.push(data.boosts);
            }
        }

        // Self boost attached to the move.
        if (data.self?.boosts) {
            fx.self.push(data.self.boosts);
        }
        if (data.selfBoost?.boosts) {
            fx.self.push(data.selfBoost.boosts);
        }

        // Secondary effects.
        const secondaries = [
            ...(data.secondaries || []),
            ...(data.secondary ? [data.secondary] : []),
        ];

        for (const secondary of secondaries) {
            if (secondary.boosts) {
                fx.target.push(secondary.boosts);
            }

            if (secondary.self?.boosts) {
                fx.self.push(secondary.self.boosts);
            }
        }

        const selfOverride = BOOST_OVERRIDES[move.id];
        if (selfOverride) fx.self.push(selfOverride);

        const targetOverride = TARGET_BOOST_OVERRIDES[move.id];
        if (targetOverride) fx.target.push(targetOverride);

        return fx;
    }

    const statKeysFor = (stat) =>
    stat === 'stats' ? BOOST_STAT_KEYS : [stat];

    const boostHas = (list, sign, stat) =>
    list.some((b) =>
              statKeysFor(stat).some((k) =>
                                     (b[k] || 0) * sign > 0
                                    )
             );

    const zBoostHas = (move, stat, dex) => {
        const zb = rawMove(move, dex).zMove?.boost;
        return !!zb && statKeysFor(stat).some((k) => (zb[k] || 0) > 0);
    };

    // `short` = the aliases accepted after the family name ("boosts atk").
    // Only the broad boost/drop toggles, not eight per-stat duplicates.
    const STAT_FILTER_STATS = [{key: 'stats', label: 'Stats', short: []}];
    const STAT_FILTER_FAMILIES = [
        {id: 'boosts', label: 'Boosts', who: 'any', sign: 1},
        {id: 'lowers', label: 'Lowers', who: 'self', sign: -1},
        {id: 'lowerstarget', label: 'Lowers Target', who: 'target', sign: -1},
    ];

    function buildStatToggles() {
        const toggles = {};
        for (const fam of STAT_FILTER_FAMILIES) {
            for (const st of STAT_FILTER_STATS) {
                toggles[fam.id + st.key] = {
                    label: `${fam.label} ${st.label}`,
                    aliases: st.short.map((a) => `${fam.label} ${a}`),
                    desc: fam.label + ' stats',
                    test: fam.z
                    ? (m, s) => zBoostHas(m, st.key, s.dex)
                    : (m, s) => {
                        const fx = moveBoostEffects(m, s.dex);
                        const list = fam.who === 'any' ? fx.self.concat(fx.target) : fx[fam.who];
                        return boostHas(list, fam.sign, st.key);
                    },
                };
            }
        }
        return toggles;
    }

    // ---------- toggle definitions ----------

    const flagToggle = (flag, label, desc, aliases = []) =>
    ({label, desc, aliases, test: (m) => moveFlag(m, flag)});
    const listToggle = (ids, label, desc, aliases = []) =>
    ({label, desc, aliases, test: (m) => ids.has(m.id)});
    const statusToggle = (status, label, desc, aliases = []) =>
    ({label, desc, aliases, test: (m) => inflictedStatuses(m).has(status)});

    const CORE_MOVE_TOGGLES = {
        sf: {
            label: 'Sheer Force', aliases: ['sheerforce'],
            desc: 'Damaging moves with a secondary effect',
            test: (m) => isDamaging(m) && hasSecondary(m),
        },
        slicing: flagToggle('slicing', 'Slicing', 'Slicing moves (Sharpness)', ['slice', 'sharpness']),
        recoil: {
            label: 'Recoil', aliases: [],
            desc: 'Moves that cause recoil (incl. Steel Beam, Mind Blown)',
            test: (m) => EXTRA_RECOIL_MOVES.has(m.id) || !!moveField(m, 'recoil') || !!moveField(m, 'mindBlownRecoil'),
        },
        stab: {
            label: 'STAB', aliases: [],
            desc: "Damaging moves matching this Pokémon's current typing",
            test: (m, s) => isDamaging(m) && currentTypes(s).includes(m.type),
        },
        contact: flagToggle('contact', 'Contact', 'Moves that make contact'),
        punch: flagToggle('punch', 'Punch', 'Punching moves (Iron Fist)', ['punching']),
        recovery: flagToggle('heal', 'Recovery', 'Every move boosted by Triage (incl. draining moves)', ['heal', 'triage']),
        crit: {
            label: 'Crit', aliases: ['critical', 'highcrit'],
            desc: 'High crit ratio or always crits',
            test: (m) => ALWAYS_CRIT_MOVES.has(m.id) || moveField(m, 'critRatio') > 1 || !!moveField(m, 'willCrit'),
        },
        dance: flagToggle('dance', 'Dance', 'Dance moves (Dancer)', ['dancing']),
        priority: {
            label: 'Priority', aliases: ['prio'],
            desc: 'Moves with priority above 0',
            test: (m) => m.priority > 0,
        },
        sound: flagToggle('sound', 'Sound', 'Sound moves'),
        phaze: {
            label: 'Phaze', aliases: ['phazing', 'forceswitch'],
            desc: 'Forces the target out',
            test: (m) => PHAZE_MOVES.has(m.id) || !!moveField(m, 'forceSwitch'),
        },
    };

    const UTILITY_MOVE_TOGGLES = {
        bullet: flagToggle('bullet', 'Bullet', 'Ball and bomb moves (Bulletproof)', ['bulletproof']),
        pulse: flagToggle('pulse', 'Pulse', 'Pulse and aura moves (Mega Launcher)', ['megalauncher']),
        powder: flagToggle('powder', 'Powder', 'Powder and spore moves (Overcoat)', ['overcoat']),
        bite: flagToggle('bite', 'Bite', 'Biting moves (Strong Jaw)', ['strongjaw']),
        wind: flagToggle('wind', 'Wind', 'Wind moves (Wind Rider, Wind Power)', ['windrider']),
        assist: flagToggle('noassist', 'Assist Skips', 'Moves Assist cannot call', ['noassist']),
        removal: listToggle(REMOVAL_MOVES, 'Removal', 'Removes entry hazards', ['defog']),
        hazards: {
            label: 'Hazards', aliases: [],
            desc: 'Sets entry hazards',
            test: (m) => HAZARD_MOVES.has(m.id),
        },
        pivot: {
            label: 'Pivot', aliases: [''],
            desc: 'Switches the user out after use',
            test: (m) => PIVOT_MOVES.has(m.id) || !!moveField(m, 'selfSwitch'),
        },
        trapping: {
            label: 'Trapping', aliases: ['trap'],
            desc: 'Prevents the target from switching',
            test: (m) => TRAP_MOVES.has(m.id) || TRAP_VOLATILES.has(moveField(m, 'volatileStatus')),
        },
        redirection: listToggle(REDIRECT_MOVES, 'Redirection', 'Draws attacks toward the user', ['redirect']),
        selfko: {
            label: 'Self KO', aliases: ['suicide', 'selfdestruct'],
            desc: 'The user faints',
            test: (m) => SELF_KO_MOVES.has(m.id) || !!moveField(m, 'selfdestruct'),
        },
        burn: statusToggle('burn', 'Burns', 'Can burn the target'),
        paralyze: statusToggle('paralyze', 'Paralyzes', 'Can paralyze the target', ['para']),
        sleep: statusToggle('sleep', 'Sleeps', 'Can put the target to sleep'),
        poison: statusToggle('poison', 'Poisons', 'Can poison or badly poison the target', ['toxic']),
        freeze: statusToggle('freeze', 'Freezes', 'Can freeze the target'),
        curestatus: listToggle(CURE_STATUS_MOVES, 'Cures Status', 'Cures status conditions'),
        // Swaps the movepool for the National Dex one (see augmentWithNatdexMoves).
        natdex: {
            label: 'National Dex', aliases: ['nationaldex'],
            desc: 'Use the National Dex movepool',
            noNegate: true,
            test: () => true,
        },
        bypass: flagToggle('bypasssub', 'Bypasses Substitute', "Ignores the target's Substitute", ['bypass', 'infiltrator']),

        bypassprotect: {
            label: 'Bypasses Protect',
            aliases: ['bypassprotection', 'bypassesprotection', 'breaksprotect', 'ignoreprotect', ''],
            desc: 'Hits through Protect',
            test: bypassesProtect,
        },
        spread: {
            label: 'Spread', aliases: ['spreadmoves', 'multitarget'],
            desc: 'Hits multiple targets',
            test: isSpreadMove,
        },
        thaws: flagToggle('defrost', 'Thaws', 'Thaws the user when used (Flame Wheel, Scald...)', ['thaw', 'thawing', 'defrost', 'unfreeze']),
    };

    const MOVE_TOGGLES = Object.assign({}, CORE_MOVE_TOGGLES, buildStatToggles(), UTILITY_MOVE_TOGGLES);

    // Normalized names each toggle answers to: key, label, and aliases.
    for (const [key, def] of Object.entries(MOVE_TOGGLES)) {
        def.names = [key, def.label, ...def.aliases].map(toSearchId);
    }

    // ---------- coverage ----------

    const allTypeNames = () =>
    Object.keys(window.BattleTypeChart || {})
    .filter((id) => id !== 'stellar')
    .map((id) => ({id, name: id.charAt(0).toUpperCase() + id.slice(1)}));

    const isCoverageQuery = (raw) => /^coverage(\s|$)/i.test(raw) || /^cov\s/i.test(raw);
    const coverageTypesFromValue = (value) =>
    String(value).replace(/^Coverage\s+/i, '').split('/').filter(Boolean);

    // "coverage fire, steel" -> suggestion rows for the typing being built.
    function coverageSuggestions(raw) {
        const arg = raw.replace(/^(coverage|cov)\s*/i, '');
        const tokens = arg.split(/[\s,\/]+/).filter(Boolean).map(toSearchId);
        const partial = arg && !/[\s,\/]$/.test(arg) ? tokens.pop() : '';

        const all = allTypeNames();
        const fixed = [];
        for (const t of tokens) {
            const hit = all.find((x) => x.id === t);
            if (!hit) return [['html', `Unknown type "<b>${BattleLog.escapeHTML(t)}</b>"`]];
            if (!fixed.includes(hit)) fixed.push(hit);
        }

        const mk = (types) => ['ability', MOVE_ROW_PREFIX + 'cov ' + types.map((t) => t.name).join('/'), 0, 0];
        const rows = [];

        if (fixed.length && !partial) rows.push(mk(fixed)); // the typing exactly as typed
        if (fixed.length < 18) {
            const cands = all.filter((x) => !fixed.includes(x) && (!partial || x.id.startsWith(partial)));
            cands.sort((a, b) => (b.id === partial) - (a.id === partial)); // exact match first
            for (const c of cands) rows.push(mk([...fixed, c]));
        }

        if (!rows.length) return [['html', '']];
        return [['header', 'Coverage (defending typing)'], ...rows];
    }

    function typeMultiplier(dex, move, atk, def) {
        if (move.id === 'freezedry' && def === 'Water') return 2;
        if (move.id === 'thousandarrows' && def === 'Flying') return 1;

        const v = dex?.types?.get?.(def)?.damageTaken?.[atk] ??
              window.BattleTypeChart?.[toID(def)]?.damageTaken?.[atk];
        return v === 1 ? 2 : v === 2 ? 0.5 : v === 3 ? 0 : 1;
    }

    // True if the move is super effective against a Pokémon with ALL of defTypes.
    function moveCovers(dex, move, defTypes) {
        if (!isDamaging(move) || !defTypes.length) return false;

        // Fixed-damage moves (Seismic Toss, Counter...) don't scale with type.
        if (moveField(move, 'ohko') || moveField(move, 'damage') || moveField(move, 'damageCallback')) return false;
        if (move.basePower === 0 && !moveField(move, 'basePowerCallback')) return false;

        const atkTypes = move.id === 'flyingpress' ? [move.type, 'Flying'] : [move.type];
        let eff = 1;
        for (const atk of atkTypes) {
            for (const def of defTypes) eff *= typeMultiplier(dex, move, atk, def);
        }
        return eff > 1;
    }

    // ---------- suggestions & chips ----------

    const isMoveCustomFilter = (t) =>
    typeof t === 'string' && (isNegatedFilterType(t) || t.startsWith(MOVE_FILTER_TYPE));

    function moveToggleSuggestions(query, minLen = 3, negated = false) {
        const q = toSearchId(query);
        if (q.length < minLen) return [];

        const scored = [];
        for (const [key, def] of Object.entries(MOVE_TOGGLES)) {
            if (negated && def.noNegate) continue;
            let score = Infinity;
            for (const n of def.names) {
                if (n === q) { score = 0; break; }
                if (n.startsWith(q)) score = 1;
            }
            if (score < Infinity) scored.push({key, score});
        }

        scored.sort((a, b) => a.score - b.score); // stable: exact matches first
        return scored
            .slice(0, q ? 12 : Infinity)
            .map((s) => ['ability', MOVE_ROW_PREFIX + s.key, 0, prefixMatchEnd(MOVE_TOGGLES[s.key].label, query)]);
    }

    // Parses a pseudo row id (case-insensitive) into everything needed to
    // render it and to turn it into a filter chip.
    function moveFilterRowInfo(id) {
        const body = String(id).slice(MOVE_ROW_PREFIX.length);

        if (/^cov /i.test(body)) {
            const all = allTypeNames();
            const types = body.slice(4).split('/')
            .map((t) => all.find((x) => x.id === toSearchId(t)))
            .filter(Boolean);
            if (!types.length) return null;

            const label = COVERAGE_PREFIX + types.map((t) => t.name).join('/');
            return {
                type: MOVE_FILTER_TYPE + 'cov',
                value: label,
                label,
                descHtml: '',
                iconsHtml: types.map((t) => Dex.getTypeIcon(t.name)).join(''),
            };
        }

        const key = toSearchId(body);
        const def = MOVE_TOGGLES[key];
        if (!def) return null;
        return {
            type: MOVE_FILTER_TYPE + key,
            value: def.label,
            label: def.label,
            desc: def.desc,
            descHtml: BattleLog.escapeHTML(def.desc),
        };
    }

    function patchMoveSearchFilters() {
        return patchMethod(window.BattleMoveSearch?.prototype, 'filter', '__qolMoveFiltersPatched', (original) =>
                           function (row, filters) {
            const custom = (filters || []).filter((f) => isMoveCustomFilter(f[0]));
            if (!custom.length) return original.call(this, row, filters);

            const native = filters.filter((f) => !isMoveCustomFilter(f[0]));
            if (!original.call(this, row, native)) return false;
            if (row[0] !== 'move') return true;

            const move = this.dex.moves.get(row[1]);
            if (!move?.exists) return false;

            return custom.every(([rawType, value]) => {
                const negated = isNegatedFilterType(rawType);
                const type = baseFilterType(rawType);
                if (type === NATDEX_MOVE_FILTER_TYPE) return true; // only swaps the pool, never rejects

                let matches;
                if (type.startsWith(MOVE_FILTER_TYPE)) {
                    const key = type.slice(MOVE_FILTER_TYPE.length);
                    matches = key === 'cov'
                        ? moveCovers(this.dex, move, coverageTypesFromValue(value))
                    : !!MOVE_TOGGLES[key]?.test(move, this);
                } else {
                    // negated native filter (type / category)
                    matches = original.call(this, row, [[type, value]]);
                }
                return negated ? !matches : matches;
            });
        }
                          );
    }

    // ---------- move-search engine handlers (see section 15) ----------

    // Native find() runs toID() on the query, which would destroy "!" and
    // "coverage fire, steel", so those bypass it and go straight to textSearch.
    function runBypassTextSearch(engine, cacheKey, rawQuery) {
        if (engine.query === cacheKey && engine.results) return false;

        engine.query = cacheKey;
        engine.exactMatch = true;
        engine.results = engine.textSearch(rawQuery);
        engine.selection = engine.getFirstResultIndex();
        return true;
    }

    function moveFind(engine, original, query) {
        const raw = String(query || '').trim();
        if (!raw.startsWith('!') && !isCoverageQuery(raw)) {
            engine.__qolMoveNegate = false;
            engine.exactMatch = true;
            return original.call(engine, query);
        }
        return runBypassTextSearch(engine, 'mv:' + raw.toLowerCase(), raw);
    }

    function moveTextSearch(engine, original, query) {
        const raw = String(query || '').trim();
        const negated = raw.startsWith('!');
        const body = (negated ? raw.slice(1) : raw).trim();
        engine.__qolMoveNegate = negated;

        if (isCoverageQuery(body)) {
            engine.results = coverageSuggestions(body);
            engine.exactMatch = false;
            return engine.results;
        }

        if (!negated) {
            const native = original.call(engine, query) || [];
            const rows = moveToggleSuggestions(body);
            if (!rows.length) return native;
            return (engine.results = [['header', 'Move filters'], ...rows].concat(native));
        }

        // "!<text>": our toggles + native type/category suggestions.
        // Bare "!" lists everything.
        const native = body
        ? (original.call(engine, body) || []).filter((r) => r[0] === 'type' || r[0] === 'category')
        : [
            ...allTypeNames().map((t) => ['type', t.id, 0, 0]),
            ...['physical', 'special', 'status'].map((c) => ['category', c, 0, 0]),
        ];

        engine.results = [['header', 'Not'], ...moveToggleSuggestions(body, 0, true), ...native];
        engine.exactMatch = true;
        return engine.results;
    }

    function moveAddFilter(engine, original, entry) {
        const negated = !!engine.__qolMoveNegate;
        const type = entry?.[0];
        const id = entry?.[1];

        if (typeof id === 'string' && id.toLowerCase().startsWith(MOVE_ROW_PREFIX)) {
            const info = moveFilterRowInfo(id);
            if (!info) return false;
            engine.__qolMoveNegate = false;
            return pushFilterChip(engine, (negated ? '!' : '') + info.type, info.value);
        }

        if (negated && (type === 'type' || type === 'category')) {
            engine.__qolMoveNegate = false;
            return pushFilterChip(engine, '!' + type, engine.capitalizeFirst(id));
        }

        return original.call(engine, entry);
    }

    function moveResultName(engine, original, result) {
        const id = typeof result?.[1] === 'string' ? result[1] : '';
        if (id.toLowerCase().startsWith(MOVE_ROW_PREFIX)) {
            const info = moveFilterRowInfo(id);
            if (info) return (engine.__qolMoveNegate ? '!' : '') + info.label;
        }
        return original.call(engine, result);
    }

    // Keeps typing "," or " " inside a coverage query instead of letting the
    // client treat them as search separators.
    let coverageSeparatorFixInstalled = false;
    function installCoverageSeparatorFix() {
        if (coverageSeparatorFixInstalled) return;
        coverageSeparatorFixInstalled = true;

        const handler = (e) => {
            if (e.key !== ',' && e.key !== ' ') return;

            const input = e.target;
            if (!(input instanceof HTMLInputElement) || !/^move[1-4]$/.test(input.name)) return;
            if (getEngine()?.typedSearch?.searchType !== 'move') return;
            if (!/^\s*!?\s*(coverage|cov)\s+\S/i.test(input.value)) return;

            // Block the client's own handlers for all three key events.
            e.preventDefault();
            e.stopImmediatePropagation();
            if (e.type !== 'keydown') return;

            const val = input.value;
            const start = input.selectionStart ?? val.length;
            const end = input.selectionEnd ?? start;
            input.value = val.slice(0, start) + e.key + val.slice(end);
            input.setSelectionRange(start + 1, start + 1);
            input.dispatchEvent(new Event('input', {bubbles: true}));
        };

        for (const type of ['keydown', 'keypress', 'keyup']) {
            document.addEventListener(type, handler, true);
        }
    }

    // ====================================================================
    // 15. SEARCH ENGINE DISPATCH
    //
    // One wrapper per DexSearch method; it routes to the Pokémon or move
    // handler by the active search type. Handlers get (engine, original, ...args).
    // ====================================================================

    function pokemonFind(engine, original, query) {
        // "into X" / "X into" (Cross Evolution / Frantic Fusions / Inheritance)
        const intoSpecies = parseIntoQuery(engine, query);
        const fromSpecies = intoSpecies ? null : parseFromQuery(engine, query);
        if (intoSpecies || fromSpecies) {
            resetPokemonModes(engine);

            const id = intoSpecies ? INTO_PREFIX + intoSpecies.id : FROM_PREFIX + fromSpecies.id;
            const results = [['header', 'Cross Evolve'], ['ability', id, 0, 4]];

            engine.results = results;
            engine.exactMatch = true;
            return results;
        }

        // "!" is a per-token modifier: it only affects the filter you're
        // about to add, not chips already added.
        const raw = String(query || '').trim();
        const negate = raw.startsWith('!');
        const searchQuery = negate ? raw.slice(1).trim() : raw;
        const match = searchQuery.match(EFFECT_QUERY_RE);

        if (!match) {
            engine.__qolEffectivenessMode = null;

            if (!negate) {
                engine.__qolNegateMode = false;
                engine.exactMatch = false;
                return original.call(engine, query);
            }

            engine.__qolNegateMode = true;
            return runBypassTextSearch(engine, `!:${toSearchId(searchQuery)}`, raw);
        }

        engine.__qolNegateMode = negate;
        return runBypassTextSearch(
            engine,
            `${negate ? '!' : ''}${match[1].toLowerCase()}:${toSearchId((match[2] || '').trim())}`,
            raw
        );
    }

    function pokemonTextSearch(engine, original, query) {
        if (getActiveMods().includes(MOD.CROSS_EVOLUTION) &&
            (engine.filters || []).some(([type]) => type === 'fulllist')) {
            const raw = String(query || '').trim();
            const native = original.call(engine, query).filter((row) => row[0] !== 'pokemon' &&
                row[0] !== 'sortpokemon' && row[0] !== 'header');
            const suggestions = customToggleSuggestions(raw).concat(native);
            const pairRows = ceFullResults(engine.typedSearch, engine.filters, engine.sortCol,
                engine.reverseSort, raw);
            return (engine.results = [
                ...(suggestions.length ? [['header', 'Filters'], ...suggestions] : []),
                ...pairRows
            ]);
        }
        const poolFilters = (engine.filters || []).filter(([type]) =>
            ['natdex', 'hackmons', 'ce', 'stage1', 'stage2', 'stage3'].includes(baseFilterType(type)));
        const searchFilters = (engine.filters || []).filter(([type]) =>
            ['natdex', 'hackmons', 'color', 'ce', 'stage1', 'stage2', 'stage3', 'move', 'ability', 'into', 'from']
                .includes(baseFilterType(type)));
        // Native textSearch bypasses getResults/filter. Keep pool membership
        // and legality in sync while typing as well as in the blank-query list.
        if (poolFilters.length || engine.typedSearch?.__qolPokemonPool) {
            engine.typedSearch.getResults(engine.filters, null, false);
        }
        const nativeSearch = (text) => {
            const rows = dropEmptyHeaders((original.call(engine, text) || []).filter((row) =>
                row[0] !== 'pokemon' || !searchFilters.length || engine.typedSearch.filter(row, searchFilters)));
            // Typed searches bypass BattlePokemonSearch.getResults. Classify
            // server-banned species here too, instead of showing "Illegal".
            return applyGenericBans(engine.typedSearch, rows);
        };
        const raw = String(query || '').trim();
        const negated = raw.startsWith('!');
        const q = (negated ? raw.slice(1) : raw).trim().toLowerCase();
        const match = q.match(EFFECT_QUERY_RE);

        if (!match) {
            engine.__qolEffectivenessMode = null;

            if (!negated) {
                engine.__qolNegateMode = false;

                // Drop native suggestions colliding with our keywords (e.g. the
                // real "natdex" tier), then put ours first so they're the
                // default (Enter) selection.
                const native = nativeSearch(query).filter((row) => !isReservedToggleCollisionRow(row));
                const custom = customToggleSuggestions(raw).concat(colorSuggestions(raw));
                const stones = stoneSuggestions(engine, raw);

                if (!custom.length && !stones.length) return native;

                const head = [];
                if (custom.length) head.push(['header', 'Mod Filters'], ...custom);
                if (stones.length) head.push(['header', 'Mega Stones'], ...stones);
                return (engine.results = head.concat(native));

            }

            engine.__qolNegateMode = true;
            let results;

            if (!q) {
                // Bare "!": every toggle plus every type. Abilities/moves only
                // show once you type their name (too many to list).
                results = [['header', 'Not'], ...customToggleSuggestions('', true), ...colorSuggestions('')];
                for (const typeName of Object.keys(window.BattleTypeChart || {})) {
                    results.push(['type', toSearchId(typeName), 0, typeName.length]);
                }
            } else {
                // "!<text>": native suggestion matching on the text after the
                // "!", keeping only type/ability/move/tier rows (there's no way
                // to exclude one named Pokémon, and no egg groups).
                const suggestions = (original.call(engine, q) || []).filter(
                    ([rowType, rowId]) =>
                    (rowType === 'type' || rowType === 'ability' || rowType === 'move' || rowType === 'tier') &&
                    !Object.prototype.hasOwnProperty.call(CUSTOM_TOGGLE_FILTERS, toSearchId(rowId))
                );
                results = customToggleSuggestions(q, true).concat(colorSuggestions(q), suggestions);
            }

            engine.results = results;
            engine.exactMatch = true;
            return results;
        }

        const typeChart = window.BattleTypeChart;
        if (!typeChart) {
            resetPokemonModes(engine);
            return original.call(engine, query);
        }

        const mode = match[1].toLowerCase();
        const partial = toSearchId((match[2] || '').trim());
        const results = [['header', (negated ? 'Not ' : '') + EFFECT_LABELS[mode]]];

        for (const typeName of Object.keys(typeChart)) {
            const typeId = toSearchId(typeName);
            if (partial && !typeId.startsWith(partial)) continue;
            results.push(['type', typeId, 0, typeName.length]);
        }

        engine.__qolEffectivenessMode = mode;
        engine.__qolNegateMode = negated;
        engine.results = results;
        engine.exactMatch = true;
        return results;
    }

    function pokemonAddFilter(engine, original, entry) {
        const rawValue = entry?.[1];
        const isStr = typeof rawValue === 'string';
        const color = colorRowName(rawValue);
        if (color) {
            if (!isMonoColorSearch(engine)) return false;
            return addPokemonSearchFilter(engine, 'color', color,
                isNegatedFilterType(entry[0]) || engine.__qolNegateMode);
        }

        // "Into X" suggestion picked (only one "into" chip at a time).
        if (isStr && rawValue.startsWith(INTO_PREFIX)) {
            const target = engine.dex.species.get(rawValue.slice(INTO_PREFIX.length));
            if (target?.exists) {
                engine.filters = (engine.filters || []).filter((f) => f[0] !== 'into');
                return addPokemonSearchFilter(engine, 'into', target.id, false);
            }
        }

        // "X into" suggestion picked.
        if (isStr && rawValue.startsWith(FROM_PREFIX)) {
            const base = engine.dex.species.get(rawValue.slice(FROM_PREFIX.length));
            if (base?.exists) {
                engine.filters = (engine.filters || []).filter((f) => f[0] !== 'into' && f[0] !== 'from');
                return addPokemonSearchFilter(engine, 'from', base.id, false);
            }
        }

        // Mega stone suggestion picked (one stone chip at a time).
        if (isStr && isStoneRowId(rawValue)) {
            const item = engine.dex.items.get(rawValue.slice(STONE_PREFIX.length));
            console.log(LOG, 'stone pick:', rawValue, '->', item?.exists ? item.id : 'item not found');
            if (item?.exists) {
                engine.filters = (engine.filters || []).filter((f) => f[0] !== 'stone');
                return pushPokemonFilter(engine, 'stone', item.id, false); // skips the allow-list
            }
        }

        // Toggle suggestion picked (natdex/fe/recovery/...).
        if (isStr && rawValue.startsWith(CUSTOM_TOGGLE_PREFIX)) {
            const key = rawValue.slice(CUSTOM_TOGGLE_PREFIX.length);

            if (CUSTOM_TOGGLE_FILTERS[key]) {
                const negated = isNegatedFilterType(entry[0]) || engine.__qolNegateMode;
                if (['ce', 'stage1', 'stage2', 'stage3', 'fulllist'].includes(key)) {
                    if (negated || !getActiveMods().includes(MOD.CROSS_EVOLUTION)) return false;
                    if (key.startsWith('stage')) {
                        // Exactly one stage at a time, independently of Show Evo.
                        engine.filters = (engine.filters || []).filter(([type]) =>
                            !['stage1', 'stage2', 'stage3'].includes(type));
                    }
                }
                return addPokemonSearchFilter(engine, key, CUSTOM_TOGGLE_FILTERS[key], negated);
            }
        }

        // Type picked from our "Weak / Resists / Neutral" menu.
        if (engine.__qolEffectivenessMode && entry?.[0] === 'type') {
            return addPokemonSearchFilter(engine, engine.__qolEffectivenessMode, entry[1], engine.__qolNegateMode);
        }

        const rawType = entry?.[0];

        // Row picked during a "!<query>" search, or an already-negated filter.
        if (rawType && (isNegatedFilterType(rawType) || engine.__qolNegateMode)) {
            if (baseFilterType(rawType) === 'color' && !isMonoColorSearch(engine)) return false;
            return addPokemonSearchFilter(engine, baseFilterType(rawType), entry[1], true);
        }

        // Directly supplied positive custom filters (e.g. from the console).
        if ((rawType === 'color' && isMonoColorSearch(engine)) || EFFECT_LABELS[rawType] || CUSTOM_TOGGLE_FILTERS[rawType]) {
            return addPokemonSearchFilter(engine, rawType, entry[1], false);
        }

        return original.call(engine, entry);
    }

    function pokemonResultName(engine, original, result) {
        const id = typeof result?.[1] === 'string' ? result[1] : '';
        const color = colorRowName(id);
        if (color) return `${engine.__qolNegateMode ? 'Not ' : ''}${color}`;

        if (id.startsWith(INTO_PREFIX)) {
            const sp = engine.dex.species.get(id.slice(INTO_PREFIX.length));
            if (sp?.exists) return 'Into ' + sp.name;
        }

        if (id.startsWith(FROM_PREFIX)) {
            const sp = engine.dex.species.get(id.slice(FROM_PREFIX.length));
            if (sp?.exists) return sp.name + ' into';
        }

        if (isStoneRowId(id)) {
            const item = engine.dex.items.get(id.slice(STONE_PREFIX.length));
            if (item?.exists) return item.name;
        }

        if (id.startsWith(CUSTOM_TOGGLE_PREFIX)) {
            const label = CUSTOM_TOGGLE_FILTERS[id.slice(CUSTOM_TOGGLE_PREFIX.length)];
            if (label) return engine.__qolNegateMode ? `Not ${label}` : label;
        }

        const mode = engine.__qolEffectivenessMode;

        if (mode && result?.[0] === 'type') {
            const typeName = engine.capitalizeFirst
            ? engine.capitalizeFirst(result[1])
            : String(result[1]).charAt(0).toUpperCase() + String(result[1]).slice(1);

            return `${engine.__qolNegateMode ? 'Not ' : ''}${EFFECT_LABELS[mode]} ${typeName}`;
        }

        // Plain type/ability/move/tier suggestion during a "!<query>" search.
        if (!mode && engine.__qolNegateMode && ['type', 'ability', 'move', 'tier'].includes(result?.[0])) {
            return '!' + original.call(engine, result);
        }

        return original.call(engine, result);
    }

    const ENGINE_SEARCH_HANDLERS = {
        pokemon: {find: pokemonFind, textSearch: pokemonTextSearch, addFilter: pokemonAddFilter, getResultName: pokemonResultName},
        move: {find: moveFind, textSearch: moveTextSearch, addFilter: moveAddFilter, getResultName: moveResultName},
    };

    // Sorting for the item search (native item sort() throws on unknown columns).
    const ITEM_SORT_KEYS = new Set([...STATS, 'bst', 'qoltype', 'qolability']);

    function patchItemSearchSort() {
        patchMethod(window.BattleItemSearch?.prototype, 'sort', '__qolItemSortPatched', (original) =>
                    function (results, sortCol, reverseSort) {
            if (!ITEM_SORT_KEYS.has(sortCol)) return original.call(this, results, sortCol, reverseSort);

            const species = this.set?.species || getActiveTeambuilderRoom()?.curSet?.species;
            if (!isMnmSearch(this) || !species) return results;

            const base = this.dex.species.get(species);
            const stoneRows = [];
            const otherRows = [];
            for (const row of results) {
                if (row[0] !== 'item') continue;
                const item = this.dex.items.get(row[1]);
                const room = getActiveTeambuilderRoom();
                const mods = modsForSearch(this);
                const tmp = {...(this.set || room?.curSet || {}), species, item: item.id};
                const stats = isMnmStoneItem(this.dex, item)
                ? computeModsBaseStats(mods, {dex: this.dex, set: tmp, room})
                : null;
                if (!stats) { otherRows.push({row}); continue; }
                stoneRows.push({
                    row, stats,
                    types: (modifiedTypes(mods, this.dex, tmp) || base?.types || []).join('/'),
                    ability: mixAndMegaFutureAbility(this.dex, tmp) || '',
                });
            }

            const order = reverseSort ? -1 : 1;
            const byName = (a, b) => String(a.row[1]).localeCompare(String(b.row[1]));

            stoneRows.sort((a, b) => {
                if (sortCol === 'qolability') {
                    // Stones that don't grant an ability always go last.
                    if (!a.ability !== !b.ability) return a.ability ? -1 : 1;
                    return a.ability.localeCompare(b.ability) * order || byName(a, b);
                }
                if (sortCol === 'qoltype') return a.types.localeCompare(b.types) * order || byName(a, b);

                const value = (e) => (sortCol === 'bst' ? sumStats(e.stats) : e.stats[sortCol]);
                return (value(b) - value(a)) * order || byName(a, b);
            });

            return stoneRows.concat(otherRows).map((e) => e.row);
        }
                   );
        return true;
    }

    function decorateItemSortRow() {
        const engine = getTeambuilderRoom()?.search?.engine;
        if (engine?.typedSearch?.searchType !== 'item') return;

        const bar = document.querySelector('.qol-itemsortrow');
        if (!bar) return;

        // Keep the bar above everything else in the results list (including the selected item).
        const holder = bar.closest('li') || bar;
        const list = holder.parentElement;
        if (list && list.firstElementChild !== holder) list.insertBefore(holder, list.firstElementChild);

        const active = engine.sortCol || '';
        const buttons = [...bar.querySelectorAll('button[data-sort]')];
        for (const btn of buttons) btn.classList.toggle('cur', btn.dataset.sort === active);

        // On phones, use a wrapping button layout instead of forcing the
        // desktop column positions into the narrow viewport.
        const isMobile = window.matchMedia('(max-width: 600px)').matches;

        if (isMobile) {
            bar.style.position = 'static';
            bar.style.height = 'auto';
            bar.style.display = 'flex';
            bar.style.flexWrap = 'wrap';
            bar.style.gap = '4px';
            bar.style.padding = '4px';

            for (const btn of buttons) {
                btn.style.position = 'static';
                btn.style.left = 'auto';
                btn.style.top = 'auto';
                btn.style.width = 'auto';
                btn.style.flex = '1 0 38px';
                btn.style.minWidth = '38px';
                btn.style.boxSizing = 'border-box';
                btn.style.padding = '4px 2px';
            }

            return;
        }

        // Restore desktop positioning if the viewport changes back to desktop.
        bar.style.display = '';
        bar.style.flexWrap = '';
        bar.style.gap = '';
        bar.style.padding = '';

        for (const btn of buttons) {
            btn.style.position = '';
            btn.style.left = '';
            btn.style.top = '';
            btn.style.width = '';
            btn.style.flex = '';
            btn.style.minWidth = '';
            btn.style.boxSizing = '';
            btn.style.padding = '';
        }

        const row = document.querySelector('li.result a[data-entry^="item|"] .statcol')?.closest('a');
        if (!row) return;

        const targets = [
            row.querySelector('.typecol'),
            row.querySelector('.abilitycol'),
            ...row.querySelectorAll('.statcol'),
            row.querySelector('.bstcol'),
        ];
        const barLeft = bar.getBoundingClientRect().left;

        bar.style.position = 'relative';
        bar.style.height = '20px';
        buttons.forEach((btn, i) => {
            const col = targets[i];
            if (!col) return;
            const rect = col.getBoundingClientRect();
            btn.style.position = 'absolute';
            btn.style.top = '0';
            btn.style.left = (rect.left - barLeft) + 'px';
            btn.style.width = rect.width + 'px';
        });
    }

    let stoneSortListenerInstalled = false;

    function installStoneSortListener() {
        if (stoneSortListenerInstalled) return;
        stoneSortListenerInstalled = true;

        const itemSortButton = (e) => e.target?.closest?.('[data-qol-sort]');

        document.addEventListener('mousedown', (e) => {
            const btn = itemSortButton(e);
            if (!btn || e.button !== 0) return;

            const room = getTeambuilderRoom();
            const engine = room?.search?.engine;
            if (!engine || engine.typedSearch?.searchType !== 'item') return;

            e.preventDefault();            // keep focus in the search box
            e.stopImmediatePropagation();

            const col = btn.dataset.qolSort;
            if (!col) {
                engine.sortCol = null;
                engine.reverseSort = false;
            } else if (engine.sortCol !== col) {
                engine.sortCol = col;
                engine.reverseSort = false;
            } else if (!engine.reverseSort) {
                engine.reverseSort = true;
            } else {
                engine.sortCol = null;
                engine.reverseSort = false;
            }
            console.log(LOG, 'item sort:', engine.sortCol, engine.reverseSort ? 'low-high' : 'high-low');

            engine.results = null;
            try { room.search.find?.(''); } catch (err) { console.warn(LOG, 'search.find failed:', err); }
            refreshSearchUi(room);
        }, true);

        // The press already did the work; don't let the click reach the client too.
        document.addEventListener('click', (e) => {
            if (!itemSortButton(e)) return;
            e.preventDefault();
            e.stopImmediatePropagation();
        }, true);
    }

    const ITEM_SORT_ROW_HTML =
          '<div class="sortrow qol-itemsortrow">' +
          [['qoltype', 'Types'], ['qolability', 'Abilities'],
           ['hp', 'HP'], ['atk', 'Atk'], ['def', 'Def'], ['spa', 'SpA'], ['spd', 'SpD'], ['spe', 'Spe'], ['bst', 'BST']]
    .map(([key, text]) => {
        const centered = key === 'qoltype' || key === 'qolability'
        ? ' style="text-align:center;padding-left:0;padding-right:0"' : '';
        return `<button class="sortcol statsortcol" data-sort="${key}"${centered}>${text}</button>`;
    })
    .join('') +
          '</div>';

    function patchItemSearchStoneHeader() {
        patchMethod(window.BattleItemSearch?.prototype, 'getBaseResults', '__qolStoneHeaderPatched', (original) =>
                    function () {
            const results = original.call(this);
            try {
                if (!isMnmSearch(this)) return results;

                const stones = getMnmStoneItems(this.dex);
                if (!stones.length) return results;

                const ids = new Set(stones.map((s) => s.id));
                const rest = dropEmptyHeaders(
                    results.filter((r) => !(r[0] === 'item' && ids.has(r[1])))
                );
                return [['header', 'Mix and Mega Items'], ...stones.map((s) => ['item', s.id]), ...rest];
            } catch (e) {
                console.error(LOG, 'Stone header failed:', e);
                return results;
            }
        }
                   );
        return true; // best-effort: never block patchLoop
    }

    // Picking a type from the "Weak / Resists / Neutral" list adds the chip directly.
    function patchEngineSelectResult() {
        return patchEngineMethod('selectResult', '__qolSelectResultPatched', (original) =>
                                 function (index) {
            // Mega stone row picked (Mix and Mega "stone" chip)
            if (this.typedSearch?.searchType === 'pokemon' && this.results) {
                const picked = this.results[index === undefined ? this.selection : index];
                if (picked?.[0] === 'ability' && isStoneRowId(picked[1])) {
                    const item = this.dex.items.get(String(picked[1]).slice(STONE_PREFIX.length));
                    if (item?.exists) {
                        this.filters = (this.filters || []).filter((f) => f[0] !== 'stone');
                        if (pushPokemonFilter(this, 'stone', item.id, false)) {
                            this.selection = 0;
                            return null;
                        }
                        console.warn(LOG, 'stone filter rejected; is "stone" in ALLOWED_POKEMON_FILTER_TYPES?');
                    }
                }
            }
            const mode = this.__qolEffectivenessMode;

            if (mode && this.results) {
                const result = this.results[index === undefined ? this.selection : index];

                if (result?.[0] === 'type' && this.addFilter([mode, this.capitalizeFirst(result[1])])) {
                    this.__qolEffectivenessMode = null;
                    this.selection = 0;
                    return null;
                }
            }

            return original.call(this, index);
        }
                                );
    }

    // Switching search type clears any pending filter prefix mode.
    function patchEngineSetType() {
        return patchEngineMethod('setType', '__qolSetTypePatched', (original) =>
                                 function (...args) {
            if (this.typedSearch?.searchType === 'item') { this.sortCol = null; this.reverseSort = false; }
            resetPokemonModes(this);
            this.query = '';
            this.exactMatch = false;
            return original.apply(this, args);
        }
                                );
    }

    // Patches that need the live search engine. The engine's existence gates
    // the whole group; selectResult/setType are best-effort.
    function patchSearchEngine() {
        if (!getEngine()) return false;

        patchEngineSelectResult();
        patchEngineSetType();
        patchEngineFindBanHeaders();

        return Object.keys(ENGINE_SEARCH_HANDLERS.pokemon).map((key) =>
                                                               patchEngineMethod(key, '__qolDispatch_' + key, (original) =>
                                                                                 function (...args) {
            const handler = ENGINE_SEARCH_HANDLERS[this.typedSearch?.searchType]?.[key];
            return handler ? handler(this, original, ...args) : original.apply(this, args);
        }
                                                                                )
                                                              ).every(Boolean);
    }

    // ====================================================================
    // 16. SEARCH UI: SORT, ROW RENDERING, FILTER CHIPS
    // ====================================================================

    // Adds a "Prio" header button right after PP. Idempotent.
    function withPrioSortButton(html, sortCol) {
        if (typeof html !== 'string' || html.includes('data-sort="priority"')) return html;
        const cur = sortCol === 'priority' ? ' cur' : '';
        return html.replace(
            /(<button[^>]*data-sort=["']pp["'][^>]*>[\s\S]*?<\/button>)/,
            `$1<button class="sortcol ppsortcol${cur}" data-sort="priority" style="width:38px">Prio</button>`
        );
    }
    // Native sort() throws on unknown columns, so handle 'priority' ourselves.
    // First click = highest priority first, second = lowest first, third = off.
    function patchMoveSearchSort() {
        return patchMethod(window.BattleMoveSearch?.prototype, 'sort', '__qolMoveSortPatched', (original) =>
                           function (results, sortCol, reverseSort) {
            if (sortCol !== 'priority') return original.call(this, results, sortCol, reverseSort);

            const order = reverseSort ? -1 : 1;
            const prio = (row) => (row[0] === 'move' ? this.dex.moves.get(row[1])?.priority || 0 : 0);
            // 1st click: highest priority first. 2nd click (reverseSort): lowest first. 3rd: native toggle clears the sort.
            return results.sort((a, b) =>
                                (prio(b) - prio(a)) * order || String(a[1]).localeCompare(String(b[1])));
        }
                          );
    }

    // Best-effort: not every client version has renderMoveSortRow, so it never blocks patchLoop.
    function patchMoveSortRowUi() {
        patchMethod(window.BattleSearch?.prototype, 'renderMoveSortRow', '__qolPrioHeaderPatched', (original) =>
                    function (...args) {
            return withPrioSortButton(original.apply(this, args), this.engine?.sortCol);
        }
                   );
        return true;
    }

    function decorateMovePrioHeader() {
        if (getTeambuilderRoom()?.search?.engine?.typedSearch?.searchType !== 'move') return;
        const engine = getTeambuilderRoom().search.engine;

        for (const pp of document.querySelectorAll('.sortrow button[data-sort="pp"]')) {
            const existing = pp.parentElement.querySelector('button[data-sort="priority"]');
            if (existing) {
                existing.classList.toggle('cur', engine.sortCol === 'priority');
                continue;
            }
            if (pp.parentElement.querySelector('button[data-sort="priority"]')) continue;
            const btn = document.createElement('button');
            const cur = engine.sortCol === 'priority' ? ' cur' : '';
            btn.className = 'sortcol ppsortcol' + cur;
            btn.dataset.sort = 'priority';
            btn.style.width = '38px';
            btn.textContent = 'Prio';
            pp.after(btn);
        }
    }

    function patchSearchSort() {
        return patchMethod(window.BattlePokemonSearch?.prototype, 'sort', '__qolPatched', (original) =>
                           function (results, sortCol, reverseSort) {
            const isStatSort = STATS.includes(sortCol) || sortCol === 'bst';
            if (!isStatSort) return original.call(this, results, sortCol, reverseSort);

            const dex = this.dex;
            const order = reverseSort ? -1 : 1;
            const bulkSort = !!this.__qolRealBulk && (sortCol === 'def' || sortCol === 'spd');
            const valueOf = (stats) =>
            bulkSort ? realBulk(stats, sortCol)
            : sortCol === 'bst' ? sumStats(stats)
            : stats[sortCol];
            const sortBy = (statsFor) =>
            results.sort((a, b) => (valueOf(statsFor(b[1])) - valueOf(statsFor(a[1]))) * order);

            if ((this.__qolShowEvo || this.__qolCeStage) && getActiveMods().includes(MOD.CROSS_EVOLUTION)) {
                return sortBy((id) => {
                    const species = dex.species.get(id);
                    return this.__qolShowEvo
                        ? crossEvolutionDelta(dex, species)?.stats || species.baseStats
                        : species.baseStats;
                });
            }
            if (this.__qolIntoId) {
                return sortBy((id) => {
                    const sp = dex.species.get(id);
                    return crossEvolveView(dex, sp, this.__qolIntoId)?.baseStats || sp.baseStats;
                });
            }
            if (this.__qolFromId) {
                const base = dex.species.get(this.__qolFromId);
                return sortBy((id) =>
                              crossEvolveView(dex, base, id)?.baseStats || dex.species.get(id).baseStats);
            }
            if (this.__qolStoneId) {
                const room = getActiveTeambuilderRoom();
                const mods = getActiveMods(room);
                return sortBy((id) => {
                    const sp = dex.species.get(id);
                    const set = {...(room?.curSet || {}), species: sp.name, item: this.__qolStoneId};
                    return computeModsBaseStats(mods, {dex, set, room}) || sp.baseStats;
                });
            }

            const mods = getActiveMods();
            if (!hasSearchListStats(mods)) {
                return bulkSort
                    ? sortBy((id) => dex.species.get(id).baseStats)
                : original.call(this, results, sortCol, reverseSort);
            }
            return sortBy((id) => searchListStats(dex.species.get(id), mods));
        }
                          );
    }

    function patchSearchRenderer() {
        return patchMethod(window.BattleSearch?.prototype, 'renderPokemonRow', '__qolPatched', (original) =>
                           function (pokemon, matchStart, matchLength, errorMessage, attrs) {
            let shown = pokemon;
            const call = (mon, err) => {
                shown = mon;
                const reason = this.engine?.typedSearch?.illegalReasons?.[mon?.id];
                if (reason === 'Banned' && typeof err === 'string' &&
                    /<em>\s*Banned\s*<\/em>/i.test(err)) err = null;
                return original.call(this, mon, matchStart, matchLength, err, attrs);
            };
            const finish = (html) => {
                if (hasRealBulk(this.engine) && shown?.baseStats) {
                    html = applyRealBulkToRowHtml(html, shown.baseStats);
                }
                return html;
            };

            if (pokemon) {
                const dex = this.engine.dex;
                if (!!getIntoFilterId(this.engine, 'ce') && getActiveMods().includes(MOD.CROSS_EVOLUTION)) {
                    const delta = crossEvolutionDelta(dex, pokemon);
                    if (delta) {
                        const shown = Object.assign({}, pokemon, {baseStats: delta.stats, types: delta.types});
                        let html = finish(call(shown, errorMessage));
                        html = html.replace(/(<span class="col numcol">)[\s\S]*?(<\/span>)/,
                            (_, open, close) => open + `S${delta.stage}` + close);
                        // The native renderer packs type icons leftward. Keep a
                        // transparent first-slot icon when only slot 2 changes.
                        if (!delta.typeSlots[0] && delta.typeSlots[1]) {
                            const icon = window.Dex?.getTypeIcon?.(delta.typeSlots[1]) || '';
                            html = html.replace(/(<span class="col typecol">)/,
                                (_, open) => open + `<span style="visibility:hidden">${icon}</span>`);
                        }
                        return html;
                    }
                }
                const intoId = getIntoFilterId(this.engine);
                const fromId = getIntoFilterId(this.engine, 'from');

                let view = intoId ? crossEvolveView(dex, pokemon, intoId) : null;
                if (!view && fromId) view = crossEvolveView(dex, dex.species.get(fromId), pokemon.id);
                const stoneId = getIntoFilterId(this.engine, 'stone');
                const typed = this.engine?.typedSearch;
                if (!view && stoneId) {
                    view = mnmStoneView(
                        dex, pokemon, stoneId, modsForSearch(typed),
                        typed?.set || getActiveTeambuilderRoom()?.curSet
                    );
                }

                if (view) {
                    return finish(call(Object.assign({}, pokemon, {
                        baseStats: view.baseStats,
                        types: view.types,
                        abilities: view.abilities || pokemon.abilities,
                    }), errorMessage));
                }
            }

            const mods = getActiveMods();
            if (!pokemon || !hasSearchListStats(mods)) return finish(call(pokemon, errorMessage));

            return finish(call(Object.assign({}, pokemon, {baseStats: searchListStats(pokemon, mods)}), errorMessage));
        }
                          );
    }

    // Full List alone can have >60,000 results. Showdown's old updateScroll()
    // APPENDS rows permanently: the original implementation is incremental,
    // not a bounded viewport. After scrolling far enough it creates thousands
    // of DOM nodes and eventually stalls/crashes. Replace ONLY this search's
    // renderer with a recycled ~visible-sized absolute-positioned row window.
    function patchCeFullListVirtualScroll() {
        patchCeFullWindowPainter();
        return patchMethod(window.BattleSearch?.prototype, 'updateScroll', '__qolCeFullWindowPatched', (original) =>
            function (forceAdd) {
                const rows = this.resultSet;
                const engine = this.engine;
                if (!Array.isArray(rows) || !engine?.typedSearch?.__qolCeFullMode ||
                    !(engine.filters || []).some(([type]) => type === 'fulllist')) {
                    if (this.__qolCeScrollFrame && typeof cancelAnimationFrame === 'function') {
                        cancelAnimationFrame(this.__qolCeScrollFrame);
                    }
                    this.__qolCeScrollFrame = 0;
                    this.__qolCeWindowStart = -1;
                    this.__qolCeWindowEnd = -1;
                    this.__qolCeWindowRows = null;
                    this.__qolCeWindowData = null;
                    return original.call(this, forceAdd);
                }
                if (!this.el || !this.$viewport) return original.call(this, forceAdd);
                // Search.find() installs a NEW result array. Paint the first
                // window synchronously; only scroll events are frame-coalesced.
                const newResults = this.__qolCeWindowRows !== rows || !this.el.firstChild;
                if (!newResults && !forceAdd && typeof requestAnimationFrame === 'function') {
                    if (!this.__qolCeScrollFrame) {
                        this.__qolCeScrollFrame = requestAnimationFrame(() => {
                            this.__qolCeScrollFrame = 0;
                            if (this.engine === engine && this.resultSet === rows) this.__qolCePaintWindow(rows, engine);
                        });
                    }
                    return;
                }
                if (this.__qolCeScrollFrame && typeof cancelAnimationFrame === 'function') {
                    cancelAnimationFrame(this.__qolCeScrollFrame);
                    this.__qolCeScrollFrame = 0;
                }
                this.__qolCePaintWindow(rows, engine);
            });
    }
    function patchCeFullWindowPainter() {
        const proto = window.BattleSearch?.prototype;
        if (!proto || proto.__qolCePaintWindow) return false;
        proto.__qolCePaintWindow = function (rows, engine) {
            const rowHeight = 33;
            const scrollY = Math.max(0, Number(this.$viewport.scrollTop()) || 0);
            const viewportHeight = Math.max(150, Number(this.$viewport.height()) || 550);
            const visible = Math.min(85, Math.ceil(viewportHeight / rowHeight));
            // Snap to 16-row blocks. Scrolling by a row no longer triggers a
            // wholesale DOM rebuild, and every viewport has >=16 rows spare.
            const block = 16;
            const count = Math.min(rows.length, visible + block * 3);
            const topRow = Math.floor(scrollY / rowHeight);
            const start = Math.max(0, Math.min(rows.length - count,
                Math.floor(Math.max(0, topRow - block) / block) * block));
            const end = Math.min(rows.length, start + count);
            if (this.__qolCeWindowStart === start && this.__qolCeWindowEnd === end &&
                this.__qolCeWindowRows === rows && this.el.firstChild) return;
            this.__qolCeWindowStart = start;
            this.__qolCeWindowEnd = end;
            this.__qolCeWindowRows = rows;
            let html = '';
            // ceFullResults populates this once per search, avoiding repeated
            // rule expansion and ban-signature hashing on every scroll frame.
            const data = engine.typedSearch.__qolCeFullData || ceFullData(engine.typedSearch);
            this.__qolCeWindowData = data;
            const cache = data.renderedRows || (data.renderedRows = new Map());
            try {
                for (let i = start; i < end; i++) {
                    const row = rows[i];
                    if (!row) continue;
                    const isPair = row[0] === 'pokemon' && !!ceFullIds(row[1]);
                    const cur = this.cur && Object.prototype.hasOwnProperty.call(this.cur, row[1]) ? ' class="cur"' : '';
                    // Full List's pair markup is independent of row index.
                    // Cache it once; only the absolute row position changes.
                    const cacheKey = isPair ? row[1] + '|' + cur : null;
                    let rendered = cacheKey && cache.get(cacheKey);
                    if (!rendered) {
                        let errorMessage = '';
                        const filterLabel = engine.filterLabel?.(row[0]);
                        const illegalLabel = filterLabel ? null : engine.illegalLabel?.(row[1]);
                        if (filterLabel) errorMessage = `<span class="col filtercol"><em>${filterLabel}</em></span>`;
                        else if (illegalLabel) errorMessage = `<span class="col illegalcol"><em>${illegalLabel}</em></span>`;
                        const matchStart = row.length > 3 ? row[2] : 0;
                        const matchLength = row.length > 3 ? row[3] : 0;
                        rendered = this.renderRow(row[1], row[0], matchStart, matchLength, errorMessage, cur);
                        if (cacheKey && rendered) {
                            cache.set(cacheKey, rendered);
                            // Cap cache independently of total pair count.
                            if (cache.size > 768) cache.delete(cache.keys().next().value);
                        }
                    }
                    html += rendered.replace(/<li(?=[\s>])/, `<li style="position:absolute;top:${i * rowHeight}px;left:0;right:0"`);
                }
            } finally {
                this.__qolCeWindowData = null;
            }
            this.el.innerHTML = `<ul class="utilichart qol-ce-window" style="height:${rows.length * rowHeight}px;position:relative">${html}</ul>`;
            this.renderedIndex = end;
            this.renderingDone = false;
            this.moreVisible = false;
        };
        return true;
    }

    // Row HTML for suggestion rows: custom rows (toggles / into / from) render
    // through a real, harmless ability id to inherit the native markup, then
    // the visible name is swapped for our label. Native type/ability/move/tier
    // rows get "Weak " / "!" prefixes while an effectiveness / negate mode is active.

    const FILTER_TAG_HTML = '<span class="col filtercol"><em>Filter</em></span>';

    // Length of the label prefix the query matches (0 if it matched an alias / key instead).
    function prefixMatchEnd(label, query) {
        const q = toSearchId(query);
        if (!q || !toSearchId(label).startsWith(q)) return 0;
        let seen = 0;
        for (let i = 0; i < label.length; i++) {
            if (/[a-z0-9]/i.test(label[i]) && ++seen === q.length) return i + 1;
        }
        return 0;
    }

    // `prefix` ("Not ", "!") is shown but never highlighted.
    function highlightedLabel(label, start, end, prefix = '') {
        const esc = BattleLog.escapeHTML;
        const s = Math.max(0, Math.min(label.length, Number(start) || 0));
        const e = Math.max(s, Math.min(label.length, Number(end) || 0));
        return esc(prefix) + (e > s
                              ? esc(label.slice(0, s)) + '<b>' + esc(label.slice(s, e)) + '</b>' + esc(label.slice(e))
                              : esc(label));
    }

    function patchSearchRowText() {
        return patchMethod(window.BattleSearch?.prototype, 'renderRow', '__qolEffectivenessTypeNamePatched', (original) =>
                           function (row, type, matchStart, matchEnd, errorMessage, attrs) {
            if (type === 'sortitem') return renderItemSortRow(this);
            if (type === 'pokemon' && ceFullIds(row)) {
                // One CE data lookup per visible window, not once for every row.
                const data = this.__qolCeWindowData || ceFullData(this.engine.typedSearch);
                const pair = data.byId.get(row);
                if (!pair) return '';
                const view = ceFullPairView(pair, data);
                const display = Object.assign({}, pair.base, {baseStats: view.baseStats,
                    types: view.types, abilities: view.abilities || pair.abilities});
                let native = this.renderPokemonRow;
                while (native.__original) native = native.__original;
                let html = native.call(this, display, 0, 0, null, attrs);
                const esc = BattleLog.escapeHTML;
                // Preserve Showdown's float-based native row layout. The default
                // number (24+5px) and sprite (40px) columns together consume
                // 69px; our compact pair column consumes 82+5px. Recover the
                // extra 18px from the native 127px name column so type, ability,
                // six stat columns AND BST remain in their original positions.
                const icon = (species) =>
                    `<span style="display:inline-block;position:relative;overflow:hidden;width:32px;height:30px;flex:0 0 32px">` +
                    `<span style="${Dex.getPokemonIcon(species.name)};position:absolute;top:0;left:-4px;display:block;width:40px;height:30px;transform:scale(.8);transform-origin:center"></span></span>`;
                const icons = `<span style="display:inline-flex;align-items:center;width:82px;height:30px;gap:2px">` +
                    icon(pair.base) + '<span style="font-size:11px;flex:0 0 12px;text-align:center">→</span>' + icon(pair.donor) + '</span>';
                html = html.replace(/<span class="col numcol">[\s\S]*?<\/span>/,
                    `<span class="col numcol" style="width:82px;min-width:82px;height:30px;padding-top:0;text-align:left">${icons}</span>`);
                // The sprites already identify the base. Show the evolution
                // donor alone to avoid truncating names and pushing out BST.
                html = html.replace(/<span class="col pokemonnamecol">[\s\S]*?<\/span>/,
                    `<span class="col pokemonnamecol" style="width:109px;overflow:hidden;text-overflow:ellipsis" title="${esc(pair.base.name)} → ${esc(pair.donor.name)}">${esc(pair.donor.name)}</span>`);
                html = html.replace(/data-entry="pokemon\|[^"]+"/,
                    `data-entry="pokemon|${pair.id}"`);
                // Original icon column would repeat the base sprite. Reclaim
                // that space for the pair's two icons in the tier column.
                html = html.replace(/<span class="col iconcol">[\s\S]*?<\/span>\s*<\/span>/, '');
                return html;
            }

            const renderLabelRow = (label, prefix = '') =>
            original.call(this, ['ability', 'noability'], 'ability', matchStart, matchEnd, errorMessage, attrs)
            .replace(/<span class="col namecol">[\s\S]*?<\/span>/, () =>
                     `<span class="col namecol qol-pkf qol-mvf">${highlightedLabel(label, matchStart, matchEnd, prefix)}</span>`)
            .replace(/<span class="col abilitydesccol">[\s\S]*?<\/span>/, () => FILTER_TAG_HTML);

            const id = type === 'ability' && typeof row?.[1] === 'string' ? row[1] : '';
            const dex = this.engine?.dex;
            const color = colorRowName(id);
            if (color && isMonoColorSearch(this.engine)) return renderLabelRow(`${color}`, this.engine?.__qolNegateMode ? 'Not ' : '');

            if (id.toLowerCase().startsWith(MOVE_ROW_PREFIX)) {
                const info = moveFilterRowInfo(id);
                if (info) {
                    let html = renderLabelRow(info.label, this.engine?.__qolMoveNegate ? '!' : '');
                    if (info.descHtml) html = html.replace('<span class="col namecol', `<span title="${BattleLog.escapeHTML(info.descHtml)}" class="col namecol`);
                    return info.iconsHtml ? html.replace(FILTER_TAG_HTML, info.iconsHtml + FILTER_TAG_HTML) : html;
                }
            }

            if (id.startsWith(INTO_PREFIX)) {
                const sp = dex?.species?.get(id.slice(INTO_PREFIX.length));
                if (sp?.exists) return renderLabelRow(`Into ${sp.name}`);
            }

            if (id.startsWith(FROM_PREFIX)) {
                const sp = dex?.species?.get(id.slice(FROM_PREFIX.length));
                if (sp?.exists) return renderLabelRow(`${sp.name} into`);
            }

            if (isStoneRowId(id)) {
                const item = dex?.items?.get(id.slice(STONE_PREFIX.length));
                if (item?.exists) return renderLabelRow(item.name);
            }

            if (id.startsWith(CUSTOM_TOGGLE_PREFIX)) {
                const label = CUSTOM_TOGGLE_FILTERS[id.slice(CUSTOM_TOGGLE_PREFIX.length)];
                if (label) return renderLabelRow(label, this.engine?.__qolNegateMode ? 'Not ' : '');
            }

            const html = original.call(this, row, type, matchStart, matchEnd, errorMessage, attrs);

            if (type === 'sortmove') {
                return withPrioSortButton(html, this.engine?.sortCol);
            }

            if (this.engine?.typedSearch?.searchType !== 'pokemon') return html;

            const mode = this.engine?.__qolEffectivenessMode;
            const negated = !!this.engine?.__qolNegateMode;

            if (mode && type === 'type') {
                const prefix = negated ? `!${EFFECT_LABELS[mode]}` : EFFECT_LABELS[mode];
                return html.replace(/(<span class="col namecol"><b>)([^<]+)(<\/b>)/, `$1${prefix} $2$3`);
            }

            if (!mode && negated && ['type', 'ability', 'move', 'tier'].includes(type)) {
                const nameColumn = type === 'move' ? 'movenamecol' : 'namecol';
                const pattern = new RegExp(`(<span class="col ${nameColumn}">)`);

                return html.replace(pattern, (m, openingTag, offset, fullHtml) => {
                    // Avoid adding a second "!" if this row was already prefixed.
                    const after = fullHtml.slice(offset + openingTag.length);
                    return after.startsWith('!') || after.startsWith('<b>!</b>') ? openingTag : `${openingTag}!`;
                });
            }

            return html;
        }
                          );
    }

    // Text on the filter chips above the results.
    function patchFilterChipText() {
        const proto = findPrototypeWithMethod(getTeambuilderRoom()?.search, 'getFilterText');

        return patchMethod(proto, 'getFilterText', '__qolEffectivenessFilterTextPatched', () =>
                           function (q) {
            const buttons = this.filters.map((filter) => {
                const kind = baseFilterType(filter[0]);
                let text = filter[1];

                if (EFFECT_LABELS[kind]) {
                    text = EFFECT_LABELS[kind] + ' ' + text.charAt(0).toUpperCase() + text.slice(1);
                } else if (kind === 'color') {
                    text = text;
                } else if (kind === 'from') {
                    text = Dex.species.get(text).name + ' Into';
                }else if (kind === 'stone') {
                    text = Dex.items.get(text).name;
                } else if (kind === 'into') {
                    text = 'Into ' + Dex.species.get(text).name;
                } else if (kind === 'move') {
                    text = Dex.moves.get(text).name;
                } else if (kind === 'pokemon') {
                    text = Dex.species.get(text).name;
                }

                if (isNegatedFilterType(filter[0])) text = '!' + text;

                return '<button class="filter" value="' + BattleLog.escapeHTML(filter.join(':')) + '">' +
                    text + ' <i class="fa fa-times-circle"></i></button> ';
            });

            return '<p>Filters: ' + buttons.join('') +
                (q ? '' : '<small style="color: #888">(backspace = delete filter)</small>') + '</p>';
        }
                          );
    }

    // "Clear all" on the filter chips: one press drops every filter.
    let clearFiltersListenerInstalled = false;
    function installClearFiltersListener() {
        if (clearFiltersListenerInstalled) return;
        clearFiltersListenerInstalled = true;

        const target = (e) => e.target?.closest?.('.qol-clearfilters');

        document.addEventListener('mousedown', (e) => {
            if (!target(e) || e.button !== 0) return;

            const room = getTeambuilderRoom();
            const engine = room?.search?.engine;
            if (!engine) return;

            e.preventDefault(); // keep focus in the search box
            e.stopImmediatePropagation();

            engine.filters = null;
            if (engine.typedSearch && 'filters' in engine.typedSearch) engine.typedSearch.filters = null;
            resetPokemonModes(engine);
            engine.results = null;
            try { room.search.find?.(''); } catch (err) { console.warn(LOG, 'search.find failed:', err); }
            refreshSearchUi(room);
        }, true);

        // The press already did the work; keep the click away from the client.
        document.addEventListener('click', (e) => {
            if (!target(e)) return;
            e.preventDefault();
            e.stopImmediatePropagation();
        }, true);
    }

    // ====================================================================
    // 17. TEAMBUILDER PATCHES (stat calc, base stat column, icons)
    // ====================================================================

    // Stat calculation for every mod.
    // Like native Monotype, seed a removable chip only when adding a new slot.
    // Searching or removing the chip must never silently reapply it.
    function patchMonocolorAddPokemon() {
        return patchMethod(window.TeambuilderRoom?.prototype, 'addPokemon', '__qolMonocolorPatched', (original) =>
            function (...args) {
                const result = original.apply(this, args);
                const format = String(this.curTeam?.format || '').split('@@@')[0];
                if (!fmtHas(format, 'monocolor', 'monocolour') || this.curSet?.species) return result;
                const engine = this.search?.engine;
                if (engine?.typedSearch?.searchType !== 'pokemon') return result;
                const dex = this.curTeam.dex;
                const first = this.curSetList?.find((set) => set.species && dex.species.get(set.species)?.exists);
                const color = first && pokemonColorName(dex.species.get(first.species).color);
                if (color && addPokemonSearchFilter(engine, 'color', color, false)) {
                    this.search.filters = engine.filters;
                    this.search.find('');
                }
                return result;
            });
    }

    function patchGetStat() {
        return patchMethod(window.TeambuilderRoom?.prototype, 'getStat', '__qolPatched', (original) =>
                           function (stat, set, evOverride, natureOverride) {
            const callOriginal = () => original.call(this, stat, set, evOverride, natureOverride);

            set = set || this.curSet;
            if (!set) return 0;

            const dex = this.curTeam?.dex;
            // The outer stat-form/optimizer wrapper already provided modified
            // baseStats. Recomputing here would double-apply BnB/Tier Shift.
            if (isStatOverrideActive(dex, set.species)) return callOriginal();
            const mods = getActiveMods(this);
            if (!mods.length) return callOriginal();

            const baseStats = computeModsBaseStats(mods, {dex, set, room: this});
            if (!baseStats) return callOriginal();

            return withSpeciesBaseStats(dex, set.species, baseStats, callOriginal);
        }
                          );
    }

    // The visible "base stats" column.
    function applyModBaseStatColumn(room) {
        const mods = getActiveMods(room);
        const set = room?.curSet;
        if (!mods.length || !set?.species) return;
        // Nested native graph renders will be followed by the outer form's
        // final column update; never fold stats from a temporarily patched Dex.
        if (isStatOverrideActive(room.curTeam?.dex, set.species)) return;

        const baseStats = computeModsBaseStats(mods, {dex: room.curTeam?.dex, set, room});
        if (!baseStats) return;

        const rows = room.$chart?.find('.basestatscol > div');
        if (!rows?.length) return;

        STATS.forEach((stat, i) => rows.eq(i + 1).find('b').text(baseStats[stat]));
    }

    // Supply the transformed species to native stat rendering/EV optimization,
    // not just to the final base-stat column. Always restore the Dex lookup.
    function withActiveModdedStatSpecies(room, fn) {
        const set = room?.curSet;
        const dex = room?.curTeam?.dex;
        if (!set?.species || !dex?.species?.get) return fn();
        if (isStatOverrideActive(dex, set.species)) return fn();
        const mods = getActiveMods(room);
        if (!mods.length) return fn();
        const stats = computeModsBaseStats(mods, {dex, set, room});
        return stats ? withSpeciesBaseStats(dex, set.species, stats, fn) : fn();
    }

    // The optimizer is distinct from BattleStatGuesser. Imported team formats
    // (especially a name like "STAAABnB" without a gen prefix) are not Dex mod IDs.
    // Keep the actual format on the team, and normalize only the native optimizer's
    // constructor argument so its Dex.mod() call receives a supported generation.
    function patchBattleStatOptimizerConstructor() {
        const Optimizer = window.BattleStatOptimizer;
        if (typeof Optimizer !== 'function') return false;
        if (Optimizer.__qolFormatPatched) return true;

        // The old client invokes BattleStatOptimizer(set, format) as a regular
        // function from checkStatOptimizations(), not with `new`. Intercept
        // apply() and normalize argument 1 (format), NOT argument 0 (set).
        // The optimizer only needs a real Dex mod to read its generation and
        // mechanics; our own wrappers supply the custom species base stats.
        const nativeOptimizerFormat = (format) => {
            const base = String(format || '').split('@@@')[0];
            const resolved = resolveFormatKey(base) || toID(base);
            const room = getActiveTeambuilderRoom();
            const match = String(resolved).match(/^gen(\d+)(?=[a-z]|$)/);
            const generation = Number(match?.[1] || room?.curTeam?.dex?.gen || room?.curTeam?.gen || window.Dex?.gen || 9);
            return `gen${generation}`;
        };
        const Wrapped = new Proxy(Optimizer, {
            apply(target, thisArg, args) {
                const normalized = args.slice();
                if (normalized.length > 1) normalized[1] = nativeOptimizerFormat(normalized[1]);
                return Reflect.apply(target, thisArg, normalized);
            },
            construct(target, args, newTarget) {
                const normalized = args.slice();
                if (normalized.length > 1) normalized[1] = nativeOptimizerFormat(normalized[1]);
                return Reflect.construct(target, normalized, newTarget);
            },
        });
        Wrapped.__qolFormatPatched = true;
        window.BattleStatOptimizer = Wrapped;
        return true;
    }

    // Custom challenge formats can retain a stale team.gen even when their
    // format explicitly says gen9. Showdown chooses between Tera Type and
    // Hidden Power controls using curTeam.gen, not the actual battle rules.
    // Reconcile only explicitly generation-prefixed formats; don't infer one
    // from a custom name or override a generation-less legacy team.
    function syncExplicitFormatGeneration(team) {
        if (!team) return false;
        const format = String(team.format || '');
        const match = format.match(/^gen(\d+)(?=[a-z]|@@@|$)/i);
        // The custom Convergence Megamons rules use Scarlet/Violet mechanics
        // even when the challenge-code base format has a different generation.
        // Also support a saved imported-format label, and the future named OM.
        const megamons = isConvergenceMegamons(format) ||
            toSearchId(getCustomFormatLabel(format)) === 'convergencemegamons' ||
            toSearchId(team.name || '') === 'convergencemegamons';
        const generation = match ? Number(match[1]) : megamons ? 9 : null;
        if (!Number.isInteger(generation) || generation < 1) return false;
        if (team.gen === generation && team.dex?.gen === generation) return false;
        // Don't fabricate a Dex for a generation the live client doesn't have.
        let generationDex = null;
        try {generationDex = typeof Dex.forGen === 'function' ? Dex.forGen(generation) : null;}
        catch (e) {return false;}
        if (!generationDex || generationDex.gen !== generation) return false;
        team.gen = generation;
        team.dex = generationDex;
        return true;
    }

    // Showdown's team overview and details dialog have different render paths.
    // Guard both BEFORE their native layout code reads curTeam.gen: a later
    // refresh must not restore an older-generation Hidden Power selector.
    function patchCustomTeamGenerationRendering() {
        const proto = window.TeambuilderRoom?.prototype;
        if (!proto) return false;
        // Install each available hook independently. Array.every short-circuits
        // if a client version lacks one method, leaving subsequent hooks absent.
        // The outer update entry point also covers re-opening the team overview.
        const methods = ['update', 'updateChart', 'updateDetailsForm', 'renderSet'];
        let patched = 0;
        for (const method of methods) {
            if (typeof proto[method] !== 'function') continue;
            if (patchMethod(proto, method, '__qolGenBeforeRender_' + method,
                (original) => function (...args) {
                    syncExplicitFormatGeneration(this.curTeam);
                    return original.apply(this, args);
                })) patched++;
        }
        return patched > 0;
    }

    function patchStatForm() {
        const proto = window.TeambuilderRoom?.prototype;
        // Details are recreated on each visit. Ensure a Gen 9 custom format
        // cannot silently render Gen 7's Hidden Power menu after re-enabling.
        const detailsForm = patchMethod(proto, 'updateDetailsForm', '__qolSyncFormatGenDetails', (original) =>
            function (...args) {
                syncExplicitFormatGeneration(this.curTeam);
                return original.apply(this, args);
            }
        );

        // Showdown's native updateStatForm(true) SAVES the guessed EVs but only
        // calls updateStatGraph()/natureChange(). It does NOT replace the stat
        // inputs/sliders. Rebuild once, synchronously, from the committed set.
        // Do both calls inside the same species override to keep custom-format
        // base stats consistent; never invoke another guessed spread.
        const updateForm = patchMethod(proto, 'updateStatForm', '__qolPatched', (original) =>
            function (setGuessed) {
                const result = withActiveModdedStatSpecies(this, () => {
                    const value = original.call(this, setGuessed);
                    if (setGuessed === true && this.curSet) {
                        original.call(this, false);
                    }
                    return value;
                });
                applyModBaseStatColumn(this);
                if (getActiveMods(this).includes(MOD.MIX_AND_MEGA) && this.curSet?.species) {
                    renderMixAndMegaSpeedNote(this);
                }
                return result;
            }
        );

        // Same post-hook for these: re-apply the base stat column.
        const columnPatches = ['updateStatGraph', 'natureChange'].map((key) =>
                                                                      patchMethod(proto, key, '__qolBaseColumn_' + key, (original) =>
                                                                                  function (...args) {
            const result = withActiveModdedStatSpecies(this, () => original.apply(this, args));
            applyModBaseStatColumn(this);
            if (getActiveMods(this).includes(MOD.MIX_AND_MEGA) && this.curSet?.species) updateMixAndMegaSpeedNote(this);
            return result;
        }
                                                                                 )
                                                                     );

        // No deferred guessed-EV redraw: the updateStatForm(true) wrapper above
        // immediately follows the native save with updateStatForm(false).
        // Asynchronous refreshes can race Safari's editor and leave inputs blank.

        const statSlide = patchMethod(proto, 'statSlide', '__qolPatched', (original) =>
                                      function (...args) {
            const result = original.apply(this, args);
            if (getActiveMods(this).includes(MOD.MIX_AND_MEGA)) updateMixAndMegaSpeedNote(this);
            return result;
        }
                                     );

        return detailsForm && updateForm && statSlide && columnPatches.every(Boolean);
    }

    // The Details pane's type icons come from the *named* species with no
    // awareness of the item/nickname/moves, so post-process the HTML it
    // returns. Also covers switching mons and page load.
    function patchRenderSetTypeIcons() {
        return patchMethod(window.TeambuilderRoom?.prototype, 'renderSet', '__qolMixAndMegaPatched', (original) =>
                           function (set, i) {
            const html = original.call(this, set, i);
            if (!set?.species) return html;

            const types = modifiedTypes(getActiveMods(this), this.curTeam?.dex, set);
            if (!types) return html;

            return html.replace(
                /(<div class="setcell setcell-typeicons">)[\s\S]*?(<\/div>)/,
                `$1${typeIconsHtml(types)}$2`
            );
        }
                          );
    }



    // Everything that reacts to a chooser pick:
    //   - fusion mods: apply the "into" / "X into" nickname
    //   - Camomons / Mix and Mega: live-refresh the type icons
    // Rebuilds the chooser that is currently open (what clicking away and back does).
    function rebuildOpenChooser(room) {
        const engine = room?.search?.engine;
        if (!engine) return;
        if (engine.typedSearch) clearSearchCache(engine.typedSearch);
        engine.results = null;
        try { room.search.find?.(''); } catch (e) { console.warn(LOG, 'search.find failed:', e); }
        refreshSearchUi(room);
    }

    // Rebuild only the held-item icon: native updatePokemonSprite changes the
    // background of an existing .itemicon, but does not recreate one if an
    // out-of-generation forme's editor has rendered it without that element.
    function refreshItemIcon(room) {
        const cell = room?.$?.('.setrow-icons .setcell:not(.setcell-typeicons)');
        if (!cell?.length) return;
        const name = room?.curSet?.item || '';
        const item = name && (room.curTeam?.dex?.items?.get?.(name) || Dex.items?.get?.(name));
        cell.html(`<span class="itemicon"${item?.exists ? ` style="${Dex.getItemIcon(item)}"` : ''}></span>`);
    }

    function patchChartSet() {
        return patchMethod(window.TeambuilderRoom?.prototype, 'chartSet', '__qolChartSetPatched', (original) =>
                           function (val, selectNext) {
            const mods = getActiveMods(this);
            const hasMnm = mods.includes(MOD.MIX_AND_MEGA);
            const chartName = this.curChartName;

            // Capture the stone before Showdown changes the search state on selection.
            const stoneId = chartName === 'pokemon'
            ? getIntoFilterId(this.search?.engine, 'stone')
            : null;


            let nickname = null;
            const fullPairId = chartName === 'pokemon' && ceFullIds(val);
            const fullPair = fullPairId ? ceFullFindPair(this.search?.engine?.typedSearch, val) : null;
            if (fullPairId && !fullPair) return;
            if (fullPair) {
                val = fullPair.base.name;
                nickname = fullPair.donor.name;
            } else if (chartName === 'pokemon' && mods.some(isFusionMod)) {
                ({val, nickname} = resolveIntoSelection(this, val));
            }

            const megaConvPick = chartName === 'pokemon' && isConvergenceMegamons(this.curTeam?.format);
            const previousItem = megaConvPick ? this.curSet?.item || '' : null;
            const result = original.call(this, val, selectNext);

            if (megaConvPick && this.curSet) {
                const selected = Dex.species.get(this.curSet.species);
                const held = Dex.items.get(this.curSet.item);
                // Native Showdown auto-fills Mega Stones when selecting a Mega
                // forme. Megamons treats Mega formes as ordinary species.
                if (selected?.isMega && held?.exists && held.megaStone &&
                    this.curSet.item !== previousItem) {
                    this.curSet.item = previousItem;
                    this.$('input[name=item]').val(previousItem);
                    refreshItemIcon(this);
                    this.save?.();
                }
            }

            if (nickname && this.curSet) {
                this.curSet.name = nickname;
                this.$('input[name=nickname]').val(nickname);
                if (fullPair) {
                    // A full-list result is a complete CE combination, not
                    // merely a nickname suggestion. The native setPokemon()
                    // initializes the BASE's ability; CE requires one of the
                    // evolved DONOR's abilities instead.
                    const bans = getMergedBansForFormat(this.curTeam?.format);
                    const ability = Object.values(fullPair.donor.abilities || {})
                        .find((name) => name && !bans?.abilities?.has(toID(name)));
                    if (ability) {
                        this.curSet.ability = ability;
                        this.$('input[name=ability]').val(ability);
                    }
                }

                this.save?.();

                scheduleFusionRefresh(this, nickname);
            }

            // Camomons: refresh on any pick (species pick blanks the icons,
            // move picks fill them). Mix and Mega: only on item.
            if (mods.includes(MOD.CAMOMONS) || (hasMnm && chartName === 'item')) {
                refreshTypeIcons(this);
            }
            // Megamons permits forme species that did not exist in the team's
            // original generation. Their native item-icon node can be missing;
            // refresh it immediately after committing an item selection.
            if (chartName === 'item' &&
                (mods.includes(MOD.FORTEMONS) || isConvergenceMegamons(this.curTeam?.format))) {
                refreshItemIcon(this);
            }
            if (hasMnm && chartName === 'pokemon' && this.curSet && stoneId) {
                const stone = this.curTeam?.dex?.items?.get(stoneId);

                if (stone?.exists) {
                    this.curSet.item = stone.name;
                    this.$('input[name=item]').val(stone.name);
                    refreshItemIcon(this);
                    this.save?.();
                    refreshTypeIcons(this);
                    this.updateStatForm();
                    this.updateStatGraph();

                    rebuildOpenChooser(this);
                    setTimeout(() => {
                        if (getActiveTeambuilderRoom() === this) {
                            rebuildOpenChooser(this);
                            refreshItemIcon(this);
                        }
                    }, 0);
                }
            }
            return result;
        }
                          );
    }
    const STONE_COL = {
        types: 68, // two 32px type icons
        stat: 26, // each of the 6 stat columns
        ability: 104, // ability column
        gap: 4,
        rowHeight: 30, // match the native row height
        nudgeY: -2, // negative = move up; adjust if text still sits low/high
        font: 12,
    };

    function patchItemRowStoneStats() {
        patchMethod(window.BattleSearch?.prototype, 'renderItemRow', '__qolStoneItemRowPatched', (original) =>
                    function (item, ...rest) {
            const html = original.call(this, item, ...rest);
            try {
                const typed = this.engine?.typedSearch;
                if (!isMnmSearch(typed)) return html;

                const dex = this.engine.dex || typed.dex;
                const set = typed.set || getActiveTeambuilderRoom()?.curSet;
                if (!dex || !set?.species || !isMnmStoneItem(dex, item)) return html;

                const base = dex.species.get(set.species);
                const tmp = {...set, species: set.species, item: item.id};
                const mods = modsForSearch(typed);
                const stats = computeModsBaseStats(mods, {dex, set: tmp, room: getActiveTeambuilderRoom()});
                if (!base?.exists || !stats) return html;

                const ability = mixAndMegaFutureAbility(dex, tmp);
                const types = modifiedTypes(modsForSearch(typed), dex, tmp) || base.types;
                const {sortCol, reverseSort} = this.engine;

                // Clickable column label (see the click handler in section 2).
                const label = (key, text) => `<em>${text}</em>`;
                const num = (key) => {
                    const d = stats[key] - base.baseStats[key];
                    if (!d) return String(stats[key]);
                    return `<span style="font-weight:bold;color:${d > 0 ? '#2a7' : '#c33'}">${stats[key]}</span>`;
                };

                const names = {hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe'};
                const statCols = STATS.map((k) =>
                                           `<span class="col statcol">${label(k, names[k])}<br>${num(k)}</span>`).join('');
                const bstCol = `<span class="col bstcol">${label('bst', 'BST')}<br>${sumStats(stats)}</span>`;

                const content =
                      `<span class="col typecol">${typeIconsHtml(types)}</span>` +
                      '<span style="float:left;min-height:26px">' +
                      '<span class="col abilitycol" style="width:118px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
                      (ability ? BattleLog.escapeHTML(ability) : '') + '</span></span>' +
                      `<span style="float:left;min-height:26px">${statCols}${bstCol}</span>`;

                return html.replace(/<span class="col itemdesccol">[\s\S]*?<\/span>/, () => content);
            } catch (e) {
                console.error(LOG, 'Stone item row failed:', e);
                return html;
            }
        }
                   );
        return true;
    }

    // ====================================================================
    // 18. BATTLE PATCHES, GODLY GIFT, DOM DECORATORS, BOOT
    // ====================================================================

    // ---------- Godly Gift ----------


    // Resolve the *eligibility* species. Showdown checks whether a team member
    // is an Uber/AG God using its battle-only base forme, modified by a held
    // Mega Stone or Crowned-form item where applicable. This is distinct from
    // the donor base-stat species (the team's original set species).
    function resolveGodSpecies(dex, set) {
        if (!dex?.species?.get || !set?.species) return null;
        let species = dex.species.get(set.species);
        if (!species?.exists) return null;
        if (typeof species.battleOnly === 'string') {
            const base = dex.species.get(species.battleOnly);
            if (base?.exists) species = base;
        }
        const item = set.item ? dex.items?.get?.(set.item) : null;
        if (item?.exists) {
            let forme = '';
            // In Showdown's public Dex data, `megaStone` is normally a string,
            // and `megaEvolves` is the species name. Preserve compatibility with
            // any client builds exposing the older mapping representation.
            if (typeof item.megaStone === 'string' &&
                (!item.megaEvolves || toID(item.megaEvolves) === toID(species.name))) {
                forme = item.megaStone;
            } else if (item.megaStone && typeof item.megaStone === 'object') {
                forme = item.megaStone[species.name] || item.megaStone[species.baseSpecies] || '';
            }
            if (!forme && item.id === 'redorb' && species.baseSpecies === 'Groudon') forme = 'Groudon-Primal';
            if (!forme && item.id === 'blueorb' && species.baseSpecies === 'Kyogre') forme = 'Kyogre-Primal';
            if (!forme && item.id === 'rustedsword' && species.baseSpecies === 'Zacian') forme = 'Zacian-Crowned';
            if (!forme && item.id === 'rustedshield' && species.baseSpecies === 'Zamazenta') forme = 'Zamazenta-Crowned';
            const transformed = forme ? dex.species.get(forme) : null;
            if (transformed?.exists) species = transformed;
        }
        return species;
    }

    const godBaseId = (species) => toID(species.baseSpecies || species.name);

    // Tier data is available synchronously from the generation-specific Dex.
    // The /formathelp restricted list is optional extra information: it should
    // never be the *only* way of finding a God, particularly in custom mods.
    function isGodlyGiftRestricted(species, room = getActiveTeambuilderRoom()) {
        if (!species?.exists) return false;
        const baseId = godBaseId(species);
        const format = room?.curTeam?.format || '';
        const natdex = isNationalDexFormat(format);
        const tier = toID(natdex ? (species.natDexTier || species.tier) : species.tier).replace(/^nd(?=uber|ag)/, '');
        if (tier === 'uber' || tier === 'ag') return true;

        // Restriction lists correspond to the official Gen 9 Godly Gift format;
        // don't apply them blindly to other generations' custom rule stacks.
        if (formatGeneration(format) === 9 && fmtHas(format.split('@@@')[0], 'godlygift') &&
            (godlyGiftRestricted.has(species.id) || godlyGiftRestricted.has(baseId))) return true;
        const bans = getMergedBans(room);
        return !!bans && (bans.restricted.has(species.id) || bans.restrictedBase.has(baseId));
    }

    // No network response is needed to calculate a God's tier or base stats.
    const godlyGiftReady = (room) => !!room?.curTeam?.dex?.species?.get;

    // First God in team order, including Power Construct. The caller can
    // exclude the set currently being edited when checking the one-God rule.
    function findGodSet(room, {ignoreSet = null, powerConstruct = true} = {}) {
        const team = room?.curSetList;
        if (!Array.isArray(team) || !room?.curTeam) return null;
        const dex = room.curTeam.dex;
        return team.find((set) => {
            if (!set?.species || set === ignoreSet) return false;
            if (powerConstruct && toID(set.ability) === 'powerconstruct') return true;
            return isGodlyGiftRestricted(resolveGodSpecies(dex, set), room);
        }) || null;
    }

    // Unlike god *eligibility*, the actual donor stats are taken from the
    // original team species. E.g. a Mega Stone can make a Pokemon eligible as
    // a God without giving every receiver that Mega's higher base stats.
    function godlyGiftStatDonor(dex, set) {
        if (!dex?.species?.get || !set?.species) return null;
        let species = dex.species.get(set.species);
        if (!species?.exists) return null;
        if (typeof species.battleOnly === 'string') {
            const prior = dex.species.get(species.battleOnly);
            if (prior?.exists) species = prior;
        }
        return species;
    }

    function godlyGiftDonation(room, set) {
        const team = room?.curSetList;
        if (!godlyGiftReady(room) || !set || !Array.isArray(team) || !team.length) return null;
        const index = team.indexOf(set);
        if (index < 0 || index >= STATS.length) return null;
        const godSet = findGodSet(room) || team[0];
        const donor = godlyGiftStatDonor(room.curTeam.dex, godSet);
        if (!donor?.baseStats) return null;
        const stat = STATS[index];
        return {stat, value: donor.baseStats[stat]};
    }

    function godlyGiftBaseStats(room, set, from) {
        const dex = room?.curTeam?.dex;
        const species = dex?.species?.get?.(set?.species);
        if (!species?.exists) return null;
        const stats = copy(from || species.baseStats);
        const donation = godlyGiftDonation(room, set);
        if (donation) {
            stats[donation.stat] = donation.value;
            if (dex.gen === 1 && (donation.stat === 'spa' || donation.stat === 'spd')) {
                stats.spa = donation.value;
                stats.spd = donation.value;
            }
        }
        return stats;
    }

    function getGodlyGiftIllegalChecker(room) {
        if (!isGodlyGiftFormat(room) || !godlyGiftReady(room)) return null;
        const ignoreSet = room.curChartName === 'pokemon' ? room.curSet : null;
        const godSet = findGodSet(room, {ignoreSet, powerConstruct: false});
        if (!godSet) return null;
        const godSpecies = resolveGodSpecies(room.curTeam.dex, godSet);
        if (!godSpecies) return null;
        const godId = godBaseId(godSpecies);
        return (species) => isGodlyGiftRestricted(species, room) && godBaseId(species) !== godId;
    }

    // ---------- in-battle stat guesser ----------

    // Mods the in-battle EV/nature guesser knows how to apply.
    const BATTLE_GUESSER_MODS = new Set([
        MOD.TIER_SHIFT, MOD.SCALEMONS, MOD.FLIPPED, MOD.THREE_FIFTY_CUP,
        MOD.FRANTIC_FUSIONS, MOD.NATURE_SWAP, MOD.REEVOLUTION,
    ]);

    function statGuesserFormat(format) {
        const base = String(format || '').split('@@@')[0].trim();
        if (!base) return '';
        const resolved = resolveFormatKey(base) || toID(base);
        const team = getActiveTeambuilderRoom()?.curTeam;
        const gen = formatGeneration(resolved, team?.dex?.gen || team?.gen || Dex.gen || 9);
        // Dex.mod expects an actual Dex generation/mod, not a challenge-code
        // nickname (e.g. STAAABnB). Do not create a fake gen9staaabnb mod.
        // The QOL stat wrappers independently supply modified base stats.
        return `gen${gen}`;
    }

    // The native constructor passes the first four characters straight to
    // Dex.mod. Give that consumer an ID, while preserving the imported code.
    function patchBattleStatGuesserConstructor() {
        const Guesser = window.BattleStatGuesser;
        if (!Guesser) return false;
        if (Guesser.__qolFormatPatched) return true;
        const Wrapped = new Proxy(Guesser, {
            construct(target, args, newTarget) {
                const [format, ...rest] = args;
                const guesser = Reflect.construct(target, [statGuesserFormat(format), ...rest], newTarget);
                guesser.__qolChallengeFormat = format;
                return guesser;
            },
        });
        Wrapped.__qolFormatPatched = true;
        window.BattleStatGuesser = Wrapped;
        return true;
    }

    function patchBattleStatGuesserGetStat() {
        return patchMethod(window.BattleStatGuesser?.prototype, 'getStat', '__qolBattlePatched', (original) =>
                           function (stat, set, evOverride, natureOverride) {
            const callOriginal = () => original.call(this, stat, set, evOverride, natureOverride);
            if (!set?.species || !this.dex?.species?.get) return callOriginal();

            if (isStatOverrideActive(this.dex, set.species)) return callOriginal();
            const mod = modFromFormat(this.__qolChallengeFormat || this.formatid);
            if (!BATTLE_GUESSER_MODS.has(mod)) return callOriginal();

            const baseStats = computeModBaseStats(mod, {dex: this.dex, set});
            return baseStats ? withSpeciesBaseStats(this.dex, set.species, baseStats, callOriginal) : callOriginal();
        }
                          );
    }

    // In-battle EV/nature optimizer (Godly Gift only).
    function patchBattleStatGuesserGuess() {
        return patchMethod(window.BattleStatGuesser?.prototype, 'guess', '__qolGodlyGiftPatched', (original) =>
                           function (set) {
            const callOriginal = () => original.call(this, set);

            const room = getTeambuilderRoom();
            if (!isGodlyGiftFormat(room) || !set?.species || !this.dex?.species?.get) return callOriginal();
            if (isStatOverrideActive(this.dex, set.species)) return callOriginal();

            const baseStats = godlyGiftBaseStats(room, set);
            return baseStats ? withSpeciesBaseStats(this.dex, set.species, baseStats, callOriginal) : callOriginal();
        }
                          );
    }

    // ---------- in-battle hover speed range ----------

    // Modified base stats for a battle Pokémon, or null if the format has no mod.
    function speedRangeBaseStats(battle, pokemon, species) {
        const dex = battle.dex;
        const formatId = fmtId(battle.format?.id || battle.format?.name);
        let mod = modFromFormat(formatId);

        // Tier Shift can also be enabled via a rule rather than the format name.
        if (!mod && Object.keys(battle.rules || {}).some((r) => String(r).toLowerCase().includes('tier shift'))) {
            mod = MOD.TIER_SHIFT;
        }

        switch (mod) {
            case MOD.MIX_AND_MEGA: {
                const item = pokemon.item && dex?.items?.get?.(pokemon.item);
                const delta = item?.exists ? mixAndMegaStatDelta(dex, item, 'spe') : 0;
                return delta ? Object.assign({}, species.baseStats, {spe: species.baseStats.spe + delta}) : null;
            }
            case MOD.FRANTIC_FUSIONS: {
                const donor = dex?.species?.get(pokemon.name);
                if (!donor?.exists || donor.battleOnly || donor.id === species.id) return null;
                return Object.assign({}, species.baseStats, {
                    spe: clamp255(species.baseStats.spe + Math.floor(donor.baseStats.spe / 4)),
                });
            }
            case MOD.CROSS_EVOLUTION:
                return crossEvolutionBaseStats(dex, {species: species.name, name: pokemon.name});
            default:
                return SPECIES_STAT_MODIFIERS[mod]?.(species) || null;
        }
    }

    function wrapSpeedRange(original) {
        return function (pokemon, ...args) {
            const callOriginal = () => original.call(this, pokemon, ...args);

            const species = pokemon?.getSpecies?.();
            if (!species?.baseStats || !this.battle) return callOriginal();

            const baseStats = speedRangeBaseStats(this.battle, pokemon, species);
            if (!baseStats) return callOriginal();

            return withOverriddenGetSpecies(pokemon, Object.assign({}, species, {baseStats}), callOriginal);
        };
    }

    function patchTooltipSpeedRange() {
        const candidates = [];

        if (window.BattleTooltips?.prototype) candidates.push(window.BattleTooltips.prototype);
        for (const room of Object.values(window.app?.rooms || {})) {
            if (room?.tooltips) candidates.push(room.tooltips);
        }
        if (!candidates.length) return false;

        let patchedAny = false;
        const seenProtos = new Set();

        for (const tooltips of candidates) {
            if (typeof tooltips.getSpeedRange !== 'function') continue;

            const proto = findPrototypeWithMethod(tooltips, 'getSpeedRange');
            if (!proto || seenProtos.has(proto)) continue;
            seenProtos.add(proto);

            if (patchMethod(proto, 'getSpeedRange', '__qolSpeedRangePatched', wrapSpeedRange)) {
                patchedAny = true;
            }
        }

        return patchedAny;
    }

    // ---------- DOM decorators ----------
    //
    // Rewrite suggestion rows after they render (so it doesn't matter how the
    // client builds them). One shared MutationObserver runs every decorator,
    // throttled to once per animation frame.

    // Donor icon at the end of the row. Absolutely positioned so it doesn't
    // disturb the column layout, and pointer-events:none so clicks pass through.
    function decorateDonorIcons() {
        const typed = getTeambuilderRoom()?.search?.engine?.typedSearch;
        const type = typed?.searchType;
        const donors = typed?.__qolConvDonors;

        if ((type !== 'move' && type !== 'ability') || !donors || !Object.keys(donors).length) return;

        for (const a of document.querySelectorAll(`li.result > a[data-entry^="${type}|"]`)) {
            const li = a.parentElement;
            if (li.querySelector(':scope > .qol-donor')) continue;

            const donorId = donors[toID(a.getAttribute('data-entry').slice(type.length + 1))];
            if (!donorId) continue;

            const badge = document.createElement('span');
            badge.className = 'qol-donor';
            badge.title = `Shared by ${typed.dex.species.get(donorId)?.name || donorId}`;
            badge.style.cssText =
                'position:absolute;right:4px;top:50%;margin-top:-15px;' +
                'pointer-events:none;transform:scale(.8);transform-origin:right center;';
            badge.innerHTML = pokemonIconHtml(donorId);

            li.style.position = 'relative';
            li.appendChild(badge);
        }
    }

    // Move search: our "mvf ..." suggestion rows, plus "!" on native type/category rows.
    function decorateMoveFilterRows() {
        const engine = getTeambuilderRoom()?.search?.engine;
        if (engine?.typedSearch?.searchType !== 'move') return;

        const bang = engine.__qolMoveNegate ? '!' : '';

        for (const a of document.querySelectorAll('li.result > a[data-entry]')) {
            const entry = a.getAttribute('data-entry') || '';

            if (entry.startsWith('ability|') && entry.slice(8).toLowerCase().startsWith(MOVE_ROW_PREFIX)) {
                if (a.querySelector('.qol-done')) continue;
                const info = moveFilterRowInfo(entry.slice(8));
                if (!info) continue;

                if (info.desc) a.title = info.desc;
                a.innerHTML = filterRowHtml(
                    info.label, currentSearchQuery(engine), bang,
                    info.iconsHtml
                    ? `<span class="col typecol" style="width:auto;white-space:nowrap">${info.iconsHtml}</span> `
                    : ''
                );
            } else if (bang && (entry.startsWith('type|') || entry.startsWith('category|'))) {
                const name = a.querySelector('.namecol');
                if (name && !name.dataset.qolNeg) {
                    name.dataset.qolNeg = '1';
                    name.insertBefore(document.createTextNode('!'), name.firstChild);
                }
            }
        }
    }

        // Length of the label prefix the query matches (0 if it matched an alias / key instead).
    function prefixMatchEnd(label, query) {
        const q = toSearchId(query);
        if (!q || !toSearchId(label).startsWith(q)) return 0;
        let seen = 0;
        for (let i = 0; i < label.length; i++) {
            if (/[a-z0-9]/i.test(label[i]) && ++seen === q.length) return i + 1;
        }
        return 0;
    }

    // `prefix` ("Not ", "!") is shown but never highlighted.
    function highlightedLabel(label, start, end, prefix = '') {
        const esc = BattleLog.escapeHTML;
        const s = Math.max(0, Math.min(label.length, Number(start) || 0));
        const e = Math.max(s, Math.min(label.length, Number(end) || 0));
        return esc(prefix) + (e > s
            ? esc(label.slice(0, s)) + '<b>' + esc(label.slice(s, e)) + '</b>' + esc(label.slice(e))
            : esc(label));
    }

    // What's typed in the search box, as the engine stored it (our bypass keys carry a prefix).
    function currentSearchQuery(engine) {
        return toSearchId(String(engine?.query || '').replace(/^mv:/, ''));
    }

    // Native-looking suggestion row: label with the typed prefix highlighted, then the "Filter" tag.
    function filterRowHtml(label, query, prefix = '', extraHtml = '') {
        return `<span class="col namecol qol-done">${highlightedLabel(label, 0, prefixMatchEnd(label, query), prefix)}</span> ` +
            extraHtml + '<span class="col filtercol"><em>Filter</em></span>';
    }

    function pokemonFilterRowLabel(rawId, negated) {
        const id = String(rawId).toLowerCase();
        const dex = getTeambuilderRoom()?.search?.engine?.dex;
        const color = colorRowName(id);
        if (color) return `${negated ? 'Not ' : ''}${color}`;

        if (id.startsWith(CUSTOM_TOGGLE_PREFIX)) {
            const label = CUSTOM_TOGGLE_FILTERS[id.slice(CUSTOM_TOGGLE_PREFIX.length)];
            return label ? (negated ? 'Not ' : '') + label : null;
        }
        if (id.startsWith(INTO_PREFIX.toLowerCase())) {
            const sp = dex?.species?.get(id.slice(INTO_PREFIX.length));
            return sp?.exists ? `Into ${sp.name}` : null;
        }
        if (id.startsWith(FROM_PREFIX.toLowerCase())) {
            const sp = dex?.species?.get(id.slice(FROM_PREFIX.length));
            return sp?.exists ? `${sp.name} Into` : null;
        }
        if (isStoneRowId(id)) {
            const item = dex?.items?.get(id.slice(STONE_PREFIX.length));
            return item?.exists ? item.name : null;
        }
        return null;
    }

    // Pokémon search: rewrites our toggle / into / from rows, and re-adds the
    // "Weak " / "!" prefixes on native type rows if the render hook missed them.
    function decoratePokemonFilterRows() {
        const engine = getTeambuilderRoom()?.search?.engine;
        if (engine?.typedSearch?.searchType !== 'pokemon') return;

        const negated = !!engine.__qolNegateMode;
        const mode = engine.__qolEffectivenessMode;

        for (const a of document.querySelectorAll('li.result > a[data-entry]')) {
            const entry = a.getAttribute('data-entry') || '';
            const sep = entry.indexOf('|');
            if (sep < 0) continue;
            const kind = entry.slice(0, sep);
            const id = entry.slice(sep + 1);

            if (kind === 'ability') {
                if (a.querySelector('.qol-done')) continue;
                const label = pokemonFilterRowLabel(id, negated);
                if (label) {
                    const not = label.startsWith('Not ') ? 'Not ' : '';
                    a.innerHTML = filterRowHtml(label.slice(not.length), currentSearchQuery(engine), not);
                    continue;
                }

            }

            const name = a.querySelector('.namecol, .movenamecol');
            if (!name || name.dataset.qolPrefixed) continue;
            name.dataset.qolPrefixed = '1';

            let prefix = '';
            if (mode && kind === 'type') prefix = (negated ? '!' : '') + EFFECT_LABELS[mode] + ' ';
            else if (!mode && negated && ['type', 'ability', 'move', 'tier'].includes(kind)) prefix = '!';

            if (prefix && !name.textContent.startsWith(prefix.trim())) {
                name.insertBefore(document.createTextNode(prefix), name.firstChild);
            }
        }
    }

    // Shift details are attached to the original search result, not a second
    // selectable result. Avoid mousemove (and the consequent rerender loop).
    const DOM_DECORATORS = [
        ['donor icons', decorateDonorIcons],
        ['move filter rows', decorateMoveFilterRows],
        ['pokemon filter rows', decoratePokemonFilterRows],
        ['move prio header', decorateMovePrioHeader],
        ['item sort row', decorateItemSortRow],
        ['self challenge button', installSelfChallengeButton],
        ['import format button', installImportFormatButton],
        ['custom format names', decorateCustomFormatNames],
        ['teambuilder stats button', installTeambuilderStatsButton],
        ['imported format selection', installImportedFormatClick],
        ['custom format dropdown', decorateCustomFormatDropdown],
    ];

    let domDecoratorsInstalled = false;
    function installDomDecorators() {
        if (domDecoratorsInstalled) return;
        domDecoratorsInstalled = true;

        let scheduled = false;

        // documentElement itself can still be null at userscript document-start.
        new MutationObserver(() => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => {
                scheduled = false;
                for (const [name, decorate] of DOM_DECORATORS) {
                    try {
                        decorate();
                    } catch (e) {
                        console.error(LOG, `Decorator "${name}" failed:`, e);
                    }
                }
            });
        }).observe(document, {childList: true, subtree: true});
    }


    // ====================================================================
    // SELF CHALLENGE
    //   Main account challenges a throwaway guest over a 2nd WebSocket and
    //   you choose for both sides. Session is persisted so a reload resumes.
    // ====================================================================

    const SELF = {
        STORE: 'qol-self-session',
        PREFS: 'qol-self-prefs',
        MAX_AGE: 6 * 60 * 60 * 1000,
    };

    const selfEsc = (s) => BattleLog.escapeHTML(String(s ?? ''));
    const selfWsUrl = () =>
    `wss://${window.Config?.defaultserver?.host || 'sim3.psim.us'}/showdown/websocket`;

    const SELF_CHALLENGE_MOD_RULES = Object.fromEntries(MOD_DEFINITIONS
                                                        .filter((definition) => definition.challengeRule)
                                                        .map((definition) => [definition.id, definition.challengeRule]));

    function selfChallengeFormat(format) {
        if (String(format || '').includes('@@@')) return format;
        const [base, ruleText = ''] = String(format || '').split('@@@');
        const baseMod = window.BattleFormats?.[base]?.mod;
        const gen = formatGeneration(baseMod, formatGeneration(base, getActiveTeambuilderRoom()?.curTeam?.gen || Dex.gen || 9));
        const rules = new Map();
        for (const mod of modsFromFormatString(base)) {
            const rule = SELF_CHALLENGE_MOD_RULES[mod];
            if (rule) rules.set(rule, rule);
        }
        for (const rule of ruleText.split(',').map(squash).filter((token) => token && !isBanRule(token))) {
            rules.set(rule.toLowerCase(), rule);
        }
        const customRules = [...rules.values()];
        return `gen${gen}customgame${customRules.length ? '@@@' + customRules.join(',') : ''}`;
    }

    function selfLoad(key) {
        try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
    }
    function selfSave(key, value) {
        try {
            if (value == null) localStorage.removeItem(key);
            else localStorage.setItem(key, JSON.stringify(value));
        } catch (e) { /* storage unavailable */ }
    }

    function selfPackedOf(t) {
        let sets = Array.isArray(t?.team) ? t.team : null;
        if (!sets) {
            let packed = '';
            try { packed = Storage.getPackedTeam?.(t) || ''; } catch (e) { /* use the stored packed team */ }
            if (!packed && typeof t?.team === 'string') packed = t.team;
            if (!packed) return '';
            sets = Storage.unpackTeam?.(packed) || null;
        }
        if (!Array.isArray(sets)) return '';
        const zeroEVs = {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0};
        return Storage.packTeam(sets.map((set) => set.evs == null ? {...set, evs: zeroEVs} : set));
    }

    // ---------- session ----------

    function runSelfSession(cfg) {
        cfg = {...cfg, format: selfChallengeFormat(cfg.format)};
        const origReceive = app.receive;
        const origSend = app.send;
        const S = {
            roomid: cfg.roomid || null, ws: null, over: false, stopping: false, bannerOn: false,
            req: {p1: null, p2: null}, fresh: {p1: false, p2: false},
            round: [], queue: [], choice: {p1: null, p2: null}, summary: {p1: '', p2: ''},
            current: null, flushed: false, timers: [], retries: 0,
        };
        window.qolSelf = S;

        const log = (...a) => console.log('[self]', ...a);
        const needs = (r) => !!r && !r.wait;
        const room = () => app.rooms?.[S.roomid];
        const later = (fn, ms) => { const t = setTimeout(fn, ms); S.timers.push(t); return t; };
        const toast = (msg) => { try { app.addPopupMessage(msg); } catch (e) { console.warn('[self]', msg); } };

        const persist = () => selfSave(SELF.STORE, {
            format: cfg.format, packedA: cfg.packedA, packedB: cfg.packedB,
            wantName: cfg.wantName, roomid: S.roomid, savedAt: Date.now(),
        });
        const setRoom = (rid) => { if (S.roomid) return; S.roomid = rid; persist(); };

        // ---- silence the challenge PM ----
        const ownIds = () => [cfg.wantName, S.ws?.name].filter(Boolean).map(toSearchId);
        const isNoise = (line) => {
            const ids = ownIds();
            if (line.startsWith('|pm|')) {
                if (/\/error|rejected/i.test(line)) return false;
                const p = line.split('|');
                return ids.includes(toSearchId(p[2])) || ids.includes(toSearchId(p[3]));
            }
            if (line.startsWith('|updatechallenges|')) {
                const flat = toSearchId(line);
                return ids.some((id) => flat.includes(id));
            }
            return false;
        };

        // ---- banner ----
        const SIDE_COLOR = {p1: '#2b6cb0', p2: '#c53030'};
        function renderBanner() {
            const host = room()?.el?.querySelector?.('.battle-controls') || document.querySelector('.battle-controls');
            if (!host) return;
            let el = host.querySelector(':scope > .qol-self-banner');
            if (!S.bannerOn || S.over || !S.current) { el?.remove(); return; }

            const side = S.current;
            const r = S.req[side];
            const mon = r?.teamPreview ? 'Team preview' : (r?.side?.pokemon?.find((p) => p.active)?.details || '').split(',')[0];
            const idx = S.round.indexOf(side);
            const step = S.round.length > 1 && idx >= 0 ? `${idx + 1}/${S.round.length} · ` : '';
            const other = S.round.find((s) => s !== side && S.choice[s]);
            const locked = other ? `${other.toUpperCase()} locked: ${S.summary[other]}` : '';
            const back = idx > 0 && !S.flushed;
            const key = [side, mon, step, locked, back].join('|');
            if (el?.dataset.key === key) return;
            if (!el) { el = document.createElement('div'); el.className = 'qol-self-banner'; host.prepend(el); }
            el.dataset.key = key;
            el.style.cssText = `background:${SIDE_COLOR[side]};color:#fff;padding:4px 8px;margin:0 0 4px;border-radius:4px;` +
                'font-size:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap';
            el.innerHTML = `<span><b>${step}Choosing for ${side.toUpperCase()}</b> — ${selfEsc(mon)}</span>` +
                (locked ? `<span style="opacity:.85">${selfEsc(locked)}</span>` : '') +
                (back ? '<button class="button" data-qol-self-back style="margin-left:auto;padding:4px 10px;cursor:pointer">← Back</button>' : '');
        }

        let raf = 0;
        const mo = new MutationObserver(() => {
            if (raf) return;
            raf = requestAnimationFrame(() => { raf = 0; renderBanner(); });
        });
        mo.observe(document.body, {childList: true, subtree: true});

        const onClick = (e) => {
            if (!e.target.closest?.('[data-qol-self-back]')) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            S.back();
        };
        document.addEventListener('click', onClick, true);

        const describe = (side, data) => {
            const body = data.replace(/^\/(choose|team)\s+/, '').split('|')[0].trim();
            const r = S.req[side];
            let m = body.match(/^move\s+(\S+)(.*)$/);
            if (m) {
                const mv = r?.active?.[0]?.moves?.[Number(m[1]) - 1];
                return (mv?.move || m[1]) + (m[2].trim() ? ` (${m[2].trim()})` : '');
            }
            m = body.match(/^switch\s+(\d+)/);
            if (m) return 'switch to ' + (r?.side?.pokemon?.[Number(m[1]) - 1]?.details?.split(',')[0] || m[1]);
            if (/^\d/.test(body)) return 'team order ' + body;
            return body;
        };

        // ---- show a side's request in the room, always from P1's point of view ----
        function inject(side) {
            S.current = side;
            S.bannerOn = true;
            let tries = 0;
            const go = () => {
                if (S.over) return;
                const rm = room();
                if (rm?.battle?.atQueueEnd === false && tries++ < 50) return setTimeout(go, 100);
                const r = S.req[side];
                const shown = r?.side ? {...r, side: {...r.side, id: 'p1'}} : r;
                origReceive.call(app, `>${S.roomid}\n|request|${JSON.stringify(shown)}`);
                renderBanner();
                log('showing', side);
            };
            setTimeout(go, 30);
        }

        S.back = () => {
            const i = S.round.indexOf(S.current);
            if (S.flushed || i <= 0) return;
            const prev = S.round[i - 1];
            S.choice[prev] = null;
            S.summary[prev] = '';
            S.queue = S.round.slice(i - 1);
            inject(prev);
        };

        function tryStartRound() {
            if (!(S.fresh.p1 && S.fresh.p2)) return;
            S.fresh = {p1: false, p2: false};
            S.choice = {p1: null, p2: null};
            S.summary = {p1: '', p2: ''};
            S.flushed = false;
            S.queue = ['p1', 'p2'].filter((s) => needs(S.req[s]));
            S.round = S.queue.slice();
            persist(); // refresh savedAt
            log('round', {rqid: [S.req.p1?.rqid, S.req.p2?.rqid], needs: S.round});
            if (S.queue.length) inject(S.queue[0]); else { S.bannerOn = false; renderBanner(); }
        }

        function onRequest(side, r) {
            // Same rqid again (reconnect / room.request fallback) is not a new round.
            const dup = S.req[side]?.rqid != null && S.req[side].rqid === r.rqid;
            S.req[side] = r;
            if (dup) return;
            S.fresh[side] = true;
            tryStartRound();
        }

        const sendTo = (side, data) =>
        side === 'p1' ? origSend.call(app, data, S.roomid) : S.ws.send(S.roomid + '|' + data);

        function flush() {
            S.flushed = true;
            S.bannerOn = false;
            renderBanner();
            for (const side of ['p1', 'p2']) if (S.choice[side]) sendTo(side, S.choice[side]);
            log('sent', {...S.choice});
        }

        function finish() {
            if (S.over) return;
            S.over = true;
            S.bannerOn = false;
            renderBanner();
            setTimeout(() => S.stop(), 500);
        }

        // ---- main connection hooks ----
        const wrappedReceive = function (data) {
            try {
                // Drop the PM / challenge traffic involving the guest.
                if (typeof data === 'string' && !data.startsWith('>') && /\|(pm|updatechallenges)\|/.test(data)) {
                    const lines = data.split('\n');
                    const kept = lines.filter((l) => !isNoise(l));
                    if (kept.length < lines.length) {
                        data = kept.join('\n');
                        if (!data.trim()) return;
                    }
                }
                if (typeof data === 'string' && !S.roomid && /\|popup\|[^\n]*rejected/i.test(data)) {
                    setTimeout(() => S.stop(), 0);
                }

                if (typeof data === 'string' && data.startsWith('>battle-')) {
                    const nl = data.indexOf('\n');
                    const rid = data.slice(1, nl);
                    if (!S.roomid && S.ws?.name && data.includes('|title|') && data.includes(S.ws.name)) setRoom(rid);
                    if (rid === S.roomid) {
                        for (const l of data.slice(nl + 1).split('\n')) {
                            if (l.startsWith('|request|') && l.length > 9) onRequest('p1', JSON.parse(l.slice(9)));
                            else if (S.flushed && /^\|error\|\[(Invalid|Unavailable) choice\]/.test(l)) setTimeout(() => inject('p1'), 80);
                            else if (/^\|(win|tie)\|/.test(l)) finish();
                        }
                    }
                }
            } catch (e) { console.error('[self] receive hook', e); }
            return origReceive.call(this, data);
        };
        wrappedReceive.__original = origReceive; // keeps the userscript's patchLoop from re-wrapping
        app.receive = wrappedReceive;

        app.send = function (data, rm) {
            const id = typeof rm === 'string' ? rm : rm?.id;
            if (S.roomid && id === S.roomid && typeof data === 'string' && /^\/(choose|team)\b/.test(data)) {
                const side = S.current;
                if (S.flushed) { sendTo(side, data); S.bannerOn = false; renderBanner(); return; } // re-choice after an error
                if (S.queue[0] === side) {
                    S.choice[side] = data;
                    S.summary[side] = describe(side, data);
                    S.queue.shift();
                    if (S.queue.length) inject(S.queue[0]); else flush();
                    return;
                }
            }
            return origSend.apply(this, arguments);
        };

        // ---- guest P2 ----
        async function onGuestMessage(ws, s) {
            if (S.stopping) console.log('[self] guest reply while stopping:', s.slice(0, 300));
            // Surface the guest's own errors (e.g. "Your team was rejected...") on the main client.
            if (!s.startsWith('>')) {
                const popup = s.split('\n').find((l) => l.startsWith('|popup|'));
                if (popup) {
                    origReceive.call(app, '|popup|Opponent (P2) team:||' + popup.slice(7));
                    if (!S.roomid && /rejected/i.test(popup)) later(() => S.stop(), 0);
                }
            }
            const ch = s.match(/\|challstr\|([^\n]+)/);
            if (ch && !ws.requested) {
                ws.requested = true;
                const url = `https://play.pokemonshowdown.com/action.php?act=getassertion&userid=${toSearchId(ws.wantName)}&challstr=${encodeURIComponent(ch[1])}`;
                const assertion = (await (await fetch(url)).text()).trim();
                if (assertion.startsWith(';')) {
                    toast('Could not log in the guest opponent.');
                    return S.stop();
                }
                ws.send(`|/trn ${ws.wantName},0,${assertion}`);
            }

            const u = s.match(/\|updateuser\| ?([^|]+)\|1\|/);
            if (u && !ws.name && toSearchId(u[1]) === toSearchId(ws.wantName)) {
                ws.name = u[1].trim();
                S.retries = 0;
                if (S.roomid) onGuestResumed(); else startChallenge(ws);
            }

            if (s.startsWith('>battle-')) {
                const nl = s.indexOf('\n');
                const rid = s.slice(1, nl);
                setRoom(rid);
                if (rid !== S.roomid) return;
                for (const l of s.slice(nl + 1).split('\n')) {
                    if (l.startsWith('|request|') && l.length > 9) onRequest('p2', JSON.parse(l.slice(9)));
                    else if (l.startsWith('|error|')) {
                        origReceive.call(app, `>${S.roomid}\n|error|P2: ${l.slice(7)}`);
                        if (S.flushed && /\[(Invalid|Unavailable) choice\]/.test(l)) setTimeout(() => inject('p2'), 80);
                    } else if (/^\|(win|tie)\|/.test(l)) finish();
                }
            }
        }

        function startChallenge(ws) {
            ws.send('|/utm ' + cfg.packedB);
            origSend.call(app, '/utm ' + cfg.packedA);
            origSend.call(app, `/challenge ${ws.name}, ${cfg.format}`);
            const accept = () => { if (!S.roomid && !S.stopping) ws.send(`|/accept ${app.user.get('name')}`); };
            later(accept, 500);
            later(accept, 4000);
            log('challenging', ws.name, cfg.format);
        }

        // Reload / reconnect: the server rejoins both players to the battle on its own,
        // so we only need requests from both sides again.
        function onGuestResumed() {
            log('guest reconnected, resuming', S.roomid);
            const p1Fallback = () => {
                const r = room()?.request;
                if (!S.req.p1 && r?.side) onRequest('p1', r); // request arrived before our hook was installed
            };
            later(p1Fallback, 2500);
            later(p1Fallback, 6000);
            later(() => {
                if (S.req.p2 || S.over) return;
                toast('The self-battle could not be resumed (it may have ended).');
                S.stop();
            }, 20000);
        }

        function connect() {
            if (S.stopping) return;
            const ws = new WebSocket(selfWsUrl());
            S.ws = ws;
            ws.wantName = cfg.wantName;
            ws.onmessage = (e) => {
                onGuestMessage(ws, String(e.data)).catch((err) => console.error('[self] guest', err));
            };
            ws.onclose = () => {
                if (S.stopping || S.over || S.ws !== ws) return;
                if (!S.roomid || ++S.retries > 5) { log('guest connection lost'); return; }
                later(connect, 2000); // keep the same name; the server puts us back in the battle
            };
        }

        S.stop = (opts = {}) => {
            if (S.stopping) return;
            const ws = S.ws;
            log('stop requested', {forfeit: !!opts.forfeit, wsState: ws?.readyState, roomid: S.roomid});

            S.stopping = true;
            S.over = true;
            S.bannerOn = false;
            S.timers.forEach(clearTimeout);
            app.receive = origReceive;
            app.send = origSend;
            document.removeEventListener('click', onClick, true);
            mo.disconnect();
            renderBanner();

            let closeDelay = 0;
            if (opts.forfeit) {
                if (ws?.readyState === WebSocket.OPEN && S.roomid) {
                    ws.send(`${S.roomid}|Match stopped.`);
                    setTimeout(() => { try { ws.send(`${S.roomid}|/forfeit`); } catch (e) { /* closed */ } }, 300);
                    closeDelay = 1500; // keep the socket open until the forfeit has gone through
                } else {
                    log('could not forfeit: guest socket not open or no room id');
                }
            }
            setTimeout(() => { try { ws?.close(); } catch (e) { /* already closed */ } }, closeDelay);

            if (!opts.keepSession) selfSave(SELF.STORE, null);
            log('stopped');
        };

        persist();
        connect();
        return S;
    }

    function startSelfChallenge(cfg) {
        if (window.qolSelf && !window.qolSelf.over) {
            app.addPopupMessage('A self-battle is already running.');
            return;
        }
        if (!app.user?.get?.('named')) {
            app.addPopupMessage('Log in before challenging yourself.');
            return;
        }
        runSelfSession({
            ...cfg,
            wantName: `QolB${Math.floor(Math.random() * 90000 + 10000)}`,
            roomid: null,
        });
    }

    // Called once at boot: picks a saved session back up after a reload.
    function resumeSelfChallenge() {
        const saved = selfLoad(SELF.STORE);
        if (!saved) return;
        if (!saved.roomid || !saved.wantName || Date.now() - (saved.savedAt || 0) > SELF.MAX_AGE) {
            selfSave(SELF.STORE, null);
            return;
        }

        let tries = 0;
        const timer = setInterval(() => {
            const ready = window.app?.receive && window.app.send && window.BattleLog && document.body;
            if (!ready) {
                if (++tries > 1200) clearInterval(timer); // ~60s
                return;
            }
            clearInterval(timer);
            if (window.qolSelf && !window.qolSelf.over) return;
            try {
                runSelfSession(saved);
            } catch (e) {
                console.error('[self] resume failed:', e);
            }
        }, 50);
    }

    // ---------- popup (Showdown's own Popup so it matches the client) ----------

    let selfPopupClass = null;

    function selfTeamEntries() {
        const out = [];
        (window.Storage?.teams || []).forEach((t, index) => {
            const formatKey = toSearchId(t?.format);
            if (!t || !formatKey || !selfPackedOf(t)) return;
            out.push({index, t, formatKey, raw: String(t.format)});
        });
        return out;
    }

    function getSelfPopupClass() {
        if (selfPopupClass) return selfPopupClass;

        selfPopupClass = window.Popup.extend({
            type: 'semimodal',

            events: {
                'submit form': 'submit',
                'change select[name=format]': 'fillTeams',
                'click button[data-qol=cancel]': 'cancelSelf',
                'click button[data-qol=stop]': 'stopSelf',
            },

            initialize() {
                const running = window.qolSelf && !window.qolSelf.over;
                if (running) {
                    this.$el.html(
                        '<div style="width:min(300px,78vw)">' +
                        '<p><strong>Self-battle in progress</strong></p>' +
                        '<p class="buttonbar">' +
                        '<button type="button" data-qol="stop" class="button">Stop self-battle</button> ' +
                        '<button type="button" data-qol="cancel" class="button">Close</button></p></div>'
                    );
                    return;
                }

                this.entries = selfTeamEntries();
                this.formats = new Map();
                for (const e of this.entries) {
                    if (!this.formats.has(e.formatKey)) {
                        this.formats.set(e.formatKey, {raw: e.raw, name: displayFormatName(e.raw)});
                    }
                }

                if (!this.entries.length) {
                    this.$el.html(
                        '<div style="width:min(300px,78vw)"><p>You need at least one saved team in the Teambuilder.</p>' +
                        '<p class="buttonbar"><button type="button" data-qol="cancel" class="button">Close</button></p></div>'
                    );
                    return;
                }

                const prefs = selfLoad(SELF.PREFS) || {};
                const keys = [...this.formats.keys()].sort((a, b) =>
                                                           this.formats.get(a).name.localeCompare(this.formats.get(b).name));
                const formatOptions = keys.map((k) =>
                                               `<option value="${selfEsc(k)}">${selfEsc(this.formats.get(k).name)}</option>`).join('');
                const sel = 'class="button" style="width:100%;box-sizing:border-box"';

                this.$el.html(
                    '<form style="width:min(300px,78vw)">' +
                    '<p><strong>Challenge Yourself</strong></p>' +
                    `<p><label class="label">Format<br><select name="format" ${sel}>${formatOptions}</select></label></p>` +
                    `<p><label class="label">Your team<br><select name="teamA" ${sel}></select></label></p>` +
                    `<p><label class="label">Opponent's team<br><select name="teamB" ${sel}></select></label></p>` +
                    '<p class="buttonbar"><button type="submit" class="button"><strong>Challenge</strong></button> ' +
                    '<button type="button" data-qol="cancel" class="button">Cancel</button></p></form>'
                );

                if (prefs.formatKey && this.formats.has(prefs.formatKey)) this.$('select[name=format]').val(prefs.formatKey);
                this.fillTeams(null, prefs);
            },

            // Called on format change (event arg first) and once from initialize (prefs second).
            fillTeams(e, prefs) {
                const key = this.$('select[name=format]').val();
                const list = this.entries.filter((en) => en.formatKey === key);
                const opts = list.map((en) =>
                                      `<option value="${en.index}">${selfEsc((en.t.folder ? en.t.folder + '/' : '') + en.t.name)}</option>`).join('');
                const a = this.$('select[name=teamA]').html(opts);
                const b = this.$('select[name=teamB]').html(opts);
                if (!list.length) return;

                const byName = (name) => list.find((en) => en.t.name === name);
                const pickA = byName(prefs?.nameA) || list[0];
                const pickB = byName(prefs?.nameB) || list[1] || list[0];
                a.val(String(pickA.index));
                b.val(String(pickB.index));
            },

            submit(e) {
                e.preventDefault();
                e.stopPropagation();
                const key = this.$('select[name=format]').val();
                const teamA = Storage.teams[Number(this.$('select[name=teamA]').val())];
                const teamB = Storage.teams[Number(this.$('select[name=teamB]').val())];
                const fmt = this.formats.get(key);
                if (!teamA || !teamB || !fmt) return;

                selfSave(SELF.PREFS, {formatKey: key, nameA: teamA.name, nameB: teamB.name});
                this.close();
                startSelfChallenge({format: fmt.raw, packedA: selfPackedOf(teamA), packedB: selfPackedOf(teamB)});
            },

            stopSelf() {
                window.qolSelf?.stop?.({forfeit: true});
                this.close();
            },

            cancelSelf() {
                this.close();
            },
        });

        return selfPopupClass;
    }

    function openSelfChallengePopup() {
        if (!window.app?.addPopup || !window.Popup) return;
        app.addPopup(getSelfPopupClass());
    }

    // ---------- main menu button (below Tournaments) ----------

    function installSelfChallengeButton() {
        if (IS_DAMAGE_CALC) return;

        const tournaments = document.querySelector('.menugroup button[value="/smogtours"]');
        const group = tournaments?.closest('.menugroup');
        if (!group || group.querySelector('#qol-self-challenge')) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.id = 'qol-self-challenge';
        button.className = 'button mainmenu4'; // same look as Tournaments
        Object.assign(button.style, {
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            paddingBlock: '4px',
        });
        button.textContent = 'Challenge Yourself';
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            try { openSelfChallengePopup(); } catch (err) { console.error('[self] popup failed:', err); }
        });

        const row = document.createElement('p');
        row.appendChild(button);
        const after = tournaments.closest('p');
        if (after) after.after(row); else group.appendChild(row);
    }


    // ====================================================================
    // IMPORT FORMAT
    //   Paste "/challenge <format> @@@ <rules>" (or "<format>@@@<rules>", or just rules) and the
    //   open team's format becomes that custom-rules format.
    //     - mods come from the rule names ("badnboostedmod" ...)
    //     - "-X" bans, "+X" unbans and "*X" restricts on top of the base format's own banlist
    //       (see getMergedBans), so Godly Gift's gods include your "*" Pokémon
    //   Saving and exporting are the normal client's job: it is just a format string.
    // ====================================================================

    const modLabel = (mod) => MOD_DEFINITION_BY_ID.get(mod)?.label || mod;
    const isBanRule = (token) => /^[!+*-]/.test(token);
    const squash = (text) => String(text || '').replace(/\s+/g, ' ').trim();

    const CUSTOM_FORMAT_LABELS_KEY = 'qol-custom-format-labels';
    const HIDDEN_IMPORTED_FORMATS_KEY = 'qol-hidden-imported-formats';
    const DELETED_IMPORTED_FORMATS_KEY = 'qol-deleted-imported-formats';
    const ULTRA_MIX_FORMAT = 'gen9ultramixandmega';
    function customFormatLabelKey(format) {
        const [base, rules] = String(format || '').split('@@@');
        if (!rules) return '';
        return String(format).trim();
    }
    function getCustomFormatLabels() {
        try {
            const labels = JSON.parse(localStorage.getItem(CUSTOM_FORMAT_LABELS_KEY) || '{}');
            return labels && typeof labels === 'object' && !Array.isArray(labels) ? labels : {};
        } catch (e) {
            return {};
        }
    }
    function getCustomFormatLabel(format) {
        const key = customFormatLabelKey(format);
        return key ? String(getCustomFormatLabels()[key] || '').trim() : '';
    }
    function saveCustomFormatLabel(format, label) {
        const key = customFormatLabelKey(format);
        if (!key) return;
        const labels = getCustomFormatLabels();
        const clean = squash(label);
        if (clean) labels[key] = clean;
        else delete labels[key];
        try { localStorage.setItem(CUSTOM_FORMAT_LABELS_KEY, JSON.stringify(labels)); }
        catch (e) { console.warn(LOG, 'Could not save custom format name:', e); }
        if (clean) {
            const hidden = getHiddenImportedFormatKeys().filter((entry) => entry !== key);
            try { localStorage.setItem(HIDDEN_IMPORTED_FORMATS_KEY, JSON.stringify(hidden)); }
            catch (e) { console.warn(LOG, 'Could not restore imported format:', e); }
            const deleted = getDeletedImportedFormatKeys().filter((entry) => entry !== key);
            try { localStorage.setItem(DELETED_IMPORTED_FORMATS_KEY, JSON.stringify(deleted)); }
            catch (e) { console.warn(LOG, 'Could not restore imported format:', e); }
        }
    }

    function getHiddenImportedFormatKeys() {
        try {
            const keys = JSON.parse(localStorage.getItem(HIDDEN_IMPORTED_FORMATS_KEY) || '[]');
            return Array.isArray(keys) ? keys.filter((key) => typeof key === 'string') : [];
        } catch (e) { return []; }
    }

    function getDeletedImportedFormatKeys() {
        try {
            const keys = JSON.parse(localStorage.getItem(DELETED_IMPORTED_FORMATS_KEY) || '[]');
            return Array.isArray(keys) ? keys.filter((key) => typeof key === 'string') : [];
        } catch (e) { return []; }
    }

    function importedFormatKey(format) {
        return customFormatLabelKey(format) || String(format || '').trim();
    }

    function importedCustomFormats({includeHidden = false} = {}) {
        const hidden = new Set(getHiddenImportedFormatKeys());
        const deleted = new Set(getDeletedImportedFormatKeys());
        const byKey = new Map();
        for (const [format, label] of Object.entries(getCustomFormatLabels())) {
            const key = importedFormatKey(format);
            if (!key || deleted.has(key)) continue;
            byKey.set(key, {format, key, label: squash(label), hidden: hidden.has(key)});
        }
        for (const team of window.Storage?.teams || []) {
            const format = String(team?.format || '');
            const key = customFormatLabelKey(format);
            if (!key || deleted.has(key) || byKey.has(key)) continue;
            byKey.set(key, {format: key, key, label: displayFormatName(key), hidden: hidden.has(key)});
        }
        const hasNamedUltraMix = [...byKey.values()].some((entry) => toSearchId(entry.label) === 'ultramix');
        if (!deleted.has(ULTRA_MIX_FORMAT) && !byKey.has(ULTRA_MIX_FORMAT) && !hasNamedUltraMix) byKey.set(ULTRA_MIX_FORMAT, {
            format: ULTRA_MIX_FORMAT, key: ULTRA_MIX_FORMAT, label: 'Ultra Mix', hidden: hidden.has(ULTRA_MIX_FORMAT),
        });
        return [...byKey.values()]
            .filter((entry) => entry.label && (includeHidden || !entry.hidden))
            .sort((a, b) => a.label.localeCompare(b.label) || a.format.localeCompare(b.format));
    }

    // Showdown's packed-team storage uses `format]name|team`. A custom-rule
    // format can itself contain those delimiters, which makes its own loader
    // split the line in the wrong place on the next page load. Store such
    // formats behind a delimiter-safe token and decode them after unpacking.
    const STORED_CUSTOM_FORMAT_PREFIX = 'qolcustomfmt_';
    function encodeStoredCustomFormat(format) {
        const text = String(format);
        // Ordinary custom rules are safe in Showdown's team metadata. Only
        // encode when the format itself contains a metadata delimiter; keeping
        // normal formats readable prevents opaque tokens leaking through if a
        // userscript update races the team's initial unpack.
        if (!text.includes('@@@') || (!text.includes(']') && !text.includes('|'))) return format;
        try {
            const encoded = btoa(unescape(encodeURIComponent(text)))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
            // Preserve the actual Gen prefix so Showdown's native unpacker
            // assigns the right generation *before* our decoder runs.
            return `gen${formatGeneration(text, window.Dex?.gen || 9)}${STORED_CUSTOM_FORMAT_PREFIX}${encoded}`;
        } catch (e) {
            return format;
        }
    }
    function decodeStoredCustomFormat(format) {
        const prefix = /^(?:gen\d+)?qolcustomfmt_/.exec(String(format || ''))?.[0];
        if (!prefix) return format;
        try {
            const encoded = String(format).slice(prefix.length)
            .replace(/-/g, '+').replace(/_/g, '/');
            const padded = encoded + '='.repeat((4 - encoded.length % 4) % 4);
            return decodeURIComponent(escape(atob(padded)));
        } catch (e) {
            return format;
        }
    }

    function recoverBrokenCustomFormatTeams() {
        const storage = window.Storage;
        if (!Array.isArray(storage?.teams) || !storage.teams.length) return false;
        let packed = '';
        try {
            packed = localStorage.getItem('showdown_teams_local') || localStorage.getItem('showdown_teams') || '';
        } catch (e) { return false; }
        if (!packed || !packed.includes('@@@')) return false;

        let changed = false;
        for (const line of packed.split('\n')) {
            const firstPipe = line.indexOf('|');
            const formatStart = /^\d+\[/.test(line) ? line.indexOf('[') + 1 : 0;
            const close = line.indexOf(']', formatStart);
            const teamPipe = close >= 0 ? line.indexOf('|', close + 1) : -1;
            if (firstPipe < 0 || close < 0 || teamPipe < 0 || close <= firstPipe) continue;
            const format = line.slice(formatStart, close);
            if (!format.includes('@@@')) continue;

            // Existing client versions may have parsed the first pipe inside
            // the format as the team separator. Its in-memory team field then
            // contains the remainder of the original serialized line.
            const brokenRemainder = line.slice(firstPipe + 1);
            const entry = storage.teams.find((team) => team?.team === brokenRemainder);
            if (!entry) continue;

            const location = line.slice(close + 1, teamPipe);
            const slash = location.lastIndexOf('/');
            entry.format = format;
            entry.name = slash >= 0 ? location.slice(slash + 1) : location;
            entry.folder = slash >= 0 ? location.slice(0, slash) : '';
            entry.team = line.slice(teamPipe + 1);
            entry.gen = formatGeneration(format, entry.gen || window.Dex?.gen || 9);
            changed = true;
        }
        return changed;
    }

    function patchCustomFormatStorage() {
        const storage = window.Storage;
        if (!storage) return false;
        const packed = patchMethod(storage, 'packAllTeams', '__qolSafeCustomFormatPack', (original) =>
                                   function (teams) {
            const safeTeams = (teams || []).map((team) => team?.format?.includes('@@@')
                                                ? {...team, format: encodeStoredCustomFormat(team.format)}
                                                : team);
            return original.call(this, safeTeams);
        });
        const unpacked = patchMethod(storage, 'unpackAllTeams', '__qolSafeCustomFormatUnpack', (original) =>
                                     function (...args) {
            const teams = original.apply(this, args);
            if (!Array.isArray(teams)) return teams;
            for (const team of teams) {
                if (!team) continue;
                const decoded = decodeStoredCustomFormat(team.format);
                if (decoded !== team.format) {
                    team.format = decoded;
                    team.gen = formatGeneration(decoded, team.gen || window.Dex?.gen || 9);
                }
            }
            return teams;
        });
        // Storage may have unpacked its teams before this patch was installed.
        // Decode legacy tokens in the live array too, especially after a script
        // update where the unpack hook can otherwise miss the first load.
        let decodedExisting = false;
        for (const team of storage.teams || []) {
            if (!team) continue;
            const decoded = decodeStoredCustomFormat(team.format);
            if (decoded === team.format) continue;
            team.format = decoded;
            team.gen = formatGeneration(decoded, team.gen || window.Dex?.gen || 9);
            decodedExisting = true;
        }
        if (decodedExisting) storage.saveTeams?.();
        const recovered = recoverBrokenCustomFormatTeams();
        if (recovered) storage.saveTeams?.();
        return packed && unpacked;
    }

    // "nationaldexgodlygift" -> "gen9nationaldexgodlygift" (the client's own format id), or null.
    function resolveFormatKey(text, preferredGeneration = null) {
        const raw = String(text || '').trim();
        const id = toSearchId(raw);
        if (!id) return null;
        const formats = window.BattleFormats || {};
        if (formats[id]) return id;

        // "[Gen 4] OU", "Gen 4 OU", and "gen4ou" resolve to the same key.
        const labelled = /^(?:\[\s*gen\s*(\d+)\s*\]|gen\s*(\d+))\s*(.+)$/i.exec(raw);
        if (labelled) {
            const gen = Number(labelled[1] || labelled[2]);
            const suffix = toSearchId(labelled[3]);
            if (Number.isInteger(gen) && gen > 0 && suffix) return `gen${gen}${suffix}`;
        }
        const explicitGen = /^gen(\d+)(.+)$/.exec(id);
        if (explicitGen) return id; // keep deliberate custom/legacy generation IDs
        const cur = getActiveTeambuilderRoom()?.curTeam;
        const preferred = preferredGeneration ?? formatGeneration(cur?.format, cur?.gen);
        if (Number.isInteger(preferred) && formats[`gen${preferred}${id}`]) return `gen${preferred}${id}`;

        // Also accept the client format's display name (e.g. "Gen 4 UU").
        const nameHit = Object.keys(formats).find((key) => toSearchId(formats[key]?.name) === id);
        if (nameHit) return nameHit;
        const genOf = (key) => formatGeneration(key, 0) || 0;
        const hits = Object.keys(formats).filter((key) => stripGen(key) === id)
            .sort((a, b) => genOf(b) - genOf(a));
        return hits[0] || null;
    }

    // "National Dex Godly Gift" / "National Dex Godly Gift + Custom": what the UI calls a format.
    function displayFormatName(format) {
        const [base, rules] = String(format || '').split('@@@');
        const baseKey = resolveFormatKey(base) || base;
        // Keep historical generation labels visible: a Gen 3 OU custom team
        // must not be confused with a current-generation OU team.
        const officialName = String(window.BattleFormats?.[baseKey]?.name || baseKey);
        const gen = formatGeneration(baseKey);
        const plainName = officialName.replace(/^\[Gen\s+\d+\]\s*/i, '');
        const name = gen && gen !== (window.Dex?.gen || 9) ? `[Gen ${gen}] ${plainName}` : plainName;
        return rules && rules.trim() ? getCustomFormatLabel(format) || name + ' + Custom' : name;
    }

    function decorateImportedFormatPicker() {
        if (IS_DAMAGE_CALC) return;
        const dropdown = window.app?.rooms?.formatdropdown || Object.values(window.app?.rooms || {}).find((room) =>
                                                                                                          room?.id === 'formatdropdown' || room?.el?.querySelector?.('.options-column')
                                                                                                         );
        // Showdown renders the format picker as a global popup, not an app room,
        // so on current clients there is no `rooms.formatdropdown` to inspect.
        const root = dropdown?.el || document.querySelector('.popupmenu');
        if (!root) return;
        // The format dropdown is shared and its parentElem shape differs between
        // Showdown client builds, so don't gate these rows on that wrapper.
        const formats = importedCustomFormats();
        const query = toSearchId(root.querySelector('input[name="search"]')?.value || '');
        const visibleFormats = formats
        .filter((entry) => !query || toSearchId(entry.label).includes(query));
        const findChallengeable = (container) => {
            const title = [...container.querySelectorAll('summary, button, h2, h3, [role="heading"]')]
            .find((el) => el.textContent.trim() === 'Challengeable OMs');
            return title?.closest('details, [role="group"], .format-section') || title?.parentElement || null;
        };
        let challengeable = findChallengeable(root) || findChallengeable(document);
        const host = root.querySelector('.options-column') || root.querySelector('.pad');
        if (!challengeable && host) {
            challengeable = document.createElement('details');
            challengeable.className = 'details qol-challengeable-oms';
            challengeable.open = true;
            const summary = document.createElement('summary');
            summary.textContent = 'Challengeable OMs';
            challengeable.appendChild(summary);
            host.appendChild(challengeable);
        }
        if (!challengeable) return;
        challengeable.querySelectorAll('.qol-challengeable-format, .qol-challengeable-om-ultramix')
            .forEach((button) => {
            const li = button.closest('li');
            if (li) li.remove(); else button.remove();
        });
        document.querySelectorAll('.qol-imported-oms').forEach((section) => section.remove());
        const nativeButton = challengeable.querySelector('button[name="selectFormat"]');
    }

    function installTeambuilderStatsButton() {
        if (IS_DAMAGE_CALC) return;
        const room = getTeambuilderRoom();
        const root = room?.el;
        if (!root || room.curTeam) return;
        const clearButton = [...root.querySelectorAll('button')].find((button) =>
                                                                      /clear.*teams/i.test([button.textContent, button.title, button.getAttribute('aria-label'),
                                                                                            button.getAttribute('name'), button.getAttribute('data-cmd')].join(' '))
                                                                     );
        root.querySelector('.qol-import-formats-button')?.remove();
        let button = root.querySelector('.qol-teambuilder-stats-button');
        if (!button) {
            button = document.createElement('button');
            button.type = 'button';
            button.className = 'button qol-teambuilder-stats-button';
            button.innerHTML = '<i class="fa fa-bar-chart"></i> Stats';
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                try { openUsageStatsTab(); } catch (err) { console.error(LOG, 'Stats page failed:', err); }
            });
        }
        if (clearButton?.parentElement) {
            if (button.nextElementSibling !== clearButton) clearButton.before(button);
        } else if (!button.isConnected) {
            const pane = root.querySelector('.teampane') || root;
            const lastParagraph = pane.querySelector('p:last-of-type');
            if (lastParagraph) {
                button.style.cssText = 'float:right;margin:4px 0';
                lastParagraph.appendChild(button);
            } else {
                button.style.cssText = 'display:block;margin:8px 0 8px auto';
                pane.appendChild(button);
            }
        }
    }

    let importedFormatClickInstalled = false;
    function installImportedFormatClick() {
        if (importedFormatClickInstalled) return;
        importedFormatClickInstalled = true;
        document.addEventListener('click', (e) => {
            const button = e.target?.closest?.('button.qol-challengeable-format');
            if (!button) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            const room = getTeambuilderRoom();
            if (!room?.curTeam) return;
            const entry = importedCustomFormats().find((item) => item.format === button.dataset.qolImportedFormat);
            if (!entry) return;
            const [base, ruleText = ''] = entry.format.split('@@@');
            const baseKey = resolveFormatKey(base);
            if (!baseKey) return;
            // Keep Showdown's team editor and dex in sync, then restore the full
            // custom-rule string through the same path as the import dialog.
            const formatButton = room.el?.querySelector('button[name="format"]');
            if (formatButton) {
                formatButton.value = baseKey;
                formatButton.dispatchEvent(new Event('change', {bubbles: true}));
            }
            applyTeamFormat(room, baseKey, ruleText.split(',').map(squash).filter(Boolean), entry.label || '', entry.format);
            window.app?.closePopup?.();
        }, true);
    }

    // -> {base, rules} or {error}
    function parseFormatImport(text, {currentFormat = ''} = {}) {
        let s = String(text || '').trim();
        if (!s) return {error: 'Paste a format first.'};
        s = s.replace(/^\/(?:challenge|chall|utm)\s+/i, '').trim();

        // Challenge lines can start with "Username, ". Never split the actual
        // rule list on a comma unless separating the recipient *before* @@@.
        const at = s.indexOf('@@@');
        const left = (at >= 0 ? s.slice(0, at) : s).trim();
        const ruleText = at >= 0 ? s.slice(at + 3).trim() : '';
        const candidate = left.slice(left.lastIndexOf(',') + 1).trim();
        const preferredGen = formatGeneration(currentFormat);
        const resolved = resolveFormatKey(candidate, preferredGen);
        const baseLooksLikeFormat = !!resolved || /^\s*(?:\[\s*gen\s*\d+\s*\]|gen\s*\d+)/i.test(candidate);
        const onlyRules = at < 0 && !baseLooksLikeFormat;
        const base = (onlyRules || (at >= 0 && !candidate))
            ? (resolveFormatKey(String(currentFormat || '').split('@@@')[0]) || String(currentFormat || '').split('@@@')[0].trim())
            : (resolved || resolveFormatKey(candidate.replace(/^\[Gen\s*(\d+)\]/i, 'gen$1'), preferredGen));
        if (!base) return {error: onlyRules
            ? 'Open a team first, or include a format name.'
            : `Unknown format "${candidate}". Use a Showdown format ID (e.g. gen4ou).`};
        const rules = (onlyRules ? s : ruleText).split(',').map(squash).filter(Boolean);
        // The saved format must use the native *ID*, not the display string or
        // the original "/challenge" recipient, or Gen and Dex will drift.
        return {base, rules, format: base + (rules.length ? '@@@' + rules.join(',') : '')};
    }

    // Puts `base@@@rules` on the open team (keeps the generation / dex in step).
    function applyTeamFormat(room, base, rules, customName = '', rawFormat = null) {
        const team = room?.curTeam;
        if (!team) return false;

        const oldGen = String(team.format || '').match(/^gen(\d+)/)?.[1];
        const newGen = String(base).match(/^gen(\d+)/)?.[1];

        const nextFormat = String(rawFormat ?? (rules.length ? base + '@@@' + rules.join(',') : base)).trim();
        const formatChanged = team.format !== nextFormat;
        team.format = nextFormat;
        if (rules.length && customName) saveCustomFormatLabel(team.format, customName);
        if (!formatChanged) {
            syncExplicitFormatGeneration(team);
            // A name change should not reset the editor or duplicate its rows.
            decorateCustomFormatNames();
            return true;
        }
        // Synchronize even when the format prefix is unchanged: team.gen can
        // be stale after importing or reopening an existing custom-format team.
        syncExplicitFormatGeneration(team);

        room.save?.();
        refreshAfterFormatChange(room);
        return true;
    }

    // Result for the popup / console: {ok, format, label, mods, unknown, counts} or {error}.
    function importFormatText(room, text, customName = '') {
        if (!room?.curTeam) return {error: 'Open a team first.'};
        const parsed = parseFormatImport(text, {currentFormat: room.curTeam.format});
        if (parsed.error) return {error: parsed.error};
        const label = squash(customName);
        applyTeamFormat(room, parsed.base, parsed.rules, label, parsed.format);

        const count = (sign) => parsed.rules.filter((t) => t[0] === sign).length;
        // If the live client has not shipped some newly introduced Mega data,
        // do not silently claim that an import made those species usable.
        const unresolvedForms = formatRuleTokens(parsed.format)
            .filter((op) => op.kind === 'unban' && /-mega(?:-[a-z0-9]+)?$/i.test(op.name || '') &&
                !Dex.species.get(op.name)?.exists)
            .map((op) => op.name);
        return {
            ok: true,
            format: room.curTeam.format,
            label: displayFormatName(room.curTeam.format),
            mods: getActiveMods(room),
            unresolvedForms,
            unknown: parsed.rules.map(parseChallengeRule).filter((op) =>
                op && !['ban', 'unban', 'restrict'].includes(op.kind) && !op.known
            ).map((op) => op.raw),
            rules: formatRuleTokens(room.curTeam.format),
            generation: formatGeneration(room.curTeam.format, room.curTeam.gen),
            counts: {bans: count('-'), unbans: count('+'), restricted: count('*')},
        };
    }

    function removeCustomRules(room) {
        const base = String(room?.curTeam?.format || '').split('@@@')[0];
        return base ? applyTeamFormat(room, base, []) : false;
    }

    let importPopupClass = null;

    function getImportPopupClass() {
        if (importPopupClass) return importPopupClass;

        const BOX = 'box-sizing:border-box;max-width:100%';

        importPopupClass = window.Popup.extend({
            type: 'semimodal',

            events: {
                'submit form': 'submit',
                'click button[data-qolfmt]': 'act',
            },

            initialize() {
                this.draw();
            },

            draw(text = null, noteHtml = '', customName = null) {
                const wrap = (inner) =>
                `<div style="width:min(380px,80vw);${BOX};font-size:12px;line-height:1.4;white-space:normal;overflow-wrap:anywhere">${inner}</div>`;
                const team = getTeambuilderRoom()?.curTeam;
                if (!team) {
                    this.$el.html(wrap(
                        '<p>Open a team first.</p>' +
                        '<p class="buttonbar"><button type="button" class="button" data-qolfmt="close">Close</button></p>'
                    ));
                    return;
                }

                const current = String(team.format || '');
                const hasRules = current.includes('@@@');
                const value = text ?? (hasRules ? current : '');
                const nameValue = customName ?? getCustomFormatLabel(current);

                this.$el.html(wrap(
                    '<form>' +
                    '<p style="font-size:14px"><strong>Import format</strong></p>' +
                    '<p style="opacity:.75">Paste a challenge line, e.g.<br>' +
                    '<span style="font-family:monospace">/challenge gen9ou @@@ flippedmod, +Pikachu</span></p>' +
                    '<p style="margin:6px 0">Custom format name<br>' +
                    `<input type="text" name="qolfmtname" maxlength="50" placeholder="e.g. Pokébilities" value="${selfEsc(nameValue)}" ` +
                    `style="display:block;width:100% !important;${BOX} !important;font-size:12px"></p>` +
                    '<p style="margin:6px 0"><textarea name="qolfmt" rows="6" cols="1" spellcheck="false" ' +
                    `style="display:block;width:100% !important;min-width:0 !important;${BOX} !important;font-size:12px;resize:vertical">` +
                    `${selfEsc(value)}</textarea></p>` +
                    noteHtml +
                    '<p class="buttonbar"><button type="submit" class="button"><strong>Import</strong></button> ' +
                    (hasRules ? '<button type="button" class="button" data-qolfmt="remove">Remove custom rules</button> ' : '') +
                    '<button type="button" class="button" data-qolfmt="close">Close</button></p></form>'
                ));
            },

            submit(e) {
                e.preventDefault();
                e.stopPropagation();

                const text = this.$('textarea[name=qolfmt]').val();
                const customName = this.$('input[name=qolfmtname]').val();
                const res = importFormatText(getTeambuilderRoom(), text, customName);

                if (res.error) {
                    this.draw(text, `<p style="color:#c0392b">${selfEsc(res.error)}</p>`, customName);
                    return;
                }

                const parts = [];
                if (res.counts.bans) parts.push(`${res.counts.bans} ban${res.counts.bans > 1 ? 's' : ''}`);
                if (res.counts.unbans) parts.push(`${res.counts.unbans} unban${res.counts.unbans > 1 ? 's' : ''}`);
                if (res.counts.restricted) parts.push(`${res.counts.restricted} restricted`);

                let note = `<p><strong>Now:</strong> ${selfEsc(res.label)} (Gen ${res.generation || '?'})` +
                    (res.mods.length ? ` <span style="opacity:.75">(${selfEsc(res.mods.map(modLabel).join(' + '))})</span>` : '') +
                    '</p>';
                const recognized = res.rules.filter((op) => op.known).length;
                const values = res.rules.filter((op) => op.kind === 'value' || op.kind === 'replace').length;
                const summary = [...parts, `${recognized} recognized rule${recognized === 1 ? '' : 's'}`,
                    ...(values ? [`${values} value rule${values === 1 ? '' : 's'}`] : [])];
                if (summary.length) note += `<p style="opacity:.75;font-size:12px">${selfEsc(summary.join(' · '))}</p>`;
                if (res.unknown.length) note += `<p style="color:#b05522">Unrecognized rules: ${selfEsc(res.unknown.join(', '))}. The server is the final authority on whether these are valid.</p>`;
                if (res.unresolvedForms.length) note += `<p style="color:#b05522">${res.unresolvedForms.length} unbanned Mega forme(s) are missing from this client’s current Pokédex (${selfEsc(res.unresolvedForms.slice(0, 8).join(', '))}${res.unresolvedForms.length > 8 ? ', …' : ''}). The format was imported, but those formes cannot be displayed until Showdown includes their data.</p>`;
                this.draw(null, note, customName);
            },

            act(e) {
                e.preventDefault();
                e.stopPropagation();

                const action = e.currentTarget.dataset.qolfmt;
                if (action === 'close') {
                    this.close();
                } else if (action === 'remove') {
                    removeCustomRules(getTeambuilderRoom());
                    this.draw(null, '<p><strong>Custom rules removed.</strong></p>');
                }
            },
        });

        return importPopupClass;
    }

    function openImportFormatPopup() {
        if (!window.app?.addPopup || !window.Popup) return;
        app.addPopup(getImportPopupClass());
    }

    // Always-active "Import format" button (and an \u2715 while custom rules are on) in the team view.
    // It only borrows Validate's position: its own classes, so a greyed-out Validate doesn't affect it.
    function installImportFormatButton() {
        if (IS_DAMAGE_CALC) return;

        const room = getTeambuilderRoom();
        const team = room?.curTeam;
        if (!team) return;

        const scope = room.el || document;
        const anchor = scope.querySelector('button[name="validate"]') || scope.querySelector('button[name="format"]');
        if (!anchor?.parentElement) return;
        const row = anchor.parentElement;

        const makeButton = (cls, html, title, onClick) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'button ' + cls;
            button.style.marginLeft = '4px';
            button.title = title;
            button.innerHTML = html;
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                try { onClick(); } catch (err) { console.error(LOG, 'Import format failed:', err); }
            });
            return button;
        };

        let importBtn = row.querySelector(':scope > .qol-fmt-btn');
        if (!importBtn) {
            importBtn = makeButton('qol-fmt-btn', '<i class="fa fa-upload"></i> Import format',
                                   'Paste a /challenge line to give this team a custom-rules format', openImportFormatPopup);
        }
        importBtn.disabled = false;
        importBtn.classList.remove('disabled');
        if (importBtn.previousElementSibling !== anchor) anchor.after(importBtn);

        const hasRules = String(team.format || '').includes('@@@');
        let clearBtn = row.querySelector(':scope > .qol-fmt-clear');
        if (hasRules && !clearBtn) {
            clearBtn = makeButton('qol-fmt-clear', '<i class="fa fa-times"></i>',
                                  'Remove this team\u2019s custom rules', () => removeCustomRules(getTeambuilderRoom()));
        }
        if (hasRules && clearBtn.previousElementSibling !== importBtn) importBtn.after(clearBtn);
        if (!hasRules && clearBtn) clearBtn.remove();
    }

    // The server's /vtm handler reduces custom formats to their base ID. Run a
    // real challenge through Showdown's challenge path instead, then have an
    // ephemeral guest bot reject it as soon as it arrives. The challenge path
    // validates the team with the custom rules, and no battle is accepted.
    let customValidation = null;
    function validateCustomFormatWithBot(team) {
        if (customValidation) {
            app.addPopupMessage('A custom-rule validation is already running.');
            return;
        }
        if (window.qolSelf && !window.qolSelf.over) {
            app.addPopupMessage('Stop the active self-battle before validating custom challenge rules.');
            return;
        }
        const mainName = app.user?.get?.('name');
        if (!mainName || !app.user?.get?.('named')) {
            app.addPopupMessage('Log in before validating custom challenge rules.');
            return;
        }

        const botName = `QolVal${Math.floor(Math.random() * 9000000 + 1000000)}`;
        const ws = new WebSocket(selfWsUrl());
        const state = {ws, done: false, timer: null, origReceive: app.receive, wrappedReceive: null};
        customValidation = state;

        const finish = (message) => {
            if (state.done) return;
            state.done = true;
            clearTimeout(state.timer);
            if (app.receive === state.wrappedReceive) app.receive = state.origReceive;
            try { ws.close(); } catch (e) { /* already closed */ }
            if (customValidation === state) customValidation = null;
            if (message) app.addPopupMessage(message);
        };

        state.wrappedReceive = function (data) {
            if (typeof data === 'string') {
                const popup = data.split('\n').find((line) => line.includes('|popup|'));
                if (popup && state.sentChallenge) finish(); // Let Showdown display its own detailed error popup.

                // Keep this temporary guest's challenge traffic out of the main client's UI.
                if (data.split('\n').every((line) =>
                                           !line.startsWith('|updatechallenges|') || !toSearchId(line).includes(toSearchId(botName))
                                          )) return state.origReceive.apply(this, arguments);
                const kept = data.split('\n').filter((line) =>
                                                     !line.startsWith('|updatechallenges|') || !toSearchId(line).includes(toSearchId(botName))
                                                    );
                if (!kept.length) return;
                return state.origReceive.call(this, kept.join('\n'));
            }
            return state.origReceive.apply(this, arguments);
        };
        state.wrappedReceive.__original = state.origReceive;
        app.receive = state.wrappedReceive;

        state.timer = setTimeout(() => finish('Custom-rule validation timed out. No challenge was accepted.'), 20000);
        ws.onmessage = async (event) => {
            const data = String(event.data);
            if (state.done) return;

            if (data.includes('|error|') || data.includes('|popup|')) {
                const err = data.split('\n').find((line) => line.includes('|error|') || line.includes('|popup|'));
                if (err) {
                    const marker = err.includes('|error|') ? '|error|' : '|popup|';
                    finish('Could not start validation: ' + err.slice(err.indexOf(marker) + marker.length).trim());
                }
                return;
            }

            if (data.includes('|challstr|') && !ws.qolRegistered) {
                ws.qolRegistered = true;
                const challstr = data.match(/\|challstr\|([^\n]+)/)?.[1];
                if (!challstr) return finish('The validation bot did not receive a login challenge.');
                try {
                    const assertion = (await (await fetch(
                        `https://play.pokemonshowdown.com/action.php?act=getassertion&userid=${toSearchId(botName)}&challstr=${encodeURIComponent(challstr)}`
                    )).text()).trim();
                    if (!assertion || assertion.startsWith(';')) return finish('Could not log in the temporary validation bot.');
                    ws.send(`|/trn ${botName},0,${assertion}`);
                } catch (err) {
                    finish('Could not log in the temporary validation bot.');
                }
                return;
            }

            if (data.split('\n').some((line) =>
                                      line.startsWith('|updateuser|') && toSearchId(line.split('|')[2]) === toSearchId(botName) && line.split('|')[3] === '1'
                                     )) {
                getTeambuilderRoom()?.save?.();
                app.send('/utm ' + selfPackedOf(team));
                state.sentChallenge = true;
                app.send(`/challenge ${botName}, ${team.format}`);
                return;
            }

            const challengeLine = data.split('\n').find((line) => line.startsWith('|updatechallenges|'));
            if (challengeLine) {
                let challenges = null;
                try { challenges = JSON.parse(challengeLine.slice('|updatechallenges|'.length)); } catch (e) { /* wait for valid update */ }
                const from = challenges?.challengesFrom || {};
                const challenger = Object.keys(from).find((name) => toSearchId(name) === toSearchId(mainName));
                if (challenger) {
                    ws.send(`|/reject ${challenger}`);
                    finish('Team passed server validation for its custom challenge rules. The bot rejected the challenge before a battle started.');
                }
            }
        };
        ws.onerror = () => finish('Could not connect to the temporary validation bot.');
        ws.onclose = () => {
            if (!state.done) finish('The temporary validation bot disconnected before validation completed.');
        };
    }

    // Validate custom formats through /challenge (the server's supported
    // custom-rule path); plain formats remain on the native Validate handler.
    let validateListenerInstalled = false;
    function installValidateListener() {
        if (validateListenerInstalled) return;
        validateListenerInstalled = true;

        document.addEventListener('click', (e) => {
            const button = e.target?.closest?.('button[name="validate"]');
            if (!button) return;

            const room = getTeambuilderRoom();
            const team = room?.curTeam;
            if (!team || !String(team.format || '').includes('@@@')) return; // plain formats: the client handles it
            if (!room.curSetList?.length) return; // let the client say the team is empty

            e.preventDefault();
            e.stopImmediatePropagation();
            try { validateCustomFormatWithBot(team); }
            catch (err) {
                console.error(LOG, 'Custom challenge validation failed:', err);
                customValidation = null;
                app.addPopupMessage('Could not start custom-rule validation: ' + (err?.message || err));
            }
        }, true);
    }

    // Shows "<Format> + Custom" instead of the raw "format@@@rules" string, in the team view's format
    // button and in the team list.
    function decorateCustomFormatNames() {
        if (IS_DAMAGE_CALC) return;

        const room = getTeambuilderRoom();
        const root = room?.el;
        if (!root) return;

        const team = room.curTeam;
        if (team) {
            if (!String(team.format || '').includes('@@@')) return;
            const label = displayFormatName(team.format);
            for (const button of root.querySelectorAll('button[name="format"]')) {
                if (button.textContent.trim() !== label) button.textContent = label;
            }

            const validate = root.querySelector('button[name="validate"]');
            if (validate && room.curSetList?.length && (validate.disabled || validate.classList.contains('disabled'))) {
                validate.disabled = false;
                validate.classList.remove('disabled');
            }
            return;
        }

        // The team-folder pane uses the raw format string in its heading and
        // repeats the full rule list under the New Team buttons. Replace those
        // occurrences with the friendly label saved by the import dialog.
        const customFormats = [...new Map((window.Storage?.teams || [])
                                          .map((saved) => String(saved?.format || ''))
                                          .filter((format) => format.includes('@@@'))
                                          .map((format) => [customFormatLabelKey(format), format]))
                               .values()]
        .sort((a, b) => b.length - a.length);

        // Teambuilder format folders omit the generation prefix, while team
        // cards use a shortened label followed by the raw rule list. Resolve
        // each card against Storage.teams so both use the same friendly name.
        for (const card of root.querySelectorAll('.teamlist .team[data-value]')) {
            const saved = window.Storage?.teams?.[Number(card.dataset.value)];
            const format = String(saved?.format || '');
            const title = card.querySelector('strong');
            if (!title) continue;
            if (!format.includes('@@@')) {
                // Older imports could accidentally append the complete rule string
                // to the team name. Recover the suffix for display and use the
                // actual base format label instead of exposing the banlist.
                const savedName = String(saved?.name || '').trim();
                const legacy = savedName.match(/^\[gen\s*\d+\]\s*(.+)\]\s*(.+)$/i);
                if (legacy && /[,!+*=]/.test(legacy[1])) {
                    const firstRuleName = legacy[1].split(',')[0].trim();
                    const label = getCustomFormatLabel(format) || `${firstRuleName || displayFormatName(format)} + Custom`;
                    const nextTitle = `[${label}] ${legacy[2].trim()}`;
                    if (title.textContent !== nextTitle) title.textContent = nextTitle;
                    continue;
                }

                // Some older team entries stored only the raw rule string as the
                // team name. In that case there is no closing `]Team Name` suffix;
                // replace the long rule text in the visible card with its lead rule.
                const firstRuleName = savedName.split(',')[0].trim();
                const looksLikeRawRules = savedName.length > 100 && /[,!+*=]/.test(savedName) &&
                      /pokebilit|convergence|fortemon|sketchmon|alphabet cup|camomons|scalemons|tier shift|almost any ability/i.test(firstRuleName);
                if (!looksLikeRawRules) continue;
                const friendly = getCustomFormatLabel(format) || `${firstRuleName} + Custom`;
                const nextTitle = title.textContent
                .replace(/^\[gen\s*\d+\]\s*/i, '')
                .replace(savedName, friendly);
                if (nextTitle !== title.textContent) title.textContent = nextTitle;
                continue;
            }

            const rules = format.split('@@@')[1] || '';
            const savedName = String(saved.name || '').trim();
            const normalizedRules = toSearchId(rules.replace(/^\[gen\s*\d+\]\s*/i, ''));
            const normalizedName = toSearchId(savedName);
            const rawRulesPrefix = normalizedRules.slice(0, Math.min(24, normalizedRules.length));
            const nameIsRawRules = !!rawRulesPrefix && normalizedName.startsWith(rawRulesPrefix);
            const actualTeamName = nameIsRawRules
            ? savedName.slice(savedName.lastIndexOf(']') + 1).trim()
            : savedName;
            const friendlyName = displayFormatName(format);
            const nextTitle = `[${friendlyName}]${actualTeamName ? ` ${actualTeamName}` : ''}`;
            if (title.textContent !== nextTitle) title.textContent = nextTitle;
        }

        for (const heading of root.querySelectorAll('.teampane h2')) {
            let text = heading.textContent;
            for (const format of customFormats) {
                if (text.includes(format)) text = text.replace(format, displayFormatName(format));
            }
            if (heading.textContent !== text) heading.textContent = text;
        }

        for (const button of root.querySelectorAll('.teampane button')) {
            if (!button.textContent.includes('Custom rules:')) continue;
            const format = customFormats.find((candidate) => {
                const rules = candidate.split('@@@')[1] || '';
                return rules && button.textContent.includes(`Custom rules: ${rules}`);
            });
            if (!format) continue;
            const label = displayFormatName(format);
            const icon = button.querySelector('i.fa-plus-circle')?.cloneNode(true);
            button.replaceChildren(...(icon ? [icon, document.createTextNode(` New ${label} Team`)] :
                                       [document.createTextNode(`New ${label} Team`)]));
        }

        // Match folder labels even when Showdown drops "gen9" from the front.
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let textNode;
        while ((textNode = walker.nextNode())) {
            let text = textNode.nodeValue || '';
            for (const format of customFormats) {
                const shortBase = format.replace(/^(gen\d+)/i, '');
                const shortFormat = shortBase.includes('@@@') ? shortBase : format;
                for (const raw of [format, shortFormat]) {
                    if (raw && text.includes(raw)) text = text.replace(raw, displayFormatName(format));
                }
            }
            if (textNode.nodeValue !== text) textNode.nodeValue = text;
        }

        for (const el of root.querySelectorAll('strong')) {
            if (!el.textContent.includes('@@@')) continue;
            el.textContent = el.textContent.replace(
                /\[?\s*(gen\d+\w*@@@[^\]]*)\]?/i,
                (match, format) => `[${displayFormatName(format)}]`
            );
        }
    }

    // ---------- "Custom Formats" section in the format dropdown ----------

    const FORMAT_BTN = 'button[name="selectFormat"]';

    // Every distinct custom-rule format from saved teams (+ the open team).
    function savedCustomFormats() {
        const map = new Map();
        const add = (f) => {
            f = String(f || '');
            if (!f.includes('@@@')) return;
            const key = customFormatLabelKey(f);
            if (key && !map.has(key)) map.set(key, f);
        };
        for (const t of window.Storage?.teams || []) add(t?.format);
        add(getTeambuilderRoom()?.curTeam?.format);
        return [...map.values()].sort((a, b) => displayFormatName(a).localeCompare(displayFormatName(b)));
    }

    function decorateCustomFormatDropdown() {
        if (IS_DAMAGE_CALC) return;
        const popup = document.querySelector('.ps-popup');
        if (!popup) return;
        // Native popup re-renders can keep a stale injected section. Rebuild
        // only when its set of formats changes, removing stale duplicates.
        const existing = [...popup.querySelectorAll('.qol-custom-formats')];
        const signature = savedCustomFormats().join('\n');
        if (existing.length === 1 && existing[0].dataset.qolSignature === signature) return;
        existing.forEach((section) => {
            let next = section.nextElementSibling;
            for (let i = 0; i < 2 && next?.tagName === 'P' && !next.textContent.trim(); i++) {
                const remove = next; next = next.nextElementSibling; remove.remove();
            }
            section.remove();
        });

        const sections = [...popup.querySelectorAll('details[section]')];
        if (!sections.length || !popup.querySelector(FORMAT_BTN)) return;

        const formats = savedCustomFormats();
        if (!formats.length) return;

        // Place it after the Challengeable section (fallback: after the last section).
        const anchor =
              sections.find((d) => /challengeable/i.test(d.querySelector('summary')?.textContent || '')) ||
              sections[sections.length - 1];

        const details = document.createElement('details');
        details.className = 'qol-custom-formats';
        details.dataset.qolSignature = signature;
        details.setAttribute('section', 'Custom Formats');
        details.open = true;

        const summary = document.createElement('summary');
        summary.style.cursor = 'pointer';
        const strong = document.createElement('strong');
        strong.style.color = '#579';
        strong.textContent = 'Custom Formats';
        summary.appendChild(strong);
        details.appendChild(summary);

        for (const format of formats) {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.name = 'selectFormat';
            btn.value = format;
            btn.className = 'option';
            btn.dataset.qolCustom = '1';
            btn.style.cursor = 'pointer';
            btn.textContent = displayFormatName(format);
            li.appendChild(btn);
            details.appendChild(li);
        }

        // The menu separates sections with two empty <p>s: skip past the ones
        // after the anchor, then add the same spacing after ours.
        let after = anchor;
        while (after.nextElementSibling?.tagName === 'P') after = after.nextElementSibling;
        after.after(details, document.createElement('p'), document.createElement('p'));
    }

    // Picking a custom format while a team is open applies it directly
    // (the native handler doesn't know these format strings).
    let customDropdownListenerInstalled = false;
    function installCustomFormatDropdownListener() {
        if (customDropdownListenerInstalled) return;
        customDropdownListenerInstalled = true;

        document.addEventListener('click', (e) => {
            const btn = e.target?.closest?.('button[data-qol-custom]');
            if (!btn) return;
            if (e.target.closest('.fa-star')) return; // favoriting: leave it to the client

            const room = getTeambuilderRoom();
            if (!room?.curTeam) return; // team list / other pickers: let the client handle it

            e.preventDefault();
            e.stopImmediatePropagation();

            const [base, ruleText = ''] = String(btn.value).split('@@@');
            const rules = ruleText.split(',').map(squash).filter(Boolean);
            try { applyTeamFormat(room, base, rules); }
            catch (err) { console.error(LOG, 'Custom format pick failed:', err); }

            try { app.closePopup(); } catch (err) { /* popup already gone */ }
        }, true);
    }

    // ====================================================================
    // SMOGON USAGE STATS TAB
    //   Teambuilder "Stats" button -> a tab with month / format / rating
    //   baseline / sort controls and a list of every Pokémon. Each row
    //   expands into the movesets data (abilities, items, moves, spreads,
    //   Tera types, teammates, checks and counters).
    //
    //   Data: https://www.smogon.com/stats/<month>/chaos/<format>-<baseline>.json
    //   (the chaos JSON holds everything the moveset .txt files do).
    // ====================================================================

    const USAGE = {
        BASE: 'https://www.smogon.com/stats/',
        ROOM_ID: 'view-qolusagestats',
        PREFS: 'qol-usage-prefs',
        // Tried in order; the first one that answers is remembered. smogon.com
        // may not send CORS headers, in which case the proxies take over.
        FETCHERS: [
            (url) => 'https://smogon-stats.bobthedude132.workers.dev/' + url.slice(USAGE.BASE.length),
            (url) => url,
        ],
        BASELINE_PREFERENCE: [1630, 1695, 1500, 1760, 1825],
        MAX_CACHED_DATASETS: 4,
        TOP: {abilities: 8, items: 10, moves: 14, spreads: 6, tera: 6, teammates: 10, counters: 8},
    };

    const USAGE_SORTS = {
        usage: {label: 'Usage %'},
        raw: {label: 'Raw count'},
        viability: {label: 'Viability ceiling'},
    };
    const USAGE_STAT_LABELS = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];
    const USAGE_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                          'August', 'September', 'October', 'November', 'December'];

    const usageEsc = (s) => BattleLog.escapeHTML(String(s ?? ''));
    const usageLastSegment = (href) => String(href).replace(/\/+$/, '').split('/').pop();

    // ---------- network ----------

    let usageFetcherIndex = 0;

    async function usageFetchText(url, isValid) {
        const errors = [];
        for (let n = 0; n < USAGE.FETCHERS.length; n++) {
            const i = (usageFetcherIndex + n) % USAGE.FETCHERS.length;
            const target = USAGE.FETCHERS[i](url);
            try {
                const response = await fetch(target);
                if (!response.ok) throw new Error('HTTP ' + response.status);
                const text = await response.text();
                if (isValid && !isValid(text)) throw new Error('unexpected response');
                usageFetcherIndex = i;
                return text;
            } catch (error) {
                errors.push(`${new URL(target).host}: ${error.message}`);
            }
        }
        throw new Error(errors.join(' | '));
    }

    const usageDirCache = new Map();
    function usageListDir(url) {
        if (!usageDirCache.has(url)) {
            const promise = usageFetchText(url, (t) => /href\s*=/i.test(t)).then((html) =>
                                                                                 [...html.matchAll(/href="([^"?#]+)"/gi)].map((m) => {
                try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
            })
                                                                                );
            usageDirCache.set(url, promise);
            promise.catch(() => usageDirCache.delete(url));
        }
        return usageDirCache.get(url);
    }

    // Newest first.
    async function usageMonths() {
        const hrefs = await usageListDir(USAGE.BASE);
        const months = new Set(hrefs.map(usageLastSegment).filter((s) => /^\d{4}-\d{2}(-.+)?$/.test(s)));
        return [...months].sort((a, b) => b.localeCompare(a));
    }

    // formatId -> ascending list of rating baselines published that month.
    async function usageFormats(month) {
        const hrefs = await usageListDir(`${USAGE.BASE}${month}/chaos/`);
        const formats = new Map();
        for (const href of hrefs) {
            const m = usageLastSegment(href).match(/^(.+)-(\d+)\.json$/);
            if (!m) continue;
            if (!formats.has(m[1])) formats.set(m[1], []);
            formats.get(m[1]).push(Number(m[2]));
        }
        for (const list of formats.values()) list.sort((a, b) => a - b);
        return formats;
    }

    // ---------- data ----------

    // ASSUMPTION: chaos JSON stores the ceiling as an array whose first entry is
    // the number shown in the moveset .txt. If the numbers look wrong, inspect
    // an entry's "Viability Ceiling" in the console and adjust this one function.
    function usageViability(entry) {
        const v = entry['Viability Ceiling'];
        if (!Array.isArray(v)) return Number.isFinite(Number(v)) ? Math.floor(Number(v)) : null;
        const top = Number(v[1]); // [players, top GXE, 99th percentile GXE, 95th percentile GXE]
        return Number.isFinite(top) ? Math.floor(top) : null;
    }
    function usageBuildDataset(json) {
        const rows = Object.entries(json.data || {}).map(([name, entry]) => ({
            name,
            id: toID(name),
            usage: Number(entry.usage) || 0, // fraction of teams (sums to 6 across a format)
            raw: Number(entry['Raw count']) || 0,
            viability: usageViability(entry),
            entry,
            rank: 0,
        }));
        rows.sort((a, b) => b.usage - a.usage || b.raw - a.raw);
        rows.forEach((row, i) => { row.rank = i + 1; });
        return {
            info: json.info || {},
            rows,
            byId: new Map(rows.map((r) => [r.id, r])),
            maxUsage: rows[0]?.usage || 1,
        };
    }

    const usageDatasets = new Map(); // small LRU: these files can be several MB
    async function usageLoadDataset(month, format, baseline) {
        const key = `${month}/${format}-${baseline}`;
        if (usageDatasets.has(key)) {
            const hit = usageDatasets.get(key);
            usageDatasets.delete(key);
            usageDatasets.set(key, hit);
            return hit;
        }

        const url = `${USAGE.BASE}${month}/chaos/${format}-${baseline}.json`;
        const text = await usageFetchText(url, (t) => t.trimStart().startsWith('{'));
        const dataset = usageBuildDataset(JSON.parse(text));

        usageDatasets.set(key, dataset);
        while (usageDatasets.size > USAGE.MAX_CACHED_DATASETS) {
            usageDatasets.delete(usageDatasets.keys().next().value);
        }
        return dataset;
    }

    // ---------- labels ----------

    function usageMonthLabel(id) {
        const m = String(id).match(/^(\d{4})-(\d{2})(?:-(.+))?$/);
        if (!m) return id;
        return `${USAGE_MONTHS[Number(m[2]) - 1] || m[2]} ${m[1]}` + (m[3] ? ` (${m[3]})` : '');
    }

    const usageGenOf = (id) => Number(String(id).match(/^gen(\d+)/)?.[1]) || 0;

    function usageFormatLabel(id) {
        const known = window.BattleFormats?.[id]?.name;
        if (known) return known;
        const m = String(id).match(/^gen(\d+)(.*)$/);
        return m ? `[Gen ${m[1]}] ${m[2] || id}` : id;
    }

    function usageDexFor(format) {
        const gen = usageGenOf(format);
        try { return gen && Dex.forGen ? Dex.forGen(gen) : Dex; } catch (e) { return Dex; }
    }

    // [{gen, items: [{id, label}]}], newest generation first.
    function usageGroupFormats(ids) {
        const groups = new Map();
        for (const id of ids) {
            const gen = usageGenOf(id);
            if (!groups.has(gen)) groups.set(gen, []);
            groups.get(gen).push({id, label: usageFormatLabel(id).replace(/^\[Gen \d+\]\s*/, '')});
        }
        return [...groups.entries()]
            .sort((a, b) => b[0] - a[0])
            .map(([gen, items]) => ({gen, items: items.sort((a, b) => a.label.localeCompare(b.label))}));
    }

    // ---------- row + detail HTML ----------

    const usagePct = (n) => n.toFixed(n >= 10 ? 1 : 2) + '%';

    const usageTop = (obj, limit) =>
    Object.entries(obj || {})
    .filter(([key, value]) => key && value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

    // One list line with a faint bar behind it. `percent` drives the bar.
    function usageListRow(inner, percent, valueHtml = null, attrs = '') {
        const width = Math.max(0, Math.min(100, percent));
        return `<div class="qol-us-li"${attrs} style="--w:${width.toFixed(1)}%">` +
            `<span class="qol-us-li-name">${inner}</span>` +
            `<span class="qol-us-li-val">${valueHtml ?? usagePct(percent)}</span></div>`;
    }

    const usageSection = (title, rows, hint = '') =>
    rows.length
    ? `<section><h4${hint ? ` title="${usageEsc(hint)}"` : ''}>${title}</h4>${rows.join('')}</section>`
    : '';

    function usageCounterEntries(entry) {
        let raw = entry['Checks and Counters'];
        if (!raw) {
            const key = Object.keys(entry).find((k) => /check|counter/i.test(k));
            raw = key ? entry[key] : null;
        }
        if (!raw || typeof raw !== 'object') return [];

        return Object.entries(raw).map(([name, v]) => {
            const nums = (Array.isArray(v) ? v : [v]).map(Number).filter(Number.isFinite);
            if (!nums.length) return null;
            let n = NaN, p, d = 0;
            if (nums.length >= 3) [n, p, d] = nums;
            else if (nums.length === 2) [p, d] = nums;
            else [p] = nums;
            if (p > 1.5) p /= 100;
            if (d > 1.5) d /= 100;
            return {name, n, p, d, score: p - 4 * d};
        }).filter(Boolean).sort((a, b) => b.score - a.score);
    }

    function usageDetailHtml(row, dex) {
        const e = row.entry;
        const T = USAGE.TOP;
        const sum = (obj) => Object.values(obj || {}).reduce((s, v) => s + (Number(v) || 0), 0);
        // Every battle has exactly one ability/item/spread, so either sum is the weighted game count.
        const total = sum(e.Abilities) || sum(e.Items) || sum(e.Spreads);
        const share = (v) => (total ? (v / total) * 100 : 0);

        const species = dex.species.get(row.name);
        const catIcon = (move) =>
        typeof Dex.getCategoryIcon === 'function' ? Dex.getCategoryIcon(move.category) : '';

        const abilities = usageTop(e.Abilities, T.abilities).map(([key, v]) => {
            const ability = dex.abilities.get(key);
            return usageListRow(usageEsc(ability?.exists ? ability.name : key), share(v));
        });

        const items = usageTop(e.Items, T.items).map(([key, v]) => {
            const item = dex.items.get(key);
            if (!item?.exists) {
                return usageListRow(usageEsc(toID(key) === 'nothing' ? 'Nothing' : key), share(v));
            }
            const icon = `<span class="itemicon" style="${Dex.getItemIcon(item.name)}"></span>`;
            return usageListRow(icon + usageEsc(item.name), share(v));
        });

        const moves = usageTop(e.Moves, T.moves).map(([key, v]) => {
            const move = dex.moves.get(key);
            if (!move?.exists) return usageListRow(usageEsc(key), share(v));
            return usageListRow(Dex.getTypeIcon(move.type) + catIcon(move) + usageEsc(move.name), share(v));
        });

        const spreads = usageTop(e.Spreads, T.spreads).map(([key, v]) => {
            const [nature, evs = ''] = key.split(':');
            const parts = evs.split('/').map(Number);
            const text = USAGE_STAT_LABELS
            .map((label, i) => (parts[i] ? `${parts[i]} ${label}` : null))
            .filter(Boolean).join(' / ') || 'No EVs';
            return usageListRow(`<b>${usageEsc(nature)}</b>&nbsp;${usageEsc(text)}`, share(v), null,
                                ` title="${usageEsc(key)}"`);
        });

        const tera = usageTop(e['Tera Types'], T.tera).map(([key, v]) => {
            const type = capitalize(key);
            const known = Dex.types?.get?.(type)?.exists;
            return usageListRow(known ? Dex.getTypeIcon(type) : usageEsc(type), share(v));
        });

        const mates = usageTop(e.Teammates, T.teammates).map(([name, v]) => {
            const sp = dex.species.get(name);
            return usageListRow(pokemonIconHtml(toID(name)) + usageEsc(sp?.exists ? sp.name : name), share(v), null,
                                ` data-jump="${usageEsc(toID(name))}"`);
        });

        // [encounters, P(this mon is KO'd or forced out), standard deviation]
        const counterList = usageCounterEntries(e);
        if (!counterList.length) console.log(LOG, 'No checks/counters for', row.name, '- keys:', Object.keys(e));
        const counters = counterList.map((c) => {
            const sp = dex.species.get(c.name);
            const label = sp?.exists ? sp.name : c.name;
            return usageListRow(
                pokemonIconHtml(toID(c.name)) + usageEsc(label), c.p * 100,
                `${(c.p * 100).toFixed(1)}<small>±${(c.d * 100).toFixed(1)}</small>`,
                ` data-jump="${usageEsc(toID(c.name))}"`
            );
        });

        const header =
              `<div class="qol-us-dhead">${species?.exists ? typeIconsHtml(species.types) : ''}` +
              `<span>${row.raw.toLocaleString()} raw uses</span>` +
              (row.viability != null ? `<span>Viability ceiling ${row.viability}</span>` : '') + '</div>';

        return header +
            usageSection('Abilities', abilities) +
            usageSection('Items', items) +
            usageSection('Moves', moves) +
            usageSection('Spreads', spreads) +
            usageSection('Tera Types', tera) +
            usageSection('Teammates', mates, 'Click one to jump to it') +
            usageSection('Checks and Counters', counters, 'How often this Pokémon is KO’d or forced out by each one (± standard deviation)');
    }

    function usageRowHtml(row, maxUsage, open, dex) {
        return `<li class="qol-us-row${open ? ' open' : ''}" data-id="${row.id}">` +
            `<div class="qol-us-head" role="button" tabindex="0" data-act="toggle" data-id="${row.id}">` +
            `<span class="qol-us-rank">${row.rank}</span>` +
            `<span class="qol-us-icon">${pokemonIconHtml(row.id)}</span>` +
            `<span class="qol-us-name">${usageEsc(row.name)}</span>` +

            `<span class="qol-us-pct">${(row.usage * 100).toFixed(2)}%</span>` +
            `<span class="qol-us-raw">${row.raw.toLocaleString()}</span>` +
            `<span class="qol-us-via">${row.viability ?? '–'}</span></div>` +
            (open ? `<div class="qol-us-detail">${usageDetailHtml(row, dex)}</div>` : '') +
            '</li>';
    }

    // ---------- styling (neutral colours, so it works in light and dark themes) ----------

    const USAGE_CSS = `
.qol-us{max-width:1000px;margin:0 auto;padding:10px 12px 40px}
.qol-us [hidden]{display:none!important}
.qol-us h2{margin:4px 0 10px;font-size:18px}
.qol-us-controls{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:flex-end;margin-bottom:8px}
.qol-us-controls label{display:flex;flex-direction:column;gap:2px;font-size:11px}
.qol-us-controls label>span:first-child{opacity:.7}
.qol-us-controls select,.qol-us-controls input{min-width:120px;box-sizing:border-box}
.qol-us-sortgroup{display:flex;gap:4px}
.qol-us-grow{flex:1 1 160px}
.qol-us-grow input{width:100%}
.qol-us-status{min-height:18px;margin:6px 0;font-size:12px}
.qol-us-status.error{color:#c0392b}
.qol-us-summary{margin:4px 0 8px;font-size:12px;opacity:.85}

.qol-us-list{list-style:none;margin:0;padding:0;border-top:1px solid rgba(128,128,128,.3)}
.qol-us-row{border-bottom:1px solid rgba(128,128,128,.22)}

.qol-us-head,.qol-us-cols{display:grid;grid-template-columns:30px 40px minmax(0,1fr) 62px 84px 56px;align-items:center;gap:8px;box-sizing:border-box;width:100%;margin:0;padding:0 6px;color:inherit;font:inherit}
.qol-us-head{min-height:30px;cursor:pointer}
.qol-us-head:hover{background:rgba(128,128,128,.12)}
.qol-us-row.open>.qol-us-head{background:rgba(128,128,128,.16)}
.qol-us-cols{font-size:11px;opacity:.85;padding-bottom:3px}
.qol-us-cols [data-sort]{cursor:pointer}
.qol-us-cols [data-sort]:hover,.qol-us-cols .cur{font-weight:bold;opacity:1}

.qol-us-rank{text-align:right;opacity:.6;font-size:11px}
.qol-us-icon{width:40px;height:30px}
.qol-us-name{min-width:0;font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}
.qol-us-cols .qol-us-name{font-weight:normal}
.qol-us-pct,.qol-us-raw,.qol-us-via{text-align:right}
.qol-us-raw{opacity:.75}

.qol-us-detail{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px 18px;padding:8px 10px 12px 46px;background:rgba(128,128,128,.07)}
.qol-us-dhead{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:4px 14px;align-items:center;font-size:12px}
.qol-us-dhead img{vertical-align:middle}
.qol-us-detail h4{margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.7;border-bottom:1px solid rgba(128,128,128,.3)}
.qol-us-li{display:flex;align-items:center;gap:6px;min-height:20px;padding:1px 4px;font-size:12px;border-radius:3px;
  background:linear-gradient(90deg,rgba(74,144,217,.28) var(--w,0%),transparent var(--w,0%))}
.qol-us-li[data-jump]{cursor:pointer}
.qol-us-li[data-jump]:hover{outline:1px solid rgba(128,128,128,.5)}
.qol-us-li-name{flex:1;min-width:0;display:flex;align-items:center;gap:4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.qol-us-li-name img{flex:none}
.qol-us-li-name .picon{flex:none;margin:-6px -6px -6px -10px;transform:scale(.75)}
.qol-us-li-val{flex:none;font-variant-numeric:tabular-nums;opacity:.9}
.qol-us-li-val small{opacity:.65;margin-left:2px}
.qol-us-empty{padding:14px;opacity:.7}

@media (max-width:640px){
  .qol-us-rank,.qol-us-raw{display:none}
  .qol-us-head,.qol-us-cols{grid-template-columns:40px minmax(0,1fr) 54px 56px}
  .qol-us-detail{padding-left:10px}
}`;

    function usageEnsureCss() {
        if (document.getElementById('qol-usage-css')) return;
        const style = document.createElement('style');
        style.id = 'qol-usage-css';
        style.textContent = USAGE_CSS;
        document.head.appendChild(style);
    }

    // ---------- controller ----------

    function createUsageController(root) {
        const prefs = selfLoad(USAGE.PREFS) || {};
        const S = {
            months: [], month: null, formats: new Map(),
            format: prefs.format || 'gen9ou',
            baseline: Number.isFinite(prefs.baseline) ? prefs.baseline : null,
            sort: USAGE_SORTS[prefs.sort] ? prefs.sort : 'usage',
            desc: typeof prefs.desc === 'boolean' ? prefs.desc : true,
            filter: '', data: null, open: new Set(), token: 0,
        };

        const $ = (selector) => root.querySelector(selector);
        const save = () => selfSave(USAGE.PREFS, {format: S.format, baseline: S.baseline, sort: S.sort, desc: S.desc});

        root.innerHTML =
            '<div class="qol-us">' +
            '<h2>Smogon Usage Statistics</h2>' +
            '<div class="qol-us-controls">' +
            '<label><span>Month</span><select class="button" data-ctl="month"></select></label>' +
            '<label><span>Format</span><select class="button" data-ctl="format"></select></label>' +
            '<label><span>Rating baseline</span><select class="button" data-ctl="baseline"></select></label>' +
            '<label><span>Sort by</span><span class="qol-us-sortgroup">' +
            '<select class="button" data-ctl="sort">' +
            Object.entries(USAGE_SORTS).map(([k, s]) => `<option value="${k}">${s.label}</option>`).join('') +
            '</select><button type="button" class="button" data-ctl="dir"></button></span></label>' +
            '<label class="qol-us-grow"><span>Filter</span>' +
            '<input class="textbox" type="search" data-ctl="filter" placeholder="Pokémon name" autocomplete="off" spellcheck="false"></label>' +

            '</div>' +
            '<div class="qol-us-status" data-out="status"></div>' +
            '<div class="qol-us-summary" data-out="summary"></div>' +
            '<div class="qol-us-cols" data-out="cols" hidden></div>' +
            '<ul class="qol-us-list" data-out="list"></ul></div>';

        const setStatus = (html, isError = false) => {
            const el = $('[data-out=status]');
            el.className = 'qol-us-status' + (isError ? ' error' : '');
            el.innerHTML = html;
        };

        function showError(error) {
            console.error(LOG, 'Usage stats failed:', error);
            setStatus(
                `Couldn’t load stats: ${usageEsc(error?.message || error)}. ` +
                '<button type="button" class="button" data-act="retry">Retry</button><br>' +
                '<small>smogon.com may have blocked the request, or this selection has no file.</small>',
                true
            );
        }

        // ----- selection helpers -----

        function pickFormat() {
            const ids = [...S.formats.keys()];
            if (S.formats.has(S.format) || !ids.length) return;
            S.format = ids.includes('gen9ou')
                ? 'gen9ou'
            : ids.sort((a, b) => usageGenOf(b) - usageGenOf(a) || a.localeCompare(b))[0];
        }

        function pickBaseline() {
            const list = S.formats.get(S.format) || [];
            if (list.includes(S.baseline)) return;
            S.baseline = USAGE.BASELINE_PREFERENCE.find((b) => list.includes(b)) ?? list[Math.floor(list.length / 2)] ?? null;
        }

        // ----- controls -----

        const option = (value, label, selected) =>
        `<option value="${usageEsc(value)}"${selected ? ' selected' : ''}>${usageEsc(label)}</option>`;

        function fillMonths() {
            $('[data-ctl=month]').innerHTML = S.months.map((m) => option(m, usageMonthLabel(m), m === S.month)).join('');
        }

        function fillFormats() {
            $('[data-ctl=format]').innerHTML = usageGroupFormats([...S.formats.keys()]).map((group) =>
                                                                                            `<optgroup label="${group.gen ? 'Gen ' + group.gen : 'Other'}">` +
                                                                                            group.items.map((f) => option(f.id, f.label, f.id === S.format)).join('') + '</optgroup>'
                                                                                           ).join('');
        }

        function fillBaselines() {
            $('[data-ctl=baseline]').innerHTML = (S.formats.get(S.format) || []).map((b) =>
                                                                                     option(b, b === 0 ? '0 (all games)' : String(b), b === S.baseline)
                                                                                    ).join('');
        }

        function syncSortControls() {
            $('[data-ctl=sort]').value = S.sort;
            const dir = $('[data-ctl=dir]');
            dir.textContent = S.sort === 'name' ? (S.desc ? 'Z–A' : 'A–Z') : (S.desc ? '▼' : '▲');
            dir.title = S.desc ? 'Descending (click to reverse)' : 'Ascending (click to reverse)';
        }

        // ----- list -----

        function visibleRows() {
            const q = toSearchId(S.filter);
            let rows = S.data.rows;
            if (q) rows = rows.filter((r) => r.id.includes(q));

            const dir = S.desc ? -1 : 1;
            const key = S.sort;
            return rows.slice().sort((a, b) => {
                if (key === 'name') return a.name.localeCompare(b.name) * dir;
                const x = a[key];
                const y = b[key];
                if (x == null && y == null) return a.rank - b.rank;
                if (x == null) return 1; // missing values always last
                if (y == null) return -1;
                return (x - y) * dir || a.rank - b.rank;
            });
        }

        function renderSummary() {
            const el = $('[data-out=summary]');
            if (!S.data) { el.innerHTML = ''; return; }
            const battles = Number(S.data.info['number of battles']);
            el.innerHTML =
                `<b>${usageEsc(usageFormatLabel(S.format))}</b> · ${usageEsc(usageMonthLabel(S.month))} · ` +
                `baseline ${S.baseline} · ` +
                (Number.isFinite(battles) ? `${battles.toLocaleString()} battles · ` : '');

        }

        function renderCols() {
            const el = $('[data-out=cols]');
            el.hidden = !S.data;
            const col = (key, cls, label, title = '') =>
            `<span class="${cls}${S.sort === key ? ' cur' : ''}" data-sort="${key}"` +
                  `${title ? ` title="${usageEsc(title)}"` : ''}>${label}${S.sort === key ? (S.desc ? ' ▼' : ' ▲') : ''}</span>`;
            el.innerHTML =
                '<span class="qol-us-rank">#</span><span class="qol-us-icon"></span>' +
                '<span class="qol-us-name"></span>' +
                col('usage', 'qol-us-pct', 'Usage') + col('raw', 'qol-us-raw', 'Raw') +
                col('viability', 'qol-us-via', 'Ceiling', 'Viability ceiling');
        }

        function renderList() {
            const list = $('[data-out=list]');
            if (!S.data) { list.innerHTML = ''; return; }
            const rows = visibleRows();
            const dex = usageDexFor(S.format);
            list.innerHTML = rows.length
                ? rows.map((r) => usageRowHtml(r, S.data.maxUsage, S.open.has(r.id), dex)).join('')
            : '<li class="qol-us-empty">No Pokémon match that filter.</li>';
        }

        function renderAll() {
            syncSortControls();
            renderSummary();
            renderCols();
            renderList();
        }

        // ----- loading -----

        async function loadData(token = ++S.token) {
            save();
            S.data = null;
            renderAll();
            setStatus(`Loading ${usageEsc(usageFormatLabel(S.format))}, ${usageEsc(usageMonthLabel(S.month))}… ` +
                      '<small>(large files can take a few seconds)</small>');
            try {
                const data = await usageLoadDataset(S.month, S.format, S.baseline);
                if (token !== S.token) return;
                S.data = data;
                S.open.clear();
                setStatus('');
                renderAll();
            } catch (error) {
                if (token === S.token) showError(error);
            }
        }

        async function init() {
            const token = ++S.token;
            try {
                setStatus('Loading available months…');
                S.months = await usageMonths();
                if (token !== S.token) return;

                // The newest folder can exist before its files do, so fall back a few months.
                for (const month of S.months.slice(0, 4)) {
                    const formats = await usageFormats(month).catch(() => new Map());
                    if (token !== S.token) return;
                    if (formats.size) { S.month = month; S.formats = formats; break; }
                }
                if (!S.formats.size) throw new Error('No stats found in the latest months');

                pickFormat();
                pickBaseline();
                fillMonths();
                fillFormats();
                fillBaselines();
                await loadData(token);
            } catch (error) {
                if (token === S.token) showError(error);
            }
        }

        async function changeMonth(month) {
            const token = ++S.token;
            try {
                setStatus('Loading formats…');
                const formats = await usageFormats(month);
                if (token !== S.token) return;
                S.month = month;
                S.formats = formats;
                pickFormat();
                pickBaseline();
                fillFormats();
                fillBaselines();
                await loadData(token);
            } catch (error) {
                if (token === S.token) showError(error);
            }
        }

        // ----- interaction -----

        function setSort(key) {
            if (S.sort === key) S.desc = !S.desc;
            else { S.sort = key; S.desc = key !== 'name'; }
            save();
            renderAll();
        }

        function toggleRow(id) {
            const li = root.querySelector(`.qol-us-row[data-id="${id}"]`);
            const row = S.data?.byId.get(id);
            if (!li || !row) return;

            const open = !S.open.has(id);
            if (open) S.open.add(id); else S.open.delete(id);
            li.classList.toggle('open', open);
            li.querySelector('.qol-us-detail')?.remove();
            if (open) {
                li.insertAdjacentHTML('beforeend',
                                      `<div class="qol-us-detail">${usageDetailHtml(row, usageDexFor(S.format))}</div>`);
            }
        }

        function jumpTo(id) {
            if (!S.data?.byId.has(id)) return;
            S.filter = '';
            $('[data-ctl=filter]').value = '';
            S.open.add(id);
            renderList();
            root.querySelector(`.qol-us-row[data-id="${id}"]`)?.scrollIntoView({block: 'start', behavior: 'smooth'});
        }

        root.addEventListener('click', (e) => {
            const target = e.target.closest?.('[data-act],[data-sort],[data-jump],[data-ctl=dir]');
            if (!target || !root.contains(target)) return;

            if (target.dataset.sort) setSort(target.dataset.sort);
            else if (target.dataset.jump) jumpTo(target.dataset.jump);
            else if (target.dataset.ctl === 'dir') { S.desc = !S.desc; save(); renderAll(); }
            else if (target.dataset.act === 'toggle') toggleRow(target.dataset.id);
            else if (target.dataset.act === 'retry') {
                if (S.months.length) loadData(); else init();
            }
        });

        root.addEventListener('change', (e) => {
            const ctl = e.target?.dataset?.ctl;
            const value = e.target?.value;
            if (ctl === 'month') changeMonth(value);
            else if (ctl === 'format') {
                S.format = value;
                pickBaseline();
                fillBaselines();
                loadData();
            } else if (ctl === 'baseline') {
                S.baseline = Number(value);
                loadData();
            } else if (ctl === 'sort') {
                S.sort = value;
                S.desc = value !== 'name';
                save();
                renderAll();
            }
        });

        let filterTimer = null;
        root.addEventListener('input', (e) => {
            if (e.target?.dataset?.ctl !== 'filter') return;
            clearTimeout(filterTimer);
            filterTimer = setTimeout(() => { S.filter = e.target.value; renderList(); }, 120);
        });

        // Keep typing in the filter box from reaching the client's global hotkeys.
        root.addEventListener('keydown', (e) => e.stopPropagation());

        syncSortControls();
        init();
        return S;
    }

    // ---------- tab / overlay / button ----------

    function mountUsageUi(host) {
        const root = host instanceof Element ? host : host[0];
        if (!root) return;
        usageEnsureCss();
        createUsageController(root);
    }

    // Last-resort UI if the client refuses to create a tab: a plain overlay.
    function openUsageOverlay() {
        let overlay = document.getElementById('qol-usage-overlay');
        if (overlay) { overlay.hidden = false; return; }

        overlay = document.createElement('div');
        overlay.id = 'qol-usage-overlay';
        overlay.style.cssText =
            'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.55);display:flex;' +
            'align-items:center;justify-content:center;padding:2vh 2vw';

        const panel = document.createElement('div');
        panel.style.cssText =
            'position:relative;width:min(1040px,100%);max-height:96vh;overflow:auto;border-radius:6px;' +
            'background:Canvas;color:CanvasText;box-shadow:0 4px 24px rgba(0,0,0,.5)';

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'button';
        close.textContent = 'Close';
        close.style.cssText = 'position:sticky;top:6px;float:right;margin:6px;z-index:1';
        close.addEventListener('click', () => { overlay.hidden = true; });

        const body = document.createElement('div');
        panel.append(close, body);
        overlay.appendChild(panel);
        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) overlay.hidden = true; });
        document.body.appendChild(overlay);

        mountUsageUi(body);
    }

    function mountUsageRoom(room) {
        if (room.__qolUsageMounted) return;
        room.__qolUsageMounted = true;
        room.title = 'Stats';
        room.minWidth = room.minWidth ?? 320;
        room.maxWidth = room.maxWidth ?? 1024;
        room.receive = function () {}; // nothing arrives from the server for this tab
        room.$el.addClass('ps-room-light scrollable').empty();
        mountUsageUi(room.$el);

    }

    function patchUsageRoomTraffic() {
        if (!window.app) return false;
        const id = USAGE.ROOM_ID;

        // Never ask the server about our fake room.
        patchMethod(window.app, 'send', '__qolUsageSendPatched', (original) =>
                    function (data, ...rest) {
            const rm = rest[0];
            if ((typeof rm === 'string' ? rm : rm?.id) === id) return;
            if (typeof data === 'string' && data.includes(id)) {
                if (!/^\/autojoin\b/i.test(data)) return; // /join, /leave, etc.
                const kept = data.slice(9).split(',').map((r) => r.trim()).filter((r) => r && !r.includes(id));
                if (!kept.length) return;
                data = '/autojoin ' + kept.join(',');
            }
            return original.call(this, data, ...rest);
        }
                   );

        // Swallow the "not found" reply if one still slips through.
        patchMethod(window.app, 'receive', '__qolUsageReceivePatched', (original) =>
                    function (data) {
            if (typeof data === 'string' && data.includes(id)) {
                const lines = data.split('\n');
                const ours = lines[0] === '>' + id;
                const kept = lines.filter((l, i) =>
                                          ours ? (i === 0 || !l.startsWith('|noinit|'))
                                          : !(l.includes(id) && /^\|(popup|noinit|error)\|/.test(l)));
                if (ours && kept.length <= 1) return;
                if (!kept.length || (kept.length === 1 && !kept[0].trim())) return;
                data = kept.join('\n');
            }
            return original.call(this, data);
        }
                   );

        // If the client re-created the tab on reload, fill it in.
        const room = window.app.rooms?.[id];
        if (room?.$el && !room.__qolUsageMounted) mountUsageRoom(room);
        return true;
    }

    function openUsageStatsTab() {
        if (!window.app) return;
        const id = USAGE.ROOM_ID;
        let room = app.rooms?.[id];

        if (!room) {
            try {
                // 'html' rooms are the client's generic content tabs; nojoin = don't ask the server.
                room = app.addRoom(id, 'html', true, 'Stats') || app.rooms?.[id];
            } catch (error) {
                console.warn(LOG, 'Could not create a Stats tab, using an overlay instead:', error);
                room = null;
            }
        }

        room = app.rooms?.[id] || room;
        if (room?.$el) {
            if (!room.__qolUsageMounted) mountUsageRoom(room);
            try {
                app.focusRoom(id);
                return;
            } catch (error) {
                console.warn(LOG, 'Could not focus the Stats tab, using an overlay instead:', error);
            }
        }
        openUsageOverlay();
    }

    function usageCleanUrl() {
        const id = USAGE.ROOM_ID;
        if (!location.pathname.includes(id) && !location.hash.includes(id)) return;
        const path = location.pathname.replace(id, '').replace(/\/{2,}/g, '/') || '/';
        history.replaceState(history.state, '', path + location.search);
    }

    // ====================================================================
    // DAMAGE CALCULATOR OM SUPPORT
    // ====================================================================

    // The official calculator's OM page already exposes Tier Shift, Mix and
    // Mega, and Scalemons. These extra switches update each side's stats and
    // types before calculation, without mutating shared Pokedex data.
    const CALC_OM_OPTIONS = [
        ['pokebilities', 'Pokébilities', 'All native abilities plus the selected ability are active together.'],
        ['badnboosted', 'Bad N Boosted', 'Doubles each base stat that is 70 or lower.'],
        ['camomons', 'Camomons', 'Uses the types of the first two selected moves.'],
        ['flipped', 'Flipped', 'Reverses HP / Atk / Def / SpA / SpD / Spe.'],
        ['reevolution', 'Re-Evolution', 'Adds the base-stat difference from the immediate pre-evolution, capped at 255.'],
        ['350cup', '350 Cup', 'Doubles every base stat when the original BST is 350 or lower.'],
        ['natureswap', 'Nature Swap', 'Swaps the base stats boosted and lowered by the selected nature.'],
        ['franticfusions', 'Frantic Fusions', 'Adds one quarter of the donor’s non-HP stats.'],
        ['godlygift', 'Godly Gift', 'Receives the selected God’s stat for this team position.'],
        ['sharedpower', 'Shared Power', 'Each Pokémon also has the abilities listed under Team abilities.'],
    ];

    function calcOmSelected() {
        return document.querySelector('.qol-calc-om:checked')?.value || '';
    }

    // ====================================================================
    // Prepare both Pokémon and ability-specific field/move behavior before damage.
    // ====================================================================
    // Pokébilities / Shared Power core
    // ====================================================================

    const CALC_OM_ABILITY_MODES = new Set(['pokebilities', 'sharedpower']);
    const calcOmAbilityMode = () => CALC_OM_ABILITY_MODES.has(calcOmSelected());

    const calcOmSupport = {ok: false, reason: 'not installed yet', calls: 0, cloneLost: false, neverCalled: false, onChange: null};

    // Applied through the raw stat. hasAbility() hides these from the calc so they
    // can never double count. Different abilities stack (Pokébilities runs each
    // ability's handler), so Huge Power + Pure Power = x4.
    const CALC_OM_STAT_ABILITIES = {
        'Huge Power': {atk: 2},
        'Pure Power': {atk: 2},
    };
    const CALC_OM_WEATHER_ABILITIES = {
        'Drought': 'Sun', 'Orichalcum Pulse': 'Sun', 'Drizzle': 'Rain', 'Sand Stream': 'Sand',
        'Snow Warning': () => (calcOmGenNumber() >= 9 ? 'Snow' : 'Hail'),
        'Desolate Land': 'Harsh Sunshine', 'Primordial Sea': 'Heavy Rain', 'Delta Stream': 'Strong Winds',
    };
    const CALC_OM_TERRAIN_ABILITIES = {
        'Electric Surge': 'Electric', 'Hadron Engine': 'Electric', 'Grassy Surge': 'Grassy',
        'Seed Sower': 'Grassy', 'Psychic Surge': 'Psychic', 'Misty Surge': 'Misty',
    };
    // Field flags; guarded with `in`, so a calc build without them is a no-op.
    const CALC_OM_RUIN_FLAGS = {
        'Beads of Ruin': 'isBeadsOfRuin', 'Sword of Ruin': 'isSwordOfRuin',
        'Tablets of Ruin': 'isTabletsOfRuin', 'Vessel of Ruin': 'isVesselOfRuin',
    };


    // Resolved by our own pre-calc pass instead of the engine; hasAbility() hides them
    // while a pool mode is active so the engine's single-ability code can't double count.
    const CALC_OM_HIDDEN_FROM_ENGINE = new Set([
        'Intimidate', 'Download', 'Intrepid Sword', 'Dauntless Shield',
        'Mold Breaker', 'Teravolt', 'Turboblaze', 'Neutralizing Gas',
    ]);

    const CALC_OM_INTIMIDATE_BLOCKERS = new Set([
        'Clear Body', 'White Smoke', 'Hyper Cutter', 'Full Metal Body',
        'Inner Focus', 'Oblivious', 'Own Tempo', 'Scrappy',
    ]);

    // The abilities the page's single "ability on" checkbox covers (shared_controls.js TOGGLE_ABILITIES).
    const CALC_OM_TOGGLE_ON = new Set(['Intimidate', 'Slow Start', 'Teraform Zero', 'Intrepid Sword', 'Dauntless Shield']);
    const CALC_OM_TOGGLE_OFF = new Set(['Flash Fire', 'Minus', 'Plus', 'Unburden', 'Analytic', 'Stakeout', 'Electromorphosis']);

    // Same list as `defenderAbilityIgnored` in gen789.ts.
    const CALC_OM_BREAKABLE = new Set([
        "Armor Tail",
        "Aroma Veil",
        "Aura Break",
        "Battle Armor",
        "Big Pecks",
        "Bulletproof",
        "Clear Body",
        "Contrary",
        "Damp",
        "Dazzling",
        "Disguise",
        "Dry Skin",
        "Earth Eater",
        "Eelevate",
        "Filter",
        "Flash Fire",
        "Flower Gift",
        "Flower Veil",
        "Fluffy",
        "Friend Guard",
        "Fur Coat",
        "Good as Gold",
        "Grass Pelt",
        "Guard Dog",
        "Heatproof",
        "Heavy Metal",
        "Hyper Cutter",
        "Ice Face",
        "Ice Scales",
        "Illuminate",
        "Immunity",
        "Inner Focus",
        "Insomnia",
        "Keen Eye",
        "Leaf Guard",
        "Levitate",
        "Light Metal",
        "Lightning Rod",
        "Limber",
        "Magic Bounce",
        "Magma Armor",
        "Marvel Scale",
        "Mind's Eye",
        "Mirror Armor",
        "Motor Drive",
        "Multiscale",
        "Oblivious",
        "Overcoat",
        "Own Tempo",
        "Pastel Veil",
        "Punk Rock",
        "Purifying Salt",
        "Queenly Majesty",
        "Sand Veil",
        "Sap Sipper",
        "Shell Armor",
        "Shield Dust",
        "Simple",
        "Snow Cloak",
        "Solid Rock",
        "Soundproof",
        "Sticky Hold",
        "Storm Drain",
        "Sturdy",
        "Suction Cups",
        "Sweet Veil",
        "Tangled Feet",
        "Telepathy",
        "Tera Shell",
        "Thermal Exchange",
        "Thick Fat",
        "Unaware",
        "Vital Spirit",
        "Volt Absorb",
        "Water Absorb",
        "Water Bubble",
        "Water Veil",
        "Well-Baked Body",
        "White Smoke",
        "Wind Rider",
        "Wonder Guard",
        "Wonder Skin"
    ]);
    const CALC_OM_MOLD_BREAKERS = new Set(['Mold Breaker', 'Teravolt', 'Turboblaze']);
    const CALC_OM_IGNORING_MOVES = new Set([
        'G-Max Drum Solo', 'G-Max Fire Ball', 'G-Max Hydrosnipe', 'Light That Burns the Sky',
        'Menacing Moonraze Maelstrom', 'Moongeist Beam', 'Photon Geyser', 'Searing Sunraze Smash',
        'Sunsteel Strike',
    ]);
    const CALC_OM_GAS_IMMUNE = new Set([
        'As One (Glastrier)', 'As One (Spectrier)', 'Battle Bond', 'Comatose', 'Disguise',
        'Gulp Missile', 'Ice Face', 'Multitype', 'Neutralizing Gas', 'Power Construct', 'RKS System',
        'Schooling', 'Shields Down', 'Stance Change', 'Tera Shift', 'Zen Mode', 'Zero to Hero',
    ]);

    // Abilities whose presence can change a result through our own code (leave-one-out attribution).
    const CALC_OM_PREPARED_ABILITIES = new Set([
        'Skill Link', 'Steely Spirit', 'Long Reach', 'Protean', 'Libero',
        'Contrary', 'Simple', 'Defiant', 'Competitive', 'Rattled', 'Guard Dog', 'Mirror Armor',
        ...CALC_OM_INTIMIDATE_BLOCKERS, ...CALC_OM_HIDDEN_FROM_ENGINE,
        ...Object.keys(CALC_OM_STAT_ABILITIES), ...Object.keys(CALC_OM_WEATHER_ABILITIES),
        ...Object.keys(CALC_OM_TERRAIN_ABILITIES),
    ]);

    const calcOmClamp6 = (n) => Math.max(-6, Math.min(6, n));

    // Applies a stat change the way the game does: Simple doubles it, Contrary flips it.
    // Returns the change that actually happened.
    function calcOmChangeBoost(pokemon, stat, delta) {
        const abilities = calcOmActiveAbilities(pokemon);
        let amount = delta;
        if (abilities.includes('Simple')) amount *= 2;
        if (abilities.includes('Contrary')) amount = -amount;
        const before = pokemon.boosts[stat] || 0;
        pokemon.boosts[stat] = calcOmClamp6(before + amount);
        return pokemon.boosts[stat] - before;
    }

    // Only the ON-by-default switch-in abilities obey the page's toggle, and only when
    // they are the Pokémon's selected ability. Pooled ones are simply on.
    function calcOmSwitchInOn(pokemon, ability) {
        if (!CALC_OM_TOGGLE_ON.has(ability)) return true;
        return ability === pokemon.__qolOmReal ? !!pokemon.__qolOmRealOn : true;
    }

    function calcOmBoostedStat(pokemon, stat, wonderRoom) {
        const rawKey = wonderRoom ? (stat === 'def' ? 'spd' : stat === 'spd' ? 'def' : stat) : stat;
        const raw = pokemon.rawStats[rawKey];
        const b = pokemon.boosts[stat] || 0;
        return Math.floor(b >= 0 ? (raw * (2 + b)) / 2 : (raw * 2) / (2 - b));
    }

    // Intimidate, including everything that reacts to it.
    function calcOmIntimidate(source, target) {
        if (!calcOmActiveAbilities(source).includes('Intimidate') || !calcOmSwitchInOn(source, 'Intimidate')) return;

        const abilities = calcOmActiveAbilities(target);
        if (target.item === 'Clear Amulet') return;
        if (abilities.some((a) => CALC_OM_INTIMIDATE_BLOCKERS.has(a))) return;

        // Guard Dog turns the drop into a +1 (which Contrary then flips back, as in game).
        if (abilities.includes('Guard Dog')) {
            calcOmChangeBoost(target, 'atk', 1);
            return;
        }

        // Mirror Armor bounces the drop to the user.
        const victim = abilities.includes('Mirror Armor') ? source : target;
        const victimAbilities = calcOmActiveAbilities(victim);

        const change = calcOmChangeBoost(victim, 'atk', -1);
        if (change < 0) {
            if (victimAbilities.includes('Defiant')) calcOmChangeBoost(victim, 'atk', 2);
            if (victimAbilities.includes('Competitive')) calcOmChangeBoost(victim, 'spa', 2);
        }
        if (change !== 0 && victimAbilities.includes('Rattled')) calcOmChangeBoost(victim, 'spe', 1);
    }

    function calcOmDownload(source, target, wonderRoom) {
        if (!calcOmActiveAbilities(source).includes('Download')) return;
        const def = calcOmBoostedStat(target, 'def', wonderRoom);
        const spd = calcOmBoostedStat(target, 'spd', wonderRoom);
        calcOmChangeBoost(source, def >= spd ? 'spa' : 'atk', 1);
    }

    // Intrepid Sword (+1 Atk) / Dauntless Shield (+1 Def). Contrary makes them drops.
    function calcOmSelfBoost(pokemon, ability, stat) {
        if (pokemon.gen?.num === 8) return;
        if (!calcOmActiveAbilities(pokemon).includes(ability) || !calcOmSwitchInOn(pokemon, ability)) return;
        calcOmChangeBoost(pokemon, stat, 1);
    }

    // Mold Breaker & co. only remove abilities that can actually be broken; the engine's
    // `defender.ability = ''` would wipe the whole pool.
    function calcOmIgnoreAbilities(source, target, move) {
        const breaks = calcOmActiveAbilities(source).some((a) => CALC_OM_MOLD_BREAKERS.has(a)) ||
              (move && CALC_OM_IGNORING_MOVES.has(move.name));
        if (!breaks || target.item === 'Ability Shield') return;
        target.__qolOmAbilities = (target.__qolOmAbilities || []).filter((a) => !CALC_OM_BREAKABLE.has(a));
    }

    // Neutralizing Gas suppresses everything except its immunity list.
    function calcOmNeutralize(source, target) {
        if (!calcOmActiveAbilities(source).includes('Neutralizing Gas') || target.item === 'Ability Shield') return;
        target.__qolOmAbilities = (target.__qolOmAbilities || []).filter((a) => CALC_OM_GAS_IMMUNE.has(a));
    }

    // The type a move ends up with after Aerilate & friends (same order as gen789.ts).
    function calcOmFinalMoveType(abilities, move) {
        const keep = ['Revelation Dance', 'Judgment', 'Nature Power', 'Techno Blast', 'Multi-Attack',
                      'Natural Gift', 'Weather Ball', 'Terrain Pulse', 'Struggle'];
        if (move.isZ || keep.includes(move.name)) return move.type;

        const normal = move.type === 'Normal';
        if (abilities.includes('Aerilate') && normal) return 'Flying';
        if (abilities.includes('Galvanize') && normal) return 'Electric';
        if (abilities.includes('Liquid Voice') && move.flags?.sound) return 'Water';
        if (abilities.includes('Pixilate') && normal) return 'Fairy';
        if (abilities.includes('Refrigerate') && normal) return 'Ice';
        if (abilities.includes('Normalize')) return 'Normal';
        if (abilities.includes('Dragonize') && normal) return 'Dragon';
        return move.type;
    }

    // ---------- ability pool per mode ----------

    function calcOmAbilityPool(pokemon, mode) {
        const pool = new Set();
        const selected = pokemon.__qolOmTracked ? pokemon.__qolOmReal : pokemon.ability;
        if (selected) pool.add(selected);

        if (mode === 'pokebilities') {
            calcOmSpeciesAbilityList(pokemon.species).forEach((a) => pool.add(a));
        } else if (mode === 'sharedpower') {
            (pokemon.__qolOmShared || []).forEach((a) => pool.add(a));
        }
        return [...pool];
    }

    // What the calc is allowed to see right now (honours Mold Breaker clearing and
    // the leave-one-out exclusion).
    function calcOmActiveAbilities(pokemon) {
        if (!pokemon?.__qolOmTracked || pokemon.__qolOmCleared) return [];
        const excluded = pokemon.__qolOmExcluded;
        return (pokemon.__qolOmAbilities || []).filter((a) => a !== excluded);
    }

    function calcOmStatMultipliers(pokemon) {
        const mult = {};
        for (const ability of calcOmActiveAbilities(pokemon)) {
            for (const [stat, m] of Object.entries(CALC_OM_STAT_ABILITIES[ability] || {})) {
                mult[stat] = (mult[stat] || 1) * m;
            }
        }
        return mult;
    }

    // The calc clones inside calculate() and recomputes rawStats from the species,
    // so the multiplier has to be re-applied on every clone (see proto.clone below).
    function calcOmApplyStatMult(pokemon) {
        for (const [stat, m] of Object.entries(pokemon.__qolOmStatMult || {})) {
            const value = Math.floor(pokemon.rawStats[stat] * m);
            pokemon.rawStats[stat] = value;
            if (pokemon.stats) pokemon.stats[stat] = value;
        }
    }

    // ---------- tracking ----------

    function calcOmHasAbility(...queries) {
        if (this.__qolOmCleared) return false;
        const active = calcOmActiveAbilities(this);
        const hide = calcOmAbilityMode();
        for (const query of queries) {
            if (CALC_OM_STAT_ABILITIES[query]) continue;                 // applied via rawStats instead
            if (hide && CALC_OM_HIDDEN_FROM_ENGINE.has(query)) continue; // resolved in calcOmPrepareCalculation
            if (active.includes(query)) {
                this.__qolOmQueried.add(query);
                this.__qolOmLast = query; // lets abilityOn answer for the ability being asked about
                return true;
            }
        }
        return false;
    }




    function calcOmAutoSetField(side) {
        if (!calcOmAbilityMode() || typeof window.createPokemon !== 'function') return;
        const form = window.$(`#${side}`);
        if (!form.length) return;

        const index = side === 'p2' ? 1 : 0;
        const abilities = calcOmActiveAbilities(window.createPokemon(form));

        const weather = abilities.find((a) => CALC_OM_WEATHER_ABILITIES[a]);
        const terrain = abilities.find((a) => CALC_OM_TERRAIN_ABILITIES[a]);
        if (weather && typeof window.autosetWeather === 'function') window.autosetWeather(weather, index);
        if (terrain && typeof window.autosetTerrain === 'function') window.autosetTerrain(terrain, index);
    }

    // ---------- prepare: everything we apply ourselves ----------

    function calcOmFieldFromAbilities(field, attacker, defender) {
        if (!field || typeof field.clone !== 'function') return field;

        const abilities = [...calcOmActiveAbilities(attacker), ...calcOmActiveAbilities(defender)];
        const first = (table) => {
            const name = abilities.find((a) => table[a]);
            const value = name && table[name];
            return typeof value === 'function' ? value() : value || '';
        };

        const next = field.clone();
        let changed = false;

        // An explicit weather/terrain chosen in the UI always wins.
        const weather = first(CALC_OM_WEATHER_ABILITIES);
        if (weather && !next.weather) { next.weather = weather; changed = true; }

        const terrain = first(CALC_OM_TERRAIN_ABILITIES);
        if (terrain && !next.terrain) { next.terrain = terrain; changed = true; }

        // Ruin flags are field-wide; the calc exempts the holder.
        for (const [ability, flag] of Object.entries(CALC_OM_RUIN_FLAGS)) {
            if (abilities.includes(ability) && flag in next && !next[flag]) { next[flag] = true; changed = true; }
        }

        const side = next.attackerSide;


        return changed ? next : field;
    }




    function calcOmPrepareCalculation(attacker, defender, move, field) {
        const mode = calcOmSelected();
        const active = CALC_OM_ABILITY_MODES.has(mode);

        for (const pokemon of [attacker, defender]) {
            if (!pokemon?.species) continue;
            if (active) {
                calcOmTrackAbilities(pokemon, calcOmAbilityPool(pokemon, mode));
                pokemon.__qolOmStatMult = calcOmStatMultipliers(pokemon);
            } else if (pokemon.__qolOmTracked) {
                pokemon.__qolOmAbilities = [pokemon.__qolOmReal].filter(Boolean); // mode off: real ability only
                pokemon.__qolOmStatMult = null;
                pokemon.__qolOmProteanType = null;
            }
        }
        if (!active || !attacker?.species || !defender?.species) return {attacker, defender, move, field};

        // Work on private copies: attribution re-runs this many times and boosts must not stack
        // on the page's objects.
        const a = attacker.clone();
        const d = defender.clone();
        const wonderRoom = !!field?.isWonderRoom;

        // Same order as the engine: Intimidate, Download, Intrepid Sword / Dauntless Shield.
        calcOmIntimidate(a, d);
        calcOmIntimidate(d, a);
        calcOmDownload(a, d, wonderRoom);
        calcOmDownload(d, a, wonderRoom);
        calcOmSelfBoost(a, 'Intrepid Sword', 'atk');
        calcOmSelfBoost(d, 'Intrepid Sword', 'atk');
        calcOmSelfBoost(a, 'Dauntless Shield', 'def');
        calcOmSelfBoost(d, 'Dauntless Shield', 'def');

        // Ability suppression happens after switch-in effects, before the damage formula.
        calcOmIgnoreAbilities(a, d, move);
        calcOmNeutralize(a, d);
        calcOmNeutralize(d, a);
        for (const p of [a, d]) p.__qolOmStatMult = calcOmStatMultipliers(p);

        const abilities = calcOmActiveAbilities(a);

        // Protean / Libero: the user becomes the move's type, so Adaptability (which checks
        // hasType) must see it. See the hasType wrapper in calcOmTrackAbilities.
        a.__qolOmProteanType =
            move && !a.teraType && (abilities.includes('Protean') || abilities.includes('Libero'))
            ? calcOmFinalMoveType(abilities, move)
        : null;
        d.__qolOmProteanType = null;

        // Move edits: Skill Link (max hits) and Long Reach (no contact => no Tough Claws,
        // Fluffy, Unseen Fist...).
        let preparedMove = move;
        if (move) {
            const range = abilities.includes('Skill Link')
            ? a.gen?.moves?.get?.(toSearchId(move.name))?.multihit : null;
            const skillLink = Array.isArray(range) && move.hits !== range[1];
            const longReach = abilities.includes('Long Reach') && !!move.flags?.contact;

            if (skillLink || longReach) {
                preparedMove = move.clone();
                if (skillLink) preparedMove.hits = range[1];
                if (longReach) {
                    preparedMove.flags = Object.assign({}, preparedMove.flags);
                    delete preparedMove.flags.contact;
                }
            }
        }

        return {attacker: a, defender: d, move: preparedMove, field: calcOmFieldFromAbilities(field, attacker, defender)};
    }

    // ---------- attribution: only list abilities that change the result ----------

    function calcOmResultSignature(result) {
        const desc = Object.assign({}, result.rawDesc);
        delete desc.attackerAbility;
        delete desc.defenderAbility;
        try {
            return JSON.stringify([result.damage, desc]);
        } catch (e) {
            return String(result.damage);
        }
    }

    const calcOmDebug = (...args) => { if (window.__qolOmDebug) console.log(LOG, ...args); };

    function calcOmAnnotateResult(result, attacker, defender, run) {
        const base = calcOmResultSignature(result);

        // Collect candidates for BOTH sides before any re-run touches the query sets.
        const targets = [
            [attacker, result.attacker, 'attackerAbility', 'attacker'],
            [defender, result.defender, 'defenderAbility', 'defender'],
        ].map(([input, used, key, label]) => {
            if (!input?.__qolOmTracked) {
                calcOmDebug(label, 'skipped: input not tracked');
                return null;
            }
            if (!used?.__qolOmTracked) {
                // The calc's clone lost our tracking: exclusions can't work, so keep the native text.
                calcOmSupport.cloneLost = true;
                calcOmDebug(label, 'skipped: result clone not tracked');
                return null;
            }

            const active = calcOmActiveAbilities(input);
            const queried = active.filter(
                (a) => input.__qolOmQueried.has(a) || CALC_OM_PREPARED_ABILITIES.has(a)
            );
            // If nothing was recorded, don't trust the prefilter: test everything.
            return {input, key, label, active, candidates: queried.length ? queried : active};
        });

        for (const t of targets) {
            if (!t) continue;
            try {
                const affecting = [];
                for (const ability of t.candidates) {
                    t.input.__qolOmExcluded = ability;
                    try {
                        if (calcOmResultSignature(run()) !== base) affecting.push(ability);
                    } finally {
                        t.input.__qolOmExcluded = null;
                        t.input.__qolOmStatMult = calcOmStatMultipliers(t.input);
                    }
                }

                calcOmDebug(t.label, {active: t.active, candidates: t.candidates, affecting});
                if (affecting.length) result.rawDesc[t.key] = affecting.join(' ');
                else delete result.rawDesc[t.key];
            } catch (error) {
                console.error(LOG, `Attribution failed for ${t.label}:`, error);
            }
        }
    }



    function installCalcOmAbilitySupport() {
        if (calcOmSupport.ok) return true;

        const fail = (reason) => { calcOmSupport.reason = reason; return false; };
        const ns = window.calc;
        const proto = ns?.Pokemon?.prototype;

        if (!ns) return fail('window.calc is not defined yet');
        if (!proto) return fail('calc.Pokemon.prototype is missing');
        if (typeof proto.clone !== 'function') return fail('Pokemon.prototype.clone is missing');
        if (typeof ns.calculate !== 'function') return fail('calc.calculate is missing');

        const originalCalculate = ns.calculate;
        const wrapped = function (gen, attacker, defender, move, field, ...rest) {
            calcOmSupport.calls++;
            calcOmSupport.cloneLost = false;
            calcOmDebug('wrapper called, mode =', calcOmSelected() || '(none)');


            const run = () => {
                let prepared = {attacker, defender, move, field};
                try {
                    prepared = calcOmPrepareCalculation(attacker, defender, move, field);
                } catch (error) {
                    console.error(LOG, 'Ability preparation failed:', error);
                }
                return originalCalculate.call(
                    ns, gen, prepared.attacker, prepared.defender, prepared.move, prepared.field, ...rest
                );
            };

            if (!calcOmAbilityMode()) return run();

            for (const p of [attacker, defender]) p?.__qolOmQueried?.clear();
            const result = run();
            if (result?.rawDesc) {
                try {
                    calcOmAnnotateResult(result, attacker, defender, run);
                } catch (error) {
                    console.error(LOG, 'Ability attribution failed:', error);
                }
            }
            return result;
        };

        // Namespace objects built by TS/webpack are often getter-only. Try the plain
        // assignment, then defineProperty, then a Proxy over window.calc.
        let installed = false;
        try { ns.calculate = wrapped; installed = ns.calculate === wrapped; } catch (e) { /* read-only */ }
        if (!installed) {
            try {
                Object.defineProperty(ns, 'calculate', {value: wrapped, configurable: true, writable: true});
                installed = ns.calculate === wrapped;
            } catch (e) { /* non-configurable */ }
        }
        if (!installed) {
            try {
                window.calc = new Proxy(ns, {
                    get: (target, key, receiver) => (key === 'calculate' ? wrapped : Reflect.get(target, key, receiver)),
                });
                installed = window.calc.calculate === wrapped;
            } catch (e) { /* window.calc not writable */ }
        }
        if (!installed) return fail('calc.calculate could not be wrapped (read-only namespace)');

        calcOmSupport.ok = true;
        calcOmSupport.reason = '';
        console.info(LOG, 'Ability modes installed');
        return true;
    }

    function calcOmStatusMessage() {
        if (!calcOmAbilityMode()) return '';
        if (!calcOmSupport.ok) return `Ability modes are not active: ${calcOmSupport.reason}`;
        if (calcOmSupport.cloneLost) return 'Ability modes: the calc clones Pokémon without keeping their ability pool, so only the selected ability applies.';
        if (calcOmSupport.neverCalled) return 'Ability modes: calc.calculate was wrapped but the page never called the wrapper (it uses a different reference).';
        return '';
    }

    function calcOmAllAbilityNames() {
        const names = new Set();
        for (const n of window.calc?.ABILITIES?.[calcOmGenNumber()] || []) if (n) names.add(n);
        try {
            for (const a of calcOmGeneration()?.abilities || []) if (a?.name) names.add(a.name);
        } catch (e) { /* not iterable in this build */ }
        return [...names].sort((a, b) => a.localeCompare(b));
    }

    // ---------- Shared Power UI ----------

    const calcOmSharedList = (group) => {
        try { return JSON.parse(group.dataset.abilities || '[]'); } catch (e) { return []; }
    };

    function calcOmSharedAbilities(side) {
        const group = document.querySelector(`.qol-om-shared-group[data-side="${side}"]`);
        return group ? calcOmSharedList(group) : [];
    }

    function calcOmFillAbilityDatalist() {
        let list = document.getElementById('qol-om-ability-list');
        if (!list) {
            list = document.createElement('datalist');
            list.id = 'qol-om-ability-list';
            document.body.appendChild(list);
        }
        const names = calcOmAllAbilityNames();
        const key = `${calcOmGenNumber()}|${names.length}`;
        if (list.dataset.key !== key) {
            list.replaceChildren(...names.map((name) => {
                const option = document.createElement('option');
                option.value = name;
                return option;
            }));
            list.dataset.key = key;
        }
        return names.length;
    }

    function calcOmRenderSharedChips(group) {
        group.querySelector('.qol-om-chips').replaceChildren(
            ...calcOmSharedList(group).map((name) => {
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'btn qol-om-chip';
                chip.dataset.ability = name;
                chip.title = 'Click to remove';
                chip.textContent = `${name} ×`;
                chip.style.cssText = 'width:auto;padding:0 -2px;margin:3px 3px 0 0;font-size:11px;line-height:18px;';
                return chip;
            })
        );
    }

    function calcOmBuildSharedRow(side, form, fallbackAnchor) {
        const group = document.createElement('div');
        group.className = 'select qol-om-shared-group';
        group.dataset.side = side;
        group.dataset.abilities = '[]';
        group.style.display = 'none';

        const label = document.createElement('label');
        label.textContent = 'Team Abilities';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'select';
        input.setAttribute('list', 'qol-om-ability-list');
        input.placeholder = '';
        input.autocomplete = 'on';
        input.style.width = '140px';

        const chips = document.createElement('div');
        chips.className = 'qol-om-chips';

        group.append(label, ' ', input, chips);

        const changed = () => document.dispatchEvent(new CustomEvent('qol-shared-change', {detail: {side}}));

        const add = () => {
            const typed = input.value.trim();
            if (!typed) return;
            const match = calcOmAllAbilityNames().find((n) => toSearchId(n) === toSearchId(typed));
            if (!match) { input.style.outline = '3px solid #c0392b'; return; }
            input.style.outline = 'cursor: pointer';

            const list = calcOmSharedList(group);
            if (!list.includes(match)) {
                list.push(match);
                group.dataset.abilities = JSON.stringify(list);
                calcOmRenderSharedChips(group);
                changed();
            }
            input.value = '';
        };

        input.addEventListener('change', add);
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') { event.preventDefault(); add(); }
        });
        input.addEventListener('input', () => { input.style.outline = ''; });

        group.addEventListener('click', (event) => {
            const chip = event.target.closest('.qol-om-chip');
            if (!chip) return;
            group.dataset.abilities = JSON.stringify(calcOmSharedList(group).filter((a) => a !== chip.dataset.ability));
            calcOmRenderSharedChips(group);
            changed();
        });

        // Indicate that ability chips are clickable.
        group.addEventListener('mouseover', (event) => {
            const chip = event.target.closest('.qol-om-chip');
            if (chip) chip.style.cursor = 'pointer';
        });

        const abilityRow = form?.querySelector('.ability')?.closest('.info-group');
        (abilityRow || fallbackAnchor).insertAdjacentElement('afterend', group);
        return group;
    }

    // Abilities per species, from the calculator's own data PLUS Showdown's pokedex.json
    // (the calculator's data may only list a species' first ability).
    let calcOmPsDex = null;
    let calcOmPsDexRequested = false;

    function calcOmLoadPsDex(onLoad) {
        if (calcOmPsDex || calcOmPsDexRequested) return;
        calcOmPsDexRequested = true;
        fetch('https://play.pokemonshowdown.com/data/pokedex.json')
            .then((response) => response.json())
            .then((data) => {
            calcOmPsDex = data;
            if (typeof onLoad === 'function') onLoad();
        })
            .catch((error) => console.warn(LOG, 'Could not load Pokédex abilities:', error));
    }

    function calcOmSpeciesAbilityList(species) {
        const names = new Set();
        const own = species?.abilities;
        for (const name of Array.isArray(own) ? own : Object.values(own || {})) {
            if (name) names.add(name);
        }
        const extra = calcOmPsDex?.[toSearchId(species?.name)]?.abilities;
        for (const name of Object.values(extra || {})) {
            if (name) names.add(name);
        }
        return [...names];
    }

    const calcOmSpeciesAbilities = (pokemon) => calcOmSpeciesAbilityList(pokemon?.species);

    // Skill Link is the one ability the Move constructor reads, so it needs a manual nudge.
    function calcOmApplySkillLink(pokemon) {
        if (!pokemon.__qolOmAbilities?.includes('Skill Link')) return;
        for (const move of pokemon.moves || []) {
            if (!move || typeof move !== 'object' || move.name === '(No Move)') continue;
            const range = pokemon.gen?.moves?.get?.(toSearchId(move.name))?.multihit;
            if (Array.isArray(range)) move.hits = range[1];
        }
    }

    // Makes a Pokémon "have" several abilities at once. When the calculator reads
    // the ability immediately after a successful hasAbility() check to build its
    // description, report the complete active set so copied calcs show Pokébilities
    // for both sides, not only the ability that happened to be checked first.

    function calcOmCopyTracking(from, to) {
        calcOmTrackAbilities(to, from.__qolOmAbilities || []);
        to.__qolOmCleared = from.__qolOmCleared;
        to.__qolOmExcluded = from.__qolOmExcluded;
        to.__qolOmShared = from.__qolOmShared;
        to.__qolOmQueried = from.__qolOmQueried;
        to.__qolOmStatMult = from.__qolOmStatMult;
        to.__qolOmRealOn = from.__qolOmRealOn;
        to.__qolOmProteanType = from.__qolOmProteanType;
        calcOmApplyStatMult(to);
    }

    function calcOmTrackAbilities(pokemon, abilities) {
        pokemon.__qolOmAbilities = abilities.slice();
        if (pokemon.__qolOmTracked) return;

        pokemon.__qolOmTracked = true;
        pokemon.__qolOmReal = pokemon.ability;       // read BEFORE redefining
        pokemon.__qolOmRealOn = pokemon.abilityOn;   // the page's checkbox value
        pokemon.__qolOmCleared = false;
        pokemon.__qolOmExcluded = null;              // leave-one-out probe
        pokemon.__qolOmQueried = new Set();          // shared with clones
        pokemon.__qolOmShared = pokemon.__qolOmShared || [];
        pokemon.__qolOmStatMult = null;
        pokemon.__qolOmLast = null;                  // last ability hasAbility() said yes to
        pokemon.__qolOmProteanType = null;

        Object.defineProperty(pokemon, 'hasAbility', {configurable: true, writable: true, value: calcOmHasAbility});

        // Protean / Libero: report the move's type as one of the user's types so
        // Adaptability's hasType(move.type) check passes. Only that exact type, so
        // grounding (hasType('Flying')) and Tera checks are untouched.
        const protoHasType = Object.getPrototypeOf(pokemon).hasType;
        if (typeof protoHasType === 'function') {
            Object.defineProperty(pokemon, 'hasType', {
                configurable: true, writable: true,
                value: function (...types) {
                    if (protoHasType.apply(this, types)) return true;
                    const t = this.__qolOmProteanType;
                    return !!t && !this.teraType && types.includes(t);
                },
            });
        }

        // The calculator clones inside calculate() (and for Parental Bond's child),
        // so every clone must carry the ability pool too.
        const protoClone = pokemon.clone;
        if (typeof protoClone === 'function' && !protoClone.__qolAbilityCloneWrapped) {
            const trackedClone = function (...args) {
                const clone = protoClone.apply(this, args);
                if (clone && this.__qolOmTracked) calcOmCopyTracking(this, clone);
                return clone;
            };
            trackedClone.__qolAbilityCloneWrapped = true;
            Object.defineProperty(pokemon, 'clone', {configurable: true, writable: true, value: trackedClone});
        }

        Object.defineProperty(pokemon, 'ability', {
            configurable: true,
            enumerable: true,
            get() {
                if (window.__qolOmTrace) {
                    console.debug(LOG, 'direct .ability read:', new Error().stack.split('\n').slice(2, 4).join(' | '));
                }
                return this.__qolOmReal;
            },
            set(value) {
                this.__qolOmReal = value;
                this.__qolOmCleared = !value;
                if (!value) return;
                if (!this.__qolOmAbilities.includes(value)) this.__qolOmAbilities.push(value);
                // Parental Bond's child hit must not spawn another child: drop the parent ability.
                const child = /^(.*) \(Child\)$/.exec(value);
                if (child) this.__qolOmAbilities = this.__qolOmAbilities.filter((a) => a !== child[1]);
            },
        });

        // The page has ONE "ability on" checkbox, shaped for the selected ability. For a pooled
        // ability answer with that ability's own default (Flash Fire off, Intimidate on...).
        Object.defineProperty(pokemon, 'abilityOn', {
            configurable: true,
            enumerable: true,
            get() {
                const last = this.__qolOmLast;
                if (last && last !== this.__qolOmReal && calcOmAbilityMode()) {
                    if (CALC_OM_TOGGLE_ON.has(last)) return true;
                    if (CALC_OM_TOGGLE_OFF.has(last)) return false;
                }
                return this.__qolOmRealOn;
            },
            set(value) { this.__qolOmRealOn = value; },
        });
    }



    function calcOmSpeciesStats(species) {
        return species?.baseStats || species?.bs || null;
    }

    function calcOmSpeciesStat(species, stat) {
        const stats = calcOmSpeciesStats(species);
        if (!stats) return 0;
        const legacy = {atk: 'at', def: 'df', spa: 'sa', spd: 'sd', spe: 'sp'}[stat] || stat;
        const value = stats[stat] ?? stats[legacy] ??
              ((stat === 'spa' || stat === 'spd') ? stats.sl : undefined);
        return Number(value) || 0;
    }

    function calcOmSpeciesTypes(species) {
        return species?.types || [];
    }


    function calcOmFindSpecies(name, genData) {
        if (!name) return null;
        const id = toSearchId(name);
        const fromGeneration = genData?.species?.get?.(id);
        if (fromGeneration?.exists) return fromGeneration;
        const dex = window.pokedex || (typeof pokedex !== 'undefined' ? pokedex : {});
        return dex[name] || dex[id] || Object.values(dex).find((species) => toSearchId(species?.name) === id) || null;
    }



    function calcOmModifiedStats(pokemon, mod) {
        const original = pokemon.species.baseStats;
        const sharedModifier = SPECIES_STAT_MODIFIERS[MOD_BY_CALC_OM.get(mod)];
        if (sharedModifier) {
            return clampBaseStats(sharedModifier(pokemon.species, original) || Object.assign({}, original));
        }

        const stats = Object.assign({}, original);
        if (mod === 'reevolution') {
            const prevo = pokemon.species.prevo && pokemon.gen?.species?.get?.(toSearchId(pokemon.species.prevo));
            if (prevo?.exists && prevo.baseStats && !prevo.battleOnly) {
                for (const stat of STATS) stats[stat] = clamp255(stats[stat] + original[stat] - calcOmSpeciesStat(prevo, stat));
            }
        } else if (mod === 'natureswap') {
            const nature = pokemon.gen?.natures?.get?.(toSearchId(pokemon.nature));
            if (nature?.plus && nature?.minus && nature.plus !== nature.minus) {
                [stats[nature.plus], stats[nature.minus]] = [stats[nature.minus], stats[nature.plus]];
            }
        }

        return clampBaseStats(stats);
    }

    function calcOmCamomonsTypes(pokemon) {
        const types = [];
        for (const move of pokemon.moves || []) {
            if (!move || move.name === '(No Move)' || !move.type) continue;
            if (!types.includes(move.type)) types.push(move.type);
            if (types.length === 2) break;
        }
        return types.length ? types : pokemon.types.slice();
    }

    function calcOmSide(pokeInfo) {
        return pokeInfo?.attr?.('id') === 'p2' ? 'p2' : 'p1';
    }

    function calcOmEnteredSpecies(pokemon, pokeInfo) {
        const side = calcOmSide(pokeInfo);
        const name = document.querySelector(`#qol-om-source-${side}`)?.value?.trim();
        if (!name) return null;
        const species = pokeInfo?.find?.('.set-selector')?.length
        ? pokemon.gen?.species?.get?.(toSearchId(name))
        : null;
        return species?.exists ? species : null;
    }

    function calcOmSetBaseStats(pokemon, stats) {
        const oldMaxHP = pokemon.rawStats.hp;
        const oldCurrentHP = pokemon.originalCurHP;
        stats = clampBaseStats(stats);
        pokemon.species.baseStats = Object.assign({}, pokemon.species.baseStats, stats);
        for (const stat of STATS) {
            const value = pokemon.calcStat(pokemon.gen, stat);
            pokemon.rawStats[stat] = value;
            pokemon.stats[stat] = value;
        }
        if (oldMaxHP > 0 && pokemon.rawStats.hp !== oldMaxHP) {
            pokemon.originalCurHP = oldCurrentHP >= oldMaxHP
                ? pokemon.rawStats.hp
            : Math.max(1, Math.floor(oldCurrentHP * pokemon.rawStats.hp / oldMaxHP));
        }
    }

    function applyCalcOm(pokemon, pokeInfo) {
        const mod = calcOmSelected();
        if (!mod || !pokemon?.species) return pokemon;


        if (CALC_OM_ABILITY_MODES.has(mod)) {
            pokemon.__qolOmShared = mod === 'sharedpower' ? calcOmSharedAbilities(calcOmSide(pokeInfo)) : [];
            calcOmTrackAbilities(pokemon, calcOmAbilityPool(pokemon, mod));
            calcOmApplySkillLink(pokemon);
            return pokemon;
        }

        if (mod === 'camomons') {
            const types = calcOmCamomonsTypes(pokemon);
            pokemon.types = types;
            pokemon.species.types = types;
            return pokemon;
        }

        if (mod === 'franticfusions') {
            const donor = calcOmEnteredSpecies(pokemon, pokeInfo);
            if (donor) {
                const stats = {};
                for (const stat of STATS) {
                    stats[stat] = stat === 'hp'
                        ? pokemon.species.baseStats[stat]
                    : clamp255(pokemon.species.baseStats[stat] + Math.floor(donor.baseStats[stat] / 4));
                }
                calcOmSetBaseStats(pokemon, stats);
            }
            return pokemon;
        }

        if (mod === 'godlygift') {
            const god = calcOmEnteredSpecies(pokemon, pokeInfo);
            const side = calcOmSide(pokeInfo);
            const donatedStat = document.querySelector(`#qol-om-slot-${side}`)?.value;
            if (god && donatedStat) {
                const stats = Object.assign({}, pokemon.species.baseStats);
                stats[donatedStat] = god.baseStats[donatedStat];
                if (pokemon.gen.num === 1 && (donatedStat === 'spa' || donatedStat === 'spd')) {
                    stats.spa = stats.spd = god.baseStats[donatedStat];
                }
                calcOmSetBaseStats(pokemon, stats);
            }
            return pokemon;
        }

        if (['badnboosted', 'flipped', '350cup', 'scalemons', 'natureswap'].includes(mod)) {
            calcOmSetBaseStats(pokemon, calcOmModifiedStats(pokemon, mod));
        }
        return pokemon;
    }

    function calcOmGenNumber() {
        const g = typeof gen !== 'undefined' ? gen : window.gen;
        return Number(g) || 9;
    }

    function calcOmGeneration() {
        try {
            return window.calc?.Generations?.get?.(calcOmGenNumber());
        } catch (e) {
            return undefined;
        }
    }

    // Every species name available in the current generation.
    function calcOmAllSpeciesNames() {
        const names = new Map(); // searchId -> display name
        const add = (name) => {
            const key = toSearchId(name);
            if (key && !names.has(key)) names.set(key, String(name));
        };

        const legacy = (typeof pokedex !== 'undefined' && pokedex) || window.pokedex ||
              window.calc?.SPECIES?.[calcOmGenNumber()] || {};
        for (const [key, entry] of Object.entries(legacy)) add(entry?.name || key);

        const genSpecies = calcOmGeneration()?.species;
        try {
            for (const entry of genSpecies || []) add(entry?.name);
        } catch (e) { /* not iterable in this build */ }

        return [...names.values()].sort((a, b) => a.localeCompare(b));
    }

    function calcOmReadFormStats(pokeInfo) {
        const read = (field) => Number(pokeInfo.find(`.${field} .base`).val()) || 0;
        const special = calcOmGenNumber() === 1 ? read('sl') : null;
        return {
            hp: read('hp'), atk: read('at'), def: read('df'),
            spa: special ?? read('sa'), spd: special ?? read('sd'), spe: read('sp'),
        };
    }

    function calcOmWriteFormStats(pokeInfo, stats) {
        const fields = {hp: 'hp', atk: 'at', def: 'df', spa: 'sa', spd: 'sd', spe: 'sp'};
        stats = clampBaseStats(stats);
        if (calcOmGenNumber() === 1) {
            fields.spa = 'sl';
            fields.spd = 'sl';
        }
        for (const stat of STATS) {
            const input = pokeInfo.find(`.${fields[stat]} .base`);
            if (input.length) input.val(stats[stat]);
        }
    }

    function calcOmFormSpeciesName(pokeInfo) {
        const forme = pokeInfo.find('.forme');
        if (forme.length && forme.is(':visible') && forme.val()) return String(forme.val());
        const input = pokeInfo.find('input.set-selector, select.set-selector').first();
        const selected = String(
            input.val() || pokeInfo.find('.select2-chosen').first().text() || ''
        );
        return selected.split(' (')[0].trim();
    }

    function calcOmFormSpecies(pokeInfo, genData) {
        return calcOmFindSpecies(calcOmFormSpeciesName(pokeInfo), genData);
    }

    // Native (unmodified) stats/types straight from the species data, never from the form.
    function calcOmNativeForm(pokeInfo, genData) {
        const species = calcOmFormSpecies(pokeInfo, genData);
        if (!calcOmSpeciesStats(species)) return null;
        const stats = {};
        for (const stat of STATS) stats[stat] = calcOmSpeciesStat(species, stat);
        return {species, stats, types: calcOmSpeciesTypes(species).slice(0, 2)};
    }

    // Picks the right "no type" option instead of hardcoding one.
    function calcOmSetType(select, type) {
        if (!select.length) return;
        const options = select.find('option').toArray();
        let match = type ? options.find((o) => o.value === type) : null;
        if (!match && !type) {
            match = options.find((o) =>
                                 o.value === '(none)' || o.value === '' || /^\(none\)$/i.test(o.textContent.trim()));
        }
        if (match) select.val(match.value);
    }

    function calcOmFormSource(pokeInfo, genData) {
        const side = calcOmSide(pokeInfo);
        const name = document.querySelector(`#qol-om-source-${side}`)?.value?.trim();
        return calcOmFindSpecies(name, genData);
    }

    function calcOmSetAbility(pokeInfo, ability) {
        if (!ability) return;
        const select = pokeInfo.find('.ability');
        if (!select.length) return;
        if (!select.find('option').toArray().some((option) => option.value === ability)) {
            const option = document.createElement('option');
            option.value = ability;
            option.textContent = ability;
            option.dataset.qolOm = 'true';
            select.append(option);
        }
        select.val(ability);
    }

    function calcOmFormTypes(pokeInfo, pokemon, mod, genData) {
        if (mod === 'camomons') {
            const types = [];
            const moveSelectors = pokeInfo.find('.move-selector').toArray().slice(0, 2);
            for (let index = 0; index < moveSelectors.length; index++) {
                const moveSelector = moveSelectors[index];
                const move = genData?.moves?.get?.(toSearchId(moveSelector.value));
                const type = move?.exists ? move.type : pokeInfo.find(`.move${index + 1} .move-type`).val();
                if (type && type !== '???' && !types.includes(type)) types.push(type);
            }
            return types.length ? types : calcOmSpeciesTypes(pokemon);
        }
        return null;
    }

    function calcOmFormModifiedStats(pokeInfo, pokemon, mod, genData, baseStats) {
        const stats = Object.assign({}, baseStats);
        const original = Object.assign({}, stats);
        const sharedModifier = SPECIES_STAT_MODIFIERS[MOD_BY_CALC_OM.get(mod)];
        if (sharedModifier) {
            return clampBaseStats(sharedModifier({...pokemon, baseStats: original}, original) || stats);
        }

        if (mod === 'reevolution') {
            const prevo = pokemon?.prevo && (genData?.species?.get?.(toSearchId(pokemon.prevo)) || calcOmFindSpecies(pokemon.prevo, genData));
            if (prevo?.exists === false || !prevo?.baseStats || prevo.battleOnly) return null;
            if (prevo?.baseStats) {
                for (const stat of STATS) stats[stat] = clamp255(stats[stat] + original[stat] - calcOmSpeciesStat(prevo, stat));
            }
        } else if (mod === 'natureswap') {
            const natureName = pokeInfo.find('.nature').val();
            const nature = genData?.natures?.get?.(toSearchId(natureName));
            let plus = nature?.plus;
            let minus = nature?.minus;
            if (!plus || !minus) {
                const label = pokeInfo.find('.nature option:selected').text();
                const matches = label.match(/\(\+([^,]+),\s*-([^)]+)\)/);
                const statNames = {Atk: 'atk', Def: 'def', SpA: 'spa', SpD: 'spd', Spe: 'spe'};
                if (matches) {
                    plus = statNames[matches[1].trim()];
                    minus = statNames[matches[2].trim()];
                }
            }
            if (plus && minus && plus !== minus) {
                [stats[plus], stats[minus]] = [stats[minus], stats[plus]];
            }
        } else if (mod === 'franticfusions') {
            const donor = calcOmFormSource(pokeInfo, genData);
            if (!donor) return null;
            for (const stat of BOOSTABLE_STATS) {
                stats[stat] = clamp255(stats[stat] + Math.floor(calcOmSpeciesStat(donor, stat) / 4));
            }
        } else if (mod === 'godlygift') {
            const god = calcOmFormSource(pokeInfo, genData);
            const donatedStat = document.querySelector(`#qol-om-slot-${calcOmSide(pokeInfo)}`)?.value;
            if (!god || !STATS.includes(donatedStat)) return null;
            stats[donatedStat] = calcOmSpeciesStat(god, donatedStat);
            if (calcOmGenNumber() === 1 && ['spa', 'spd'].includes(donatedStat)) stats.spa = stats.spd = calcOmSpeciesStat(god, donatedStat);
        } else {
            return null;
        }
        return clampBaseStats(stats);
    }

    function calcOmFormKey(pokeInfo, mod) {
        const side = calcOmSide(pokeInfo);
        // Only values that actually affect an OM's *form* belong in this key.
        // Items, moves (except Camomons), abilities, EVs, IVs, and boosts must
        // never cause the calculator to reset a manually edited set.
        const parts = [calcOmGenNumber(), calcOmFormSpeciesName(pokeInfo), mod];
        if (mod === 'franticfusions' || mod === 'godlygift') {
            parts.push(document.querySelector(`#qol-om-source-${side}`)?.value || '');
        }
        if (mod === 'godlygift') {
            parts.push(document.querySelector(`#qol-om-slot-${side}`)?.value || '');
        }
        if (mod === 'natureswap') parts.push(pokeInfo.find('.nature').val() || '');
        if (mod === 'camomons') {
            parts.push(...pokeInfo.find('.move-selector').toArray().slice(0, 2).map(el => el.value));
            parts.push(...pokeInfo.find('.move-type').toArray().slice(0, 2).map(el => el.value));
        }
        return JSON.stringify(parts);
    }

    function syncCalcOmForm(pokeInfo, {force = false} = {}) {
        if (!pokeInfo?.length || pokeInfo[0].__qolOmSyncing) return;

        const mod = calcOmSelected();
        const formMod = mod && !CALC_OM_ABILITY_MODES.has(mod) ? mod : '';
        // Nothing to apply and nothing to undo.
        if (!formMod && !pokeInfo.data('qolOmApplied')) return;
        const key = calcOmFormKey(pokeInfo, formMod);
        if (!force && pokeInfo.data('qolOmFormKey') === key) return;

        const genData = calcOmGeneration();
        const native = calcOmNativeForm(pokeInfo, genData);
        if (!native) return;

        pokeInfo[0].__qolOmSyncing = true; // our own change triggers must not re-enter
        try {
            let stats = native.stats;
            let types = native.types;

            if (formMod) {
                stats = calcOmFormModifiedStats(pokeInfo, native.species, formMod, genData, native.stats) || native.stats;
                types = calcOmFormTypes(pokeInfo, native.species, formMod, genData) || native.types;
            }

            calcOmWriteFormStats(pokeInfo, stats);
            calcOmSetType(pokeInfo.find('.type1'), types[0]);
            calcOmSetType(pokeInfo.find('.type2'), types[1]);

            if (typeof window.calcHP === 'function') window.calcHP(pokeInfo);
            if (typeof window.calcStats === 'function') window.calcStats(pokeInfo);
            // Do not synthesize change events here: the calculator's own
            // handlers can reset the entire selected set when those fire.
        } finally {
            delete pokeInfo[0].__qolOmSyncing;
        }

        if (formMod) pokeInfo.data('qolOmApplied', formMod);
        else pokeInfo.removeData('qolOmApplied');
        pokeInfo.data('qolOmFormKey', key);
    }

    function installCalcOm() {
        let attempts = 0;
        const timer = setInterval(() => {
            attempts++;
            const group = document.querySelector('input.om-trigger')?.parentElement;
            const originalCreatePokemon = window.createPokemon;
            const originalAutoUpdateStats = window.autoUpdateStats;
            const ready = group && typeof originalCreatePokemon === 'function' &&
                  typeof originalAutoUpdateStats === 'function';
            if (!ready) {
                if (attempts > 120) clearInterval(timer);
                return;
            }
            clearInterval(timer);

            // ---------- OM toggle buttons ----------

            const row = document.createElement('div');
            row.className = 'qol-calc-om-controls';
            row.setAttribute('aria-label', 'Pokémon Showdown Teambuilder QOL OM modifiers');
            row.setAttribute('role', 'group');
            const buttonRows = [];
            for (let i = 0; i < CALC_OM_OPTIONS.length; i += 3) {
                const buttonRow = document.createElement('div');
                buttonRow.className = 'qol-calc-om-row';
                buttonRow.setAttribute('role', 'group');
                buttonRow.setAttribute('aria-label', 'Pokémon Showdown Teambuilder QOL OM modifiers');
                buttonRow.style.cssText = 'margin:5px auto auto;display:flex;justify-content:center;';
                buttonRows.push(buttonRow);
            }

            for (const [index, [id, labelText, description]] of CALC_OM_OPTIONS.entries()) {
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.className = 'visually-hidden qol-calc-om';
                input.id = `qol-om-${id}`;
                input.value = id;
                input.title = description;

                const label = document.createElement('label');
                const position = index % 3;
                const rowLength = Math.min(3, CALC_OM_OPTIONS.length - Math.floor(index / 3) * 3);
                const buttonPosition = rowLength === 1 ? '' : position === 0 ? 'btn-left' : position === rowLength - 1 ? 'btn-right' : 'btn-mid';
                label.className = `btn btn-xxxwide ${buttonPosition}`.trim();
                label.htmlFor = input.id;
                label.textContent = labelText;
                label.title = description;

                buttonRows[Math.floor(index / 3)].append(input, label);
            }
            buttonRows.forEach((buttonRow) => row.append(buttonRow));
            group.insertAdjacentElement('afterend', row);

            // ---------- status line + ability support install ----------

            const status = document.createElement('div');
            status.className = 'qol-calc-om-status';
            status.style.cssText = 'text-align:center;color:#c0392b;font-size:12px;margin:4px 0;display:none;';
            row.insertAdjacentElement('afterend', status);

            const updateStatus = () => {
                const msg = calcOmStatusMessage();
                status.textContent = msg;
                status.style.display = msg ? 'block' : 'none';
            };
            calcOmSupport.onChange = updateStatus;

            let supportAttempts = 0;
            const supportTimer = window.setInterval(() => {
                supportAttempts++;
                if (installCalcOmAbilitySupport()) {
                    window.clearInterval(supportTimer);
                } else if (supportAttempts >= 240) {
                    window.clearInterval(supportTimer);
                    console.error(LOG, 'Ability modes unavailable:', calcOmSupport.reason);
                }
                updateStatus();
            }, 250);

            // ---------- per-side fields (donor / god / slot) + Shared Power row ----------

            for (const side of ['p1', 'p2']) {
                const form = document.querySelector(`#${side}`);
                const forme = form?.querySelector('.forme');
                const anchor = forme?.closest('.info-group') || forme?.closest('div');
                if (!anchor) continue;

                const fields = document.createElement('div');
                fields.className = 'qol-calc-om-fields';
                fields.dataset.side = side;
                fields.style.cssText = 'display:none;flex-direction:column;align-items:flex-start;width:100%;box-sizing:border-box;flex:0 0 100%;clear:both;margin:4px 0 0;padding:0;';

                const sourceLabel = document.createElement('div');
                sourceLabel.className = 'qol-om-source-label';
                sourceLabel.style.cssText = 'display:inline-flex;align-items:center;gap:5px;';
                const sourceText = document.createElement('span');
                const source = document.createElement('select');
                source.id = `qol-om-source-${side}`;
                // No "item" class: that would collide with the real item field.
                source.className = 'qol-calc-om-source';
                const emptyOption = document.createElement('option');
                emptyOption.value = '';
                emptyOption.textContent = '(none)';
                source.append(emptyOption);
                sourceLabel.append(sourceText, source);

                const slotLabel = document.createElement('label');
                slotLabel.className = 'qol-om-slot-label';
                slotLabel.style.cssText = 'display:none;align-items:center;gap:5px;margin:4px 0 0;';
                const slotText = document.createElement('span');
                slotText.textContent = 'Slot';
                const slot = document.createElement('select');
                slot.id = `qol-om-slot-${side}`;
                for (const stat of STATS) {
                    const option = document.createElement('option');
                    option.value = stat;
                    option.textContent = stat.toUpperCase();
                    slot.append(option);
                }
                slotLabel.append(slotText, slot);

                fields.append(sourceLabel, slotLabel);
                anchor.insertAdjacentElement('afterend', fields);

                calcOmBuildSharedRow(side, form, fields);
            }

            // ---------- searchable Pokémon pickers ----------

            let sourcePickerFillPending = false;
            const populateOmSourcePickers = () => {
                if (sourcePickerFillPending) return;
                sourcePickerFillPending = true;
                const species = calcOmAllSpeciesNames();
                const listKey = `${calcOmGenNumber()}|${species.length}`;
                let sources = [...document.querySelectorAll('select.qol-calc-om-source')]
                .filter((source) => source.dataset.qolListKey !== listKey);
                let sourceIndex = 0;
                const fillNext = (deadline) => {
                    let budget = 0;
                    while (sourceIndex < sources.length && budget < 80 &&
                           (!deadline || deadline.timeRemaining() > 2 || budget === 0)) {
                        const source = sources[sourceIndex];
                        if (!source.isConnected) { sourceIndex++; continue; }
                        const $source = window.$(source);
                        const selected = source.value;
                        const start = Number(source.dataset.qolNextIndex || 0);
                        if (start === 0) {
                            source.replaceChildren(new Option('(none)', ''));
                        }
                        const end = Math.min(species.length, start + 80);
                        for (let i = start; i < end; i++) source.add(new Option(species[i], species[i]));
                        source.dataset.qolNextIndex = String(end);
                        source.dataset.qolListKey = end >= species.length ? listKey : 'loading';
                        if (end >= species.length) {
                            if ([...source.options].some((option) => option.value === selected)) source.value = selected;
                            if ($source.select2 && !$source.data('select2')) {
                                $source.select2({dropdownAutoWidth: true, width: '170px'});
                            }
                            if ($source.data('select2')) $source.select2('val', source.value);
                            delete source.dataset.qolNextIndex;
                            sourceIndex++;
                        }
                        budget++;
                    }
                    if (sourceIndex < sources.length) {
                        (window.requestIdleCallback || ((callback) => window.setTimeout(() => callback(null), 0)))(fillNext);
                    } else {
                        sourcePickerFillPending = false;
                    }
                };
                if (!species.length) {
                    sourcePickerFillPending = false;
                    return 0;
                }
                (window.requestIdleCallback || ((callback) => window.setTimeout(() => callback(null), 0)))(fillNext);
                return species.length;
            };

            // ---------- show/hide the per-mode fields ----------

            const updateInlineControls = () => {
                const mod = calcOmSelected();
                const sourceModes = {
                    franticfusions: ['Donor', 'Fusion donor'],
                    godlygift: ['God', 'God Pokémon'],
                };
                const config = sourceModes[mod];
                const sharedMode = mod === 'sharedpower';

                for (const fields of document.querySelectorAll('.qol-calc-om-fields')) {
                    const side = fields.dataset.side || 'p1';
                    const sourceLabel = fields.querySelector('.qol-om-source-label');
                    const sourceText = sourceLabel.querySelector('span');
                    const source = sourceLabel.querySelector('select.qol-calc-om-source');
                    const slotLabel = fields.querySelector('.qol-om-slot-label');

                    fields.style.display = config ? 'flex' : 'none';
                    sourceText.textContent = config ? config[0] : '';
                    if (source.options?.[0]) source.options[0].textContent = '(none)';
                    source.title = config ? config[1] : '';
                    source.setAttribute('aria-label', `${side.toUpperCase()} ${config?.[0] || 'OM source'}`);
                    slotLabel.style.display = mod === 'godlygift' ? 'inline-flex' : 'none';
                }

                for (const sharedGroup of document.querySelectorAll('.qol-om-shared-group')) {
                    sharedGroup.style.display = sharedMode ? '' : 'none';
                }
                // These large searchable lists are hidden in normal use. Build them
                // only when the user opens an OM that needs a donor or God picker.
                if (config) populateOmSourcePickers();
                if (sharedMode) calcOmFillAbilityDatalist();
                updateStatus();
            };

            // ---------- wrap the calculator's own functions ----------

            window.createPokemon = function (pokeInfo, ...args) {
                const pokemon = originalCreatePokemon.call(this, pokeInfo, ...args);
                if (typeof pokeInfo === 'string') return pokemon;
                const applied = window.$(pokeInfo).data('qolOmApplied');
                return applied === calcOmSelected() ? pokemon : applyCalcOm(pokemon, pokeInfo);
            };

            window.autoUpdateStats = function (side, ...args) {
                const pokeInfo = window.$(side);
                const ability = pokeInfo.find('select.ability');
                const previousAbility = ability.val();
                const previousOption = ability.find('option:selected').first();
                const previousLabel = previousOption.text();
                const previousSpecies = String(pokeInfo.find('.set-selector').val() || '');
                const previousForme = String(pokeInfo.find('.forme').val() || '');
                const lastLoaded = pokeInfo.data('qolOmLastLoadedSpecies');
                // Keep native set loading when the actual Pokémon changes, but
                // preserve manually chosen abilities on routine calculator updates.
                pokeInfo.find('.ability option[data-qol-om="true"]').remove();
                const result = originalAutoUpdateStats.call(this, side, ...args);
                const currentSpecies = String(pokeInfo.find('.set-selector').val() || '');
                const currentForme = String(pokeInfo.find('.forme').val() || '');
                const sameSpecies = previousSpecies === currentSpecies &&
                    previousForme === currentForme &&
                    lastLoaded === currentSpecies + '|' + currentForme;
                const updatedAbility = pokeInfo.find('select.ability');
                if (sameSpecies && previousAbility && updatedAbility.length &&
                    updatedAbility.val() !== previousAbility) {
                    // Custom OM abilities may not be in the native dropdown.
                    // Restore the option without firing the calculator's native
                    // change handler, which would load the set again.
                    if (!updatedAbility.find('option').toArray().some((opt) => opt.value === previousAbility)) {
                        updatedAbility.append(new Option(previousLabel || previousAbility, previousAbility));
                    }
                    updatedAbility.val(previousAbility);
                    updatedAbility.trigger('change.select2');
                }
                pokeInfo.data('qolOmLastLoadedSpecies', currentSpecies + '|' + currentForme);
                if (pokeInfo.length) syncCalcOmForm(pokeInfo, {force: true});
                return result;
            };

            const refreshForms = (autoSide) => {
                const callsBefore = calcOmSupport.calls;
                // autoUpdateStats is a *set-loader*, not a safe way to recalculate.
                // It resets user-selected moves, items, abilities and custom stats.
                // Only the calculator's native species-change handler should call it.
                for (const side of ['#p1', '#p2']) {
                    const form = window.$(side);
                    if (form.length) syncCalcOmForm(form);
                }
                // Weather/terrain from pooled abilities is a switch-in effect: only the side
                // that just changed may set it, never every refresh (that clobbered manual picks).
                if (calcOmAbilityMode() && typeof autoSide === 'string') calcOmAutoSetField(autoSide);
                if (typeof window.performCalculationsOM === 'function') window.setTimeout(window.performCalculationsOM, 0);

                window.setTimeout(() => {
                    calcOmSupport.neverCalled =
                        calcOmAbilityMode() && calcOmSupport.ok && calcOmSupport.calls === callsBefore;
                    updateStatus();
                }, 500);
            };
            calcOmLoadPsDex(() => refreshForms());


            // ---------- jQuery handlers (Select2 only fires jQuery events) ----------

            for (const side of ['p1', 'p2']) {
                const form = window.$(`#${side}`);
                // Record the currently loaded Pokémon/form before native
                // updates; never restore another set's ability by mistake.
                form.data('qolOmLastLoadedSpecies',
                    String(form.find('.set-selector').val() || '') + '|' +
                    String(form.find('.forme').val() || ''));

                // The native handler (registered earlier) has just overwritten the
                // form with the new Pokémon's data, so our "applied" flag is no
                // longer true. A new Pokémon switching in also sets weather/terrain.
                form.find('input.set-selector, select.set-selector, .forme')
                    .off('change.qolCalcOm')
                    .on('change.qolCalcOm', () => {
                    form.removeData('qolOmApplied');
                    window.setTimeout(() => {
                        syncCalcOmForm(form);
                        calcOmAutoSetField(side);
                        if (typeof window.performCalculationsOM === 'function') window.performCalculationsOM();
                    }, 0);
                });

                // Changing the selected ability is also a switch-in state change
                // for entry abilities, even when species and set stay the same.
                form.find('.ability').off('change.qolCalcOmWeather').on('change.qolCalcOmWeather', () => {
                    if (!calcOmAbilityMode()) return;
                    window.setTimeout(() => {
                        calcOmAutoSetField(side);
                        if (typeof window.performCalculationsOM === 'function') window.performCalculationsOM();
                    }, 0);
                });

                form.find('.move-selector, .move-type')
                    .off('change.qolCalcOm')
                    .on('change.qolCalcOm', () => {
                    if (calcOmSelected() !== 'camomons') return;
                    window.setTimeout(() => {
                        syncCalcOmForm(form);
                        if (typeof window.performCalculationsOM === 'function') window.performCalculationsOM();
                    }, 0);
                });
            }

            window.$('select.qol-calc-om-source').off('change.qolCalcOm').on('change.qolCalcOm', refreshForms);
            document.addEventListener('qol-shared-change', (event) => refreshForms(event.detail?.side));

            // ---------- native DOM listeners ----------

            row.addEventListener('change', (event) => {
                const input = event.target.closest('.qol-calc-om');
                if (!input) return;
                if (input.checked) {
                    for (const other of row.querySelectorAll('.qol-calc-om')) {
                        if (other !== input) other.checked = false;
                    }
                    for (const builtIn of group.querySelectorAll('.om-trigger:checked')) {
                        builtIn.checked = false;
                        window.$(builtIn).trigger('change');
                    }
                }
                updateInlineControls();
                refreshForms();
                if (input.checked && CALC_OM_ABILITY_MODES.has(input.value)) {
                    ['p1', 'p2'].forEach(calcOmAutoSetField);
                }
            });

            document.addEventListener('change', (event) => {
                if (event.target.matches('.om-trigger') && event.target.checked) {
                    for (const input of row.querySelectorAll('.qol-calc-om')) input.checked = false;
                    updateInlineControls();
                    refreshForms();
                    return;
                }
                if (event.target.matches('#p1 .move-selector, #p2 .move-selector, #p1 .move-type, #p2 .move-type')) {
                    // Only Camomons changes base typing when a move changes.
                    if (calcOmSelected() === 'camomons') window.setTimeout(refreshForms, 0);
                } else if (event.target.matches('#p1 .nature, #p2 .nature')) {
                    // Only Nature Swap changes base stats when nature changes.
                    if (calcOmSelected() === 'natureswap') refreshForms();
                } else if (event.target.matches('#p1 .qol-calc-om-fields select, #p2 .qol-calc-om-fields select')) {
                    refreshForms();
                }
            }, true);

            updateInlineControls();
            refreshForms();
            console.info(LOG, 'Damage Calculator OM controls ready');
        }, 250);
    }

    // ---------- patch everything ----------

    function patchEverything() {
        const results = [
            // server messages + banlists
            patchServerReceive(),
            patchTsaSearchLegality(),
            patchUsageRoomTraffic(),

            // search: results (legality, banlists, natdex, filters)
            patchPokemonSearchResults(),
            patchPokemonFilter(),
            patchMoveSearchFilters(),
            patchSearchCacheInvalidation(),
            patchItemRowStoneStats(),
            patchItemSearchStoneHeader(),
            patchItemSearchSort(),
            patchItemSearchSortRow(),
            patchItemSearchFortemons(),
            patchItemSearchBans(),

            // search: ability + move pools per format
            patchAbilitySearchResults(),
            patchMoveSearchResults(),

            // search: query handling, rows, chips, sorting
            patchSearchEngine(),
            patchSearchRowText(),
            patchCeFullWindowPainter(),
            patchCeFullListVirtualScroll(),
            patchFilterChipText(),
            patchSearchSort(),
            patchSearchRenderer(),

            // teambuilder: stats, icons, chooser
            patchMonocolorAddPokemon(),
            patchNativeFormatRefresh(),
            patchGetStat(),
            patchBattleStatOptimizerConstructor(),
            patchStatForm(),
            patchCustomTeamGenerationRendering(),
            patchRenderSetTypeIcons(),
            patchChartSet(),
            patchMoveSearchSort(),
            patchMoveSortRowUi(),

            // battle
            patchBattleStatGuesserConstructor(),
            patchBattleStatGuesserGetStat(),
            patchBattleStatGuesserGuess(),
            patchTooltipSpeedRange(),
        ];

        // Kick off any needed banlist fetches for the current format.
        isGodlyGiftFormat(window.room);
        isTierShiftAAAFormat(window.room);
        isConvergenceFormat(window.room);

        return results.every(Boolean);
    }

    // Room/search objects get rebuilt (e.g. after a battle), so keep re-applying.
    // Fast while loading, slow watchdog afterwards.
    let patched = false;

    function patchLoop() {
        let ok = false;
        try {
            patchCustomFormatStorage();
            ok = patchEverything();
        } catch (e) {
            console.error(LOG, 'patchEverything threw:', e);
        }

        if (ok && !patched) {
            patched = true;
            console.log(LOG, 'All patches applied');
        }

        setTimeout(patchLoop, ok ? 1000 : 100);
    }

    // ---------- debug / console API ----------

    const modStatsFor = (mod) => (set, room) =>
    computeModBaseStats(mod, {dex: (room || window.room)?.curTeam?.dex, set, room: room || window.room});

    // Console: qolFormat.import('/challenge gen9ou @@@ flippedmod'), qolFormat.active(), qolFormat.remove()
    window.qolFormat = {
        import: (text, room = getActiveTeambuilderRoom()) => importFormatText(room, text),
        bans: (room = getActiveTeambuilderRoom()) => getMergedBans(room),
        // Useful when the move search and Showdown's /formathelp disagree.
        // Explicit bans and restricted moves are separate categories.
        checkMove: (moveName, room = getActiveTeambuilderRoom()) => {
            const format = room?.curTeam?.format || '';
            const dex = room?.curTeam?.dex || Dex;
            const move = dex.moves.get(moveName);
            if (!move?.exists) return {format, error: `Unknown move: ${moveName}`};
            const bans = getMergedBansForFormat(format);
            const entry = genericBanlists.get(genericBanFormatId(format));
            return {format, move: move.name, generation: dex.gen,
                serverBanlistVerified: !!entry?.verified,
                generationAllowed: moveAllowedByGeneration(dex, move, format),
                banned: !!bans?.moves?.has(move.id),
                restricted: !!bans?.restrictedMoves?.has(move.id),
                activeRules: bans ? [...resolveClauseRules(bans, format)] : [],
            };
        },
        // Shows basic custom clause implications, but simulator validation is authoritative.
        clauseBans: (room = getActiveTeambuilderRoom()) => {
            const bans = getMergedBans(room);
            if (!bans) return null;
            return {moves: [...bans.moves], abilities: [...bans.abilities], items: [...bans.items],
                types: [...bans.types], teraTypes: [...bans.teraTypes]};
        },
        // qolFormat.explain('Dragapult'): which rule bans / restricts it, and whether the base list loaded.
        explain: (name, room = getActiveTeambuilderRoom()) => {
            const format = room?.curTeam?.format;
            const id = genericBanFormatId(format);
            const entry = id ? genericBanlists.get(id) : null;
            const sp = Dex.species.get(name);
            if (!sp?.exists) return {error: `Unknown species "${name}"`};

            const search = room?.search?.engine?.typedSearch;
            const natdex = fmtHas(format, 'natdex', 'nationaldex');
            const tier = natdex ? (search && natdexTierMap(search)?.get(sp.id)) || '(unknown)' :
            formatSpeciesTier(search, sp);
            const bans = getMergedBans(room);
            const baseId = toID(sp.baseSpecies || sp.name);
            return {
                format, baseListId: id, baseListLoaded: !!entry?.loaded, tier,
                tierBanned: !!bans && bans.tiers.has(tier),
                speciesBanned: !!bans && (bans.species.has(sp.id) || bans.baseSpecies.has(baseId)),
                unbanned: !!bans && (bans.unbanned.has(sp.id) || bans.unbannedBase.has(baseId)),
                restricted: !!bans && (bans.restricted.has(sp.id) || bans.restrictedBase.has(baseId)),
                banned: !!bans && isBannedByList(bans, sp, false, natdex ? (tier === '(unknown)' ? '' : tier) : undefined),
                bannedTiers: bans ? [...bans.tiers] : [],
            };
        },
        parse: parseFormatImport,
        rule: parseChallengeRule,
        rules: (format = getActiveTeambuilderRoom()?.curTeam?.format) => formatRuleTokens(format),
        diagnoseMegamons: (format = getActiveTeambuilderRoom()?.curTeam?.format) => {
            const bans = getMergedBansForFormat(format);
            const unbans = new Set(explicitlyUnbannedForms(format));
            if (bans) for (const id of bans.unbanned) unbans.add(id);
            const megaIds = [...unbans].filter((id) => /mega/.test(id));
            const unknown = megaIds.filter((id) => !Dex.species.get(id)?.exists);
            const entry = genericBanlists.get(genericBanFormatId(format));
            const legal = megamonsLegalMegaIds(format, getActiveTeambuilderRoom()?.curTeam?.dex || Dex);
            return {format, active: isConvergenceMegamons(format), generation: formatGeneration(format),
                serverBanlistVerified: !!entry?.verified,
                megaUnbans: megaIds.length, recognizedMegas: megaIds.length - unknown.length,
                visibleLegalMegas: legal.size, missingFromClientDex: unknown, mods: modsFromFormatString(format)};
        },
        effectiveRules: (format = getActiveTeambuilderRoom()?.curTeam?.format) => {
            const state = explicitRuleState(format);
            const bans = getMergedBansForFormat(format);
            const entry = genericBanlists.get(genericBanFormatId(format));
            return {active: [...state.active.values()], removed: [...state.removed],
                resolved: bans ? [...resolveClauseRules(bans, format)] : [],
                serverBanlistVerified: !!entry?.verified, generation: formatGeneration(format)};
        },
        catalog: () => [...RULE_CATALOG.values()].map((rule) => ({...rule})),
        // These are client-side preview providers, not a complete simulator.
        clientSupported: () => MOD_DEFINITIONS.map(({id, label, challengeRule}) => ({id, label, challengeRule})),
        fullListStatus: (room = getActiveTeambuilderRoom()) => {
            const search = room?.search?.engine?.typedSearch;
            if (!search?.dex) return {active: false, error: 'Teambuilder search unavailable'};
            const active = !!room.search.engine?.filters?.some(([kind]) => kind === 'fulllist');
            return {active, combinations: ceFullData(search).pairs.length,
                format: room.curTeam?.format, cachedMovePools: ceFullData(search).nativeMoves.size};
        },
        active: (room = getActiveTeambuilderRoom()) => getActiveMods(room),
        typemons: (room = getActiveTeambuilderRoom()) => typemonsType(room),
        remove: (room = getActiveTeambuilderRoom()) => removeCustomRules(room),
        stats: (set, room = getActiveTeambuilderRoom()) =>
        computeModsBaseStats(getActiveMods(room), {dex: room?.curTeam?.dex, set, room}),
        types: (set, room = getActiveTeambuilderRoom()) => modifiedTypes(getActiveMods(room), room?.curTeam?.dex, set),
    };

    window.TierShiftTeambuilder = {
        getTierShiftBoost,
        getShiftedStat: (species, stat) => (tierShiftModifiedStats(species) || species?.baseStats)?.[stat],
        getShiftedBST: (species) => {
            const stats = tierShiftModifiedStats(species) || species?.baseStats;
            return stats ? sumStats(stats) : 0;
        },
        getMixAndMegaBaseStats: modStatsFor(MOD.MIX_AND_MEGA),
        getMixAndMegaTypes: (set) => mixAndMegaModifiedTypes(window.room?.curTeam?.dex, set),
        getMixAndMegaFutureAbility: (set) => mixAndMegaFutureAbility(window.room?.curTeam?.dex, set),
        getCrossEvolutionBaseStats: modStatsFor(MOD.CROSS_EVOLUTION),
        getCrossEvolutionTypes: (set) => crossEvolutionTypes(window.room?.curTeam?.dex, set),
        getFranticFusionsBaseStats: modStatsFor(MOD.FRANTIC_FUSIONS),
        getBadNBoostedBaseStats: modStatsFor(MOD.BAD_N_BOOSTED),
        getScalemonsBaseStats: modStatsFor(MOD.SCALEMONS),
        getGodlyGiftBaseStats: godlyGiftDonation,
        getGodlyGiftIllegalChecker,
        parseGodlyGiftRestricted,
        isTierShiftFormat: (room) => getActiveMods(room).includes(MOD.TIER_SHIFT),
        isMixAndMegaFormat: (room) => getActiveMods(room).includes(MOD.MIX_AND_MEGA),
        isBadNBoostedFormat: (room) => getActiveMods(room).includes(MOD.BAD_N_BOOSTED),
        isScalemonsFormat: (room) => getActiveMods(room).includes(MOD.SCALEMONS),
        isGodlyGiftFormat,
        isTierShiftAAAFormat,
        requestTSABanlist: () => requestBanlist('tsa'),
        requestGGBanlist: () => requestBanlist('gg'),
        requestConvergenceBanlist: () => requestBanlist('conv'),
        patchBattleStatGuesser: patchBattleStatGuesserGetStat,
        pokemonMatchesEffectiveness,
        isFullyEvolved,
        getCustomToggleMoveIds: (kind, dex) => getCustomToggleMoveIds(dex || window.room?.curTeam?.dex, kind),
        genericBanlists,
        patch: patchEverything,
    };

    // ---------- boot ----------

    if (IS_DAMAGE_CALC) {
        installCalcOm();
        return;
    }

    patchLoop();
    usageCleanUrl();
    window.addEventListener('beforeunload', usageCleanUrl);
    window.addEventListener('pagehide', usageCleanUrl);
    installNatureSwapCamomonsListener();
    installFusionNicknameListener();
    installStoneSortListener();
    installMnmSpeedNoteListener();
    installDomDecorators();
    installCoverageSeparatorFix();
    installClearFiltersListener();
    installValidateListener();
    resumeSelfChallenge();
    installCustomFormatDropdownListener();

})();
