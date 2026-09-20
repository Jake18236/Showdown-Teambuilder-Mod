// ==UserScript==
// @name         Pokémon Showdown Teambuilder QOL
// @namespace    https://github.com/Jake18236/showdown-teambuilder-mod
// @version      1.2
// @description  Makes the Showdown Teambuilder better for some OMs
// @match        https://play.pokemonshowdown.com/*
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/Jake18236/showdown-teambuilder-mod/main/showdown-teambuilder.user.js
// @downloadURL  https://raw.githubusercontent.com/Jake18236/showdown-teambuilder-mod/main/showdown-teambuilder.user.js
// ==/UserScript==

// yes this is all very messy and probably has some bugs I havent found
(function () {
    'use strict';

    console.log('[Tier Shift] Userscript loaded');

    let tsaBannedPokemon = new Set();
    let tsaBanlistLoaded = false;
    let godlyGiftRestricted = new Set();
    let godlyGiftRestrictedLoaded = false;
    let godlyGiftRequestSent = false;
    // for some ungodly reason, TSAAA banlists are not client side like EVERY OTHER FORMAT. IDK WHY BRUH
    function requestTSABanlist() {
        if (tsaBanlistLoaded) return;

        // Send /tier tiershiftaaa to the server.
        app.send('/tier tiershiftaaa');
    }

    function parseTSABanlist(html) {
        if (!html || !html.includes('[Gen 9] Tier Shift AAA')) {
            return false;
        }

        const doc = new DOMParser().parseFromString(html, 'text/html');

        const text = doc.body.textContent || '';

        const bansMatch = text.match(/Bans\s*-\s*(.*)/s);
        if (!bansMatch) return false;

        const bans = bansMatch[1]
        .split(',')
        .map(x => x.trim())
        .filter(Boolean);

        const banned = new Set();

        for (const name of bans) {
            const id = Dex.species.get(name).id;

            if (!id) continue;

            const species = Dex.species.get(name);

            // Only Pokémon bans belong in the Pokemon search.
            if (species && species.exists) {
                banned.add(id);
            }
        }

        tsaBannedPokemon = banned;
        tsaBanlistLoaded = true;

        console.log(
            '[Tier Shift AAA] Loaded server banlist:',
            [...tsaBannedPokemon]
        );

        return true;
    }

    function requestGGBanlist() {
        if (
            godlyGiftRestrictedLoaded ||
            godlyGiftRequestSent
        ) {
            return;
        }

        if (
            !window.app ||
            typeof app.send !== 'function'
        ) {
            return;
        }

        godlyGiftRequestSent = true;

        // Request the current Godly Gift rules and Restricted list.
        app.send('/tier godly gift');
    }

    function parseGodlyGiftRestricted(html) {
        if (
            !html ||
            !html.includes('[Gen 9] Godly Gift')
        ) {
            return false;
        }

        const doc =
              new DOMParser().parseFromString(
                  html,
                  'text/html'
              );

        const text =
              doc.body.textContent || '';

        const restrictedMatch =
              text.match(
                  /Restricted\s*-\s*(.*)$/s
              );

        if (!restrictedMatch) {
            console.warn(
                '[Godly Gift] Could not find Restricted list'
            );

            return false;
        }

        const restrictedNames =
              restrictedMatch[1]
        .split(',')
        .map(name => name.trim())
        .filter(Boolean);

        const restricted =
              new Set();

        for (const name of restrictedNames) {

            const species =
                  Dex.species.get(name);

            if (
                species &&
                species.exists
            ) {
                restricted.add(species.id);
            }
        }

        godlyGiftRestricted =
            restricted;

        godlyGiftRestrictedLoaded =
            true;

        window.godlyGiftRestricted =
            godlyGiftRestricted;

        console.log(
            '[Godly Gift] Loaded Restricted Pokémon:',
            [...godlyGiftRestricted]
        );

        return true;
    }

    function getGodlyGiftIllegalIds(room) {
        if (!isGodlyGiftFormat(room)) {
            return new Set();
        }

        const team =
              room?.curSetList;

        if (!Array.isArray(team)) {
            return new Set();
        }

        const restricted =
              window.godlyGiftRestricted;

        if (
            !restricted ||
            !restricted.size
        ) {
            return new Set();
        }

        // Find the God currently on the team.
        let godId = null;

        for (const set of team) {
            if (!set?.species) {
                continue;
            }

            const species =
                  room.curTeam.dex.species.get(
                      set.species
                  );

            if (
                species &&
                species.exists
            ) {
                const baseSpecies =
                      species.baseSpecies
                ? room.curTeam.dex.species.get(
                    species.baseSpecies
                )
                : species;

                if (
                    baseSpecies &&
                    baseSpecies.exists &&
                    restricted.has(baseSpecies.id)
                ) {
                    godId = baseSpecies.id;
                    break;
                }
            }
        }

        // No God yet.
        if (!godId) {
            return new Set();
        }

        // All other Restricted Pokémon are illegal.
        const illegal = new Set();

        for (const id of restricted) {
            if (id !== godId) {
                illegal.add(id);
            }
        }

        return illegal;
    }

    function isGodlyGiftRestrictedSpecies(species) {
        if (
            !species ||
            !species.exists
        ) {
            return false;
        }

        if (
            godlyGiftRestricted.has(species.id)
        ) {
            return true;
        }

        if (
            species.baseSpecies
        ) {
            const baseSpecies =
                  Dex.species.get(
                      species.baseSpecies
                  );

            if (
                baseSpecies &&
                baseSpecies.exists &&
                godlyGiftRestricted.has(
                    baseSpecies.id
                )
            ) {
                return true;
            }
        }

        return false;
    }

    function patchGodlyGiftStatGuesser() {
        const Guesser = window.BattleStatGuesser;

        if (!Guesser || !Guesser.prototype) {
            return false;
        }

        if (typeof Guesser.prototype.guess !== 'function') {
            return false;
        }

        if (Guesser.prototype.guess.__godlyGiftPatched) {
            return true;
        }

        const prototype = Guesser.prototype;
        const originalGuess = prototype.guess;

        prototype.guess = function (set) {
            const room =
                  window.app?.rooms?.teambuilder;

            if (
                !room ||
                !isGodlyGiftFormat(room) ||
                !set?.species ||
                !this.dex?.species?.get
            ) {
                return originalGuess.call(
                    this,
                    set
                );
            }

            const godlyGiftStat =
                  getGodlyGiftBaseStats(
                      room,
                      set
                  );

            if (!godlyGiftStat) {
                return originalGuess.call(
                    this,
                    set
                );
            }

            const originalGet =
                  this.dex.species.get;

            const originalSpecies =
                  originalGet.call(
                      this.dex.species,
                      set.species
                  );

            if (!originalSpecies?.exists) {
                return originalGuess.call(
                    this,
                    set
                );
            }

            const giftedSpecies =
                  Object.assign(
                      {},
                      originalSpecies
                  );

            giftedSpecies.baseStats =
                Object.assign(
                {},
                originalSpecies.baseStats
            );

            giftedSpecies.baseStats[
                godlyGiftStat.stat
            ] =
                godlyGiftStat.value;

            this.dex.species.get =
                function (name) {
                const result =
                      originalGet.call(
                          this,
                          name
                      );

                if (
                    result === originalSpecies
                ) {
                    return giftedSpecies;
                }

                return result;
            };

            try {
                return originalGuess.call(
                    this,
                    set
                );
            } finally {
                this.dex.species.get =
                    originalGet;
            }
        };

        prototype.guess.__godlyGiftPatched =
            true;

        prototype.guess.__godlyGiftOriginal =
            originalGuess;

        console.log(
            '[Godly Gift] Stat optimizer patched'
        );

        return true;
    }
    // ============================================================
    // TIER SHIFT RULES
    // ============================================================

    function getTierShiftBoost(tier) {
        switch (tier) {
                // UU / RUBL: +15
            case 'UU':
            case 'RUBL':
                return 15;

                // RU / NUBL: +20
            case 'RU':
            case 'NUBL':
                return 20;

                // NU / PUBL: +25
            case 'NU':
            case 'PUBL':
                return 25;

                // PU / ZU: +30
            case 'PU':
            case 'ZU':
            case 'ZUBL':
            case 'LC':
            case 'NFE':
                return 30;

                // Anything else
            default:
                return 0;
        }
    }


    // ============================================================
    // FORMAT DETECTION
    // ============================================================

    function isTierShiftFormat() {
        const room = window.room;

        if (!room || !room.curTeam) {
            return false;
        }

        const format = room.curTeam.format;

        return (
            format === 'gen9tiershift' ||
            format === 'gen9tiershiftaaa'
        );
    }

    function isMixAndMegaFormat() {
        const room = window.room;

        if (!room || !room.curTeam) {
            return false;
        }

        return room.curTeam.format === 'gen9mixandmega';
    }


    // ============================================================
    // MIX AND MEGA BASE STATS
    // ============================================================

    function getMixAndMegaBaseStats(set) {
        if (!set || !set.species || !set.item) return null;

        const room = window.room;

        if (!room || !room.curTeam || !room.curTeam.dex) {
            return null;
        }

        const dex = room.curTeam.dex;

        const originalSpecies =
              dex.species.get(set.species);

        const item =
              dex.items.get(set.item);

        if (!originalSpecies || !originalSpecies.exists) {
            return null;
        }

        if (!item || !item.exists) {
            return null;
        }

        let formeName = null;

        // --------------------------------------------------------
        // Mega Stones
        // --------------------------------------------------------

        if (item.megaStone) {
            formeName =
                Object.values(item.megaStone)[0];
        }

        // --------------------------------------------------------
        // Other MNM items
        //
        // itemUser identifies the forme associated with the item.
        // Example:
        // Lustrous Globe -> Palkia-Origin
        // --------------------------------------------------------

        if (!formeName && item.itemUser && item.itemUser.length) {
            formeName = item.itemUser[0];
        }

        if (!formeName) {
            return null;
        }

        const formeSpecies =
              dex.species.get(formeName);

        if (!formeSpecies || !formeSpecies.exists) {
            return null;
        }

        // --------------------------------------------------------
        // Find the base species whose stats are being modified.
        // --------------------------------------------------------

        let baseSpecies = formeSpecies;

        if (formeSpecies.name === 'Zygarde-Mega') {

            // MNM uses Zygarde-Complete -> Zygarde-Mega.
            baseSpecies =
                dex.species.get('Zygarde-Complete');

        } else if (formeSpecies.isMega && formeSpecies.battleOnly) {

            if (Array.isArray(formeSpecies.battleOnly)) {
                baseSpecies =
                    dex.species.get(
                    formeSpecies.battleOnly[0]
                );
            } else {
                baseSpecies =
                    dex.species.get(
                    formeSpecies.battleOnly
                );
            }

        } else if (formeSpecies.baseSpecies) {

            baseSpecies =
                dex.species.get(
                formeSpecies.baseSpecies
            );
        }

        if (!baseSpecies || !baseSpecies.exists) {
            return null;
        }

        const baseStats =
              Object.assign({}, originalSpecies.baseStats);

        // --------------------------------------------------------
        // Apply the forme's stat differences to the original
        // Pokémon.
        // --------------------------------------------------------

        for (const stat of [
            'atk',
            'def',
            'spa',
            'spd',
            'spe'
        ]) {

            const delta =
                  formeSpecies.baseStats[stat] -
                  baseSpecies.baseStats[stat];

            baseStats[stat] =
                Math.max(
                1,
                Math.min(
                    255,
                    baseStats[stat] + delta
                )
            );
        }

        return baseStats;
    }

    function getPreMegaSpeed(set) {
        if (!set || !set.species) return 0;

        const room = window.room;

        if (!room || !room.curTeam || !room.curTeam.dex) {
            return 0;
        }

        const species =
              room.curTeam.dex.species.get(set.species);

        if (!species || !species.exists) {
            return 0;
        }

        const base =
              species.baseStats.spe;

        const iv =
              set.ivs &&
              set.ivs.spe !== undefined
        ? set.ivs.spe
        : 31;

        const ev =
              set.evs &&
              set.evs.spe !== undefined
        ? set.evs.spe
        : 0;

        const level =
              set.level || 100;

        let speed =
            Math.floor(
                (
                    Math.floor(
                        2 * base +
                        iv +
                        Math.floor(ev / 4)
                    ) *
                    level
                ) / 100
            ) + 5;

        const nature =
              BattleNatures[set.nature];

        if (nature) {

            if (nature.plus === 'spe') {
                speed =
                    Math.floor(speed * 1.1);

            } else if (nature.minus === 'spe') {
                speed =
                    Math.floor(speed * 0.9);
            }
        }

        return speed;
    }

    function updateMixAndMegaSpeedNote(room) {
        if (!room || !room.$chart) return;

        const note =
              room.$chart.find('.mnm-speed-note');

        if (!note.length) return;

        const set = room.curSet;

        if (!set) return;

        const speed =
              getPreMegaSpeed(set);

        note.find('.mnm-speed-value').text(speed);
    }

    function updateMixAndMegaSpeedNotePosition(room) {

        if (!room || !room.$chart) {
            return;
        }

        const note =
              room.$chart.find('.mnm-speed-note');

        if (!note.length) {
            return;
        }

        const suggested =
              room.$chart.find('.statform .suggested');

        const hasGuessedSpread =
              suggested.length &&
              !suggested.text().includes(
                  'Please choose 4 moves'
              );

        if (hasGuessedSpread) {

            note.css(
                'top',
                '318px'
            );

        } else {

            note.css(
                'top',
                '300px'
            );
        }
    }

    // ============================================================
    // SHIFTED STAT
    // ============================================================

    function getShiftedStat(species, stat) {
        if (!species || !species.baseStats) {
            return 0;
        }

        const base = species.baseStats[stat];

        if (typeof base !== 'number') {
            return 0;
        }

        // HP is never boosted.
        if (stat === 'hp') {
            return base;
        }

        return base + getTierShiftBoost(species.tier);
    }


    // ============================================================
    // SHIFTED BST
    // ============================================================

    function getShiftedBST(species) {
        if (!species || !species.baseStats) {
            return 0;
        }

        const stats = species.baseStats;
        const boost = getTierShiftBoost(species.tier);

        return (
            stats.hp +
            (stats.atk + boost) +
            (stats.def + boost) +
            (stats.spa + boost) +
            (stats.spd + boost) +
            (stats.spe + boost)
        );
    }

    // ============================================================
    // PATCH: LEGALITY
    // ============================================================

    function patchTSABanlistReceiver() {
        if (!window.app || typeof app.receive !== 'function') {
            return false;
        }

        if (app.receive.__tsaPatched) {
            return true;
        }

        const originalReceive = app.receive;

        app.receive = function (data) {
            const result =
                  originalReceive.apply(this, arguments);

            try {
                if (typeof data !== 'string') {
                    return result;
                }

                // ----------------------------------------------------
                // TIER SHIFT AAA
                // ----------------------------------------------------

                if (
                    data.includes('[Gen 9] Tier Shift AAA') &&
                    data.includes('/raw ')
                ) {
                    const match =
                          data.match(/\|\/raw (.*)/);

                    if (match) {
                        parseTSABanlist(match[1]);
                    }
                }


                // ----------------------------------------------------
                // GODLY GIFT
                // ----------------------------------------------------

                if (
                    data.includes('[Gen 9] Godly Gift') &&
                    data.includes('/raw ')
                ) {
                    const match =
                          data.match(/\|\/raw (.*)/);

                    if (match) {
                        parseGodlyGiftRestricted(match[1]);
                    }
                }

            } catch (e) {
                console.error(
                    '[Tier Shift / Godly Gift] Failed to parse server data:',
                    e
                );
            }

            return result;
        };

        app.receive.__tsaPatched = true;

        console.log(
            '[Tier Shift / Godly Gift] Server receiver patched'
        );

        return true;
    }

    function patchBattlePokemonSearchLegality() {
        const SearchClass = window.BattlePokemonSearch;
        if (!SearchClass) return false;

        const prototype = SearchClass.prototype;
        if (!prototype || typeof prototype.getBaseResults !== 'function') {
            return false;
        }

        if (prototype.getBaseResults.__tierShiftLegalityPatched) {
            return true;
        }

        const originalGetBaseResults = prototype.getBaseResults;

        const TSA_BANNED_POKEMON = new Set([
            'arceus',
            'calyrexshadow',
            'decidueyehisui',
            'deoxysattack',
            'electrodehisui',
            'eternatus',
            'hooh',
            'hoopa',
            'kyuremblack',
            'miraidon',
            'necrozmaduskmane',
            'noivern',
            'rayquaza',
            'regigigas',
            'slaking',
            'weavile'
        ]);

        prototype.getBaseResults = function () {
            if (this.format !== 'tiershiftaaa') {
                return originalGetBaseResults.call(this);
            }

            /*
         * Get the GEN 9 legal pool.
         *
         * This must come from the Gen 9 teambuilder data,
         * NOT BattlePokedex and NOT Tier Shift's banlist.
         */
            const oldFormat = this.format;
            this.format = 'gen9';

            const gen9Results = originalGetBaseResults.call(this);

            this.format = oldFormat;

            /*
         * Now apply ONLY Tier Shift AAA's Pokemon bans.
         */
            return gen9Results.filter(result => {
                if (result[0] !== this.searchType) {
                    return true;
                }

                const id = result[1];

                // Direct TSA ban
                if (TSA_BANNED_POKEMON.has(id)) {
                    return false;
                }

                // Arceus is banned as a species, so all formes are banned.
                const species = this.dex.species.get(id);

                if (species?.baseSpecies === 'Arceus') {
                    return false;
                }

                return true;
            });
        };

        prototype.getBaseResults.__tierShiftLegalityPatched = true;

        console.log(
            '[Tier Shift] TSA legality: Gen 9 pool + TSA bans'
        );

        return true;
    }

    function patchGodlyGiftSearch() {
        const room =
              window.app?.rooms?.teambuilder;

        if (!room?.search?.engine?.typedSearch) {
            return false;
        }

        const search =
              room.search.engine.typedSearch;

        // Find the prototype that actually owns getResults().
        let prototype =
            Object.getPrototypeOf(search);

        while (
            prototype &&
            typeof prototype.getResults !== 'function'
        ) {
            prototype =
                Object.getPrototypeOf(prototype);
        }

        if (!prototype) {
            return false;
        }

        if (
            prototype.getResults
            .__godlyGiftPatched
        ) {
            return true;
        }

        const originalGetResults =
              prototype.getResults;

        prototype.getResults =
            function (
        filters,
         sortCol,
         reverseSort
        ) {

            const result =
                  originalGetResults.call(
                      this,
                      filters,
                      sortCol,
                      reverseSort
                  );

            if (
                this.format !== 'godlygift'
            ) {
                return result;
            }

            const room =
                  window.app?.rooms?.teambuilder;

            if (!room) {
                return result;
            }

            const illegalIds =
                  getGodlyGiftIllegalIds(room);

            if (!illegalIds.size) {
                return result;
            }

            // --------------------------------------------------------
            // Move all banned Restricted Pokémon and their formes
            // into Illegal results.
            // --------------------------------------------------------

            const legalResults = [];
            const illegalPokemon = [];

            for (const row of result) {

                if (
                    row[0] !== this.searchType
                ) {
                    legalResults.push(row);
                    continue;
                }

                const id = row[1];

                const isIllegal =
                      [...illegalIds].some(
                          bannedId =>
                          id === bannedId ||
                          id.startsWith(bannedId)
                      );

                if (isIllegal) {
                    illegalPokemon.push(row);
                } else {
                    legalResults.push(row);
                }
            }

            if (!illegalPokemon.length) {
                return result;
            }

            return legalResults.concat([
                [
                    'header',
                    TL(["Illegal results"])
                ],
                ...illegalPokemon
            ]);
        };

        prototype.getResults
            .__godlyGiftPatched = true;

        prototype.getResults
            .__godlyGiftOriginal =
            originalGetResults;

        console.log(
            '[Godly Gift] Search legality patched'
        );

        return true;
    }

    // ============================================================
    // PATCH: BATTLEPOKEMONSEARCH SORT
    // ============================================================


    function patchBattlePokemonSearch() {
        const SearchClass = window.BattlePokemonSearch;

        if (!SearchClass) {
            return false;
        }

        const prototype = SearchClass.prototype;

        if (
            !prototype ||
            typeof prototype.sort !== 'function'
        ) {
            return false;
        }

        // Don't patch twice.
        if (prototype.sort.__tierShiftPatched) {
            return true;
        }

        const originalSort = prototype.sort;

        function tierShiftSort(
        results,
         sortCol,
         reverseSort
        ) {

            // Normal formats use normal Showdown sorting.
            if (!isTierShiftFormat()) {
                return originalSort.call(
                    this,
                    results,
                    sortCol,
                    reverseSort
                );
            }

            const sortOrder =
                  reverseSort ? -1 : 1;


            // ----------------------------------------------------
            // INDIVIDUAL STAT SORTING
            // ----------------------------------------------------

            if (
                [
                    'hp',
                    'atk',
                    'def',
                    'spa',
                    'spd',
                    'spe'
                ].includes(sortCol)
            ) {
                return results.sort((a, b) => {

                    const species1 =
                          this.dex.species.get(a[1]);

                    const species2 =
                          this.dex.species.get(b[1]);

                    const stat1 =
                          getShiftedStat(
                              species1,
                              sortCol
                          );

                    const stat2 =
                          getShiftedStat(
                              species2,
                              sortCol
                          );

                    return (
                        (stat2 - stat1) *
                        sortOrder
                    );
                });
            }


            // ----------------------------------------------------
            // BST SORTING
            // ----------------------------------------------------

            if (sortCol === 'bst') {

                return results.sort((a, b) => {

                    const species1 =
                          this.dex.species.get(a[1]);

                    const species2 =
                          this.dex.species.get(b[1]);

                    const bst1 =
                          getShiftedBST(species1);

                    const bst2 =
                          getShiftedBST(species2);

                    return (
                        (bst2 - bst1) *
                        sortOrder
                    );
                });
            }


            return originalSort.call(
                this,
                results,
                sortCol,
                reverseSort
            );
        }

        tierShiftSort.__tierShiftPatched = true;
        tierShiftSort.__tierShiftOriginal =
            originalSort;

        prototype.sort = tierShiftSort;

        console.log(
            '[Tier Shift] BattlePokemonSearch.sort patched'
        );

        return true;
    }


    // ============================================================
    // PATCH: DISPLAYED POKEMON STATS
    // ============================================================

    function patchBattleSearchRenderer() {
        const SearchClass =
              window.BattleSearch;

        if (!SearchClass) {
            return false;
        }

        const prototype =
              SearchClass.prototype;

        if (
            !prototype ||
            typeof prototype.renderPokemonRow !==
            'function'
        ) {
            return false;
        }

        // Don't patch twice.
        if (
            prototype.renderPokemonRow
            .__tierShiftPatched
        ) {
            return true;
        }

        const originalRenderPokemonRow =
              prototype.renderPokemonRow;


        prototype.renderPokemonRow = function (
        pokemon,
         matchStart,
         matchLength,
         errorMessage,
         attrs
        ) {

            // ----------------------------------------------------
            // Normal formats
            // ----------------------------------------------------

            if (!isTierShiftFormat()) {
                return originalRenderPokemonRow.call(
                    this,
                    pokemon,
                    matchStart,
                    matchLength,
                    errorMessage,
                    attrs
                );
            }


            // ----------------------------------------------------
            // Error / missing Pokémon
            // ----------------------------------------------------

            if (!pokemon) {
                return originalRenderPokemonRow.call(
                    this,
                    pokemon,
                    matchStart,
                    matchLength,
                    errorMessage,
                    attrs
                );
            }


            const shiftedPokemon =
                  Object.assign({}, pokemon);

            shiftedPokemon.baseStats =
                Object.assign(
                {},
                pokemon.baseStats
            );

            shiftedPokemon.baseStats.hp =
                getShiftedStat(
                pokemon,
                'hp'
            );

            shiftedPokemon.baseStats.atk =
                getShiftedStat(
                pokemon,
                'atk'
            );

            shiftedPokemon.baseStats.def =
                getShiftedStat(
                pokemon,
                'def'
            );

            shiftedPokemon.baseStats.spa =
                getShiftedStat(
                pokemon,
                'spa'
            );

            shiftedPokemon.baseStats.spd =
                getShiftedStat(
                pokemon,
                'spd'
            );

            shiftedPokemon.baseStats.spe =
                getShiftedStat(
                pokemon,
                'spe'
            );


            // Give the original renderer the temporary
            // Tier Shift version.
            return originalRenderPokemonRow.call(
                this,
                shiftedPokemon,
                matchStart,
                matchLength,
                errorMessage,
                attrs
            );
        };


        prototype.renderPokemonRow
            .__tierShiftPatched = true;

        prototype.renderPokemonRow
            .__tierShiftOriginal =
            originalRenderPokemonRow;

        console.log(
            '[Tier Shift] BattleSearch.renderPokemonRow patched'
        );

        return true;
    }


    // ============================================================
    // PATCH: TEAMBUILDER STAT CALCULATION
    // ============================================================

    function isGodlyGiftFormat(room) {
        const isGodlyGift =
              room?.curTeam?.format === 'gen9godlygift';

        if (
            isGodlyGift &&
            !godlyGiftRestrictedLoaded &&
            !godlyGiftRequestSent
        ) {
            requestGGBanlist();
        }

        return isGodlyGift;
    }

    function getGodlyGiftBaseStats(room, set) {
        if (
            !room ||
            !room.curTeam ||
            !set
        ) {
            return null;
        }

        // ----------------------------------------------------
        // The Teambuilder's actual six-Pokemon set list.
        // ----------------------------------------------------

        const team =
              room.curSetList;

        if (
            !Array.isArray(team) ||
            !team.length
        ) {
            return null;
        }

        // ----------------------------------------------------
        // Current server Restricted list.
        // ----------------------------------------------------

        const restricted =
              window.godlyGiftRestricted;

        if (
            !restricted ||
            !restricted.size
        ) {
            return null;
        }

        // ----------------------------------------------------
        // Find the God.
        //
        // God = Restricted Pokemon on the team.
        // If there is no Restricted Pokemon,
        // the first Pokemon is the God.
        // ----------------------------------------------------

        let godSet = null;

        for (const teamSet of team) {

            if (!teamSet?.species) {
                continue;
            }

            const species =
                  room.curTeam.dex.species.get(
                      teamSet.species
                  );

            if (!species || !species.exists) {
                continue;
            }

            if (restricted.has(species.id)) {
                godSet = teamSet;
                break;
            }
        }

        // No Restricted Pokemon:
        // first slot becomes the God.
        if (!godSet) {
            godSet = team[0];
        }

        if (!godSet?.species) {
            return null;
        }

        // ----------------------------------------------------
        // Get the God's species.
        // ----------------------------------------------------

        const godSpecies =
              room.curTeam.dex.species.get(
                  godSet.species
              );

        if (
            !godSpecies ||
            !godSpecies.exists
        ) {
            return null;
        }
        // Godly Gift uses the God's BASIC FORM stats.


        let basicGodSpecies =
            godSpecies;

        if (godSpecies.baseSpecies) {

            const base =
                  room.curTeam.dex.species.get(
                      godSpecies.baseSpecies
                  );

            if (
                base &&
                base.exists
            ) {
                basicGodSpecies = base;
            }
        }

        // ----------------------------------------------------
        // Use the Teambuilder's actual current slot.
        //
        // curSetLoc:
        // 0 -> HP
        // 1 -> Atk
        // 2 -> Def
        // 3 -> SpA
        // 4 -> SpD
        // 5 -> Spe
        // ----------------------------------------------------

        const index =
              team.indexOf(set);

        if (
            index < 0 ||
            index > 5
        ) {
            return null;
        }

        const statForSlot = [
            'hp',
            'atk',
            'def',
            'spa',
            'spd',
            'spe'
        ];

        const donatedStat =
              statForSlot[index];

        // ----------------------------------------------------
        // The God itself keeps its own stats.
        // ----------------------------------------------------

        if (
            index === team.indexOf(godSet)
        ) {
            return null;
        }

        return {
            stat: donatedStat,
            value:
            basicGodSpecies.baseStats[
                donatedStat
            ]
        };
    }

    function patchTeambuilderGetStat() {
        const RoomClass =
              window.TeambuilderRoom;

        if (!RoomClass) {
            return false;
        }

        const prototype =
              RoomClass.prototype;

        if (
            !prototype ||
            typeof prototype.getStat !== 'function'
        ) {
            return false;
        }

        if (
            prototype.getStat.__tierShiftPatched
        ) {
            return true;
        }

        const originalGetStat =
              prototype.getStat;

        prototype.getStat = function (
        stat,
         set,
         evOverride,
         natureOverride
        ) {

            // ----------------------------------------------------
            // Normal formats
            // ----------------------------------------------------

            if (
                !isTierShiftFormat() &&
                !isMixAndMegaFormat() &&
                !isGodlyGiftFormat(this)
            ) {
                return originalGetStat.call(
                    this,
                    stat,
                    set,
                    evOverride,
                    natureOverride
                );
            }

            if (!set) {
                set = this.curSet;
            }

            if (!set) {
                return 0;
            }


            // ----------------------------------------------------
            // GODLY GIFT
            // ----------------------------------------------------

            if (isGodlyGiftFormat(this)) {

                const godlyGiftStat =
                      getGodlyGiftBaseStats(
                          this,
                          set
                      );

                if (godlyGiftStat) {

                    const species =
                          this.curTeam.dex.species.get(
                              set.species
                          );

                    if (
                        species &&
                        species.exists
                    ) {

                        const originalSpeciesGet =
                              this.curTeam.dex.species.get;

                        this.curTeam.dex.species.get =
                            function (name) {

                            const result =
                                  originalSpeciesGet.call(
                                      this,
                                      name
                                  );

                            if (result === species) {

                                const giftedSpecies =
                                      Object.assign(
                                          {},
                                          result
                                      );

                                giftedSpecies.baseStats =
                                    Object.assign(
                                    {},
                                    result.baseStats
                                );

                                giftedSpecies.baseStats[
                                    godlyGiftStat.stat
                                ] =
                                    godlyGiftStat.value;

                                return giftedSpecies;
                            }

                            return result;
                        };

                        try {
                            return originalGetStat.call(
                                this,
                                stat,
                                set,
                                evOverride,
                                natureOverride
                            );
                        } finally {
                            this.curTeam.dex.species.get =
                                originalSpeciesGet;
                        }
                    }
                }

                return originalGetStat.call(
                    this,
                    stat,
                    set,
                    evOverride,
                    natureOverride
                );
            }


            // ----------------------------------------------------
            // MIX AND MEGA
            // ----------------------------------------------------

            if (isMixAndMegaFormat()) {

                const mixedBaseStats =
                      getMixAndMegaBaseStats(set);

                if (mixedBaseStats) {

                    const species =
                          this.curTeam.dex.species.get(
                              set.species
                          );

                    if (
                        species &&
                        species.exists
                    ) {

                        const originalSpeciesGet =
                              this.curTeam.dex.species.get;

                        this.curTeam.dex.species.get =
                            function (name) {

                            const result =
                                  originalSpeciesGet.call(
                                      this,
                                      name
                                  );

                            if (result === species) {

                                const mixedSpecies =
                                      Object.assign(
                                          {},
                                          result
                                      );

                                mixedSpecies.baseStats =
                                    Object.assign(
                                    {},
                                    mixedBaseStats
                                );

                                return mixedSpecies;
                            }

                            return result;
                        };

                        try {
                            return originalGetStat.call(
                                this,
                                stat,
                                set,
                                evOverride,
                                natureOverride
                            );
                        } finally {
                            this.curTeam.dex.species.get =
                                originalSpeciesGet;
                        }
                    }
                }

                return originalGetStat.call(
                    this,
                    stat,
                    set,
                    evOverride,
                    natureOverride
                );
            }


            // ----------------------------------------------------
            // TIER SHIFT
            // ----------------------------------------------------

            const species =
                  this.curTeam.dex.species.get(
                      set.species
                  );

            if (
                !species ||
                !species.exists
            ) {
                return originalGetStat.call(
                    this,
                    stat,
                    set,
                    evOverride,
                    natureOverride
                );
            }

            // HP is never shifted.
            if (stat === 'hp') {
                return originalGetStat.call(
                    this,
                    stat,
                    set,
                    evOverride,
                    natureOverride
                );
            }

            const boost =
                  getTierShiftBoost(
                      species.tier
                  );

            if (!boost) {
                return originalGetStat.call(
                    this,
                    stat,
                    set,
                    evOverride,
                    natureOverride
                );
            }

            const originalSpeciesGet =
                  this.curTeam.dex.species.get;

            this.curTeam.dex.species.get =
                function (name) {

                const result =
                      originalSpeciesGet.call(
                          this,
                          name
                      );

                if (result === species) {

                    const shiftedSpecies =
                          Object.assign(
                              {},
                              result
                          );

                    shiftedSpecies.baseStats =
                        Object.assign(
                        {},
                        result.baseStats
                    );

                    shiftedSpecies.baseStats[stat] =
                        result.baseStats[stat] +
                        boost;

                    return shiftedSpecies;
                }

                return result;
            };

            try {
                return originalGetStat.call(
                    this,
                    stat,
                    set,
                    evOverride,
                    natureOverride
                );
            } finally {
                this.curTeam.dex.species.get =
                    originalSpeciesGet;
            }
        };

        prototype.getStat.__tierShiftPatched =
            true;

        prototype.getStat.__tierShiftOriginal =
            originalGetStat;

        console.log(
            '[Tier Shift] TeambuilderRoom.getStat patched'
        );

        return true;
    }


    // ============================================================
    // PATCH: TEAMBUILDER STAT FORM
    // ============================================================

    function patchTeambuilderStatForm() {
        const RoomClass =
              window.TeambuilderRoom;

        if (!RoomClass) {
            return false;
        }

        const prototype =
              RoomClass.prototype;

        if (
            !prototype ||
            typeof prototype.updateStatForm !==
            'function'
        ) {
            return false;
        }

        if (
            prototype.updateStatForm
            .__tierShiftPatched
        ) {
            return true;
        }

        const originalUpdateStatForm =
              prototype.updateStatForm;


        prototype.updateStatForm =
            function (setGuessed) {

            const result =
                  originalUpdateStatForm.call(
                      this,
                      setGuessed
                  );


            // ------------------------------------------------
            // Normal formats
            // ------------------------------------------------

            if (
                !isTierShiftFormat() &&
                !isMixAndMegaFormat() &&
                !isGodlyGiftFormat(this)
            ) {
                return result;
            }


            const set =
                  this.curSet;

            if (
                !set ||
                !set.species
            ) {
                return result;
            }


            const species =
                  this.curTeam.dex.species.get(
                      set.species
                  );

            if (
                !species ||
                !species.exists
            ) {
                return result;
            }


            // ------------------------------------------------
            // BASE STAT DISPLAY
            // ------------------------------------------------

            let baseStats = null;

            // ------------------------------------------------
            // GODLY GIFT
            // ------------------------------------------------

            if (isGodlyGiftFormat(this)) {

                const godlyGiftStat =
                      getGodlyGiftBaseStats(
                          this,
                          set
                      );

                const normalSpecies =
                      this.curTeam.dex.species.get(
                          set.species
                      );

                if (
                    !normalSpecies ||
                    !normalSpecies.exists
                ) {
                    return result;
                }

                baseStats =
                    Object.assign(
                    {},
                    normalSpecies.baseStats
                );

                if (godlyGiftStat) {
                    baseStats[
                        godlyGiftStat.stat
                    ] =
                        godlyGiftStat.value;
                }

            } else if (isMixAndMegaFormat()) {

                baseStats =
                    getMixAndMegaBaseStats(set);

            } else {

                const boost =
                      getTierShiftBoost(
                          species.tier
                      );

                if (!boost) {
                    return result;
                }

                baseStats = {
                    hp: species.baseStats.hp,
                    atk: species.baseStats.atk + boost,
                    def: species.baseStats.def + boost,
                    spa: species.baseStats.spa + boost,
                    spd: species.baseStats.spd + boost,
                    spe: species.baseStats.spe + boost
                };
            }


            if (!baseStats) {
                return result;
            }


            const baseStatsRows =
                  this.$chart.find(
                      '.basestatscol > div'
                  );

            if (!baseStatsRows.length) {
                return result;
            }


            const statOrder = [
                'hp',
                'atk',
                'def',
                'spa',
                'spd',
                'spe'
            ];

            for (
                let i = 0;
                i < statOrder.length;
                i++
            ) {

                const stat =
                      statOrder[i];

                const row =
                      baseStatsRows.eq(i + 1);

                row.find('b').text(
                    baseStats[stat]
                );
            }


            // ------------------------------------------------
            // MIX AND MEGA SPEED NOTE
            // ------------------------------------------------


            if (isMixAndMegaFormat()) {

                const item =
                      this.curTeam.dex.items.get(set.item);

                /*
     * Only show this note for actual Mega Stones.
     *
     * This excludes things like:
     * - Red Orb
     * - Blue Orb
     * - Lustrous Orb
     *
     * because those don't use a normal Mega Evolution.
     */
                const baseStatsColumn =
                      this.$chart.find('.basestatscol');

                baseStatsColumn.css(
                    'position',
                    'relative'
                );
                let note =
                    this.$chart.find(
                        '.mnm-speed-note'
                    );

                if (!note.length) {

                    note = $(
                        '<div class="mnm-speed-note" style="' +
                        'position: absolute;' +
                        'left: 300px;' +
                        'top: 300px;' +
                        'z-index: 10;' +
                        '">' +
                        'Note: Speed is ' +
                        '<span class="mnm-speed-value">0</span>' +
                        ' before Mega Evolving' +
                        '</div>'
                    );


                    this.$chart
                        .find('.basestatscol')
                        .after(note);
                }

                /*
         * Use Showdown's ORIGINAL stat calculation.
         *
         * This gives the normal pre-Mega Speed,
         * including IVs, EVs, level, and nature.
         */
                updateMixAndMegaSpeedNote(this);
                updateMixAndMegaSpeedNotePosition(this);
            }

            return result;
        };


        prototype.updateStatForm
            .__tierShiftPatched = true;

        prototype.updateStatForm
            .__tierShiftOriginal =
            originalUpdateStatForm;

        console.log(
            '[Tier Shift] TeambuilderRoom.updateStatForm patched'
        );

        return true;
    }

    function patchTeambuilderStatSlider() {
        const RoomClass = window.TeambuilderRoom;

        if (!RoomClass) return false;

        const prototype = RoomClass.prototype;

        if (
            !prototype ||
            typeof prototype.statSlide !== 'function'
        ) {
            return false;
        }

        if (prototype.statSlide.__tierShiftPatched) {
            return true;
        }

        const originalStatSlide =
              prototype.statSlide;

        prototype.statSlide = function (...args) {

            const result =
                  originalStatSlide.apply(this, args);

            if (isMixAndMegaFormat()) {
                requestAnimationFrame(() => {
                    updateMixAndMegaSpeedNote(this);
                });
            }

            return result;
        };

        prototype.statSlide.__tierShiftPatched = true;
        prototype.statSlide.__tierShiftOriginal =
            originalStatSlide;

        console.log(
            '[Tier Shift] TeambuilderRoom.statSlide patched'
        );

        return true;
    }

    // ============================================================
    // PATCH EVERYTHING
    // ============================================================

    function patchEverything() {
        const searchLegalityPatched = patchBattlePokemonSearchLegality();
        const godlyGiftLegalityPatched = patchGodlyGiftSearch();
        const searchPatched = patchBattlePokemonSearch();
        const rendererPatched = patchBattleSearchRenderer();
        const statPatched = patchTeambuilderGetStat();
        const statFormPatched = patchTeambuilderStatForm();
        const statSliderPatched = patchTeambuilderStatSlider();
        const tsaReceiverPatched = patchTSABanlistReceiver();
        const godlyGiftStatGuesserPatched = patchGodlyGiftStatGuesser();
        if (isGodlyGiftFormat(window.room)) {
            requestGGBanlist();
        }
        return (
            tsaReceiverPatched &&
            searchLegalityPatched &&
            godlyGiftLegalityPatched &&
            godlyGiftStatGuesserPatched &&
            searchPatched &&
            rendererPatched &&
            statPatched &&
            statFormPatched &&
            statSliderPatched
        );
    }


    // ============================================================
    // EXPOSE DEBUG FUNCTIONS
    // ============================================================


    // ============================================================
    // WAIT FOR SHOWDOWN
    // ============================================================

    let attempts = 0;

    const patchInterval =
        setInterval(() => {

            attempts++;

            if (patchEverything()) {

                clearInterval(
                    patchInterval
                );

                console.log(
                    '[Tier Shift] All Teambuilder patches ready'
                );

                return;
            }

            // Stop after ~30 seconds.
            if (attempts >= 300) {

                clearInterval(
                    patchInterval
                );

                console.warn(
                    '[Tier Shift] Could not patch all Teambuilder functions'
                );
            }

        }, 100);


    // ============================================================
    // DEBUG TEST
    // ============================================================

    window.TierShiftTeambuilder = {
        getTierShiftBoost,
        getShiftedStat,
        getShiftedBST,
        getMixAndMegaBaseStats,
        getGodlyGiftBaseStats,
        getGodlyGiftIllegalIds,
        parseGodlyGiftRestricted,
        isTierShiftFormat,
        isMixAndMegaFormat,
        isGodlyGiftFormat,
        requestTSABanlist,
        requestGGBanlist,
        patch: patchEverything
    };

})();
