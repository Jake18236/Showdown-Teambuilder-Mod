// ==UserScript==
// @name         Pokémon Showdown Teambuilder QOL
// @author       jl
// @namespace    https://github.com/Jake18236/showdown-teambuilder-mod
// @version      6.7
// @description  Makes the Showdown Teambuilder better for some OMs
// @match        https://play.pokemonshowdown.com/*
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/Jake18236/showdown-teambuilder-mod/main/showdown-teambuilder.user.js
// @downloadURL  https://raw.githubusercontent.com/Jake18236/showdown-teambuilder-mod/main/showdown-teambuilder.user.js
// ==/UserScript==

// comments by claude bc documentation is too much work :C
(function () {
    'use strict';

    const LOG = '[Teambuilder QOL]';

    // ============================================================
    // CONSTANTS
    // ============================================================

    const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
    const BOOSTABLE_STATS = STATS.slice(1); // everything but hp
    const sumStats = (s) => STATS.reduce((n, st) => n + s[st], 0);
    const clamp255 = (n) => Math.max(1, Math.min(255, n));

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

    const SCALEMONS_FORMAT = 'gen9aaaubers';
    const FRANTIC_FUSIONS_FORMAT = 'gen9franticfusions';
    const INHERITANCE_FORMAT = 'gen9inheritance';

    // ------------------------------------------------------------
    // Format matching: keyword based, so prefixes/suffixes such as
    // "nationaldex" (gen9nationaldexmixandmega) don't break detection.
    // ------------------------------------------------------------

    const fmtId = (f) => String(f || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const fmtHas = (f, ...keys) => {
        const id = fmtId(f);
        return keys.some((k) => id.includes(k));
    };
    const stripGen = (id) => String(id || '').replace(/^gen\d+/, '');

    // Order matters: first match wins.
    const FORMAT_MOD_KEYWORDS = [
        ['tiershift', MOD.TIER_SHIFT],        // also covers tiershiftaaa
        ['mixandmega', MOD.MIX_AND_MEGA],     // covers gen9nationaldexmixandmega
        ['badnboosted', MOD.BAD_N_BOOSTED],
        ['crossevolution', MOD.CROSS_EVOLUTION],
        ['aaaubers', MOD.SCALEMONS],          // Scalemons runs on gen9aaaubers
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
        for (const [kw, mod] of FORMAT_MOD_KEYWORDS) {
            if (id.includes(kw)) return mod;
        }
        return null;
    }

    // Mods whose stat changes are visible in the Pokémon search list.
    const SEARCH_LIST_MODS = new Set([
        MOD.TIER_SHIFT, MOD.BAD_N_BOOSTED, MOD.SCALEMONS, MOD.FLIPPED, MOD.THREE_FIFTY_CUP,
    ]);

    const EFFECT_LABELS = {weak: 'Weak', resists: 'Resists', neutral: 'Neutral'};

    // ============================================================
    // ROOM / FORMAT HELPERS
    // ============================================================

    const getTeambuilderRoom = () => window.app?.rooms?.teambuilder || null;
    const getActiveTeambuilderRoom = () =>
    getTeambuilderRoom() || (window.room?.curTeam ? window.room : null);
    const getEngine = () => getTeambuilderRoom()?.search?.engine;

    // ============================================================
    // SERVER BANLISTS (Tier Shift AAA / Godly Gift / Convergence)
    //
    // These live server-side only, so we ask via a silent `/tier` command
    // and parse the `/raw` reply (which is then hidden from chat).
    // ============================================================

    const BL = {
        tsa: {command: '/tier tiershiftaaa', loaded: false, sent: false, silent: false},
        gg: {command: '/tier godly gift', loaded: false, sent: false, silent: false},
        conv: {command: '/tier convergence', loaded: false, sent: false, silent: false},
    };

    let tsaBanlist = new Set();
    let godlyGiftRestricted = new Set();

    function requestBanlist(key) {
        const b = BL[key];
        if (b.loaded || b.sent) return;
        if (!window.app || typeof app.send !== 'function') return;

        b.sent = true;
        b.silent = true;
        app.send(b.command);
    }

    const requestTSABanlist = () => requestBanlist('tsa');
    const requestGGBanlist = () => requestBanlist('gg');
    const requestConvergenceBanlist = () => requestBanlist('conv');

    // Checking "is this format active" also kicks off the fetch the first time.
    function formatActive(room, keyword, key) {
        const active = fmtHas(room?.curTeam?.format, keyword);
        if (active) requestBanlist(key);
        return active;
    }

    const isGodlyGiftFormat = (room) => formatActive(room, 'godlygift', 'gg');
    const isTierShiftAAAFormat = (room) => formatActive(room, 'tiershiftaaa', 'tsa');
    const isConvergenceFormat = (room) => formatActive(room, 'convergence', 'conv');


    function getActiveMod(room = getActiveTeambuilderRoom()) {
        if (isGodlyGiftFormat(room)) return MOD.GODLY_GIFT;
        isTierShiftAAAFormat(room);
        return modFromFormat(room?.curTeam?.format);
    }

    // Banlists come back as an HTML `/raw` blob with a "<Label> - a, b, c" line.
    function parseNameListFromHtml(html, sectionHeader, listLabel) {
        if (!html || !html.includes(sectionHeader)) return null;

        const doc = new DOMParser().parseFromString(html, 'text/html');
        const match = (doc.body.textContent || '').match(new RegExp(`${listLabel}\\s*-\\s*(.*)`, 's'));
        if (!match) return null;

        const ids = new Set();
        for (const name of match[1].split(',').map((n) => n.trim()).filter(Boolean)) {
            const species = Dex.species.get(name);
            if (species?.exists) ids.add(species.id);
        }
        return ids;
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

    // ============================================================
    // GENERIC PATCH HELPERS
    // ============================================================

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
        return withSpeciesOverrides(dex, species, {baseStats: Object.assign({}, baseStats)}, fn);
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

    // Builds `(dex, set) => modifiedStats | null` from a species -> stats function.
    const speciesStatsFn = (modify) => (dex, set) => {
        const species = dex?.species?.get(set.species);
        return species?.exists ? modify(species) : null;
    };

    // ============================================================
    // ALMOST ANY ABILITY: SUGGESTED ABILITIES
    // ============================================================

    // Keys are species ids (lowercase, no spaces/punctuation); values are ability names.
    const SUGGESTED_ABILITIES = {
        'gholdengo': ['Adaptability', 'Bulletproof', 'Beads of Ruin', 'Earth Eater', 'Fluffy', 'Hadron Engine', 'Levitate', 'Magic Guard', 'Regenerator', 'Surge Surfer', 'Volt Absorb', 'Well-Baked Body'], // Gholdengo
        'corviknight': ['Fluffy', 'Intimidate', 'Prankster', 'Volt Absorb', 'Water Absorb', 'Well-Baked Body'], // Corviknight
        'greattusk': ['Adaptability', 'Fluffy', 'Magic Guard', 'Mold Breaker', 'Regenerator', 'Refrigerate', 'Scrappy', 'Tough Claws', 'Wandering Spirit', 'Water Absorb'], // Great Tusk
        'roaringmoon': ['Fluffy', 'Magic Guard', 'Regenerator', 'Sword of Ruin', 'Tough Claws'], // Roaring Moon
        'zamazenta': ['Magic Guard', 'Scrappy', 'Sword of Ruin', 'Tough Claws'], // Zamazenta
        'ironmoth': ['Desolate Land', 'Hadron Engine', 'Sheer Force'], // Iron Moth
        'manaphy': ['Fluffy', 'Motor Drive', 'Protosynthesis', 'Regenerator', 'Surge Surfer', 'Unaware'], // Manaphy
        'pecharunt': ['Corrosion', 'Earth Eater', 'Fluffy', 'Intimidate', 'Prankster'], // Pecharunt
        'tinglu': ['Bulletproof', 'Fluffy', 'Magic Guard', 'Regenerator', 'Vessel of Ruin', 'Well-Baked Body'], // Ting-Lu
        'deoxysspeed': ['Fluffy', 'Hadron Engine', 'Protean', 'Psychic Surge', 'Sheer Force'], // Deoxys-Speed
        'landorustherian': ['Desolate Land', 'Fluffy', 'Mold Breaker', 'Regenerator', 'Sword of Ruin', 'Well-Baked Body'], // Landorus-Therian
        'moltres': ['Desolate Land', 'Magic Guard'], // Moltres
        'primarina': ['Fluffy', 'Primordial Sea', 'Regenerator', 'Sheer Force', 'Stamina', 'Volt Absorb'], // Primarina
        'screamtail': ['Fluffy', 'Pixilate', 'Regenerator', 'Stamina', 'Unaware'], // Scream Tail
        'zapdos': ['Intimidate', 'No Guard', 'Primordial Sea'], // Zapdos
        'chienpao': ['Adaptability', 'Magic Guard', 'Sword of Ruin'], // Chien-Pao
        'cobalion': ['Earth Eater', 'Magic Guard', 'Well-Baked Body'], // Cobalion
        'garchomp': ['Adaptability', 'Dragon\'s Maw', 'Fluffy', 'Regenerator', 'Sword of Ruin'], // Garchomp
        'ironhands': ['Earth Eater', 'Regenerator', 'Surge Surfer'], // Iron Hands
        'irontreads': ['Bulletproof', 'Earth Eater', 'Magic Guard', 'Regenerator', 'Water Absorb', 'Well-Baked Body'], // Iron Treads
        'kingambit': ['Adaptability','Earth Eater', 'Fluffy', 'Sword of Ruin', 'Tinted Lens', 'Tough Claws', 'Well-Baked Body'], // Kingambit
        'landorus': ['Desolate Land', 'Fluffy', 'Primordial Sea', 'Well-Baked Body'], // Landorus
        'latios': ['Adaptability', 'Dragon\'s Maw', 'Hadron Engine', 'Tinted Lens'], // Latios
        'meowscarada': ['Adaptability', 'Magic Guard', 'Sword of Ruin'], // Meowscarada
        'swampert': ['Regenerator'], // Swampert
        'cinderace': ['Desolate Land', 'Magic Guard', 'Sword of Ruin', 'moldbreaker'], // Cinderace
        'gliscor': ['Fluffy', 'Regenerator', 'Well-Baked Body'], // Gliscor
        'ironcrown': ['Earth Eater','Hadron Engine', 'Psychic Surge', 'Tinted Lens', 'Well-Baked Body' ], // Iron Crown
        'ogerponwellspring': ['Primordial Sea', 'Sword of Ruin'], // Ogerpon-Wellspring
        'ogerponhearthflame': ['Desolate Land', 'Magic Guard', 'Sword of Ruin'], // Ogerpon-Hearthflame
        'sinistcha': ['Bulletproof', 'Fluffy', 'Surge Surfer', 'Well-Baked Body'], // Sinistcha
        'skarmory': ['Fluffy', 'Intimidate',, 'Volt Absorb', 'Well-Baked Body'], // Skarmory
        'zarude': ['Grassy Surge', 'Sword of Ruin', 'Tough Claws'], // Zarude
        'blissey': ['Magic Guard', 'Unaware'], // Blissey
        'brambleghast': ['Adaptability', 'Fluffy', 'Sword of Ruin'], // Brambleghast
        'goodrahisui': ['Regenerator'], // Goodra-Hisui
        'heatran': ['Bulletproof', 'Desolate Land'], // Heatran
        'ogerponcornerstone': ['Rocky Payload', 'Sword of Ruin'], // Ogerpon-Cornerstone
        'okidogi': ['Corrosion', 'Earth Eater', 'Fluffy', 'Well-Baked Body'], // Okidogi
        'inteleon': ['Primordial Sea'], // Inteleon
        'slitherwing': ['Magic Guard', 'Regenerator', 'Sword of Ruin', 'Tinted Lens'], // Slither Wing
        'smeargle': ['Prankster'], // Smeargle
        'tinkaton': ['Earth Eater', 'Fluffy', 'Levitate', 'Regenerator', 'Well-Baked Body'], // Tinkaton
        'thundurustherian': ['Primordial Sea', 'Sheer Force', 'Surge Surfer'], // Thundurus-Therian
        'tornadustherian': ['Magic Guard', 'Sheer Force'], // Tornadus-Therian
        'ursalunabloodmoon': ['Adaptability', 'Fluffy', 'Unaware','Water Absorb', ''], // Ursaluna-Bloodmoon
        'archaludon': ['Primordial Sea'], // Archaludon
        'chansey': ['Magic Guard', 'Unaware'], // Chansey
        'chesnaught': ['Flame Body', 'Fluffy', 'Well-Baked Body'], // Chesnaught
        'cloyster': ['Technician'], // Cloyster
        'cresselia': ['Stamina', 'Unaware'], // Cresselia
        'deoxysdefense': ['Intimidate', 'Prankster', 'Unaware'], // Deoxys-Defense
        'empoleon': ['Bulletproof', 'Levitate', 'Vessel of Ruin', 'Volt Absorb'], // Empoleon
        'electrodehisui': ['Hadron Engine', 'Magic Guard'], // Electrode-Hisui
        'garganacl': ['Fluffy'], // Garganacl
        'ironboulder': ['Sharpness', 'Sword of Ruin'], // Iron Boulder
        'mamoswine': ['Adaptability', 'Sword of Ruin', 'Technician'], // Mamoswine
        'mandibuzz': ['Delta Stream', 'Fluffy', 'Magic Guard', 'Unaware', 'Vessel of Ruin', 'voltabsorb', ''], // Mandibuzz
        'meloetta': ['Regenerator'], // Meloetta
        'polteageist': ['Normalize', 'Pixilate', 'Queenly Majesty'], // Polteageist
        'regieleki': ['Pixilate', 'Refrigerate'], // Regieleki
        'ribombee': ['Prankster'], // Ribombee
        'samurotthisui': ['Adaptability', 'Primordial Sea', 'Prankster', 'Regenerator'], // Samurott-Hisui
        'sandyshocks': ['Hadron Engine'], // Sandy Shocks
        'thundurus': ['Magic Guard', 'Primordial Sea', 'Sheer Force'], // Thundurus
        'weezinggalar': ['Earth Eater', 'Fluffy', 'Levitate'], // Weezing-Galar
    };

    function patchSuggestedAbilities() {
        return patchMethod(
            window.BattleAbilitySearch?.prototype,
            'getBaseResults',
            '__qolSuggestedAbilitiesPatched',
            (original) => function () {
                const results = original.call(this);
                if (!fmtHas(this.format, 'almostanyability') || !this.species) return results;

                const names = SUGGESTED_ABILITIES[toID(this.species)];
                if (!names?.length) return results;

                const rows = [];
                const seen = new Set();
                for (const name of names) {
                    const ability = this.dex.abilities.get(name);
                    if (!ability?.exists || seen.has(ability.id)) continue;
                    seen.add(ability.id);
                    rows.push(['ability', ability.id]);
                }
                if (!rows.length) return results;

                // Keep native notes (html rows) on top, then our header, then everything else.
                const notes = results.filter((r) => r[0] === 'html');
                const rest = results.filter((r) => r[0] !== 'html');
                return [...notes, ['header', 'Suggested Abilities'], ...rows, ...rest];
            }
        );
    }

    // ============================================================
    // TIER SHIFT / BAD 'N BOOSTED / SCALEMONS
    // ============================================================

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

        const stats = Object.assign({}, species.baseStats);
        for (const stat of BOOSTABLE_STATS) stats[stat] += boost;
        return stats;
    }

    // Every base stat of 70 or lower is doubled.
    function badNBoostedModifiedStats(species) {
        const stats = Object.assign({}, species.baseStats);
        for (const stat of STATS) {
            if (stats[stat] <= 70) stats[stat] *= 2;
        }
        return stats;
    }

    // HP is unchanged; every other stat is scaled so BST ~= 600.
    function scalemonsModifiedStats(species) {
        const stats = Object.assign({}, species.baseStats);
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

    const flippedBaseStats = speciesStatsFn(flippedModifiedStats);
    const threeFiftyCupBaseStats = speciesStatsFn(threeFiftyCupModifiedStats);
    const tierShiftBaseStats = speciesStatsFn(tierShiftModifiedStats);
    const badNBoostedBaseStats = speciesStatsFn(badNBoostedModifiedStats);
    const scalemonsBaseStats = speciesStatsFn(scalemonsModifiedStats);

    // ============================================================
    // NATURE SWAP / CAMOMONS
    // ============================================================

    // The +stat and -stat base stats trade places. Neutral natures: no change.
    function natureSwapBaseStats(dex, set) {
        const species = dex?.species?.get(set?.species);
        const nature = BattleNatures[set?.nature];
        if (!species?.exists || !nature?.plus || !nature?.minus) return null;

        const stats = Object.assign({}, species.baseStats);
        [stats[nature.plus], stats[nature.minus]] = [stats[nature.minus], stats[nature.plus]];
        return stats;
    }

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

    function refreshTypeIcons(room) {
        const dex = room?.curTeam?.dex;
        const set = room?.curSet;
        const cell = room?.$?.('.setcell-typeicons');
        if (!dex || !set?.species || !cell?.length) return;

        const types = modifiedTypes(getActiveMod(room), dex, set) || dex.species.get(set.species)?.types || [];
        cell.html(types.map((t) => Dex.getTypeIcon(t)).join(''));
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

    // ============================================================
    // MIX AND MEGA
    // ============================================================

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
        const stats = Object.assign({}, species.baseStats);

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

    // ============================================================
    // FRANTIC FUSIONS
    // ============================================================

    const isFusionMod = (mod) => mod === MOD.CROSS_EVOLUTION || mod === MOD.FRANTIC_FUSIONS || mod === MOD.INHERITANCE;

    // Nickname = donor. Any species can fuse with any other (no prevo/NFE rules).
    function resolveFranticFusion(dex, set) {
        if (!dex || !set?.species || !set?.name) return null;

        const species = dex.species.get(set.species);
        const donor = dex.species.get(set.name);
        if (!species?.exists || !donor?.exists) return null;
        if (species.id === donor.id || species.battleOnly || donor.battleOnly) return null;

        return {species, donor};
    }

    // +floor(donor / 4) to every stat except HP.
    function franticFusionsBaseStats(dex, set) {
        const ff = resolveFranticFusion(dex, set);
        if (!ff) return null;

        const stats = Object.assign({}, ff.species.baseStats);
        for (const stat of BOOSTABLE_STATS) {
            stats[stat] += Math.floor(ff.donor.baseStats[stat] / 4);
        }
        return stats;
    }

    function franticFusionsDonorAbilityIds(dex, set) {
        const ff = resolveFranticFusion(dex, set);
        return ff ? Object.values(ff.donor.abilities).filter(Boolean).map((a) => toID(a)) : [];
    }

    // Nickname = donor. Same validity rules as Frantic Fusions; no stat changes.
    const resolveInheritance = (dex, set) => resolveFranticFusion(dex, set);
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
    function patchFlatAbilitySearch() {
        return patchMethod(
            window.BattleAbilitySearch?.prototype,
            'getBaseResults',
            '__qolFlatAbilityPatched',
            (original) => function () {
                const isFF = fmtHas(this.format, 'franticfusions');
                const isInh = fmtHas(this.format, 'inheritance');
                if (!isFF && !isInh) return original.call(this);

                let results;
                let extraIds = [];

                if (isInh) {
                    const inh = resolveInheritance(this.dex, this.set);
                    results = inh
                        ? withSpeciesOverrides(
                        this.dex,
                        inh.species,
                        {abilities: Object.assign({}, inh.donor.abilities)},
                        () => original.call(this)
                    )
                    : original.call(this);
                } else {
                    results = original.call(this);
                    extraIds = franticFusionsDonorAbilityIds(this.dex, this.set);
                }

                return this.species ? flattenAbilityResults(results, extraIds) : results;
            }
        );
    }

    // ============================================================
    // CROSS EVOLUTION
    // ============================================================

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

    // Move/ability results are cached per search instance; bust the cache
    // when the nickname (the cross-evo / fusion donor) changes.
    function patchSearchCacheBust() {
        const bust = (proto) =>
        patchMethod(proto, 'getResults', '__qolCEKeyPatched', (original) =>
                    function (...args) {
            if (isCrossFormat(this.format) && this.set) {
                const key = [this.set.species || '', this.set.name || '', this.species || ''].join('|');

                if (this.__qolCEKey !== key) {
                    this.__qolCEKey = key;
                    this.baseResults = null;
                    this.baseIllegalResults = null;
                }
            }
            return original.apply(this, args);
        }
                   );

        // Non-short-circuiting on purpose: patch both.
        return [bust(window.BattleMoveSearch?.prototype), bust(window.BattleAbilitySearch?.prototype)]
            .every(Boolean);
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

    function patchCrossEvolutionMoveSearch() {
        return patchMethod(
            window.BattleMoveSearch?.prototype,
            'getBaseResults',
            '__qolCEPatched',
            (original) => function () {
                const results = original.call(this);
                if (!fmtHas(this.format, 'crossevolution')) return results;

                this.__qolConvDonors = {};

                const ce = resolveCrossEvolution(this.dex, this.set);
                if (!ce) return results;

                const crossResults = withSearchSpecies(this, ce.cross.name, () => original.call(this));

                // Moves that only exist because of the cross evolution get the target's icon.
                const have = new Set(results.filter((r) => r[0] === 'move').map((r) => r[1]));
                const donors = {};
                for (const r of crossResults) {
                    if (r[0] === 'move' && !have.has(r[1])) donors[r[1]] = ce.cross.id;
                }
                this.__qolConvDonors = donors;

                return mergeMoveResults(results, crossResults);
            }
        );
    }

    // Inheritance: the donor's movepool fully replaces the mon's own.
    function patchInheritanceMoveSearch() {
        return patchMethod(
            window.BattleMoveSearch?.prototype,
            'getBaseResults',
            '__qolInheritMovePatched',
            (original) => function () {
                if (!fmtHas(this.format, 'inheritance')) return original.call(this);

                const inh = resolveInheritance(this.dex, this.set);
                if (!inh) return original.call(this);

                return withSearchSpecies(this, inh.donor.name, () => original.call(this));
            }
        );
    }

    // Abilities: show the target's abilities in the ability picker.
    function patchCrossEvolutionAbilitySearch() {
        return patchMethod(
            window.BattleAbilitySearch?.prototype,
            'getBaseResults',
            '__qolCEPatched',
            (original) => function () {
                if (!fmtHas(this.format, 'crossevolution')) return original.call(this);

                this.__qolConvDonors = {};

                const ce = resolveCrossEvolution(this.dex, this.set);
                if (!ce) return original.call(this);

                const results = withSpeciesOverrides(
                    this.dex,
                    ce.species,
                    {abilities: Object.assign({}, ce.cross.abilities)},
                    () => original.call(this)
                );

                // Only abilities the base species doesn't already have get the icon.
                const own = new Set(Object.values(ce.species.abilities).filter(Boolean).map((a) => toID(a)));
                const donors = {};
                for (const r of results) {
                    if (r[0] === 'ability' && !own.has(r[1])) donors[r[1]] = ce.cross.id;
                }
                this.__qolConvDonors = donors;

                return results;
            }
        );
    }

    let ceRefreshFrame = null;
    let ceLastNickname = null;

    function patchCrossEvolutionIntoSelect() {
        return patchMethod(
            window.TeambuilderRoom?.prototype,
            'chartSet',
            '__qolCEIntoPatched',
            (original) => function (val, selectNext) {
                const engine =
                      this.curChartName === 'pokemon' && isFusionMod(getActiveMod(this))
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
                if (!nickname || !this.curSet) return result;

                this.curSet.name = nickname;
                this.$('input[name=nickname]').val(nickname);
                this.save?.();

                ceLastNickname = null;
                scheduleCrossEvolutionRefresh(this, nickname);

                return result;
            }
        );
    }

    // Refresh type icons + base stat column as soon as the nickname changes.
    function refreshCrossEvolutionSet(room, nicknameOverride = null) {
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

        room.$('.setcell-typeicons').html(types.map((t) => Dex.getTypeIcon(t)).join(''));

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
                search.__qolCEKey = null;
                search.baseResults = null;
                search.baseIllegalResults = null;
            }
        }

        const search = room.search;
        if (search) {
            if (typeof search.update === 'function') search.update();
            else if (typeof search.updateResults === 'function') search.updateResults();
        }
    }

    function scheduleCrossEvolutionRefresh(room, nickname = null) {
        if (!room) return;
        if (ceRefreshFrame !== null) cancelAnimationFrame(ceRefreshFrame);

        ceRefreshFrame = requestAnimationFrame(() => {
            ceRefreshFrame = null;

            if (getActiveTeambuilderRoom() !== room || !isFusionMod(getActiveMod(room))) return;

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
            if (!(input instanceof HTMLInputElement) || input.name !== 'nickname') return;

            const room = getActiveTeambuilderRoom();
            if (!room || !isFusionMod(getActiveMod(room))) return;

            // Use the input's value directly; Showdown may not commit it to
            // curSet.name until blur/change.
            scheduleCrossEvolutionRefresh(room, input.value);
        };

        document.addEventListener('input', handler, true);
        document.addEventListener('change', handler, true);
    }

    // ============================================================
    // CONVERGENCE
    // ============================================================

    const CONVERGENCE_FORMAT_ID = 'convergence';
    const CONVERGENCE_TYPE_ORDER_MATTERS = false;
    const CONVERGENCE_EXCLUDED_DONORS = new Set();
    const CONVERGENCE_TIER_IDS = new Set([
        'ag', 'uber', 'ou', 'uubl', 'uu', 'rubl', 'ru', 'nubl', 'nu',
        'publ', 'pu', 'zubl', 'zu', 'nfe', 'lc',
    ]);

    const convergenceIndexCache = new Map();
    const convergenceMoveCache = new Map();
    let convergenceBans = {species: new Set(), baseSpecies: new Set(), tiers: new Set(), unbanned: new Set()};

    function convergenceTypeKey(species) {
        const types = species.types.slice();
        if (!CONVERGENCE_TYPE_ORDER_MATTERS) types.sort();
        return types.join('/');
    }

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

    function parseConvergenceBanlist(html) {
        const sections = parseFormatSectionTokens(html, '[Gen 9] Convergence');
        if (!sections) return false;

        const next = {species: new Set(), baseSpecies: new Set(), tiers: new Set(), unbanned: new Set()};
        const unresolved = [];

        for (const token of sections.Bans || []) {
            const id = toID(token);
            if (CONVERGENCE_TIER_IDS.has(id)) {
                next.tiers.add(id);
                continue;
            }
            const sp = Dex.species.get(token);
            if (sp?.exists) {
                // A base-species ban covers every forme; a forme ban only that forme.
                (sp.name === (sp.baseSpecies || sp.name) ? next.baseSpecies : next.species).add(sp.id);
            } else {
                unresolved.push(token);
            }
        }

        for (const token of sections.Unbans || []) {
            const sp = Dex.species.get(token);
            if (sp?.exists) next.unbanned.add(sp.id);
        }

        convergenceBans = next;
        BL.conv.loaded = true;
        convergenceIndexCache.clear();
        convergenceMoveCache.clear();

        console.log(LOG, 'Loaded Convergence bans:', {
            species: [...next.species],
            baseSpecies: [...next.baseSpecies],
            tiers: [...next.tiers],
            unbanned: [...next.unbanned],
            unresolved,
        });

        refreshConvergenceSearch();
        return true;
    }

    function isConvergenceBanned(sp) {
        const b = convergenceBans;
        if (b.unbanned.has(sp.id)) return false;
        if (b.species.has(sp.id)) return true;
        if (b.baseSpecies.has(toID(sp.baseSpecies || sp.name))) return true;
        return !!sp.tier && b.tiers.has(toID(sp.tier));
    }

    // Rebuild the open search once the banlist arrives.
    function refreshConvergenceSearch() {
        const room = getTeambuilderRoom();
        const engine = room?.search?.engine;
        const typed = engine?.typedSearch;
        if (!fmtHas(typed?.format, CONVERGENCE_FORMAT_ID)) return;

        typed.baseResults = null;
        typed.baseIllegalResults = null;
        engine.results = null;

        const ui = room.search;
        if (typeof ui.update === 'function') ui.update();
        else if (typeof ui.updateResults === 'function') ui.updateResults();
    }

    function getConvergenceGroup(dex, species) {
        let index = convergenceIndexCache.get(dex.gen);

        if (!index) {
            index = new Map();

            for (const id of Object.keys(window.BattlePokedex || {})) {
                const sp = dex.species.get(id);
                if (!sp?.exists || sp.id !== id) continue;
                if (sp.battleOnly || sp.isNonstandard) continue;
                if (CONVERGENCE_EXCLUDED_DONORS.has(sp.id) || isConvergenceBanned(sp)) continue;

                const key = convergenceTypeKey(sp);
                if (!index.has(key)) index.set(key, []);
                index.get(key).push(sp);
            }

            for (const list of index.values()) list.sort((a, b) => a.name.localeCompare(b.name));
            convergenceIndexCache.set(dex.gen, index);
        }

        return index.get(convergenceTypeKey(species)) || [];
    }

    function getConvergenceMoveMap(search, original, species) {
        const key = `${search.dex.gen}|${convergenceTypeKey(species)}`;
        let map = convergenceMoveCache.get(key);
        if (map) return map;

        map = new Map();

        for (const member of getConvergenceGroup(search.dex, species)) {
            const rows = withSearchSpecies(search, member.name, () => original.call(search));
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

    function patchConvergenceMoveSearch() {
        return patchMethod(
            window.BattleMoveSearch?.prototype,
            'getBaseResults',
            '__qolConvMovePatched',
            (original) => function () {
                const results = original.call(this);
                if (!fmtHas(this.format, CONVERGENCE_FORMAT_ID) || !this.species) return results;

                if (!BL.conv.loaded) {
                    requestConvergenceBanlist();
                    return results;
                }

                const species = this.dex.species.get(this.species);
                if (!species?.exists) return results;

                const map = getConvergenceMoveMap(this, original, species);
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

                this.__qolConvDonors = donors;
                return extra.length ? mergeMoveResults(results, extra) : results;
            }
        );
    }

    // Everything (incl. hidden/special) goes under one "Abilities" header.
    function patchConvergenceAbilitySearch() {
        return patchMethod(
            window.BattleAbilitySearch?.prototype,
            'getBaseResults',
            '__qolConvAbilityPatched',
            (original) => function () {
                const results = original.call(this);
                if (!fmtHas(this.format, CONVERGENCE_FORMAT_ID) || !this.species) return results;

                if (!BL.conv.loaded) {
                    requestConvergenceBanlist();
                    return results;
                }

                const species = this.dex.species.get(this.species);
                if (!species?.exists) return results;

                const notes = results.filter((r) => r[0] === 'html');
                const own = results.filter((r) => r[0] === 'ability');
                if (!own.length) return results;

                const seen = new Set(own.map((r) => r[1]));
                const donors = {};
                const extra = [];

                for (const member of getConvergenceGroup(this.dex, species)) {
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
                this.__qolConvDonors = donors;

                return [...notes, ['header', 'Abilities'], ...own, ...extra];
            }
        );
    }

    function pokemonIconHtml(speciesId) {
        const icon = Dex.getPokemonIcon(speciesId);
        if (typeof icon !== 'string') return '';
        // Some client versions return a full <span>, others just the CSS.
        return icon.trim().startsWith('<') ? icon : `<span class="picon" style="${icon}"></span>`;
    }

    // Donor icon at the end of the row. Absolutely positioned so it doesn't
    // disturb the column layout, and pointer-events:none so clicks pass through.
    function decorateConvergenceRows() {
        const typed = getTeambuilderRoom()?.search?.engine?.typedSearch;
        const type = typed?.searchType;
        const donors = typed?.__qolConvDonors;

        const format = typed?.format;
        if (
            !fmtHas(format, CONVERGENCE_FORMAT_ID, 'crossevolution') ||
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

    let convergenceIconObserverInstalled = false;

    function installConvergenceDonorIcons() {
        if (convergenceIconObserverInstalled) return;
        convergenceIconObserverInstalled = true;

        let scheduled = false;

        // Runs at document-start, so observe documentElement (body may not exist yet).
        new MutationObserver(() => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => {
                scheduled = false;
                try {
                    decorateConvergenceRows();
                } catch (e) {
                    console.error(LOG, 'Convergence icons failed:', e);
                }
            });
        }).observe(document.documentElement, {childList: true, subtree: true});
    }

    // ============================================================
    // GENERIC AUTO BANLIST (every format)
    //
    // Same idea as TSAAA, but for any format: silently ask the server for
    // `/tier <format>`, parse its "Bans" and "Unbans" lines, and drop banned
    // Pokémon from the Pokémon search. Only species (and tier names such as
    // "Uber") are used; banned abilities/items/moves are ignored here.
    //
    // Formats with their own banlist handling are excluded, and so is
    // gen9aaaubers (its /tier reply is AAA Ubers, not Scalemons).
    // ============================================================

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

    function parseGenericBans(sections) {
        const bans = {
            species: new Set(), baseSpecies: new Set(), tiers: new Set(),
            unbanned: new Set(), unbannedBase: new Set(),
        };
        const isBase = (sp) => sp.name === (sp.baseSpecies || sp.name);

        for (const token of sections.Bans || []) {
            const id = toID(token);
            if (CONVERGENCE_TIER_IDS.has(id)) {
                bans.tiers.add(id);
                continue;
            }

            const sp = Dex.species.get(token);
            if (!sp?.exists) continue; // ability / item / move / clause
            // A base-species ban covers every forme; a forme ban only that forme.
            (isBase(sp) ? bans.baseSpecies : bans.species).add(sp.id);
        }

        for (const token of sections.Unbans || []) {
            const sp = Dex.species.get(token);
            if (!sp?.exists) continue;
            bans.unbanned.add(sp.id);
            if (isBase(sp)) bans.unbannedBase.add(sp.id);
        }

        return bans;
    }

    function isBannedByList(bans, sp) {
        if (!sp?.exists) return false;

        const baseId = toID(sp.baseSpecies || sp.name);
        if (bans.unbanned.has(sp.id) || bans.unbannedBase.has(baseId)) return false;

        return bans.species.has(sp.id) ||
            bans.baseSpecies.has(baseId) ||
            (!!sp.tier && bans.tiers.has(toID(sp.tier)));
    }

    // Called for every /raw reply. Returns null if it isn't ours, otherwise
    // {suppress}; suppress is true only for the reply to our own silent request.
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

        entry.bans = parseGenericBans(sections);
        entry.loaded = true;

        console.log(LOG, `Loaded bans for ${title}:`, {
            species: [...entry.bans.species],
            baseSpecies: [...entry.bans.baseSpecies],
            tiers: [...entry.bans.tiers],
            unbanned: [...entry.bans.unbanned],
        });

        const suppress = entry.silent;
        entry.silent = false; // later manual /tier replies show normally

        refreshGenericBanSearch();
        return {suppress};
    }

    // Rebuild the open Pokémon search once a banlist arrives.
    function refreshGenericBanSearch() {
        const room = getTeambuilderRoom();
        const engine = room?.search?.engine;
        const typed = engine?.typedSearch;
        if (!typed || typed.searchType !== 'pokemon') return;

        engine.results = null;

        const ui = room.search;
        if (typeof ui.update === 'function') ui.update();
        else if (typeof ui.updateResults === 'function') ui.updateResults();
    }

    // Filters the FINAL result list (so banned mons vanish whether they were in
    // the legal list or the "Illegal results" list, and stale caches can't hide
    // the filter). The "natdex" chip means "complete dex", so it skips this.
    function patchGenericBanSearchLegality() {
        return patchMethod(
            window.BattlePokemonSearch?.prototype,
            'getResults',
            '__qolGenericBanPatched',
            (original) => function (filters, sortCol, reverseSort) {
                const results = original.call(this, filters, sortCol, reverseSort);
                if (this.searchType !== 'pokemon' || !Array.isArray(results)) return results;

                const id = genericBanFormatId(this.format);
                if (!id) return results;

                const entry = requestGenericBanlist(id); // no-op after the first call
                if (!entry.loaded) return results;

                if (Array.isArray(filters) && filters.some((f) => baseFilterType(f?.[0]) === 'natdex')) {
                    return results;
                }

                const kept = results.filter(
                    (row) => row[0] !== 'pokemon' || !isBannedByList(entry.bans, this.dex.species.get(row[1]))
                );
                if (kept.length === results.length) return results;

                // Drop any header left with nothing under it.
                return kept.filter((row, i) => row[0] !== 'header' || (kept[i + 1] && kept[i + 1][0] !== 'header'));
            }
        );
    }

    // ============================================================
    // GODLY GIFT
    // ============================================================

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

        const stats = Object.assign({}, species.baseStats);
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

    // ============================================================
    // ALPHABET CUP
    // ============================================================

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

    // Native learnset check OR Alphabet Cup letter rule.
    function pokemonMatchesMove(ctx, original, row, species, moveId) {
        if (original.call(ctx, row, [['move', moveId]])) return true;
        return fmtHas(ctx.format, ALPHABET_CUP_FORMAT_ID) && alphabetCupCanLearn(ctx.dex, species, moveId);
    }

    function patchAlphabetCupMoveSearch() {
        return patchMethod(
            window.BattleMoveSearch?.prototype,
            'getBaseResults',
            '__qolACMovePatched',
            (original) => function () {
                const results = original.call(this);
                if (!fmtHas(this.format, ALPHABET_CUP_FORMAT_ID) || !this.species) return results;

                const species = this.dex.species.get(this.species);
                if (!species?.exists) return results;

                // Find the native "Moves" and "Usually useless moves" headers.
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
                const newIds = alphabetCupMoveIds(this.dex, species);
                const allIds = results.filter((r) => r[0] === 'move').map((r) => r[1]).concat(newIds);
                const isUsable = (id) => {
                    if (typeof this.moveIsNotUseless !== 'function') return true;
                    try {
                        return !!this.moveIsNotUseless(id, species, allIds, this.set);
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
        );
    }

    // ============================================================
    // MOD DISPATCH
    // ============================================================

    const MOD_BASE_STATS = {
        [MOD.TIER_SHIFT]: ({dex, set}) => tierShiftBaseStats(dex, set),
        [MOD.BAD_N_BOOSTED]: ({dex, set}) => badNBoostedBaseStats(dex, set),
        [MOD.MIX_AND_MEGA]: ({dex, set}) => mixAndMegaBaseStats(dex, set),
        [MOD.GODLY_GIFT]: ({room, set}) => godlyGiftBaseStats(room, set),
        [MOD.CROSS_EVOLUTION]: ({dex, set}) => crossEvolutionBaseStats(dex, set),
        [MOD.SCALEMONS]: ({dex, set}) => scalemonsBaseStats(dex, set),
        [MOD.FRANTIC_FUSIONS]: ({dex, set}) => franticFusionsBaseStats(dex, set),
        [MOD.FLIPPED]: ({dex, set}) => flippedBaseStats(dex, set),
        [MOD.THREE_FIFTY_CUP]: ({dex, set}) => threeFiftyCupBaseStats(dex, set),
        [MOD.NATURE_SWAP]: ({dex, set}) => natureSwapBaseStats(dex, set),
    };

    // Fully modified baseStats for whichever mod is active, or null.
    const computeModBaseStats = (mod, ctx) => MOD_BASE_STATS[mod]?.(ctx) ?? null;

    // Stats used when sorting/rendering the Pokémon search list.
    function searchListStats(species, mod) {
        if (mod === MOD.BAD_N_BOOSTED) return badNBoostedModifiedStats(species);
        if (mod === MOD.SCALEMONS) return scalemonsModifiedStats(species);
        if (mod === MOD.TIER_SHIFT) return tierShiftModifiedStats(species) || species.baseStats;
        if (mod === MOD.FLIPPED) return flippedModifiedStats(species);
        if (mod === MOD.THREE_FIFTY_CUP) return threeFiftyCupModifiedStats(species) || species.baseStats;
        return species.baseStats;
    }

    // ============================================================
    // POKEMON SEARCH: CUSTOM FILTERS
    // ============================================================

    const toSearchId = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

    // A negated filter is an ordinary [type, value] tuple whose `type` has a
    // leading "!" (e.g. ['!weak', 'Fire']), so everything that consumes
    // `filters` (dedup, chip removal via "value".split(':')) works unchanged.
    const isNegatedFilterType = (type) => typeof type === 'string' && type.charCodeAt(0) === 33; // '!'
    const negatedFilterType = (type) => (isNegatedFilterType(type) ? type : '!' + type);
    const baseFilterType = (type) => (isNegatedFilterType(type) ? type.slice(1) : type);

    const ALLOWED_POKEMON_FILTER_TYPES = [
        'type', 'move', 'ability', 'egggroup', 'tier', 'weak', 'resists', 'neutral',
        'natdex', 'fe', 'recovery', 'pivot', 'priority', 'removal', 'into', 'from',
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
    };

    // Namespaced pseudo-ids so suggestion rows can't collide with real ids.
    const CUSTOM_TOGGLE_PREFIX = 'is ';
    const INTO_PREFIX = 'Into ';
    const FROM_PREFIX = 'From ';

    const isCrossFormat = (format) => fmtHas(format, 'crossevolution', 'franticfusions', 'inheritance');

    // "into <species>" -> target species (Cross Evolution / Frantic Fusions only).
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

    // Cross-evolved view of `speciesLike` as if nicknamed after `targetId`,
    // or null if that isn't legal.
    function crossEvolveView(dex, speciesLike, targetId) {
        const target = dex?.species?.get(targetId);
        if (!speciesLike?.name || !target?.exists) return null;

        const set = {species: speciesLike.name, name: target.name};

        if (getActiveMod() === MOD.INHERITANCE) {
            const inh = resolveInheritance(dex, set);
            if (!inh) return null;
            return {
                baseStats: Object.assign({}, inh.species.baseStats),
                types: inh.species.types.slice(),
                abilities: Object.assign({}, inh.donor.abilities),
            };
        }

        if (getActiveMod() === MOD.FRANTIC_FUSIONS) {
            const ff = resolveFranticFusion(dex, set);
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
            abilities: Object.assign({}, ce.cross.abilities),
        };
    }

    const isFullyEvolved = (species) => !!species && (!species.evos || species.evos.length === 0);

    const SPECIES_GROUPS = {
        // Sub-legendaries + Ultra Beasts + DLC legends (not box, not mythical)
        legendary: new Set([
            'articuno', 'zapdos', 'moltres', 'raikou', 'entei', 'suicune',
            'regirock', 'regice', 'registeel', 'latias', 'latios',
            'uxie', 'mesprit', 'azelf', 'heatran', 'regigigas', 'cresselia',
            'cobalion', 'terrakion', 'virizion', 'tornadus', 'thundurus', 'landorus',
            'typenull', 'silvally', 'tapukoko', 'tapulele', 'tapubulu', 'tapufini',
            'cosmog', 'cosmoem',
            'nihilego', 'buzzwole', 'pheromosa', 'xurkitree', 'celesteela', 'kartana',
            'guzzlord', 'poipole', 'naganadel', 'stakataka', 'blacephalon',
            'kubfu', 'urshifu', 'regieleki', 'regidrago', 'glastrier', 'spectrier',
            'enamorus', 'wochien', 'chienpao', 'tinglu', 'chiyu', 'terapagos',
        ]),
        boxlegend: new Set([
            'mewtwo', 'lugia', 'hooh', 'kyogre', 'groudon', 'rayquaza',
            'dialga', 'palkia', 'giratina', 'reshiram', 'zekrom', 'kyurem',
            'xerneas', 'yveltal', 'zygarde', 'solgaleo', 'lunala', 'necrozma',
            'zacian', 'zamazenta', 'eternatus', 'calyrex', 'koraidon', 'miraidon',
        ]),
        mythical: new Set([
            'mew', 'celebi', 'jirachi', 'deoxys', 'phione', 'manaphy', 'darkrai',
            'shaymin', 'arceus', 'victini', 'keldeo', 'meloetta', 'genesect',
            'diancie', 'hoopa', 'volcanion', 'magearna', 'marshadow', 'zeraora',
            'meltan', 'melmetal', 'zarude', 'pecharunt',
            'ogerpon', 'okidogi', 'munkidori', 'fezandipiti',
        ]),
        paradox: new Set([
            'greattusk', 'screamtail', 'brutebonnet', 'fluttermane', 'slitherwing',
            'sandyshocks', 'roaringmoon', 'walkingwake', 'gougingfire', 'ragingbolt',
            'irontreads', 'ironbundle', 'ironhands', 'ironjugulis', 'ironmoth',
            'ironthorns', 'ironvaliant', 'ironleaves', 'ironboulder', 'ironcrown',
            'miraidon', 'koraidon',

        ]),
        eeveelution: new Set([
            'vaporeon', 'jolteon', 'flareon', 'espeon', 'umbreon',
            'leafeon', 'glaceon', 'sylveon', 'eevee',
        ]),
    };

    const speciesInGroup = (species, kind) =>
    !!species && (SPECIES_GROUPS[kind]?.has(toID(species.baseSpecies || species.name)) || false);

    // Move-based toggles (Life Dew intentionally excluded from recovery).
    const TOGGLE_MOVE_LISTS = {
        recovery: [
            'healorder', 'junglehealing', 'milkdrink', 'moonlight', 'morningsun', 'recover',
            'roost', 'shoreup', 'slackoff', 'softboiled', 'strengthsap', 'synthesis', 'wish',
        ],
        pivot: ['uturn', 'voltswitch', 'flipturn', 'partingshot', 'chillyreception', 'teleport', 'shedtail'],
        removal: ['defog', 'rapidspin', 'mortalspin', 'courtchange', 'tidyup'],
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
                return getCustomToggleMoveIds(ctx.dex, kind)
                    .some((moveId) => pokemonMatchesMove(ctx, original, row, species, moveId));
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

    // Pushes a (possibly negated) filter chip. A negated and a positive filter
    // of the same type/value are distinct chips.
    function pushPokemonFilter(engine, type, value, negated) {
        if (!engine.filters) engine.filters = [];

        const storedType = negated ? negatedFilterType(type) : type;
        if (engine.sortCol === type) engine.sortCol = null;

        if (engine.filters.some((f) => f[0] === storedType && f[1] === value)) return true;

        engine.filters.push([storedType, value]);
        engine.results = null;
        engine.__qolEffectivenessMode = null;
        engine.__qolNegateMode = false;
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
        const attackingTypeName =
              String(attackingType).charAt(0).toUpperCase() + String(attackingType).slice(1).toLowerCase();

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

    function patchEffectivenessFilterText() {
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

    function patchEffectivenessSetType() {
        return patchEngineMethod('setType', '__qolEffectivenessSetTypePatched', (original) =>
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

    const RAW_HANDLERS = [
        ['[Gen 9] Tier Shift AAA', 'tsa', parseTSABanlist],
        ['[Gen 9] Godly Gift', 'gg', parseGodlyGiftRestricted],
        ['[Gen 9] Convergence', 'conv', parseConvergenceBanlist],
    ];

    function patchServerReceive() {
        return patchMethod(window.app, 'receive', '__qolPatched', (original) =>
                           function (data) {
            let payload = data;

            try {
                if (typeof data === 'string' && data.includes('/raw ')) {
                    let modified = false;

                    const kept = data.split('\n').filter((line) => {
                        if (!line.includes('/raw ')) return true;

                        const match = line.match(/\/raw (.*)/s);
                        if (!match) return true;

                        let suppress = false;

                        for (const [header, key, parse] of RAW_HANDLERS) {
                            if (!line.includes(header)) continue;
                            parse(match[1]);
                            if (BL[key].silent) {
                                BL[key].silent = false;
                                suppress = true;
                            }
                        }

                        // Generic banlist (every other format). Isolated so a bug
                        // here can never stop messages reaching the client.
                        try {
                            const generic = handleGenericBanlistRaw(match[1]);
                            if (generic?.suppress) suppress = true;
                        } catch (e) {
                            console.error(LOG, 'Generic banlist parse failed:', e);
                        }

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

    // ============================================================
    // PATCH: Pokémon search legality
    // ============================================================

    // Tier Shift AAA: ban list applied on top of the Gen 9 pool.
    function patchTsaSearchLegality() {
        return patchMethod(window.BattlePokemonSearch?.prototype, 'getBaseResults', '__qolPatched', (original) =>
                           function () {
            if (!fmtHas(this.format, 'tiershiftaaa')) return original.call(this);

            requestTSABanlist(); // no-op once loaded/requested

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

    // Godly Gift: other Restricted mons move to an "Illegal results" section.
    function patchGodlyGiftSearchLegality() {
        const proto = findPrototypeWithMethod(getEngine()?.typedSearch, 'getResults');

        return patchMethod(proto, 'getResults', '__qolGodlyGiftPatched', (original) =>
                           function (filters, sortCol, reverseSort) {
            const result = original.call(this, filters, sortCol, reverseSort);
            if (!fmtHas(this.format, 'godlygift') || this.searchType !== 'pokemon') return result;

            const room = getTeambuilderRoom();
            const isIllegal = room && getGodlyGiftIllegalChecker(room);
            if (!isIllegal) return result;

            const legal = [];
            const illegal = [];

            for (const row of result) {
                if (row[0] !== 'pokemon') {
                    legal.push(row);
                    continue;
                }
                (isIllegal(this.dex.species.get(row[1])) ? illegal : legal).push(row);
            }

            if (!illegal.length) return result;
            return legal.concat([['header', TL(['Illegal results'])], ...illegal]);
        }
                          );
    }

    // "natdex" chip: use the complete Pokédex as the legal pool (includes mons
    // the format normally considers dexited/illegal). The chip itself never
    // rejects a row (see patchEffectivenessSearchFilters).
    function patchNatdexSearchLegality() {
        return patchMethod(window.BattlePokemonSearch?.prototype, 'getResults', '__qolNatdexPatched', (original) =>
                           function (filters, sortCol, reverseSort) {
            const hasNatdex =
                  this.searchType === 'pokemon' &&
                  Array.isArray(filters) &&
                  filters.some(([rawType]) => baseFilterType(rawType) === 'natdex');

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

            return original.call(this, filters, sortCol, reverseSort);
        }
                          );
    }

    // Remembers the active into/from filters for sort().
    function patchIntoFilterTracker() {
        return patchMethod(window.BattlePokemonSearch?.prototype, 'getResults', '__qolIntoTrackerPatched', (original) =>
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

    // ============================================================
    // PATCH: Pokémon search filters (weak/resists/neutral/toggles/negation)
    // ============================================================

    function patchEffectivenessSearchFilters() {
        return patchMethod(window.BattlePokemonSearch?.prototype, 'filter', '__qolEffectivenessPatched', (original) =>
                           function (row, filters) {
            if (!filters?.length) return original.call(this, row, filters);
            if (row[0] !== 'pokemon') return true;

            const species = this.dex.species.get(row[1]);
            if (!species?.exists) return false;

            // Each filter is tested on its own (reusing native logic for
            // type/move/ability/egggroup/tier); a negated one flips the
            // result. Everything must hold at once.
            for (const [rawType, target] of filters) {
                const negated = isNegatedFilterType(rawType);
                const type = negated ? baseFilterType(rawType) : rawType;

                // natdex only widens the pool; it never rejects a row.
                if (type === 'natdex') continue;

                let matches;
                if (EFFECT_LABELS[type]) {
                    matches = pokemonMatchesEffectiveness(this.dex, species, type, target);
                } else if (type === 'into') {
                    matches = !!crossEvolveView(this.dex, species, target);
                } else if (type === 'from') {
                    matches = !!crossEvolveView(this.dex, this.dex.species.get(target), species.id);
                } else if (CUSTOM_TOGGLE_FILTERS[type]) {
                    matches = pokemonMatchesCustomToggle(this, original, row, species, type);
                } else if (type === 'move') {
                    matches = pokemonMatchesMove(this, original, row, species, target);
                } else {
                    matches = original.call(this, row, [[type, target]]);
                }

                if (negated ? matches : !matches) return false;
            }

            return true;
        }
                          );
    }

    function patchEffectivenessSearchBar() {
        return patchEngineMethod('find', '__qolEffectivenessPatched', (original) =>
                                 function (query) {
            const resetModes = () => {
                this.__qolEffectivenessMode = null;
                this.__qolNegateMode = false;
            };

            // Runs our textSearch with a cache key; false if nothing changed.
            const runTextSearch = (cacheKey, rawQuery) => {
                if (this.query === cacheKey && this.results) return false;

                this.query = cacheKey;
                this.exactMatch = true;
                this.results = this.textSearch(rawQuery);
                this.selection = this.getFirstResultIndex();
                return true;
            };

            if (this.typedSearch?.searchType !== 'pokemon') {
                resetModes();
                return original.call(this, query);
            }

            // "into X" / "X into" (Cross Evolution / Frantic Fusions)
            const intoSpecies = parseIntoQuery(this, query);
            const fromSpecies = intoSpecies ? null : parseFromQuery(this, query);
            if (intoSpecies || fromSpecies) {
                resetModes();

                const id = intoSpecies
                ? INTO_PREFIX + intoSpecies.id
                : FROM_PREFIX + fromSpecies.id;
                const results = [['header', 'Cross Evolve'], ['ability', id, 0, 4]];

                this.results = results;
                this.exactMatch = true;
                return results;
            }

            // "!" is a per-token modifier: it only affects the filter you're
            // about to add, not chips already added.
            const rawQuery = String(query || '').trim();
            const negateQuery = rawQuery.startsWith('!');
            const searchQuery = negateQuery ? rawQuery.slice(1).trim() : rawQuery;

            const match = searchQuery.match(/^(weak|resists|neutral)(?:\s+(.*))?$/i);

            if (!match) {
                this.__qolEffectivenessMode = null;

                if (!negateQuery) {
                    this.__qolNegateMode = false;
                    this.exactMatch = false;
                    return original.call(this, query);
                }

                // Native find() would toID() the query and drop the "!",
                // so bypass it and go straight to our textSearch.
                this.__qolNegateMode = true;
                return runTextSearch(`!:${toSearchId(searchQuery)}`, rawQuery);
            }

            this.__qolNegateMode = negateQuery;

            return runTextSearch(
                `${negateQuery ? '!' : ''}${match[1].toLowerCase()}:${toSearchId((match[2] || '').trim())}`,
                rawQuery
            );
        }
                                );
    }

    function patchEffectivenessAddFilter() {
        return patchEngineMethod('addFilter', '__qolEffectivenessAddFilterPatched', (original) =>
                                 function (entry) {
            if (this.typedSearch?.searchType !== 'pokemon') return original.call(this, entry);

            const rawValue = entry?.[1];
            const isStr = typeof rawValue === 'string';

            // "Into X" suggestion picked (only one "into" chip at a time).
            if (isStr && rawValue.startsWith(INTO_PREFIX)) {
                const target = this.dex.species.get(rawValue.slice(INTO_PREFIX.length));
                if (target?.exists) {
                    this.filters = (this.filters || []).filter((f) => f[0] !== 'into');
                    return addPokemonSearchFilter(this, 'into', target.id, false);
                }
            }

            // "X into" suggestion picked.
            if (isStr && rawValue.startsWith(FROM_PREFIX)) {
                const base = this.dex.species.get(rawValue.slice(FROM_PREFIX.length));
                if (base?.exists) {
                    this.filters = (this.filters || []).filter((f) => f[0] !== 'into' && f[0] !== 'from');
                    return addPokemonSearchFilter(this, 'from', base.id, false);
                }
            }

            // Toggle suggestion picked (natdex/fe/recovery/...).
            if (isStr && rawValue.startsWith(CUSTOM_TOGGLE_PREFIX)) {
                const key = rawValue.slice(CUSTOM_TOGGLE_PREFIX.length);

                if (CUSTOM_TOGGLE_FILTERS[key]) {
                    const negated = isNegatedFilterType(entry[0]) || this.__qolNegateMode;
                    return addPokemonSearchFilter(this, key, CUSTOM_TOGGLE_FILTERS[key], negated);
                }
            }

            // Type picked from our "Weak / Resists / Neutral" menu.
            if (this.__qolEffectivenessMode && entry?.[0] === 'type') {
                return addPokemonSearchFilter(this, this.__qolEffectivenessMode, entry[1], this.__qolNegateMode);
            }

            const rawType = entry?.[0];

            // Row picked during a "!<query>" search, or an already-negated filter.
            if (rawType && (isNegatedFilterType(rawType) || this.__qolNegateMode)) {
                return addPokemonSearchFilter(this, baseFilterType(rawType), entry[1], true);
            }

            // Directly supplied positive custom filters (e.g. from the console).
            if (EFFECT_LABELS[rawType] || CUSTOM_TOGGLE_FILTERS[rawType]) {
                return addPokemonSearchFilter(this, rawType, entry[1], false);
            }

            return original.call(this, entry);
        }
                                );
    }

    function patchEffectivenessTextSearch() {
        return patchEngineMethod('textSearch', '__qolEffectivenessTextSearchPatched', (original) =>
                                 function (query) {
            if (this.typedSearch?.searchType !== 'pokemon') return original.call(this, query);

            const rawQuery = String(query || '').trim();
            const negated = rawQuery.startsWith('!');
            const q = (negated ? rawQuery.slice(1) : rawQuery).trim().toLowerCase();
            const match = q.match(/^(weak|resists|neutral)(?:\s+(.*))?$/);

            if (!match) {
                this.__qolEffectivenessMode = null;

                if (!negated) {
                    this.__qolNegateMode = false;

                    // Drop native suggestions colliding with our keywords
                    // (e.g. the real "natdex" tier), then put ours first so
                    // they're the default (Enter) selection.
                    const native = (original.call(this, query) || [])
                    .filter((row) => !isReservedToggleCollisionRow(row));
                    const custom = customToggleSuggestions(rawQuery);

                    if (!custom.length) return native;
                    return (this.results = [['header', 'Mod Filters'], ...custom].concat(native));
                }

                this.__qolNegateMode = true;

                // Bare "!": every toggle plus every type. Abilities/moves
                // only show once you type their name (too many to list).
                if (!q) {
                    const results = [['header', 'Not'], ...customToggleSuggestions('')];

                    for (const typeName of Object.keys(window.BattleTypeChart || {})) {
                        results.push(['type', toSearchId(typeName), 0, typeName.length]);
                    }

                    const toggles = customToggleSuggestions(q);
                    this.results = (toggles.length ? [['header', 'Not'], ...toggles] : []).concat(suggestions);
                    this.exactMatch = true;
                    return results;
                }

                // "!<text>": native suggestion matching on the text after
                // the "!", keeping only type/ability/move/tier rows (there's
                // no way to exclude one named Pokémon, and no egg groups).
                const suggestions = (original.call(this, q) || []).filter(
                    ([rowType, rowId]) =>
                    (rowType === 'type' || rowType === 'ability' || rowType === 'move' || rowType === 'tier') &&
                    !Object.prototype.hasOwnProperty.call(CUSTOM_TOGGLE_FILTERS, toSearchId(rowId))
                );

                this.results = customToggleSuggestions(q).concat(suggestions);
                this.exactMatch = true;
                return this.results;
            }

            const typeChart = window.BattleTypeChart;
            if (!typeChart) {
                resetEffectivenessModes(this);
                return original.call(this, query);
            }

            const mode = match[1];
            const partial = toSearchId((match[2] || '').trim());
            const results = [['header', (negated ? 'Not ' : '') + EFFECT_LABELS[mode]]];

            for (const typeName of Object.keys(typeChart)) {
                const typeId = toSearchId(typeName);
                if (partial && !typeId.startsWith(partial)) continue;
                results.push(['type', typeId, 0, typeName.length]);
            }

            this.__qolEffectivenessMode = mode;
            this.__qolNegateMode = negated;
            this.results = results;
            this.exactMatch = true;
            return results;
        }
                                );
    }

    function resetEffectivenessModes(engine) {
        engine.__qolEffectivenessMode = null;
        engine.__qolNegateMode = false;
    }

    function patchEffectivenessSelectResult() {
        return patchEngineMethod('selectResult', '__qolEffectivenessSelectResultPatched', (original) =>
                                 function (index) {
            const mode = this.__qolEffectivenessMode;

            if (mode && this.results) {
                const result = this.results[index === undefined ? this.selection : index];

                if (result?.[0] === 'type') {
                    if (this.addFilter([mode, this.capitalizeFirst(result[1])])) {
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
        return patchEngineMethod('getResultName', '__qolEffectivenessResultNamePatched', (original) =>
                                 function (result) {
            if (this.typedSearch?.searchType !== 'pokemon') return original.call(this, result);

            const id = typeof result?.[1] === 'string' ? result[1] : '';

            if (id.startsWith(INTO_PREFIX)) {
                const sp = this.dex.species.get(id.slice(INTO_PREFIX.length));
                if (sp?.exists) return 'Into ' + sp.name;
            }

            if (id.startsWith(FROM_PREFIX)) {
                const sp = this.dex.species.get(id.slice(FROM_PREFIX.length));
                if (sp?.exists) return sp.name + ' into';
            }

            if (id.startsWith(CUSTOM_TOGGLE_PREFIX)) {
                const label = CUSTOM_TOGGLE_FILTERS[id.slice(CUSTOM_TOGGLE_PREFIX.length)];
                if (label) return this.__qolNegateMode ? `Not ${label}` : label;
            }

            const mode = this.__qolEffectivenessMode;

            if (mode && result?.[0] === 'type') {
                const typeName = this.capitalizeFirst
                ? this.capitalizeFirst(result[1])
                : String(result[1]).charAt(0).toUpperCase() + String(result[1]).slice(1);

                return `${this.__qolNegateMode ? 'Not ' : ''}${EFFECT_LABELS[mode]} ${typeName}`;
            }

            // Plain type/ability/move/tier suggestion during a "!<query>" search.
            if (
                !mode &&
                this.__qolNegateMode &&
                ['type', 'ability', 'move', 'tier'].includes(result?.[0])
            ) {
                return '!' + original.call(this, result);
            }

            return original.call(this, result);
        }
                                );
    }

    function patchEffectivenessTypeName() {
        return patchMethod(window.BattleSearch?.prototype, 'renderRow', '__qolEffectivenessTypeNamePatched', (original) =>
                           function (row, type, matchStart, matchEnd, errorMessage, attrs) {
            // Custom rows (toggles / into / from) render through a real,
            // harmless ability id to inherit the native markup, then the
            // visible name is swapped for our label.
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

            if (this.engine?.typedSearch?.searchType !== 'pokemon') return html;

            const mode = this.engine?.__qolEffectivenessMode;

            if (mode && type === 'type') {
                const prefix = this.engine?.__qolNegateMode
                ? `!${EFFECT_LABELS[mode]}`
                : EFFECT_LABELS[mode];

                return html.replace(
                    /(<span class="col namecol"><b>)([^<]+)(<\/b>)/,
                    `$1${prefix} $2$3`
                );
            }

            // Plain type/ability/move/tier row during a "!<query>" search.
            if (
                !mode &&
                this.engine?.__qolNegateMode &&
                ['type', 'ability', 'move', 'tier'].includes(type)
            ) {
                const nameColumn = type === 'move' ? 'movenamecol' : 'namecol';
                const pattern = new RegExp(`(<span class="col ${nameColumn}">)`);

                return html.replace(pattern, (m, openingTag, offset, fullHtml) => {
                    // Avoid adding a second "!" if this row was already prefixed.
                    const after = fullHtml.slice(offset + openingTag.length);
                    return after.startsWith('!') || after.startsWith('<b>!</b>')
                        ? openingTag
                    : `${openingTag}!`;
                });
            }

            return html;
        }
                          );
    }

    // Patches that need the live search engine. The engine's existence gates
    // the whole group; selectResult is best-effort (not required for success).
    function patchEngineSearch() {
        if (!getEngine()) return false;

        patchEffectivenessSelectResult();

        return [
            patchEffectivenessSearchBar(),
            patchEffectivenessTextSearch(),
            patchEffectivenessAddFilter(),
            patchEffectivenessResultNames(),
        ].every(Boolean);
    }

    // ============================================================
    // PATCH: Pokémon search sort + row display
    // ============================================================

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
            if (!SEARCH_LIST_MODS.has(mod)) return original.call(this, results, sortCol, reverseSort);

            return sortBy((id) => searchListStats(dex.species.get(id), mod));
        }
                          );
    }

    function patchSearchRenderer() {
        return patchMethod(window.BattleSearch?.prototype, 'renderPokemonRow', '__qolPatched', (original) =>
                           function (pokemon, matchStart, matchLength, errorMessage, attrs) {
            const call = (mon, err) =>
            original.call(this, mon, matchStart, matchLength, err, attrs);

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
            if (!pokemon || !SEARCH_LIST_MODS.has(mod)) return call(pokemon, errorMessage);

            return call(Object.assign({}, pokemon, {baseStats: searchListStats(pokemon, mod)}), errorMessage);
        }
                          );
    }

    // ============================================================
    // PATCH: Teambuilder stat calculation (all mods)
    // ============================================================

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

    // In-battle stat guesser (Tier Shift / Scalemons / Frantic Fusions / etc).
    function patchBattleStatGuesserGetStat() {
        return patchMethod(window.BattleStatGuesser?.prototype, 'getStat', '__qolBattlePatched', (original) =>
                           function (stat, set, evOverride, natureOverride) {
            const callOriginal = () => original.call(this, stat, set, evOverride, natureOverride);

            const formatid = fmtId(this.formatid);
            if (!set?.species || !this.dex?.species?.get) return callOriginal();

            let baseStats = null;
            if (formatid.includes('tiershift')) baseStats = tierShiftBaseStats(this.dex, set);
            else if (formatid.includes('aaaubers') || formatid.includes('scalemons')) baseStats = scalemonsBaseStats(this.dex, set);
            else if (formatid.includes('flipped')) baseStats = flippedBaseStats(this.dex, set);
            else if (formatid.includes('350cup')) baseStats = threeFiftyCupBaseStats(this.dex, set);
            else if (formatid.includes('franticfusions')) baseStats = franticFusionsBaseStats(this.dex, set);
            else if (formatid.includes('natureswap')) baseStats = natureSwapBaseStats(this.dex, set);
            if (!baseStats) return callOriginal();

            return withSpeciesBaseStats(this.dex, set.species, baseStats, callOriginal);
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
            if (!baseStats) return callOriginal();

            return withSpeciesBaseStats(this.dex, set.species, baseStats, callOriginal);
        }
                          );
    }

    // ============================================================
    // PATCH: base stat column + Mix and Mega speed note
    // ============================================================

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

    function patchUpdateStatForm() {
        return patchMethod(window.TeambuilderRoom?.prototype, 'updateStatForm', '__qolPatched', (original) =>
                           function (setGuessed) {
            const result = original.call(this, setGuessed);

            applyModBaseStatColumn(this);
            if (getActiveMod(this) === MOD.MIX_AND_MEGA && this.curSet?.species) {
                renderMixAndMegaSpeedNote(this);
            }
            return result;
        }
                          );
    }

    function patchStatGraphBaseColumn() {
        const proto = window.TeambuilderRoom?.prototype;
        const a = patchMethod(proto, 'updateStatGraph', '__qolStatGraphPatched', (original) =>
                              function (...args) {
            const result = original.apply(this, args);
            applyModBaseStatColumn(this);
            return result;
        }
                             );
        const b = patchMethod(proto, 'natureChange', '__qolNatureChangePatched', (original) =>
                              function (...args) {
            const result = original.apply(this, args);
            applyModBaseStatColumn(this);
            return result;
        }
                             );
        return a && b;
    }

    function patchStatSlide() {
        return patchMethod(window.TeambuilderRoom?.prototype, 'statSlide', '__qolPatched', (original) =>
                           function (...args) {
            const result = original.apply(this, args);
            if (getActiveMod(this) === MOD.MIX_AND_MEGA) updateMixAndMegaSpeedNote(this);
            return result;
        }
                          );
    }

    // ============================================================
    // PATCH: type icons + ability preview (Mix and Mega / Cross Evolution)
    // ============================================================

    // The Details pane's type icons come from the *named* species with no
    // awareness of the item/nickname, so post-process the HTML it returns.
    // Also covers switching mons and page load.
    function patchRenderSetTypeIcons() {
        return patchMethod(window.TeambuilderRoom?.prototype, 'renderSet', '__qolMixAndMegaPatched', (original) =>
                           function (set, i) {
            const html = original.call(this, set, i);
            if (!set?.species) return html;

            const types = modifiedTypes(getActiveMod(this), this.curTeam?.dex, set);
            if (!types) return html;

            return html.replace(
                /(<div class="setcell setcell-typeicons">)[\s\S]*?(<\/div>)/,
                `$1${types.map((t) => Dex.getTypeIcon(t)).join('')}$2`
            );
        }
                          );
    }

    // Live-updates the type icon cell when the item changes (chartSet's own
    // 'item' case only refreshes the sprite/item icon).
    function patchChartSetMixAndMegaTypes() {
        return patchMethod(window.TeambuilderRoom?.prototype, 'chartSet', '__qolMixAndMegaPatched', (original) =>
                           function (val, selectNext) {
            const inputName = this.curChartName;
            const result = original.call(this, val, selectNext);

            const mod = getActiveMod(this);
            // Camomons: refresh on any pick (species pick blanks the icons,
            // move picks fill them). Mix and Mega: only on item.
            if (mod === MOD.CAMOMONS || (mod === MOD.MIX_AND_MEGA && inputName === 'item')) {
                refreshTypeIcons(this);
            }
            return result;
        }
                          );
    }

    // Mirrors the native "Will be X after Mega Evolving" note for real Mega
    // species, triggered by the MnM item instead.
    function patchMixAndMegaAbilityPreview() {
        return patchMethod(window.BattleAbilitySearch?.prototype, 'getBaseResults', '__qolMixAndMegaPatched', (original) =>
                           function () {
            const results = original.call(this);
            if (!fmtHas(this.format, 'mixandmega') || !this.set?.item) return results;

            const futureAbility = mixAndMegaFutureAbility(this.dex, this.set);
            if (!futureAbility) return results;

            return [['html', `Will be <strong>${futureAbility}</strong> after Mega Evolving.`], ...results];
        }
                          );
    }

    // ============================================================
    // PATCH: in-battle hover speed range
    // ============================================================

    function wrapSpeedRange(original) {
        return function (pokemon, ...args) {
            const callOriginal = () => original.call(this, pokemon, ...args);

            if (!pokemon?.getSpecies) return callOriginal();

            const species = pokemon.getSpecies();
            const battle = this.battle;
            if (!species?.baseStats || !battle) return callOriginal();

            const shifted = (baseStats) =>
            withOverriddenGetSpecies(pokemon, Object.assign({}, species, {baseStats}), callOriginal);
            const speBonus = (n) =>
            shifted(Object.assign({}, species.baseStats, {spe: species.baseStats.spe + n}));

            const formatId = fmtId(battle.format?.id || battle.format?.name);

            // Tier Shift
            const isTierShift =
                  formatId.includes('tiershift') ||
                  Object.keys(battle.rules || {}).some((r) => String(r).toLowerCase().includes('tier shift'));

            if (isTierShift) {
                const boost = getTierShiftBoost(species.tier);
                if (boost) return speBonus(boost);
            }

            // Scalemons
            if (formatId.includes('aaaubers') || formatId.includes('scalemons')) {
                return shifted(scalemonsModifiedStats(species));
            }

            // Frantic Fusions
            if (formatId.includes('franticfusions')) {
                const donor = battle.dex?.species?.get(pokemon.name);
                if (donor?.exists && !donor.battleOnly && donor.id !== species.id) {
                    return speBonus(Math.floor(donor.baseStats.spe / 4));
                }
            }

            // Mix and Mega
            if (formatId.includes('mixandmega') && pokemon.item) {
                const item = battle.dex?.items?.get?.(pokemon.item);
                const delta = item?.exists ? mixAndMegaStatDelta(battle.dex, item, 'spe') : 0;
                if (delta) return speBonus(delta);
            }

            return callOriginal();
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

    // ============================================================
    // MOVE SEARCH: CUSTOM FILTERS
    //
    // Type the keyword with no prefix ("sf", "dance", "stab"...), pick the
    // suggestion at the top, and it becomes a filter chip. Chips AND together
    // and combine with the native Type / Category / Pokémon filters.
    // ============================================================

    const MOVE_FILTER_TYPE = 'mv-';
    const MOVE_ROW_PREFIX = 'mvf ';
    const COVERAGE_PREFIX = 'Coverage ';

    const ALWAYS_CRIT_MOVES = new Set(['frostbreath', 'stormthrow', 'wickedblow', 'surgingstrikes', 'flowertrick']);
    const PHAZE_MOVES = new Set(['whirlwind', 'roar', 'dragontail', 'circlethrow']);
    const EXTRA_RECOIL_MOVES = new Set(['mindblown', 'steelbeam', 'chloroblast', 'highjumpkick', 'supercellslam', 'axekick']);

    // Client Move objects don't carry every field, so fall back to raw dex data.
    const rawMove = (move) => window.BattleMovedex?.[move?.id] || {};
    const moveField = (move, key) => move?.[key] ?? rawMove(move)[key];
    const moveFlag = (move, flag) => !!moveField(move, 'flags')?.[flag];
    const isDamaging = (move) => move.category !== 'Status';

    function hasSecondary(move) {
        const s = moveField(move, 'secondaries') || moveField(move, 'secondary');
        return Array.isArray(s) ? s.length > 0 : !!s;
    }

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

    const MOVE_TOGGLES = {
        sf: {
            label: 'Sheer Force', aliases: ['sheerforce'],
            desc: 'Damaging moves with a secondary effect',
            test: (m) => isDamaging(m) && hasSecondary(m),
        },
        slicing: {
            label: 'Slicing', aliases: ['slice', 'sharpness'],
            desc: 'Slicing moves (Sharpness)',
            test: (m) => moveFlag(m, 'slicing'),
        },
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
        contact: {
            label: 'Contact', aliases: [],
            desc: 'Moves that make contact',
            test: (m) => moveFlag(m, 'contact'),
        },
        punch: {
            label: 'Punch', aliases: ['punching'],
            desc: 'Punching moves (Iron Fist)',
            test: (m) => moveFlag(m, 'punch'),
        },
        recovery: {
            label: 'Recovery', aliases: ['heal', 'triage'],
            desc: 'Every move boosted by Triage (incl. draining moves)',
            test: (m) => moveFlag(m, 'heal'),
        },
        crit: {
            label: 'Crit', aliases: ['critical', 'highcrit'],
            desc: 'High crit ratio or always crits',
            test: (m) => ALWAYS_CRIT_MOVES.has(m.id) || moveField(m, 'critRatio') > 1 || !!moveField(m, 'willCrit'),
        },
        dance: {
            label: 'Dance', aliases: ['dancing'],
            desc: 'Dance moves (Dancer)',
            test: (m) => moveFlag(m, 'dance'),
        },
        priority: {
            label: 'Priority', aliases: ['prio'],
            desc: 'Moves with priority above 0',
            test: (m) => m.priority > 0,
        },
        sound: {
            label: 'Sound', aliases: [],
            desc: 'Sound moves',
            test: (m) => moveFlag(m, 'sound'),
        },
        phaze: {
            label: 'Phaze', aliases: ['phazing', 'forceswitch'],
            desc: 'Forces the target out',
            test: (m) => PHAZE_MOVES.has(m.id) || !!moveField(m, 'forceSwitch'),
        },
    };



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

        if (!rows.length) {
            return [['html', '']];
        }
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

    // ---------- suggestions / rows ----------

    const isMoveCustomFilter = (t) =>
    typeof t === 'string' && (isNegatedFilterType(t) || t.startsWith(MOVE_FILTER_TYPE));

    function moveToggleSuggestions(query, minLen = 2) {
        const q = toSearchId(query);
        if (q.length < minLen) return [];

        const rows = [];
        for (const [key, def] of Object.entries(MOVE_TOGGLES)) {
            const names = [key, def.label, ...def.aliases].map(toSearchId);
            if (names.some((n) => n.startsWith(q))) rows.push(['ability', MOVE_ROW_PREFIX + key, 0, 0]);
        }
        return rows;
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

    function pushMoveFilter(engine, type, value) {
        if (!engine.filters) engine.filters = [];
        if (!engine.filters.some((f) => f[0] === type && f[1] === value)) engine.filters.push([type, value]);
        engine.results = null;
        engine.__qolMoveNegate = false;
        return true;
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
                const type = negated ? baseFilterType(rawType) : rawType;

                let matches;
                if (type.startsWith(MOVE_FILTER_TYPE)) {
                    const key = type.slice(MOVE_FILTER_TYPE.length);
                    if (key === 'cov') matches = moveCovers(this.dex, move, coverageTypesFromValue(value));
                    else matches = !!MOVE_TOGGLES[key]?.test(move, this);
                } else {
                    // negated native filter (type / category)
                    matches = original.call(this, row, [[type, value]]);
                }
                return negated ? !matches : matches;
            });
        }
                          );
    }

    // Native find() runs toID() on the query, which would destroy "!" and
    // "coverage fire, steel", so those bypass it.
    function patchMoveFilterFind() {
        return patchEngineMethod('find', '__qolMoveFilterFindPatched', (original) =>
                                 function (query) {
            if (this.typedSearch?.searchType !== 'move') return original.call(this, query);

            const raw = String(query || '').trim();
            if (!raw.startsWith('!') && !isCoverageQuery(raw)) {
                this.__qolMoveNegate = false;
                this.exactMatch = !isCoverageQuery(raw);
                return original.call(this, query);
            }

            const key = 'mv:' + raw.toLowerCase();
            if (this.query === key && this.results) return false;

            this.query = key;
            this.exactMatch = true;
            this.results = this.textSearch(raw);
            this.selection = this.getFirstResultIndex();
            return true;
        }
                                );
    }

    function patchMoveFilterTextSearch() {
        return patchEngineMethod('textSearch', '__qolMoveFilterTextSearchPatched', (original) =>
                                 function (query) {
            if (this.typedSearch?.searchType !== 'move') return original.call(this, query);

            const raw = String(query || '').trim();
            const negated = raw.startsWith('!');
            const body = (negated ? raw.slice(1) : raw).trim();
            this.__qolMoveNegate = negated;

            if (isCoverageQuery(body)) {
                this.results = coverageSuggestions(body);
                this.exactMatch = false;
                return this.results;
            }

            if (!negated) {
                const native = original.call(this, query) || [];
                const rows = moveToggleSuggestions(body);
                if (!rows.length) return native;
                return (this.results = [['header', 'Move filters'], ...rows].concat(native));
            }

            // "!<text>": our toggles + native type/category suggestions.
            // Bare "!" lists everything.
            const native = body
            ? (original.call(this, body) || []).filter((r) => r[0] === 'type' || r[0] === 'category')
            : [
                ...allTypeNames().map((t) => ['type', t.id, 0, 0]),
                ...['physical', 'special', 'status'].map((c) => ['category', c, 0, 0]),
            ];

            this.results = [['header', 'Not'], ...moveToggleSuggestions(body, 0), ...native];
            this.exactMatch = true;
            return this.results;
        }
                                );
    }

    function patchMoveFilterAddFilter() {
        return patchEngineMethod('addFilter', '__qolMoveFilterAddPatched', (original) =>
                                 function (entry) {
            if (this.typedSearch?.searchType !== 'move') return original.call(this, entry);

            const negated = !!this.__qolMoveNegate;
            const type = entry?.[0];
            const id = entry?.[1];

            if (typeof id === 'string' && id.toLowerCase().startsWith(MOVE_ROW_PREFIX)) {
                const info = moveFilterRowInfo(id);
                return info ? pushMoveFilter(this, (negated ? '!' : '') + info.type, info.value) : false;
            }

            if (negated && (type === 'type' || type === 'category')) {
                return pushMoveFilter(this, '!' + type, this.capitalizeFirst(id));
            }

            return original.call(this, entry);
        }
                                );
    }

    function patchMoveFilterResultNames() {
        return patchEngineMethod('getResultName', '__qolMoveFilterNamePatched', (original) =>
                                 function (result) {
            const id = typeof result?.[1] === 'string' ? result[1] : '';
            if (this.typedSearch?.searchType === 'move' && id.toLowerCase().startsWith(MOVE_ROW_PREFIX)) {
                const info = moveFilterRowInfo(id);
                if (info) return (this.__qolMoveNegate ? '!' : '') + info.label;
            }
            return original.call(this, result);
        }
                                );
    }

    function patchMoveFilters() {
        if (!getEngine()) return false;

        return [
            patchMoveSearchFilters(),
            patchMoveFilterFind(),
            patchMoveFilterTextSearch(),
            patchMoveFilterAddFilter(),
            patchMoveFilterResultNames(),
        ].every(Boolean);
    }

    // Rewrites our suggestion rows after they render (so it doesn't matter how
    // the client builds them), and adds "!" to native type/category rows
    // while negating.
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

    let moveFilterDecoratorInstalled = false;

    function installMoveFilterRowDecorator() {
        if (moveFilterDecoratorInstalled) return;
        moveFilterDecoratorInstalled = true;

        let scheduled = false;
        new MutationObserver(() => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => {
                scheduled = false;
                                try {
                    decorateMoveFilterRows();
                    decoratePokemonFilterRows();
                } catch (e) {
                    console.error(LOG, 'Move filter rows failed:', e);
                }
            });
        }).observe(document.documentElement, {childList: true, subtree: true});
    }

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

    // ============================================================
    // PATCH EVERYTHING
    // ============================================================

    function patchEverything() {
        const results = [
            patchServerReceive(),
            patchTsaSearchLegality(),
            patchGodlyGiftSearchLegality(),
            patchNatdexSearchLegality(),
            patchGenericBanSearchLegality(),

            patchSuggestedAbilities(),

            patchEffectivenessSearchFilters(),
            patchEffectivenessTypeName(),
            patchEffectivenessFilterText(),
            patchEffectivenessSetType(),
            patchEngineSearch(),
            patchMoveFilters(),

            patchCrossEvolutionMoveSearch(),
            patchCrossEvolutionAbilitySearch(),
            patchAlphabetCupMoveSearch(),

            patchInheritanceMoveSearch(),
            patchFlatAbilitySearch(),
            patchSearchCacheBust(),
            patchIntoFilterTracker(),
            patchCrossEvolutionIntoSelect(),

            patchConvergenceMoveSearch(),
            patchConvergenceAbilitySearch(),
            patchUpdateStatForm(),
            patchStatGraphBaseColumn(),
            patchSearchSort(),
            patchSearchRenderer(),
            patchGetStat(),
            patchBattleStatGuesserGetStat(),
            patchBattleStatGuesserGuess(),
            patchStatSlide(),
            patchRenderSetTypeIcons(),
            patchChartSetMixAndMegaTypes(),
            patchMixAndMegaAbilityPreview(),
            patchTooltipSpeedRange(),
        ];

        // Kick off any needed banlist fetches for the current format.
        isGodlyGiftFormat(window.room);
        isTierShiftAAAFormat(window.room);
        isConvergenceFormat(window.room);

        return results.every(Boolean);
    }

    // ============================================================
    // KEEP PATCHES APPLIED (room/search objects get rebuilt, e.g. after a battle)
    // ============================================================

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

        // Fast while loading, slow watchdog afterwards.
        setTimeout(patchLoop, ok ? 1000 : 100);
    }

    patchLoop();

    let attempts = 0;
    const MAX_ATTEMPTS = 300; // ~30s at 100ms

    const patchInterval = setInterval(() => {
        attempts++;

        if (patchEverything()) {
            clearInterval(patchInterval);
            console.log(LOG, 'All patches applied');
        } else if (attempts >= MAX_ATTEMPTS) {
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
            return stats ? sumStats(stats) : 0;
        },
        getMixAndMegaBaseStats: (set) => mixAndMegaBaseStats(window.room?.curTeam?.dex, set),
        getMixAndMegaTypes: (set) => mixAndMegaModifiedTypes(window.room?.curTeam?.dex, set),
        getMixAndMegaFutureAbility: (set) => mixAndMegaFutureAbility(window.room?.curTeam?.dex, set),
        getCrossEvolutionBaseStats: (set) => crossEvolutionBaseStats(window.room?.curTeam?.dex, set),
        getCrossEvolutionTypes: (set) => crossEvolutionTypes(window.room?.curTeam?.dex, set),
        getGodlyGiftBaseStats: godlyGiftDonation,
        getGodlyGiftIllegalChecker,
        parseGodlyGiftRestricted,
        isTierShiftFormat: (room) => getActiveMod(room) === MOD.TIER_SHIFT,
        isMixAndMegaFormat: (room) => getActiveMod(room) === MOD.MIX_AND_MEGA,
        isBadNBoostedFormat: (room) => getActiveMod(room) === MOD.BAD_N_BOOSTED,
        getFranticFusionsBaseStats: (set) => franticFusionsBaseStats(window.room?.curTeam?.dex, set),

        isGodlyGiftFormat,
        isTierShiftAAAFormat,
        requestTSABanlist,
        requestGGBanlist,
        requestConvergenceBanlist,
        patchBattleStatGuesser: patchBattleStatGuesserGetStat,
        pokemonMatchesEffectiveness,
        getBadNBoostedBaseStats: (set, room) => badNBoostedBaseStats(room?.curTeam?.dex, set),
        getScalemonsBaseStats: (set) => scalemonsBaseStats(window.room?.curTeam?.dex, set),
        isScalemonsFormat: (room) => getActiveMod(room) === MOD.SCALEMONS,
        isFullyEvolved,
        getCustomToggleMoveIds: (kind, dex) => getCustomToggleMoveIds(dex || window.room?.curTeam?.dex, kind),
        genericBanlists,
        patch: patchEverything,
    };
    installNatureSwapCamomonsListener();
    installCrossEvolutionNicknameListener();
    installConvergenceDonorIcons();
    installMoveFilterRowDecorator();
    installCoverageSeparatorFix();
})();




