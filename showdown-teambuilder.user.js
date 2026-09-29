// ==UserScript==
// @name         Pokémon Showdown Teambuilder QOL
// @author       jl
// @namespace    https://github.com/Jake18236/showdown-teambuilder-mod
// @version      3.0
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

    let pendingSilentTSARequest = false;
    let pendingSilentGGRequest = false;

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
    CROSS_EVOLUTION: 'crossEvolution',
};

    const FORMAT_MOD_MAP = {
        gen9tiershift: MOD.TIER_SHIFT,
        gen9tiershiftaaa: MOD.TIER_SHIFT,
        gen9mixandmega: MOD.MIX_AND_MEGA,
        gen9badnboosted: MOD.BAD_N_BOOSTED,
        gen9crossevolution: MOD.CROSS_EVOLUTION,
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
        pendingSilentTSARequest = true;
        app.send('/tier tiershiftaaa');
    }

    function requestGGBanlist() {
        if (godlyGiftRestrictedLoaded || godlyGiftRequestSent) return;
        if (!window.app || typeof app.send !== 'function') return;

        godlyGiftRequestSent = true;
        pendingSilentGGRequest = true;
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
    function hasPatchTag(fn, tag) {
    while (typeof fn === 'function') {
        if (fn[tag]) return true;
        fn = fn.__original;
    }
    return false;
}

function patchMethod(target, key, tag, wrap) {
    if (!target || typeof target[key] !== 'function') return false;
    if (hasPatchTag(target[key], tag)) return true;   // was: target[key][tag]

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

    // ------------------------------------------------------------
    // Special Mix and Mega items
    //
    // These don't behave like ordinary Mega Stones in the dex:
    // - Blue Orb -> Primal Kyogre
    // - Red Orb -> Primal Groudon
    // - Arceus Plates -> Arceus forme with that plate's type
    //
    // Keep these explicit because relying on itemUser/megaStone is
    // not reliable for these items.
    // ------------------------------------------------------------

    const MNM_ARCEUS_PLATE_TYPES = {
        flameplate: 'Fire',
        splashplate: 'Water',
        zapplate: 'Electric',
        meadowplate: 'Grass',
        icicleplate: 'Ice',
        fistplate: 'Fighting',
        toxicplate: 'Poison',
        earthplate: 'Ground',
        skyplate: 'Flying',
        mindplate: 'Psychic',
        insectplate: 'Bug',
        stoneplate: 'Rock',
        spookyplate: 'Ghost',
        dracoplate: 'Dragon',
        dreadplate: 'Dark',
        ironplate: 'Steel',
        pixieplate: 'Fairy',
    };
    function resolveSpecialMixAndMegaForme(dex, item) {
        if (!item?.id) return null;

        // Primal Kyogre
        if (item.id === 'blueorb') {
            const formeSpecies = dex.species.get('Kyogre-Primal');
            const baseSpecies = dex.species.get('Kyogre');

            if (formeSpecies?.exists && baseSpecies?.exists) {
                return {formeSpecies, baseSpecies};
            }
        }

        // Primal Groudon
        if (item.id === 'redorb') {
            const formeSpecies = dex.species.get('Groudon-Primal');
            const baseSpecies = dex.species.get('Groudon');

            if (formeSpecies?.exists && baseSpecies?.exists) {
                return {formeSpecies, baseSpecies};
            }
        }

        // Arceus Plates
        const plateType = MNM_ARCEUS_PLATE_TYPES[item.id];

        if (plateType) {
            const formeSpecies = dex.species.get(`Arceus-${plateType}`);
            const baseSpecies = dex.species.get('Arceus');

            if (formeSpecies?.exists && baseSpecies?.exists) {
                return {formeSpecies, baseSpecies};
            }
        }

        return null;
    }

    function resolveMegaForme(dex, item) {
        if (!item?.exists) return null;

        // --------------------------------------------------------
        // Special Mix and Mega items
        // --------------------------------------------------------
        const specialForme = resolveSpecialMixAndMegaForme(dex, item);

        if (specialForme) {
            return specialForme;
        }

        // --------------------------------------------------------
        // Normal Mega Stones
        // --------------------------------------------------------
        let formeName = item.megaStone
        ? Object.values(item.megaStone)[0]
        : null;

        // Other non-Mega-Stone Mix and Mega items that identify
        // their forme through itemUser.
        if (!formeName && item.itemUser?.length) {
            formeName = item.itemUser[0];
        }

        if (!formeName) return null;

        const formeSpecies = dex.species.get(formeName);
        if (!formeSpecies?.exists) return null;

        let baseSpecies = formeSpecies;

        if (formeSpecies.name === 'Zygarde-Mega') {
            // Mix and Mega treats Zygarde-Complete as the base forme.
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

        return {formeSpecies, baseSpecies};
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

    // Showdown already gives certain formes their forme-specific
    // stats (Zamazenta-Crowned, Palkia-Origin, etc.). For those,
    // compare the MnM forme against the actual species forme rather
    // than adding the forme's delta on top of an already-modified
    // species.
    const speciesBase = species.baseSpecies
        ? dex.species.get(species.baseSpecies)
        : species;

    for (const stat of BOOSTABLE_STATS) {
        const delta =
            forme.formeSpecies.baseStats[stat] -
            forme.baseSpecies.baseStats[stat];

        // If the selected Pokémon is already the same forme that
        // the item represents, don't apply its delta again.
        if (
            species.name === forme.formeSpecies.name ||
            species.name === forme.baseSpecies.name
        ) {
            continue;
        }

        stats[stat] = Math.max(
            1,
            Math.min(255, stats[stat] + delta)
        );
    }

    return stats;
}

    // ------------------------------------------------------------
    // Type / ability preview
    //
    // Ports the exact logic Showdown's sim uses server-side for this
    // format (data/mods/mixandmega/scripts.ts: getFormeChangeDeltas /
    // mutateOriginalSpecies) so the teambuilder can show the same
    // result the battle would actually produce, without needing to
    // touch the set's real (base) species or ability.
    //
    // Ability: Mix and Mega always replaces the holder's ability with
    // the forme's ability the moment it Mega Evolves - but the set's
    // own `ability` field still matters as the *starting* ability (the
    // turn(s) before Mega Evolving), so it's never overwritten; we only
    // show a "Will be X after Mega Evolving" preview, exactly like
    // native Mega-forme dex entries already do.
    //
    // Type: unlike ability, a type change is unconditional and has no
    // "before Mega Evolving" state worth preserving in the teambuilder
    // (the pre-evolution type is just whatever the base species already
    // shows), so this is applied directly to the displayed type icons.
    // ------------------------------------------------------------

    function mixAndMegaFutureAbility(dex, set) {
        if (!set?.species || !set?.item || !dex) return null;

        const species = dex.species.get(set.species);
        const item = dex.items.get(set.item);

        if (!species?.exists || !item?.exists) return null;

        // Showdown already applies the ability of these forme-based
        // transformations to the selected species. Don't display a
        // misleading "Ability after Mega Evolving" preview.
        if (
            species.battleOnly ||
            species.forme === 'Crowned' ||
            species.forme === 'Origin' ||
            species.forme === 'Primal'
        ) {
            return null;
        }

        const forme = resolveMegaForme(dex, item);
        return forme?.formeSpecies.abilities['0'] || null;
    }

    // Mirrors getFormeChangeDeltas()'s `type`/`formeType` computation.
    // `formeType === 'Primary'` is the only variant that changes how the
    // delta gets applied (see mixAndMegaModifiedTypes below); the sim's
    // other formeType values ('Mega'/'Primal'/'Crowned') only matter for
    // actually simulating the battle, not for what type is displayed.
    function mixAndMegaTypeDelta(baseSpecies, formeSpecies) {
        let type = null;
        let formeType = null;

        if (baseSpecies.name === 'Arceus' || baseSpecies.name === 'Silvally') {
            // Plates/Memories: the forme's primary type replaces the
            // holder's primary type outright, and any secondary type
            // the holder already has is kept.
            type = formeSpecies.types[0];
            formeType = 'Primary';
        } else if (formeSpecies.types.length > baseSpecies.types.length) {
            // Mono -> dual (e.g. Sceptilite): gain the new secondary type.
            type = formeSpecies.types[1];
        } else if (formeSpecies.types.length < baseSpecies.types.length) {
            // Dual -> mono (e.g. Aggronite): the holder gains the mega's
            // own (base) primary type as its new secondary type, unless
            // it already has that type (see the `types[0] === type` case
            // in mixAndMegaModifiedTypes, which then drops to mono).
            type = baseSpecies.types[0];
        } else if (formeSpecies.types[1] !== baseSpecies.types[1]) {
            // Same type count, different secondary (e.g. Altarianite).
            type = formeSpecies.types[1];
        } else if (formeSpecies.types[0] !== baseSpecies.types[0]) {
            // Same type count, different primary (rare).
            type = formeSpecies.types[0];
            formeType = 'Primary';
        }

        return {type, formeType };
    }

    // Applies the delta above onto the holder's own types, the same way
    // the sim's mutateOriginalSpecies() does. Returns null if there's no
    // resolvable forme (no mega-stone-like item equipped) at all, so
    // callers can fall back to the holder's own unmodified types.
    function mixAndMegaModifiedTypes(dex, set) {
        if (!set?.species || !set?.item || !dex) return null;

        const species = dex.species.get(set.species);
        const item = dex.items.get(set.item);
        if (!species?.exists || !item?.exists) return null;

        const forme = resolveMegaForme(dex, item);
        if (!forme) return null;

        const delta = mixAndMegaTypeDelta(forme.baseSpecies, forme.formeSpecies);
        const types = species.types.slice();

        if (delta.formeType === 'Primary') {
            const secondType = types[1];
            const result = [delta.type];
            if (secondType && secondType !== delta.type) result.push(secondType);
            return result;
        }

        if (!delta.type) return types;
        if (types[0] === delta.type) return [types[0]];
        return [types[0], delta.type];
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
                '<div class="mnm-speed-note" style="position:absolute;left:330px;top:350px;z-index:10;">' +
                'Speed is <span class="mnm-speed-value">0</span> before Mega Evolving</div>'
            );
            chart.find('.basestatscol').after(note);
        }

        updateMixAndMegaSpeedNote(room);
        updateMixAndMegaSpeedNotePosition(room);
    }

    // ============================================================
    // CROSS EVOLUTION
    // ============================================================

    function isNfe(species) {
        return species.nfe ?? (species.evos?.length > 0);
    }

    // Returns {species, cross, crossPrevo} if set.name is a legal cross-evolution
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
            const value =
                  ce.species.baseStats[stat] +
                  ce.cross.baseStats[stat] -
                  ce.crossPrevo.baseStats[stat];
            stats[stat] = Math.max(1, Math.min(255, value));
        }
        return stats;
    }

    function crossEvolutionTypes(dex, set) {
        const ce = resolveCrossEvolution(dex, set);
        if (!ce) return null;

        const types = ce.species.types.slice();
        if (ce.cross.types[0] !== ce.crossPrevo.types[0]) {
            types[0] = ce.cross.types[0];
        }
        if (ce.cross.types[1] !== ce.crossPrevo.types[1]) {
            types[1] = ce.cross.types[1] || ce.cross.types[0];
        }

        return types[0] === types[1] ? [types[0]] : types.filter(Boolean);
    }

    // Generalized withModifiedSpecies: swap arbitrary fields, not just baseStats.
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

    // Move/ability search results are cached per search instance; bust the
    // cache when the nickname (the cross-evo target) changes.
    function patchCrossEvolutionCacheBust(proto) {
        return patchMethod(proto, 'getResults', '__qolCEKeyPatched', (original) =>
                           function (...args) {
            if (this.format === 'crossevolution' && this.set) {
                const key = [
                    this.set.species || '',
                    this.set.name || '',
                    this.species || '',
                ].join('|');

                if (this.__qolCEKey !== key) {
                    this.__qolCEKey = key;
                    this.baseResults = null;
                    this.baseIllegalResults = null;
                }
            }

            return original.apply(this, args);
        }
                          );
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

    // Splits a flat result list into {header, rows} sections.
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
            if (wasSorted.get(s)) {
                s.rows.sort((a, b) => String(a[1]).localeCompare(String(b[1])));
            }
        }

        return sections.flatMap((s) => (s.header ? [s.header, ...s.rows] : s.rows));
    }

    function patchCrossEvolutionMoveSearch() {
        const proto = window.BattleMoveSearch?.prototype;

        const a = patchMethod(proto, 'getBaseResults', '__qolCEPatched', (original) =>
                              function () {
            const results = original.call(this);
            if (this.format !== 'crossevolution') return results;

            const ce = resolveCrossEvolution(this.dex, this.set);
            if (!ce) return results;

            const crossResults = withSearchSpecies(this, ce.cross.name, () => original.call(this));
            return mergeMoveResults(results, crossResults);
        }
                             );

        return a && patchCrossEvolutionCacheBust(proto);
    }

    // Abilities: show the target's abilities in the ability picker.
    function patchCrossEvolutionAbilitySearch() {
        const proto = window.BattleAbilitySearch?.prototype;

        const a = patchMethod(proto, 'getBaseResults', '__qolCEPatched', (original) =>
                              function () {
            if (this.format !== 'crossevolution') return original.call(this);

            const ce = resolveCrossEvolution(this.dex, this.set);
            if (!ce) return original.call(this);

            return withSpeciesOverrides(
                this.dex,
                ce.species,
                {abilities: Object.assign({}, ce.cross.abilities)},
                () => original.call(this)
            );
        }
                             );

        return a && patchCrossEvolutionCacheBust(proto);
    }

    function patchCrossEvolutionIntoSelect() {
        const proto = window.TeambuilderRoom?.prototype;

        return patchMethod(proto, 'chartSet', '__qolCEIntoPatched', (original) =>
                           function (val, selectNext) {
            const engine =
                  this.curChartName === 'pokemon' &&
                  getActiveMod(this) === MOD.CROSS_EVOLUTION
            ? this.search?.engine
            : null;

            const dex = this.curTeam?.dex;
            const intoId = engine ? getIntoFilterId(engine, 'into') : null;
            const fromId = engine ? getIntoFilterId(engine, 'from') : null;

            let nickname = null;

            if (intoId) {
                // "into X": the clicked mon is the base, X is the nickname.
                nickname = dex?.species?.get(intoId)?.name || null;
            } else if (fromId) {
                // "X into": X is the base, the clicked mon is the nickname.
                const base = dex?.species?.get(fromId);
                const clicked = dex?.species?.get(val);
                if (base?.exists && clicked?.exists) {
                    nickname = clicked.name;
                    val = base.name;
                }
            }

            const result = original.call(this, val, selectNext);
            if (!nickname) return result;

            const set = this.curSet;
            if (!set) return result;

            set.name = nickname;
            this.$('input[name=nickname]').val(nickname);
            this.save?.();

            ceLastNickname = null;
            scheduleCrossEvolutionRefresh(this, nickname);

            return result;
        }
                          );
    }

    // Refresh type icons + base stat column as soon as the nickname changes.
    // ============================================================
    // CROSS EVOLUTION UI REFRESH
    // ============================================================

    let ceRefreshFrame = null;
    let ceLastNickname = null;

    function refreshCrossEvolutionSet(room, nicknameOverride = null) {
        if (!room || getActiveMod(room) !== MOD.CROSS_EVOLUTION) return;

        const set = room.curSet;
        const dex = room.curTeam?.dex;

        if (!set?.species || !dex) return;

        // During live typing, Showdown may not have committed the nickname
        // to curSet.name yet. Use the input's current value instead.
        const name = nicknameOverride !== null
        ? nicknameOverride.trim()
        : String(set.name || '').trim();

        // Use a temporary view of the set so the CE calculations see the
        // nickname being typed without permanently modifying Showdown's set.
        const liveSet = name === set.name
        ? set
        : Object.assign({}, set, {name});

        const types =
              crossEvolutionTypes(dex, liveSet) ||
              dex.species.get(set.species)?.types ||
              [];

        // --------------------------------------------------------
        // Types
        // --------------------------------------------------------

        room.$('.setcell-typeicons').html(
            types.map(t => Dex.getTypeIcon(t)).join('')
        );

        // --------------------------------------------------------
        // Stats
        // --------------------------------------------------------

        // updateStatForm() normally reads curSet, so temporarily give
        // it the live nickname as well.
        const originalSet = room.curSet;

        room.curSet = liveSet;
        try {
            // Updates .basestatscol
            room.updateStatForm();

            // Updates the stat rows / graphs
            room.updateStatGraph();
        } finally {
            room.curSet = originalSet;
        }
        // --------------------------------------------------------
        // Search caches
        // --------------------------------------------------------

        const engine = room.search?.engine;

        if (engine) {
            for (const search of [
                engine.moveSearch,
                engine.abilitySearch,
            ]) {
                if (!search) continue;

                search.__qolCEKey = null;
                search.baseResults = null;
                search.baseIllegalResults = null;
            }
        }

        // --------------------------------------------------------
        // Refresh active search
        // --------------------------------------------------------

        const search = room.search;

        if (search) {
            if (typeof search.update === 'function') {
                search.update();
            } else if (typeof search.updateResults === 'function') {
                search.updateResults();
            }
        }
    }

    function scheduleCrossEvolutionRefresh(room, nickname = null) {
        if (!room) return;

        if (ceRefreshFrame !== null) {
            cancelAnimationFrame(ceRefreshFrame);
        }

        ceRefreshFrame = requestAnimationFrame(() => {
            ceRefreshFrame = null;

            if (
                getActiveTeambuilderRoom() !== room ||
                getActiveMod(room) !== MOD.CROSS_EVOLUTION
            ) {
                return;
            }

            const name = nickname !== null
            ? String(nickname).trim()
            : String(room.curSet?.name || '').trim();

            if (name === ceLastNickname) return;

            ceLastNickname = name;

            refreshCrossEvolutionSet(room, name);
        });
    }

    let ceNicknameListenerInstalled = false;

    function installCrossEvolutionNicknameListener() {
        if (ceNicknameListenerInstalled) return;
        ceNicknameListenerInstalled = true;

        const handler = (e) => {
            const input = e.target;

            if (
                !(input instanceof HTMLInputElement) ||
                input.name !== 'nickname'
            ) {
                return;
            }

            const room = getActiveTeambuilderRoom();

            if (
                !room ||
                getActiveMod(room) !== MOD.CROSS_EVOLUTION
            ) {
                return;
            }

            // IMPORTANT:
            // Use the input's value directly. Showdown does not necessarily
            // commit this value to curSet.name until blur/change.
            scheduleCrossEvolutionRefresh(room, input.value);
        };

        document.addEventListener('input', handler, true);
        document.addEventListener('change', handler, true);
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
            case MOD.CROSS_EVOLUTION:
                return crossEvolutionBaseStats(dex, set);
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
      ['type', 'move', 'ability', 'egggroup', 'tier', 'weak', 'resists', 'neutral',
       'natdex', 'fe', 'recovery', 'pivot', 'priority', 'into', 'from'];

    // ------------------------------------------------------------
    // Custom boolean/toggle filters: "natdex", "fe", "recovery",
    // "pivot", "priority". Unlike weak/resists these don't take a
    // target argument — typing the keyword and picking the single
    // suggestion just adds/removes the chip. Each maps to a display
    // label used both for the filter chip text and (via a swapped-in
    // "ability" row, since ability rows render as plain text with no
    // icon lookup) the search-suggestion row.
    //
    // IMPORTANT: the suggestion-row id for each of these MUST be
    // namespaced (CUSTOM_TOGGLE_PREFIX) rather than the bare key.
    // "natdex" in particular collides with a real Showdown dex/tier
    // id (the actual "[Gen 9] National Dex" tier/format), so an
    // un-namespaced row gets resolved by native code to that real
    // entry instead of our placeholder — which is why adding it (or
    // negating it) silently turned into a broken, always-empty
    // "tier: [Gen 9] National Dex" filter instead of our toggle.
    // ------------------------------------------------------------

    const CUSTOM_TOGGLE_FILTERS = {
        natdex: 'National Dex',
        fe: 'Fully Evolved',
        recovery: 'Recovery',
        pivot: 'Pivot',
        priority: 'Priority',
    };

    const CUSTOM_TOGGLE_PREFIX = 'is ';

    const INTO_PREFIX = 'Into ';

    // Returns the target species if `query` is "into <fully typed species>"
    // and we're in Cross Evolution; otherwise null.
    function parseIntoQuery(engine, query) {
        if (engine?.typedSearch?.format !== 'crossevolution') return null;

        const m = String(query || '').trim().match(/^into\s+(.+)$/i);
        if (!m) return null;

        const dex = engine.dex || engine.typedSearch?.dex;
        const species = dex?.species?.get(m[1].trim());
        if (!species?.exists || species.battleOnly || !species.prevo) return null;

        return species;
    }

    const FROM_PREFIX = 'From ';

    // "<fully typed NFE species> into" -> base species, else null.
    function parseFromQuery(engine, query) {
        if (engine?.typedSearch?.format !== 'crossevolution') return null;

        const m = String(query || '').trim().match(/^(.+?)\s+Into$/i);
        if (!m) return null;

        const dex = engine.dex || engine.typedSearch?.dex;
        const species = dex?.species?.get(m[1].trim());
        if (!species?.exists || species.battleOnly || !isNfe(species)) return null;

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

    // Cross-evolved view of `speciesLike` as if nicknamed after `targetId`,
    // or null if that isn't a legal cross evolution.
    function crossEvolveView(dex, speciesLike, targetId) {
        const target = dex?.species?.get(targetId);
        if (!speciesLike?.name || !target?.exists) return null;

        const set = {species: speciesLike.name, name: target.name};
        const ce = resolveCrossEvolution(dex, set);
        if (!ce) return null;

        return {
            baseStats: crossEvolutionBaseStats(dex, set),
            types: crossEvolutionTypes(dex, set),
            abilities: Object.assign({}, ce.cross.abilities),
        };
    }

    function isFullyEvolved(species) {
        if (!species) return false;
        return !species.evos || species.evos.length === 0;
    }

    // Per-dex cache of move IDs qualifying for each move-based custom
    // filter, so we don't re-scan the whole movedex per search row.
    const customToggleMoveIdCache = new WeakMap();

    function computeCustomToggleMoveIds(dex, kind) {
        const all = typeof dex?.moves?.all === 'function'
        ? dex.moves.all()
        : Object.values(window.BattleMovedex || {});

        switch (kind) {
            case 'recovery': {
                // Same recovery category used by Showdown's /ds implementation.
                // Life Dew is intentionally excluded for this userscript.
                const recoveryMoves = [
                    'healorder',
                    'junglehealing',
                    'milkdrink',
                    'moonlight',
                    'morningsun',
                    'recover',
                    'roost',
                    'shoreup',
                    'slackoff',
                    'softboiled',
                    'strengthsap',
                    'synthesis',
                    'wish',
                ];

                return recoveryMoves.filter((id) => {
                    const move = dex.moves.get(id);
                    return move?.exists;
                });
            }

            case 'pivot': {
                const pivotMoves = [
                    'uturn',
                    'voltswitch',
                    'flipturn',
                    'partingshot',
                    'chillyreception',
                    'teleport',
                    'shedtail',
                ];

                return pivotMoves.filter((id) => {
                    const move = dex.moves.get(id);
                    return move?.exists;
                });
            }

            case 'priority':
                return all
                    .filter((move) =>
                            move?.exists &&
                            move.category !== 'Status' &&
                            move.id !== 'bide' &&
                            move.priority > 0
                           )
                    .map((move) => move.id);

            default:
                return [];
        }
    }

    function getCustomToggleMoveIds(dex, kind) {
        if (!dex) return [];

        let byKind = customToggleMoveIdCache.get(dex);
        if (!byKind) {
            byKind = {};
            customToggleMoveIdCache.set(dex, byKind);
        }

        if (!byKind[kind]) {
            byKind[kind] = computeCustomToggleMoveIds(dex, kind);
        }

        return byKind[kind];
    }

    // `ctx` is the BattlePokemonSearch instance (`this` inside filter()),
    // `original` is native filter()'s un-patched implementation, so a
    // move-based toggle can be tested by reusing native 'move' filtering
    // logic for each qualifying move id.
    function pokemonMatchesCustomToggle(ctx, original, row, species, kind) {
        switch (kind) {
            case 'fe':
                return isFullyEvolved(species);

            case 'recovery':
            case 'pivot':
            case 'priority': {
                const moveIds = getCustomToggleMoveIds(ctx.dex, kind);
                return moveIds.some((moveId) =>
                    original.call(ctx, row, [['move', moveId]])
                );
            }

            default:
                return true;
        }
    }

    // A native suggestion row whose id (once run through toSearchId, the
    // same normalization used for our own keys) matches one of our
    // reserved keywords. "natdex" specifically collides with a real
    // Showdown tier/format id, so its own suggestions must be filtered
    // out of the native results — otherwise the user can end up
    // selecting the real (useless-here) entry instead of our toggle.
    function isReservedToggleCollisionRow(row) {
        if (!row) return false;
        const id = toSearchId(row[1]);
        return Object.prototype.hasOwnProperty.call(CUSTOM_TOGGLE_FILTERS, id);
    }

    // Suggestion rows for the custom toggle filters that (loosely)
    // prefix-match the given query. Reuses the 'ability' row type so
    // native renderRow/getResultName produce a normal plain-text row;
    // the actual displayed text is swapped to our label afterward (see
    // patchEffectivenessResultNames / patchEffectivenessTypeName). The
    // id itself is namespaced so it can never collide with a real
    // ability/tier/format id.
    function customToggleSuggestions(query) {
        const q = toSearchId(query);
        const rows = [];

        for (const [key, label] of Object.entries(CUSTOM_TOGGLE_FILTERS)) {
            if (
                !q ||
                toSearchId(key).startsWith(q) ||
                toSearchId(label).startsWith(q)
            ) {
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
        if (CUSTOM_TOGGLE_FILTERS[type]) {
            return CUSTOM_TOGGLE_FILTERS[type];
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
        if (
            type === 'weak' ||
            type === 'resists' ||
            type === 'neutral'
        ) {
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
            return effectiveness > 0 && effectiveness < 1;
        }

        if (searchKind === 'neutral') {
            return effectiveness === 1;
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

                    if (
                        kind === 'weak' ||
                        kind === 'resists' ||
                        kind === 'neutral'
                    ) {
                        const label = kind.charAt(0).toUpperCase() + kind.slice(1);
                        text = label + ' ' +
                            text.charAt(0).toUpperCase() +
                            text.slice(1);
                    } else {
                        if (kind === 'from') {
                            text = Dex.species.get(text).name + ' Into';
                        }
                        if (kind === 'into') {
                            text = 'Into ' + Dex.species.get(text).name;
                        }
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
            let payload = data;

            try {
                if (typeof data === 'string' && data.includes('/raw ')) {
                    const lines = data.split('\n');
                    let modified = false;

                    const filteredLines = lines.filter((line) => {
                        if (!line.includes('/raw ')) return true;

                        const match = line.match(/\/raw (.*)/s);
                        if (!match) return true;

                        let suppress = false;

                        if (line.includes('[Gen 9] Tier Shift AAA')) {
                            parseTSABanlist(match[1]);
                            if (pendingSilentTSARequest) {
                                pendingSilentTSARequest = false;
                                suppress = true;
                            }
                        }

                        if (line.includes('[Gen 9] Godly Gift')) {
                            parseGodlyGiftRestricted(match[1]);
                            if (pendingSilentGGRequest) {
                                pendingSilentGGRequest = false;
                                suppress = true;
                            }
                        }

                        if (suppress) {
                            modified = true;
                            return false;
                        }

                        return true;
                    });

                    if (modified) {
                        payload = filteredLines.join('\n');
                    }
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
    // PATCH: Pokémon search legality (natdex filter)
    // ============================================================

    // When the "natdex" chip is active, widen the base pool the same
    // way patchTsaSearchLegality does to get an unrestricted starting
    // point (this.format = 'gen9') before the format's own legality
    // (and any other active mod's) is applied on top. This reuses
    // exactly the mechanism that's already proven to work for Tier
    // Shift AAA in this file, rather than guessing at undocumented
    // properties (formatType/baseResults/etc.) that may not exist on
    // the real search instance. The chip itself is left in `filters`;
    // it's never used to reject a row (see patchEffectivenessSearchFilters).
    function patchNatdexSearchLegality() {
    const proto = window.BattlePokemonSearch?.prototype;

    return patchMethod(
        proto,
        'getResults',
        '__qolNatdexPatched',
        (original) =>
        function (filters, sortCol, reverseSort) {
            const hasNatdex =
                this.searchType === 'pokemon' &&
                Array.isArray(filters) &&
                filters.some(
                    ([rawType]) =>
                        baseFilterType(rawType) === 'natdex'
                );

            /*
             * NATDEX MODE
             *
             * Use the complete Pokédex as the legal pool.
             * This includes mons that the current format normally
             * considers dexited / illegal.
             */
            if (hasNatdex) {
                this.baseResults = this.getDefaultResults();
                this.baseIllegalResults = [];
                this.illegalReasons = {};

                this.__qolNatdexPoolActive = true;

                return original.call(
                    this,
                    filters,
                    sortCol,
                    reverseSort
                );
            }

            /*
             * We previously replaced the legality pool with the full
             * Pokédex. Once the NatDex filter disappears, throw that
             * cache away so Showdown rebuilds the real format legality.
             */
            if (this.__qolNatdexPoolActive) {
                this.__qolNatdexPoolActive = false;
                this.baseResults = null;
                this.baseIllegalResults = null;
                this.illegalReasons = null;
            }

            return original.call(
                this,
                filters,
                sortCol,
                reverseSort
            );
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

                // "natdex" only widens the base pool (see
                // patchNatdexSearchLegality) — it never rejects a row
                // here, negated or not, since "not national dex" has
                // no sensible per-species meaning.
                if (type === 'natdex') {
                    continue;
                }

                let matches;
                if (
                    type === 'weak' ||
                    type === 'resists' ||
                    type === 'neutral'
                ) {
                    matches = pokemonMatchesEffectiveness(
                        this.dex,
                        species,
                        type,
                        target
                    );
                }
                else if (type === 'into') {
                    matches = !!crossEvolveView(this.dex, species, target);
                }
                else if (type === 'from') {
                    const base = this.dex.species.get(target);
                    matches = !!crossEvolveView(this.dex, base, species.id);
                }
                else if (CUSTOM_TOGGLE_FILTERS[type]) {
                    matches = pokemonMatchesCustomToggle(this, original, row, species, type);
                } else {
                    matches = original.call(this, row, [[type, target]]);
                }

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
                const intoSpecies = parseIntoQuery(this, query);
                if (intoSpecies) {
                    this.__qolEffectivenessMode = null;
                    this.__qolNegateMode = false;

                    const results = [
                        ['header', 'Cross Evolve'],
                        ['ability', INTO_PREFIX + intoSpecies.id, 0, 4],
                    ];
                    this.results = results;
                    this.exactMatch = true;
                    return results;
                }

                const fromSpecies = parseFromQuery(this, query);
                if (fromSpecies) {
                    this.__qolEffectivenessMode = null;
                    this.__qolNegateMode = false;

                    const results = [
                        ['header', 'Cross Evolve'],
                        ['ability', FROM_PREFIX + fromSpecies.id, 0, 4],
                    ];
                    this.results = results;
                    this.exactMatch = true;
                    return results;
                }

                const rawQuery = String(query || '').trim();

                // "!" is a per-token modifier, not a toggle: it only
                // affects the filter tag you're about to add, not
                // filter chips you've already added.
                const negateQuery = rawQuery.startsWith('!');
                const searchQuery = negateQuery ? rawQuery.slice(1).trim() : rawQuery;

                if (!negateQuery && (parseIntoQuery(this, searchQuery) || parseFromQuery(this, searchQuery))) {
                    this.__qolEffectivenessMode = null;
                    this.__qolNegateMode = false;

                    const cacheKey = `ce:${toSearchId(searchQuery)}`;
                    if (this.query === cacheKey && this.results) return false;

                    this.query = cacheKey;
                    this.exactMatch = true;
                    this.results = this.textSearch(rawQuery);
                    this.selection = this.getFirstResultIndex();
                    return true;
                }

                const match = searchQuery.match(
                    /^(weak|resists|neutral)(?:\s+(.*))?$/i
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

                // A custom toggle suggestion (natdex/fe/recovery/pivot/
                // priority) was picked — its row id is our namespaced
                // pseudo-ability id, never a real ability/tier/format id.
                const rawValue = entry?.[1];

                if (typeof rawValue === 'string' && rawValue.startsWith(INTO_PREFIX)) {
                    const target = this.dex.species.get(rawValue.slice(INTO_PREFIX.length));
                    if (target?.exists) {
                        // only one "into" chip at a time
                        this.filters = (this.filters || []).filter((f) => f[0] !== 'into');
                        return addPokemonSearchFilter(this, 'into', target.id, false);
                    }
                }

                if (typeof rawValue === 'string' && rawValue.startsWith(FROM_PREFIX)) {
                    const base = this.dex.species.get(rawValue.slice(FROM_PREFIX.length));
                    if (base?.exists) {
                        this.filters = (this.filters || []).filter((f) => f[0] !== 'into' && f[0] !== 'from');
                        return addPokemonSearchFilter(this, 'from', base.id, false);
                    }
                }

                if (
                    typeof rawValue === 'string' &&
                    rawValue.startsWith(CUSTOM_TOGGLE_PREFIX)
                ) {
                    const key = rawValue.slice(CUSTOM_TOGGLE_PREFIX.length);

                    if (CUSTOM_TOGGLE_FILTERS[key]) {
                        const negated =
                              isNegatedFilterType(entry[0]) ||
                              this.__qolNegateMode;

                        return addPokemonSearchFilter(
                            this,
                            key,
                            CUSTOM_TOGGLE_FILTERS[key],
                            negated
                        );
                    }
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

                // Directly supplied positive custom filters (e.g. from
                // the debug console API, using the real type name rather
                // than a suggestion row).
                if (
                    rawType === 'weak' ||
                    rawType === 'resists' ||
                    rawType === 'neutral' ||
                    CUSTOM_TOGGLE_FILTERS[rawType]
                ) {
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

                const match = q.match(/^(weak|resists|neutral)(?:\s+(.*))?$/);

                // Not "weak"/"resists" (negated or not).
                if (!match) {
                    this.__qolEffectivenessMode = null;

                    if (!negated) {
                        this.__qolNegateMode = false;

                        // Strip any native suggestion that collides with
                        // one of our reserved keywords (e.g. the real
                        // "[Gen 9] National Dex" tier/format entry for
                        // "natdex") before merging in our own toggle
                        // suggestions — otherwise the real entry can get
                        // auto-selected instead of ours.
                        const native = (original.call(this, query) || [])
                            .filter((row) => !isReservedToggleCollisionRow(row));
                        const custom = customToggleSuggestions(rawQuery);

                        if (!custom.length) return native;

                        // Our suggestions go first so they're the
                        // default (Enter-key) selection.
                        const merged = custom.concat(native);
                        this.results = merged;
                        return merged;
                    }

                    this.__qolNegateMode = true;

                    // Bare "!": start with every type (same as typing
                    // "weak"/"resists" alone lists every type) plus every
                    // custom toggle. Abilities and moves only show up once
                    // you start typing their name — there are too many to
                    // list at once.
                    if (!q) {
                        const typeChart = window.BattleTypeChart;
                        const results = [['header', 'Not']];

                        results.push(...customToggleSuggestions(''));

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

                    // "!<type/ability/move/tier>": reuse Showdown's own
                    // suggestion matching for the text after the "!",
                    // keeping only type/ability/move/tier rows (no
                    // Pokémon — there's no supported way to exclude one
                    // named Pokémon here, only a filter criterion — and
                    // no egg group). Any row that collides with one of
                    // our reserved keywords (e.g. the real "natdex" tier)
                    // is dropped, and our own toggle suggestions are
                    // placed first.
                    const suggestions = (original.call(this, q) || []).filter(
                        ([rowType, rowId]) =>
                            (rowType === 'type' ||
                             rowType === 'ability' ||
                             rowType === 'move' ||
                             rowType === 'tier') &&
                            !Object.prototype.hasOwnProperty.call(
                                CUSTOM_TOGGLE_FILTERS,
                                toSearchId(rowId)
                            )
                    );

                    const merged = customToggleSuggestions(q).concat(suggestions);

                    this.results = merged;
                    this.exactMatch = true;

                    return merged;
                }

                const mode = match[1];
                const partial = (match[2] || '').trim();

                const typeChart = window.BattleTypeChart;

                if (!typeChart) {
                    this.__qolEffectivenessMode = null;
                    this.__qolNegateMode = false;
                    return original.call(this, query);
                }

                const modeLabel = {
                    weak: 'Weak',
                    resists: 'Resists',
                    neutral: 'Neutral',
                }[mode];

                const results = [
                    [
                        'header',
                        (negated ? 'Not ' : '') + modeLabel
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

                if (typeof result?.[1] === 'string' && result[1].startsWith(INTO_PREFIX)) {
                    const sp = this.dex.species.get(result[1].slice(INTO_PREFIX.length));
                    if (sp?.exists) return 'Into ' + sp.name;
                }

                if (typeof result?.[1] === 'string' && result[1].startsWith(FROM_PREFIX)) {
                    const sp = this.dex.species.get(result[1].slice(FROM_PREFIX.length));
                    if (sp?.exists) return sp.name + ' into';
                }

                // A custom toggle suggestion row (natdex/fe/recovery/
                // pivot/priority) — always show our own label, never
                // whatever a real ability/tier lookup would resolve to.
                if (
                    typeof result?.[1] === 'string' &&
                    result[1].startsWith(CUSTOM_TOGGLE_PREFIX)
                ) {
                    const key = result[1].slice(CUSTOM_TOGGLE_PREFIX.length);
                    const label = CUSTOM_TOGGLE_FILTERS[key];

                    if (label) {
                        return this.__qolNegateMode ? `Not ${label}` : label;
                    }
                }

                const mode = this.__qolEffectivenessMode;

                if (mode && result?.[0] === 'type') {
                    const typeName = this.capitalizeFirst
                    ? this.capitalizeFirst(result[1])
                    : String(result[1]).charAt(0).toUpperCase() +
                          String(result[1]).slice(1);

                    const label = {
                        weak: 'Weak',
                        resists: 'Resists',
                        neutral: 'Neutral',
                    }[mode];
                    return this.__qolNegateMode
                        ? `Not ${label} ${typeName}`
                        : `${label} ${typeName}`;
                }

                // Plain type/ability/move/tier suggestion while typing a
                // "!<query>" search (not the weak/resists sub-mode).
                if (
                    !mode &&
                    this.__qolNegateMode &&
                    (result?.[0] === 'type' || result?.[0] === 'ability' ||
                     result?.[0] === 'move' || result?.[0] === 'tier')
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
                // Custom toggle row (natdex/fe/recovery/pivot/priority):
                // build a minimal plain-text row ourselves instead of
                // calling the native "ability" renderer, since the
                // namespaced pseudo-id (e.g. "__qol_natdex") would
                // otherwise get looked up as a real (nonexistent, or
                // worse, colliding) ability.
                if (
                    type === 'ability' &&
                    typeof row?.[1] === 'string' &&
                    row[1].startsWith(INTO_PREFIX)
                ) {
                    const sp = this.engine?.dex?.species?.get(row[1].slice(INTO_PREFIX.length));
                    if (sp?.exists) {
                        const placeholderHtml = original.call(
                            this, ['ability', 'noability'], 'ability',
                            matchStart, matchEnd, errorMessage, attrs
                        );
                        return placeholderHtml.replace(
                            /(<span class="col namecol"><b>)([^<]*)(<\/b>)/,
                            `$1Into ${sp.name}$3`
                        );
                    }
                }

                if (
                    type === 'ability' &&
                    typeof row?.[1] === 'string' &&
                    row[1].startsWith(FROM_PREFIX)
                ) {
                    const sp = this.engine?.dex?.species?.get(row[1].slice(FROM_PREFIX.length));
                    if (sp?.exists) {
                        const placeholderHtml = original.call(
                            this, ['ability', 'noability'], 'ability',
                            matchStart, matchEnd, errorMessage, attrs
                        );
                        return placeholderHtml.replace(
                            /(<span class="col namecol"><b>)([^<]*)(<\/b>)/,
                            `$1${sp.name} into$3`
                        );
                    }
                }

                if (
                    type === 'ability' &&
                    typeof row?.[1] === 'string' &&
                    row[1].startsWith(CUSTOM_TOGGLE_PREFIX)
                ) {
                    const key = row[1].slice(CUSTOM_TOGGLE_PREFIX.length);
                    const label = CUSTOM_TOGGLE_FILTERS[key];

                    if (label) {
                        // Render via a real, harmless ability id first so
                        // we inherit the native wrapper markup/classes,
                        // then swap the visible name for our label.
                        const placeholderRow = ['ability', 'noability'];
                        const placeholderHtml = original.call(
                            this,
                            placeholderRow,
                            'ability',
                            matchStart,
                            matchEnd,
                            errorMessage,
                            attrs
                        );

                        const displayText = this.engine?.__qolNegateMode
                            ? `Not ${label}`
                            : label;

                        return placeholderHtml.replace(
                            /(<span class="col namecol"><b>)([^<]*)(<\/b>)/,
                            `$1${displayText}$3`
                        );
                    }
                }

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
                    const label = {
                        weak: 'Weak',
                        resists: 'Resists',
                        neutral: 'Neutral',
                    }[mode];
                    const prefix = this.engine?.__qolNegateMode
                    ? `!${label}`
                    : label;

                    return html.replace(
                        /(<span class="col namecol"><b>)([^<]+)(<\/b>)/,
                        `$1${prefix} $2$3`
                    );
                }

                // Plain type/ability/move/tier row while typing a
                // !<query> search.
                if (
                    !mode &&
                    this.engine?.__qolNegateMode &&
                    (type === 'type' || type === 'ability' || type === 'move' || type === 'tier')
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
    function patchIntoFilterTracker() {
    const proto = window.BattlePokemonSearch?.prototype;

    return patchMethod(proto, 'getResults', '__qolIntoTrackerPatched', (original) =>
        function (filters, ...rest) {
            const find = (kind) => {
                const f = Array.isArray(filters) ? filters.find((e) => e[0] === kind) : null;
                return f ? f[1] : null;
            };
            this.__qolIntoId = find('into');
            this.__qolFromId = find('from');
            return original.call(this, filters, ...rest);
        }
    );
}

    function patchSearchSort() {
        const proto = window.BattlePokemonSearch?.prototype;

        return patchMethod(proto, 'sort', '__qolPatched', (original) =>
                           function (results, sortCol, reverseSort) {
            const intoId = this.__qolIntoId;

            if (intoId && (STATS.includes(sortCol) || sortCol === 'bst')) {
                const order = reverseSort ? -1 : 1;
                const statsFor = (id) => {
                    const sp = this.dex.species.get(id);
                    return crossEvolveView(this.dex, sp, intoId)?.baseStats || sp.baseStats;
                };
                const bst = (s) => STATS.reduce((sum, st) => sum + s[st], 0);

                return results.sort((a, b) => {
                    const sa = statsFor(a[1]), sb = statsFor(b[1]);
                    return sortCol === 'bst'
                        ? (bst(sb) - bst(sa)) * order
                    : (sb[sortCol] - sa[sortCol]) * order;
                });
            }

            const fromId = this.__qolFromId;

            if (fromId && (STATS.includes(sortCol) || sortCol === 'bst')) {
                const order = reverseSort ? -1 : 1;
                const base = this.dex.species.get(fromId);
                const statsFor = (id) => {
                    const sp = this.dex.species.get(id);
                    return crossEvolveView(this.dex, base, id)?.baseStats || sp.baseStats;
                };
                const bst = (s) => STATS.reduce((sum, st) => sum + s[st], 0);

                return results.sort((a, b) => {
                    const sa = statsFor(a[1]), sb = statsFor(b[1]);
                    return sortCol === 'bst'
                        ? (bst(sb) - bst(sa)) * order
                    : (sb[sortCol] - sa[sortCol]) * order;
                });
            }

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
            const intoId = pokemon ? getIntoFilterId(this.engine) : null;
            if (intoId) {
                const view = crossEvolveView(this.engine.dex, pokemon, intoId);
                if (view) {
                    const crossed = Object.assign({}, pokemon, {
                        baseStats: view.baseStats,
                        types: view.types,
                        abilities: view.abilities,
                    });
                    return original.call(this, crossed, matchStart, matchLength, errorMessage, attrs);
                }
            }
            const fromId = pokemon ? getIntoFilterId(this.engine, 'from') : null;
            if (fromId) {
                const dex = this.engine.dex;
                const view = crossEvolveView(dex, dex.species.get(fromId), pokemon.id);
                if (view) {
                    const crossed = Object.assign({}, pokemon, {
                        baseStats: view.baseStats,
                        types: view.types,
                        abilities: view.abilities,
                    });
                    return original.call(this, crossed, matchStart, matchLength, errorMessage, attrs);
                }
            }
            const typedSearch = this.engine?.typedSearch;
            const filters = typedSearch?.filters ?? [];

            const isNatdex = filters.some(filter =>
                                          Array.isArray(filter) && filter[0] === 'natdex'
                                         );

            // Natdex: suppress the legality label.
            if (isNatdex) {
                return original.call(
                    this,
                    pokemon,
                    matchStart,
                    matchLength,
                    undefined,
                    attrs
                );
            }

            if (!pokemon || (mod !== MOD.TIER_SHIFT && mod !== MOD.BAD_N_BOOSTED)) {
                return original.call(
                    this,
                    pokemon,
                    matchStart,
                    matchLength,
                    errorMessage,
                    attrs
                );
            }

            const shifted = Object.assign({}, pokemon, {
                baseStats: searchListStats(pokemon, mod),
            });

            return original.call(
                this,
                shifted,
                matchStart,
                matchLength,
                errorMessage,
                attrs
            );
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
                updateMixAndMegaSpeedNote(this);
            }

            return result;
        }
    );
}

    // ============================================================
    // PATCH: type icons + ability preview (Mix and Mega)
    // ============================================================

    // Type icons shown in the Details pane (renderSet) come straight
    // from the *named* species' own types, with no awareness of any
    // item at all. Post-process the HTML it returns so Mix and Mega
    // shows the post-Mega-Evolution types instead — this also covers
    // switching to/from this Pokémon and page load, when the item is
    // already set.
    function patchRenderSetTypeIcons() {
        const proto = window.TeambuilderRoom?.prototype;

        return patchMethod(proto, 'renderSet', '__qolMixAndMegaPatched', (original) =>
                           function (set, i) {
            const html = original.call(this, set, i);

            const mod = getActiveMod(this);
            if ((mod !== MOD.MIX_AND_MEGA && mod !== MOD.CROSS_EVOLUTION) || !set?.species) {
                        return html;
                        }

                        const dex = this.curTeam?.dex;
                        const types = mod === MOD.CROSS_EVOLUTION
                        ? crossEvolutionTypes(dex, set)
                        : mixAndMegaModifiedTypes(dex, set);
                    if (!types) return html;

            const icons = types.map((type) => Dex.getTypeIcon(type)).join('');

            return html.replace(
                /(<div class="setcell setcell-typeicons">)[\s\S]*?(<\/div>)/,
                `$1${icons}$2`
            );
        }
                          );
    }

    // Live-updates just the type icon cell when the item field itself
    // changes, without waiting for a full re-render (chartSet's own
    // 'item' case only refreshes the sprite/item icon).
    function patchChartSetMixAndMegaTypes() {
        const proto = window.TeambuilderRoom?.prototype;

        return patchMethod(proto, 'chartSet', '__qolMixAndMegaPatched', (original) =>
                           function (val, selectNext) {
            const inputName = this.curChartName;
            const result = original.call(this, val, selectNext);

            if (inputName !== 'item' || getActiveMod(this) !== MOD.MIX_AND_MEGA) {
                return result;
            }

            const dex = this.curTeam?.dex;
            const set = this.curSet;
            if (!dex || !set?.species) return result;

            const cell = this.$('.setcell-typeicons');
            if (!cell.length) return result;

            const species = dex.species.get(set.species);
            const types = mixAndMegaModifiedTypes(dex, set) || species?.types || [];

            cell.html(types.map((type) => Dex.getTypeIcon(type)).join(''));

            return result;
        }
                          );
    }

    // Mirrors the native "Will be X after Mega Evolving" note real Mega
    // species entries get in the ability search (see BattleAbilitySearch
    // #getBaseResults in battle-dex-search.ts) — except triggered by the
    // Mix and Mega item instead of the species itself being a Mega forme,
    // and without touching the set's own (starting) ability.
    function patchMixAndMegaAbilityPreview() {
        const proto = window.BattleAbilitySearch?.prototype;

        return patchMethod(proto, 'getBaseResults', '__qolMixAndMegaPatched', (original) =>
                           function () {
            const results = original.call(this);

            if (this.format !== 'mixandmega' || !this.set?.item) return results;

            const futureAbility = mixAndMegaFutureAbility(this.dex, this.set);
            if (!futureAbility) return results;

            return [
                ['html', `Will be <strong>${futureAbility}</strong> after Mega Evolving.`],
                ...results,
            ];
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
    const seenProtos = new Set();

    for (const room of Object.values(rooms)) {
        const tooltips = room?.tooltips;
        if (!tooltips || typeof tooltips.getSpeedRange !== 'function') {
            continue;
        }

        // Find the prototype that actually owns getSpeedRange.
        let proto = tooltips;
        while (proto && !Object.prototype.hasOwnProperty.call(proto, 'getSpeedRange')) {
            proto = Object.getPrototypeOf(proto);
        }

        if (!proto || seenProtos.has(proto)) continue;
        seenProtos.add(proto);

        const patched = patchMethod(
            proto,
            'getSpeedRange',
            '__qolSpeedRangePatched',
            (original) =>
            function (pokemon, ...args) {
                const callOriginal = () => original.call(this, pokemon, ...args);

                if (!pokemon?.getSpecies) {
                    return callOriginal();
                }

                const originalSpecies = pokemon.getSpecies();
                if (!originalSpecies?.baseStats) {
                    return callOriginal();
                }

                const battle = this.battle;
                if (!battle) {
                    return callOriginal();
                }

                const formatId = String(
                    battle.format?.id ||
                    battle.format?.name ||
                    ''
                ).toLowerCase();

                // -------------------------
                // Tier Shift
                // -------------------------
                const isTierShift =
                    formatId.includes('tiershift') ||
                    Object.keys(battle.rules || {}).some(rule =>
                        String(rule).toLowerCase().includes('tier shift')
                    );

                if (isTierShift) {
                    const boost = getTierShiftBoost(originalSpecies.tier);

                    if (boost) {
                        const shifted = Object.assign({}, originalSpecies, {
                            baseStats: Object.assign({}, originalSpecies.baseStats, {
                                spe: originalSpecies.baseStats.spe + boost,
                            }),
                        });

                        return withOverriddenGetSpecies(
                            pokemon,
                            shifted,
                            callOriginal
                        );
                    }
                }

                // -------------------------
                // Mix and Mega
                // -------------------------
                const isMixAndMega =
                    formatId.includes('mixandmega');

                if (isMixAndMega && pokemon.item) {
                    const dex = battle.dex;

                    if (!dex?.items?.get) {
                        return callOriginal();
                    }

                    const item = dex.items.get(pokemon.item);

                    if (!item?.exists) {
                        return callOriginal();
                    }

                    const delta = mixAndMegaStatDelta(
                        dex,
                        item,
                        'spe'
                    );

                    if (delta) {
                        const shifted = Object.assign({}, originalSpecies, {
                            baseStats: Object.assign({}, originalSpecies.baseStats, {
                                spe: originalSpecies.baseStats.spe + delta,
                            }),
                        });

                        return withOverriddenGetSpecies(
                            pokemon,
                            shifted,
                            callOriginal
                        );
                    }
                }

                return callOriginal();
            }
        );

        if (patched) patchedAny = true;
    }

    return patchedAny;
}

    patchTooltipSpeedRange()
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
            patchNatdexSearchLegality(),
            patchEffectivenessTextSearch(),
            patchEffectivenessAddFilter(),
            patchEffectivenessResultNames(),
            patchEffectivenessTypeName(),
            patchEffectivenessFilterText(),
            patchCurrentEffectivenessSearch(),
            patchEffectivenessSetType(),

            patchCrossEvolutionMoveSearch(),
            patchCrossEvolutionAbilitySearch(),
            patchIntoFilterTracker(),
            patchCrossEvolutionIntoSelect(),


            patchSearchSort(),
            patchSearchRenderer(),
            patchGetStat(),
            patchBattleStatGuesserGetStat(),
            patchBattleStatGuesserGuess(),
            patchUpdateStatForm(),
            patchStatSlide(),
            patchRenderSetTypeIcons(),
            patchChartSetMixAndMegaTypes(),
            patchMixAndMegaAbilityPreview(),
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
        getMixAndMegaTypes: (set) => mixAndMegaModifiedTypes(window.room?.curTeam?.dex, set),
        getMixAndMegaFutureAbility: (set) => mixAndMegaFutureAbility(window.room?.curTeam?.dex, set),
        getCrossEvolutionBaseStats: (set) => crossEvolutionBaseStats(window.room?.curTeam?.dex, set),
        getCrossEvolutionTypes: (set) => crossEvolutionTypes(window.room?.curTeam?.dex, set),
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
        pokemonMatchesEffectiveness,
        getBadNBoostedBaseStats: (set, room) => badNBoostedBaseStats(room?.curTeam?.dex, set),
        isFullyEvolved,
        getCustomToggleMoveIds: (kind, dex) => getCustomToggleMoveIds(dex || window.room?.curTeam?.dex, kind),
        patch: patchEverything,
    };
    installCrossEvolutionNicknameListener();
})();
