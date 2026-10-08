// ==UserScript==
// @name         Pokémon Showdown Teambuilder QOL
// @author       jl
// @namespace    https://github.com/Jake18236/showdown-teambuilder-mod
// @version      8.0.0
// @description  Makes the Showdown Teambuilder better for some OMs
// @match        https://play.pokemonshowdown.com/*
// @grant        none
// @run-at       document-start
// @updateURL    https://github.com/Jake18236/Showdown-Teambuilder-Mod/releases/latest/download/showdown-teambuilder.user.js
// @downloadURL  https://github.com/Jake18236/Showdown-Teambuilder-Mod/releases/latest/download/showdown-teambuilder.user.js
// ==/UserScript==

// comments by claude bc documentation is too much work :C
//
// FILE LAYOUT
//   1. Constants & utilities          10. Alphabet Cup / National Dex movepool
//   2. Room helpers                   11. Godly Gift
//   3. Patch helpers                  12. Ability & move search providers
//   4. Search-result helpers          13. Pokémon search filters
//   5. Server banlists                14. Move search filters
//   6. Per-mod stat modifiers         15. Search engine dispatch
//   7. Types / Nature Swap / Camomons 16. Search UI (sort, rows, chips)
//   8. Mix and Mega                   17. Teambuilder patches
//   9. Fusions (CE / FF / Inherit.)   18. Battle patches, DOM decorators, boot
(function () {
    'use strict';

    const LOG = '[Teambuilder QOL]';

    // ====================================================================
    // 1. CONSTANTS & UTILITIES
    // ====================================================================

    const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
    const BOOSTABLE_STATS = STATS.slice(1); // everything but hp
    const sumStats = (s) => STATS.reduce((n, st) => n + s[st], 0);
    const clamp255 = (n) => Math.max(1, Math.min(255, n));
    const copy = (obj) => Object.assign({}, obj);
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
        FLIPPED: 'flipped',
        THREE_FIFTY_CUP: 'threeFiftyCup',
        NATURE_SWAP: 'natureSwap',
        CAMOMONS: 'camomons',
    };

    // Format matching is keyword based, so prefixes/suffixes such as
    // "nationaldex" (gen9nationaldexmixandmega) don't break detection.
    const fmtId = (f) => String(f || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const fmtHas = (f, ...keys) => {
        const id = fmtId(f);
        return keys.some((k) => id.includes(k));
    };
    const stripGen = (id) => String(id || '').replace(/^gen\d+/, '');

    // Order matters: first match wins.
    const FORMAT_MOD_KEYWORDS = [
        ['tiershift', MOD.TIER_SHIFT],      // also covers tiershiftaaa
        ['mixandmega', MOD.MIX_AND_MEGA],   // covers gen9nationaldexmixandmega
        ['badnboosted', MOD.BAD_N_BOOSTED],
        ['crossevolution', MOD.CROSS_EVOLUTION],
        ['aaaubers', MOD.SCALEMONS],        // Scalemons runs on gen9aaaubers
        ['scalemons', MOD.SCALEMONS],
        ['franticfusions', MOD.FRANTIC_FUSIONS],
        ['inheritance', MOD.INHERITANCE],
        ['flipped', MOD.FLIPPED],
        ['350cup', MOD.THREE_FIFTY_CUP],
        ['natureswap', MOD.NATURE_SWAP],
        ['camomons', MOD.CAMOMONS],
    ];

    function modFromFormat(format) {
        const id = fmtId(format);
        for (const [keyword, mod] of FORMAT_MOD_KEYWORDS) {
            if (id.includes(keyword)) return mod;
        }
        return null;
    }

    const isFusionMod = (mod) =>
    mod === MOD.CROSS_EVOLUTION || mod === MOD.FRANTIC_FUSIONS || mod === MOD.INHERITANCE;
    const isCrossFormat = (format) => fmtHas(format, 'crossevolution', 'franticfusions', 'inheritance');

    // ====================================================================
    // 2. ROOM HELPERS
    // ====================================================================

    const getTeambuilderRoom = () => window.app?.rooms?.teambuilder || null;
    const getActiveTeambuilderRoom = () =>
    getTeambuilderRoom() || (window.room?.curTeam ? window.room : null);
    const getEngine = () => getTeambuilderRoom()?.search?.engine;

    // The mod for the format being edited (Godly Gift is detected separately
    // because it has no stat function keyed off the format string alone).
    function getActiveMod(room = getActiveTeambuilderRoom()) {
        if (isGodlyGiftFormat(room)) return MOD.GODLY_GIFT;
        isTierShiftAAAFormat(room); // side effect: starts the banlist fetch
        return modFromFormat(room?.curTeam?.format);
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

    function withSpeciesBaseStats(dex, speciesId, baseStats, fn) {
        const species = dex?.species?.get?.(speciesId);
        if (!species?.exists || !baseStats) return fn();
        return withSpeciesOverrides(dex, species, {baseStats: copy(baseStats)}, fn);
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
        search.baseResults = null;
        search.baseIllegalResults = null;
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

    function requestBanlist(key) {
        const b = BL[key];
        if (b.loaded || b.sent) return;
        if (!window.app || typeof app.send !== 'function') return;

        b.sent = true;
        b.silent = true;
        app.send(b.command);
    }

    // Checking "is this format active" also kicks off the fetch the first time.
    function formatActive(room, keyword, key) {
        const active = fmtHas(room?.curTeam?.format, keyword);
        if (active) requestBanlist(key);
        return active;
    }

    const isGodlyGiftFormat = (room) => formatActive(room, 'godlygift', 'gg');
    const isTierShiftAAAFormat = (room) => formatActive(room, 'tiershiftaaa', 'tsa');
    const isConvergenceFormat = (room) => formatActive(room, 'convergence', 'conv');

    // ---------- parsing ----------

    // Splits the `/raw` blob into {Bans: [...], Unbans: [...], ...}.
    // `header` is optional: pass null to skip the "is this the right format" check.
    function parseFormatSectionTokens(html, header) {
        if (!html || (header && !html.includes(header))) return null;

        const doc = new DOMParser().parseFromString(html, 'text/html');
        doc.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
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

    // Shared by Convergence and the generic per-format banlists.
    function parseBanSections(sections) {
        const bans = {
            species: new Set(), baseSpecies: new Set(), tiers: new Set(),
            unbanned: new Set(), unbannedBase: new Set(), abilities: new Set(),
        };
        let sawNonSpeciesBan = false;

        for (const token of sections.Bans || []) {
            const id = toID(token);
            if (BAN_TIER_IDS.has(id)) {
                bans.tiers.add(id);
                continue;
            }

            const sp = Dex.species.get(token);
            if (!sp?.exists) {
                // Item / move / clause / ability. Only abilities matter here.
                const ab = Dex.abilities.get(token);
                if (ab?.exists) bans.abilities.add(ab.id);
                sawNonSpeciesBan = true;
                continue;
            }
            // A base-species ban covers every forme; a forme ban only that forme.
            (isBaseForme(sp) ? bans.baseSpecies : bans.species).add(sp.id);
        }

        // Evasion Abilities Clause isn't in the /tier output, so (as before) it
        // is assumed whenever a format bans anything that isn't a Pokémon.
        if (sawNonSpeciesBan) {
            bans.abilities.add('sandveil');
            bans.abilities.add('snowcloak');
        }

        for (const token of sections.Unbans || []) {
            const sp = Dex.species.get(token);
            if (!sp?.exists) continue;
            bans.unbanned.add(sp.id);
            if (isBaseForme(sp)) bans.unbannedBase.add(sp.id);
        }

        return bans;
    }

    function isBannedByList(bans, sp) {
        if (!bans || !sp?.exists) return false;

        const baseId = toID(sp.baseSpecies || sp.name);
        if (bans.unbanned.has(sp.id) || bans.unbannedBase.has(baseId)) return false;

        return bans.species.has(sp.id) ||
            bans.baseSpecies.has(baseId) ||
            (!!sp.tier && bans.tiers.has(toID(sp.tier)));
    }

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
        const sections = parseFormatSectionTokens(html, '[Gen 9] Convergence');
        if (!sections) return false;

        convergenceBans = parseBanSections(sections);
        BL.conv.loaded = true;
        convergenceIndexCache.clear();
        convergenceMoveCache.clear();
        console.log(LOG, 'Loaded Convergence bans');

        // Rebuild the open search once the banlist arrives.
        const room = getTeambuilderRoom();
        if (fmtHas(room?.search?.engine?.typedSearch?.format, CONVERGENCE_FORMAT_ID)) {
            refreshSearch(room, {clearBase: true});
        }
        return true;
    }

    // ---------- generic (every other format) ----------
    //
    // Silently ask the server for `/tier <format>`, parse its Bans/Unbans
    // lines, and drop banned Pokémon from the Pokémon search. Formats with
    // their own handling are excluded, and so is gen9aaaubers (its /tier
    // reply is AAA Ubers, not Scalemons).

    const GENERIC_BAN_EXCLUDED = ['tiershiftaaa', 'godlygift', 'convergence', 'aaaubers'];
    const genericBanlists = new Map(); // formatId (no "genN") -> {loaded, silent, sentAt, bans}

    // The search's `format` may or may not carry the "gen9" prefix depending
    // on the client version, so everything is keyed without it.
    function genericBanFormatId(format) {
        const id = stripGen(fmtId(String(format || '').split('@@@')[0]));
        if (!id || GENERIC_BAN_EXCLUDED.some((k) => id.includes(k))) return null;
        return id;
    }

    // Sends the silent /tier request once per format; returns the entry.
    function requestGenericBanlist(id) {
        let entry = genericBanlists.get(id);
        if (entry) return entry;
        if (!window.app || typeof app.send !== 'function') return {loaded: false};

        entry = {loaded: false, silent: true, sentAt: Date.now(), bans: null};
        genericBanlists.set(id, entry);
        console.log(LOG, 'Requesting banlist: /tier ' + id);
        app.send('/tier ' + id);
        return entry;
    }

    // Returns null if the reply isn't ours, otherwise {suppress} (true only
    // for the reply to our own silent request).
    function handleGenericBanlistRaw(html) {
        if (!html || !genericBanlists.size || !html.includes('<h2>')) return null;

        const title = new DOMParser().parseFromString(html, 'text/html').querySelector('h2')?.textContent || '';
        const titleId = stripGen(fmtId(title));

        let formatId = genericBanlists.has(titleId) ? titleId : null;

        // Title didn't match the id we asked for: if exactly one request is
        // still waiting (sent within the last 15s), assume this is its reply.
        if (!formatId) {
            const waiting = [...genericBanlists.entries()].filter(
                ([, e]) => !e.loaded && e.silent && Date.now() - e.sentAt < 15000
            );
            if (waiting.length === 1 && /Bans\s*<\/b>\s*-/.test(html)) {
                formatId = waiting[0][0];
                console.log(LOG, `Banlist title "${title}" did not match "${formatId}"; assuming it is the reply.`);
            }
        }
        if (!formatId) return null;

        const entry = genericBanlists.get(formatId);
        const sections = parseFormatSectionTokens(html, null);
        if (!sections) return null;

        entry.bans = parseBanSections(sections);
        entry.loaded = true;
        console.log(LOG, `Loaded bans for ${title}`);

        const suppress = entry.silent;
        entry.silent = false; // later manual /tier replies show normally

        const room = getTeambuilderRoom();
        if (room?.search?.engine?.typedSearch?.searchType === 'pokemon') refreshSearch(room);
        return {suppress};
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

    // ---------- server message receiver ----------

    const RAW_HANDLERS = [
        ['[Gen 9] Tier Shift AAA', 'tsa', parseTSABanlist],
        ['[Gen 9] Godly Gift', 'gg', parseGodlyGiftRestricted],
        ['[Gen 9] Convergence', 'conv', parseConvergenceBanlist],
    ];

    // Returns true if this /raw line is the reply to one of our silent requests.
    function consumeRawLine(rawHtml) {
        let suppress = false;

        for (const [header, key, parse] of RAW_HANDLERS) {
            if (!rawHtml.includes(header)) continue;
            parse(rawHtml);
            if (BL[key].silent) {
                BL[key].silent = false;
                suppress = true;
            }
        }

        // Isolated so a bug here can never stop messages reaching the client.
        try {
            if (handleGenericBanlistRaw(rawHtml)?.suppress) suppress = true;
        } catch (e) {
            console.error(LOG, 'Generic banlist parse failed:', e);
        }

        return suppress;
    }

    function patchServerReceive() {
        return patchMethod(window.app, 'receive', '__qolPatched', (original) =>
                           function (data) {
            let payload = data;

            try {
                if (typeof data === 'string' && data.includes('/raw ')) {
                    let modified = false;

                    const kept = data.split('\n').filter((line) => {
                        const match = line.includes('/raw ') && line.match(/\/raw (.*)/s);
                        if (!match) return true;

                        const suppress = consumeRawLine(match[1]);
                        if (suppress) modified = true;
                        return !suppress;
                    });

                    if (modified) payload = kept.join('\n');
                }
            } catch (e) {
                console.error(LOG, 'Failed to parse server data:', e);
                payload = data;
            }

            if (payload === '') return;
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
            this.format = 'gen9';
            const gen9Results = original.call(this);
            this.format = savedFormat;

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
    function tierShiftModifiedStats(species) {
        if (!species?.baseStats) return null;

        const boost = getTierShiftBoost(species.tier);
        if (!boost) return null;

        const stats = copy(species.baseStats);
        for (const stat of BOOSTABLE_STATS) stats[stat] += boost;
        return stats;
    }

    // Every base stat of 70 or lower is doubled.
    function badNBoostedModifiedStats(species) {
        const stats = copy(species.baseStats);
        for (const stat of STATS) {
            if (stats[stat] <= 70) stats[stat] *= 2;
        }
        return stats;
    }

    // HP is unchanged; every other stat is scaled so BST ~= 600.
    function scalemonsModifiedStats(species) {
        const stats = copy(species.baseStats);
        const pst = BOOSTABLE_STATS.reduce((sum, stat) => sum + stats[stat], 0);
        if (!pst) return stats;

        const scale = 600 - stats.hp;
        for (const stat of BOOSTABLE_STATS) {
            stats[stat] = clamp255(Math.floor(stats[stat] * scale / pst));
        }
        return stats;
    }

    // HP/Atk/Def/SpA/SpD/Spe -> Spe/SpD/SpA/Def/Atk/HP
    function flippedModifiedStats(species) {
        const s = species.baseStats;
        return {hp: s.spe, atk: s.spd, def: s.spa, spa: s.def, spd: s.atk, spe: s.hp};
    }

    // BST <= 350: every stat (HP included) doubled. Null otherwise.
    function threeFiftyCupModifiedStats(species) {
        if (!species?.baseStats || sumStats(species.baseStats) > 350) return null;
        const stats = {};
        for (const stat of STATS) stats[stat] = clamp255(species.baseStats[stat] * 2);
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
    };

    const hasSearchListStats = (mod) => !!SPECIES_STAT_MODIFIERS[mod];

    // Stats used when sorting/rendering the Pokémon search list.
    const searchListStats = (species, mod) =>
    SPECIES_STAT_MODIFIERS[mod]?.(species) || species.baseStats;

    function speciesModBaseStats(mod, dex, set) {
        const species = dex?.species?.get(set?.species);
        return species?.exists ? SPECIES_STAT_MODIFIERS[mod](species) : null;
    }

    // The +stat and -stat base stats trade places. Neutral natures: no change.
    function natureSwapBaseStats(dex, set) {
        const species = dex?.species?.get(set?.species);
        const nature = BattleNatures[set?.nature];
        if (!species?.exists || !nature?.plus || !nature?.minus) return null;

        const stats = copy(species.baseStats);
        [stats[nature.plus], stats[nature.minus]] = [stats[nature.minus], stats[nature.plus]];
        return stats;
    }

    // Fully modified baseStats for the active mod, or null.
    // ctx = {dex, set, room}
    const MOD_BASE_STATS = {
        [MOD.MIX_AND_MEGA]: ({dex, set}) => mixAndMegaBaseStats(dex, set),
        [MOD.GODLY_GIFT]: ({room, set}) => godlyGiftBaseStats(room, set),
        [MOD.CROSS_EVOLUTION]: ({dex, set}) => crossEvolutionBaseStats(dex, set),
        [MOD.FRANTIC_FUSIONS]: ({dex, set}) => franticFusionsBaseStats(dex, set),
        [MOD.NATURE_SWAP]: ({dex, set}) => natureSwapBaseStats(dex, set),
    };
    for (const mod of Object.keys(SPECIES_STAT_MODIFIERS)) {
        MOD_BASE_STATS[mod] = ({dex, set}) => speciesModBaseStats(mod, dex, set);
    }

    const computeModBaseStats = (mod, ctx) => MOD_BASE_STATS[mod]?.(ctx) ?? null;

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

    function modifiedTypes(mod, dex, set) {
        if (mod === MOD.MIX_AND_MEGA) return mixAndMegaModifiedTypes(dex, set);
        if (mod === MOD.CROSS_EVOLUTION) return crossEvolutionTypes(dex, set);
        if (mod === MOD.CAMOMONS) return camomonsTypes(dex, set);
        return null;
    }

    const typeIconsHtml = (types) => types.map((t) => Dex.getTypeIcon(t)).join('');

    function refreshTypeIcons(room) {
        const dex = room?.curTeam?.dex;
        const set = room?.curSet;
        const cell = room?.$?.('.setcell-typeicons');
        if (!dex || !set?.species || !cell?.length) return;

        const types = modifiedTypes(getActiveMod(room), dex, set) || dex.species.get(set.species)?.types || [];
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
            const mod = getActiveMod(room);

            // rAF so Showdown commits the value to curSet first.
            if (mod === MOD.NATURE_SWAP && name === 'nature') {
                requestAnimationFrame(() => { room.updateStatForm(); room.updateStatGraph(); });
            } else if (mod === MOD.CAMOMONS && /^move[1-4]$/.test(name)) {
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

    function mixAndMegaBaseStats(dex, set) {
        const m = mnmLookup(dex, set);
        if (!m?.forme) return null;

        const {species, forme} = m;
        const stats = copy(species.baseStats);

        // Already the forme the item represents (Zamazenta-Crowned, Palkia-Origin...):
        // don't apply its delta a second time.
        if (species.name === forme.formeSpecies.name || species.name === forme.baseSpecies.name) {
            return stats;
        }

        for (const stat of BOOSTABLE_STATS) {
            stats[stat] = clamp255(
                stats[stat] + forme.formeSpecies.baseStats[stat] - forme.baseSpecies.baseStats[stat]
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
    function mixAndMegaModifiedTypes(dex, set) {
        const m = mnmLookup(dex, set);
        if (!m?.forme) return null;

        const delta = mixAndMegaTypeDelta(m.forme.baseSpecies, m.forme.formeSpecies);
        const types = m.species.types.slice();

        if (delta.formeType === 'Primary') {
            const second = types[1];
            return second && second !== delta.type ? [delta.type, second] : [delta.type];
        }

        if (!delta.type) return types;
        if (types[0] === delta.type) return [types[0]];
        return [types[0], delta.type];
    }

    // Pre-Mega speed, using Showdown's own stat formula (IVs/EVs/level/nature).
    function getPreMegaSpeed(set) {
        const dex = window.room?.curTeam?.dex;
        const species = dex?.species?.get(set?.species);
        if (!species?.exists) return 0;

        const iv = set.ivs?.spe ?? 31;
        const ev = set.evs?.spe ?? 0;
        const level = set.level || 100;

        let speed =
            Math.floor((Math.floor(2 * species.baseStats.spe + iv + Math.floor(ev / 4)) * level) / 100) + 5;

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
                'Speed is <span class="mnm-speed-value">0</span> before Mega Evolving</div>'
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
    function franticFusionsBaseStats(dex, set) {
        const ff = resolveFusion(dex, set);
        if (!ff) return null;

        const stats = copy(ff.species.baseStats);
        for (const stat of BOOSTABLE_STATS) {
            stats[stat] += Math.floor(ff.donor.baseStats[stat] / 4);
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

    function crossEvolutionBaseStats(dex, set) {
        const ce = resolveCrossEvolution(dex, set);
        if (!ce) return null;

        const stats = {};
        for (const stat of STATS) {
            stats[stat] = clamp255(
                ce.species.baseStats[stat] + ce.cross.baseStats[stat] - ce.crossPrevo.baseStats[stat]
            );
        }
        return stats;
    }

    function crossEvolutionTypes(dex, set) {
        const ce = resolveCrossEvolution(dex, set);
        if (!ce) return null;

        const types = ce.species.types.slice();
        if (ce.cross.types[0] !== ce.crossPrevo.types[0]) types[0] = ce.cross.types[0];
        if (ce.cross.types[1] !== ce.crossPrevo.types[1]) {
            types[1] = ce.cross.types[1] || ce.cross.types[0];
        }

        return types[0] === types[1] ? [types[0]] : types.filter(Boolean);
    }

    // Cross-evolved / fused view of `speciesLike` as if nicknamed after
    // `targetId`, or null if that isn't legal. Used by the "into" filters.
    function crossEvolveView(dex, speciesLike, targetId) {
        const target = dex?.species?.get(targetId);
        if (!speciesLike?.name || !target?.exists) return null;

        const set = {species: speciesLike.name, name: target.name};
        const mod = getActiveMod();

        if (mod === MOD.INHERITANCE) {
            const inh = resolveFusion(dex, set);
            if (!inh) return null;
            return {
                baseStats: copy(inh.species.baseStats),
                types: inh.species.types.slice(),
                abilities: copy(inh.donor.abilities),
            };
        }

        if (mod === MOD.FRANTIC_FUSIONS) {
            const ff = resolveFusion(dex, set);
            if (!ff) return null;
            return {
                baseStats: franticFusionsBaseStats(dex, set),
                types: ff.species.types.slice(),
                abilities: null, // row keeps its own abilities
            };
        }

        const ce = resolveCrossEvolution(dex, set);
        if (!ce) return null;

        return {
            baseStats: crossEvolutionBaseStats(dex, set),
            types: crossEvolutionTypes(dex, set),
            abilities: copy(ce.cross.abilities),
        };
    }

    // ---------- "into X" / "X into" search queries ----------

    // "into <species>" -> target species (Cross Evolution / Frantic Fusions / Inheritance).
    function parseIntoQuery(engine, query) {
        const format = engine?.typedSearch?.format;
        if (!isCrossFormat(format)) return null;

        const m = String(query || '').trim().match(/^into\s+(.+)$/i);
        if (!m) return null;

        const species = (engine.dex || engine.typedSearch?.dex)?.species?.get(m[1].trim());
        if (!species?.exists || species.battleOnly) return null;
        if (fmtHas(format, 'crossevolution') && !species.prevo) return null;

        return species;
    }

    // "<species> into" -> base species.
    function parseFromQuery(engine, query) {
        const format = engine?.typedSearch?.format;
        if (!isCrossFormat(format)) return null;

        const m = String(query || '').trim().match(/^(.+?)\s+Into$/i);
        if (!m) return null;

        const species = (engine.dex || engine.typedSearch?.dex)?.species?.get(m[1].trim());
        if (!species?.exists || species.battleOnly) return null;
        if (fmtHas(format, 'crossevolution') && !isNfe(species)) return null;

        return species;
    }

    function getIntoFilterId(engine, kind = 'into') {
        for (const list of [engine?.filters, engine?.typedSearch?.filters]) {
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

    // ---------- live refresh when the nickname changes ----------

    let fusionRefreshFrame = null;
    let fusionLastNickname = null;

    // Refresh type icons + base stat column as soon as the nickname changes.
    function refreshFusionSet(room, nicknameOverride = null) {
        if (!room) return;
        const mod = getActiveMod(room);
        if (!isFusionMod(mod)) return;

        const set = room.curSet;
        const dex = room.curTeam?.dex;
        if (!set?.species || !dex) return;

        // While typing, Showdown may not have committed the nickname to
        // curSet.name yet, so use the input's value via a temporary set.
        const name = nicknameOverride !== null ? nicknameOverride.trim() : String(set.name || '').trim();
        const liveSet = name === set.name ? set : Object.assign({}, set, {name});

        const baseTypes = dex.species.get(set.species)?.types || [];
        const types = mod === MOD.CROSS_EVOLUTION
        ? (crossEvolutionTypes(dex, liveSet) || baseTypes)
        : baseTypes;

        room.$('.setcell-typeicons').html(typeIconsHtml(types));

        // updateStatForm()/updateStatGraph() read curSet, so swap in the live one.
        const originalSet = room.curSet;
        room.curSet = liveSet;
        try {
            room.updateStatForm();
            room.updateStatGraph();
        } finally {
            room.curSet = originalSet;
        }

        const engine = room.search?.engine;
        if (engine) {
            for (const search of [engine.moveSearch, engine.abilitySearch]) {
                if (!search) continue;
                search.__qolFusionKey = null;
                clearSearchCache(search);
            }
        }
        refreshSearchUi(room);
    }

    function scheduleFusionRefresh(room, nickname = null) {
        if (!room) return;
        if (fusionRefreshFrame !== null) cancelAnimationFrame(fusionRefreshFrame);

        fusionRefreshFrame = requestAnimationFrame(() => {
            fusionRefreshFrame = null;

            if (getActiveTeambuilderRoom() !== room || !isFusionMod(getActiveMod(room))) return;

            const name = nickname !== null
            ? String(nickname).trim()
            : String(room.curSet?.name || '').trim();

            if (name === fusionLastNickname) return;
            fusionLastNickname = name;

            refreshFusionSet(room, name);
        });
    }

    let fusionListenerInstalled = false;
    function installFusionNicknameListener() {
        if (fusionListenerInstalled) return;
        fusionListenerInstalled = true;

        const handler = (e) => {
            const input = e.target;
            if (!(input instanceof HTMLInputElement) || input.name !== 'nickname') return;

            const room = getActiveTeambuilderRoom();
            if (!room || !isFusionMod(getActiveMod(room))) return;

            // Use the input's value directly; Showdown may not commit it to
            // curSet.name until blur/change.
            scheduleFusionRefresh(room, input.value);
        };

        document.addEventListener('input', handler, true);
        document.addEventListener('change', handler, true);
    }

    // ====================================================================
    // 10. CONVERGENCE
    // ====================================================================

    const CONVERGENCE_FORMAT_ID = 'convergence';
    const CONVERGENCE_TYPE_ORDER_MATTERS = false;
    const CONVERGENCE_EXCLUDED_DONORS = new Set();

    const convergenceIndexCache = new Map();
    const convergenceMoveCache = new Map();

    function convergenceTypeKey(species) {
        const types = species.types.slice();
        if (!CONVERGENCE_TYPE_ORDER_MATTERS) types.sort();
        return types.join('/');
    }

    // Every legal donor species sharing a typing, cached per generation.
    function getConvergenceGroup(dex, species) {
        let index = convergenceIndexCache.get(dex.gen);

        if (!index) {
            index = new Map();

            for (const id of Object.keys(window.BattlePokedex || {})) {
                const sp = dex.species.get(id);
                if (!sp?.exists || sp.id !== id) continue;
                if (sp.battleOnly || sp.isNonstandard) continue;
                if (CONVERGENCE_EXCLUDED_DONORS.has(sp.id) || isBannedByList(convergenceBans, sp)) continue;

                const key = convergenceTypeKey(sp);
                if (!index.has(key)) index.set(key, []);
                index.get(key).push(sp);
            }

            for (const list of index.values()) list.sort((a, b) => a.name.localeCompare(b.name));
            convergenceIndexCache.set(dex.gen, index);
        }

        return index.get(convergenceTypeKey(species)) || [];
    }

    // moveId -> {donorId, header} across the whole typing group.
    function getConvergenceMoveMap(search, base, species) {
        const key = `${search.dex.gen}|${convergenceTypeKey(species)}`;
        let map = convergenceMoveCache.get(key);
        if (map) return map;

        map = new Map();

        for (const member of getConvergenceGroup(search.dex, species)) {
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
        const results = base();
        if (!search.species) return results;

        if (!BL.conv.loaded) {
            requestBanlist('conv');
            return results;
        }

        const species = search.dex.species.get(search.species);
        if (!species?.exists) return results;

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

        search.__qolConvDonors = donors;
        return extra.length ? mergeMoveResults(results, extra) : results;
    }

    // Everything (incl. hidden/special) goes under one "Abilities" header.
    function convergenceAbilityResults(search, base) {
        const results = base();
        if (!search.species) return results;

        if (!BL.conv.loaded) {
            requestBanlist('conv');
            return results;
        }

        const species = search.dex.species.get(search.species);
        if (!species?.exists) return results;

        const notes = results.filter((r) => r[0] === 'html');
        const own = results.filter((r) => r[0] === 'ability');
        if (!own.length) return results;

        const seen = new Set(own.map((r) => r[1]));
        const donors = {};
        const extra = [];

        for (const member of getConvergenceGroup(search.dex, species)) {
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
        search.__qolConvDonors = donors;

        return [...notes, ['header', 'Abilities'], ...own, ...extra];
    }

    // ====================================================================
    // 11. ALPHABET CUP / NATIONAL DEX MOVEPOOL
    // ====================================================================

    // ---------- Alphabet Cup ----------

    const ALPHABET_CUP_FORMAT_ID = 'alphabetcup';
    const alphabetCupCache = new WeakMap();

    // Per-dex: eligible move ids grouped by first letter, plus a cache of each species' letters.
    function getAlphabetCupCache(dex) {
        let cache = alphabetCupCache.get(dex);
        if (cache) return cache;

        cache = {byLetter: new Map(), ids: new Set(), letters: new Map()};

        for (const id of Object.keys(window.BattleMovedex || {})) {
            const move = dex.moves.get(id);
            if (!move?.exists || move.id !== id) continue;
            if (move.isNonstandard || move.isZ || move.isMax || id === 'struggle') continue;

            const letter = move.name.charAt(0).toLowerCase();
            if (!/[a-z]/.test(letter)) continue;

            cache.ids.add(id);
            if (!cache.byLetter.has(letter)) cache.byLetter.set(letter, []);
            cache.byLetter.get(letter).push(id);
        }

        alphabetCupCache.set(dex, cache);
        return cache;
    }

    // First letter of the species' name and of every pre-evolution's name.
    function alphabetCupLetters(dex, species) {
        const cache = getAlphabetCupCache(dex);
        let letters = cache.letters.get(species.id);
        if (letters) return letters;

        letters = new Set();
        const seen = new Set();
        let cur = species;

        while (cur?.exists && !seen.has(cur.id)) {
            seen.add(cur.id);
            const ch = cur.name.charAt(0).toLowerCase();
            if (/[a-z]/.test(ch)) letters.add(ch);
            cur = cur.prevo ? dex.species.get(cur.prevo) : null;
        }

        cache.letters.set(species.id, letters);
        return letters;
    }

    function alphabetCupMoveIds(dex, species) {
        const cache = getAlphabetCupCache(dex);
        const ids = [];
        for (const letter of alphabetCupLetters(dex, species)) {
            ids.push(...(cache.byLetter.get(letter) || []));
        }
        return ids;
    }

    function alphabetCupCanLearn(dex, species, moveId) {
        const move = dex.moves.get(moveId);
        if (!move?.exists || !getAlphabetCupCache(dex).ids.has(move.id)) return false;
        return alphabetCupLetters(dex, species).has(move.name.charAt(0).toLowerCase());
    }

    // Native learnset check OR Alphabet Cup letter rule (used by Pokémon search filters).
    function pokemonMatchesMove(ctx, original, row, species, moveId) {
        if (original.call(ctx, row, [['move', moveId]])) return true;
        return fmtHas(ctx.format, ALPHABET_CUP_FORMAT_ID) && alphabetCupCanLearn(ctx.dex, species, moveId);
    }

    function alphabetCupMoveResults(search, base) {
        const results = base();
        if (!search.species) return results;

        const species = search.dex.species.get(search.species);
        if (!species?.exists) return results;

        return addMovesToResults(search, results, species, alphabetCupMoveIds(search.dex, species));
    }

    // ---------- National Dex movepool (move-search "natdex" chip) ----------

    const NATDEX_MOVE_FILTER_TYPE = 'mv-natdex'; // = MOVE_FILTER_TYPE + 'natdex'
    const NATDEX_SKIP_NONSTANDARD = new Set(['LGPE', 'Unobtainable', 'CAP', 'Gigantamax']);

    function natdexMoveIds(dex, species) {
        const T = window.BattleTeambuilderTable || {};
        const tables = [T.learnsets];
        for (let g = 1; g <= 9; g++) tables.push(T['gen' + g]?.learnsets);

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

            if (!exists) return false;

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

    function suggestedAbilityResults(search, base) {
        const results = base();
        if (!search.species) return results;

        const isPoke = isPokeAAAFormat(search.format);
        const seen = new Set();

        const abilityRows = (names) => {
            const rows = [];
            for (const name of names) {
                const ability = search.dex.abilities.get(name);
                if (!ability?.exists || seen.has(ability.id)) continue;
                seen.add(ability.id);
                rows.push(['ability', ability.id]);
            }
            return rows;
        };

        const nativeRows = isPoke
        ? abilityRows(Object.values(search.dex.species.get(search.species)?.abilities || {}))
        : [];
        const suggestedRows = abilityRows(SUGGESTED_ABILITIES[toID(search.species)] || []);
        if (!nativeRows.length && !suggestedRows.length) return results;

        const notes = results.filter((r) => r[0] === 'html');
        // Drop duplicates (they now live in our sections) and any header left empty.
        const rest = dropEmptyHeaders(
            results.filter((r) => r[0] !== 'html' && !(r[0] === 'ability' && seen.has(r[1])))
        );

        return [
            ...notes,
            ...(nativeRows.length ? [['header', 'Native Abilities'], ...nativeRows] : []),
            ...(suggestedRows.length ? [['header', 'Suggested Abilities'], ...suggestedRows] : []),
            ...rest,
        ];
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
        const isInheritance = fmtHas(search.format, 'inheritance');
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
        search.__qolConvDonors = {};

        const ce = resolveCrossEvolution(search.dex, search.set);
        if (!ce) return base();

        const results = withSpeciesOverrides(search.dex, ce.species, {abilities: copy(ce.cross.abilities)}, base);

        // Only abilities the base species doesn't already have get the icon.
        const own = new Set(Object.values(ce.species.abilities).filter(Boolean).map((a) => toID(a)));
        const donors = {};
        for (const r of results) {
            if (r[0] === 'ability' && !own.has(r[1])) donors[r[1]] = ce.cross.id;
        }
        search.__qolConvDonors = donors;

        return results;
    }

    function crossEvolutionMoveResults(search, base) {
        const results = base();
        search.__qolConvDonors = {};

        const ce = resolveCrossEvolution(search.dex, search.set);
        if (!ce) return results;

        const crossResults = withSearchSpecies(search, ce.cross.name, base);

        // Moves that only exist because of the cross evolution get the target's icon.
        const have = new Set(results.filter((r) => r[0] === 'move').map((r) => r[1]));
        const donors = {};
        for (const r of crossResults) {
            if (r[0] === 'move' && !have.has(r[1])) donors[r[1]] = ce.cross.id;
        }
        search.__qolConvDonors = donors;

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

    const ABILITY_PROVIDERS = [
        {match: (f) => isPokeAAAFormat(f) || fmtHas(f, 'almostanyability'), run: suggestedAbilityResults},
        {match: (f) => fmtHas(f, 'franticfusions', 'inheritance'), run: fusionAbilityResults},
        {match: (f) => fmtHas(f, 'crossevolution'), run: crossEvolutionAbilityResults},
        {match: (f) => fmtHas(f, CONVERGENCE_FORMAT_ID), run: convergenceAbilityResults},
        {match: (f) => fmtHas(f, 'mixandmega'), run: mixAndMegaAbilityResults},
    ];

    const MOVE_PROVIDERS = [
        {match: (f) => fmtHas(f, 'crossevolution'), run: crossEvolutionMoveResults},
        {match: (f) => fmtHas(f, 'inheritance'), run: inheritanceMoveResults},
        {match: (f) => fmtHas(f, CONVERGENCE_FORMAT_ID), run: convergenceMoveResults},
        {match: (f) => fmtHas(f, ALPHABET_CUP_FORMAT_ID), run: alphabetCupMoveResults},
    ];

    function patchAbilitySearchResults() {
        return patchMethod(window.BattleAbilitySearch?.prototype, 'getBaseResults', '__qolAbilityProvidersPatched', (original) =>
                           function () {
            const base = () => original.call(this);
            const provider = ABILITY_PROVIDERS.find((p) => p.match(this.format));
            return provider ? provider.run(this, base) : base();
        }
                          );
    }

    function patchMoveSearchResults() {
        return patchMethod(window.BattleMoveSearch?.prototype, 'getBaseResults', '__qolMoveProvidersPatched', (original) =>
                           function () {
            const base = () => augmentWithNatdexMoves(this, original.call(this));
            const provider = MOVE_PROVIDERS.find((p) => p.match(this.format));
            return provider ? provider.run(this, base) : base();
        }
                          );
    }

    // ---------- cached-result invalidation ----------

    // Move/ability results are cached per search instance. Bust the cache when
    // the nickname (the cross-evo / fusion donor) changes.
    function bustFusionCache(search) {
        if (!isCrossFormat(search.format) || !search.set) return;

        const key = [search.set.species || '', search.set.name || '', search.species || ''].join('|');
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
        'type', 'move', 'ability', 'egggroup', 'tier', 'weak', 'resists', 'neutral',
        'natdex', 'fe', 'recovery', 'pivot', 'priority', 'removal', 'hazards', 'into', 'from',
        'legendary', 'boxlegend', 'mythical', 'paradox', 'eeveelution',
    ];
    // Toggle filters take no argument: typing the keyword and picking the
    // single suggestion adds/removes the chip. Value = display label.
    const CUSTOM_TOGGLE_FILTERS = {
        natdex: 'National Dex',
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
        removal: 'Removal',
        hazards: 'Hazards',
    };


    // Namespaced pseudo-ids so suggestion rows can't collide with real ids.
    const CUSTOM_TOGGLE_PREFIX = 'is ';
    const INTO_PREFIX = 'Into ';
    const FROM_PREFIX = 'From ';

    const isFullyEvolved = (species) => !!species && (!species.evos || species.evos.length === 0);

    const SPECIES_GROUPS = {
        // Sub-legendaries + Ultra Beasts + DLC legends (not box, not mythical)
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

    function computeCustomToggleMoveIds(dex, kind) {
        if (TOGGLE_MOVE_LISTS[kind]) {
            return TOGGLE_MOVE_LISTS[kind].filter((id) => dex.moves.get(id)?.exists);
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
    function pokemonMatchesCustomToggle(ctx, original, row, species, kind) {
        switch (kind) {
            case 'fe':
                return isFullyEvolved(species);
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
    function customToggleSuggestions(query) {
        const q = toSearchId(query);
        const rows = [];

        for (const [key, label] of Object.entries(CUSTOM_TOGGLE_FILTERS)) {
            if (!q || toSearchId(key).startsWith(q) || toSearchId(label).startsWith(q)) {
                rows.push([
                    'ability',
                    CUSTOM_TOGGLE_PREFIX + key,
                    0,
                    Math.min(String(query || '').length, label.length),
                ]);
            }
        }
        return rows;
    }

    // Mirrors DexSearch#addFilter's per-type normalization.
    function normalizePokemonFilterValue(engine, type, value) {
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
        if (EFFECT_LABELS[type]) return pokemonMatchesEffectiveness(search.dex, species, type, target);
        if (type === 'into') return !!crossEvolveView(search.dex, species, target);
        if (type === 'from') return !!crossEvolveView(search.dex, search.dex.species.get(target), species.id);
        if (CUSTOM_TOGGLE_FILTERS[type]) return pokemonMatchesCustomToggle(search, original, row, species, type);
        if (type === 'move') return pokemonMatchesMove(search, original, row, species, target);
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

            // Each filter is tested on its own; a negated one flips the
            // result. Everything must hold at once.
            for (const [rawType, target] of filters) {
                const negated = isNegatedFilterType(rawType);
                const type = baseFilterType(rawType);

                // natdex only widens the pool; it never rejects a row.
                if (type === 'natdex') continue;

                const matches = pokemonFilterMatches(this, original, row, species, type, target);
                if (negated ? matches : !matches) return false;
            }

            return true;
        }
                          );
    }

    // ---------- Pokémon search results: one getResults wrapper ----------
    //   before: remember into/from chips, widen pool for "natdex"
    //   after:  apply server banlist, then Godly Gift legality

    function applyGenericBans(search, results, hasNatdex) {
        const id = genericBanFormatId(search.format);
        if (!id) return results;

        const entry = requestGenericBanlist(id);
        if (!entry.loaded || hasNatdex) return results;

        const bans = entry.bans;

        // Pokébilities formats need native legality handling.
        // Do not generically remove species/forms based on /tier.
        if (fmtHas(search.format, 'pokebilities')) {
            if (bans.abilities.size) {
                const out = moveNativeBannedToIllegal(search, results, bans);
                if (out.length === results.length && out.every((r, i) => r === results[i])) {
                    return results;
                }
                return dropEmptyHeaders(out);
            }
            return results;
        }

        let out = results.filter(
            (row) => row[0] !== 'pokemon' ||
            !isBannedByList(bans, search.dex.species.get(row[1]))
        );

        if (out.length === results.length && out.every((r, i) => r === results[i])) {
            return results;
        }

        return dropEmptyHeaders(out);
    }

    function moveNativeBannedToIllegal(search, rows, bans) {
        const illegalIdx = rows.findIndex((r) => r[0] === 'header' && /illegal/i.test(String(r[1])));
        const legal = [];
        const moved = [];

        rows.forEach((row, i) => {
            const inLegalZone = illegalIdx < 0 || i < illegalIdx;
            if (inLegalZone && row[0] === 'pokemon' && nativeBannedAbility(bans, search.dex.species.get(row[1]))) {
                moved.push(row);
            } else {
                legal.push(row);
            }
        });
        if (!moved.length) return rows;

        if (!search.illegalReasons) search.illegalReasons = {};
        for (const row of moved) {
            const ab = nativeBannedAbility(bans, search.dex.species.get(row[1]));
            search.illegalReasons[row[1]] = `Banned ability: ${ab}`;
        }

        // Redraw once per distinct set of moved mons (avoids a refresh loop).
        const key = moved.map((r) => r[1]).join(',');
        if (search.__qolMovedKey !== key) {
            search.__qolMovedKey = key;
            refreshSearch(getTeambuilderRoom());
        }

        return illegalIdx < 0
            ? legal.concat([['header', TL(['Illegal Pokémon'])], ...moved])
        : legal.concat(moved);
    }

    // Godly Gift: other Restricted mons move to an "Illegal results" section.
    function applyGodlyGiftLegality(search, results) {
        if (!fmtHas(search.format, 'godlygift')) return results;

        const room = getTeambuilderRoom();
        const isIllegal = room && getGodlyGiftIllegalChecker(room);
        if (!isIllegal) return results;

        const legal = [];
        const illegal = [];

        for (const row of results) {
            if (row[0] !== 'pokemon') {
                legal.push(row);
                continue;
            }
            (isIllegal(search.dex.species.get(row[1])) ? illegal : legal).push(row);
        }

        if (!illegal.length) return results;
        return legal.concat([['header', TL(['Illegal results'])], ...illegal]);
    }

    function patchPokemonSearchResults() {
        return patchMethod(window.BattlePokemonSearch?.prototype, 'getResults', '__qolPokemonResultsPatched', (original) =>
                           function (filters, sortCol, reverseSort) {
            if (this.searchType !== 'pokemon') return original.call(this, filters, sortCol, reverseSort);

            // Remember the active into/from chips for sort().
            const findChip = (kind) => {
                const f = Array.isArray(filters) ? filters.find((e) => e[0] === kind) : null;
                return f ? f[1] : null;
            };
            this.__qolIntoId = findChip('into');
            this.__qolFromId = findChip('from');

            // "natdex" chip: use the complete Pokédex as the legal pool
            // (includes mons the format normally considers illegal).
            const hasNatdex =
                  Array.isArray(filters) && filters.some(([rawType]) => baseFilterType(rawType) === 'natdex');

            if (hasNatdex) {
                this.baseResults = this.getDefaultResults();
                this.baseIllegalResults = [];
                this.illegalReasons = {};
                this.__qolNatdexPoolActive = true;
            } else if (this.__qolNatdexPoolActive) {
                // Filter removed: drop the widened cache so real legality is rebuilt.
                this.__qolNatdexPoolActive = false;
                this.baseResults = null;
                this.baseIllegalResults = null;
                this.illegalReasons = null;
            }

            let results = original.call(this, filters, sortCol, reverseSort);
            if (!Array.isArray(results)) return results;

            results = applyGenericBans(this, results, hasNatdex);
            return applyGodlyGiftLegality(this, results);
        }
                          );
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
            types = modifiedTypes(getActiveMod(getActiveTeambuilderRoom()), search.dex, set);
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
    const STAT_FILTER_STATS = [
        {key: 'atk', label: 'Attack', short: ['atk']},
        {key: 'def', label: 'Defense', short: ['def']},
        {key: 'spa', label: 'Sp. Atk', short: ['spa', 'spatk']},
        {key: 'spd', label: 'Sp. Def', short: ['spd', 'spdef']},
        {key: 'spe', label: 'Speed', short: ['spe']},
        {key: 'accuracy', label: 'Accuracy', short: ['acc']},
        {key: 'evasion', label: 'Evasion', short: ['eva']},
        {key: 'stats', label: 'Stats', short: []},
    ];

    const STAT_FILTER_FAMILIES = [
        {id: 'boosts', label: 'Boosts', who: 'any', sign: 1, verb: "Raises a Pokémon's"},
        {id: 'lowers', label: 'Lowers', who: 'self', sign: -1, verb: "Lowers the user's"},
        {id: 'lowerstarget', label: 'Lowers Target', who: 'target', sign: -1, verb: "Lowers the target's"},
        {id: 'zboosts', label: 'Z-Boosts', z: true, verb: "Z-Power raises the user's"},
    ];

    function buildStatToggles() {
        const toggles = {};
        for (const fam of STAT_FILTER_FAMILIES) {
            for (const st of STAT_FILTER_STATS) {
                toggles[fam.id + st.key] = {
                    label: `${fam.label} ${st.label}`,
                    aliases: st.short.map((a) => `${fam.label} ${a}`),
                    desc: `${fam.verb} ${st.key === 'stats' ? 'stats' : st.label}`,
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
            test: (m) => HAZARD_MOVES.has(m.id) || HAZARD_CONDITIONS.has(moveField(m, 'sideCondition')),
        },
        pivot: {
            label: 'Pivot', aliases: ['uturn'],
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
            aliases: ['bypassprotection', 'bypassesprotection', 'breaksprotect', 'ignoreprotect', 'feint'],
            desc: 'Hits through Protect',
            test: bypassesProtect,
        },
        spread: {
            label: 'Spread', aliases: ['spreadmoves', 'multitarget'],
            desc: 'Hits multiple targets',
            test: isSpreadMove,
        },
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
            .map((s) => ['ability', MOVE_ROW_PREFIX + s.key, 0, 0]);
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
                const native = (original.call(engine, query) || []).filter((row) => !isReservedToggleCollisionRow(row));
                const custom = customToggleSuggestions(raw);

                if (!custom.length) return native;
                return (engine.results = [['header', 'Mod Filters'], ...custom].concat(native));
            }

            engine.__qolNegateMode = true;
            let results;

            if (!q) {
                // Bare "!": every toggle plus every type. Abilities/moves only
                // show once you type their name (too many to list).
                results = [['header', 'Not'], ...customToggleSuggestions('')];
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
                results = customToggleSuggestions(q).concat(suggestions);
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

        // Toggle suggestion picked (natdex/fe/recovery/...).
        if (isStr && rawValue.startsWith(CUSTOM_TOGGLE_PREFIX)) {
            const key = rawValue.slice(CUSTOM_TOGGLE_PREFIX.length);

            if (CUSTOM_TOGGLE_FILTERS[key]) {
                const negated = isNegatedFilterType(entry[0]) || engine.__qolNegateMode;
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
            return addPokemonSearchFilter(engine, baseFilterType(rawType), entry[1], true);
        }

        // Directly supplied positive custom filters (e.g. from the console).
        if (EFFECT_LABELS[rawType] || CUSTOM_TOGGLE_FILTERS[rawType]) {
            return addPokemonSearchFilter(engine, rawType, entry[1], false);
        }

        return original.call(engine, entry);
    }

    function pokemonResultName(engine, original, result) {
        const id = typeof result?.[1] === 'string' ? result[1] : '';

        if (id.startsWith(INTO_PREFIX)) {
            const sp = engine.dex.species.get(id.slice(INTO_PREFIX.length));
            if (sp?.exists) return 'Into ' + sp.name;
        }

        if (id.startsWith(FROM_PREFIX)) {
            const sp = engine.dex.species.get(id.slice(FROM_PREFIX.length));
            if (sp?.exists) return sp.name + ' into';
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

    // Picking a type from the "Weak / Resists / Neutral" list adds the chip directly.
    function patchEngineSelectResult() {
        return patchEngineMethod('selectResult', '__qolSelectResultPatched', (original) =>
                                 function (index) {
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
            const sortBy = (statsFor) =>
            results.sort((a, b) => {
                const sa = statsFor(a[1]);
                const sb = statsFor(b[1]);
                return (sortCol === 'bst' ? sumStats(sb) - sumStats(sa) : sb[sortCol] - sa[sortCol]) * order;
            });

            // "into X": sort by the cross-evolved stats.
            if (this.__qolIntoId) {
                return sortBy((id) => {
                    const sp = dex.species.get(id);
                    return crossEvolveView(dex, sp, this.__qolIntoId)?.baseStats || sp.baseStats;
                });
            }

            // "X into": X is the base, each result is the nickname.
            if (this.__qolFromId) {
                const base = dex.species.get(this.__qolFromId);
                return sortBy((id) =>
                              crossEvolveView(dex, base, id)?.baseStats || dex.species.get(id).baseStats);
            }

            const mod = getActiveMod();
            if (!hasSearchListStats(mod)) return original.call(this, results, sortCol, reverseSort);

            return sortBy((id) => searchListStats(dex.species.get(id), mod));
        }
                          );
    }

    function patchSearchRenderer() {
        return patchMethod(window.BattleSearch?.prototype, 'renderPokemonRow', '__qolPatched', (original) =>
                           function (pokemon, matchStart, matchLength, errorMessage, attrs) {
            const call = (mon, err) => original.call(this, mon, matchStart, matchLength, err, attrs);

            // Cross-evolved preview for "into X" / "X into" filters.
            if (pokemon) {
                const dex = this.engine.dex;
                const intoId = getIntoFilterId(this.engine);
                const fromId = getIntoFilterId(this.engine, 'from');

                let view = intoId ? crossEvolveView(dex, pokemon, intoId) : null;
                if (!view && fromId) view = crossEvolveView(dex, dex.species.get(fromId), pokemon.id);

                if (view) {
                    return call(Object.assign({}, pokemon, {
                        baseStats: view.baseStats,
                        types: view.types,
                        abilities: view.abilities || pokemon.abilities,
                    }), errorMessage);
                }
            }

            // Natdex: suppress the legality label.
            const filters = this.engine?.typedSearch?.filters ?? [];
            if (filters.some((f) => Array.isArray(f) && f[0] === 'natdex')) {
                return call(pokemon, undefined);
            }

            const mod = getActiveMod();
            if (!pokemon || !hasSearchListStats(mod)) return call(pokemon, errorMessage);

            return call(Object.assign({}, pokemon, {baseStats: searchListStats(pokemon, mod)}), errorMessage);
        }
                          );
    }

    // Row HTML for suggestion rows: custom rows (toggles / into / from) render
    // through a real, harmless ability id to inherit the native markup, then
    // the visible name is swapped for our label. Native type/ability/move/tier
    // rows get "Weak " / "!" prefixes while an effectiveness / negate mode is active.
    function patchSearchRowText() {
        return patchMethod(window.BattleSearch?.prototype, 'renderRow', '__qolEffectivenessTypeNamePatched', (original) =>
                           function (row, type, matchStart, matchEnd, errorMessage, attrs) {
            const renderLabelRow = (text) =>
            original.call(this, ['ability', 'noability'], 'ability', matchStart, matchEnd, errorMessage, attrs)
            .replace(/(<span class="col namecol"><b>)([^<]*)(<\/b>)/, `$1${text}$3`);

            const id = type === 'ability' && typeof row?.[1] === 'string' ? row[1] : '';
            const dex = this.engine?.dex;

            if (id.startsWith(INTO_PREFIX)) {
                const sp = dex?.species?.get(id.slice(INTO_PREFIX.length));
                if (sp?.exists) return renderLabelRow(`Into ${sp.name}`);
            }

            if (id.startsWith(FROM_PREFIX)) {
                const sp = dex?.species?.get(id.slice(FROM_PREFIX.length));
                if (sp?.exists) return renderLabelRow(`${sp.name} into`);
            }

            if (id.startsWith(CUSTOM_TOGGLE_PREFIX)) {
                const label = CUSTOM_TOGGLE_FILTERS[id.slice(CUSTOM_TOGGLE_PREFIX.length)];
                if (label) return renderLabelRow(this.engine?.__qolNegateMode ? `Not ${label}` : label);
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
                } else if (kind === 'from') {
                    text = Dex.species.get(text).name + ' Into';
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

    // ====================================================================
    // 17. TEAMBUILDER PATCHES (stat calc, base stat column, icons)
    // ====================================================================

    // Stat calculation for every mod.
    function patchGetStat() {
        return patchMethod(window.TeambuilderRoom?.prototype, 'getStat', '__qolPatched', (original) =>
                           function (stat, set, evOverride, natureOverride) {
            const callOriginal = () => original.call(this, stat, set, evOverride, natureOverride);

            set = set || this.curSet;
            if (!set) return 0;

            const mod = getActiveMod(this);
            if (!mod) return callOriginal();

            const dex = this.curTeam?.dex;
            const baseStats = computeModBaseStats(mod, {dex, set, room: this});
            if (!baseStats) return callOriginal();

            return withSpeciesBaseStats(dex, set.species, baseStats, callOriginal);
        }
                          );
    }

    // The visible "base stats" column.
    function applyModBaseStatColumn(room) {
        const mod = getActiveMod(room);
        const set = room?.curSet;
        if (!mod || !set?.species) return;

        const baseStats = computeModBaseStats(mod, {dex: room.curTeam?.dex, set, room});
        if (!baseStats) return;

        const rows = room.$chart?.find('.basestatscol > div');
        if (!rows?.length) return;

        STATS.forEach((stat, i) => rows.eq(i + 1).find('b').text(baseStats[stat]));
    }

    function patchStatForm() {
        const proto = window.TeambuilderRoom?.prototype;

        const updateForm = patchMethod(proto, 'updateStatForm', '__qolPatched', (original) =>
                                       function (setGuessed) {
            const result = original.call(this, setGuessed);

            applyModBaseStatColumn(this);
            if (getActiveMod(this) === MOD.MIX_AND_MEGA && this.curSet?.species) {
                renderMixAndMegaSpeedNote(this);
            }
            return result;
        }
                                      );

        // Same post-hook for these: re-apply the base stat column.
        const columnPatches = ['updateStatGraph', 'natureChange'].map((key) =>
                                                                      patchMethod(proto, key, '__qolBaseColumn_' + key, (original) =>
                                                                                  function (...args) {
            const result = original.apply(this, args);
            applyModBaseStatColumn(this);
            return result;
        }
                                                                                 )
                                                                     );

        const statSlide = patchMethod(proto, 'statSlide', '__qolPatched', (original) =>
                                      function (...args) {
            const result = original.apply(this, args);
            if (getActiveMod(this) === MOD.MIX_AND_MEGA) updateMixAndMegaSpeedNote(this);
            return result;
        }
                                     );

        return updateForm && statSlide && columnPatches.every(Boolean);
    }

    // The Details pane's type icons come from the *named* species with no
    // awareness of the item/nickname/moves, so post-process the HTML it
    // returns. Also covers switching mons and page load.
    function patchRenderSetTypeIcons() {
        return patchMethod(window.TeambuilderRoom?.prototype, 'renderSet', '__qolMixAndMegaPatched', (original) =>
                           function (set, i) {
            const html = original.call(this, set, i);
            if (!set?.species) return html;

            const types = modifiedTypes(getActiveMod(this), this.curTeam?.dex, set);
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
    function patchChartSet() {
        return patchMethod(window.TeambuilderRoom?.prototype, 'chartSet', '__qolChartSetPatched', (original) =>
                           function (val, selectNext) {
            const mod = getActiveMod(this);
            const chartName = this.curChartName;

            let nickname = null;
            if (chartName === 'pokemon' && isFusionMod(mod)) {
                ({val, nickname} = resolveIntoSelection(this, val));
            }

            const result = original.call(this, val, selectNext);

            if (nickname && this.curSet) {
                this.curSet.name = nickname;
                this.$('input[name=nickname]').val(nickname);
                this.save?.();

                fusionLastNickname = null;
                scheduleFusionRefresh(this, nickname);
            }

            // Camomons: refresh on any pick (species pick blanks the icons,
            // move picks fill them). Mix and Mega: only on item.
            if (mod === MOD.CAMOMONS || (mod === MOD.MIX_AND_MEGA && chartName === 'item')) {
                refreshTypeIcons(this);
            }
            return result;
        }
                          );
    }

    // ====================================================================
    // 18. BATTLE PATCHES, GODLY GIFT, DOM DECORATORS, BOOT
    // ====================================================================

    // ---------- Godly Gift ----------

    const godBaseId = (species) => toID(species.baseSpecies || species.name);

    // Same resolution the sim uses: Mega Stone / Red-Blue Orb change the God's
    // forme, and battleOnly formes resolve to the species they come from.
    function resolveGodSpecies(dex, set) {
        if (!dex || !set?.species) return null;

        let species = dex.species.get(set.species);
        if (!species?.exists) return null;

        const item = set.item ? dex.items.get(set.item) : null;
        if (item?.exists) {
            let forme = null;
            if (item.megaStone) {
                forme = item.megaStone[species.name];
            } else if (item.id === 'redorb' && species.baseSpecies === 'Groudon') {
                forme = 'Groudon-Primal';
            } else if (item.id === 'blueorb' && species.baseSpecies === 'Kyogre') {
                forme = 'Kyogre-Primal';
            }
            const formeSpecies = forme ? dex.species.get(forme) : null;
            if (formeSpecies?.exists) species = formeSpecies;
        }

        if (typeof species.battleOnly === 'string') {
            const prior = dex.species.get(species.battleOnly);
            if (prior?.exists) species = prior;
        }

        return species;
    }

    // Restricted by exact forme id or by base species.
    function isGodlyGiftRestricted(species) {
        if (!species?.exists) return false;
        return godlyGiftRestricted.has(species.id) || godlyGiftRestricted.has(godBaseId(species));
    }

    // First teammate that is Restricted (or has Power Construct, when
    // `powerConstruct` is set). Null if none.
    function findGodSet(room, {ignoreSet = null, powerConstruct = true} = {}) {
        const team = room?.curSetList;
        if (!Array.isArray(team) || !room.curTeam) return null;

        const dex = room.curTeam.dex;

        return team.find((set) => {
            if (!set?.species || set === ignoreSet) return false;
            if (powerConstruct && toID(set.ability) === 'powerconstruct') return true;
            return isGodlyGiftRestricted(resolveGodSpecies(dex, set));
        }) || null;
    }

    // Each of the God's 6 base stats is donated to the matching team slot
    // (slot 0 gets HP, slot 1 Atk, ...). If nobody is a God, slot 1 is.
    function godlyGiftDonation(room, set) {
        const team = room?.curSetList;
        if (!room?.curTeam || !set || !Array.isArray(team) || !team.length) return null;
        if (!godlyGiftRestricted.size) return null; // banlist not loaded yet

        const index = team.indexOf(set);
        if (index < 0 || index > 5) return null;

        const godSet = findGodSet(room) || team[0];
        const godSpecies = resolveGodSpecies(room.curTeam.dex, godSet);
        if (!godSpecies) return null;

        const stat = STATS[index];
        return {stat, value: godSpecies.baseStats[stat]};
    }

    function godlyGiftBaseStats(room, set) {
        const species = room?.curTeam?.dex?.species?.get(set?.species);
        if (!species?.exists) return null;

        const stats = copy(species.baseStats);
        const donation = godlyGiftDonation(room, set);
        if (donation) stats[donation.stat] = donation.value;
        return stats;
    }

    // Returns `(species) => boolean` (true = illegal to add), or null if no God
    // has been picked yet. While the Pokémon chooser is open, the slot being
    // edited is ignored so the God itself can be swapped.
    function getGodlyGiftIllegalChecker(room) {
        if (!isGodlyGiftFormat(room) || !godlyGiftRestricted.size) return null;

        const ignoreSet = room.curChartName === 'pokemon' ? room.curSet : null;
        const godSet = findGodSet(room, {ignoreSet, powerConstruct: false});
        if (!godSet) return null;

        const godSpecies = resolveGodSpecies(room.curTeam.dex, godSet);
        if (!godSpecies) return null;

        const godId = godBaseId(godSpecies);
        return (species) => isGodlyGiftRestricted(species) && godBaseId(species) !== godId;
    }

    // ---------- in-battle stat guesser ----------

    // Mods the in-battle EV/nature guesser knows how to apply.
    const BATTLE_GUESSER_MODS = new Set([
        MOD.TIER_SHIFT, MOD.SCALEMONS, MOD.FLIPPED, MOD.THREE_FIFTY_CUP, MOD.FRANTIC_FUSIONS, MOD.NATURE_SWAP,
    ]);

    function patchBattleStatGuesserGetStat() {
        return patchMethod(window.BattleStatGuesser?.prototype, 'getStat', '__qolBattlePatched', (original) =>
                           function (stat, set, evOverride, natureOverride) {
            const callOriginal = () => original.call(this, stat, set, evOverride, natureOverride);
            if (!set?.species || !this.dex?.species?.get) return callOriginal();

            const mod = modFromFormat(this.formatid);
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
                    spe: species.baseStats.spe + Math.floor(donor.baseStats.spe / 4),
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

        if (
            !fmtHas(typed?.format, CONVERGENCE_FORMAT_ID, 'crossevolution') ||
            (type !== 'move' && type !== 'ability') ||
            !donors
        ) {
            return;
        }

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
                if (a.querySelector('.qol-mvf')) continue;
                const info = moveFilterRowInfo(entry.slice(8));
                if (!info) continue;

                a.innerHTML =
                    `<span class="col namecol qol-mvf">${bang}${info.label}</span> ` +
                    (info.iconsHtml
                     ? `<span class="col typecol" style="width:auto;white-space:nowrap">${info.iconsHtml}</span>`
                     : `<span class="col abilitydesccol">${info.descHtml}</span>`);
            } else if (bang && (entry.startsWith('type|') || entry.startsWith('category|'))) {
                const name = a.querySelector('.namecol');
                if (name && !name.dataset.qolNeg) {
                    name.dataset.qolNeg = '1';
                    name.insertBefore(document.createTextNode('!'), name.firstChild);
                }
            }
        }
    }

    function pokemonFilterRowLabel(rawId, negated) {
        const id = String(rawId).toLowerCase();
        const dex = getTeambuilderRoom()?.search?.engine?.dex;

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
                if (a.querySelector('.qol-pkf')) continue;
                const label = pokemonFilterRowLabel(id, negated);
                if (label) {
                    a.innerHTML =
                        `<span class="col namecol qol-pkf">${BattleLog.escapeHTML(label)}</span> ` +
                        '<span class="col abilitydesccol"></span>';
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

    const DOM_DECORATORS = [
        ['donor icons', decorateDonorIcons],
        ['move filter rows', decorateMoveFilterRows],
        ['pokemon filter rows', decoratePokemonFilterRows],
        ['move prio header', decorateMovePrioHeader],
    ];

    let domDecoratorsInstalled = false;
    function installDomDecorators() {
        if (domDecoratorsInstalled) return;
        domDecoratorsInstalled = true;

        let scheduled = false;

        // Runs at document-start, so observe documentElement (body may not exist yet).
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
        }).observe(document.documentElement, {childList: true, subtree: true});
    }

    // ---------- patch everything ----------

    function patchEverything() {
        const results = [
            // server messages + banlists
            patchServerReceive(),
            patchTsaSearchLegality(),

            // search: results (legality, banlists, natdex, filters)
            patchPokemonSearchResults(),
            patchPokemonFilter(),
            patchMoveSearchFilters(),
            patchSearchCacheInvalidation(),


            // search: ability + move pools per format
            patchAbilitySearchResults(),
            patchMoveSearchResults(),

            // search: query handling, rows, chips, sorting
            patchSearchEngine(),
            patchSearchRowText(),
            patchFilterChipText(),
            patchSearchSort(),
            patchSearchRenderer(),

            // teambuilder: stats, icons, chooser
            patchGetStat(),
            patchStatForm(),
            patchRenderSetTypeIcons(),
            patchChartSet(),
            patchMoveSearchSort(),
            patchMoveSortRowUi(),

            // battle
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
        isTierShiftFormat: (room) => getActiveMod(room) === MOD.TIER_SHIFT,
        isMixAndMegaFormat: (room) => getActiveMod(room) === MOD.MIX_AND_MEGA,
        isBadNBoostedFormat: (room) => getActiveMod(room) === MOD.BAD_N_BOOSTED,
        isScalemonsFormat: (room) => getActiveMod(room) === MOD.SCALEMONS,
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

    patchLoop();
    installNatureSwapCamomonsListener();
    installFusionNicknameListener();
    installDomDecorators();
    installCoverageSeparatorFix();
})();
