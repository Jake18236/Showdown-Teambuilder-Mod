// ==UserScript==
// @name         Pokémon Showdown Teambuilder QOL
// @author       jl
// @namespace    https://github.com/Jake18236/showdown-teambuilder-mod
// @version      2.0
// @description  Makes the Showdown Teambuilder better for some OMs
// @match        https://play.pokemonshowdown.com/*
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/Jake18236/showdown-teambuilder-mod/main/showdown-teambuilder.user.js
// @downloadURL  https://raw.githubusercontent.com/Jake18236/showdown-teambuilder-mod/main/showdown-teambuilder.user.js
// ==/UserScript==


(function () {
    'use strict';

    const LOG = '[Teambuilder QOL]';

    // ============================================================
    // CONSTANTS
    // ============================================================

    const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
    const BOOSTABLE_STATS = STATS.slice(1);// everything but hp

    const MOD = {
        TIER_SHIFT: 'tierShift',
        MIX_AND_MEGA: 'mixAndMega',
        BAD_N_BOOSTED: 'badNBoosted',
        GODLY_GIFT: 'godlyGift',
    };

    const FORMAT_MOD_MAP = {
        gen9tiershift: MOD.TIER_SHIFT,
        gen9tiershiftaaa: MOD.TIER_SHIFT,
        gen9mixandmega: MOD.MIX_AND_MEGA,
        gen9badnboosted: MOD.BAD_N_BOOSTED,
        // gen9godlygift and gen9tiershiftaaa are handled separately below
        // (they each need a side effect: fetching their server-side banlist).
    };

    // ============================================================
    // SHARED STATE
    // ============================================================

    let tsaBanlist = new Set();
    let tsaBanlistLoaded = false;
    let tsaBanlistRequestSent = false;

    let godlyGiftRestricted = new Set();
    let godlyGiftRestrictedLoaded = false;
    let godlyGiftRequestSent = false;

    // ============================================================
    // ROOM / FORMAT HELPERS
    // ============================================================

    function getTeambuilderRoom() {
        return window.app?.rooms?.teambuilder || null;
    }

    function getActiveTeambuilderRoom() {
        return getTeambuilderRoom() || (window.room?.curTeam ? window.room : null);
    }

    // Godly Gift's Restricted list and Tier Shift AAA's banlist both live
    // server-side only (they aren't shipped in the client's dex data), so
    // checking "is this format active" also kicks off that fetch the first
    // time it's needed.
    function isGodlyGiftFormat(room) {
        const active = room?.curTeam?.format === 'gen9godlygift';

        if (active && !godlyGiftRestrictedLoaded && !godlyGiftRequestSent) {
            requestGGBanlist();
        }

        return active;
    }

    function isTierShiftAAAFormat(room) {
        const active = room?.curTeam?.format === 'gen9tiershiftaaa';

        if (active && !tsaBanlistLoaded && !tsaBanlistRequestSent) {
            requestTSABanlist();
        }

        return active;
    }

    function getActiveMod(room = getActiveTeambuilderRoom()) {
        const format = room?.curTeam?.format;

        if (format === 'gen9godlygift') {
            isGodlyGiftFormat(room);
            return MOD.GODLY_GIFT;
        }

        if (format === 'gen9tiershiftaaa') {
            isTierShiftAAAFormat(room);
        }

        return FORMAT_MOD_MAP[format] || null;
    }

    // ============================================================
    // SERVER BANLISTS (Tier Shift AAA / Godly Gift)
    // ============================================================

    function requestTSABanlist() {
        if (tsaBanlistLoaded || tsaBanlistRequestSent) return;
        if (!window.app || typeof app.send !== 'function') return;

        tsaBanlistRequestSent = true;
        app.send('/tier tiershiftaaa');
    }

    function requestGGBanlist() {
        if (godlyGiftRestrictedLoaded || godlyGiftRequestSent) return;
        if (!window.app || typeof app.send !== 'function') return;

        godlyGiftRequestSent = true;
        app.send('/tier godly gift');
    }

    // Both banlists come back as an HTML `/raw` blob with a
    // "<Section> - a, b, c" line buried in the text content.
    function parseNameListFromHtml(html, sectionHeader, listLabel) {
        if (!html || !html.includes(sectionHeader)) return null;

        const doc = new DOMParser().parseFromString(html, 'text/html');
        const text = doc.body.textContent || '';
        const match = text.match(new RegExp(`${listLabel}\\s*-\\s*(.*)`, 's'));

        if (!match) return null;

        const ids = new Set();

        for (const name of match[1].split(',').map((n) => n.trim()).filter(Boolean)) {
            const species = Dex.species.get(name);
            if (species?.exists) ids.add(species.id);
        }

        return ids;
    }

    function parseTSABanlist(html) {
        const banned = parseNameListFromHtml(html, '[Gen 9] Tier Shift AAA', 'Bans');
        if (!banned) return false;

        tsaBanlist = banned;
        tsaBanlistLoaded = true;
        console.log(LOG, 'Loaded Tier Shift AAA banlist:', [...tsaBanlist]);
        return true;
    }

    function parseGodlyGiftRestricted(html) {
        const restricted = parseNameListFromHtml(html, '[Gen 9] Godly Gift', 'Restricted');
        if (!restricted) return false;

        godlyGiftRestricted = restricted;
        godlyGiftRestrictedLoaded = true;
        console.log(LOG, 'Loaded Godly Gift Restricted list:', [...godlyGiftRestricted]);
        return true;
    }

    // ============================================================
    // GENERIC PATCH HELPERS
    // ============================================================

    // Wraps target[key] exactly once. `wrap(original)` must return the
    // replacement function;it's tagged so re-running patchEverything() is
    // always a safe no-op.
    function patchMethod(target, key, tag, wrap) {
        if (!target || typeof target[key] !== 'function') return false;
        if (target[key][tag]) return true;

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
            if (Object.prototype.hasOwnProperty.call(proto, methodName)) {
                return proto;
            }

            proto = Object.getPrototypeOf(proto);
        }

        return null;
    }

    // Temporarily makes `dex.species.get` return `targetSpecies` with
    // `baseStats` swapped in whenever it's asked for that exact species,
    // for the duration of `fn`. This is how every mod fakes a stat change
    // without touching Showdown's real dex data.
    function withModifiedSpecies(dex, targetSpecies, baseStats, fn) {
        if (!dex?.species?.get || !targetSpecies) return fn();

        const originalGet = dex.species.get;
        const modified = Object.assign({}, targetSpecies, {
            baseStats: Object.assign({}, baseStats),
        });

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
        return withModifiedSpecies(dex, species, baseStats, fn);
    }

    // Same idea as withModifiedSpecies, but for call sites that read the
    // species via `pokemon.getSpecies()` instead of `dex.species.get()`.
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

    // ============================================================
    // TIER SHIFT
    // ============================================================

    function getTierShiftBoost(tier) {
        switch (tier) {
            case 'UU':
            case 'RUBL':
                return 15;
            case 'RU':
            case 'NUBL':
                return 20;
            case 'NU':
            case 'PUBL':
                return 25;
            case 'PU':
            case 'ZU':
            case 'ZUBL':
            case 'LC':
            case 'NFE':
                return 30;
            default:
                return 0;
        }
    }

    // Returns a full modified baseStats object, or null if this tier isn't
    // boosted (so callers can fall back to unmodified behavior).
    function tierShiftModifiedStats(species) {
        if (!species?.baseStats) return null;

        const boost = getTierShiftBoost(species.tier);
        if (!boost) return null;

        const stats = Object.assign({}, species.baseStats);
        for (const stat of BOOSTABLE_STATS) stats[stat] += boost;
        return stats;
    }

    function tierShiftBaseStats(dex, set) {
        const species = dex?.species?.get(set.species);
        if (!species?.exists) return null;
        return tierShiftModifiedStats(species);
    }

    // ============================================================
    // BAD 'N BOOSTED
    // ============================================================

    // Every base stat of 70 or lower is doubled.
    function badNBoostedModifiedStats(species) {
        const stats = Object.assign({}, species.baseStats);
        for (const stat of STATS) {
            if (stats[stat] <= 70) stats[stat] *= 2;
        }
        return stats;
    }

    function badNBoostedBaseStats(dex, set) {
        const species = dex?.species?.get(set.species);
        if (!species?.exists) return null;
        return badNBoostedModifiedStats(species);
    }

    // ============================================================
    // MIX AND MEGA
    // ============================================================

    // Figures out which forme an item turns a Pokémon into, and which
    // (non-mega) species that forme's stat changes are measured against.
    function resolveMegaForme(dex, item) {
        if (!item?.exists) return null;

        let formeName = item.megaStone ? Object.values(item.megaStone)[0] : null;

        // Non-Mega-Stone Mix and Mega items (Blue Orb, Lustrous Globe, etc.)
        // identify their forme through itemUser instead.
        if (!formeName && item.itemUser?.length) {
            formeName = item.itemUser[0];
        }

        if (!formeName) return null;

        const formeSpecies = dex.species.get(formeName);
        if (!formeSpecies?.exists) return null;

        let baseSpecies = formeSpecies;

        if (formeSpecies.name === 'Zygarde-Mega') {
            // Mix and Mega treats Zygarde-Complete as the "base" forme.
            baseSpecies = dex.species.get('Zygarde-Complete');
        } else if (formeSpecies.isMega && formeSpecies.battleOnly) {
            const battleOnly = Array.isArray(formeSpecies.battleOnly)
            ? formeSpecies.battleOnly[0]
            : formeSpecies.battleOnly;
            baseSpecies = dex.species.get(battleOnly);
        } else if (formeSpecies.baseSpecies) {
            baseSpecies = dex.species.get(formeSpecies.baseSpecies);
        }

        if (!baseSpecies?.exists) return null;

        return {formeSpecies, baseSpecies };
    }

    function mixAndMegaStatDelta(dex, item, stat) {
        const forme = resolveMegaForme(dex, item);
        if (!forme) return 0;
        return forme.formeSpecies.baseStats[stat] - forme.baseSpecies.baseStats[stat];
    }

    function mixAndMegaBaseStats(dex, set) {
        if (!set?.species || !set?.item || !dex) return null;

        const species = dex.species.get(set.species);
        const item = dex.items.get(set.item);
        if (!species?.exists || !item?.exists) return null;

        const forme = resolveMegaForme(dex, item);
        if (!forme) return null;

        const stats = Object.assign({}, species.baseStats);

        for (const stat of BOOSTABLE_STATS) {
            const delta = forme.formeSpecies.baseStats[stat] - forme.baseSpecies.baseStats[stat];
            stats[stat] = Math.max(1, Math.min(255, stats[stat] + delta));
        }

        return stats;
    }

    // Pre-Mega speed, shown as a note under the base stat column, using
    // Showdown's own stat formula (so it includes IVs/EVs/level/nature).
    function getPreMegaSpeed(set) {
        const dex = window.room?.curTeam?.dex;
        const species = dex?.species?.get(set?.species);
        if (!species?.exists) return 0;

        const base = species.baseStats.spe;
        const iv = set.ivs?.spe ?? 31;
        const ev = set.evs?.spe ?? 0;
        const level = set.level || 100;

        let speed = Math.floor((Math.floor(2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5;

        const nature = BattleNatures[set.nature];
        if (nature?.plus === 'spe') speed = Math.floor(speed * 1.1);
        else if (nature?.minus === 'spe') speed = Math.floor(speed * 0.9);

        return speed;
    }

    function updateMixAndMegaSpeedNote(room) {
        const note = room?.$chart?.find('.mnm-speed-note');
        if (!note?.length) return;

        const set = room.curSet;
        if (!set) return;

        note.find('.mnm-speed-value').text(getPreMegaSpeed(set));
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

        let note = chart.find('.mnm-speed-note');
        if (!note.length) {
            note = $(
                '<div class="mnm-speed-note" style="position:absolute;left:300px;top:300px;z-index:10;">' +
                'Note: Speed is <span class="mnm-speed-value">0</span> before Mega Evolving</div>'
            );
            chart.find('.basestatscol').after(note);
        }

        updateMixAndMegaSpeedNote(room);
        updateMixAndMegaSpeedNotePosition(room);
    }

    // ============================================================
    // GODLY GIFT
    // ============================================================

    // The "God" is whichever teammate is a Restricted Pokémon;if none is
    // Restricted yet, the first team slot is treated as the God.
    function findGodSet(room) {
        const team = room?.curSetList;
        if (!Array.isArray(team) || !team.length) return null;
        if (!godlyGiftRestricted.size) return null;

        const dex = room.curTeam.dex;

        for (const set of team) {
            if (!set?.species) continue;
            const species = dex.species.get(set.species);
            if (species?.exists && godlyGiftRestricted.has(species.id)) return set;
        }

        return team[0];
    }

    // Each of the God's 6 base stats is "donated" to the matching team slot
    // (slot 0 gets HP, slot 1 gets Atk, ...). Returns null for the God's own
    // slot, since it keeps its own stats.
    function godlyGiftDonation(room, set) {
        const team = room?.curSetList;
        if (!room?.curTeam || !set || !Array.isArray(team) || !team.length) return null;
        if (!godlyGiftRestricted.size) return null;

        const godSet = findGodSet(room);
        if (!godSet?.species) return null;

        const dex = room.curTeam.dex;
        const godSpecies = dex.species.get(godSet.species);
        if (!godSpecies?.exists) return null;

        // Godly Gift donates the God's BASIC form stats.
        let basicGodSpecies = godSpecies;
        if (godSpecies.baseSpecies) {
            const base = dex.species.get(godSpecies.baseSpecies);
            if (base?.exists) basicGodSpecies = base;
        }

        const index = team.indexOf(set);
        if (index < 0 || index > 5) return null;
        if (index === team.indexOf(godSet)) return null;

        const stat = STATS[index];
        return {stat, value: basicGodSpecies.baseStats[stat] };
    }

    function godlyGiftBaseStats(room, set) {
        const dex = room?.curTeam?.dex;
        const species = dex?.species?.get(set?.species);
        if (!species?.exists) return null;

        const stats = Object.assign({}, species.baseStats);
        const donation = godlyGiftDonation(room, set);
        if (donation) stats[donation.stat] = donation.value;

        return stats;
    }

    // For the Pokémon search / legality list: every Restricted Pokémon
    // other than the current God is illegal to add to the team.
    function getGodlyGiftIllegalIds(room) {
        if (!isGodlyGiftFormat(room)) return new Set();

        const team = room?.curSetList;
        if (!Array.isArray(team) || !godlyGiftRestricted.size) return new Set();

        const dex = room.curTeam.dex;
        let godId = null;

        for (const set of team) {
            if (!set?.species) continue;

            const species = dex.species.get(set.species);
            if (!species?.exists) continue;

            const baseSpecies = species.baseSpecies ? dex.species.get(species.baseSpecies) : species;

            if (baseSpecies?.exists && godlyGiftRestricted.has(baseSpecies.id)) {
                godId = baseSpecies.id;
                break;
            }
        }

        if (!godId) return new Set();

        const illegal = new Set();
        for (const id of godlyGiftRestricted) {
            if (id !== godId) illegal.add(id);
        }
        return illegal;
    }

    // ============================================================
    // MOD DISPATCH
    // ============================================================

    // Single place that knows how to compute a fully modified baseStats
    // object for whichever mod is active. Every patch below goes through
    // this instead of re-implementing per-mod branches.
    function computeModBaseStats(mod, {dex, set, room }) {
        switch (mod) {
            case MOD.TIER_SHIFT:
                return tierShiftBaseStats(dex, set);
            case MOD.BAD_N_BOOSTED:
                return badNBoostedBaseStats(dex, set);
            case MOD.MIX_AND_MEGA:
                return mixAndMegaBaseStats(dex, set);
            case MOD.GODLY_GIFT:
                return godlyGiftBaseStats(room, set);
            default:
                return null;
        }
    }

    // Stats used when sorting/rendering the Pokémon search list. Only
    // Tier Shift and Bad 'n Boosted change what's shown there.
    function searchListStats(species, mod) {
        if (mod === MOD.BAD_N_BOOSTED) return badNBoostedModifiedStats(species);
        if (mod === MOD.TIER_SHIFT) return tierShiftModifiedStats(species) || species.baseStats;
        return species.baseStats;
    }


    // ============================================================
    // POKEMON SEARCH: /ds-STYLE TYPE EFFECTIVENESS FILTERS
    // ============================================================

    function toSearchId(text) {
        return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    }

    // ------------------------------------------------------------
    // "!" (negated / NOT) filter support
    //
    // A negated filter is stored as an ordinary [type, value] filter
    // tuple, except `type` has a leading "!" (e.g. ['!type', 'Fire'],
    // ['!weak', 'Fire']). That keeps every existing consumer of
    // `this.filters` (dedup checks, the "value".split(':') round-trip
    // used to remove a filter chip, etc.) working unmodified, since
    // it's still just a two-element array of strings.
    // ------------------------------------------------------------

    const ALLOWED_POKEMON_FILTER_TYPES =
          ['type', 'move', 'ability', 'egggroup', 'tier', 'weak', 'resists'];

    function isNegatedFilterType(type) {
        return typeof type === 'string' && type.charCodeAt(0) === 33;// '!'
    }

    function negatedFilterType(type) {
        return isNegatedFilterType(type) ? type : '!' + type;
    }

    function baseFilterType(type) {
        return isNegatedFilterType(type) ? type.slice(1) : type;
    }

    // Mirrors the per-type normalization DexSearch#addFilter does
    // natively, so a negated filter chip displays/dedupes the same
    // way its positive counterpart would.
    function normalizePokemonFilterValue(engine, type, value) {
        if (type === 'type' || type === 'weak' || type === 'resists') {
            return engine.capitalizeFirst(value);
        }
        if (type === 'move') {
            return toID(value);
        }
        if (type === 'ability') {
            return engine.dex.abilities.get(value).name;
        }
        if (type === 'tier') {
            const tierTable = {uber: 'Uber', caplc: 'CAP LC', capnfe: 'CAP NFE'};
            const id = toID(value);
            return tierTable[id] || id.toUpperCase();
        }
        return value;
    }

    // Pushes a (possibly negated) pokemon-search filter chip, reusing
    // the same "already have this filter" dedup rule the native
    // addFilter uses. A negated and a positive filter of the same
    // type/value are treated as distinct chips.
    function pushPokemonFilter(engine, type, value, negated) {
        if (!engine.filters) engine.filters = [];

        const storedType = negated ? negatedFilterType(type) : type;
        if (engine.sortCol === type) engine.sortCol = null;

        for (const filter of engine.filters) {
            if (filter[0] === storedType && filter[1] === value) {
                return true;
            }
        }

        engine.filters.push([storedType, value]);
        engine.results = null;
        engine.__qolEffectivenessMode = null;
        engine.__qolNegateMode = false;

        return true;
    }

    // Validates + normalizes `[type, value]` the way native addFilter
    // would, then stores it (negated or not).
    function addPokemonSearchFilter(engine, type, value, negated) {
        if (type === 'weak' || type === 'resists') {
            const target = engine.capitalizeFirst(value);
            if (!window.BattleTypeChart?.[toID(target)]) return false;
            return pushPokemonFilter(engine, type, target, negated);
        }

        if (!ALLOWED_POKEMON_FILTER_TYPES.includes(type)) return false;

        const normalized = normalizePokemonFilterValue(engine, type, value);
        return pushPokemonFilter(engine, type, normalized, negated);
    }

    function resolveTypeName(dex, text) {
        const id = toSearchId(text);
        if (!id) return null;

        const typeChart = window.BattleTypeChart || {};
        for (const typeName of Object.keys(typeChart)) {
            if (toSearchId(typeName) === id) return typeName;
        }

        const type = dex?.types?.get?.(text);
        if (type?.exists || type?.name) return type.name || text;

        return null;
    }

    function resolveEffectivenessTarget(dex, text) {
        const typeName = resolveTypeName(dex, text);
        if (typeName) return typeName;

        const move = dex?.moves?.get?.(text);
        if (!move?.exists) return null;
        if (move.category === 'Status') return null;

        return move.name || move.id;
    }

    function parseEffectivenessSearch(query, dex) {
        const match = String(query || '').trim().match(/^(resists|weak)\s+(.+)$/i);
        if (!match) return null;

        const target = resolveEffectivenessTarget(dex, match[2].trim());
        if (!target) return null;

        return {kind: match[1].toLowerCase(), target };
    }

    function pokemonMatchesEffectiveness(dex, species, searchKind, target) {
        if (!species?.types?.length) return false;

        const typeChart = window.BattleTypeChart;
        if (!typeChart) return false;

        // Resolve target to an attacking type.
        const move = dex?.moves?.get?.(target);

        const attackingType = move?.exists
        ? move.type
        : resolveTypeName(dex, target);

        if (!attackingType) return false;

        // BattleTypeChart uses lowercase IDs for its outer keys,
        // but damageTaken uses capitalized type names.
        const attackingTypeName =
              String(attackingType).charAt(0).toUpperCase() +
              String(attackingType).slice(1).toLowerCase();

        let effectiveness = 1;

        for (const defenderType of species.types) {
            const defenderId = toSearchId(defenderType);
            const defenderChart = typeChart[defenderId];

            if (!defenderChart?.damageTaken) {
                return false;
            }

            const chartValue =
                  defenderChart.damageTaken[attackingTypeName];

            if (chartValue === undefined) {
                return false;
            }

            // Showdown damageTaken values:
            // 0 = neutral
            // 1 = super-effective
            // 2 = resisted
            // 3 = immune

            if (chartValue === 3) {
                effectiveness = 0;
                break;
            }

            if (chartValue === 1) {
                effectiveness *= 2;
            } else if (chartValue === 2) {
                effectiveness *= 0.5;
            }
        }

        if (searchKind === 'weak') {
            return effectiveness > 1;
        }

        if (searchKind === 'resists') {
            return effectiveness < 1;
        }

        return false;
    }

    function patchEffectivenessFilterText() {
        const search = getTeambuilderRoom()?.search;
        if (!search) return false;

        const proto = findPrototypeWithMethod(search, 'getFilterText');
        if (!proto) return false;

        return patchMethod(
            proto,
            'getFilterText',
            '__qolEffectivenessFilterTextPatched',
            (original) =>
            function (q) {
                let buf = '<p>Filters: ';

                for (let i = 0;i < this.filters.length;i++) {
                    const filter = this.filters[i];
                    const negated = isNegatedFilterType(filter[0]);
                    const kind = baseFilterType(filter[0]);
                    let text = filter[1];

                    if (kind === 'weak') {
                        text = 'Weak ' + text.charAt(0).toUpperCase() + text.slice(1);
                    } else if (kind === 'resists') {
                        text = 'Resists ' + text.charAt(0).toUpperCase() + text.slice(1);
                    } else {
                        if (kind === 'move') {
                            text = Dex.moves.get(text).name;
                        }
                        if (kind === 'pokemon') {
                            text = Dex.species.get(text).name;
                        }
                    }

                    if (negated) text = '!' + text;

                    buf += '<button class="filter" value="' +
                        BattleLog.escapeHTML(filter.join(':')) +
                        '">' +
                        text +
                        ' <i class="fa fa-times-circle"></i></button> ';
                }

                if (!q) {
                    buf += '<small style="color: #888">(backspace = delete filter)</small>';
                }

                return buf + '</p>';
            }
        );
    }

    function patchEffectivenessSetType() {
        const search = getTeambuilderRoom()?.search?.engine;
        if (!search) return false;

        const proto = findPrototypeWithMethod(search, 'setType');
        if (!proto) return false;

        return patchMethod(
            proto,
            'setType',
            '__qolEffectivenessSetTypePatched',
            (original) =>
            function (...args) {
                this.__qolEffectivenessMode = null;
                this.__qolNegateMode = false;
                this.query = '';
                this.exactMatch = false;

                return original.apply(this, args);
            }
        );
    }

    // ============================================================
    // PATCH: server message receiver (banlists)
    // ============================================================

    function patchServerReceive() {
        return patchMethod(window.app, 'receive', '__qolPatched', (original) =>
                           function (data) {
            try {
                if (typeof data === 'string' && data.includes('/raw ')) {
                    const match = data.match(/\|\/raw (.*)/);

                    let isBanlistResponse = false;

                    if (match && data.includes('[Gen 9] Tier Shift AAA')) {
                        parseTSABanlist(match[1]);
                        isBanlistResponse = true;
                    }

                    if (match && data.includes('[Gen 9] Godly Gift')) {
                        parseGodlyGiftRestricted(match[1]);
                        isBanlistResponse = true;
                    }

                    // The banlist has been parsed and saved.
                    // Prevent the raw response from being displayed.
                    if (isBanlistResponse) {
                        return;
                    }
                }
            } catch (e) {
                console.error(LOG, 'Failed to parse server data:', e);
            }

            // Allow all other server messages to work normally.
            return original.apply(this, arguments);
        }
                          );
    }

    // ============================================================
    // PATCH: Pokémon search legality (Tier Shift AAA banlist)
    // ============================================================

    function patchTsaSearchLegality() {
        const proto = window.BattlePokemonSearch?.prototype;

        return patchMethod(proto, 'getBaseResults', '__qolPatched', (original) =>
                           function () {
            if (this.format !== 'tiershiftaaa') return original.call(this);

            // Make sure we've asked the server for the current banlist;
            // this is a no-op once it's loaded (or already requested).
            requestTSABanlist();

            // Base legal pool must come from Gen 9, not TSA's own (stale)
            // format data, then we apply TSA's Pokémon bans on top.
            const savedFormat = this.format;
            this.format = 'gen9';
            const gen9Results = original.call(this);
            this.format = savedFormat;

            return gen9Results.filter((result) => {
                if (result[0] !== this.searchType) return true;

                const id = result[1];
                if (tsaBanlist.has(id)) return false;

                // Arceus is banned as a species, so every forme is banned.
                const species = this.dex.species.get(id);
                return species?.baseSpecies !== 'Arceus';
            });
        }
                          );
    }

    // ============================================================
    // PATCH: Pokémon search legality (Godly Gift Restricted list)
    // ============================================================

    function patchGodlyGiftSearchLegality() {
        const search = getTeambuilderRoom()?.search?.engine?.typedSearch;
        const proto = findPrototypeWithMethod(search, 'getResults');

        return patchMethod(proto, 'getResults', '__qolGodlyGiftPatched', (original) =>
                           function (filters, sortCol, reverseSort) {
            const result = original.call(this, filters, sortCol, reverseSort);
            if (this.format !== 'godlygift') return result;

            const room = getTeambuilderRoom();
            const illegalIds = room && getGodlyGiftIllegalIds(room);
            if (!illegalIds?.size) return result;

            const legal = [];
            const illegal = [];

            for (const row of result) {
                if (row[0] !== this.searchType) {
                    legal.push(row);
                    continue;
                }

                const id = row[1];
                const isIllegal = [...illegalIds].some(
                    (bannedId) => id === bannedId || id.startsWith(bannedId)
                );

                (isIllegal ? illegal : legal).push(row);
            }

            if (!illegal.length) return result;

            return legal.concat([['header', TL(['Illegal results'])], ...illegal]);
        }
                          );
    }

    // ============================================================
    // PATCH: Pokemon search filters (resists / weak)
    // ============================================================

    function patchEffectivenessSearchFilters() {
        const proto = window.BattlePokemonSearch?.prototype;

        return patchMethod(proto, 'filter', '__qolEffectivenessPatched', (original) =>
                           function (row, filters) {
            if (!filters?.length) {
                return original.call(this, row, filters);
            }

            if (row[0] !== 'pokemon') {
                return true;
            }

            const species = this.dex.species.get(row[1]);
            if (!species?.exists) return false;

            // Every filter (positive or negated) is tested one at a
            // time, reusing the native single-filter logic for the
            // ordinary types (type/move/ability/egggroup/tier) and
            // our own logic for weak/resists. A negated entry just
            // flips whether a match passes or fails that one
            // condition; everything still has to hold at once.
            for (const [rawType, target] of filters) {
                const negated = isNegatedFilterType(rawType);
                const type = negated ? baseFilterType(rawType) : rawType;

                const matches = (type === 'weak' || type === 'resists')
                    ? pokemonMatchesEffectiveness(this.dex, species, type, target)
                    : original.call(this, row, [[type, target]]);

                if (negated ? matches : !matches) {
                    return false;
                }
            }

            return true;
        }
                          );
    }

    function patchEffectivenessSearchBar() {
        const search = getTeambuilderRoom()?.search?.engine;
        if (!search) return false;

        const proto = findPrototypeWithMethod(search, 'find');
        if (!proto) return false;

        return patchMethod(
            proto,
            'find',
            '__qolEffectivenessPatched',
            (original) =>
            function (query) {
                const typedSearch = this.typedSearch;

                if (typedSearch?.searchType !== 'pokemon') {
                    this.__qolEffectivenessMode = null;
                    this.__qolNegateMode = false;
                    return original.call(this, query);
                }

                const rawQuery = String(query || '').trim();

                // "!" is a per-token modifier, not a toggle: it only
                // affects the filter tag you're about to add, not
                // filter chips you've already added.
                const negateQuery = rawQuery.startsWith('!');
                const searchQuery = negateQuery ? rawQuery.slice(1).trim() : rawQuery;

                const match = searchQuery.match(
                    /^(weak|resists)(?:\s+(.*))?$/i
                );

                // Anything that isn't "weak"/"resists" (negated or not).
                if (!match) {
                    this.__qolEffectivenessMode = null;

                    if (!negateQuery) {
                        this.__qolNegateMode = false;
                        this.exactMatch = false;
                        return original.call(this, query);
                    }

                    // "!" or "!<type/ability/move>": native find() would
                    // run toID() on this and silently drop the "!", so
                    // we bypass it and go straight to (our patched)
                    // textSearch with the raw query.
                    this.__qolNegateMode = true;
                    const cacheKey = `!:${toSearchId(searchQuery)}`;

                    if (this.query === cacheKey && this.results) {
                        return false;
                    }

                    this.query = cacheKey;
                    this.exactMatch = true;
                    this.results = this.textSearch(rawQuery);
                    this.selection = this.getFirstResultIndex();

                    return true;
                }

                const mode = match[1].toLowerCase();
                const partial = (match[2] || '').trim();

                this.__qolNegateMode = negateQuery;

                const cacheKey =
                      `${negateQuery ? '!' : ''}${mode}:${toSearchId(partial)}`;

                if (this.query === cacheKey && this.results) {
                    return false;
                }

                this.query = cacheKey;
                this.exactMatch = true;

                // textSearch() now handles partial matching.
                this.results = this.textSearch(rawQuery);

                this.selection = this.getFirstResultIndex();

                return true;
            }
        );
    }

    function patchEffectivenessAddFilter() {
        const search = getTeambuilderRoom()?.search?.engine;
        if (!search) return false;

        const proto = findPrototypeWithMethod(search, 'addFilter');
        if (!proto) return false;

        return patchMethod(
            proto,
            'addFilter',
            '__qolEffectivenessAddFilterPatched',
            (original) =>
            function (entry) {
                if (this.typedSearch?.searchType !== 'pokemon') {
                    return original.call(this, entry);
                }

                // A type was selected from our "Weak to" / "Resists to"
                // menu (possibly while typing a negated "!weak ..." query).
                if (this.__qolEffectivenessMode && entry?.[0] === 'type') {
                    return addPokemonSearchFilter(
                        this,
                        this.__qolEffectivenessMode,
                        entry[1],
                        this.__qolNegateMode
                    );
                }

                const rawType = entry?.[0];

                // A row (type/move/ability/egggroup/tier) picked while a
                // "!<query>" search was active, or a filter that's
                // already explicitly negated (e.g. toggled via a bare
                // "!" and then re-added).
                if (rawType && (isNegatedFilterType(rawType) || this.__qolNegateMode)) {
                    const type = baseFilterType(rawType);
                    return addPokemonSearchFilter(this, type, entry[1], true);
                }

                // Directly supplied positive custom filters.
                if (rawType === 'weak' || rawType === 'resists') {
                    return addPokemonSearchFilter(this, rawType, entry[1], false);
                }

                return original.call(this, entry);
            }
        );
    }

    function patchEffectivenessTextSearch() {
        const search = getTeambuilderRoom()?.search?.engine;
        if (!search) return false;

        const proto = findPrototypeWithMethod(search, 'textSearch');
        if (!proto) return false;

        return patchMethod(
            proto,
            'textSearch',
            '__qolEffectivenessTextSearchPatched',
            (original) =>
            function (query) {
                if (this.typedSearch?.searchType !== 'pokemon') {
                    return original.call(this, query);
                }

                const rawQuery = String(query || '').trim();
                const negated = rawQuery.startsWith('!');
                const q = (negated ? rawQuery.slice(1) : rawQuery).trim().toLowerCase();

                const match = q.match(/^(weak|resists)(?:\s+(.*))?$/);

                // Not "weak"/"resists" (negated or not).
                if (!match) {
                    this.__qolEffectivenessMode = null;

                    if (!negated) {
                        this.__qolNegateMode = false;
                        return original.call(this, query);
                    }

                    this.__qolNegateMode = true;

                    // Bare "!": start with every type, same as typing
                    // "weak"/"resists" alone lists every type. Abilities
                    // and moves only show up once you start typing
                    // their name — there are too many to list at once.
                    if (!q) {
                        const typeChart = window.BattleTypeChart;
                        const results = [['header', 'Not']];

                        if (typeChart) {
                            for (const typeName of Object.keys(typeChart)) {
                                results.push([
                                    'type',
                                    toSearchId(typeName),
                                    0,
                                    typeName.length,
                                ]);
                            }
                        }

                        this.results = results;
                        this.exactMatch = true;

                        return results;
                    }

                    // "!<type/ability/move>": reuse Showdown's own
                    // suggestion matching for the text after the "!",
                    // keeping only type/ability/move rows. No Pokémon
                    // (there's no supported way to exclude one named
                    // Pokémon here, only a filter criterion) and no
                    // egg group/tier (not something this negates).
                    const suggestions = (original.call(this, q) || []).filter(
                        ([rowType]) =>
                            rowType === 'type' ||
                            rowType === 'ability' ||
                            rowType === 'move'
                    );

                    this.results = suggestions;
                    this.exactMatch = true;

                    return suggestions;
                }

                const mode = match[1];
                const partial = (match[2] || '').trim();

                const typeChart = window.BattleTypeChart;

                if (!typeChart) {
                    this.__qolEffectivenessMode = null;
                    this.__qolNegateMode = false;
                    return original.call(this, query);
                }

                const results = [
                    [
                        'header',
                        (negated ? 'Not ' : '') + (mode === 'weak' ? 'Weak' : 'Resists')
                    ],
                ];

                for (const typeName of Object.keys(typeChart)) {
                    const typeId = toSearchId(typeName);

                    // Match the typed partial type name.
                    if (partial && !typeId.startsWith(toSearchId(partial))) {
                        continue;
                    }

                    results.push([
                        'type',
                        typeId,
                        0,
                        typeName.length,
                    ]);
                }

                this.__qolEffectivenessMode = mode;
                this.__qolNegateMode = negated;

                this.results = results;
                this.exactMatch = true;

                return results;
            }
        );
    }

    function patchEffectivenessSelectResult() {
        const search = getTeambuilderRoom()?.search?.engine;
        if (!search) return false;

        const proto = findPrototypeWithMethod(search, 'selectResult');
        if (!proto) return false;

        return patchMethod(
            proto,
            'selectResult',
            '__qolEffectivenessSelectResultPatched',
            (original) =>
            function (index) {
                const mode = this.__qolEffectivenessMode;

                if (mode && this.results) {
                    const result = this.results[
                        index === undefined ? this.selection : index
                    ];

                    if (result?.[0] === 'type') {
                        const filter = [
                            mode,
                            this.capitalizeFirst(result[1])
                        ];

                        if (this.addFilter(filter)) {
                            this.__qolEffectivenessMode = null;
                            this.selection = 0;
                            return null;
                        }
                    }
                }

                return original.call(this, index);
            }
        );
    }

    function patchEffectivenessResultNames() {
        const search = getTeambuilderRoom()?.search?.engine;
        if (!search) return false;

        const proto = findPrototypeWithMethod(search, 'getResultName');
        if (!proto) return false;

        return patchMethod(
            proto,
            'getResultName',
            '__qolEffectivenessResultNamePatched',
            (original) =>
            function (result) {
                if (this.typedSearch?.searchType !== 'pokemon') {
                    return original.call(this, result);
                }

                const mode = this.__qolEffectivenessMode;

                if (mode && result?.[0] === 'type') {
                    const typeName = this.capitalizeFirst
                    ? this.capitalizeFirst(result[1])
                    : String(result[1]).charAt(0).toUpperCase() +
                          String(result[1]).slice(1);

                    const label = mode === 'weak' ? 'Weak' : 'Resists';
                    return this.__qolNegateMode
                        ? `Not ${label} ${typeName}`
                        : `${label} ${typeName}`;
                }

                // Plain type/ability/move suggestion while typing a
                // "!<query>" search (not the weak/resists sub-mode).
                if (
                    !mode &&
                    this.__qolNegateMode &&
                    (result?.[0] === 'type' || result?.[0] === 'ability' || result?.[0] === 'move')
                ) {
                    return '!' + original.call(this, result);
                }

                return original.call(this, result);
            }
        );
    }

    function patchEffectivenessTypeName() {
        const proto = window.BattleSearch?.prototype;
        if (!proto) return false;

        return patchMethod(
            proto,
            'renderRow',
            '__qolEffectivenessTypeNamePatched',
            (original) =>
            function (row, type, matchStart, matchEnd, errorMessage, attrs) {
                const html = original.call(
                    this,
                    row,
                    type,
                    matchStart,
                    matchEnd,
                    errorMessage,
                    attrs
                );

                if (this.engine?.typedSearch?.searchType !== 'pokemon') {
                    return html;
                }

                const mode = this.engine?.__qolEffectivenessMode;

                if (mode && type === 'type') {
                    const label = mode === 'weak' ? 'Weak' : 'Resists';
                    const prefix = this.engine?.__qolNegateMode
                    ? `!${label}`
                    : label;

                    return html.replace(
                        /(<span class="col namecol"><b>)([^<]+)(<\/b>)/,
                        `$1${prefix} $2$3`
                    );
                }

                // Plain type/ability/move row while typing a !<query> search.
                // Plain type/ability/move row while typing a !<query> search.
                if (
                    !mode &&
                    this.engine?.__qolNegateMode &&
                    (type === 'type' || type === 'ability' || type === 'move')
                ) {
                    const nameColumn = type === 'move'
                    ? 'movenamecol'
                    : 'namecol';

                    const pattern = new RegExp(
                        `(<span class="col ${nameColumn}">)`
                    );

                    return html.replace(
                        pattern,
                        (match, openingTag, offset, fullHtml) => {
                            // Avoid adding a second ! if this row was already prefixed.
                            const contentAfterTag = fullHtml.slice(
                                offset + openingTag.length
                            );

                            if (
                                contentAfterTag.startsWith('!') ||
                                contentAfterTag.startsWith('<b>!</b>')
                            ) {
                                return openingTag;
                            }

                            return `${openingTag}!`;
                        }
                    );
                }

                return html;
            }
        );
    }
    // ============================================================
    // PATCH: Pokémon search sort (Tier Shift / Bad 'n Boosted)
    // ============================================================

    function patchSearchSort() {
        const proto = window.BattlePokemonSearch?.prototype;

        return patchMethod(proto, 'sort', '__qolPatched', (original) =>
                           function (results, sortCol, reverseSort) {
            const mod = getActiveMod();

            if (mod !== MOD.TIER_SHIFT && mod !== MOD.BAD_N_BOOSTED) {
                return original.call(this, results, sortCol, reverseSort);
            }

            const order = reverseSort ? -1 : 1;
            const statsFor = (id) => searchListStats(this.dex.species.get(id), mod);

            if (STATS.includes(sortCol)) {
                return results.sort(
                    (a, b) => (statsFor(b[1])[sortCol] - statsFor(a[1])[sortCol]) * order
                );
            }

            if (sortCol === 'bst') {
                const bst = (stats) => STATS.reduce((sum, stat) => sum + stats[stat], 0);
                return results.sort((a, b) => (bst(statsFor(b[1])) - bst(statsFor(a[1]))) * order);
            }

            return original.call(this, results, sortCol, reverseSort);
        }
                          );
    }

    function patchCurrentEffectivenessSearch() {
        const room = getTeambuilderRoom();
        const search = room?.search;
        const engine = search?.engine;

        if (!engine) return false;

        patchEffectivenessSearchBar();
        patchEffectivenessTextSearch();
        patchEffectivenessAddFilter();
        patchEffectivenessSelectResult();
        patchEffectivenessResultNames();

        return true;
    }

    // ============================================================
    // PATCH: Pokémon search row display (Tier Shift / Bad 'n Boosted)
    // ============================================================

    function patchSearchRenderer() {
        const proto = window.BattleSearch?.prototype;

        return patchMethod(proto, 'renderPokemonRow', '__qolPatched', (original) =>
                           function (pokemon, matchStart, matchLength, errorMessage, attrs) {
            const mod = getActiveMod();

            if (!pokemon || (mod !== MOD.TIER_SHIFT && mod !== MOD.BAD_N_BOOSTED)) {
                return original.call(this, pokemon, matchStart, matchLength, errorMessage, attrs);
            }

            const shifted = Object.assign({}, pokemon, {
                baseStats: searchListStats(pokemon, mod),
            });

            return original.call(this, shifted, matchStart, matchLength, errorMessage, attrs);
        }
                          );
    }

    // ============================================================
    // PATCH: Teambuilder stat calculation (all 4 mods)
    // ============================================================

    function patchGetStat() {
        const proto = window.TeambuilderRoom?.prototype;

        return patchMethod(proto, 'getStat', '__qolPatched', (original) =>
                           function (stat, set, evOverride, natureOverride) {
            const callOriginal = () =>
            original.call(this, stat, set, evOverride, natureOverride);

            set = set || this.curSet;
            if (!set) return 0;

            const mod = getActiveMod(this);
            if (!mod) return callOriginal();

            const dex = this.curTeam?.dex;
            const baseStats = computeModBaseStats(mod, {dex, set, room: this });
            if (!baseStats) return callOriginal();

            return withSpeciesBaseStats(dex, set.species, baseStats, callOriginal);
        }
                          );
    }

    // ============================================================
    // PATCH: in-battle stat guesser (Tier Shift only)
    // ============================================================

    function patchBattleStatGuesserGetStat() {
        const proto = window.BattleStatGuesser?.prototype;

        return patchMethod(proto, 'getStat', '__qolBattlePatched', (original) =>
                           function (stat, set, evOverride, natureOverride) {
            const callOriginal = () =>
            original.call(this, stat, set, evOverride, natureOverride);

            const formatid = String(this.formatid || '').toLowerCase();
            if (!formatid.includes('tiershift') || !set?.species || !this.dex?.species?.get) {
                return callOriginal();
            }

            const baseStats = tierShiftBaseStats(this.dex, set);
            if (!baseStats) return callOriginal();

            return withSpeciesBaseStats(this.dex, set.species, baseStats, callOriginal);
        }
                          );
    }

    // ============================================================
    // PATCH: in-battle EV/nature optimizer (Godly Gift only)
    // ============================================================

    function patchBattleStatGuesserGuess() {
        const proto = window.BattleStatGuesser?.prototype;

        return patchMethod(proto, 'guess', '__qolGodlyGiftPatched', (original) =>
                           function (set) {
            const callOriginal = () => original.call(this, set);

            const room = getTeambuilderRoom();
            if (!isGodlyGiftFormat(room) || !set?.species || !this.dex?.species?.get) {
                return callOriginal();
            }

            const baseStats = godlyGiftBaseStats(room, set);
            if (!baseStats) return callOriginal();

            return withSpeciesBaseStats(this.dex, set.species, baseStats, callOriginal);
        }
                          );
    }

    // ============================================================
    // PATCH: base stat column + Mix and Mega speed note
    // ============================================================

    function patchUpdateStatForm() {
        const proto = window.TeambuilderRoom?.prototype;

        return patchMethod(proto, 'updateStatForm', '__qolPatched', (original) =>
                           function (setGuessed) {
            const result = original.call(this, setGuessed);

            const mod = getActiveMod(this);
            if (!mod) return result;

            const set = this.curSet;
            if (!set?.species) return result;

            const dex = this.curTeam?.dex;
            const baseStats = computeModBaseStats(mod, {dex, set, room: this });
            if (!baseStats) return result;

            const rows = this.$chart.find('.basestatscol > div');
            if (!rows.length) return result;

            STATS.forEach((stat, i) => rows.eq(i + 1).find('b').text(baseStats[stat]));

            if (mod === MOD.MIX_AND_MEGA) {
                renderMixAndMegaSpeedNote(this);
            }

            return result;
        }
                          );
    }

    function patchStatSlide() {
        const proto = window.TeambuilderRoom?.prototype;

        return patchMethod(proto, 'statSlide', '__qolPatched', (original) =>
                           function (...args) {
            const result = original.apply(this, args);

            if (getActiveMod(this) === MOD.MIX_AND_MEGA) {
                requestAnimationFrame(() => updateMixAndMegaSpeedNote(this));
            }

            return result;
        }
                          );
    }

    // ============================================================
    // PATCH: in-battle hover speed range (Tier Shift / Mix and Mega)
    // ============================================================

    function patchTooltipSpeedRange() {
        const rooms = window.app?.rooms;
        if (!rooms) return false;

        let patchedAny = false;

        for (const room of Object.values(rooms)) {
            const tooltips = room?.tooltips;

            if (
                !tooltips ||
                tooltips.constructor?.name !== 'BattleTooltips' ||
                typeof tooltips.getSpeedRange !== 'function'
            ) {
                continue;
            }

            const proto = Object.getPrototypeOf(tooltips);

            const patched = patchMethod(proto, 'getSpeedRange', '__qolPatched', (original) =>
                                        function (pokemon, ...args) {
                const callOriginal = () => original.call(this, pokemon, ...args);

                if (!pokemon?.getSpecies) return callOriginal();

                const originalSpecies = pokemon.getSpecies();
                if (!originalSpecies?.baseStats) return callOriginal();

                const battle = this.battle;
                const rules = battle?.rules || {};
                const formatId = String(battle?.format?.id || '').toLowerCase();

                const isTierShift =
                      Object.keys(rules).some((r) => String(r).toLowerCase().includes('tier shift')) ||
                      formatId.includes('tiershift');
                const isMixAndMega = formatId.includes('mixandmega');

                if (isTierShift) {
                    const boost = getTierShiftBoost(originalSpecies.tier);
                    if (boost) {
                        const shifted = Object.assign({}, originalSpecies, {
                            baseStats: Object.assign({}, originalSpecies.baseStats, {
                                spe: originalSpecies.baseStats.spe + boost,
                            }),
                        });
                        return withOverriddenGetSpecies(pokemon, shifted, callOriginal);
                    }
                }

                if (isMixAndMega && pokemon.item) {
                    const item = battle.dex.items.get(pokemon.item);
                    const delta = mixAndMegaStatDelta(battle.dex, item, 'spe');

                    if (delta) {
                        const shifted = Object.assign({}, originalSpecies, {
                            baseStats: Object.assign({}, originalSpecies.baseStats, {
                                spe: originalSpecies.baseStats.spe + delta,
                            }),
                        });
                        return withOverriddenGetSpecies(pokemon, shifted, callOriginal);
                    }
                }

                return callOriginal();
            }
                                       );

            if (patched) patchedAny = true;
        }

        return patchedAny;
    }

    // ============================================================
    // PATCH EVERYTHING
    // ============================================================

    function patchEverything() {
        const results = [
            patchServerReceive(),
            patchTsaSearchLegality(),
            patchEffectivenessSearchFilters(),
            patchEffectivenessSearchBar(),

            patchGodlyGiftSearchLegality(),
            patchEffectivenessTextSearch(),
            patchEffectivenessAddFilter(),
            patchEffectivenessResultNames(),
            patchEffectivenessTypeName(),
            patchEffectivenessFilterText(),
            patchCurrentEffectivenessSearch(),
            patchEffectivenessSetType(),

            patchSearchSort(),
            patchSearchRenderer(),
            patchGetStat(),
            patchBattleStatGuesserGetStat(),
            patchBattleStatGuesserGuess(),
            patchUpdateStatForm(),
            patchStatSlide(),
            patchTooltipSpeedRange(),
        ];

        // Proactively fetch these two server-side banlists as soon as the
        // format is detected, so they're ready before the user opens the
        // search. This deliberately uses window.room (the room actually on
        // screen right now) rather than the persistent teambuilder room
        // reference — app.send() posts to whatever room is currently
        // focused, and app.rooms.teambuilder can still exist in the
        // background after the user has switched to another room/PM, which
        // would otherwise leak the /tier command into whatever's focused.
        if (isGodlyGiftFormat(window.room)) {
            requestGGBanlist();
        }
        if (isTierShiftAAAFormat(window.room)) {
            requestTSABanlist();
        }

        return results.every(Boolean);
    }

    // ============================================================
    // WAIT FOR SHOWDOWN TO FINISH LOADING
    // ============================================================

    let attempts = 0;
    const MAX_ATTEMPTS = 300;// ~30s at 100ms

    const patchInterval = setInterval(() => {
        attempts++;

        if (patchEverything()) {
            clearInterval(patchInterval);
            console.log(LOG, 'All patches applied');
            return;
        }

        if (attempts >= MAX_ATTEMPTS) {
            clearInterval(patchInterval);
            console.warn(LOG, 'Gave up patching after', MAX_ATTEMPTS, 'attempts');
        }
    }, 100);

    // ============================================================
    // DEBUG / CONSOLE API
    // ============================================================

    window.TierShiftTeambuilder = {
        getTierShiftBoost,
        getShiftedStat: (species, stat) => (tierShiftModifiedStats(species) || species?.baseStats)?.[stat],
        getShiftedBST: (species) => {
            const stats = tierShiftModifiedStats(species) || species?.baseStats;
            return stats ? STATS.reduce((sum, stat) => sum + stats[stat], 0) : 0;
        },
        getMixAndMegaBaseStats: (set) => mixAndMegaBaseStats(window.room?.curTeam?.dex, set),
        getGodlyGiftBaseStats: godlyGiftDonation,
        getGodlyGiftIllegalIds,
        parseGodlyGiftRestricted,
        isTierShiftFormat: (room) => getActiveMod(room) === MOD.TIER_SHIFT,
        isMixAndMegaFormat: (room) => getActiveMod(room) === MOD.MIX_AND_MEGA,
        isBadNBoostedFormat: (room) => getActiveMod(room) === MOD.BAD_N_BOOSTED,
        isGodlyGiftFormat,
        isTierShiftAAAFormat,
        requestTSABanlist,
        requestGGBanlist,
        patchBattleStatGuesser: patchBattleStatGuesserGetStat,
        parseEffectivenessSearch: (query) => parseEffectivenessSearch(query, window.room?.curTeam?.dex || Dex),
        pokemonMatchesEffectiveness,
        getBadNBoostedBaseStats: (set, room) => badNBoostedBaseStats(room?.curTeam?.dex, set),
        patch: patchEverything,
    };
})();
