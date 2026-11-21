// ==UserScript==
// @name         Pokémon Showdown Teambuilder QOL
// @author       jl
// @namespace    https://github.com/Jake18236/showdown-teambuilder-mod
// @version      22.9.0
// @description  Adds Teambuilder and damage calculator support for some OMs
// @match        https://play.pokemonshowdown.com/*
// @match        https://smogtours.psim.us/*
// @match        https://calc.pokemonshowdown.com/*
// @grant        GM_getResourceText
// @grant        unsafeWindow
// @sandbox      JavaScript
// @inject-into  page
// @resource     qolSimulator https://github.com/Jake18236/Showdown-Teambuilder-Mod/releases/download/v22.3.3/showdown-teambuilder.user.js#sha256=41d6c37e7ad0bd610bce9ffb6dde617b885d06504412b3bc62349448e6ae1adc
// @run-at       document-start
// @updateURL    https://github.com/Jake18236/Showdown-Teambuilder-Mod/releases/latest/download/showdown-teambuilder.user.js
// @downloadURL  https://github.com/Jake18236/Showdown-Teambuilder-Mod/releases/latest/download/showdown-teambuilder.user.js
// ==/UserScript==

(function (__qolPageWindow, __qolResourceReader) {
    with (__qolPageWindow) {
(function () {
    'use strict';
    const window = __qolPageWindow;
    const GM_getResourceText = __qolResourceReader;

    const LOG = '[Teambuilder QOL]';
    // Multiple enabled copies must not register another observer/listener tree.
    if (window.__showdownTeambuilderQolRuntime) return;
    window.__showdownTeambuilderQolRuntime = Object.freeze({version: '22.9.0'});

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
        NO_HOLDS_BARRED: 'noHoldsBarred',
        REVELATIONMONS: 'revelationmons',
        CATEGORY_SWAP: 'categorySwap',
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
    const NO_HOLDS_BARRED_FORMAT = 'gen9noholdsbarred';
    const isNoHoldsBarredFormat = (format) =>
        /^(?:gen9)?noholdsbarred$/.test(fmtId(String(format || '').split('@@@')[0]));

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
    const SHOWDOWN_EDITOR_RULES = {"standardag":{"name":"Standard AG","ruleset":["Obtainable","Team Preview","HP Percentage Mod","Cancel Mod","Endless Battle Clause"]},"standard":{"name":"Standard","ruleset":["Standard AG","Sleep Clause Mod","Species Clause","Nickname Clause","OHKO Clause","Evasion Items Clause","Evasion Moves Clause"]},"standardnext":{"name":"Standard NEXT","ruleset":["+Unreleased","Sleep Clause Mod","Species Clause","Nickname Clause","OHKO Clause","HP Percentage Mod","Cancel Mod"],"banlist":["Soul Dew"]},"flatrules":{"name":"Flat Rules","ruleset":["Obtainable","Team Preview","Species Clause","Nickname Clause","Item Clause = 1","Adjust Level Down = 50","Picked Team Size = Auto","Cancel Mod"],"banlist":["Mythical","Restricted Legendary","Greninja-Bond"]},"limittworestricted":{"name":"Limit Two Restricted"},"limitonerestricted":{"name":"Limit One Restricted"},"standarddoubles":{"name":"Standard Doubles","ruleset":["Standard AG","Species Clause","Nickname Clause","OHKO Clause","Evasion Moves Clause","Gravity Sleep Clause"]},"standardoms":{"name":"Standard OMs","ruleset":["Standard AG","Species Clause","Nickname Clause","OHKO Clause","Evasion Moves Clause","Overflow Stat Mod"]},"standardnatdex":{"name":"Standard NatDex","ruleset":["Standard AG","NatDex Mod","Species Clause","Nickname Clause","OHKO Clause","Evasion Clause","Sleep Clause Mod"]},"natdexmod":{"name":"NatDex Mod","ruleset":["+Unobtainable","+Past","Sketch Post-Gen 7 Moves"]},"standarddraft":{"name":"Standard Draft","ruleset":["Obtainable","Nickname Clause","Beat Up Nicknames Mod","+Unreleased","+CAP","Sketch Post-Gen 7 Moves","Team Preview","Sleep Clause Mod","OHKO Clause","Evasion Clause","Endless Battle Clause","HP Percentage Mod","Cancel Mod"]},"obtainable":{"name":"Obtainable","ruleset":["Obtainable Moves","Obtainable Abilities","Obtainable Formes","EV Limit = Auto","Obtainable Misc"],"banlist":["Unreleased","Unobtainable","Nonexistent"]},"obtainablemoves":{"name":"Obtainable Moves"},"obtainableabilities":{"name":"Obtainable Abilities"},"obtainableformes":{"name":"Obtainable Formes"},"obtainablemisc":{"name":"Obtainable Misc"},"hoennpokedex":{"name":"Hoenn Pokedex"},"sinnohpokedex":{"name":"Sinnoh Pokedex"},"oldunovapokedex":{"name":"Old Unova Pokedex"},"newunovapokedex":{"name":"New Unova Pokedex"},"kalospokedex":{"name":"Kalos Pokedex"},"oldalolapokedex":{"name":"Old Alola Pokedex","banlist":["Pikachu-Partner","Marowak-Alola-Totem","Ribombee-Totem","Araquanid-Totem","Lycanroc-Dusk","Necrozma-Dusk-Mane","Necrozma-Dawn-Wings"]},"newalolapokedex":{"name":"New Alola Pokedex"},"galarpokedex":{"name":"Galar Pokedex","banlist":["Raichu-Alola","Weezing-Base"]},"isleofarmorpokedex":{"name":"Isle of Armor Pokedex"},"crowntundrapokedex":{"name":"Crown Tundra Pokedex"},"galarexpansionpokedex":{"name":"Galar Expansion Pokedex"},"paldeapokedex":{"name":"Paldea Pokedex","banlist":["Arcanine-Hisui","Avalugg-Hisui","Basculin-White-Striped","Braviary-Hisui","Diglett-Alola","Dugtrio-Alola","Electrode-Hisui","Gimmighoul-Roaming","Goodra-Hisui","Grimer-Alola","Growlithe-Hisui","Lilligant-Hisui","Meowth-Alola","Meowth-Galar","Muk-Alola","Persian-Alola","Qwilfish-Hisui","Raichu-Alola","Sliggoo-Hisui","Slowbro-Galar","Slowking-Galar","Slowpoke-Galar","Sneasel-Hisui","Voltorb-Hisui","Tauros-Base","Wooper-Base","Zorua-Hisui","Zoroark-Hisui"]},"kitakamipokedex":{"name":"Kitakami Pokedex","banlist":["Wooper-Paldea","Raichu-Alola","Vulpix-Alola","Ninetales-Alola","Growlithe-Hisui","Arcanine-Hisui","Geodude-Alola","Graveler-Alola","Golem-Alola","Sandshrew-Alola","Sandslash-Alola","Weezing-Galar","Sneasel-Hisui","Sliggoo-Hisui","Goodra-Hisui","Basculin-Red-Striped","Basculin-Blue-Striped","Ursaluna-Base"]},"blueberrypokedex":{"name":"Blueberry Pokedex","banlist":["Diglett-Base","Dugtrio-Base","Grimer-Base","Muk-Base","Slowpoke-Base","Slowbro-Base","Slowking-Base","Geodude-Base","Graveler-Base","Golem-Base","Qwilfish-Base","Sandshrew-Base","Sandslash-Base","Vulpix-Base","Ninetales-Base","Typhlosion-Hisui","Samurott-Hisui","Greninja-Bond","Decidueye-Hisui"]},"potd":{"name":"PotD"},"forcemonotype":{"name":"Force Monotype","hasValue":true},"forcemonocolor":{"name":"Force Monocolor","hasValue":true},"forceteratype":{"name":"Force Tera Type","hasValue":true},"forceselect":{"name":"Force Select","hasValue":true},"evlimits":{"name":"EV Limits","hasValue":true},"teampreview":{"name":"Team Preview"},"teratypepreview":{"name":"Tera Type Preview"},"onevsone":{"name":"One vs One","ruleset":["Picked Team Size = 1"]},"twovstwo":{"name":"Two vs Two","ruleset":["Picked Team Size = 2"]},"littlecup":{"name":"Little Cup","ruleset":["Max Level = 5"]},"timerstarting":{"name":"Timer Starting","hasValue":"positive-integer"},"dctimer":{"name":"DC Timer"},"dctimerbank":{"name":"DC Timer Bank"},"timergrace":{"name":"Timer Grace","hasValue":"positive-integer"},"timeraddperturn":{"name":"Timer Add Per Turn","hasValue":"integer"},"timermaxperturn":{"name":"Timer Max Per Turn","hasValue":"positive-integer"},"timermaxfirstturn":{"name":"Timer Max First Turn","hasValue":"positive-integer"},"timeoutautochoose":{"name":"Timeout Auto Choose"},"timeraccelerate":{"name":"Timer Accelerate"},"blitz":{"name":"Blitz","ruleset":["Timer Starting = 15","Timer Grace = 30","Timer Add Per Turn = 5","Timer Max Per Turn = 15","Timer Max First Turn = 40"]},"vgctimer":{"name":"VGC Timer","ruleset":["Timer Starting = 420","Timer Grace = 90","Timer Add Per Turn = 0","Timer Max Per Turn = 55","Timer Max First Turn = 90","Timeout Auto Choose","DC Timer Bank"]},"speciesclause":{"name":"Species Clause"},"nicknameclause":{"name":"Nickname Clause"},"beatupnicknamesmod":{"name":"Beat Up Nicknames Mod"},"itemclause":{"name":"Item Clause","hasValue":"positive-integer"},"abilityclause":{"name":"Ability Clause","hasValue":"positive-integer"},"ohkoclause":{"name":"OHKO Clause","banlist":["Fissure","Guillotine","Horn Drill","Sheer Cold"]},"evasionclause":{"name":"Evasion Clause","ruleset":["Evasion Abilities Clause","Evasion Items Clause","Evasion Moves Clause"]},"evasionabilitiesclause":{"name":"Evasion Abilities Clause","banlist":["Sand Veil","Snow Cloak"]},"evasionitemsclause":{"name":"Evasion Items Clause","banlist":["Bright Powder","Lax Incense"]},"evasionmovesclause":{"name":"Evasion Moves Clause","banlist":["Acupressure","Minimize","Double Team"]},"accuracymovesclause":{"name":"Accuracy Moves Clause","banlist":["Flash","Kinesis","Leaf Tornado","Mirror Shot","Mud Bomb","Mud-Slap","Muddy Water","Night Daze","Octazooka","Sand Attack","Smokescreen"]},"accuracytrapclause":{"name":"Accuracy Trap Clause"},"sleepmovesclause":{"name":"Sleep Moves Clause","banlist":["Dark Void","Grass Whistle","Hypnosis","Lovely Kiss","Sing","Sleep Powder","Spore","Yawn"]},"gravitysleepclause":{"name":"Gravity Sleep Clause","banlist":["Gravity ++ Dark Void","Gravity ++ Grass Whistle","Gravity ++ Hypnosis","Gravity ++ Lovely Kiss","Gravity ++ Sing","Gravity ++ Sleep Powder"]},"endlessbattleclause":{"name":"Endless Battle Clause"},"drypassclause":{"name":"DryPass Clause","ruleset":["Baton Pass Stat Clause","Baton Pass Stat Trap Clause"],"banlist":["Baton Pass + Substitute","Baton Pass + Ingrain","Baton Pass + Aqua Ring","Baton Pass + Block","Baton Pass + Mean Look","Baton Pass + Spider Web","Baton Pass + Jaw Lock"]},"batonpassclause":{"name":"Baton Pass Clause","banlist":["Baton Pass > 1"]},"onebatonpassclause":{"name":"One Baton Pass Clause","banlist":["Baton Pass > 1"]},"oneboostpasserclause":{"name":"One Boost Passer Clause"},"batonpassstatclause":{"name":"Baton Pass Stat Clause"},"speedpassclause":{"name":"Speed Pass Clause"},"batonpasstrapclause":{"name":"Baton Pass Trap Clause"},"batonpassstattrapclause":{"name":"Baton Pass Stat Trap Clause"},"cfzclause":{"name":"CFZ Clause","banlist":["10,000,000 Volt Thunderbolt","Acid Downpour","All-Out Pummeling","Black Hole Eclipse","Bloom Doom","Breakneck Blitz","Catastropika","Clangorous Soulblaze","Continental Crush","Corkscrew Crash","Devastating Drake","Extreme Evoboost","Genesis Supernova","Gigavolt Havoc","Guardian of Alola","Hydro Vortex","Inferno Overdrive","Let's Snuggle Forever","Light That Burns the Sky","Malicious Moonsault","Menacing Moonraze Maelstrom","Never-Ending Nightmare","Oceanic Operetta","Pulverizing Pancake","Savage Spin-Out","Searing Sunraze Smash","Shattered Psyche","Sinister Arrow Raid","Soul-Stealing 7-Star Strike","Splintered Stormshards","Stoked Sparksurfer","Subzero Slammer","Supersonic Skystrike","Tectonic Rage","Twinkle Tackle"]},"zmoveclause":{"name":"Z-Move Clause"},"notfullyevolved":{"name":"Not Fully Evolved"},"hppercentagemod":{"name":"HP Percentage Mod"},"exacthpmod":{"name":"Exact HP Mod"},"cancelmod":{"name":"Cancel Mod"},"sleepclausemod":{"name":"Sleep Clause Mod"},"stadiumsleepclause":{"name":"Stadium Sleep Clause"},"switchpriorityclausemod":{"name":"Switch Priority Clause Mod"},"desyncclausemod":{"name":"Desync Clause Mod"},"deoxyscamouflageclausemod":{"name":"Deoxys Camouflage Clause Mod"},"freezeclausemod":{"name":"Freeze Clause Mod"},"nofreezemod":{"name":"No Freeze Mod"},"sametypeclause":{"name":"Same Type Clause"},"enforcesameteratype":{"name":"Enforce Same Tera Type"},"samecolorclause":{"name":"Same Color Clause"},"sameletterclause":{"name":"Same Letter Clause"},"megarayquazaclause":{"name":"Mega Rayquaza Clause"},"dynamaxclause":{"name":"Dynamax Clause"},"terastalclause":{"name":"Terastal Clause"},"fullarceusclause":{"name":"Full Arceus Clause"},"inversemod":{"name":"Inverse Mod"},"minsourcegen":{"name":"Min Source Gen","hasValue":"positive-integer"},"omunobtainablemoves":{"name":"OM Unobtainable Moves"},"stabmonsmovelegality":{"name":"STABmons Move Legality","ruleset":["OM Unobtainable Moves"]},"alphabetcupmovelegality":{"name":"Alphabet Cup Move Legality","ruleset":["OM Unobtainable Moves"]},"sketchmonsmovelegality":{"name":"Sketchmons Move Legality","ruleset":["OM Unobtainable Moves"]},"camomonsmod":{"name":"Camomons Mod"},"allowtradeback":{"name":"Allow Tradeback"},"lgpenormalrules":{"name":"LGPE Normal Rules","ruleset":["Adjust Level = 50"]},"nfeclause":{"name":"NFE Clause"},"gemsclause":{"name":"Gems Clause"},"sketchpostgen7moves":{"name":"Sketch Post-Gen 7 Moves"},"mimicglitchclause":{"name":"Mimic Glitch Clause"},"pomegglitchclause":{"name":"Pomeg Glitch Clause"},"overflowstatmod":{"name":"Overflow Stat Mod"},"formeclause":{"name":"Forme Clause"},"350cupmod":{"name":"350 Cup Mod"},"flippedmod":{"name":"Flipped Mod"},"scalemonsmod":{"name":"Scalemons Mod"},"teamtypepreview":{"name":"Team Type Preview"},"openteamsheets":{"name":"Open Team Sheets"},"forceopenteamsheets":{"name":"Force Open Team Sheets"},"aaarestrictedabilities":{"name":"AAA Restricted Abilities"},"eventmovesclause":{"name":"Event Moves Clause"},"pickedteamsize":{"name":"Picked Team Size","hasValue":"positive-integer"},"minteamsize":{"name":"Min Team Size","hasValue":"positive-integer"},"evlimit":{"name":"EV Limit","hasValue":"integer"},"maxteamsize":{"name":"Max Team Size","hasValue":"positive-integer"},"maxmovecount":{"name":"Max Move Count","hasValue":"positive-integer"},"maxtotallevel":{"name":"Max Total Level","hasValue":"positive-integer"},"minlevel":{"name":"Min Level","hasValue":"positive-integer"},"maxlevel":{"name":"Max Level","hasValue":"positive-integer"},"defaultlevel":{"name":"Default Level","hasValue":"positive-integer"},"adjustlevel":{"name":"Adjust Level","hasValue":"positive-integer"},"adjustleveldown":{"name":"Adjust Level Down","hasValue":"positive-integer"},"stadiumitemsclause":{"name":"Stadium Items Clause","banlist":["Fast Ball","Friend Ball","Great Ball","Heavy Ball","Level Ball","Love Ball","Lure Ball","Master Ball","Moon Ball","Park Ball","Poke Ball","Safari Ball","Ultra Ball","Fire Stone","Leaf Stone","Moon Stone","Sun Stone","Thunder Stone","Upgrade","Water Stone","Mail"]},"nc2000movelegality":{"name":"NC 2000 Move Legality"},"aptclause":{"name":"APT Clause","banlist":["Agility + Wrap","Agility + Fire Spin","Agility + Bind","Agility + Clamp"]},"nc1997movelegality":{"name":"NC 1997 Move Legality"},"stadiumpokecuprentals":{"name":"Stadium Poke Cup Rentals"},"noswitching":{"name":"No Switching"},"guaranteedsecondarymod":{"name":"Guaranteed Secondary Mod"},"chimera1v1rule":{"name":"Chimera 1v1 Rule","ruleset":["Team Preview","Picked Team Size = 6"]},"bonustypemod":{"name":"Bonus Type Mod"},"firstbloodrule":{"name":"First Blood Rule"},"tiershiftmod":{"name":"Tier Shift Mod","ruleset":["Overflow Stat Mod"]},"revelationmonsmod":{"name":"Revelationmons Mod"},"reevolutionmod":{"name":"Re-Evolution Mod"},"brokenrecordmod":{"name":"Broken Record Mod"},"forceofthefallenmod":{"name":"Force of the Fallen Mod"},"categoryswapmod":{"name":"Category Swap Mod"},"godlygiftmod":{"name":"Godly Gift Mod"},"voltturnmayhemmod":{"name":"VoltTurn Mayhem Mod"},"convergencelegality":{"name":"Convergence Legality"},"hackmonsformelegality":{"name":"Hackmons Forme Legality","banlist":["CAP","Future"]},"speciesrevealclause":{"name":"Species Reveal Clause"},"franticfusionsmod":{"name":"Frantic Fusions Mod"},"proteanpalacemod":{"name":"Protean Palace Mod"},"bestof":{"name":"Best Of","hasValue":"positive-integer"},"illusionlevelmod":{"name":"Illusion Level Mod"},"allowedpokemoves":{"name":"Allowed Pokemoves","hasValue":"positive-integer"},"uniquepokemoves":{"name":"Unique Pokemoves","hasValue":"positive-integer"},"ferventimpersonationmod":{"name":"Fervent Impersonation Mod"},"twisteddimensionmod":{"name":"Twisted Dimension Mod"},"mixandmegaoldaggronite":{"name":"Mix and Mega Old Aggronite"},"badnboostedmod":{"name":"Bad 'n Boosted Mod"},"datapreview":{"name":"Data Preview"},"rebalancelevels":{"name":"Rebalance Levels"}};
    const RULE_CATALOG = new Map([...SHOWDOWN_RULE_NAMES, ...SHOWDOWN_VALUE_RULE_NAMES]
        .map((name) => [toSearchId(name), {name, valueRule: SHOWDOWN_VALUE_RULE_NAMES.includes(name)}]));
    for(const [id,rule]of Object.entries(SHOWDOWN_EDITOR_RULES))if(rule.name)RULE_CATALOG.set(id,{name:rule.name,valueRule:!!rule.hasValue});
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
        const eq = ['-','+','*'].includes(sign) ? [text,text,undefined] : /^([^=]+?)(?:\s*=\s*(.*))?$/.exec(text);
        const name = eq?.[1]?.trim() || text;
        const value = eq?.[2] === undefined ? null : eq[2].trim();
        const id = toSearchId(name);
        const known = RULE_CATALOG.get(id) || null;
        const fromFormat = window.BattleFormats?.[id] || null;
        const kind = sign === '-' ? 'ban' : sign === '+' ? 'unban' : sign === '*' ? 'restrict'
            : sign === '!' ? 'remove' : sign === '!!' ? 'replace' : value !== null ? 'value' : 'rule';
        const complex=/\s\+\+?\s/.test(name),teamWide=/\s\+\+\s/.test(name);
        const typed=/^(pokemon|basepokemon|species|basespecies|ability|move|item|tag|type|teratype)\s*:\s*(.+)$/i.exec(name);
        const numeric=/^(.+?)\s*(<=|>=|<|>)\s*(\d+)$/.exec(name);
        return {raw, sign, kind, complex,teamWide,components:complex?name.split(/\s\+\+?\s/).map(t=>t.trim()):null,targetType:typed?.[1]?.toLowerCase()||null,predicate:numeric?{tag:numeric[1].trim(),operator:numeric[2],value:Number(numeric[3])}:null, name: known?.name || name, id, value,
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
            label: 'Mix and Mega', challengeRule: 'mixandmegamod', modifySpeciesPriority: 4,
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
            label: 'Nature Swap', challengeRule: 'natureswapmod', modifySpeciesPriority: -1,
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
        {id: MOD.REVELATIONMONS, formatKeywords: ['revelationmons'], label: 'Revelationmons', challengeRule: 'Revelationmons Mod'},
        {id: MOD.CATEGORY_SWAP, formatKeywords: ['categoryswap'], label: 'Category Swap', challengeRule: 'Category Swap Mod'},
        {id: MOD.NO_HOLDS_BARRED, label: 'No Holds Barred!'},
        {id: MOD.BONUS_TYPE, formatKeywords: ['bonustype'], label: 'Bonus Type', challengeRule: 'Bonus Type Mod', modifySpeciesPriority: 1},
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
    let battleCommandRoom = null;
    const getActiveTeambuilderRoom = () =>
    battleCommandRoom || getTeambuilderRoom() || (window.room?.curTeam ? window.room : null);
    const getEngine = () => getTeambuilderRoom()?.search?.engine;

    // ---------- format stacking ----------
    //
    // A team's format can carry custom rules ("gen9ou@@@badnboostedmod, flippedmod"), which is how
    // OMs are stacked.

    const asMods = (m) => (Array.isArray(m) ? m : m ? [m] : []);

    function resolveExclusive(mods) {
        // Cross Evolution and Frantic Fusions can both modify the same set.
        // Inheritance replaces the learnset, so keep the first fusion family.
        const first = mods.find(isFusionMod);
        return first === MOD.INHERITANCE
            ? mods.filter((mod) => !isFusionMod(mod) || mod === first)
            : mods.filter((mod) => mod !== MOD.INHERITANCE);
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
    const formatModsCache = new Map();
    function modsFromFormatString(format) {
        const key = String(format || '');
        const cached = formatModsCache.get(key);
        if (cached) return cached.slice();
        const mods = [];
        const add = (mod) => {if (mod && !mods.includes(mod)) mods.push(mod);};
        const remove = (mod) => {const idx = mods.indexOf(mod); if (idx >= 0) mods.splice(idx, 1);};
        const matchBase = (text) => {
            const id = fmtId(text);
            for (const [keyword, mod] of FORMAT_MOD_KEYWORDS) if (id.includes(keyword)) add(mod);
            for (const [keyword, mod] of FORMAT_PROVIDER_KEYWORDS) if (id.includes(keyword)) add(mod);
        };
        const base = String(format || '').split('@@@')[0].trim();
        matchBase(base);
        // The mechanic belongs to the server format's damage hook.
        // Including the format as an inherited rule only imports its ruleset.
        if (isNoHoldsBarredFormat(base)) add(MOD.NO_HOLDS_BARRED);
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

            const inherited = /^gen\d+/.test(id) && stripGen(id);
            const portable = (d) => ![MOD.MIX_AND_MEGA, MOD.NATURE_SWAP, MOD.INHERITANCE].includes(d.id);
            let matching = MOD_DEFINITIONS.filter((d) =>
                (inherited && portable(d) && [...(d.formatKeywords || []), ...(d.providerKeywords || [])].includes(inherited)) ||
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
        if (unrestrictedAbilities && !mods.includes(MOD.FRANTIC_FUSIONS) && !mods.includes(MOD.INHERITANCE)) {
            add(MOD.ALMOST_ANY_ABILITY);
        }
        if (unrestrictedMoves) add(MOD.ALL_MOVES);
        // RenderSet/stat/type paths ask repeatedly while a team is redrawn.
        // Cache only format-derived metadata, never order-sensitive team stats.
        if (formatModsCache.size >= 32) formatModsCache.delete(formatModsCache.keys().next().value);
        formatModsCache.set(key, Object.freeze(mods.slice()));
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
        return resolveExclusive(modsFromFormatString(search?.format));
    }

    // Redraws everything that depends on the team's format / mod list.
    function refreshAfterFormatChange(room) {
        if (!room) return;
        prepareFormatDependencies(room.curTeam?.format, room.curTeam?.dex || window.Dex);

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
        if(battleCommandRoom?.__qolIgnoreBans)return;
        const b = BL[key];
        if (b.loaded || b.sent) return;
        const sharedId={conv:'gen9convergence',gg:'gen9godlygift',tsa:'gen9tiershiftaaa'}[key];
        const shared=genericBanlists.get(sharedId);
        if (key==='conv' && shared?.verified) { convergenceBans=shared.bans; b.loaded=true; return; }
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
        return allowedMega || removesObtainableFormes(ops);
    }

    function removesObtainableFormes(ops) {
        let removed = false;
        for (const op of ops) if (op?.id === 'obtainableformes') {
            if (op.kind === 'remove') removed = true;
            else if (['rule', 'replace'].includes(op.kind)) removed = false;
        }
        return removed;
    }

    function allowsConvergenceBattleFormes(format, bans) {
        return isConvergenceMegamons(format) && removesObtainableFormes([
            ...(bans?.ruleset || []).map(parseChallengeRule),
            ...formatRuleTokens(format),
        ]);
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
            species: new Set(), baseSpecies: new Set(), tiers: new Set(), tags: new Set(),
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
            if(/^all(?:pokemon|items|abilities|moves|natures)$/.test(id)){bans.tags.add(id);continue;}
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
        return bans.tags?.has('allpokemon') || bans.species.has(sp.id) ||
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
            let token = raw.slice(1).trim();
            if (!token) continue;
            const group=/^(?:tag\s*:\s*)?(all\s*(?:pokemon|items|abilities|moves|natures))$/i.exec(token);
            if(group){const id=toID(group[1]);if(sign==='-')bans.tags.add(id);else if(sign==='+')bans.tags.delete(id);continue;}
            const scoped=/^(basepokemon|basespecies|pokemon|species)\s*:\s*(.+)$/i.exec(token);
            if(scoped)token=scoped[2].trim();

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

            const whole = scoped ? /^base/.test(scoped[1].toLowerCase()) : !formeOnly && bansWholeSpecies(token, sp);

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
        ...{"standardag":["Obtainable","Team Preview","HP Percentage Mod","Cancel Mod","Endless Battle Clause"],"standard":["Standard AG","Sleep Clause Mod","Species Clause","Nickname Clause","OHKO Clause","Evasion Items Clause","Evasion Moves Clause"],"standardnext":["+Unreleased","Sleep Clause Mod","Species Clause","Nickname Clause","OHKO Clause","HP Percentage Mod","Cancel Mod"],"flatrules":["Obtainable","Team Preview","Species Clause","Nickname Clause","Item Clause = 1","Adjust Level Down = 50","Picked Team Size = Auto","Cancel Mod"],"standarddoubles":["Standard AG","Species Clause","Nickname Clause","OHKO Clause","Evasion Moves Clause","Gravity Sleep Clause"],"standardoms":["Standard AG","Species Clause","Nickname Clause","OHKO Clause","Evasion Moves Clause","Overflow Stat Mod"],"standardnatdex":["Standard AG","NatDex Mod","Species Clause","Nickname Clause","OHKO Clause","Evasion Clause","Sleep Clause Mod"],"natdexmod":["+Unobtainable","+Past","Sketch Post-Gen 7 Moves"],"standarddraft":["Obtainable","Nickname Clause","Beat Up Nicknames Mod","+Unreleased","+CAP","Sketch Post-Gen 7 Moves","Team Preview","Sleep Clause Mod","OHKO Clause","Evasion Clause","Endless Battle Clause","HP Percentage Mod","Cancel Mod"],"obtainable":["Obtainable Moves","Obtainable Abilities","Obtainable Formes","EV Limit = Auto","Obtainable Misc"],"onevsone":["Picked Team Size = 1"],"twovstwo":["Picked Team Size = 2"],"littlecup":["Max Level = 5"],"blitz":["Timer Starting = 15","Timer Grace = 30","Timer Add Per Turn = 5","Timer Max Per Turn = 15","Timer Max First Turn = 40"],"vgctimer":["Timer Starting = 420","Timer Grace = 90","Timer Add Per Turn = 0","Timer Max Per Turn = 55","Timer Max First Turn = 90","Timeout Auto Choose","DC Timer Bank"],"evasionclause":["Evasion Abilities Clause","Evasion Items Clause","Evasion Moves Clause"],"drypassclause":["Baton Pass Stat Clause","Baton Pass Stat Trap Clause"],"stabmonsmovelegality":["OM Unobtainable Moves"],"alphabetcupmovelegality":["OM Unobtainable Moves"],"sketchmonsmovelegality":["OM Unobtainable Moves"],"lgpenormalrules":["Adjust Level = 50"],"chimera1v1rule":["Team Preview","Picked Team Size = 6"],"tiershiftmod":["Overflow Stat Mod"]},
        standardag: ['Obtainable', 'Team Preview', 'HP Percentage Mod', 'Cancel Mod', 'Endless Battle Clause'],
        standard: ['Standard AG', 'Sleep Clause Mod', 'Species Clause', 'Nickname Clause', 'OHKO Clause', 'Evasion Items Clause', 'Evasion Moves Clause'],
        tiershiftmod: ['Overflow Stat Mod'],
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

    const overflowRuleCache = new Map();
    function hasOverflowStatMod(format) {
        const cached = overflowRuleCache.get(format);
        if (cached !== undefined) return cached;
        const bans = getMergedBansForFormat(format);
        const base = searchFormatId(format);
        const standardOM = base === 'noholdsbarred' || MOD_DEFINITIONS.some((d) =>
            [...(d.formatKeywords || []), ...(d.providerKeywords || [])].includes(base));
        // A named OM's Standard OMs rules apply while formathelp is loading.
        // Explicit custom removals still run last through resolveClauseRules.
        const ruleset = bans?.ruleset?.length ? bans.ruleset : standardOM ? ['Standard OMs'] : [];
        const enabled = resolveClauseRules({...bans, ruleset}, format).has('overflowstatmod');
        if (overflowRuleCache.size >= 40) overflowRuleCache.delete(overflowRuleCache.keys().next().value);
        overflowRuleCache.set(format, enabled);
        return enabled;
    }

    // Gen 3+ nature multiplication truncates the product to 16 bits.
    // Neutral stats and HP do not pass through that multiplication.
    function natureStatValue(raw, multiplier, overflowMod) {
        if (multiplier === 1.1) {
            raw = overflowMod ? Math.min(raw, 595) : raw;
            return Math.floor(((raw * 110) & 65535) / 100);
        }
        if (multiplier === 0.9) {
            raw = overflowMod ? Math.min(raw, 728) : raw;
            return Math.floor(((raw * 90) & 65535) / 100);
        }
        return Math.floor(raw * multiplier);
    }

    function resolvedNativeStat(original, receiver, dex, format, stat, set, evOverride, natureOverride) {
        if (!set || dex?.gen < 3 || stat === 'hp' ||
            /letsgo|champions/.test(String(format))) {
            return original.call(receiver, stat, set, evOverride, natureOverride);
        }
        const natures = window.BattleNatures || (typeof BattleNatures !== 'undefined' ? BattleNatures : {});
        const nature = natures[set.nature];
        let multiplier = natureOverride || (nature?.plus === nature?.minus ? 1 :
            nature?.plus === stat ? 1.1 : nature?.minus === stat ? 0.9 : 1);
        // Nature Swap's own statModify hook applies only the positive nature.
        if (multiplier === 0.9 && searchFormatId(format) === 'natureswap') multiplier = 1;
        if (multiplier === 1) return original.call(receiver, stat, set, evOverride, natureOverride);
        const raw = original.call(receiver, stat, set, evOverride, 1);
        return natureStatValue(raw, multiplier, hasOverflowStatMod(format));
    }

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
        if(battleCommandRoom?.__qolIgnoreBans) return emptyBanSections();
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
        if (!entry.loaded || !entry.bans) return String(format).includes('@@@') ? addExplicitClauseBans(applyCustomRuleTokens(emptyBanSections(),formatRuleTokens(format).map(op=>op.raw)),format) : null;

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
        overflowRuleCache.clear();
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
    let formatDataRevision = 0;

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
            species: new Set(), baseSpecies: new Set(), tiers: new Set(), tags: new Set(),
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
        cacheSmogonPageReply(formatId, html);
        const sections = parseFormatSectionTokens(html, null);
        if (!sections || !Object.keys(sections).length) return false;
        const entry = genericBanlists.get(formatId) || {loaded: false, verified: false};
        entry.bans = parseBanSections(sections);
        formatDataRevision++;
        for (const tier of inferredTierBans(formatId).tiers) entry.bans.tiers.add(tier);
        entry.merged = null;
        entry.loaded = true;
        entry.verified = true;
        entry.silent = false;
        genericBanlists.set(formatId, entry);
        overflowRuleCache.clear();
        convergenceIndexCache.clear();
        convergenceMoveCache.clear();
        const room = getTeambuilderRoom();
        const engine = room?.search?.engine;
        for (const search of [engine?.typedSearch, engine?.moveSearch, engine?.abilitySearch]) {
            if (search) clearSearchCache(search);
        }
        if (engine) {
            refreshSearch(room, {clearBase: true});
            // The classic search widget needs find() to rebuild its visible
            // rows when the named format's rules arrive during a Pokémon query.
            if (room.curChartName === 'pokemon' && engine.typedSearch?.searchType === 'pokemon' &&
                genericBanFormatId(room.curTeam?.format) === formatId &&
                isConvergenceMegamons(room.curTeam?.format)) {
                try {
                    const query = engine.query ? room.$?.('input[name=pokemon]')?.val?.() ?? engine.query : '';
                    room.search.find?.(query);
                } catch (error) {
                    console.warn(LOG, 'Could not refresh Megamons search:', error);
                }
            }
        }
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
        if ((!bans?.abilities?.size&&!bans?.tags?.has('allabilities')) || !sp?.abilities) return null;
        for (const name of Object.values(sp.abilities)) {
            const id = toID(name);
            if (id && categoryBanned(bans,'abilities',id)) return name;
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
        if (categoryBanned(bans,'abilities',abilityId)) return true;
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
    // ---------- battle-aware commands ----------
    const battleFormatJobs = new WeakMap();
    let battleFormatQueue = Promise.resolve();
    const battleDataRequests = new Map();
    function cleanChallengeFormat(format) {
        const [base, ...parts] = String(format || '').trim().split('@@@');
        const rules = parts.join(',').split(',').map(squash).filter(rule =>
            rule && (isBanRule(rule) || fmtId(rule) !== fmtId(base)));
        return base + (rules.length ? '@@@' + rules.join(',') : '');
    }
    function battlePublicFormat(room) {
        const b = room.battle;
        const raw = b?.format?.id || b?.tier || '';
        const base = resolveFormatKey(raw, b?.gen || 9) || fmtId(raw);
        const rules = Object.keys(b?.rules || {}).filter(rule =>
            MOD_DEFINITIONS.some(d => fmtId(d.challengeRule) === fmtId(rule)));
        return cleanChallengeFormat(base + (rules.length ? '@@@' + rules.join(',') : ''));
    }
    function battleFormat(room) {
        if (room.__qolFullFormat) return Promise.resolve(room.__qolFullFormat);
        if (battleFormatJobs.has(room)) return battleFormatJobs.get(room);
        const fallback = battlePublicFormat(room);
        // fullformat is intentionally restricted by PS to battle participants.
        if (!room.request?.side || !window.app?.once) return Promise.resolve(fallback);
        const job = battleFormatQueue.catch(() => {}).then(() => new Promise(resolve => {
            let done = false;
            const finish = value => {
                if (done) return;
                done = true; clearTimeout(timer);
                window.app.off?.('response:fullformat', receive);
                const format = typeof value === 'string' && value ? cleanChallengeFormat(value) : fallback;
                if (value) room.__qolFullFormat = format;
                resolve(format);
            };
            const receive = value => finish(value);
            const timer = setTimeout(() => finish(null), 4000);
            window.app.once('response:fullformat', receive);
            window.app.send('/cmd fullformat ' + room.id);
        }));
        battleFormatQueue = job;
        battleFormatJobs.set(room, job);
        job.finally(() => battleFormatJobs.delete(room));
        return job;
    }
    function battleTargetSides(room, target = '', multiple = false) {
        const b = room.battle;
        if (!b) throw new Error('Use this command in a battle chat.');
        const sides = [...new Set(b.sides || [b.p1, b.p2, b.p3, b.p4])].filter(s => s?.name);
        const name = fmtId(smogonPageQuery(target));
        if (name) {
            const side = sides.find(s => fmtId(s.name) === name || s.id === name);
            if (!side) throw new Error('That player is not in this battle.');
            return [side];
        }
        const mine = (localBattleSession?.roomids?.includes(room.id)?(localBattleSession.localPlayerSide||'p1'):room.request?.side?.id) || sides.find(s => fmtId(s.name) === fmtId(window.app?.user?.get?.('name')))?.id;
        const own = sides.find(s => s.id === mine);
        let candidates = own ? sides.filter(s => s !== own && (!own.ally || s !== own.ally)) : [];
        if (!candidates.length && b.farSide?.name) candidates = [b.farSide];
        if (!candidates.length) throw new Error('No opponent is available yet. Specify a player name.');
        if (candidates.length > 1 && !multiple) throw new Error('There is more than one opponent. Use /stealteam playername.');
        return candidates;
    }
    function battleKnownSet(pokemon, dex, format) {
        const detail = String(pokemon.details || '').split(',')[0];
        let species = dex.species.get(detail || pokemon.speciesForme || '');
        if (!species?.exists) return null;
        // Battle-only transformations aren't selectable on ordinary teams.
        if (!/hackmons|\bbh\b/.test(searchFormatId(format)) && !formatRuleTokens(format).some(op => op.kind === 'remove' && ['obtainable','obtainableformes'].includes(op.id)) && !allowsConvergenceBattleFormes(format, getMergedBansForFormat(format)) && species.battleOnly) {
            species = dex.species.get(typeof species.battleOnly === 'string' ? species.battleOnly : species.baseSpecies);
        }
        const moves = [...new Set([...(pokemon.moves || []), ...(pokemon.moveTrack || []).map(m => m[0])]
            .filter(m => m && !m.startsWith('*') && fmtId(m) !== 'struggle'))]
            .map(m => dex.moves.get(m)).filter(m => m.exists && !m.isZ && !m.isMax).map(m => m.name).slice(0, 4);
        const set = {species: species.name, name: pokemon.name || species.name, moves,
            ability: pokemon.baseAbility || '', item: '', nature: pokemon.nature || '',
            gender: pokemon.gender || '', level: pokemon.level || 100, shiny: !!pokemon.shiny};
        // The original item, when revealed and then consumed/removed, is more
        // useful than an item received from Trick. Unknown remains blank.
        if (pokemon.prevItem && !/trick|switcheroo|bestow|pickup/i.test(pokemon.prevItemEffect || '')) set.item = pokemon.prevItem;
        else if (!/trick|switcheroo|bestow|pickup/i.test(pokemon.itemEffect || '')) set.item = pokemon.item || '';
        if (pokemon.teraType || pokemon.terastallized) set.teraType = pokemon.teraType || pokemon.terastallized;
        return set;
    }
    function battleCommandContext(room, format, pokemon = null, speciesName = '') {
        const dex = room.battle.dex || window.Dex;
        const set = pokemon ? battleKnownSet(pokemon, dex, format) : {species: speciesName, name: '', item: '', ability: '', moves: []};
        if (!set) throw new Error('The Pokémon has not been revealed yet.');
        if (!pokemon && room.__qolArgumentSet) Object.assign(set, room.__qolArgumentSet);
        if (pokemon) {
            const current = pokemon.getSpeciesForme?.() || pokemon.speciesForme || set.species;
            const transformed = pokemon.__qolMnmEvolved || (/mega|primal/i.test(current) && current !== pokemon.speciesForme);
            if (modsFromFormatString(format).includes(MOD.MIX_AND_MEGA) && transformed && set.item) {
                set.species = pokemon.speciesForme;
            } else {
                set.species = current;
                if (modsFromFormatString(format).includes(MOD.MIX_AND_MEGA)) set.item = '';
            }
        }

        const side = pokemon?.side;
        const sets = side?.pokemon?.map(p => battleKnownSet(p, dex, format)).filter(Boolean) || [set];
        const index = pokemon ? side?.pokemon?.indexOf(pokemon) : 0;
        if (index >= 0) sets[index] = set;
        return {dex, set, pokemon, format, mods: room.__qolCommandMods||modsFromFormatString(format), room: {__qolIgnoreBans:!!room.__qolIgnoreBans,curTeam: {format, gen: dex.gen, dex}, curSet: set, curSetList: sets}};
    }
    function withBattleCommandContext(ctx, fn) {
        const prior = battleCommandRoom;
        battleCommandRoom = ctx.room;
        try { return fn(); } finally { battleCommandRoom = prior; }
    }
    function battleModBadge(mods) { return ''; }
    async function stealBattleTeam(room, target) {
        const local=isLocalBattleRoom(room.id)&&localBattleSession?.roomids.includes(room.id)?localBattleSession:null;
        if(local)await local.serial;
        const side = battleTargetSides(room, target)[0];
        const format = await battleFormat(room);
        const dex = room.battle.dex || window.Dex;
        const sideId=side.sideid||(side===room.battle.p1?'p1':side===room.battle.p2?'p2':side.id);
        const sets = local ? local.sandbox.sides.find(team=>team.id===sideId).pokemon.map(p=>JSON.parse(JSON.stringify(p.set))) : side.pokemon.map(p => battleKnownSet(p, dex, format)).filter(Boolean);
        if (!sets.length) throw new Error('No Pokémon have been revealed for that player yet.');
        const storage = window.Storage;
        if (!storage?.packTeam || !Array.isArray(storage.teams)) throw new Error('The teambuilder is not ready yet.');
        const key = side.id;
        const stolen = room.__qolStolenTeams || (room.__qolStolenTeams = new Map());
        let team = stolen.get(key);
        const existing = team && storage.teams.includes(team);
        const next = {name: side.name, format, gen: room.battle.gen || 9, folder: '', team: storage.packTeam(sets), iconCache: ''};
        const previous = existing ? {...team} : null;
        if (existing) Object.assign(team, next);
        else { team = next; storage.teams.push(team); }
        try { storage.saveTeam ? storage.saveTeam(team) : storage.saveTeams(); }
        catch (e) {
            if (existing) Object.assign(team, previous);
            else storage.teams.splice(storage.teams.indexOf(team), 1);
            throw e;
        }
        stolen.set(key, team);
        window.app.user?.trigger?.('saveteams');
        const builder = getTeambuilderRoom();
        if (builder && !builder.curTeam) builder.update?.();
        room.add('|raw|Created team ' + smogonPageEsc(side.name) + '.');
    }
    function uncachedBattleMovePool(ctx) {
        return withBattleCommandContext(ctx, () => {
            const Search = window.BattleMoveSearch;
            if (!Search) throw new Error('Showdown’s move data is not loaded yet. Open the teambuilder once and retry.');
            const search = new Search('move', ctx.format, ctx.set);
            search.dex = ctx.dex; search.species = fmtId(ctx.set.species); search.set = ctx.set;
            search.__qolNatdexMoves = isNationalDexFormat(ctx.format);
            search.__qolHackmonsMoves = ctx.mods.includes(MOD.ALL_MOVES) || /hackmons|bh$/.test(searchFormatId(ctx.format));
            return [...new Set(search.getBaseResults().filter(row => row[0] === 'move').map(row => row[1]))]
                .map(id => ctx.dex.moves.get(id)).filter(m => m?.exists);
        });
    }
    function battleMovePredicate(term, dex) {
        let raw = term.trim().toLowerCase();
        const exclude = raw.startsWith('!');
        if (exclude) raw = raw.slice(1).trim();
        const choices = raw.split('|').map(s => s.trim());
        const tests = choices.map(value => {
            const id = fmtId(value.replace(/ type$/, ''));
            if (['physical', 'special', 'status'].includes(id)) return m => m.category.toLowerCase() === id;
            if (window.BattleTypeChart && Object.keys(window.BattleTypeChart).some(t => fmtId(t) === id)) return m => fmtId(m.type) === id;
            const number = /^(bp|basepower|power|accuracy|acc|pp|priority|gen)\s*(<=|>=|=|<|>)\s*(-?\d+)$/.exec(value.replace(/base power/, 'basepower'));
            if (number) return m => {
                const key = {bp: 'basePower', basepower: 'basePower', power: 'basePower', acc: 'accuracy'}[number[1]] || number[1];
                const a = m[key] === true ? 100 : m[key], b = Number(number[3]);
                return ({'<': a < b, '>': a > b, '=': a === b, '<=': a <= b, '>=': a >= b})[number[2]];
            };
            if (['contact','sound','punch','bite','pulse','slicing','bullet','wind','powder','protect','reflectable','snatch','mirror','defrost','gravity','distance','heal','bypasssub'].includes(id)) return m => !!m.flags?.[id];
            if (id === 'recovery') return m => !!m.heal || !!m.drain;
            if (id === 'priority') return m => m.priority > 0;
            if (id === 'all' || id === 'natdex') return () => true;
            const move = dex.moves.get(value);
            if (move.exists) return m => m.id === move.id;
            throw new Error('Unsupported move-search filter in the local OM search: ' + term + '. Use an explicit mod=genN for native search syntax.');
        });
        return m => exclude !== tests.some(test => test(m));
    }
    async function runBattleMoves(room, argument, cmd) {
        const parts = argument.split(',').map(s => s.trim()).filter(Boolean);
        const dex = room.battle.dex || window.Dex;
        let speciesIndex = parts.findIndex(p => dex.species.get(p).exists);
        if (speciesIndex < 0 && parts.length === 1 && !Object.keys(window.BattleTypeChart||{}).some(t=>fmtId(t)===fmtId(parts[0])) && !/^(physical|special|status|all)$/i.test(parts[0])) {
            parts[0] = resolveBattleSpecies(dex, parts[0]).name; speciesIndex = 0;
        }
        if (speciesIndex < 0) return false;
        const species = dex.species.get(parts.splice(speciesIndex, 1)[0]);
        const format = await battleFormat(room);
        const ctx = battleCommandContext(room, format, null, species.name);
        if (cmd === 'nms' || parts.some(p => fmtId(p) === 'natdex')) ctx.format += (ctx.format.includes('@@@') ? ',' : '@@@') + 'NatDex Mod';
        ctx.room.curTeam.format = ctx.format;
        // Wait for the same authoritative banlist used by the teambuilder.
        if (ctx.mods.includes(MOD.CONVERGENCE) && !room.__qolIgnoreBans) {
            const base = fmtId(format.split('@@@')[0]);
            await waitForFormatDependencies(format,dex);
            if (!genericBanlists.get(base)?.verified) throw new Error('The battle format’s banlist has not loaded. Retry shortly; donor legality is not guessed.');
        }
        const tests = parts.map(p => battleMovePredicate(p, dex));
        let moves = battleMovePool(ctx);
        moves = withBattleCommandContext(ctx, () => withMovePreviews(dex, ctx.set, ctx.mods, undefined,
            () => moves.filter(m => tests.every(test => test(dex.moves.get(m.id))))));
        moves.sort((a,b) => a.name.localeCompare(b.name));
        const mapLinks = list => list.map(m => `<a href="//dex.pokemonshowdown.com/moves/${m.id}" target="_blank" class="subtle" style="white-space:nowrap">${smogonPageEsc(m.name)}</a>`).join(', ');
        const message = '/' + cmd + ' ' + argument;
        const header = smogonPageEsc(message + ' (' + moves.length + ' results)') + battleModBadge(ctx.mods);
        const preview = moves.length > 10 ? mapLinks(moves.slice(0, 10)) + ', and ' + (moves.length - 10) + ' more. <span class="ilink">Show all</span>' : mapLinks(moves);
        const html = moves.length > 30
            ? `<details class="details"><summary><span class="gray">${header}</span><br/><span class="details-preview">${preview}</span></summary>${mapLinks(moves)}</details>`
            : `<span class="gray">Matching moves found in learnset(s) for</span> ${smogonPageEsc(species.name)}:${battleModBadge(ctx.mods)}<br />${mapLinks(moves) || 'No moves found.'}`;
        room.add('|raw|<div class="infobox">' + html + '</div>');
        return true;
    }
    function patchBattleDtHtml(html, ctx) {
        if (!ctx.dex.species.get(ctx.set.species).exists) return html;
        return renderDataPreviewCard(ctx, ctx.pokemon);
    }
    function transformBattleCommandReplies(packet) {
        if (typeof packet !== 'string' || !packet.startsWith('>')) return packet;
        const lines = packet.split('\n');
        const id = lines[0].slice(1);
        const requests = (battleDataRequests.get(id) || []).filter(r => Date.now() - r.at < 15000);
        if (!requests.length) return packet;
        let active = null;
        for (let i = 1; i < lines.length; i++) {
            const match = /^(\|c(?:\:\|\d+)?\|([^|]+)\|\/raw )([\s\S]*)$/.exec(lines[i]);
            if (!match || fmtId(match[2]) !== fmtId(window.app?.user?.get?.('name'))) continue;
            let html = match[3];
            const name = /class="col pokemonnamecol"[^>]*><a[^>]*>([^<]+)<\/a>/.exec(html)?.[1];
            if (name) {
                active = requests.find(r => fmtId(r.displaySpecies || r.ctx.set.species) === fmtId(name));
                if (!active) continue;
                html = patchBattleDtHtml(html, active.ctx);
                if (!active.details) { requests.splice(requests.indexOf(active), 1); }
            } else if (active && /<font\b/.test(html)) {
                html = html.replace(/<\/font>/, battleModBadge(active.ctx.mods) + '</font>');
                requests.splice(requests.indexOf(active), 1); active = null;
            }
            lines[i] = match[1] + html;
        }
        battleDataRequests.set(id, requests);
        return lines.join('\n');
    }
    async function runBattleData(room, cmd, argument, send) {
        const format = await battleFormat(room);
        const dex = room.battle.dex || window.Dex;
        const explicit = argument.includes(',') || /\d$/.test(cmd);
        if (explicit) { send('/' + cmd + (argument ? ' ' + argument : '')); return; }
        const facing = argument ? [] : battleTargetSides(room, '', true).flatMap(s => s.active || []).filter(Boolean);
        let resolvedArgument = argument;
        if (argument && !dex.species.get(argument).exists && !dex.moves.get(argument).exists && !dex.items.get(argument).exists && !dex.abilities.get(argument).exists) resolvedArgument = resolveBattleSpecies(dex, argument).name;
        const targets = argument ? [{name: resolvedArgument, pokemon: null}] :
            facing.map(p => ({name: p.speciesForme, pokemon: p}));
        if (!targets.length) throw new Error('No opposing Pokémon are active yet. Use /dt Pokémon.');
        for (const target of targets) {
            const species = dex.species.get(target.name);
            if (species.exists) {
                const ctx = battleCommandContext(room, format, null, species.name);
                const requests = (battleDataRequests.get(room.id) || []).filter(r => Date.now() - r.at < 15000 && r.ctx.format === format);
                requests.push({ctx, displaySpecies: species.name, details: /^(dt|details)$/.test(cmd), at: Date.now()});
                battleDataRequests.set(room.id, requests);
            }
            send('/' + cmd + ' ' + target.name);
        }
    }
    async function runBattleLearn(room, argument) {
        const parts = argument.split(',').map(s => s.trim()).filter(Boolean);
        const dex = room.battle.dex || window.Dex;
        const species = dex.species.get(parts.shift() || '');
        if (!species.exists || !parts.length) throw new Error('Use /learn Pokémon, move, move.');
        const format = await battleFormat(room);
        const ctx = battleCommandContext(room, format, null, species.name);
        if (ctx.mods.includes(MOD.CONVERGENCE) && !room.__qolIgnoreBans) {
            const base = fmtId(format.split('@@@')[0]);
            await waitForFormatDependencies(format,dex);
            if (!genericBanlists.get(base)?.verified) throw new Error('The battle format’s banlist is still loading. Retry shortly.');
        }
        const pool = new Set(battleMovePool(ctx).map(m => m.id));
        const results = parts.map(name => {
            const move = dex.moves.get(name);
            if (!move.exists) throw new Error('Unknown move: ' + name);
            return smogonPageEsc(move.name) + ': ' + (pool.has(move.id) ? 'in this format’s movepool' : 'not in this format’s movepool');
        });
        showSmogonPageReply(room, '<strong>' + smogonPageEsc(species.name) + '</strong>' + battleModBadge(ctx.mods) + '<br />' +
            results.join('<br />') + '<br /><small>Movepool membership; use team validation to check the complete set.</small>');
    }
    async function runBattleWeakness(room, cmd, argument, send) {
        if (argument.includes(',')) { send('/' + cmd + ' ' + argument); return; }
        const format = await battleFormat(room);
        const dex = room.battle.dex || window.Dex;
        const targets = argument ? [{species: argument}] : battleTargetSides(room, '', true)
            .flatMap(s => s.active || []).filter(Boolean).map(p => ({species: p.speciesForme, pokemon: p}));
        if (!targets.length) throw new Error('No opposing Pokémon are active yet.');
        for (const target of targets) {
            const species = dex.species.get(target.species);
            if (!species.exists) { send('/' + cmd + ' ' + target.species); continue; }
            const ctx = battleCommandContext(room, format, null, species.name);
            const types = withBattleCommandContext(ctx, () => modifiedTypes(ctx.mods, dex, ctx.set)) || species.types;
            showSmogonPageReply(room, smogonPageEsc(species.name) + ' — ' + types.map(smogonPageEsc).join('/') + battleModBadge(ctx.mods));
            send('/' + cmd + ' ' + types.join(', '));
        }
    }
    function dataPreviewEnabled() {
        try { return JSON.parse(localStorage.getItem('qol-data-preview') || 'false') === true; } catch (e) { return false; }
    }
    const battlePoolCache = new WeakMap();
    function battleMovePool(ctx) {
        let cache = battlePoolCache.get(ctx.dex);
        if (!cache) battlePoolCache.set(ctx.dex, cache = new Map());
        const key = JSON.stringify([ctx.format, ctx.set, !!ctx.room.__qolIgnoreBans]);
        const bans = genericBanlists.get(fmtId(ctx.format.split('@@@')[0]))?.bans || convergenceBans;
        const prior = cache.get(key);
        if (prior && prior.bans === bans && prior.revision === formatDataRevision) return prior.moves.slice();
        const moves = withBattleCommandContext(ctx,()=>{
            const bans=getMergedBansForFormat(ctx.format);
            return uncachedBattleMovePool(ctx).filter(move=>!categoryBanned(bans,'moves',move.id));
        });
        if (cache.size > 32) cache.delete(cache.keys().next().value);
        cache.set(key, {bans, moves, revision: formatDataRevision});
        return moves.slice();
    }
    // Shared by editor format changes and battle startup. These are the same
    // cache entries consumed by legality and movepool providers, not copies.
    const preparedFormats = new Map();
    function prepareFormatDependencies(format, dex = window.Dex) {
        const key=String(format || '');
        if(!key || !dex) return null;
        let prepared=preparedFormats.get(key);
        if(!prepared) {
            prepared={format:key,mods:modsFromFormatString(key),dependencies:new Set(),base:null};
            if(preparedFormats.size>=64)preparedFormats.delete(preparedFormats.keys().next().value);
            preparedFormats.set(key,prepared);
        }
        const visit=(value,seen=new Set())=>{
            const id=fmtId(String(value).split('@@@')[0]);
            if(!id || seen.has(id))return;
            seen.add(id);prepared.dependencies.add(id);
            let entry=genericBanlists.get(id);
            if(entry?.sentAt && !entry.verified && Date.now()-entry.sentAt>=SILENT_BANLIST_TIMEOUT) {
                entry.sentAt=0;entry.silent=false;
            }
            entry=requestGenericBanlist(id);
            if(!prepared.base)prepared.base=entry;
            const explicit=String(value).split('@@@').slice(1).join(',').split(',');
            const removed=new Set(explicit.map(parseChallengeRule).filter(op=>op?.kind==='remove').map(op=>op.id));
            for(const token of [...(entry.bans?.ruleset||[]),...explicit]) {
                const op=parseChallengeRule(token);
                if(op?.kind==='rule' && !removed.has(op.id) && !RULE_CATALOG.has(op.id) && window.BattleFormats?.[op.id]) visit(op.id,seen);
            }
        };
        visit(key);
        // Populate the shared generation-aware item/move rule caches too.
        moveFormatRules(key);
        getMergedBansForFormat(key);
        prepared.ready=[...prepared.dependencies].every(id=>genericBanlists.get(id)?.verified);
        return prepared;
    }
    async function waitForFormatDependencies(format,dex) {
        let prepared=prepareFormatDependencies(format,dex);
        if(!prepared)return false;
        const waited=new Set();
        while(!prepared.ready) {
            const missing=[...prepared.dependencies].filter(id=>!genericBanlists.get(id)?.verified && !waited.has(id));
            if(!missing.length)return false;
            await Promise.all(missing.map(id=>{waited.add(id);return requestSmogonPageResources(id);}));
            prepared=prepareFormatDependencies(format,dex);
        }
        return true;
    }
    function warmBattleFormat(room,format) {
        const generation=(room.__qolWarmGeneration||0)+1;
        room.__qolWarmGeneration=generation;
        const dex=room.battle.dex||window.Dex;
        const prepared=prepareFormatDependencies(format,dex);
        if(!prepared)return;
        const warm=()=>{
            if(room.__qolWarmGeneration!==generation || window.app?.rooms?.[room.id]!==room)return;
            const plan=prepareFormatDependencies(format,dex);
            if(!plan?.ready)return;
            const sides=room.battle.sides||[room.battle.p1,room.battle.p2];
            const pokemon=sides.filter(Boolean).flatMap(side=>side.pokemon||[]).filter(p=>p.speciesForme && p.details);
            const types=new Set();
            // One group initializes the shared Convergence donor index. Reuse
            // it for remaining types rather than rebuilding a pool for every mon.
            for(const p of pokemon) {
                const ctx=battleCommandContext(room,format,p);
                const sp=dex.species.get(ctx.set.species);
                if(!sp.exists)continue;
                const typeKey=sp.types.join('/');
                if(types.has(typeKey))continue;
                types.add(typeKey);
                withBattleCommandContext(ctx,()=>{
                    if(plan.mods.includes(MOD.CONVERGENCE))getConvergenceGroup(dex,sp,format);
                });
            }
        };
        if(prepared.ready)warm();
        else waitForFormatDependencies(format,dex).then(ready=>{if(ready)warm();}).catch(error=>console.warn(LOG,'Format preload failed',error));
    }
    function primeBattleCommands() {
        for (const room of Object.values(window.app?.rooms || {})) {
            if (!room?.battle || room.__qolBattlePrimed || !room.battle.tier) continue;
            if (!dataPreviewEnabled()) continue;
            room.__qolBattlePrimed = true;
            battleFormat(room).then(format => {
                warmBattleFormat(room,format);
            }).catch(error => { console.warn(LOG, 'Battle format preload failed', error); });
        }
    }
    function dataPreviewSpecies(ctx, pokemon) {
        if (ctx.commandSpecies) return ctx.commandSpecies;
        const species = ctx.dex.species.get(ctx.set.species);
        const baseStats = withBattleCommandContext(ctx, () => computeModsBaseStats(ctx.mods, ctx)) || species.baseStats;
        const types = withBattleCommandContext(ctx, () => modifiedTypes(ctx.mods, ctx.dex, ctx.set)) || species.types;
        let abilities = species.abilities;
        if (ctx.mods.includes(MOD.CROSS_EVOLUTION)) abilities = resolveCrossEvolution(ctx.dex, ctx.set)?.cross?.abilities || abilities;
        const stoneAbility = ctx.mods.includes(MOD.MIX_AND_MEGA) && mixAndMegaFutureAbility(ctx.dex, ctx.set);
        if (stoneAbility) abilities = {0: stoneAbility};
        const visible = null; // Data Preview is format data; Tera and live type changes do not alter it.
        const actualTypes = Array.isArray(visible?.[0]) ? [...new Set([...visible[0], ...(visible[1] ? [visible[1]] : [])])] : types;
        return {...species, baseStats, types: actualTypes, abilities, bst: sumStats(baseStats)};
    }
    function renderDataPreviewCard(ctx, pokemon) {
        const sp = dataPreviewSpecies(ctx, pokemon);
        const esc = smogonPageEsc;
        let html = '<li class="result"><span class="col numcol">' + 'Mod' + '</span> ' +
            `<span class="col iconcol"><psicon pokemon="${esc(sp.id)}"/></span> ` +
            `<span class="col pokemonnamecol" style="white-space:nowrap"><a href="https://dex.pokemonshowdown.com/pokemon/${esc(sp.id)}" target="_blank">${esc(sp.name)}</a></span> ` +
            '<span class="col typecol">' + sp.types.map(type => `<img src="https://play.pokemonshowdown.com/sprites/types/${encodeURIComponent(type)}.png" alt="${esc(type)}" height="14" width="32">`).join('') + '</span> ';
        if (ctx.dex.gen >= 3) {
            const a = sp.abilities || {};
            html += '<span style="float:left;min-height:26px">';
            html += a[1] ? `<span class="col twoabilitycol">${esc(a[0] || '')}<br />${esc(a[1])}</span>` : `<span class="col abilitycol">${esc(a[0] || '')}</span>`;
            const hidden = [a.H, a.S && '(' + a.S + ')'].filter(Boolean);
            html += `<span class="col ${hidden.length > 1 ? 'twoabilitycol' : 'abilitycol'}${sp.unreleasedHidden ? ' unreleasedhacol' : ''}"><em>${hidden.map(esc).join('<br />')}</em></span></span>`;
        }
        html += '<span style="float:left;min-height:26px">';
        const labels = {hp:'HP',atk:'Atk',def:'Def',spa:ctx.dex.gen === 1 ? 'Spc' : 'SpA',spd:'SpD',spe:'Spe'};
        for (const stat of STATS) {
            if (ctx.dex.gen === 1 && stat === 'spd') continue;
            html += `<span class="col statcol"><em>${labels[stat]}</em><br />${sp.baseStats[stat]}</span> `;
        }
        html += `<span class="col bstcol"><em>BST<br />${sp.bst}</em></span> </span></li>`;
        return `<div class="message"><ul class="utilichart">${html}<li style="clear:both"></li></ul></div>` +
            '';
    }
    function previewRoomForBattle(battle) {
        return Object.values(window.app?.rooms || {}).find(room => room.battle === battle);
    }
    function updateBattleDataPreview(room, force = false, all = false) {
        if (!room?.battle) return;
        const battle = room.battle;
        const format = room.__qolFullFormat || battlePublicFormat(room);
        const state = room.__qolPreviewState || (room.__qolPreviewState = new Map());
        const sides = battleTargetSides(room, '', true);
        for (const side of sides) for (const pokemon of (all ? side.pokemon : side.active) || []) {
            if (!pokemon?.speciesForme || !pokemon.details) continue;
            try {
                const speciesName=String(pokemon.details||pokemon.speciesForme).split(',')[0];
                const ctx = battleCommandContext(room, format, null, speciesName);
                if(ctx.mods.some(m=>[MOD.CROSS_EVOLUTION,MOD.FRANTIC_FUSIONS,MOD.INHERITANCE].includes(m)))ctx.set.name=pokemon.name||'';
                const sp = dataPreviewSpecies(ctx, pokemon);
                if (!sp.exists) continue;
                const signature = JSON.stringify([format, sp.id, sp.baseStats, sp.types, sp.abilities]);
                if (!force && state.get(pokemon) === signature) continue;
                state.set(pokemon, signature);
                if (typeof battle.log === 'function') battle.log(['raw', renderDataPreviewCard(ctx, pokemon)]);
                else room.add('|raw|' + renderDataPreviewCard(ctx, pokemon));
            } catch (error) { console.warn(LOG, 'Data preview failed', error); }
        }
    }
    // /dp is a one-shot team lookup. A stable native UHTML block replaces
    // the previous result and moves the fresh cards to the bottom of the log.
    function writeCommandDataPreview(room, cards, generation) {
        if (room && generation !== room.__qolDpGeneration) return;
        const html = cards.join('');
        const log = room?.battle?.scene?.log;
        if (typeof log?.changeUhtml === 'function') {
            log.changeUhtml('qolcommanddatapreview', html, true);
            for (const parent of [log.innerElem, log.preemptElem]) {
                for (const element of parent?.children || []) {
                    if (element.classList.contains('uhtml-qolcommanddatapreview')) element.setAttribute('data-qol-chat-only', '');
                }
            }
        } else if (room?.add) {
            room.add('|uhtml|qolcommanddatapreview|' + html);
        } else {
            showSmogonPageReply(room, html);
        }
    }
    async function dataPreviewChallengeContext(room) {
        if (!room?.battle) return {battle:{dex:window.Dex}, __qolFullFormat:'gen'+(window.Dex.gen||9)+'customgame'};
        await battleFormat(room);
        let format=room.__qolFullFormat;
        if (!format) {
            // A spectator may not receive /cmd fullformat. Use the public base
            // and any explicit code it contains; do not synthesize rules from
            // battle effects, visible rule messages, saved names or builder state.
            const raw=String(room.battle.format?.id||room.battle.tier||'');
            const [base,...rules]=raw.split('@@@');
            format=(resolveFormatKey(base,room.battle.gen||9)||fmtId(base))+(rules.length?'@@@'+rules.join(','):'');
        }
        return {battle:room.battle,__qolFullFormat:cleanChallengeFormat(format)};
    }
    async function showTeamDataPreview(room, generation) {
        if (generation === undefined) generation = room.__qolDpGeneration = (room.__qolDpGeneration || 0) + 1;
        const contextRoom = await dataPreviewChallengeContext(room), format = contextRoom.__qolFullFormat;
        const cards = [];
        for (const side of battleTargetSides(room, '', true)) for (const pokemon of side.pokemon || []) {
            if (!pokemon?.speciesForme || !pokemon.details) continue;
            const speciesName = String(pokemon.details || pokemon.speciesForme).split(',')[0];
            // Match the existing format-modified /dt lookup. Do not turn on
            // continuous switch-in previews or use temporary combat effects.
            const ctx = battleCommandContext(contextRoom, format, null, speciesName);
            if (dataPreviewSpecies(ctx, pokemon).exists) cards.push(renderDataPreviewCard(ctx, pokemon));
        }
        if (!cards.length) throw new Error('No revealed Pokémon are available to preview yet.');
        writeCommandDataPreview(room, cards, generation);
    }
    function patchDataPreview() {
        patchMethod(window.app, 'receive', '__qolBattlePreload', original => function(...args) {
            const result = original.apply(this, args);
            primeBattleCommands();
            return result;
        });
        const proto = window.BattleOptionsPopup?.prototype;
        patchMethod(proto, 'initialize', '__qolDataPreviewOption', original => function(data) {
            const result = original.call(this, data);
            const room = data.room;
            const option = '<p><label class="checkbox" title="Shows previews on this client. Shared previews require Data Preview in the challenge rules.">' +
                '<input type="checkbox" name="qoldatapreview"' + (dataPreviewEnabled() ? ' checked' : '') + '/> Data preview (local)</label></p>';
            this.$el.find('input[name=ignoreopp]').closest('p').after(option);
            this.$el.off('change.qoldp').on('change.qoldp', 'input[name=qoldatapreview]', event => {
                room.__qolDataPreview = !!event.currentTarget.checked;
                try { localStorage.setItem('qol-data-preview', JSON.stringify(room.__qolDataPreview)); } catch (e) {}
                if (room.__qolDataPreview) updateBattleDataPreview(room);
            });
            return result;
        });
        patchMethod(window.Battle?.prototype, 'run', '__qolDataPreviewEvents', original => function(line, ...args) {
            const result = original.call(this, line, ...args);
            if (typeof line !== 'string' || !/^\|(?:switch|drag|replace|detailschange|-formechange|-mega|-primal|-burst|-transform|-ability|-item|-enditem|-start|-end)\|/.test(line)) return result;
            if (/^\|-(?:mega|primal|burst)\|/.test(line)) {
                const pokemon = this.getPokemon?.(line.split('|')[2]);
                if (pokemon) pokemon.__qolMnmEvolved = true;
            }
            const room = previewRoomForBattle(this);
            if (room && dataPreviewEnabled()) updateBattleDataPreview(room);
            return result;
        });
        primeBattleCommands();
        return !!proto && !!window.Battle?.prototype?.run;
    }
    function resolveBattleSpecies(dex, text) {
        const direct = dex.species.get(text);
        if (direct.exists) return direct;
        const wanted=fmtId(text);
        if (!wanted || wanted.length < 3) throw new Error('Pokémon not found: '+text);
        const distance=(a,b)=>{
            let prev=Array.from({length:b.length+1},(_,i)=>i);
            for(let i=1;i<=a.length;i++) {
                const next=[i];
                for(let j=1;j<=b.length;j++) next[j]=Math.min(next[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
                prev=next;
            }
            return prev[b.length];
        };
        const limit=Math.min(2,Math.max(1,Math.floor(wanted.length/4)));
        let best=limit+1, matches=[];
        for(const key of Object.keys(window.BattlePokedex||{})) {
            if(Math.abs(key.length-wanted.length)>limit) continue;
            const d=distance(wanted,key);
            if(d>best) continue;
            const sp=dex.species.get(key);
            if(!sp.exists || sp.gen>dex.gen) continue;
            if(d<best) {best=d;matches=[];}
            if(d===best) matches.push(sp);
        }
        if(matches.length!==1) throw new Error(matches.length?'No exact match for '+text+'. Possible matches: '+matches.slice(0,6).map(sp=>sp.name).join(', '):'Pokémon not found: '+text);
        return matches[0];
    }
    function battleQueryView(room, format, name, item = null) {
        const resolved = resolveBattleSpecies(room.battle.dex || window.Dex, name);
        name = resolved.name;
        // Command calculations are format-only. Live Pokémon data belongs to
        // Data Preview and team export, never to this lookup path.
        const pokemon = null;
        const ctx = battleCommandContext(room, format, null, name);
        if (item !== null) {
            ctx.set = {...ctx.set, species:name, item};ctx.room={...ctx.room,curSet:ctx.set};ctx.hypothetical=true;
            if(!ctx.mods.includes(MOD.MIX_AND_MEGA))ctx.mods=[...ctx.mods,MOD.MIX_AND_MEGA];
            const lookup=mnmLookup(ctx.dex,ctx.set);if(!lookup?.forme)throw Error('Mega Stone/Primal Orb not found in this generation.');
            // Build the raw stone forme before ModifySpecies handlers. Never apply
            // BnB to the base and then add a stone delta to already doubled stats.
            const raw=ctx.dex.species.get(name),baseStats=withBattleCommandContext(ctx,()=>computeModsBaseStats(ctx.mods,ctx))||raw.baseStats;
            const types=withBattleCommandContext(ctx,()=>modifiedTypes(ctx.mods,ctx.dex,ctx.set))||raw.types;
            ctx.commandSpecies={...raw,baseStats,types,abilities:lookup.forme.formeSpecies.abilities,bst:sumStats(baseStats)};
        }
        return {ctx, species: dataPreviewSpecies(ctx, pokemon)};
    }
    async function runBattleTransform(room, command, argument) {
        // Freeze the room view first. The requested command operates on this
        // snapshot, independently of battle hook priority ordering.
        const format = room.__qolFullFormat || await battleFormat(room);
        const {ctx, species: input} = battleQueryView(room, format, argument.trim());
        if (!input.exists) throw new Error('Pokémon not found.');
        let stats;
        if (['scale','scalemons'].includes(command)) {
            stats = {...input.baseStats};
            const keys = ctx.dex.gen === 1 ? ['hp','atk','def','spa','spe'] : STATS;
            const denominator = keys.reduce((sum,key)=>sum+stats[key],0)-stats.hp;
            for (const key of keys) if (key !== 'hp') stats[key] = clamp255(Math.floor(stats[key]*((ctx.dex.gen===1?500:600)-stats.hp)/denominator));
            if (ctx.dex.gen === 1) stats.spd = stats.spa;
        } else if (['flip','flipped'].includes(command)) {
            stats = ctx.dex.gen === 1 ? {hp:input.baseStats.spe,atk:input.baseStats.spa,def:input.baseStats.def,spa:input.baseStats.atk,spd:input.baseStats.atk,spe:input.baseStats.hp} : flippedModifiedStats(input,input.baseStats);
        } else if (['bnb','badnboosted'].includes(command)) stats=badNBoostedModifiedStats(input,input.baseStats);
        else if (['ts','tiershift'].includes(command)) stats=tierShiftModifiedStats(input,input.baseStats);
        else stats=threeFiftyCupModifiedStats(input,input.baseStats);
        ctx.commandSpecies={...input,baseStats:stats,bst:sumStats(stats)};
        room.add('|raw|'+renderDataPreviewCard(ctx,null));
    }
    async function runBattleMnm(room, argument) {
        const match = /^(.+?)\s*@\s*([^,]+)$/.exec(argument);
        if (!match) throw new Error('Use /mnm Pokémon @ Mega Stone. An explicit generation uses the native command.');
        const format = room.__qolFullFormat || await battleFormat(room);
        const {ctx, species} = battleQueryView(room, format, match[1].trim(), match[2].trim());
        if (!species.exists) throw new Error('Pokémon not found.');
        room.add('|raw|' + renderDataPreviewCard(ctx, null));
        const original = ctx.dex.species.get(ctx.set.species);
        const stone = mnmLookup(ctx.dex, ctx.set)?.forme;
        const weight = Math.max(1, (original.weighthg || 0) + (stone?.formeSpecies.weighthg || 0) - (stone?.baseSpecies.weighthg || 0));
        const height = Math.max(0.1,(original.heightm || 0) + (stone?.formeSpecies.heightm || 0) - (stone?.baseSpecies.heightm || 0));
        const bp = weight >= 2000 ? 120 : weight >= 1000 ? 100 : weight >= 500 ? 80 : weight >= 250 ? 60 : weight >= 100 ? 40 : 20;
        const details = [['Dex#',original.num],['Gen',original.gen],['Height',Number(height.toFixed(1))+' m'],['Weight',weight/10+' kg ('+bp+' BP)'],['Dex Colour',original.color],['Egg Group(s)',original.eggGroups?.join(', ')]]
            .filter(([,v])=>v !== undefined).map(([k,v])=>'<span class="gray">'+smogonPageEsc(k)+':</span> '+smogonPageEsc(v));
        room.add('|raw|<font size="1">'+details.join('&nbsp;|&ThickSpace;')+'&nbsp;|&ThickSpace;<span class="gray">Does Not Evolve</span></font>');
    }
    async function runBattleDexSearch(room, argument) {
        const format = room.__qolFullFormat || await battleFormat(room);
        const dex = room.battle.dex || window.Dex;
        let sort = null;
        const terms = argument.split(',').map(s=>s.trim()).filter(Boolean).filter(term=>{
            const hit = /^(hp|atk|def|spa|spd|spe|bst)\s+(asc|desc)$/i.exec(term);
            if (hit) {sort=hit;return false;}
            return !/^all$/i.test(term);
        });
        const statNames={hp:'hp',attack:'atk',atk:'atk',defense:'def',def:'def',specialattack:'spa',spa:'spa',specialdefense:'spd',spd:'spd',speed:'spe',spe:'spe',bst:'bst'};
        const tests=terms.map(term=>{
            const negative=term.startsWith('!');
            const alternatives=(negative?term.slice(1):term).split('|').map(s=>s.trim());
            const checks=alternatives.map(value=>{
                const numeric=/^([a-z ]+)\s*(>=|<=|>|<|=)\s*(\d+)$/i.exec(value);
                if(numeric && statNames[fmtId(numeric[1])]) return sp=>{
                    const key=statNames[fmtId(numeric[1])], a=key==='bst'?sp.bst:sp.baseStats[key], b=+numeric[3];
                    return ({'>':a>b,'<':a<b,'=':a===b,'>=':a>=b,'<=':a<=b})[numeric[2]];
                };
                const type=Object.keys(window.BattleTypeChart||{}).find(t=>fmtId(t)===fmtId(value.replace(/ type$/i,'')));
                if(type) return sp=>sp.types.some(t=>fmtId(t)===fmtId(type));
                const mon=dex.species.get(value);
                if(mon.exists) return sp=>sp.id===mon.id;
                const ability=dex.abilities.get(value);
                if(ability.exists) return sp=>Object.values(sp.abilities||{}).some(a=>fmtId(a)===ability.id);
                if(/^(nfe|fe)$/i.test(value)) return sp=>value.toLowerCase()==='nfe'?!!sp.evos?.length:!sp.evos?.length;
                const tier=/^(ag|uber|ou|uu|ru|nu|pu|zu|lc|nfe)$/i.test(value);
                if(tier) return sp=>fmtId(sp.tier)===fmtId(value);
                throw new Error('Unsupported battle /ds filter: '+value+'. Use an explicit generation for native search syntax.');
            });
            return sp=>negative !== checks.some(test=>test(sp));
        });
        const hits=[];
        for(const name of Object.keys(window.BattlePokedex||{})) {
            const base=dex.species.get(name);
            if(!base.exists || base.gen>dex.gen) continue;
            const view=battleQueryView(room,format,base.name);
            if(tests.every(test=>test(view.species))) hits.push(view);
        }
        if(sort) hits.sort((a,b)=>{
            const key=sort[1].toLowerCase(); const stat=sp=>key==='bst'?sp.bst:sp.baseStats[key];
            return (stat(a.species)-stat(b.species))*(sort[2].toLowerCase()==='asc'?1:-1);
        });
        if(hits.length===1) {room.add('|raw|'+renderDataPreviewCard(hits[0].ctx,hits[0].ctx.pokemon));return;}
        const links=list=>list.map(({species:sp})=>`<a class="subtle" style="white-space:nowrap" href="//dex.pokemonshowdown.com/pokemon/${sp.id}" target="_blank">${smogonPageEsc(sp.name)}</a>`).join(', ');
        const title=smogonPageEsc('/ds '+argument+' ('+hits.length+' results)');
        const html=hits.length>30?`<details class="details"><summary><span class="gray">${title}</span><br/><span class="details-preview">${links(hits.slice(0,10))}, and ${hits.length-10} more. <span class="ilink">Show all</span></span></summary>${links(hits)}</details>`:`<span class="gray">${title}</span><br/>${links(hits)||'No Pokémon found.'}`;
        room.add('|raw|<div class="infobox">'+html+'</div>');
    }
    function nativeBattleStatcalc(target, room, user) {
		if (!target) return this.parse("/help statcalc");
		if (!this.runBroadcast()) return;

		const targets = target.split(' ');

		let lvlSet = false;
		let natureSet = false;
		let ivSet = false;
		let evSet = false;
		let baseSet = false;
		let modSet = false;
		let realSet = false;

		let pokemon;
		let useStat = '';

		let level = 100;
		let calcHP = false;
		let nature = 1.0;
		let iv = 31;
		let ev = 252;
		let baseStat = -1;
		let modifier = 0;
		let positiveMod = true;
		let realStat = 0;

		for (const arg of targets) {
			const lowercase = arg.toLowerCase();

			if (!lvlSet) {
				if (lowercase === 'lc') {
					level = 5;
					lvlSet = true;
					continue;
				} else if (lowercase === 'vgc') {
					level = 50;
					lvlSet = true;
					continue;
				} else if (lowercase.startsWith('lv') || lowercase.startsWith('level')) {
					level = parseInt(arg.replace(/\D/g, ''));
					lvlSet = true;
					if (isNaN(level)) {
						return this.sendReplyBox('Invalid value for level: ' + smogonPageEsc(arg));
					}
					if (level < 1 || level > 9999) {
						return this.sendReplyBox('Level should be between 1 and 9999.');
					}
					continue;
				}
			}

			if (!useStat) {
				switch (lowercase) {
				case 'hp':
				case 'hitpoints':
					calcHP = true;
					useStat = 'hp';
					continue;
				case 'atk':
				case 'attack':
					useStat = 'atk';
					continue;
				case 'def':
				case 'defense':
					useStat = 'def';
					continue;
				case 'spa':
					useStat = 'spa';
					continue;
				case 'spd':
				case 'sdef':
					useStat = 'spd';
					continue;
				case 'spe':
				case 'speed':
					useStat = 'spe';
					continue;
				}
			}

			if (!natureSet) {
				if (lowercase === 'boosting' || lowercase === 'positive') {
					nature = 1.1;
					natureSet = true;
					continue;
				} else if (lowercase === 'negative' || lowercase === 'inhibiting') {
					nature = 0.9;
					natureSet = true;
					continue;
				} else if (lowercase === 'neutral') {
					continue;
				}
			}

			if (!pokemon) {
				const testPoke = this.species(arg);
				if (testPoke.exists) {
					pokemon = testPoke.baseStats;
					baseSet = true;
					continue;
				}
			}

			if (!ivSet) {
				if (lowercase.endsWith('iv') || lowercase.endsWith('ivs')) {
					iv = parseInt(arg);
					ivSet = true;

					if (isNaN(iv)) {
						return this.sendReplyBox('Invalid value for IVs: ' + smogonPageEsc(arg));
					}

					continue;
				}
			}

			if (!evSet) {
				if (lowercase === 'invested' || lowercase === 'max') {
					evSet = true;
					if (lowercase === 'max' && !natureSet) {
						nature = 1.1;
						natureSet = true;
					}
				} else if (lowercase === 'uninvested') {
					ev = 0;
					evSet = true;
				} else if (lowercase.endsWith('ev') || lowercase.endsWith('evs') ||
					lowercase.endsWith('+') || lowercase.endsWith('-')) {
					ev = parseInt(arg);
					evSet = true;

					if (isNaN(ev)) {
						return this.sendReplyBox('Invalid value for EVs: ' + smogonPageEsc(arg));
					}
					if (ev > 255 || ev < 0) {
						return this.sendReplyBox('The amount of EVs should be between 0 and 255.');
					}

					if (!natureSet) {
						if (arg.includes('+')) {
							nature = 1.1;
							natureSet = true;
						} else if (arg.includes('-')) {
							nature = 0.9;
							natureSet = true;
						}
					}

					continue;
				}
			}

			if (!modSet) {
				if (['band', 'scarf', 'specs'].includes(arg)) {
					modifier = 1;
					modSet = true;
				} else if (arg.startsWith('+')) {
					modifier = parseInt(arg.charAt(1));
					modSet = true;
				} else if (arg.startsWith('-')) {
					positiveMod = false;
					modifier = parseInt(arg.charAt(1));
					modSet = true;
				}
				if (isNaN(modifier)) {
					return this.sendReplyBox('Invalid value for modifier: ' + smogonPageEsc(String(modifier)));
				}
				if (modifier > 6) {
					return this.sendReplyBox('Modifier should be a number between -6 and +6');
				}
				if (modSet) continue;
			}

			const tempStat = parseInt(arg);

			if (!realSet) {
				if (lowercase.endsWith('real')) {
					realStat = tempStat;
					realSet = true;

					if (isNaN(realStat)) {
						return this.sendReplyBox('Invalid value for target real stat: ' + smogonPageEsc(arg));
					}
					if (realStat < 0) {
						return this.sendReplyBox('The target real stat must be greater than 0.');
					}
					continue;
				}
			}

			if (!isNaN(tempStat) && !baseSet && tempStat > 0 && tempStat < 256) {
				baseStat = tempStat;
				baseSet = true;
			}
		}

		if (pokemon) {
			if (useStat) {
				baseStat = pokemon[useStat];
			} else {
				return this.sendReplyBox('No stat found.');
			}
		}

		if (realSet) {
			if (!baseSet) {
				if (calcHP) {
					baseStat = Math.ceil((100 * (realStat - 10) - level * (Math.floor(ev / 4) + iv + 100)) / (2 * level));
				} else {
					if (!positiveMod) {
						realStat *= (2 + modifier) / 2;
					} else {
						realStat *= 2 / (2 + modifier);
					}

					baseStat = Math.ceil(
						(100 * Math.ceil(realStat) - nature * (level * (Math.floor(ev / 4) + iv) + 500)) /
						(2 * level * nature)
					);
				}
				if (baseStat < 0) {
					return this.sendReplyBox('No valid value for base stat possible with given parameters.');
				}
			} else if (!evSet) {
				if (calcHP) {
					ev = Math.ceil(100 * (realStat - 10) / level - 2 * (baseStat + 50));
				} else {
					if (!positiveMod) {
						realStat *= (2 + modifier) / 2;
					} else {
						realStat *= 2 / (2 + modifier);
					}

					ev = Math.ceil(-1 * (2 * (nature * (baseStat * level + 250) - 50 * Math.ceil(realStat))) / (level * nature));
				}
				ev -= 31;
				if (ev < 0) {
					iv += ev;
					ev = 0;
				}
				ev *= 4;
				if (iv < 0 || ev > 255) {
					return this.sendReplyBox(`No valid EV/IV combination possible with given parameters. Maybe try a different nature?${ev}`);
				}
			} else {
				return this.sendReplyBox('Too many parameters given; nothing to calculate.');
			}
		} else if (baseStat < 0) {
			return this.sendReplyBox('No valid value for base stat found.');
		}

		let output;

		if (calcHP) {
			output = (((iv + (2 * baseStat) + Math.floor(ev / 4) + 100) * level) / 100) + 10;
		} else {
			output = Math.floor(nature * Math.floor((((iv + (2 * baseStat) + Math.floor(ev / 4)) * level) / 100) + 5));
			if (positiveMod) {
				output *= (2 + modifier) / 2;
			} else {
				output *= 2 / (2 + modifier);
			}
		}
		return this.sendReplyBox(`Base ${baseStat} ${calcHP ? ' HP ' : ' '}at level ${level} with ${iv} IVs, ${ev}${nature === 1.1 ? '+' : nature === 0.9 ? '-' : ''} EVs${modifier > 0 && !calcHP ? ` at ${positiveMod ? '+' : '-'}${modifier}` : ''}: <b>${Math.floor(output)}</b>.`);
    }
    const BATTLE_COMMAND_ALIASES = {
        ns:'natureswap',ce:'crossevolve',crossevo:'crossevolve',fuse:'franticfusions',reevo:'reevo',
        dsearch:'ds',nds:'ds',msearch:'ms',learnset:'learn',learnall:'learn',stats:'data',
        eff:'effectiveness',type:'effectiveness',matchup:'effectiveness',cover:'coverage',
    };
    async function runBattleAdditional(room,command,argument,send) {
        const format=room.__qolFullFormat || await battleFormat(room);
        const parts=argument.split(',').map(s=>s.trim()).filter(Boolean);
        if(command==='statcalc') {
            const handler={runBroadcast:()=>true,parse:()=>{throw new Error('Use /statcalc Pokémon stat [EVs, IVs, level].');},
                sendReplyBox:html=>room.add('|raw|<div class="infobox">'+html+'</div>'),
                species:name=>{
                    const raw=(room.battle.dex||window.Dex).species.get(name);
                    return raw.exists?battleQueryView(room,format,raw.name).species:raw;
                }};
            return nativeBattleStatcalc.call(handler,argument,room,null);
        }
        if(command==='coverage') return send('/coverage '+argument);
        if(command==='effectiveness') {
            if(parts.length!==2) throw new Error('Use /eff attacking type or move, defending Pokémon or type.');
            const dex=room.battle.dex||window.Dex;
            const move=dex.moves.get(parts[0]);
            const attack=move.exists?move.type:Object.keys(window.BattleTypeChart||{}).find(t=>fmtId(t)===fmtId(parts[0]));
            const defender=dex.species.get(parts[1]);
            const types=defender.exists?battleQueryView(room,format,defender.name).species.types:parts[1].split('/').map(t=>Object.keys(window.BattleTypeChart||{}).find(key=>fmtId(key)===fmtId(t)));
            if(!attack || types.some(t=>!t)) throw new Error('Unknown attacking or defending type.');
            const inverse=formatRuleTokens(format).some(op=>op.kind==='rule'&&op.id==='inversemod');
            let multiplier=1;
            for(const type of types) {
                const entry=dex.types?.get?.(type);
                const chart=entry?.damageTaken || window.BattleTypeChart?.[type]?.damageTaken;
                if(!chart) throw new Error('Type data is not loaded.');
                const code=chart[attack];
                let factor=code===1?2:code===2?0.5:code===3?0:1;
                if(move.id==='freezedry' && type==='Water')factor=2;
                if(inverse)factor=factor===0?2:1/factor;
                multiplier*=factor;
                if(move.id==='flyingpress') {
                    const flying=chart.Flying;
                    let f=flying===1?2:flying===2?0.5:flying===3?0:1;
                    if(inverse)f=f===0?2:1/f;
                    multiplier*=f;
                }
            }
            return room.add('|raw|<div class="infobox">'+smogonPageEsc(parts[0])+' is <strong>'+multiplier+'×</strong> effective against '+smogonPageEsc(parts[1])+' ('+types.map(smogonPageEsc).join('/')+').</div>');
        }
        let name=parts[0],nature;
        if(command==='natureswap') {
            if(parts.length!==2) throw new Error('Use /ns nature, Pokémon.');
            const names=window.BattleNatures||{};
            const key=Object.keys(names).find(n=>fmtId(n)===fmtId(parts[0]));
            nature=names[key];name=parts[1];
            if(!nature || room.battle.gen<3) throw new Error('Nature not found in this generation.');
        }
        if(!name) throw new Error('Specify a Pokémon.');
        const {ctx,species:input}=battleQueryView(room,format,name);
        let stats={...input.baseStats},types=input.types.slice(),abilities=input.abilities;
        if(command==='natureswap') {
            if(nature.plus && nature.minus) [stats[nature.plus],stats[nature.minus]]=[stats[nature.minus],stats[nature.plus]];
        } else if(command==='franticfusions') {
            const donor=parts[1]?battleQueryView(room,format,parts[1]).species:null;
            if(donor?.id===input.id) throw new Error('Pokémon cannot fuse with themselves.');
            for(const stat of STATS) if(stat!=='hp') stats[stat]=donor?clamp255(stats[stat]+Math.floor(donor.baseStats[stat]/4)):Math.floor(stats[stat]/4);
            if(!donor) stats.hp=0;
            const names=[...new Set([...Object.values(abilities||{}),...Object.values(donor?.abilities||{})])];
            abilities={0:names.slice(0,Math.ceil(names.length/2)).join(' / '),1:names.slice(Math.ceil(names.length/2)).join(' / ')};
        } else if(command==='crossevolve') {
            if(parts.length!==2) throw new Error('Use /ce base Pokémon, evolved Pokémon.');
            const donor=battleQueryView(room,format,parts[1]).species;
            if(!input.evos?.length || !donor.prevo) throw new Error('The base must evolve and the donor must have a pre-evolution.');
            const pre=battleQueryView(room,format,donor.prevo).species;
            const stage=sp=>{let n=1;while(sp.prevo && n<4){n++;sp=ctx.dex.species.get(sp.prevo);}return n;};
            if(stage(input)+1!==stage(donor)) throw new Error('Cross evolution must follow evolutionary stages.');
            for(const stat of STATS) stats[stat]=clamp255(stats[stat]+donor.baseStats[stat]-pre.baseStats[stat]);
            if(donor.types[0]!==pre.types[0])types[0]=donor.types[0];
            if(donor.types[1]!==pre.types[1])types[1]=donor.types[1]||donor.types[0];
            types=[...new Set(types.filter(Boolean))];abilities=donor.abilities;
        } else if(command==='showevo' || command==='reevo') {
            const evo=input.prevo?input:ctx.dex.species.get(input.changesFrom || (Array.isArray(input.battleOnly)?input.battleOnly[0]:input.battleOnly)||input.name);
            if(!evo.prevo) throw new Error('That Pokémon is not an evolution.');
            const base=battleQueryView(room,format,evo.name).species;
            const pre=battleQueryView(room,format,evo.prevo).species;
            for(const stat of STATS) stats[stat]=command==='reevo'?clamp255(input.baseStats[stat]+base.baseStats[stat]-pre.baseStats[stat]):input.baseStats[stat]-pre.baseStats[stat];
            if(command==='showevo')types=[input.types[0]!==pre.types[0]?input.types[0]:null,input.types[1]!==pre.types[1]?(input.types[1]||input.types[0]):null].filter(Boolean);
        } else if(command==='pokemove') {
            const power=Math.max(stats.atk,stats.spa),category=stats.spa>=stats.atk?'Special':'Physical';
            return room.add('|raw|<ul class="utilichart"><li class="result"><span class="col movenamecol">'+smogonPageEsc(input.name)+'</span><span class="col typecol"><img src="https://play.pokemonshowdown.com/sprites/types/'+encodeURIComponent(types[0])+'.png" alt="'+smogonPageEsc(types[0])+'" width="32" height="14"><img src="https://play.pokemonshowdown.com/sprites/categories/'+category+'.png" alt="'+category+'" width="32" height="14"></span><span class="col labelcol"><em>Power</em><br />'+power+'</span><span class="col labelcol"><em>Accuracy</em><br />100%</span><span class="col pplabelcol"><em>PP</em><br />5</span><span class="col movedesccol">Gives '+smogonPageEsc(abilities[0])+' as a second ability after use.</span></li></ul>');
        }
        ctx.commandSpecies={...input,baseStats:stats,types,abilities,bst:sumStats(stats)};
        room.add('|raw|'+renderDataPreviewCard(ctx,null));
    }

    const COMMAND_MODIFIER_ALIASES = {
        flipped:MOD.FLIPPED,flip:MOD.FLIPPED,ts:MOD.TIER_SHIFT,tiershift:MOD.TIER_SHIFT,
        bnb:MOD.BAD_N_BOOSTED,badnboosted:MOD.BAD_N_BOOSTED,scale:MOD.SCALEMONS,scalemons:MOD.SCALEMONS,
        mnm:MOD.MIX_AND_MEGA,mixandmega:MOD.MIX_AND_MEGA,convergence:MOD.CONVERGENCE,conv:MOD.CONVERGENCE,
        ce:MOD.CROSS_EVOLUTION,crossevo:MOD.CROSS_EVOLUTION,crossevolution:MOD.CROSS_EVOLUTION,reevo:MOD.REEVOLUTION,reevolution:MOD.REEVOLUTION,
        ff:MOD.FRANTIC_FUSIONS,fuse:MOD.FRANTIC_FUSIONS,gg:MOD.GODLY_GIFT,cam:MOD.CAMOMONS,camo:MOD.CAMOMONS,
        '350':MOD.THREE_FIFTY_CUP,cup350:MOD.THREE_FIFTY_CUP,rev:MOD.REVELATIONMONS,forte:MOD.FORTEMONS,
        aaa:MOD.ALMOST_ANY_ABILITY,stab:MOD.STABMONS,staaab:MOD.STABMONS,sketch:MOD.SKETCHMONS,alpha:MOD.ALPHABET_CUP,
        bonus:MOD.BONUS_TYPE,category:MOD.CATEGORY_SWAP,allmoves:MOD.ALL_MOVES,inherit:MOD.INHERITANCE,
    };
    function parseCommandModifiers(argument,dex) {
        const args=argument.split(',').map(s=>s.trim()).filter(Boolean);
        const remaining=[],rules=[],mods=[];
        const set={};
        let recognized=false,ignoreBans=false;
        for(const [index,token] of args.entries()) {
            if(index===0) {remaining.push(token);continue;}
            const id=fmtId(token);
            if(id==='ag') {recognized=true;ignoreBans=true;continue;}
            const donor=/^(ce|crossevo|crossevolution|ff|fuse|fusion|inherit)\s*:\s*(.+)$/i.exec(token);
            if(donor){const sp=resolveBattleSpecies(dex,donor[2]);recognized=true;set.name=sp.name;mods.push(/^(ce|crossevo|crossevolution)$/i.test(donor[1])?MOD.CROSS_EVOLUTION:/inherit/i.test(donor[1])?MOD.INHERITANCE:MOD.FRANTIC_FUSIONS);continue;}
            const nature=/^ns\s*:\s*(.+)$/i.exec(token);
            if(nature) {
                recognized=true;
                const name=Object.keys(window.BattleNatures||{}).find(n=>fmtId(n)===fmtId(nature[1]));
                if(!name)throw new Error('Unknown nature: '+nature[1]);
                set.nature=name;mods.push(MOD.NATURE_SWAP);continue;
            }
            const mod=COMMAND_MODIFIER_ALIASES[id] || MOD_DEFINITIONS.find(d=>
                fmtId(d.label)===id || fmtId(d.challengeRule)===id || d.formatKeywords?.includes(id))?.id;
            if(mod) {recognized=true;mods.push(mod);continue;}
            if(dex?.items?.get(token)?.exists) {
                const item=dex?.items?.get(token);
                if(item?.exists && resolveMegaForme(dex,item)) {
                    recognized=true;set.item=item.name || token;mods.push(MOD.MIX_AND_MEGA);continue;
                }
            }
            remaining.push(token);
        }
        for(const mod of new Set(mods)) {
            const rule=MOD_DEFINITION_BY_ID.get(mod)?.challengeRule;
            if(rule)rules.push(rule);
            else if(MOD_DEFINITION_BY_ID.get(mod)?.providerKeywords?.length) rules.push(MOD_DEFINITION_BY_ID.get(mod).providerKeywords[0]+'movelegality');
        }
        return {ignoreBans,recognized,argument:remaining.join(', '),set,rules,mods:[...new Set(mods)]};
    }
    async function commandModifierRoom(room,parsed) {
        const dex=parsed.gen?(window.Dex.forGen?.(parsed.gen)||window.Dex):room?.battle?.dex || window.Dex;
        const gen=parsed.gen || dex?.gen || 9;
        let format='gen'+gen+(parsed.mods.includes(MOD.CONVERGENCE)?'convergence':'customgame');
        if(parsed.rules.length)format+=(format.includes('@@@')?',':'@@@')+parsed.rules.join(',');
        const facade=Object.create(room || null);
        facade.id=room?.id || '';
        facade.battle={dex,gen,tier:format,format:{id:format}};
        facade.__qolFullFormat=format;
        facade.__qolArgumentSet={...parsed.set};facade.__qolCommandMods=parsed.mods;
        facade.__qolIgnoreBans=parsed.ignoreBans;
        facade.add=html=>{
            if(room?.add)room.add(html);
            else showSmogonPageReply(room,html.replace(/^\|raw\|/,''));
        };
        return facade;
    }

    async function renderLocalData(room,argument){
        const dex=room.battle.dex,format=room.__qolFullFormat||await battleFormat(room);
        const species=resolveBattleSpecies(dex,argument);if(species.gen>dex.gen||species.isNonstandard==='Future')throw Error(species.name+' does not exist in Gen '+dex.gen+'.');
        const ctx=battleCommandContext(room,format,null,species.name);room.add('|raw|'+renderDataPreviewCard(ctx,null));
    }
    async function showDataPreviewTarget(room,argument) {
        const name=String(argument||'').trim();
        const generation=room?(room.__qolDpGeneration=(room.__qolDpGeneration||0)+1):0;
        if(!name || name.toLowerCase()==='team') {
            if(!room?.battle)throw new Error('Use /dp team in a battle chat.');
            return showTeamDataPreview(room,generation);
        }
        const dex=room?.battle?.dex||window.Dex;
        const contextRoom=await dataPreviewChallengeContext(room),format=contextRoom.__qolFullFormat;
        const species=resolveBattleSpecies(dex,name);
        const ctx=battleCommandContext(contextRoom,format,null,species.name);
        writeCommandDataPreview(room,[renderDataPreviewCard(ctx,null)],generation);
    }
    function patchBattleCommands() {
        patchMethod(window.app, 'receive', '__qolBattleCommandReceive', original => function(data) {
            try { data = transformBattleCommandReplies(data); } catch (e) { console.warn(LOG, 'Battle data rendering failed', e); }
            return original.call(this, data);
        });
        return patchMethod(window.app, 'send', '__qolBattleCommandSend', original => function(data, ...rest) {
            let text = data, id = typeof rest[0] === 'string' ? rest[0] : rest[0]?.id;
            if (rest[0] === true && typeof data === 'string' && data.includes('|')) {
                const split = data.indexOf('|'); id = data.slice(0, split); text = data.slice(split + 1);
            }
            const match = typeof text === 'string' && /^\/(ns\d?|natureswap|ce|crossevo|crossevolve|fuse\d?|franticfusions|reevo|showevo|pokemove|statcalc|eff|effectiveness|type|matchup|cover|coverage|dsearch|nds|msearch|learnset|learnall|stats|stealteam|steal|dp|datapreview|mnm|mixandmega|scale\d?|scalemons|flip\d?|flipped|ts\d?|tiershift|bnb|badnboosted|350|350cup|ds|dexsearch|dt\d?|details|data|dex|pokedex|pstats|ms\d?|movesearch|nms|learn|canlearn|weak|weakness|weaknesses|resist)(?:\s+([^\r\n]*))?$/i.exec(text);
            if (!match) return original.call(this, data, ...rest);
            const room = this.rooms?.[id];
            const rawCommand=match[1].toLowerCase();
            const cmd=BATTLE_COMMAND_ALIASES[rawCommand]||rawCommand, arg=(match[2]||'').trim();
            // Fast native pass-through: parsing runs only for data commands
            // with comma-separated options; it issues no network requests.
            if ((['dt','details','data','dex','pokedex','pstats','ms','movesearch','nms'].includes(cmd)||/^dt[1-9]$/.test(cmd)) && (arg.includes(',')||/^dt[1-9]$/.test(cmd))) {
                let parsed;
                try { const gen=/^dt([1-9])$/.exec(cmd)?.[1];parsed=parseCommandModifiers(arg,gen?(window.Dex.forGen?.(Number(gen))||window.Dex):room?.battle?.dex || window.Dex);if(gen){parsed.gen=Number(gen);parsed.recognized=true;} }
                catch(error) {showSmogonPageReply(room,smogonPageEsc(error.message));return;}
                if(parsed.recognized) {
                    if(!['ms','movesearch','nms'].includes(cmd) && parsed.argument.includes(',')) {
                        showSmogonPageReply(room,'Unrecognized modifier or conflicting format argument: '+smogonPageEsc(parsed.argument.split(',').slice(1).join(',')));return;
                    }
                    const send=value=>original.call(this,rest[0]===true?id+'|'+value:value,...rest);
                    commandModifierRoom(room,parsed).then(context=>{
                        if(['ms','movesearch','nms'].includes(cmd))return runBattleMoves(context,parsed.argument,cmd).then(handled=>{
                            if(!handled)throw new Error('Specify a Pokémon for a modified move search.');
                        });
                        return renderLocalData(context,parsed.argument);
                    }).catch(error=>showSmogonPageReply(room,smogonPageEsc(error.message||error)));
                    return;
                }
            }
            let job;
            if(cmd==='dp'||cmd==='datapreview')job=showDataPreviewTarget(room,arg);
            else if(cmd==='stealteam'||cmd==='steal') {
                if(!room?.battle) {showSmogonPageReply(room,'Use /stealteam in a battle chat.');return;}
                job=stealBattleTeam(room,arg);
            } else return original.call(this,data,...rest);
            Promise.resolve(job).catch(error => showSmogonPageReply(room, smogonPageEsc(error.message || error)));
        });
    }

    // ---------- local /smogonpage command ----------

    // Use stable post IDs: thread titles change and one megathread can contain
    // several unrelated hubs. Keep explicit generations separate from aliases.
    const SMOGON_PAGE_HUBS = [
        {name: '[Gen 9] Convergence Megamons', aliases: ['convergence megamons', 'convmegamons'],
            url: 'https://www.smogon.com/forums/posts/11005950/'},
        {name: '[Gen 9] Ultra Mix', aliases: ['ultra mix', 'ultra mix and mega', 'ultramnm'],
            url: 'https://www.smogon.com/forums/posts/10931584/'},
    ];
    const SMOGON_PAGE_STORAGE = 'qol-smogon-pages-v1';
    const smogonPageResources = new Map();
    const smogonPageWaiters = new Map();
    const smogonPageEsc = (text) => String(text).replace(/[&<>"']/g, c =>
        ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

    function smogonPageQuery(text) {
        let query = String(text || '').trim();
        // Optional brackets around the whole argument, not around [Gen 9].
        if (query.startsWith('[') && query.endsWith(']')) query = query.slice(1, -1).trim();
        return query;
    }

    function smogonPageKey(text) {
        const id = fmtId(smogonPageQuery(text));
        return id && (/^gen\d+/.test(id) ? id : 'gen9' + id);
    }

    function safeSmogonPageUrl(text) {
        try {
            const url = new URL(text);
            if (url.protocol !== 'https:' || url.hostname !== 'www.smogon.com' || url.port ||
                url.username || url.password || !/^\/forums\/(?:threads|posts)\//.test(url.pathname)) return null;
            return url.href;
        } catch (e) { return null; }
    }

    function savedSmogonPages() {
        try {
            const pages = JSON.parse(localStorage.getItem(SMOGON_PAGE_STORAGE) || '{}');
            return pages && typeof pages === 'object' && !Array.isArray(pages) ? pages : {};
        } catch (e) { return {}; }
    }

    function findSmogonPageHub(query) {
        const key = smogonPageKey(query);
        const saved = savedSmogonPages()[key];
        const url = safeSmogonPageUrl(saved?.url);
        if (url) return {name: String(saved.name || query), url};
        return SMOGON_PAGE_HUBS.find(hub => smogonPageKey(hub.name) === key ||
            hub.aliases.some(alias => smogonPageKey(alias) === key)) || null;
    }

    function parseSmogonPageResources(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const found = new Map();
        for (const anchor of doc.querySelectorAll('a[href]')) {
            if (anchor.closest?.('details')) continue; // rule explanations aren't format resources
            const url = safeSmogonPageUrl(anchor.getAttribute('href'));
            if (url && !found.has(url)) found.set(url, {url, name: anchor.textContent.trim() || 'Forum resource'});
        }
        return [...found.values()];
    }

    function cacheSmogonPageReply(formatId, html) {
        const resources = parseSmogonPageResources(html);
        smogonPageResources.set(formatId, resources);
        smogonPageWaiters.get(formatId)?.finish(resources);
    }

    function observeSmogonPageReply(html) {
        if (!smogonPageWaiters.size) return;
        const title = new DOMParser().parseFromString(html, 'text/html').querySelector('h2')?.textContent;
        if (!title) return;
        const norm = text => fmtId(text).replace(/natdex/g, 'nationaldex');
        for (const id of smogonPageWaiters.keys()) {
            if (norm(title) === norm(id) || norm(title) === norm(window.BattleFormats?.[id]?.name)) {
                cacheSmogonPageReply(id, html);
                break;
            }
        }
    }

    function requestSmogonPageResources(id) {
        if (smogonPageResources.has(id)) return Promise.resolve(smogonPageResources.get(id));
        if (smogonPageWaiters.has(id)) return smogonPageWaiters.get(id).promise;
        let finish;
        let timer;
        const promise = new Promise(resolve => {
            finish = resources => {
                clearTimeout(timer);
                smogonPageWaiters.delete(id);
                resolve(resources);
            };
        });
        smogonPageWaiters.set(id, {promise, finish});
        timer = setTimeout(() => finish(null), 10000);
        try {
            // Share the existing silent request and never start a second one
            // for a lookup already in flight for the teambuilder.
            const prior = genericBanlists.get(id);
            if (prior && !prior.verified && Date.now() - (prior.sentAt || 0) >= SILENT_BANLIST_TIMEOUT) prior.sentAt = 0;
            if (prior?.verified) finish([]);
            else requestGenericBanlist(id);
        } catch (e) { finish(null); }
        return promise;
    }

    function smogonPageSearchHtml(query, timedOut = false) {
        const url = 'https://www.google.com/search?q=' + encodeURIComponent('site:smogon.com/forums/ ' + query + ' hub');
        return `${timedOut ? 'The resource lookup did not finish.' : 'No verified hub is indexed for ' + smogonPageEsc(query) + '.'} ` +
            `<a href="${smogonPageEsc(url)}" target="_blank" rel="noopener noreferrer">Search Smogon for this format</a>. ` +
            'Save its hub with <code>/smogonpage set format name | https://www.smogon.com/forums/…</code>.';
    }

    function showSmogonPageReply(room, html) {
        if (typeof room?.add === 'function') room.add('|raw|<div class="infobox">' + html + '</div>');
        else if (window.Popup && window.app?.addPopup) window.app.addPopup(window.Popup, {htmlMessage: html});
        else window.app?.addPopupMessage?.(new DOMParser().parseFromString(html, 'text/html').body.textContent);
    }

    async function runSmogonPageCommand(argument, room) {
        const query = smogonPageQuery(argument);
        const show = html => showSmogonPageReply(room, html);
        if (!query) {
            show('Usage: <code>/smogonpage format name</code>. Example: <code>/smogonpage convergence megamons</code>. ' +
                'Add or update a hub with <code>/smogonpage set format name | URL</code>; remove a saved link with <code>/smogonpage unset format name</code>.');
            return;
        }
        const setting = /^(set|unset)\s+([\s\S]+)$/i.exec(query);
        if (setting) {
            const unset = setting[1].toLowerCase() === 'unset';
            const split = setting[2].indexOf('|');
            const name = smogonPageQuery(unset ? setting[2] : setting[2].slice(0, split));
            const key = smogonPageKey(name);
            const url = unset ? null : safeSmogonPageUrl(setting[2].slice(split + 1).trim());
            if (!key || name.length > 160 || (!unset && (split < 1 || !url))) {
                show('Use <code>/smogonpage set format name | URL</code> with an HTTPS Smogon forum thread or post URL.');
                return;
            }
            try {
                const saved = savedSmogonPages();
                if (unset) delete saved[key];
                else saved[key] = {name, url};
                localStorage.setItem(SMOGON_PAGE_STORAGE, JSON.stringify(saved));
                show(unset ? 'Removed the saved link for ' + smogonPageEsc(name) + '.' :
                    `Saved <a href="${smogonPageEsc(url)}" target="_blank" rel="noopener noreferrer">${smogonPageEsc(name)}</a>.`);
            } catch (e) { show('The browser could not save this link.'); }
            return;
        }
        const hub = findSmogonPageHub(query);
        if (hub) {
            show(`<a href="${smogonPageEsc(hub.url)}" target="_blank" rel="noopener noreferrer">${smogonPageEsc(hub.name)} — hub</a>`);
            return;
        }
        // Never infer a custom mashup's hub from its base format's resources.
        const id = !query.includes('@@@') && resolveFormatKey(query, 9);
        if (!id || !window.BattleFormats?.[id]) { show(smogonPageSearchHtml(query)); return; }
        show('Looking up Smogon resources for ' + smogonPageEsc(query) + '…');
        const resources = await requestSmogonPageResources(id);
        if (!resources?.length) { show(smogonPageSearchHtml(query, resources === null)); return; }
        show(smogonPageEsc(window.BattleFormats[id].name || query) + ': ' + resources.map(resource =>
            `<a href="${smogonPageEsc(resource.url)}" target="_blank" rel="noopener noreferrer">${smogonPageEsc(resource.name)}</a>`).join(' · '));
    }

    function patchSmogonPageCommand() {
        return patchMethod(window.app, 'send', '__qolSmogonPageSendPatched', original => function (data, ...rest) {
            if (typeof data !== 'string' || data.includes('\n')) return original.call(this, data, ...rest);
            let command = data;
            let roomId = typeof rest[0] === 'string' ? rest[0] : rest[0]?.id;
            // app.send(data, true) accepts an already room-prefixed packet.
            if (rest[0] === true) {
                const pipe = data.indexOf('|');
                if (pipe >= 0) { roomId = data.slice(0, pipe); command = data.slice(pipe + 1); }
            }
            const match = /^\/smogonpage(?:\s+([^\r\n]*))?\s*$/i.exec(command);
            if (!match) return original.call(this, data, ...rest);
            const room = this.rooms?.[roomId] || this.curSideRoom || this.curRoom;
            runSmogonPageCommand(match[1] || '', room).catch(error => {
                console.warn(LOG, 'Smogon page lookup failed:', error);
                showSmogonPageReply(room, 'The Smogon page lookup failed. Please try again.');
            });
        });
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
        observeSmogonPageReply(html);
        let suppress = false;
        for (const [header, key, parse] of RAW_HANDLERS) {
            if (!html.includes(header) || !namedRequestPending(key)) continue;
            try { parse(html); } catch (e) { console.warn(LOG, `Failed to parse ${key} bans:`, e); }
            BL[key].silent = false;
            suppress = true;
        }
        // A resource lookup and a named banlist request can share a response.
        // Resolve both caches, including the generic request's silent flag.
        try {
            if (handleGenericBanlistRaw(html)) suppress = true;
        } catch (e) {
            console.warn(LOG, 'Generic banlist parse failed:', e);
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
                smogonPageWaiters.get(generic[0][0])?.finish([]);
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
            stats[stat] = clamp255(2 * stats[stat] - prevo.baseStats[stat]);
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
    function scalemonsModifiedStats(species, from = species.baseStats, _dex, bst) {
        const stats = copy(from);
        const pst = (bst ?? sumStats(stats)) - stats.hp;
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
    function threeFiftyCupModifiedStats(species, from = species?.baseStats, _dex, bst) {
        if (!species?.baseStats || !from || (bst ?? sumStats(from)) > 350) return null;
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

    function speciesModBaseStats(mod, dex, set, from, bst) {
        const species = dex?.species?.get(set?.species);
        return species?.exists ? SPECIES_STAT_MODIFIERS[mod](species, from || species.baseStats, dex, bst) : null;
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
        [MOD.MIX_AND_MEGA]: (from, {dex, set}) => mixAndMegaBaseStats(dex, set, from),
        [MOD.GODLY_GIFT]: (from, {room, set}) => godlyGiftBaseStats(room, set, from),
        [MOD.CROSS_EVOLUTION]: (from, {dex, set}) => crossEvolutionBaseStats(dex, set, from),
        [MOD.FRANTIC_FUSIONS]: (from, {dex, set}) => franticFusionsBaseStats(dex, set, from),
        [MOD.REEVOLUTION]: (from, {dex, set}) => reevolutionModifiedStats(dex?.species?.get(set?.species), from, dex),
        [MOD.NATURE_SWAP]: (from, {dex, set}) => natureSwapBaseStats(dex, set, from),
    };
    for (const mod of Object.keys(SPECIES_STAT_MODIFIERS)) {
        MOD_STAT_TRANSFORMS[mod] = (from, {dex, set, bst}) => speciesModBaseStats(mod, dex, set, from, bst);
    }

    // Showdown builds the stone's raw forme first, then runs ModifySpecies
    // handlers. Conditional modifiers use the resulting intermediate stats.
    function computeModsBaseStats(mods, ctx) {
        const list = orderModsByShowdownPriority(mods);
        const stone = list.includes(MOD.MIX_AND_MEGA) && mnmLookup(ctx.dex, ctx.set);
        const transformed = stone?.forme && stone.species.name !== stone.forme.formeSpecies.name;
        let stats = null;
        const state = {...ctx};
        for (const mod of list) {
            // Godly Gift does not donate a stat on item-triggered forme changes.
            if (transformed && mod === MOD.GODLY_GIFT) continue;
            const next = MOD_STAT_TRANSFORMS[mod]?.(stats, state);
            if (!next) continue;
            stats = mod === MOD.NATURE_SWAP ? next : clampBaseStats(next);
            if (mod === MOD.MIX_AND_MEGA && transformed) {
                // Showdown's synthetic stone form retains the original BST
                // until a rule (such as 350 Cup or Scalemons) rebuilds it.
                state.bst = stone.species.bst ?? sumStats(stone.species.baseStats);
            } else if (mod !== MOD.FLIPPED) {
                state.bst = undefined;
            }
        }
        return stats;
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

    // Start from the stone's typing, then apply ModifySpecies events in order.
    function modifiedTypes(mods, dex, set) {
        let types = null;
        for (const mod of orderModsByShowdownPriority(mods)) {
            let next = null;
            if (mod === MOD.MIX_AND_MEGA) next = mixAndMegaModifiedTypes(dex, set, types);
            else if (mod === MOD.CROSS_EVOLUTION) next = crossEvolutionTypes(dex, set, types);
            else if (mod === MOD.CAMOMONS) {
                // Keep the editor's blank preview until a move is selected.
                next = camomonsTypes(dex, set);
            } else if (mod === MOD.BONUS_TYPE && set?.teraType && dex?.types?.get) {
                const bonus = dex.types.get(set.teraType);
                if (bonus?.exists) {
                    const natural = types || dex.species.get(set.species)?.types || [];
                    next = [...new Set([...natural, bonus.name])];
                }
            }
            if (next) types = next;
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
              (typeof item.megaStone==='string'?item.megaStone:Object.values(item.megaStone||{})[0]) || item.itemUser?.[0];
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

    function mixAndMegaBaseStats(dex, set, from) {
        const m = mnmLookup(dex, set);
        if (!m?.forme) return null;

        const {species, forme} = m;
        const stats = copy(from || species.baseStats);
        if (species.name === forme.formeSpecies.name) return stats;

        for (const stat of STATS) {
            const delta = forme.formeSpecies.baseStats[stat] - forme.baseSpecies.baseStats[stat];
            stats[stat] = clamp255(stats[stat] + delta);
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
        const multiplier = nature?.plus === nature?.minus ? 1 :
            nature?.plus === 'spe' ? 1.1 :
                nature?.minus === 'spe' && searchFormatId(room?.curTeam?.format) !== 'natureswap' ? 0.9 : 1;
        speed = natureStatValue(speed, multiplier, hasOverflowStatMod(room?.curTeam?.format || ''));

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
    function crossEvolveView(dex, speciesLike, targetId, {
        mods = getActiveMods(), baseSet, stoneId, room = getActiveTeambuilderRoom(), allowBanned = false,
    } = {}) {
        const target = dex?.species?.get(targetId);
        if (!speciesLike?.exists || !target?.exists) return null;

        const set = {...baseSet, species: speciesLike.name, name: target.name, item: stoneId || ''};
        const ce = mods.includes(MOD.CROSS_EVOLUTION) && resolveCrossEvolution(dex, set);
        const fusion = mods.some((mod) => mod === MOD.FRANTIC_FUSIONS || mod === MOD.INHERITANCE) &&
            resolveFusion(dex, set);
        if (!ce && !fusion) return null;
        if (ce && !allowBanned && !crossEvolutionDonorAllowed(dex, ce.cross)) return null;
        if (!ce && mods.includes(MOD.CROSS_EVOLUTION) &&
            searchFormatId(room?.curTeam?.format) === 'crossevolution') return null;

        const stoneAbility = stoneId && mixAndMegaFutureAbility(dex, set);
        const donorAbilities = ce?.cross?.abilities ||
            (mods.includes(MOD.INHERITANCE) ? fusion?.donor.abilities : null);
        const previewRoom = godlyGiftPreviewRoom(mods, room, set);
        return {
            baseStats: computeModsBaseStats(mods, {dex, set, room: previewRoom}) || speciesLike.baseStats,
            types: modifiedTypes(mods, dex, set) || speciesLike.types,
            abilities: stoneAbility ? {0: ce ? donorAbilities[0] : stoneAbility} : donorAbilities || null,
        };
    }

    // Godly Gift uses the slot of the candidate as well as the team around it.
    function godlyGiftPreviewRoom(mods, room, set) {
        if (!mods.includes(MOD.GODLY_GIFT) || !room?.curSetList?.includes(room.curSet)) return room;
        return {...room, curSetList: room.curSetList.map((member) => member === room.curSet ? set : member)};
    }

    function pokemonChipView(search, species, chips = search, mods = modsForSearch(search)) {
        const room = getActiveTeambuilderRoom();
        const baseSet = search?.set || room?.curSet;
        const dex = search?.dex;
        const into = getIntoFilterId(chips, 'into');
        const from = getIntoFilterId(chips, 'from');
        const stoneId = mods.includes(MOD.MIX_AND_MEGA) && getIntoFilterId(chips, 'stone');
        if (into || from) {
            const base = from ? dex?.species?.get(from) : species;
            return crossEvolveView(dex, base, into || species.id, {mods, baseSet, stoneId, room});
        }
        return stoneId ? mnmStoneView(dex, species, stoneId, mods, baseSet) : null;
    }

    // ---------- "into X" / "X into" search queries ----------

    function intoSuggestions(engine, query) {
        const match = /^into\s+(.+)$/i.exec(String(query || '').trim());
        if (!match) return [];
        const mods = modsForSearch(engine?.typedSearch);
        if (!mods.some(isFusionMod)) return [];
        const dex = engine.dex || engine.typedSearch?.dex;
        if (!dex?.species) return [];
        const target = match[1].trim();
        const prefix = toSearchId(target);
        if (!prefix) return [];

        const ce = mods.includes(MOD.CROSS_EVOLUTION);
        const format = getActiveTeambuilderRoom()?.curTeam?.format || engine.typedSearch?.format || '';
        const bans = ce ? getMergedBansForFormat(format) : null;
        const rows = [];
        const seen = new Set();
        const add = (species) => {
            if (!species?.exists || species.battleOnly || seen.has(species.id)) return;
            if (ce && !crossEvolutionDonorAllowed(dex, species, format, bans)) return;
            seen.add(species.id);
            const label = INTO_PREFIX + species.name;
            rows.push(['ability', INTO_PREFIX + species.id, 0, prefixMatchEnd(label, query)]);
        };

        // Keep exact names and Dex aliases first.
        add(dex.species.get(target));
        if (ce) {
            const matches = Object.keys(window.BattlePokedex || {}).filter((id) => id.startsWith(prefix)).sort();
            for (const id of matches) {
                if (rows.length === 8) break;
                add(dex.species.get(id));
            }
        }
        return rows;
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
        if (Array.isArray(engine?.__qolActiveFilters)) {
            return engine.__qolActiveFilters.find(([type]) => type === kind)?.[1] || null;
        }
        const lists = [engine?.filters, engine?.typedSearch?.filters];
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
    function ceFullSpeciesAvailable(dex, sp, natdex, capAllowed, hackmons = false) {
        return !!(sp?.exists && sp.id && sp.gen <= dex.gen && !sp.battleOnly &&
            (hackmons || sp.isNonstandard !== 'Future') &&
            (hackmons || capAllowed || sp.isNonstandard !== 'CAP') &&
            (hackmons || natdex || sp.isNonstandard !== 'Past') &&
            (hackmons || !(sp.tier === 'Unreleased' && sp.isNonstandard === 'Unobtainable')));
    }
    function ceFullData(search, filters = null) {
        const room = getActiveTeambuilderRoom();
        const dex = search.dex;
        const format = room?.curTeam?.format || search.format || '';
        const bans = getMergedBansForFormat(format);
        const rules = resolveClauseRules(bans || emptyBanSections(), format);
        const activeFilters = filters || search.__qolActiveFilters || getEngine()?.filters || [];
        const hasChip = (name) => activeFilters.some(([type]) => type === name);
        const hackmons = hasChip('hackmons');
        const natdex = hackmons || hasChip('natdex') || isNationalDexFormat(format) || rules.has('natdexmod');
        const mods = modsForSearch(search);
        const signature = format + '|natdex=' + natdex + '|hackmons=' + hackmons + '|' +
            ceFullBanSignature(bans) + '|' + mods.join(',') +
            '|' + (window.BattlePokedex ? Object.keys(window.BattlePokedex).length : 0);
        let entries = ceFullCaches.get(dex);
        if (!entries) { entries = new Map(); ceFullCaches.set(dex, entries); }
        let data = entries.get(signature);
        if (data) return data;
        // Keep only one format-index per Dex: avoid retaining giant cross-product
        // indices when the user switches formats repeatedly.
        entries.clear();
        data = {dex, format, bans, mods, natdex, hackmons, pairs: [], bannedPairs: [], byId: new Map(), nativeMoves: new Map(), poolMembership: new Map(), signature};
        const all = [];
        const seen = new Set();
        for (const id of Object.keys(window.BattlePokedex || {})) {
            const sp = dex.species.get(id);
            if (!sp?.exists || sp.id !== id || seen.has(sp.id) ||
                !ceFullSpeciesAvailable(dex, sp, natdex, rules.has('+tag:cap'), hackmons)) continue;
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
        const bannedBases = new Set(hackmons ? [] : bases.filter((sp) =>
            bans && isBannedByList(bans, sp)).map((sp) => sp.id));
        // A NatDex search chip enables historical donors even if the team's
        // underlying format is not National Dex. It does not erase other bans.
        const donorFormat = natdex && !isNationalDexFormat(format) && !rules.has('natdexmod')
            ? format + (format.includes('@@@') ? ',NatDex Mod' : '@@@NatDex Mod') : format;
        const bannedDonors = new Set(hackmons ? [] : donors.filter(({sp}) =>
            !crossEvolutionDonorAllowed(dex, sp, donorFormat, bans)).map(({sp}) => sp.id));
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
    function ceFullPairView(pair, data, stoneId) {
        if (!stoneId && data.mods.every((mod) => mod === MOD.CROSS_EVOLUTION)) return pair;
        const room = getActiveTeambuilderRoom();
        const needsSet = stoneId || data.mods.some((mod) =>
            [MOD.GODLY_GIFT, MOD.NATURE_SWAP, MOD.CAMOMONS, MOD.BONUS_TYPE].includes(mod));
        if (!needsSet && pair.view) return pair.view;
        const view = crossEvolveView(data.dex, pair.base, pair.donor.id, {
            mods: data.mods, room, baseSet: room?.curSet, stoneId, allowBanned: true,
        }) || pair;
        if (!needsSet) pair.view = view;
        return view;
    }
    function ceFullNativeMoves(data, species) {
        if (data.nativeMoves.has(species.id)) return data.nativeMoves.get(species.id);
        const Search = window.BattleMoveSearch;
        const moves = new Set();
        if (data.hackmons) {
            for (const id of Object.keys(window.BattleMovedex || {})) {
                const move = data.dex.moves.get(id);
                if (move?.exists && move.gen <= data.dex.gen && !move.isZ && !move.isMax) moves.add(id);
            }
        } else if (data.natdex) {
            for (const id of natdexMoveIds(data.dex, species)) moves.add(id);
        } else if (Search?.prototype?.getBaseResults) {
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
        if (!move?.exists || move.gen > data.dex.gen || move.isZ || move.isMax) return false;
        if (data.hackmons) return true; // all selectable Gen-compatible moves are available
        if (!data.natdex && !moveAllowedByGeneration(data.dex, move, data.format)) return false;
        if (categoryBanned(data.bans,'moves',id)) return false;
        if (ceFullNativeMoves(data, pair.base).has(id) ||
            (hasCrossEvolutionLearnset(data.format) && ceFullNativeMoves(data, pair.donor).has(id))) return true;
        if (data.bans?.restrictedMoves?.has(id)) return false;
        return (data.mods.includes(MOD.ALPHABET_CUP) && alphabetCupCanLearn(data.dex, pair.base, id, data.format)) ||
            (data.mods.includes(MOD.STABMONS) && stabmonsCanLearn(data.dex, pair.base, id, data.natdex, data.format)) ||
            data.mods.includes(MOD.ALL_MOVES);
    }
    function ceFullMatches(data, pair, filters, viewForPair) {
        // Avoid eagerly evaluating expensive stacked-OM views for every pair.
        // Most Full List searches have no filters, or only base/donor/stage filters.
        let view;
        const getView = () => (view ||= viewForPair(pair));
        for (const [rawType, target] of filters || []) {
            const negated = isNegatedFilterType(rawType);
            const type = baseFilterType(rawType);
            let match = true;
            switch (type) {
                case 'fulllist': case 'realbulk': case 'ce': case 'stone': break;
                case 'stage1': case 'stage2': case 'stage3':
                    match = pair.stage === Number(type.slice(-1)); break;
                case 'into': match = pair.donor.id === toID(target); break;
                case 'from': match = pair.base.id === toID(target); break;
                case 'move': match = ceFullHasMove(data, pair, target); break;
                case 'ability':
                    match = (data.hackmons || !data.bans?.abilities?.has(toID(target))) &&
                        Object.values(getView().abilities || {}).some((a) => toID(a) === toID(target)); break;
                case 'type': match = getView().types.includes(target); break;
                case 'weak': case 'resists': case 'neutral':
                    match = pokemonMatchesEffectiveness(data.dex, {types:getView().types}, type, target); break;
                case 'egggroup': match = (pair.donor.eggGroups || []).includes(target); break;
                case 'tier': match = pair.base.tier === target; break;
                case 'color': match = isMonoColorSearch(getEngine()) && pokemonColorName(pair.base.color) === pokemonColorName(target); break;
                case 'natdex': case 'hackmons':
                    // Positive chips selected the underlying indexed pool.
                    // Negated chips must instead test native membership,
                    // rather than negating a constant `true` for every pair.
                    if (negated) {
                        let ids = data.poolMembership.get(type);
                        if (!ids) {
                            ids = pokemonFormatPool({dex:data.dex, format:data.format}, type).ids;
                            data.poolMembership.set(type, ids);
                        }
                        match = ids.has(pair.base.id);
                    }
                    break;
                case 'fe': match = true; break; // Cross Evolution cannot evolve again
                case 'restricted': match = false; break; // restricted donors are excluded
                case 'legendary': case 'boxlegend': case 'mythical': case 'paradox': case 'eeveelution':
                    match = speciesInGroup(pair.base, type) || speciesInGroup(pair.donor, type); break;
                case 'recovery': case 'pivot': case 'removal': case 'hazards': case 'priority': case 'selfko': case 'phaze': {
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
        const data = ceFullData(search, filters);
        search.__qolCeFullData = data;
        const q = toSearchId(query);
        const stoneId = data.mods.includes(MOD.MIX_AND_MEGA) && filters?.find(([type]) => type === 'stone')?.[1];
        const views = new Map();
        const viewForPair = (pair) => {
            if (!views.has(pair.id)) views.set(pair.id, ceFullPairView(pair, data, stoneId));
            return views.get(pair.id);
        };
        const eligible = (pair) => (!q || toSearchId(pair.base.name + pair.donor.name).includes(q) ||
            toSearchId(pair.base.name).includes(q) || toSearchId(pair.donor.name).includes(q)) &&
            ceFullMatches(data, pair, filters, viewForPair);
        let matches = data.pairs.filter(eligible);
        let bannedMatches = data.bannedPairs.filter(eligible);
        if (sortCol) {
            const order = reverseSort ? -1 : 1;
            const combine = data.mods.includes(MOD.NO_HOLDS_BARRED);
            const pairedStat = combine && NO_HOLDS_BARRED_STAT_PAIRS[sortCol];
            const value = (pair) => {
                const stats = viewForPair(pair).baseStats;
                if (sortCol === 'bst') return sumStats(stats);
                if (sortCol === 'def' || sortCol === 'spd') {
                    if ((filters || []).some(([t]) => t === 'realbulk')) return realBulk(stats, sortCol, combine);
                }
                return pairedStat ? stats[sortCol] + stats[pairedStat] : stats[sortCol] || 0;
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
        return (search.__qolCeFullData || ceFullData(search)).byId.get(id) || null;
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
        if (megamons || battleCommandRoom) {
            const baseId = genericBanFormatId(format);
            const entry = baseId && !battleCommandRoom?.__qolIgnoreBans ? requestGenericBanlist(baseId) : null;
            if (!entry?.verified && !battleCommandRoom?.__qolIgnoreBans) return [];
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
        const bans = (megamons || battleCommandRoom) ? getMergedBansForFormat(format) : convergenceBans;
        const bannedIds = bans?.species || new Set();
        const bannedBases = bans?.baseSpecies || new Set();
        const cacheKey = `${dex.gen}|${String(format || 'gen9convergence')}|${megamons ? 'mega' : 'normal'}|${BL.conv.loaded}|${!!battleCommandRoom?.__qolIgnoreBans}`;
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
        const key = `${search.dex.gen}|${activeFormat}|${convergenceTypeKey(species)}|${search.__qolStackKey}|${search.__qolNatdexMoves ? 1 : 0}|${!!battleCommandRoom?.__qolIgnoreBans}`;
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
            if (categoryBanned(bans,'moves',id)) return false;
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
        if (kind === 'move' && mods.includes(MOD.CROSS_EVOLUTION) && (into || from) &&
            hasCrossEvolutionLearnset(format) && !mods.some((mod) => mod !== MOD.CROSS_EVOLUTION && MOVE_PROVIDERS[mod])) {
            const baseSpecies = from ? ctx.dex.species.get(from) : species;
            const donorSpecies = into ? ctx.dex.species.get(into) : species;
            if (!baseSpecies?.exists || !donorSpecies?.exists ||
                !crossEvolveView(ctx.dex, baseSpecies, donorSpecies.id)) return false;
            const move = ctx.dex.moves.get(id);
            if (!moveAllowedByGeneration(ctx.dex, move, format)) return false;
            const bans = ctx.__qolProviderBans === undefined ? getMergedBansForFormat(format) : ctx.__qolProviderBans;
            if (categoryBanned(bans,'moves',id)) return false;

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
        const stone = getIntoFilterId(ctx, 'stone');
        const cacheKey = [kind, species.id, into || '', from || '', stone || '', format].join(':');
        if (cache.has(cacheKey)) return cache.get(cacheKey).has(toID(target));
        const room = getActiveTeambuilderRoom();
        let set = room?.curSet?.species && toID(room.curSet.species) === species.id
            ? {...room.curSet} : {species: species.name, name: '', item: '', ability: '', nature: '', moves: []};
        // A filtered cross-evolution must be checked as the *pair* shown
        // to the user, not against a stale nickname on the edited set.
        if (mods.some(isFusionMod) && into) {
            const donor = ctx.dex.species.get(into);
            set = {...set, species: species.name, name: donor.name};
        } else if (mods.some(isFusionMod) && from) {
            const baseSpecies = ctx.dex.species.get(from);
            set = {...set, species: baseSpecies.name, name: species.name};
        }
        if (stone && mods.includes(MOD.MIX_AND_MEGA)) set.item = stone;
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
                if (categoryBanned(bans,'moves',move.id) || bans?.restrictedMoves?.has(move.id)) continue;
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
    const HACKMONS_MOVE_FILTER_TYPE = 'mv-hackmons';
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
    const isPokebilitiesFormat = (f) => fmtHas(f, 'pokebilities') || isPokeAAAFormat(f);

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
        for (const id of new Set([...allAbilityIds(dex),...(bans?.unbannedAbilities||[])])) {
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
        const hit = [];
        const kept = results.filter((r) => (test(r) ? (hit.push(r), false) : true));
        return hit.length ? [...dropEmptyHeaders(kept), ['header', header], ...hit] : results;
    }

    // Preserve the order within each section, even when native filtering or
    // sorting puts a rule section in a different place.
    function orderRuleSections(results) {
        const normal = [], restricted = new Map(), technical = new Map(), banned = new Map(), illegal = new Map();
        for (const {header, rows} of splitIntoSections(results)) {
            if (!rows.length) continue;
            const label = String(header?.[1] || '');
            const sections = /^restricted\b/i.test(label) ? restricted :
                /^banned by technicality$/i.test(label) ? technical : /^banned\b/i.test(label) ? banned : /^illegal\b/i.test(label) ? illegal : null;
            if (!sections) {
                if (header) normal.push(header);
                normal.push(...rows);
                continue;
            }
            if (!sections.has(label)) sections.set(label, [header]);
            sections.get(label).push(...rows);
        }
        const engine=typeof getEngine==='function'?getEngine():null;
        const sections=[...restricted.values(),...technical.values(),...banned.values(),...illegal.values()];
        if(!engine?.sortCol)for(const section of sections){const rows=section.slice(1);if(rows.every(row=>row[0]==='pokemon'))section.splice(1,rows.length,...rows.sort((a,b)=>(window.Dex?.species?.get(a[1])?.name||a[1]).localeCompare(window.Dex?.species?.get(b[1])?.name||b[1])));}
        return [...normal,...sections.flat()];
    }

    function applyGroups(results, groups) {
        let out = results;
        for (const g of groups || []) {
            out = groupUnderHeader(out, g.header, (r) => r[0] === g.kind && g.test(r[1]));
        }
        return orderRuleSections(out);
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
            if (learned.has(id) && (categoryBanned(bans,'moves',id) || nativeSection === 'banned')) {
                if (nativeIllegal) search.illegalReasons[id] = 'Banned';
                banned.push(row);
            } else if (nativeIllegal || nativeSection === 'illegal' ||
                (search.baseResults && !learned.has(id))) {
                illegal.push(row);
            } else if (categoryBanned(bans,'moves',id) || nativeSection === 'banned') {
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
        if (normalHasMove && (restricted.length || banned.length || illegal.length) &&
            !clean.some((r) => r[0] === 'header' && String(r[1]) === 'Moves')) {
            const idx = clean.findIndex((r) => r[0] === 'move');
            if (idx >= 0) clean.splice(idx, 0, ['header', 'Moves']);
        }
        return dropEmptyHeaders([
            ...clean,
            ...(restricted.length ? [['header', 'Restricted Moves'], ...restricted] : []),
            ...(banned.length ? [['header', 'Banned Moves'], ...banned] : []),
            ...(illegal.length ? [['header', 'Illegal Moves'], ...illegal] : []),
        ]);
    }

    // Runs after every engine find(), so the headers survive typing, sorting and filter chips.
    function patchEngineFindBanHeaders() {
        return patchEngineMethod('find', '__qolBanHeadersPatched', (original) =>
            function (...args) {
                const search = this.typedSearch;
                if (getEngine() === this && String(args[0] || '').trim() &&
                    typeof search?.getResults === 'function' && !search.illegalReasons) {
                    // Native textSearch only reads this map. After one of our
                    // invalidations, rebuild it before querying unavailable mons.
                    search.getResults(this.filters, null, false);
                }
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
        if (!bans?.abilities.size && !bans?.tags?.has('allabilities') && !bans?.abilityCombos?.size && !bans?.restrictedAbilities?.size) return results;

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

    function moveBannedMovesToHeader(search, results, nativeRows) {
        search.__qolGroups = null;
        if (!Array.isArray(results)) return results;
        const bans = getMergedBansForFormat(getActiveTeambuilderRoom()?.curTeam?.format || search.format);
        if (!bans?.moves?.size && !bans?.tags?.has('allmoves') && !bans?.restrictedMoves?.size) return results;

        const native = bans.restrictedMoves?.size
            ? new Set(nativeRows().filter((r) => r[0] === 'move').map((r) => r[1]))
            : new Set();
        // Only learned moves belong in Banned Moves. A banned move the
        // Pokemon cannot learn must remain in the native Illegal results.
        // This provider result already includes OM-granted learnsets.
        const learned = new Set(results.filter((r) => r[0] === 'move').map((r) => r[1]));
        const banned = (id) => learned.has(id) && categoryBanned(bans,'moves',id);
        const mods = modsForSearch(search);
        const context = mods.includes(MOD.REVELATIONMONS) && movePreviewContext(search);
        const revelationSlot = context && context.slot >= 0 && context.slot < context.types.length;
        const restricted = (id) => learned.has(id) && !banned(id) && !!bans.restrictedMoves?.has(id) &&
            (revelationSlot || !(mods.includes(MOD.STABMONS)
                ? search.canLearn(toID(search.species), id) : native.has(id)));

        search.__qolGroups = [
            {header: 'Restricted Moves', kind: 'move', test: restricted},
            {header: 'Banned Moves', kind: 'move', test: banned},
        ];
        return applyGroups(results, search.__qolGroups);
    }

    function isBlockedStonePreview(search, id) {
        // Use the same rules and native item-user exceptions as the item list.
        return search.__qolGroups?.some((group) => group.kind === 'item' && group.test(id));
    }

    function isRestrictedMnmItem(dex, species, item, format, bans) {
        if (!species?.exists || !item?.exists || !isMnmStoneItem(dex, item)) return false;
        const baseId = toID(species.baseSpecies || species.name);
        if (!bans?.restricted.has(species.id) && !bans?.restrictedBase.has(baseId)) return false;
        // Native item-user exceptions from Mix and Mega's team validator.
        if (!item.megaStone && !item.isPrimalOrb &&
            (item.itemUser?.includes(species.name) || item.forcedForme === species.name)) return false;
        return !(isNationalDexFormat(format) && species.name.startsWith('Necrozma-') && item.id === 'ultranecroziumz');
    }

    function patchItemSearchBans() {
        return patchMethod(window.BattleItemSearch?.prototype, 'getBaseResults', '__qolItemBansPatched', (original) =>
                           function (...args) {
            const results = original.apply(this, args);
            this.__qolGroups = null;
            if (!Array.isArray(results)) return results;
            const bans = getMergedBansForFormat(getActiveTeambuilderRoom()?.curTeam?.format || this.format);
            if (!bans) return results;

            const bannedItem = (id) => categoryBanned(bans,'items',id);
            const format = getActiveTeambuilderRoom()?.curTeam?.format || this.format;
            const speciesName = this.set?.species || this.species || getActiveTeambuilderRoom()?.curSet?.species;
            const species = speciesName ? this.dex.species.get(speciesName) : null;
            const mnm = isMnmSearch(this);
            const restrictedItem = (id) => !bannedItem(id) && (bans.restrictedItems?.has(id) ||
                (mnm && isRestrictedMnmItem(this.dex, species, this.dex.items.get(id), format, bans)));
            this.__qolGroups = [
                {header: 'Restricted Items', kind: 'item', test: restrictedItem},
                {header: 'Banned Moves', kind: 'move', test: (id) => categoryBanned(bans,'moves',id)},
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

    function hasCrossEvolutionLearnset(format) {
        return searchFormatId(format) === 'crossevolution' ||
            formatRuleTokens(format).some((op) => op.kind === 'rule' && op.id === 'crossevolutionmod');
    }

    function crossEvolutionMoveResults(search, base) {
        const results = base();
        if (!hasCrossEvolutionLearnset(moveProviderFormat(search))) return results;

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
            const nativeRows = (ordinary = false) => {
                if (ordinary && !/hackmons|bh$/.test(this.format)) return nativeRows();
                const format = this.format;
                const key = `${this.species || ''}|${format}|${this.set?.name || ''}|${this.__qolNatdexMoves ? 1 : 0}|${this.__qolHackmonsMoves ? 1 : 0}|${ordinary}`;
                if (nativeBySpecies.has(key)) return nativeBySpecies.get(key);
                // Our provider handles STABmons, including absent historical
                // formes. Do not also run the client's unguarded STABmons loop.
                if (ordinary && /hackmons|bh$/.test(format)) {
                    this.format = 'qolnative';
                } else if (modsForSearch(this).includes(MOD.STABMONS)) {
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
            const rows = this.__qolHackmonsMoves
                ? [['header', 'Moves'], ...Object.keys(window.BattleMovedex || {})
                    .filter((id) => { const m = this.dex.moves.get(id);
                        return m?.exists && m.gen <= this.dex.gen && !m.isZ && !m.isMax; })
                    .map((id) => ['move', id])]
                : runProviderChain(MOVE_PROVIDERS, this, nativeRows);
            this.__qolNativeMoveIds = new Set(nativeRows(true).filter((row) => row[0] === 'move').map((row) => row[1]));
            this.__qolAddedMoveIds = new Set(rows.filter((row) => row[0] === 'move' &&
                !this.__qolNativeMoveIds.has(row[1])).map((row) => row[1]));
            if (this.__qolHackmonsMoves) return rows;
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
        if (mods.includes(MOD.REVELATIONMONS)) {
            parts.push(getActiveTeambuilderRoom()?.curChartName || '', search.set.item || '',
                search.set.teraType || '', ...(search.set.moves || []));
        }
        if (search.searchType === 'ability' && mods.includes(MOD.MIX_AND_MEGA)) parts.push(search.set.item || '');
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
        const hackmons = Array.isArray(filters) && filters.some((f) => f[0] === HACKMONS_MOVE_FILTER_TYPE);
        if (on === !!search.__qolNatdexMoves && hackmons === !!search.__qolHackmonsMoves) return;

        search.__qolNatdexMoves = on;
        search.__qolHackmonsMoves = hackmons;
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
        'natdex', 'hackmons', 'fe', 'recovery', 'pivot', 'priority', 'removal', 'hazards', 'selfko', 'phaze', 'into', 'from',
        'legendary', 'boxlegend', 'mythical', 'paradox', 'eeveelution', 'restricted', 'banned', 'realbulk',
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
        phaze: 'Phaze',
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
        banned: 'Banned',
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
    function realBulk(baseStats, stat, combineDefenses = false) {
        const hp = baseStats.hp === 1 ? 1 : 2 * baseStats.hp + 204;
        if (!combineDefenses) return hp * Math.floor((2 * baseStats[stat] + 99) * 11 / 10);
        const high = Math.max(baseStats.def, baseStats.spd);
        const low = Math.min(baseStats.def, baseStats.spd);
        return hp * (Math.floor((2 * high + 99) * 11 / 10) + 2 * low + 36);
    }
    const formatBulk = (n) => String(Math.round(n));
    const renderBulk = (n) => formatBulk(n);
    const hasRealBulk = (engine) => !!getIntoFilterId(engine, 'realbulk');

    function applyRealBulkToRowHtml(html) {return html;}

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
        const sameSpecies = toID(baseSet?.species) === speciesLike.id;
        const set = {...baseSet, species: speciesLike.name, name: sameSpecies ? baseSet.name : '', item: stoneId};

        const baseStats = computeModsBaseStats(mods, {dex, set, room: godlyGiftPreviewRoom(mods, room, set)}) ||
            mixAndMegaBaseStats(dex, set);
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

        if (kind === 'selfko' || kind === 'phaze') {
            const all = typeof dex?.moves?.all === 'function'
                ? dex.moves.all() : Object.values(window.BattleMovedex || {});
            return all.filter((move) => move?.id && move?.exists !== false &&
                (kind==='phaze'?(PHAZE_MOVES.has(move.id)||!!moveField(move,'forceSwitch')):(SELF_KO_MOVES.has(move.id)||!!moveField(move,'selfdestruct'))))
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

    function pokemonIsBanned(search,species){
        const format=getActiveTeambuilderRoom()?.curTeam?.format||search.format,profile=editorRuleProfile(format),bans=profile.bans;
        const tier=fmtHas(format,'natdex','nationaldex')?(natdexTierMap(search)?.get(species.id)||''):formatSpeciesTier(search,species);
        return isBannedByList(bans,species,false,tier)||!!challengeTechnicalReason(species,format,bans,search.dex,profile);
    }
    function pokemonMatchesCustomToggle(ctx, original, row, species, kind) {
        switch (kind) {
            case 'fe':
                return isFullyEvolved(species);
            case 'restricted': return isRestrictedInFormat(ctx, species);
            case 'banned': return pokemonIsBanned(ctx,species);
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
            case 'phaze':
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
        phaze: ['phazing', 'forceswitch', 'force switch'],
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

        if (!negated && (type === 'into' || type === 'from')) {
            engine.filters = (engine.filters || []).filter(([kind]) => kind !== 'into' && kind !== 'from');
        }
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
            let preview;
            for (const [rawType, target] of filters) {
                const negated = isNegatedFilterType(rawType);
                const type = baseFilterType(rawType);
                if (type === 'stone' || type === 'realbulk') continue;

                let matches;
                if ((!negated && (type === 'into' || type === 'from')) ||
                    type === 'type' || type === 'ability' || EFFECT_LABELS[type]) {
                    if (preview === undefined) preview = pokemonChipView(this, species);
                }
                if (!negated && (type === 'into' || type === 'from')) {
                    matches = !!preview;
                } else if (preview && type === 'type') {
                    matches = preview.types.some((name) => toID(name) === toID(target));
                } else if (preview?.abilities && type === 'ability') {
                    matches = Object.values(preview.abilities).some((a) => toID(a) === toID(target));
                } else {
                    const judged = preview && EFFECT_LABELS[type] ? {...species, types: preview.types} : species;
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

    function moveGodlyGiftRestrictedToIllegal(search, rows, isIllegal) {
        const kept = [], moved = [];
        let protectedSection = false;
        for (const row of rows) {
            if (row[0] === 'header') protectedSection = /^(?:banned|illegal)\b/i.test(row[1]);
            if (!protectedSection && row[0] === 'pokemon' && isIllegal(search.dex.species.get(row[1]))) {
                search.illegalReasons ||= {};
                search.illegalReasons[row[1]] ||= 'Only one restricted Pokémon is allowed';
                moved.push(row);
            } else {
                kept.push(row);
            }
        }
        if (!moved.length) return rows;
        const header = kept.find((row) => row[0] === 'header' && /^illegal\b/i.test(row[1]));
        return orderRuleSections([...kept, header || ['header', TL(['Illegal results'])], ...moved]);
    }

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
        if ((getEngine()?.filters || []).some(([type]) => type === 'hackmons')) {
            // Pure Hackmons is an unbanned search pool, not the original
            // format's banlist applied on top of a different species table.
            for (const row of results) {
                const why = search.illegalReasons?.[row[1]];
                if (row[0] === 'pokemon' && /^(?:Banned|Restricted)\b/.test(why || '')) {
                    delete search.illegalReasons[row[1]];
                }
            }
            return results.filter((row) => row[0] !== 'header' || !/^(Banned|Restricted)\b/i.test(String(row[1])));
        }
        const banFormat = getActiveTeambuilderRoom()?.curTeam?.format || search.format;
        const bans = getMergedBansForFormat(banFormat);
        if (!bans) return orderRuleSections(results);
        const natdexFormat = fmtHas(banFormat, 'natdex', 'nationaldex');
        const tierMap = natdexFormat ? natdexTierMap(search) : null;
        const formatTier = (sp) => natdexFormat ? (tierMap?.get(sp.id) || '') : formatSpeciesTier(search, sp);
        const pokebilities = isPokebilitiesFormat(banFormat);
        const ruleProfile=editorRuleProfile(banFormat,bans);
        const reason = (sp) => {
            if (isBannedByList(bans, sp, false, formatTier(sp))) return 'Banned';
            const technical=challengeTechnicalReason(sp,banFormat,bans,search.dex,ruleProfile);
            if(technical)return 'Banned by technicality: '+technical;
            if (!pokebilities) return null;
            const ability = nativeBannedAbility(bans, sp);
            if (ability) return `Banned ability: ${ability}`;
            const combo = nativeBannedCombo(bans, sp);
            return combo ? `Banned ability combination: ${combo}` : null;
        };
        // Group format bans without replacing native legality reasons. A
        // banlist match does not make an unavailable native form selectable.
        const allowed = [];
        const blocked = new Map();
        const technical = new Map();
        const restricted = new Map();
        if (!search.illegalReasons) search.illegalReasons = {};
        for (const row of results) {
            if (row[0] !== 'pokemon') {
                allowed.push(row);
                continue;
            }
            const sp = search.dex.species.get(row[1]);
            const why = reason(sp);
            const unavailableForm = sp?.id !== toID(sp?.baseSpecies || sp?.name) && (sp?.gen > search.dex.gen || sp?.isNonstandard === 'Future' || (sp?.isNonstandard === 'Past' && !natdexFormat) || (!natdexFormat && search.illegalReasons?.[row[1]] === 'Illegal' && (sp?.battleOnly || sp?.isMega || sp?.isPrimal || sp?.isNonstandard)));
            const visibleTechnical=why?.startsWith('Banned by technicality:')&&sp.gen<=search.dex.gen&&(!sp.isNonstandard||(natdexFormat&&sp.isNonstandard==='Past'));
            if (why && unavailableForm && !visibleTechnical && !bans.species.has(sp.id) && !bans.unbanned.has(sp.id)) continue;
            if (why) {
                const group=why.startsWith('Banned by technicality:')?technical:blocked;
                if (!group.has(row[1])) group.set(row[1], row);
                const previous = search.illegalReasons[row[1]];
                const unavailable = !sp?.exists || sp.battleOnly || sp.isMega || sp.isPrimal ||
                    sp.gen > search.dex.gen || (sp.isNonstandard && !(natdexFormat && sp.isNonstandard === 'Past'));
                if(group===technical)delete search.illegalReasons[row[1]];
                else if (!previous || (previous === 'Illegal' && !unavailable)) search.illegalReasons[row[1]] = why;
            } else if (search.illegalReasons[row[1]] !== 'Illegal' &&
                       (bans.restricted.has(row[1]) || bans.restrictedBase.has(toID(sp.baseSpecies || sp.name)))) {
                if (!restricted.has(row[1])) restricted.set(row[1], row);
                if (search.illegalReasons[row[1]] === 'Restricted') delete search.illegalReasons[row[1]];
            } else {
                allowed.push(row);
            }
        }
        return orderRuleSections([
            ...allowed,
            ...(restricted.size ? [['header', 'Restricted'], ...restricted.values()] : []),
            ...(technical.size ? [['header', 'Banned by technicality'], ...technical.values()] : []),
            ...(blocked.size ? [['header', 'Banned'], ...blocked.values()] : []),
        ]);
    }

    // Godly Gift: other Restricted mons move to an "Illegal results" section.
    function applyGodlyGiftLegality(search, results) {
        if (!modsForSearch(search).includes(MOD.GODLY_GIFT)) return results;

        const room = getTeambuilderRoom();
        const isIllegal = room && getGodlyGiftIllegalChecker(room);
        if (!isIllegal) return results;

        return moveGodlyGiftRestrictedToIllegal(search, results, isIllegal);
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
                const allowBattleFormes = allowsConvergenceBattleFormes(format, bans);
                const legalMegas = megamonsLegalMegaIds(format, this.dex);
                const crossEvo = modsForSearch(this).includes(MOD.CROSS_EVOLUTION);
                const restricted = crossEvo && !!(bans?.restricted?.size || bans?.restrictedBase?.size);
                if (!allowBattleFormes && !legalMegas.size && !explicit.size &&
                    !bans?.unbanned?.size && !bans?.unbannedBase?.size && !restricted) return rows;
                const have = new Set(rows.filter((r) => r[0] === 'pokemon').map((r) => r[1]));
                const unbannedExtra = [];
                const battleFormes = [];
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
                    // Removing the forme rule allows battle-only starting formes.
                    // Standard OMs still excludes nonstandard species unless unbanned.
                    const battleForme = allowBattleFormes && sp.battleOnly && !sp.isMega &&
                        !sp.isNonstandard && sp.gen <= this.dex.gen;
                    if ((!restrictedBase && !explicitlyAllowed && !battleForme) ||
                        (bans && isBannedByList(bans, sp))) continue;
                    if (restrictedBase) restrictedExtra.push(['pokemon', id]);
                    else if (explicitlyAllowed) unbannedExtra.push(['pokemon', id]);
                    else battleFormes.push(['pokemon', id]);
                }
                return [...rows,
                    ...(unbannedExtra.length ? [['header', 'Explicitly unbanned'], ...unbannedExtra] : []),
                    ...(battleFormes.length ? [['header', 'Battle formes'], ...battleFormes] : []),
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
                this.__qolActiveFilters = filters;
                return ceFullResults(this, filters, sortCol, reverseSort);
            }
            this.__qolCeFullMode = false;
            delete this.__qolActiveFilters;

            // A named format's server reply can change its Mega legality AFTER
            // the native search has computed baseResults/baseIllegalResults.
            // Clear BOTH caches before calling its getResults, otherwise a
            // newly legal Mega remains in the native "Illegal results" bucket.
            const legalMegas = megamonsLegalMegaIds(providerFormat, this.dex);
            const allowBattleFormes = allowsConvergenceBattleFormes(providerFormat, this.__qolProviderBans);
            const megaKey = `${providerFormat}|${allowBattleFormes}|${[...legalMegas].sort().join(',')}`;
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
            const poolKind = ['hackmons', 'natdex'].find((kind) =>
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
                // Let native getResults build the complement/Illegal reasons.
                // An empty cached array bypasses that initialization entirely.
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
            const hasPreview = results.some(([kind, id]) => kind === 'item' &&
                !isBlockedStonePreview(this, id) && isMnmStoneItem(this.dex, this.dex.items.get(id)));
            if (!hasPreview) return results;
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

    const REVELATION_UNCHANGED_MOVES = new Set([
        'judgment', 'multiattack', 'naturalgift', 'revelationdance', 'technoblast', 'terrainpulse', 'weatherball',
    ]);
    const CATEGORY_DYNAMIC_MOVES = new Set(['lightthatburnsthesky', 'photongeyser', 'shellsidearm']);

    function movePreviewContext(search, slot = undefined) {
        const room = getActiveTeambuilderRoom();
        const mods = modsForSearch(search);
        if (!mods.includes(MOD.REVELATIONMONS) && !mods.includes(MOD.CATEGORY_SWAP)) return null;
        const set = search?.set || room?.curSet;
        const dex = search?.dex || room?.curTeam?.dex;
        if (!set?.species || !dex) return null;
        const types = modifiedTypes(mods, dex, set) || dex.species.get(set.species)?.types || [];
        const chartSlot = /^move([1-4])$/.exec(room?.curChartName || '');
        return {mods, set, types, slot: slot ?? (chartSlot ? Number(chartSlot[1]) - 1 : -1), room};
    }

    function effectiveMove(move, context) {
        if (!move?.exists || !context) return move;
        const {mods, set, types, slot, room} = context;
        let type = move.type;
        let category = move.category;
        if (mods.includes(MOD.REVELATIONMONS) && slot >= 0 && types[slot] &&
            !REVELATION_UNCHANGED_MOVES.has(move.id)) type = types[slot];
        if (mods.includes(MOD.CATEGORY_SWAP) && category !== 'Status' && !CATEGORY_DYNAMIC_MOVES.has(move.id)) {
            category = category === 'Physical' ? 'Special' : 'Physical';
        }
        if (mods.includes(MOD.CATEGORY_SWAP) && ['lightthatburnsthesky', 'photongeyser'].includes(move.id) &&
            typeof room?.getStat === 'function') {
            const previewSet = {...set, evs: {...set.evs}, ivs: {...set.ivs}};
            category = room.getStat('atk', previewSet) > room.getStat('spa', previewSet) ? 'Physical' : 'Special';
        }
        if (type === move.type && category === move.category) return move;
        return {...move, type, category};
    }

    function withMovePreviews(dex, set, mods, slot, fn) {
        if (!dex?.moves?.get || !set?.species ||
            !mods.some((mod) => mod === MOD.REVELATIONMONS || mod === MOD.CATEGORY_SWAP)) return fn();
        const context = movePreviewContext({dex, set, __qolProviderMods: mods}, slot);
        const moves = dex.moves;
        const original = moves.get;
        const cache = new Map();
        moves.get = function (name) {
            const move = original.call(this, name);
            if (!move?.id) return move;
            if (!cache.has(move.id)) {
                const index = slot ?? (set.moves || []).findIndex((id) => toID(id) === move.id);
                cache.set(move.id, effectiveMove(move, {...context, slot: index}));
            }
            return cache.get(move.id);
        };
        try { return fn(); }
        finally { moves.get = original; }
    }

    function patchMoveRowPreview() {
        patchMethod(window.BattleSearch?.prototype, 'renderMoveRow', '__qolMovePreview',
            (original) => function (move, ...args) {
                return original.call(this, effectiveMove(move, movePreviewContext(this.engine?.typedSearch)), ...args);
            });
        return true;
    }

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

    function supportsNewMoves(search = getEngine()?.typedSearch) {
        return !!search && (search.__qolHackmonsMoves || /hackmons|bh$/.test(searchFormatId(moveProviderFormat(search))) ||
            modsForSearch(search).some((mod) => !!MOVE_PROVIDERS[mod] &&
                (mod !== MOD.CROSS_EVOLUTION || hasCrossEvolutionLearnset(moveProviderFormat(search)))));
    }

    const CORE_MOVE_TOGGLES = {
        new: {
            label: 'New', aliases: ['newmoves'],
            desc: 'Moves added by this format beyond the Pokémon’s native movepool',
            test: (move, search) => supportsNewMoves(search) && !!search.__qolAddedMoveIds?.has(move.id),
        },
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
        hackmons: {
            label: 'Hackmons', aliases: ['purehackmons'],
            desc: 'Show all moves without learnset or format bans',
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
            if (key === 'new' && !supportsNewMoves()) continue;
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
        if (!def || (key === 'new' && !supportsNewMoves())) return null;
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
            const context = movePreviewContext(this);
            const changed = context?.mods.some((mod) => mod === MOD.REVELATIONMONS || mod === MOD.CATEGORY_SWAP);
            if (!custom.length && !changed) return original.call(this, row, filters);
            if (row[0] !== 'move') return original.call(this, row, filters);

            const move = effectiveMove(this.dex.moves.get(row[1]), context);
            const matchesNative = (type, value) => type === 'type' && changed ? move.type === value :
                type === 'category' && changed ? move.category === value :
                original.call(this, row, [[type, value]]);
            const native = (filters || []).filter((f) => !isMoveCustomFilter(f[0]));
            if (!native.every(([type, value]) => matchesNative(type, value))) return false;
            if (!move?.exists) return false;

            return custom.every(([rawType, value]) => {
                const negated = isNegatedFilterType(rawType);
                const type = baseFilterType(rawType);
                if (type === NATDEX_MOVE_FILTER_TYPE || type === HACKMONS_MOVE_FILTER_TYPE) return true; // pool selector

                let matches;
                if (type.startsWith(MOVE_FILTER_TYPE)) {
                    const key = type.slice(MOVE_FILTER_TYPE.length);
                    matches = key === 'cov'
                        ? moveCovers(this.dex, move, coverageTypesFromValue(value))
                    : !!MOVE_TOGGLES[key]?.test(move, this);
                } else {
                    // negated native filter (type / category)
                    matches = matchesNative(type, value);
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
            const nativeRows = original.call(engine, query) || [];
            const native = getEngine() === engine
                ? dropEmptyHeaders(nativeRows.filter((row) => row[0] !== 'pokemon' &&
                    (row[0] !== 'move' || !engine.filters?.length ||
                        engine.typedSearch.filter(row, engine.filters)))) : nativeRows;
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
        if (getEngine() === engine && type === 'pokemon') return false;

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
        const intoRows = intoSuggestions(engine, query);
        const fromSpecies = intoRows.length ? null : parseFromQuery(engine, query);
        if (intoRows.length || fromSpecies) {
            resetPokemonModes(engine);
            const rows = fromSpecies ? [['ability', FROM_PREFIX + fromSpecies.id, 0, 4]] : intoRows;
            engine.query = toSearchId(query);
            engine.results = [['header', 'Cross Evolve'], ...rows];
            engine.selection = 1;
            engine.exactMatch = true;
            return true;
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
            // Full List must use the SAME command parser as standard Pokemon
            // search. The old early return threw away Weak/Resists/Neutral,
            // negated toggles, and custom type suggestions.
            const raw = String(query || '').trim();
            const negated = raw.startsWith('!');
            const body = (negated ? raw.slice(1) : raw).trim();
            const effectiveness = body.match(EFFECT_QUERY_RE);
            const bare = !raw;
            if (effectiveness) {
                const mode = effectiveness[1].toLowerCase();
                const partial = toSearchId((effectiveness[2] || '').trim());
                engine.__qolEffectivenessMode = mode;
                engine.__qolNegateMode = negated;
                engine.exactMatch = true;
                return (engine.results = [
                    ['header', (negated ? 'Not ' : '') + EFFECT_LABELS[mode]],
                    ...Object.keys(window.BattleTypeChart || {})
                        .filter((type) => !partial || toSearchId(type).startsWith(partial))
                        .map((type) => ['type', toSearchId(type), 0, type.length]),
                ]);
            }
            engine.__qolEffectivenessMode = null;
            engine.__qolNegateMode = negated;
            engine.exactMatch = !!negated;
            const native = (original.call(engine, body) || []).filter(([type, id]) =>
                ['type', 'ability', 'move', 'tier', 'egggroup'].includes(type) &&
                !isReservedToggleCollisionRow([type, id]));
            let suggestions;
            if (negated) {
                suggestions = [...customToggleSuggestions(body, true), ...colorSuggestions(body), ...native];
                if (!body) suggestions.push(...Object.keys(window.BattleTypeChart || {})
                    .map((type) => ['type', toSearchId(type), 0, type.length]));
            } else {
                suggestions = [...customToggleSuggestions(body), ...colorSuggestions(body),
                    ...stoneSuggestions(engine, body), ...native];
            }
            // A command search displays its options, not a spurious empty
            // combination list filtered by the literal command keyword.
            const pairs = negated ? [] : ceFullResults(engine.typedSearch, engine.filters,
                engine.sortCol, engine.reverseSort, bare ? '' : raw);
            return (engine.results = [
                ...(suggestions.length ? [['header', negated ? 'Not' : 'Filters'], ...suggestions] : []),
                ...pairs,
            ]);
        }
        const poolFilters = (engine.filters || []).filter(([type]) =>
            ['natdex', 'hackmons', 'ce', 'stage1', 'stage2', 'stage3'].includes(baseFilterType(type)));
        const searchFilters = (engine.filters || []).filter(([type]) =>
            ['natdex', 'hackmons', 'color', 'ce', 'stage1', 'stage2', 'stage3', 'move', 'ability',
                'into', 'from', 'stone', 'type', 'weak', 'resists', 'neutral', 'realbulk']
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
            return applyGodlyGiftLegality(engine.typedSearch, applyGenericBans(engine.typedSearch, rows));
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

    function applyIntoFilter(engine, target, crossEvolution) {
        const replace = crossEvolution && !getIntoFilterId(engine, 'fulllist')
            ? ['into', 'from', 'ce', 'stage1', 'stage2', 'stage3']
            : ['into'];
        engine.filters = (engine.filters || []).filter(([type]) => !replace.includes(type));
        return addPokemonSearchFilter(engine, 'into', target.id, false);
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

        const intoSuggestion = isStr && rawValue.startsWith(INTO_PREFIX);
        const showEvoRow = entry?.[0] === 'pokemon' && getIntoFilterId(engine, 'ce') &&
            !getIntoFilterId(engine, 'fulllist');
        if (intoSuggestion || showEvoRow) {
            const ce = modsForSearch(engine.typedSearch).includes(MOD.CROSS_EVOLUTION);
            if (intoSuggestion || ce) {
                const id = intoSuggestion ? rawValue.slice(INTO_PREFIX.length) : rawValue;
                const target = engine.dex.species.get(id);
                const format = getActiveTeambuilderRoom()?.curTeam?.format || engine.typedSearch?.format || '';
                if (target?.exists && (!ce || crossEvolutionDonorAllowed(engine.dex, target, format))) {
                    return applyIntoFilter(engine, target, ce);
                }
                // An unavailable donor row must not fall through to chartSet.
                return true;
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
                const stats = !isBlockedStonePreview(this, item.id) && isMnmStoneItem(this.dex, item)
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

        const bar = getTeambuilderRoom()?.el?.querySelector('.qol-itemsortrow');
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

        const row = getTeambuilderRoom()?.el?.querySelector('li.result a[data-entry^="item|"] .statcol')?.closest('a');
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
            if (sortCol !== 'priority') {
                const context = movePreviewContext(this);
                return withMovePreviews(this.dex, this.set || context?.set, modsForSearch(this), context?.slot,
                    () => original.call(this, results, sortCol, reverseSort));
            }

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

        for (const pp of getTeambuilderRoom().el.querySelectorAll('.sortrow button[data-sort="pp"]')) {
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

    const NO_HOLDS_BARRED_STAT_PAIRS = {atk: 'spa', spa: 'atk', def: 'spd', spd: 'def'};

    function noHoldsBarredSearchRow(html, stats, bulk) {
        return html.replace(/(<span class="col statcol"><em>)(Atk|Def|SpA|SpD)(<\/em><br\s*\/?\s*>)[^<]*(<\/span>) ?/g,
            (match, open, label, br, close) => {
                if (label === 'SpA' || label === 'SpD') return '';
                const offense = label === 'Atk';
                const value = offense ? stats.atk + stats.spa :
                    stats.def + stats.spd;
                return open + (offense ? 'Off' : 'Res') + br + value + close + ' ';
            });
    }

    function patchNoHoldsBarredSortRow() {
        patchMethod(window.BattleSearch?.prototype, 'renderPokemonSortRow', '__qolNoHoldsBarred',
            (original) => function (...args) {
                const html = original.apply(this, args);
                const search = this.engine?.typedSearch;
                const mods = search?.format ? modsForSearch(search) : getActiveMods();
                if (!mods.includes(MOD.NO_HOLDS_BARRED)) return html;
                return html.replace(/(<button[^>]*data-sort="(atk|def|spa|spd)"[^>]*>)[^<]*<\/button>/g,
                    (match, open, stat) => {
                        if (stat === 'spa' || stat === 'spd') return '';
                        const label = stat === 'atk' ? 'Offense' : 'Resilience';
                        return open.replace(/>$/, ` title="${label}">`) +
                            (stat === 'atk' ? 'Off' : 'Res') + '</button>';
                    });
            });
        return true;
    }

    function patchSearchSort() {
        return patchMethod(window.BattlePokemonSearch?.prototype, 'sort', '__qolPatched', (original) =>
                           function (results, sortCol, reverseSort) {
            const isStatSort = STATS.includes(sortCol) || sortCol === 'bst';
            if (!isStatSort) return original.call(this, results, sortCol, reverseSort);

            const dex = this.dex;
            const order = reverseSort ? -1 : 1;
            const mods = this.format ? modsForSearch(this) : getActiveMods();
            const combine = mods.includes(MOD.NO_HOLDS_BARRED);
            const pairedStat = combine && NO_HOLDS_BARRED_STAT_PAIRS[sortCol];
            const bulkSort = !!this.__qolRealBulk && (sortCol === 'def' || sortCol === 'spd');
            const valueOf = (stats) => bulkSort ? realBulk(stats, sortCol, combine)
                : sortCol === 'bst' ? sumStats(stats)
                : pairedStat ? stats[sortCol] + stats[pairedStat] : stats[sortCol];
            // Comparator calls grow with n log n. Compute each transformed
            // value once per sort; keep this cache local so edits cannot stale it.
            const sortBy = (statsFor) => {
                const values = new Map();
                const valueFor = (id) => {
                    if (!values.has(id)) values.set(id, valueOf(statsFor(id)));
                    return values.get(id);
                };
                return results.sort((a, b) => (valueFor(b[1]) - valueFor(a[1])) * order);
            };

            if ((this.__qolShowEvo || this.__qolCeStage) && getActiveMods().includes(MOD.CROSS_EVOLUTION)) {
                return sortBy((id) => {
                    const species = dex.species.get(id);
                    return this.__qolShowEvo
                        ? crossEvolutionDelta(dex, species)?.stats || species.baseStats
                        : species.baseStats;
                });
            }
            if (this.__qolIntoId || this.__qolFromId || this.__qolStoneId) {
                const chips = {filters: [
                    ['into', this.__qolIntoId], ['from', this.__qolFromId], ['stone', this.__qolStoneId],
                ]};
                return sortBy((id) => {
                    const species = dex.species.get(id);
                    return pokemonChipView(this, species, chips, mods)?.baseStats || species.baseStats;
                });
            }

            if (!hasSearchListStats(mods)) {
                return bulkSort || pairedStat
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
            const typedSearch = this.engine?.typedSearch;
            const mods = typedSearch?.format ? modsForSearch(typedSearch) : getActiveMods();
            const call = (mon, err) => {
                shown = mon;
                const reason = this.engine?.typedSearch?.illegalReasons?.[mon?.id];
                if (reason === 'Illegal' && !err) err = '<span class="col illegalcol"><em>Illegal</em></span>';
                if (reason === 'Banned' && typeof err === 'string' &&
                    /<em>\s*Banned\s*<\/em>/i.test(err)) err = null;
                return original.call(this, mon, matchStart, matchLength, err, attrs);
            };
            const finish = (html) => {
                if (!shown?.baseStats) return html;
                const bulk = hasRealBulk(this.engine);
                if (mods.includes(MOD.NO_HOLDS_BARRED)) return noHoldsBarredSearchRow(html, shown.baseStats, bulk);
                return bulk ? applyRealBulkToRowHtml(html, shown.baseStats) : html;
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
                const view = pokemonChipView(typedSearch || {dex}, pokemon, this.engine, mods);

                if (view) {
                    return finish(call(Object.assign({}, pokemon, {
                        baseStats: view.baseStats,
                        types: view.types,
                        abilities: view.abilities || pokemon.abilities,
                    }), errorMessage));
                }
            }

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
            const search = this.engine?.typedSearch;
            const reason = search?.illegalReasons?.[row];
            if (type === search?.searchType && typeof errorMessage === 'string' &&
                /class="col illegalcol"/.test(errorMessage) &&
                (reason === 'Banned' || (!reason && /<em>\s*Banned\s*<\/em>/i.test(errorMessage)))) {
                errorMessage = null;
            }
            if (type === 'sortitem') return renderItemSortRow(this);
            if (type === 'pokemon' && ceFullIds(row)) {
                // One CE data lookup per visible window, not once for every row.
                const data = this.__qolCeWindowData || ceFullData(this.engine.typedSearch);
                const pair = data.byId.get(row);
                if (!pair) return '';
                const stoneId = data.mods.includes(MOD.MIX_AND_MEGA) && getIntoFilterId(this.engine, 'stone');
                const view = ceFullPairView(pair, data, stoneId);
                const display = Object.assign({}, pair.base, {baseStats: view.baseStats,
                    types: view.types, abilities: view.abilities || pair.abilities});
                let native = this.renderPokemonRow;
                while (native.__original) native = native.__original;
                const nativeError = typeof errorMessage === 'string' && /<em>\s*Illegal\s*<\/em>/i.test(errorMessage) ? errorMessage : null;
                let html = native.call(this, display, 0, 0, nativeError, attrs);
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
                if (data.mods.includes(MOD.NO_HOLDS_BARRED)) {
                    return noHoldsBarredSearchRow(html, view.baseStats, hasRealBulk(this.engine));
                }
                return hasRealBulk(this.engine) ? applyRealBulkToRowHtml(html, view.baseStats) : html;
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
            const callOriginal = () => resolvedNativeStat(original, this, this.curTeam?.dex,
                this.curTeam?.format, stat, set, evOverride, natureOverride);

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

    function withTeamSuggestionStats(dex, set, fn) {
        const room = getActiveTeambuilderRoom();
        const teamDex = room?.curTeam?.dex;
        if (!set?.species || room?.curSet !== set || !teamDex || !dex?.species?.get) return fn();

        // The form renderer may already have applied the stack to the team Dex.
        // Transfer those stats to the guesser's Dex if it is a separate instance.
        const stats = isStatOverrideActive(teamDex, set.species)
            ? teamDex.species.get(set.species).baseStats
            : computeModsBaseStats(getActiveMods(room), {dex: teamDex, set, room});
        if (!stats) return fn();

        const species = dex.species.get(set.species);
        const mega = dex.items?.get?.(set.item)?.megaStone?.[species?.name];
        return withSpeciesBaseStats(dex, set.species, stats, () =>
            mega ? withSpeciesBaseStats(dex, mega, stats, fn) : fn());
    }

    // Native optimization reads base stats directly and assumes the standard
    // EV budget. Skip its savings advice when a custom budget differs.
    function patchBattleStatOptimizerConstructor() {
        const Optimizer = window.BattleStatOptimizer;
        if (typeof Optimizer !== 'function') return false;
        if (Optimizer.__qolFormatPatched) return true;

        const run = (args, call) => {
            if (args.length < 2) return call(args);
            const [set, format] = args;
            const nativeFormat = statGuesserFormat(format);
            const limit = explicitSuggestionEVLimit(format, formatGeneration(nativeFormat));
            if (limit !== undefined && limit !== 510 && limit !== 508) return null;
            const normalized = [set, nativeFormat, ...args.slice(2)];
            const dex = window.Dex?.mod?.(nativeFormat.slice(0, 4));
            return withTeamSuggestionStats(dex, set, () => {
                const species = dex?.species?.get?.(set.species);
                const natures = window.BattleNatures || (typeof BattleNatures !== 'undefined' ? BattleNatures : {});
                const nature = natures[set.nature];
                if (dex?.gen >= 3 && species?.exists && !/letsgo|champions/.test(nativeFormat) && nature && nature.plus !== nature.minus) {
                    const raw = (stat) => Math.floor((2 * species.baseStats[stat] +
                        (set.ivs?.[stat] ?? 31) + Math.floor((set.evs?.[stat] || 0) / 4)) *
                        (set.level || 100) / 100 + 5);
                    if ((nature.plus && raw(nature.plus) >= 596) || (nature.minus && raw(nature.minus) >= 729)) return null;
                }
                return call(normalized);
            });
        };
        const Wrapped = new Proxy(Optimizer, {
            apply(target, thisArg, args) {
                return run(args, (normalized) => Reflect.apply(target, thisArg, normalized));
            },
            construct(target, args, newTarget) {
                return run(args, (normalized) => Reflect.construct(target, normalized, newTarget)) || {};
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
        // An explicit generation already decides this branch. Do not parse
        // the entire custom rule list or read labels once per rendered Pokémon.
        const megamons = !match && (isConvergenceMegamons(format) ||
            toSearchId(getCustomFormatLabel(format)) === 'convergencemegamons' ||
            toSearchId(team.name || '') === 'convergencemegamons');
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

    function updateNoHoldsBarredStats(room) {
        if (room.curChartType !== 'stats' || !room.curSet || !isNoHoldsBarredFormat(room.curTeam?.format)) return;
        const form = room.$chart?.find('.statform');
        if (!form?.length) return;
        const set = room.curSet;
        const offense = room.getStat('atk', set) + room.getStat('spa', set);
        const resilience = room.getStat('def', set) + room.getStat('spd', set);
        const summary = form.find('.qol-nhb-stats');
        const text = `Offense ${offense} · Resilience ${resilience}`;
        if (summary.length) summary.text(text);
        else form.append(`<p class="qol-nhb-stats"><strong>${text}</strong></p>`);
    }

    function patchNoHoldsBarredMoveIVs() {
        return patchMethod(window.TeambuilderRoom?.prototype, 'chooseMove', '__qolNoHoldsBarred',
            (original) => function (moveName, ...args) {
                const set = this.curSet;
                if (!set || (!isNoHoldsBarredFormat(this.curTeam?.format) && !getActiveMods(this).includes(MOD.CATEGORY_SWAP)) ||
                    moveName?.startsWith('Hidden Power ')) {
                    return original.call(this, moveName, ...args);
                }
                // Older clients minimize Attack IVs for special-only sets.
                // Both No Holds Barred and Category Swap use Attack differently.
                const attackIV = set.ivs?.atk;
                const result = original.call(this, moveName, ...args);
                if (set.ivs && set.ivs.atk !== attackIV) {
                    if (attackIV === undefined) delete set.ivs.atk;
                    else set.ivs.atk = attackIV;
                }
                return result;
            });
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
                updateNoHoldsBarredStats(this);
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
            updateNoHoldsBarredStats(this);
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
                if (mods.includes(MOD.CROSS_EVOLUTION)) {
                    // Native setPokemon initializes the base's ability.
                    // A cross-evolved set can instead use the donor's abilities.
                    const bans = getMergedBansForFormat(this.curTeam?.format);
                    const pair = resolveCrossEvolution(this.curTeam?.dex, this.curSet);
                    const abilities = Object.values(pair?.cross.abilities || {});
                    const current = this.curSet.ability;
                    const ability = abilities.includes(current) && !bans?.abilities?.has(toID(current))
                        ? null : abilities.find((name) => name && !bans?.abilities?.has(toID(name)));
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
                const dex = this.curTeam?.dex;
                const format = this.curTeam?.format;
                const stone = dex?.items?.get(stoneId);
                const species = dex?.species?.get(this.curSet.species);
                const bans = getMergedBansForFormat(format);

                if (stone?.exists && !bans?.items?.has(stone.id) && !bans?.restrictedItems?.has(stone.id) &&
                    !isRestrictedMnmItem(dex, species, stone, format, bans)) {
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
                if (!dex || !set?.species || !isMnmStoneItem(dex, item) || isBlockedStonePreview(typed, item.id)) return html;

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
        const resolved = resolveFormatKey(base) || toID(base);
        const team = getActiveTeambuilderRoom()?.curTeam;
        const gen = formatGeneration(resolved, team?.dex?.gen || team?.gen || Dex.gen || 9);
        // Native code uses the generation prefix for Dex.mod and the rest
        // of the ID for mechanics such as Hackmons, Let's Go, and Metronome.
        return /^gen\d+(?=[a-z]|$)/.test(resolved) ? resolved : `gen${gen}${resolved}`;
    }

    function explicitSuggestionEVLimit(format, gen) {
        const {active, removed} = explicitRuleState(format);
        if (removed.has('evlimit')) return null;
        const value = active.get('evlimit')?.value;
        if (value == null) return undefined;
        if (value.toLowerCase() === 'auto') return gen > 2 ? 510 : null;
        return /^\d+$/.test(value) ? Number(value) : undefined;
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
                const limit = guesser.__qolEVLimit = explicitSuggestionEVLimit(format, guesser.dex?.gen);
                if (limit !== undefined) guesser.ignoreEVLimits = limit === null;
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
            const callOriginal = () => resolvedNativeStat(original, this, this.dex,
                this.__qolChallengeFormat || this.formatid, stat, set, evOverride, natureOverride);
            if (!set?.species || !this.dex?.species?.get) return callOriginal();

            if (isStatOverrideActive(this.dex, set.species)) return callOriginal();
            const mod = modFromFormat(this.__qolChallengeFormat || this.formatid);
            if (!BATTLE_GUESSER_MODS.has(mod)) return callOriginal();

            const baseStats = computeModBaseStats(mod, {dex: this.dex, set});
            return baseStats ? withSpeciesBaseStats(this.dex, set.species, baseStats, callOriginal) : callOriginal();
        }
                          );
    }

    function patchBattleStatGuesserGuess() {
        return patchMethod(window.BattleStatGuesser?.prototype, 'guess', '__qolSuggestionStats', (original) =>
            function (set) {
                const roomForMoves = getActiveTeambuilderRoom();
                const moveMods = roomForMoves?.curSet === set ? getActiveMods(roomForMoves) :
                    modsFromFormatString(this.__qolChallengeFormat || this.formatid);
                const guess = withTeamSuggestionStats(this.dex, set, () =>
                    withMovePreviews(this.dex, set, moveMods, undefined, () => original.call(this, set)));
                const room = getActiveTeambuilderRoom();
                if (!guess || !set?.species || room?.curSet !== set || !this.supportsEVs || this.dex.gen < 3) return guess;

                const limit = this.__qolEVLimit;
                const hackmons = /(?:hackmons|bh)$/.test(this.formatid);
                if (this.ignoreEVLimits && (hackmons || limit === null)) {
                    const nature = window.BattleNatures?.[set.nature];
                    return {
                        ...guess,
                        role: guess.role === '?' ? 'Max EVs' : guess.role,
                        evs: Object.fromEntries(STATS.map((stat) => [stat, 252])),
                        plusStat: guess.plusStat || nature?.plus || '',
                        minusStat: guess.minusStat || nature?.minus || '',
                    };
                }
                if (typeof limit !== 'number' || sumStats(guess.evs) <= limit) return guess;

                // Keep the native spread's priorities within a smaller custom cap.
                const evs = {...guess.evs};
                const priority = STATS.slice().sort((a, b) => guess.evs[b] - guess.evs[a]);
                let remaining = limit;
                for (const stat of priority) {
                    evs[stat] = Math.min(guess.evs[stat], Math.floor(remaining / 4) * 4);
                    remaining -= evs[stat];
                }
                return {...guess, evs};
            });
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
        const room = getTeambuilderRoom();
        const root = room?.el;
        if (!root) return;
        const typed = room.search?.engine?.typedSearch;
        const type = typed?.searchType;
        const donors = (type === 'move' || type === 'ability') ? typed?.__qolConvDonors : null;

        for (const a of root.querySelectorAll('li.result > a[data-entry]')) {
            const li = a.parentElement;
            let badge = li.querySelector(':scope > .qol-donor');
            const entry = a.getAttribute('data-entry') || '';
            const donorId = donors && entry.startsWith(type + '|')
                ? donors[toID(entry.slice(type.length + 1))] : null;
            // Native rows can be reused after changing species or filters.
            if (!donorId) { badge?.remove(); continue; }
            if (badge?.dataset.qolDonor === donorId) continue;
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'qol-donor';
                badge.style.cssText =
                    'position:absolute;right:4px;top:50%;margin-top:-15px;' +
                    'pointer-events:none;transform:scale(.8);transform-origin:right center;';
                li.style.position = 'relative';
                li.appendChild(badge);
            }
            badge.dataset.qolDonor = donorId;
            badge.title = `Shared by ${typed.dex.species.get(donorId)?.name || donorId}`;
            badge.innerHTML = pokemonIconHtml(donorId);
        }
    }

    // Move search: our "mvf ..." suggestion rows, plus "!" on native type/category rows.
    function decorateMoveFilterRows() {
        const engine = getTeambuilderRoom()?.search?.engine;
        if (engine?.typedSearch?.searchType !== 'move') return;

        const bang = engine.__qolMoveNegate ? '!' : '';

        for (const a of getTeambuilderRoom().el.querySelectorAll('li.result > a[data-entry]')) {
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

        for (const a of getTeambuilderRoom().el.querySelectorAll('li.result > a[data-entry]')) {
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

    // Ignore chat, battle animations, tooltips and the usage-stats page.
    // Check both targets and inserted subtrees: whole rooms/popups can appear
    // in a single mutation before their app-room handle has been assigned.
    const DECORATOR_SURFACES = '.teampane, .teamlist, .teamchart, .menugroup, .ps-popup, .popupmenu';
    function mutationsNeedDecorators(records) {
        const root = getTeambuilderRoom()?.el;
        const relevant = (node) => {
            if (node?.nodeType !== 1) return false;
            return !!((root && (node === root || root.contains(node) || node.contains(root))) ||
                node.closest?.(DECORATOR_SURFACES) || node.querySelector?.(DECORATOR_SURFACES));
        };
        return records.some((record) => {
            const target = record.target?.nodeType === 1 ? record.target : record.target?.parentElement;
            // Looking through the target's descendants would make every body
            // mutation relevant just because a teambuilder exists elsewhere.
            if (target && ((root && (target === root || root.contains(target))) ||
                target.closest?.(DECORATOR_SURFACES))) return true;
            return [...record.addedNodes, ...record.removedNodes].some(relevant);
        });
    }

    let domDecoratorsInstalled = false;
    function installDomDecorators() {
        if (domDecoratorsInstalled) return;
        domDecoratorsInstalled = true;
        let scheduled = false;
        const options = {childList: true, subtree: true};
        const observer = new MutationObserver((records) => {
            if (scheduled || !mutationsNeedDecorators(records)) return;
            schedule();
        });
        function schedule() {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => {
                scheduled = false;
                // Decoration is synchronous. Do not observe our own insertions
                // and text replacements and schedule a second redundant frame.
                observer.disconnect();
                try {
                    for (const [name, decorate] of DOM_DECORATORS) {
                        try { decorate(); }
                        catch (e) { console.error(LOG, `Decorator "${name}" failed:`, e); }
                    }
                } finally { observer.observe(document, options); }
            });
        }
        observer.observe(document, options);
        // Mobile item-sort controls must also update when the viewport changes
        // without a DOM mutation (rotation or resizing the browser).
        window.matchMedia?.('(max-width: 600px)')?.addEventListener?.('change', schedule);
        schedule(); // Also handles installation after the first native render.
    }


    // ====================================================================
    // SELF CHALLENGE
    //   Two native rooms backed by an isolated local simulator Worker.
    //   No guest account or battle traffic reaches the live server.
    // ====================================================================

    const SELF = {
        BOT_NAME: 'TestBot',
        STORE: 'qol-self-session',
        PREFS: 'qol-self-prefs',
        MAX_AGE: 6 * 60 * 60 * 1000,
    };

    const selfEsc = (s) => BattleLog.escapeHTML(String(s ?? ''));
    const selfWsUrl = () => {
        const server = window.Config?.server || window.Config?.defaultserver || {};
        const secure = server.https !== false && server.port !== 80;
        const port = server.port && ![80, 443].includes(Number(server.port)) ? ':' + server.port : '';
        return `${secure ? 'wss' : 'ws'}://${server.host || 'sim3.psim.us'}${port}${window.Config?.sockjsprefix || '/showdown'}/websocket`;
    };

    const SELF_CHALLENGE_MOD_RULES = Object.fromEntries(MOD_DEFINITIONS
                                                        .filter((definition) => definition.challengeRule)
                                                        .map((definition) => [definition.id, definition.challengeRule]));

    function selfChallengeFormat(format) {
        if (String(format || '').includes('@@@')) return format;
        if (isNoHoldsBarredFormat(format)) return NO_HOLDS_BARRED_FORMAT;
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

    

    const MOD_COMMAND_HELP = [
        ['Battle controls', [
            ['/set electric | grassy | misty | psychic', 'Set terrain.'],
            ['/set rain | sun | snow | sand | hail', 'Set weather.'],
            ['/set desolateland | primordialsea | deltastream', 'Set special weather.'],
            ['/set weather none | terrain none', 'Clear weather or terrain.'],
            ['/set crit auto [off]', 'Keep forcing your critical hits, or turn it off.'],
            ['/set crit [me/opp]', 'Force incoming crits on that side this turn. Default: you crit them.'],
            ['/set roll 85–100 auto [off]', 'Keep a fixed damage roll for your attacks.'],
            ['/set hit auto [off]', 'Keep your attacks hitting.'],
            ['/set miss auto [off]', 'Keep their attacks missing you.'],
            ['/set spikes [0–3] [me/opp]', 'Set Spikes layers. Default: 1 on the opponent.'],
            ['/set tspikes | toxic spikes [0–2] [me/opp]', 'Set Toxic Spikes layers.'],
            ['/set rocks | webs [me/opp] [on/off]', 'Set Stealth Rock or Sticky Web.'],
            ['/set reflect | light screen | aurora veil [me/opp] [on/off]', 'Set screens. Default: your side.'],
            ['/set tailwind | safeguard | mist [me/opp] [on/off]', 'Set a side condition. Default: your side.'],
            ['/set trick room | gravity | magic room | wonder room [on/off]', 'Set a field condition.'],
            ['/set flinch [me/opp]', 'Make that side flinch this turn. Default: opponent.'],
            ['/set burn | poison | toxic | paralysis | sleep | freeze [me/opp]', 'Set status. Default: opponent.'],
            ['/set nuclearbomb [me/opp]', 'Teach Nuclear Bomb to the active Pokémon (adds a move or replaces slot 4). Sandbox only: 1000 power, Fire label with Fairy damage/hit checks (works in Primordial Sea), +7 priority, 64 PP, always super effective (2x), native three-second effect burst; damage at 2.4 seconds; ignores abilities and Psychic Terrain.'],
            ['/set move Explosion opp', 'Replace the target’s move for this turn without a command notification.'],
            ['/set cure [me/opp]', 'Remove status. Default: your side.'],
            ['/set def drop [1–6] [me/opp]', 'Lower a stat. Default: opponent.'],
            ['/set atk boost [1–6] [me/opp]', 'Raise a stat. Default: your side.'],
            ['/set speedtie me/opp [on/off]', 'Make that side win speed ties. No flag: this turn.'],
            ['/set atk +2 | defense +6 opp | stats -6 opp', 'Set one or all stat stages.'],
            ['/set spe -6 opp auto [off]', 'Keep that stat stage, including after switches.'],
            ['/set confusion hit-self [me/opp] [auto] [off]', 'Force confusion self-hits if that Pokémon becomes confused.'],
            ['/set rain auto [off]', 'Keep rain active, or stop keeping it active.'],
            ['/set effects', 'List available temporary Pokémon effects for this battle generation.'],
            ['/set effect <name> [me/opp] [on/off] [auto]', 'Apply or remove a native temporary effect; /set confusion opp, /set substitute me, /set taunt opp off also work. Effects retain native prerequisites and durations.'],
            ['/set status <name> [me/opp] [on/off]', 'Burn, paralysis, poison, toxic, sleep, freeze, frostbite (where supported), or cure.'],
            ['/set heaven [me/opp] [on/off] [auto]', 'Heal, cure, maximize all stages, and add compatible positive effects and screens. Default: you.'],
            ['/set hell [me/opp] [on/off]', 'Badly poison, drop all stages and add compatible negative effects, including Curse and Leech Seed.'],
            ['/set revive 2 [me/opp]', 'Revive original team slot 2 at full HP. Default: your side.'],
            ['/set kill 2 [me/opp]', 'Faint original team slot 2. Default: opponent.'],
            ['/set type [slot] [me/opp] Fire Flying Ice Dark', 'Override a Pokemon’s types, using its original team slot (default: your active Pokemon). Multiple types allowed; use reset to restore normal typing.'],
            ['/set hp | health <1–100> [me/opp]', 'Set active HP to a percentage, rounded up to a whole HP. Default: you. Does not revive fainted Pokémon.'],
            ['/set switch <species/name/slot> [me/opp]', 'Immediately switch to an unfainted team member by species, nickname or original 1-based team slot. Default: opponent; singles only.'],
            ['/set teams', 'Edit both team pastes in chat.'],
            ['/set clear', 'Clear forced RNG and automatic edits.'],
            ['/rewind', 'Go back one turn.'],
        ]],
        ['Data and team commands', [
            ['/fakechallenge username, format', 'Challenge another mod user to a shared sandbox.'],
            ['/hack', 'Show or hide controls in a shared fake battle.'],
            ['/disable fakechallenges', 'Stop receiving fake challenges.'],
            ['/enable fakechallenges', 'Allow fake challenges again.'],
            ['/dp | /datapreview [team/Pokémon]', 'Show challenge-code Pokémon data; replace the last preview.'],
            ['/dt | /data | /details | /dex | /pokedex | /pstats | /stats', 'Pokémon data. Comma options add explicit modifiers.'],
            ['/dt1…9', 'Pokémon data for that generation.'],
            ['/ms | /movesearch | /msearch | /nms', 'Search moves; supports explicit modifiers.'],
            ['/ms1…9', 'Move search for that generation.'],
            ['/ds | /dexsearch | /dsearch | /nds', 'Search Pokémon.'],
            ['/learn | /canlearn | /learnset | /learnall', 'Check learnsets.'],
            ['/weak | /weakness | /weaknesses | /resist', 'Check weaknesses or resistances.'],
            ['/eff | /effectiveness | /type | /matchup', 'Check type effectiveness.'],
            ['/cover | /coverage', 'Check type coverage.'],
            ['/statcalc', 'Calculate a Pokémon stat.'],
            ['/stealteam | /steal [player]', 'Copy their team; sandbox copies include every complete set.'],
            ['/smogonpage [format]', 'Find a format’s forum resources.'],
            ['/smogonpage set format | URL', 'Save a forum resource.'],
            ['/smogonpage unset format', 'Remove a saved forum resource.'],
        ]],
        ['Format previews', [
            ['/mnm | /mixandmega', 'Preview Mix and Mega.'],
            ['/scale | /scalemons; /flip | /flipped', 'Preview Scalemons or Flipped stats.'],
            ['/ts | /tiershift; /bnb | /badnboosted; /350 | /350cup', 'Preview format stats.'],
            ['/ns | /natureswap', 'Preview Nature Swap.'],
            ['/ce | /crossevo | /crossevolve', 'Preview Cross Evolution.'],
            ['/fuse | /franticfusions', 'Preview Frantic Fusions.'],
            ['/reevo; /showevo; /pokemove', 'Preview Re-Evolution, evolution changes, or move-based changes.'],
            ['/nsN, /fuseN, /scaleN, /flipN, /tsN', 'Use a generation suffix where supported.'],
        ]],
    ];
    function showModHelp(room) {
        const esc=smogonPageEsc;
        const sections=[MOD_COMMAND_HELP[1],MOD_COMMAND_HELP[2],MOD_COMMAND_HELP[0]];
        const html='<div class="infobox"><strong>Mod commands</strong><p>Open a section for commands and examples. Add <code>auto</code> to keep a battle setting active; add <code>auto off</code> to stop it. <code>me</code> targets you; <code>opp</code> targets your opponent.</p>'+sections.map(([section,rows])=>'<details><summary><strong>'+esc(section)+'</strong></summary><table style="width:100%;font-size:11px;border-collapse:collapse"><tbody>'+rows.map(([syntax,description])=>'<tr><td style="padding:4px;vertical-align:top"><code>'+esc(syntax)+'</code></td><td style="padding:4px;vertical-align:top">'+esc(description)+'</td></tr>').join('')+'</tbody></table></details>').join('')+'<p><code>/modhelp</code> — Show this list.</p></div>';
        const log=room?.battle?.scene?.log;
        if(log?.changeUhtml){log.changeUhtml('qolmodhelp',html,true);for(const parent of [log.innerElem,log.preemptElem])for(const child of parent?.children||[])if(child.classList.contains('uhtml-qolmodhelp'))child.setAttribute('data-qol-chat-only','');}
        else if(room?.add)room.add('|uhtml|qolmodhelp|'+html);
        else showSmogonPageReply(room,html);
    }
    function patchModHelpCommands() {
        return patchMethod(window.app,'send','__qolModHelpCommands',original=>function(data,...rest){
            let text=data,id=typeof rest[0]==='string'?rest[0]:rest[0]?.id;
            if(rest[0]===true&&typeof data==='string'&&data.includes('|')){const split=data.indexOf('|');id=data.slice(0,split);text=data.slice(split+1);}
            if(typeof text!=='string')return original.call(this,data,...rest);
            const room=this.rooms?.[id]||this.curSideRoom||this.curRoom;
            if(/^\/modhelp\s*$/i.test(text)){showModHelp(room);return;}
            if(/^\/(?:set|rewind)(?:\s|$)/i.test(text)&&!isLocalBattleRoom(id)){
                if(room?.add)room.add('|error|Use this command in a sandbox battle.');else this.addPopupMessage?.('Use this command in a sandbox battle.');return;
            }
            return original.call(this,data,...rest);
        });
    }

// A text-selection drag may end outside its editor. Do not let that click
// reach Showdown's background handler, which dismisses popups before checking
// whether the user was selecting text.
function preserveEditorSelection(element){
 let selecting=false;
 function down(event){selecting=element.contains(event.target)&&!event.target.closest?.('button,select');}
 function click(event){const wasSelecting=selecting;selecting=false;if(!wasSelecting||element.contains(event.target))return;event.stopImmediatePropagation();}
 document.addEventListener('pointerdown',down,true);document.addEventListener('click',click,true);
 return ()=>{document.removeEventListener('pointerdown',down,true);document.removeEventListener('click',click,true);};
}

function nativeLocalInteractions(room){
 const root=room.el,style=document.createElement('style');
 style.textContent='.qol-native-local .battle .has-tooltip,.qol-native-local .battle-controls .has-tooltip,.qol-native-local .qol-rng-panel,.qol-native-local .qol-rng-panel *{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}.qol-native-local.small-layout.showing-chat .qol-local-choices{display:none!important}';
 root.classList.add('qol-native-local');root.append(style);
 function preventSelection(event){if(event.target.closest?.('.battle .has-tooltip,.battle-controls .has-tooltip,.qol-rng-panel')&&!event.target.closest?.('input,textarea,[contenteditable=true]'))event.preventDefault();}
 root.addEventListener('selectstart',preventSelection);root.addEventListener('contextmenu',preventSelection);
 return ()=>{root.removeEventListener('selectstart',preventSelection);root.removeEventListener('contextmenu',preventSelection);root.classList.remove('qol-native-local');style.remove();};
}

// Keep the compressed engine inside this lazily invoked function. It is
// decoded and executed only in a Worker after a local operation requests it.
// The mobile manager runs in the page realm and has no GM resource API.
// Fetch the identical, immutable archive as inert text; verify before extraction.
const QOL_ENGINE_URL='https://raw.githubusercontent.com/Jake18236/Showdown-Teambuilder-Mod/a96e9f5eeaae7a270b459f7311d2abfc8c145f49/showdown-teambuilder.user.js';
const QOL_ENGINE_HASH='41d6c37e7ad0bd610bce9ffb6dde617b885d06504412b3bc62349448e6ae1adc';
let qolEngineDownload=null;
function extractLocalSimulator(text){
 const match=/const LOCAL_SIM_GZIP = "([A-Za-z0-9+/=]+)"/.exec(text||'');
 if(!match)throw Error('The simulator download is missing or invalid. Please retry opening Sandbox.');
 return match[1];
}
async function downloadLocalSimulator(){
 const verify=async text=>{
  if(text.length>12000000)throw Error('Invalid simulator archive size.');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join('');
  if(hash!==QOL_ENGINE_HASH)throw Error('Simulator integrity check failed. Please retry opening Sandbox.');
  return extractLocalSimulator(text);
 };
 let cache;
 try{cache=await caches.open('showdown-qol-engine-v1');const hit=await cache.match(QOL_ENGINE_URL);if(hit){try{return await verify(await hit.text());}catch{await cache.delete(QOL_ENGINE_URL);}}}catch{cache=null;}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
 try{
  const response=await fetch(QOL_ENGINE_URL,{credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
  if(!response.ok)throw Error('HTTP '+response.status);
  const text=await response.text(),payload=await verify(text);
  if(cache)try{await cache.put(QOL_ENGINE_URL,new Response(text,{headers:{'Content-Type':'text/plain'}}));}catch{}
  return payload;
 }catch(error){throw Error('Could not load the sandbox simulator. Check your connection and retry. '+(error?.message||error));}
 finally{clearTimeout(timer);}
}
function localSimulatorPayload(){
 if(typeof GM_getResourceText==='function')try{const text=GM_getResourceText('qolSimulator');if(text)return extractLocalSimulator(text);}catch{}
 if(!qolEngineDownload)qolEngineDownload=downloadLocalSimulator().catch(error=>{qolEngineDownload=null;throw error;});
 return qolEngineDownload;
}



function createSandboxEditors(s,room){
 const escPlayer=side=>window.BattleLog.escapeHTML(String(s.cfg?.[side==='p1'?'name':'nameB']||s.sandbox?.sides.find(team=>team.id===side)?.name||side));
 const root=room.el,toolbar=document.createElement('div');toolbar.className='qol-sandbox-edit-buttons';
 toolbar.innerHTML='<button type="button" class="button" data-sandbox-editor="teams">Teams</button>';
 const style=document.createElement('style');style.textContent='.qol-sandbox-edit-buttons{position:absolute;right:8px;top:8px;z-index:15;white-space:nowrap}.qol-sandbox-edit-buttons .button{font-size:11px;padding:2px 6px}@media(pointer:coarse){.qol-sandbox-edit-buttons .button{min-height:28px;padding:3px 8px}}.qol-sandbox-editor{box-sizing:border-box;max-width:100%;padding:6px;margin:5px 0;border:1px solid #9aa6ae;border-radius:3px;background:var(--background,#eef2f5);color:var(--foreground,#222);font:12px Verdana,sans-serif}.qol-sandbox-editor header{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px}.qol-sandbox-editor label{display:block;margin:6px 0}.qol-sandbox-editor textarea{display:block;box-sizing:border-box;width:100%;min-height:150px;resize:vertical;font:11px monospace}.qol-sandbox-editor .message-error{white-space:pre-wrap}.dark .qol-sandbox-editor{background:#333;color:#ddd}';
 document.head.append(style);let panel=null,mode=null,timer=0,revision=0,dead=false,selectionCleanup=null;
 function layout(){if(root.classList.contains('small-layout')&&root.classList.contains('showing-chat'))return;const battle=root.querySelector('.battle');if(!battle)return;if(toolbar.parentElement!==root)root.append(toolbar);const frame=battle.getBoundingClientRect(),outer=root.getBoundingClientRect(),edge=Math.min(outer.width||window.innerWidth,frame.width?frame.right-outer.left:(outer.width||window.innerWidth)),left=Math.max(8,edge-toolbar.offsetWidth-8)+'px';let top=Math.max(4,frame.top-outer.top+8)+'px';const chat=root.querySelector('.battle-chat-toggle');if(chat&&chat.getBoundingClientRect().height){const c=chat.getBoundingClientRect();top=Math.max(parseFloat(top),c.bottom-outer.top+6)+'px';}toolbar.style.right='auto';if(toolbar.style.left!==left)toolbar.style.left=left;if(toolbar.style.top!==top)toolbar.style.top=top;}
 function data(){return {p1:panel.querySelector('[data-paste=p1]').value,p2:panel.querySelector('[data-paste=p2]').value};}
 function schedule(){clearTimeout(timer);const version=++revision;if(!panel)return;panel.querySelector('[data-apply]').disabled=true;panel.querySelector('[data-editor-message]').textContent='';timer=setTimeout(()=>validate(version),180);}
 async function validate(version){if(dead||!panel||version!==revision)return;const current=panel,method='checkTeams',value=data(),button=panel.querySelector('[data-apply]'),message=panel.querySelector('[data-editor-message]');
  try{await s.rpc(method,value);if(!dead&&panel===current&&version===revision){button.disabled=false;message.textContent='';}}
  catch(error){if(!dead&&panel===current&&version===revision){button.disabled=true;message.textContent=error.message;}}
 }
 function close(){clearTimeout(timer);revision++;selectionCleanup?.();selectionCleanup=null;panel?.remove();panel=null;mode=null;}
 function open(next){if(dead||next!=='teams')return;close();mode=next;panel=document.createElement('section');panel.className='qol-sandbox-editor';panel.dataset.mode=mode;panel.setAttribute('data-qol-chat-only','');selectionCleanup=preserveEditorSelection(panel);
  panel.innerHTML='<header><strong>Teams</strong><button type="button" class="button" data-close aria-label="Close editor">×</button></header>'+['p1','p2'].map(side=>'<label>'+escPlayer(side)+'<textarea class="textbox" data-paste="'+side+'" aria-label="'+side.toUpperCase()+' team paste" spellcheck="false"></textarea></label>').join('')+'<div class="message-error" role="status" data-editor-message></div><button class="button" type="button" data-apply disabled>Apply</button>';
  for(const side of ['p1','p2'])panel.querySelector('[data-paste='+side+']').value=s.sandbox?.sides.find(team=>team.id===side)?.paste||'';
  const host=room.battle?.scene?.log?.innerElem||root.querySelector('.battle-log .inner')||root.querySelector('.battle-log')||root;host.append(panel);room.showChat?.();panel.scrollIntoView?.({block:'nearest'});
  // ConsoleRoom delegates textarea keys to its chat submit/history handlers.
  // Keep editor keys local while allowing ordinary multiline text editing.
  for(const name of ['keydown','keyup','keypress','focusin','focusout'])panel.addEventListener(name,event=>{if(event.target.tagName==='TEXTAREA')event.stopPropagation();});
  panel.addEventListener('input',event=>{event.stopPropagation();schedule();});panel.addEventListener('click',async event=>{event.stopPropagation();if(event.target.closest('[data-close]')){close();return;}const button=event.target.closest('[data-apply]');if(!button||button.disabled)return;const current=panel,edit={type:'edit',kind:'teams',pastes:data()};button.disabled=true;clearTimeout(timer);++revision;
   try{await s.rpc('act',edit);if(panel===current){panel.querySelector('[data-editor-message]').textContent='';schedule();}}
   catch(error){if(panel===current)panel.querySelector('[data-editor-message]').textContent=error.message;}
  });schedule();
 }
 toolbar.addEventListener('click',event=>{const button=event.target.closest('[data-sandbox-editor]');if(button){event.preventDefault();event.stopPropagation();open(button.dataset.sandboxEditor);}});window.addEventListener('resize',layout);window.visualViewport?.addEventListener('resize',layout);layout();
 return {open,layout,destroy(){dead=true;close();window.removeEventListener('resize',layout);window.visualViewport?.removeEventListener('resize',layout);toolbar.remove();style.remove();}};
}
// Bench Pokémon may not have revealed their nicknames in the public protocol.
// Reconcile a manually edited roster from the authoritative sandbox snapshot.
function syncSandboxRoster(battle,snapshot){
 if(!snapshot?.sides||!battle?.scene)return;
 const scene=battle.scene,animating=scene.animating,speciesClause=battle.speciesClause;scene.animating=false;battle.speciesClause=false;
 try{for(const team of snapshot.sides){
  const side=battle[team.id];if(typeof side?.addPokemon!=='function')continue;
  const active=side.active.slice(),previous=side.pokemon.slice(),used=new Set(),roster=[];
  side.totalPokemon=team.pokemon.length;
  for(const info of team.pokemon){
   const details=info.details||info.species+(info.set.level&&info.set.level!==100?', L'+info.set.level:'')+(info.set.gender&&info.set.gender!=='N'?', '+info.set.gender:'')+(info.set.shiny?', shiny':'');
   const ident=team.id+': '+info.name,available=p=>p&&!used.has(p)&&!active.includes(p);
   let mon=info.active?active[info.activeSlot]:previous.find(p=>available(p)&&p.qolTeamSlot===info.teamSlot);
   mon||=previous.find(p=>available(p)&&p.ident===ident&&p.speciesForme===info.species);
   mon||=previous.find(p=>available(p)&&!p.ident&&p.speciesForme===info.species);
   mon||=previous.find(available);
   if(!mon)mon=side.addPokemon(info.name,ident,details);
   used.add(mon);roster.push(mon);mon.qolTeamSlot=info.teamSlot;
   battle.parseDetails?.(info.name,ident,details,mon);
   mon.name=info.name;mon.ident=ident;mon.details=details;mon.searchid=ident+'|'+details;mon.speciesForme=info.species;
   mon.hp=info.hp;mon.maxhp=info.maxhp;mon.fainted=!info.hp;mon.status=info.status;mon.boosts={...info.boosts};
   mon.item=battle.dex.items.get(info.item??info.set.item??'').name||'';mon.itemEffect='';
   mon.ability=battle.dex.abilities.get(info.ability??info.set.ability??'').name||'';
   mon.baseAbility=battle.dex.abilities.get(info.baseAbility??info.set.ability??'').name||'';
   mon.teraType=snapshot.teraAllowed===false?'':info.teraType||info.set.teraType||'';mon.terastallized=snapshot.teraAllowed===false?'':info.terastallized||'';
   if(info.active){mon.slot=info.activeSlot;
    if((info.item??'')==='airballoon'&&!snapshot.pseudoWeather?.includes('gravity'))mon.addVolatile?.('airballoon');else mon.removeVolatile?.('airballoon');
   }
  }
  side.pokemon=roster.sort((a,b)=>a.qolTeamSlot-b.qolTeamSlot);
  if(side.lastPokemon&&!used.has(side.lastPokemon))side.lastPokemon=null;
 }}finally{battle.speciesClause=speciesClause;scene.animating=true;for(const team of snapshot.sides){const side=battle[team.id];if(side){scene.updateSidebar?.(side);for(const active of side.active||[])if(active)scene.resetStatbar?.(active);}}scene.updateStatbars?.();if(battle.turn===0&&battle.stepQueue?.some(line=>line.startsWith("|teampreview")))scene.teamPreview?.();scene.animating=animating;}
}
// Keep the native choice DOM while the battlefield animates. The room's normal
// animation branch replaces it with replay controls; this local room already
// owns both requests and can retain the choice surface until the next is ready.
function keepLocalControls(s,room,battle,ready){
 const update=room.updateControls,add=room.add,next=battle.nextStep,controls=room.$controls;
 const html=controls?.html,disabled=new Map();let dead=false,flushing=false,receiving=0;
 function sync(){
  const live=s.requests?.[s.activeSide],shown=room.request;
  const stale=!battle.atQueueEnd&&(!shown||shown.rqid!==live?.rqid||shown.side?.id!==s.activeSide);
  const host=room.el?.querySelector('.battle-controls');
  if(!host)return;
  if(stale){for(const button of host.querySelectorAll('button[name^="choose"],button[name="undoChoice"],button[name="clearChoice"]')){if(!disabled.has(button))disabled.set(button,button.disabled);button.disabled=true;}}
  else{for(const [button,value]of disabled)if(button.isConnected)button.disabled=value;disabled.clear();}
 }
 const updateWrapper=function(...args){
  if(dead)return update?.apply(this,args);
  if(battle.seeking!==null||!battle.atQueueEnd){sync();return update?.apply(this,args);}
  if(!flushing){const old=room.request;flushing=true;try{ready();}finally{flushing=false;}if(old!==room.request){sync();return;}}
  sync();return update?.apply(this,args);
 };
 const addWrapper=function(...args){receiving++;try{return add.apply(this,args);}finally{receiving--;sync();}};
 const htmlWrapper=function(...args){if(receiving&&args[0]==='')return this;return html.apply(this,args);};
 if(update)room.updateControls=updateWrapper;
 if(add)room.add=addWrapper;
 // Let native receive/update controls clear and rebuild playback buttons.
 // End an otherwise open message section through Showdown's own delayed fade.
 // This runs after the final effect's animations finish, before queue-end is
 // published, so the next edit starts a fresh message section naturally.
 const nextWrapper=function(...args){
  const scene=this.scene;
  if(!dead&&!this.atQueueEnd&&this.currentStep>=this.stepQueue.length&&scene?.messagebarOpen&&this.seeking===null&&this.shouldStep?.()!==false){
   scene.startAnimations?.();scene.closeMessagebar();const animation=scene.finishAnimations?.(),interruption=scene.interruptionCount;
   if(animation?.done){animation.done(()=>{if(!dead&&interruption===scene.interruptionCount)next.apply(battle,args);});return;}
  }
  return next.apply(this,args);
 };
 if(next)battle.nextStep=nextWrapper;
 return {sync,destroy(){dead=true;for(const [button,value]of disabled)if(button.isConnected)button.disabled=value;disabled.clear();if(room.updateControls===updateWrapper)room.updateControls=update;if(room.add===addWrapper)room.add=add;if(controls?.html===htmlWrapper)controls.html=html;if(battle.nextStep===nextWrapper)battle.nextStep=next;}};
}

// Shared native-effect choreography, also used by the standalone preview.
function renderNuclearBurst(scene,d){
 const fx=(name,start,end,easing='decel',after)=>scene.showEffect(name,{...d,...start},{...d,...end},easing,after);
 scene.backgroundEffect('#080d22',2750,.55,0);
 // Only Photon Geyser's light expanding on the target; no charge/projectile.
 fx('electroball',{y:d.y-60,scale:0,xscale:0,opacity:.5,time:180},{y:d.y-60,scale:3,xscale:18,opacity:.35,time:2650},'decel','fade');
 fx('wisp',{y:d.y+350,scale:8,xscale:0,yscale:13,opacity:.9,time:180},{y:d.y+350,scale:8,xscale:7,yscale:15,opacity:.35,time:2650},'decel','fade');
 fx('wisp',{y:d.y-30,scale:2,opacity:1,time:180},{y:d.y-30,scale:10,opacity:.4,time:2650},'decel','explode');
 // Staggered Explosion fireballs, old hot flares, and Blue Flare sprites.
 for(let wave=0;wave<10;wave++)for(let j=0;j<8;j++){
  const angle=j*Math.PI/4+wave*.77,radius=30+wave*9;
  const x=d.x+Math.cos(angle)*radius,y=d.y+Math.sin(angle)*radius*.68;
  const begin=320+wave*210+j*22;
  const name=j%3===0?'bluefireball':j%3===1?'fireball':'flareball';
  fx(name,{x,y,scale:0,opacity:j%3===0?.85:.7,time:begin},{x:x+Math.cos(angle)*45,y:y+Math.sin(angle)*35,scale:name==='fireball'?6:3.6,opacity:0,time:Math.min(3000,begin+750)});
 }
 fx('wisp',{scale:0,opacity:.9,time:2050},{scale:9,opacity:0,time:2900});
 scene.backgroundEffect('#fff6e5',350,.7,2350);
 fx('fireball',{scale:0,opacity:.9,time:2350},{scale:11,opacity:0,time:3000});
 fx('bluefireball',{scale:0,opacity:.65,time:2400},{scale:7,opacity:0,time:2950});
}

// Per-battle data and animation: official rooms and the global move dex are untouched.
function installSandboxNuclearBattle(room){
 const battle=room.battle,scene=battle.scene,originalAnim=scene.runMoveAnim,originalStop=scene.stopAnimation;
 const data={num:-10001,name:'Nuclear Bomb',basePower:1000,accuracy:100,category:'Special',pp:64,noPPBoosts:true,priority:7,type:'Fire',target:'normal',flags:{protect:1,mirror:1},gen:1,shortDesc:'Sandbox only. Displayed as Fire; resolves as Fairy, always super effective (2x), 64 PP.'};
 const move=new window.Move('nuclearbomb','Nuclear Bomb',data);
 let originalDex=null,dex=null;
 function refreshDex(){
  if(battle.dex===dex)return;
  originalDex=battle.dex;
  const moves=new Proxy(originalDex.moves,{get(target,key){if(key==='get')return value=>String(value?.id||value).toLowerCase().replace(/[^a-z0-9]/g,'')==='nuclearbomb'?move:target.get(value);const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
  dex=Object.create(originalDex);Object.defineProperty(dex,'moves',{value:moves});battle.dex=dex;
 }
 refreshDex();

 const anim=function(id,participants){
  if(id!=='nuclearbomb')return originalAnim.call(this,id,participants);
  if(!this.animating||this.acceleration>=3)return;
  const attacker=participants?.[0]?.sprite,defender=(participants?.[1]||participants?.[0])?.sprite;
  if(!attacker||!defender)return;
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // Keep the final effects in a native DOM effect layer outside $fx: the
  // protocol resumes at impact (2.4s), while these particles finish at 3s.
  const layer=window.$('<div class="qol-nuclear-fx" aria-hidden="true" style="position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:4"></div>');
  this.$battle.append(layer);
  const scene=this,priorAnimations=this.activeAnimations;
  const facade={showEffect(...args){const el=scene.showEffect(...args);el.addClass('qol-nuclear-particle').appendTo(layer);return el;},backgroundEffect(...args){scene.backgroundEffect(...args);}};
  if(reduced)facade.showEffect('mistball',{x:defender.x,y:defender.y,z:defender.z,scale:2,opacity:.4},{x:defender.x,y:defender.y,z:defender.z,scale:2,opacity:0,time:500},'linear');
  else renderNuclearBurst(facade,{x:defender.x,y:defender.y,z:defender.z});
  // showEffect registers every particle by default. Only the impact clock
  // blocks protocol playback; HP/damage is handled by the normal next step.
  this.activeAnimations=priorAnimations;
  const clock=window.$('<div style="position:absolute;pointer-events:none"></div>');
  this.$fx.append(clock);clock.animate({opacity:.999},reduced?500:2400);this.waitFor(clock);
  layer.animate({opacity:1},reduced?500:3000).promise().done(()=>queueMicrotask(()=>layer.remove()));

 };
 const stop=function(...args){const value=originalStop.apply(this,args);this.$battle.find('.qol-nuclear-fx').remove();return value;};
 scene.stopAnimation=stop;
 scene.runMoveAnim=anim;
 return {refreshDex,destroy(){scene.$battle?.find('.qol-nuclear-fx').find(':animated').finish();scene.$battle?.find('.qol-nuclear-fx').remove();if(scene.stopAnimation===stop)scene.stopAnimation=originalStop;scene.$bgEffect?.find('.qol-nuclear-bg').finish().remove();if(scene.runMoveAnim===anim)scene.runMoveAnim=originalAnim;if(battle.dex===dex)battle.dex=originalDex;}};
}

function instantLocalSetEdits(battle){
 const run=battle.run;
 const wrapper=function(line,...args){
  if(line?.startsWith('|-sethp|')&&line.includes('|[qolinstant]')){const scene=this.scene,heal=scene.healAnim,damage=scene.damageAnim;scene.healAnim=scene.damageAnim=pokemon=>scene.updateStatbar?.(pokemon);try{return run.call(this,line,...args);}finally{scene.healAnim=heal;scene.damageAnim=damage;}}
  if(line?.includes('|[qolinstant]')&&/^\|-(?:enditem|item)\|/.test(line)){
   const parts=line.split('|'),pokemon=this.getPokemon(parts[2]);if(!pokemon)return;
   const item=parts[1]==='-item'?this.dex.items.get(parts[3]):null;
   pokemon.item=item?.name||'';pokemon.itemEffect='';pokemon.prevItem='';pokemon.prevItemEffect='';
   pokemon.removeVolatile('itemremoved');pokemon.removeVolatile('airballoon');
   if(item?.id==='airballoon')pokemon.addVolatile('airballoon');
   this.scene.updateStatbar?.(pokemon);return;
  }

  if(!line?.startsWith('|detailschange|')||!line.includes('|[qolinstant]'))return run.call(this,line,...args);
  const scene=this.scene,transform=scene.animTransform;
  scene.animTransform=function(pokemon){const sprite=pokemon.sprite;if(!sprite?.$el||!window.Dex?.getSpriteData)return;const sp=window.Dex.getSpriteData(pokemon,sprite.isFrontSprite,{gen:scene.gen,mod:scene.mod});if(sprite.sp?.url!==sp.url){sprite.sp=sp;if(!pokemon.volatiles?.dynamax)sprite.oldsp=null;sprite.cryurl=sp.cryurl;sprite.$el.attr('src',sp.url);if(scene.pos)sprite.$el.css(scene.pos({x:sprite.x,y:sprite.y,z:sprite.z,opacity:1,display:'block'},sp));}scene.updateStatbar?.(pokemon);};
  try{return run.call(this,line,...args);}finally{scene.animTransform=transform;}
 };
 battle.run=wrapper;
 return {destroy(){if(battle.run===wrapper)battle.run=run;}};
}
function identifyLocalBench(battle,snapshot){
 for(const team of snapshot?.sides||[]){const side=battle?.[team.id];if(!side)continue;const used=new Set();
  for(const info of team.pokemon){if(info.activeSlot>=0)continue;const ident=team.id+': '+info.name;let mon=side.pokemon.find(p=>p.ident===ident);if(!mon)mon=side.pokemon.find(p=>!used.has(p)&&!side.active.includes(p)&&!p.ident&&p.speciesForme===info.species);if(!mon)continue;used.add(mon);mon.name=info.name;mon.ident=ident;mon.searchid=ident+'|'+mon.details;}
 }
}

// Data-only multiplayer protocol. No payload is evaluated as code or passed to
// the application command dispatcher. Engine mutations stay in its Worker.
const FC_VERSION='22.9.0',FC_PREFIX='[QOL-FC1]',FC_PREF='qol-fakechallenges-disabled';
function fcFormat(value){
 let text=String(value||'').trim();
 if(!text||text.length>12000||/[\r\n|\x00]/.test(text))throw Error('Enter a valid challenge code.');
 text=text.replace(/^\/(?:challenge|chall|chal)\s+/i,'');
 const at=text.indexOf('@@@'),left=(at<0?text:text.slice(0,at)).trim();
 const base=left.slice(left.lastIndexOf(',')+1).trim();
 const resolved=resolveFormatKey(base)||base;
 if(!base||base.startsWith('/'))throw Error('Include a format in the challenge code.');
 return resolved+(at<0?'':'@@@'+text.slice(at+3).trim());
}
const fcId=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const fcNonce=()=>Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(36)).join('');
function fcString(value,max=60000){if(typeof value!=='string'||value.length>max||/[\x00\r\n|]/.test(value))throw Error('Invalid shared-battle text.');return value;}
function fcPacked(value){if(typeof value!=='string'||!value.length||value.length>60000||/[\x00\r\n]/.test(value))throw Error('Invalid shared team.');return value;}
function fcOperation(input,side){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid shared action.');
 const method=input.method;
 if(method==='chat')return {method,text:fcString(input.text,300)};
 if(method==='rewind')return {method};
 if(method!=='act')throw Error('That action is not available in shared battles.');
 const e=input.entry;if(!e||typeof e!=='object'||Array.isArray(e))throw Error('Invalid shared action.');
 if(['choose','undo','forfeit'].includes(e.type)){
  if(e.side!==side)throw Error('You can only choose for your own side.');
  if(e.type==='choose'){const choice=fcString(e.choice,500);if(!/^(?:team\s+[\d, ]+|(?:move|switch|pass|shift)\b[^\r\n]*)$/.test(choice))throw Error('Invalid choice.');return {method,entry:{type:'choose',side,choice}};}
  return {method,entry:{type:e.type,side}};
 }
 if(e.type==='rng'){
  const r=e.rule;if(!r||!['p1','p2'].includes(r.side)||!['roll','crit','accuracy','secondary','speed','hits','confusion'].includes(r.kind))throw Error('Invalid RNG action.');
  const rule={side:r.side,kind:r.kind,value:r.value,persistent:!!r.persistent};
  for(const key of ['pokemon','move','target'])if(r[key]!==undefined)rule[key]=fcString(r[key],80);
  if(r.effect!==undefined){if(!Number.isInteger(r.effect)||r.effect<0||r.effect>23)throw Error('Invalid secondary effect.');rule.effect=r.effect;}
  if(['roll','hits'].includes(r.kind)?!Number.isInteger(r.value):typeof r.value!=='boolean')throw Error('Invalid RNG outcome.');return {method,entry:{type:'rng',rule}};
 }
 if(e.type==='unrng'){
  if(!['p1','p2'].includes(e.side)||!['roll','crit','accuracy','secondary','speed','hits','confusion'].includes(e.kind))throw Error('Invalid RNG action.');
  const entry={type:e.type,side:e.side,kind:e.kind};for(const key of ['pokemon','move','target'])if(e[key]!==undefined)entry[key]=fcString(e[key],80);if(e.effect!==undefined){if(!Number.isInteger(e.effect)||e.effect<0||e.effect>23)throw Error('Invalid effect.');entry.effect=e.effect;}return {method,entry};
 }
 if(e.type!=='edit')throw Error('Unsupported shared action.');
 if(e.kind==='command'){const text=fcString(e.text,250);if(!/^\/set(?:\s|$)/i.test(text)||e.side!==side)throw Error('Invalid sandbox command.');return {method,entry:{type:'edit',kind:'command',side,text}};}
 if(e.kind==='teams'){const pastes={};for(const key of ['p1','p2']){const text=e.pastes?.[key];if(typeof text!=='string'||text.length>100000||/[\x00|]/.test(text))throw Error('Invalid team paste.');pastes[key]=text;}return {method,entry:{type:'edit',kind:'teams',pastes}};}
 if(['weather','terrain'].includes(e.kind))return {method,entry:{type:'edit',kind:e.kind,value:fcString(e.value,30)}};
 if(e.kind==='pseudo'&&typeof e.enabled==='boolean')return {method,entry:{type:'edit',kind:'pseudo',value:fcString(e.value,30),enabled:e.enabled}};
 if(e.kind==='condition'&&['p1','p2'].includes(e.side)&&Number.isInteger(e.layers)&&e.layers>=0&&e.layers<=3)return {method,entry:{type:'edit',kind:'condition',side:e.side,value:fcString(e.value,30),layers:e.layers}};
 throw Error('Unsupported shared editor.');
}
function fcRequestKey(s,side){const request=s.requests[side];if(!request)return '';const {rqid,requestType,update,...rest}=request;return JSON.stringify({turn:s.turn,request:rest});}
async function fcHash(result){if(!result?.sandbox)return '';const data=new TextEncoder().encode(JSON.stringify({turn:result.turn,ended:result.ended,sandbox:result.sandbox}));return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),n=>n.toString(16).padStart(2,'0')).join('');}
async function fcEncode(data){const bytes=new Uint8Array(await new Response(new Blob([JSON.stringify(data)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());if(bytes.length>65536)throw Error('Shared update is too large.');let text='';for(const n of bytes)text+=String.fromCharCode(n);return btoa(text);}
async function fcDecode(text){if(text.length>90000||!/^[A-Za-z0-9+/=]+$/.test(text))throw Error('Invalid shared packet.');const bytes=Uint8Array.from(atob(text),c=>c.charCodeAt(0)),reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();let total=0,parts=[];try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>260000){await reader.cancel();throw Error('Shared packet is too large.');}parts.push(value);}}finally{reader.releaseLock();}const all=new Uint8Array(total);let offset=0;for(const part of parts){all.set(part,offset);offset+=part.length;}return JSON.parse(new TextDecoder().decode(all));}
// Adapted from smogon/pokemon-showdown server/room-battle.ts (MIT).
function createNativeSharedTimer(s,emit,act){
 const Dex={formats:{get:()=>({gameType:s.cfg.gameType||'singles'}),getRuleTable:()=>({timer:s.cfg.timerSettings?[s.cfg.timerSettings]:undefined})}};
 const TICK_TIME = 5;
const SECONDS = 1000;
const STARTING_TIME = 150;
const MAX_TURN_TIME = 150;
const STARTING_TIME_CHALLENGE = 300;
const STARTING_GRACE_TIME = 60;
const MAX_TURN_TIME_CHALLENGE = 300;
const DISCONNECTION_TIME = 60;
const DISCONNECTION_BANK_TIME = 300;
const TIMER_COOLDOWN = 20 * SECONDS;
const LOCKDOWN_PERIOD = 30 * 60 * 1000;
class RoomBattleTimer {
    battle;
    timerRequesters = new Set();
    timer = null;
    isFirstRequest = true;
    turn = null;
    lastTick = 0;
    debug = false;
    lastDisabledTime = 0;
    lastDisabledByUser = null;
    settings;
    constructor(battle){
        this.battle = battle;
        const format = Dex.formats.get(battle.format, true);
        const hasLongTurns = format.gameType !== 'singles';
        const isChallenge = battle.challengeType === 'challenge';
        const ruleTable = Dex.formats.getRuleTable(format);
        const timerSettings = ruleTable.timer?.[0];
        for(const k in timerSettings){
            if (timerSettings[k] === undefined) delete timerSettings[k];
        }
        this.settings = {
            dcTimer: !isChallenge,
            dcTimerBank: isChallenge,
            starting: isChallenge ? STARTING_TIME_CHALLENGE : STARTING_TIME,
            grace: STARTING_GRACE_TIME,
            addPerTurn: hasLongTurns ? 25 : 10,
            maxPerTurn: isChallenge ? MAX_TURN_TIME_CHALLENGE : MAX_TURN_TIME,
            maxFirstTurn: isChallenge ? MAX_TURN_TIME_CHALLENGE : MAX_TURN_TIME,
            timeoutAutoChoose: false,
            accelerate: !timerSettings && !isChallenge,
            ...timerSettings
        };
        if (this.settings.maxPerTurn <= 0) this.settings.maxPerTurn = Infinity;
        for (const player of this.battle.players){
            player.secondsLeft = this.settings.starting + this.settings.grace;
            player.turnSecondsLeft = player.secondsLeft;
            player.dcSecondsLeft = this.settings.dcTimerBank ? DISCONNECTION_BANK_TIME : DISCONNECTION_TIME;
        }
    }
    start(requester) {
        const userid = requester ? requester.id : 'staff';
        if (this.timerRequesters.has(userid)) return false;
        if (this.battle.ended) {
            requester?.sendTo(this.battle.roomid, `|inactiveoff|The timer can't be enabled after a battle has ended.`);
            return false;
        }
        if (this.timerRequesters.size) {
            this.battle.room.add(`|inactive|${requester ? requester.name : userid} also wants the timer to be on.`).update();
            this.timerRequesters.add(userid);
            return false;
        }
        if (requester && this.battle.playerTable[requester.id] && this.lastDisabledByUser === requester.id) {
            const remainingCooldownMs = (this.lastDisabledTime || 0) + TIMER_COOLDOWN - Date.now();
            if (remainingCooldownMs > 0) {
                this.battle.playerTable[requester.id].sendRoom(`|inactiveoff|The timer can't be re-enabled so soon after disabling it (${Math.ceil(remainingCooldownMs / SECONDS)} seconds remaining).`);
                return false;
            }
        }
        this.timerRequesters.add(userid);
        const requestedBy = requester ? ` (requested by ${requester.name})` : ``;
        this.battle.room.add(`|inactive|Battle timer is ON: inactive players will automatically lose when time's up.${requestedBy}`).update();
        this.checkActivity();
        for (const player of this.battle.players)this.nextRequest(player);
        return true;
    }
    stop(requester) {
        if (requester) {
            if (!this.timerRequesters.has(requester.id)) return false;
            this.timerRequesters.delete(requester.id);
            this.lastDisabledByUser = requester.id;
            this.lastDisabledTime = Date.now();
        } else {
            this.timerRequesters.clear();
        }
        if (this.timerRequesters.size) {
            this.battle.room.add(`|inactive|${requester.name} no longer wants the timer on, but the timer is staying on because ${[
                ...this.timerRequesters
            ].join(', ')} still does.`).update();
            return false;
        }
        if (this.end()) {
            this.battle.room.add(`|inactiveoff|Battle timer is now OFF.`).update();
            return true;
        }
        return false;
    }
    end() {
        this.timerRequesters.clear();
        if (!this.timer) return false;
        clearTimeout(this.timer);
        this.timer = null;
        return true;
    }
    updateTurn() {
        if (this.turn === null) {
            this.turn = this.battle.turn;
            return;
        }
        if (this.battle.turn <= this.turn) {
            if (this.battle.players.filter((p)=>!p.request.isWait).length <= 1) {
                this.isFirstRequest = false;
                const addPerMidTurnRequest = Math.min(this.settings.addPerTurn, TICK_TIME);
                for (const curPlayer of this.battle.players){
                    curPlayer.secondsLeft += addPerMidTurnRequest;
                }
            } else {}
            return;
        }
        this.turn = this.battle.turn;
        this.isFirstRequest = false;
        let addPerTurn = this.settings.addPerTurn;
        if (this.settings.accelerate && addPerTurn) {
            if (this.turn > 100 && addPerTurn > TICK_TIME) {
                addPerTurn -= TICK_TIME;
            }
            if (this.turn > 200 && Math.floor(this.battle.requestCount / 2) % 2) {
                addPerTurn = 0;
            }
        }
        for (const player of this.battle.players){
            player.secondsLeft = Math.min(player.secondsLeft + addPerTurn, this.settings.starting);
        }
    }
    nextRequest(player) {
        if (player.secondsLeft <= 0) return;
        if (player.request.isWait) {
            player.turnSecondsLeft = this.settings.maxPerTurn;
            return;
        }
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (this.battle.ended || !this.timerRequesters.size) return;
        if (this.battle.players.filter((p)=>p.secondsLeft > 0).length <= 1) return;
        const room = this.battle.room;
        this.updateTurn();
        const maxTurnTime = (this.isFirstRequest ? this.settings.maxFirstTurn : 0) || this.settings.maxPerTurn;
        player.turnSecondsLeft = Math.min(player.secondsLeft, maxTurnTime);
        const secondsLeft = player.turnSecondsLeft;
        let grace = player.secondsLeft - this.settings.starting;
        if (grace < 0) grace = 0;
        player.sendRoom(`|inactive|Time left: ${secondsLeft} sec this turn | ${player.secondsLeft - grace} sec total` + (grace ? ` | ${grace} sec grace` : ``));
        if (secondsLeft <= 30 && secondsLeft < this.settings.starting) {
            room.add(`|inactive|${player.name} has ${secondsLeft} seconds left this turn.`);
        }
        if (this.debug) {
            room.add(`||${player.name} | Time left: ${secondsLeft} sec this turn | ${player.secondsLeft} sec total`);
        }
        room.update();
        this.lastTick = Date.now();
        this.timer = setTimeout(()=>this.nextTick(), TICK_TIME * SECONDS);
    }
    nextTick() {
        if (this.timer) clearTimeout(this.timer);
        if (this.battle.ended || !this.timerRequesters.size) return;
        if (this.battle.players.every((p)=>p.request.isWait === 'cantUndo')) return;
        const room = this.battle.room;
        for (const player of this.battle.players){
            if (player.request.isWait) continue;
            if (player.knownActive) {
                player.secondsLeft -= TICK_TIME;
                player.turnSecondsLeft -= TICK_TIME;
            } else {
                player.dcSecondsLeft -= TICK_TIME;
                if (!this.settings.dcTimerBank) {
                    player.secondsLeft -= TICK_TIME;
                    player.turnSecondsLeft -= TICK_TIME;
                }
            }
            const dcSecondsLeft = player.dcSecondsLeft;
            if (dcSecondsLeft <= 0) {
                player.turnSecondsLeft = 0;
            }
            const secondsLeft = player.turnSecondsLeft;
            if (!secondsLeft) continue;
            if (!player.knownActive && (dcSecondsLeft <= secondsLeft || this.settings.dcTimerBank)) {
                if (dcSecondsLeft % 30 === 0 || dcSecondsLeft <= 20) {
                    room.add(`|inactive|${player.name} has ${dcSecondsLeft} seconds to reconnect!`);
                }
            } else {
                if (secondsLeft % 30 === 0 || secondsLeft <= 20) {
                    room.add(`|inactive|${player.name} has ${secondsLeft} seconds left.`);
                }
            }
            if (this.debug) {
                room.add(`||[${player.name} has ${player.turnSecondsLeft}s this turn / ${player.secondsLeft}s total]`);
            }
        }
        room.update();
        if (!this.checkTimeout()) {
            this.timer = setTimeout(()=>this.nextTick(), TICK_TIME * 1000);
        }
    }
    checkActivity() {
        if (this.battle.ended) return;
        for (const player of this.battle.players){
            const isActive = !!player.active;
            if (isActive === player.knownActive) continue;
            if (!isActive) {
                player.knownActive = false;
                if (!this.settings.dcTimerBank) {
                    if (this.settings.dcTimer) {
                        player.dcSecondsLeft = DISCONNECTION_TIME;
                    } else {
                        player.dcSecondsLeft = DISCONNECTION_TIME * 10;
                    }
                }
                if (this.timerRequesters.size) {
                    let msg = `!`;
                    if (this.settings.dcTimer) {
                        msg = ` and has a minute to reconnect!`;
                    }
                    if (this.settings.dcTimerBank) {
                        if (player.dcSecondsLeft > 0) {
                            msg = ` and has ${player.dcSecondsLeft} seconds to reconnect!`;
                        } else {
                            msg = ` and has no disconnection time left!`;
                        }
                    }
                    this.battle.room.add(`|inactive|${player.name} disconnected${msg}`).update();
                }
            } else {
                player.knownActive = true;
                if (this.timerRequesters.size) {
                    let timeLeft = ``;
                    if (!player.request.isWait) {
                        timeLeft = ` and has ${player.turnSecondsLeft} seconds left`;
                    }
                    this.battle.room.add(`|inactive|${player.name} reconnected${timeLeft}.`).update();
                }
            }
        }
    }
    checkTimeout() {
        const players = this.battle.players;
        if (players.every((player)=>player.turnSecondsLeft <= 0)) {
            if (!this.settings.timeoutAutoChoose || players.every((player)=>player.secondsLeft <= 0)) {
                this.battle.room.add(`|-message|All players are inactive.`).update();
                this.battle.tie();
                return true;
            }
        }
        let didSomething = false;
        for (const player of players){
            if (player.eliminated) continue;
            if (player.turnSecondsLeft > 0) continue;
            if (this.settings.timeoutAutoChoose && player.secondsLeft > 0 && player.knownActive) {
                void this.battle.stream.write(`>${player.slot} default`);
                didSomething = true;
            } else {
                this.battle.forfeitPlayer(player, ' lost due to inactivity.');
                didSomething = true;
            }
        }
        return didSomething;
    }
}

 const room={add(line){emit(line);return this;},update(){return this;}},battle={format:s.cfg.format,challengeType:'challenge',room,roomid:s.roomids[0],ended:false,turn:s.turn,requestCount:0,players:[],playerTable:{},forfeitPlayer(player){act({method:'act',entry:{type:'forfeit',side:player.slot}});},tie(){act({method:'tie'});},stream:{write(line){const side=line.slice(1,3);act({method:'timeout',side});}}};
 battle.players=['p1','p2'].map(side=>{const name=side==='p1'?s.cfg.name:s.cfg.nameB,id=fcId(name),player={slot:side,id,name,eliminated:false,active:true,knownActive:true,request:{isWait:'cantUndo'},sendRoom:line=>emit(line,side)};battle.playerTable[id]=player;return player;});
 const timer=new RoomBattleTimer(battle),keys={};
 function sync(){battle.turn=s.turn;battle.ended=s.ended;const changed=[];for(const player of battle.players){const request=s.requests[player.slot],key=fcRequestKey(s,player.slot);player.request.isWait=!request?'cantUndo':request.wait?(s.canUndo?.[player.slot]?true:'cantUndo'):false;if(request&&!request.wait&&keys[player.slot]!==key){keys[player.slot]=key;changed.push(player);}}battle.requestCount+=changed.length;if(battle.ended)timer.end();else for(const player of changed)timer.nextRequest(player);}
 sync();return {sync,end:()=>timer.end(),request(on,side){const player=battle.players.find(player=>player.slot===side);const user={id:player.id,name:player.name,sendTo:(id,line)=>emit(line,side)};return on?timer.start(user):timer.stop(user);}};
}

// Relay-only transport. No ICE/STUN discovery or peer IP addresses are exchanged.
// Set the production URL once when packaging a release; invitations cannot change it.
const FC_RELAY_URL='https://qol-battle-relay.qol-battle-relay.workers.dev';
function fcRelayEndpoint(){
 const saved=localStorage.getItem('qol-battle-relay-url')||FC_RELAY_URL;
 const url=new URL(saved||'https://relay-not-configured.invalid');
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(url.protocol==='https:'&&url.hostname.endsWith('.workers.dev')||url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)&&['127.0.0.1','localhost'].includes(location.hostname)))throw Error('Invalid battle relay address.');
 if(!saved)throw Error('The battle relay has not been configured for this release yet.');
 return url.origin.replace(/^http/,'ws');
}
function fcRelaySecret(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');}
function createRelayBattlePeer(host,receive,failed){
 let socket=null,dead=false,paired=false,serial=Promise.resolve(),readyResolve,readyReject,openedResolve,openedReject;
 const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});ready.catch(()=>{});
 const opened=new Promise((resolve,reject)=>{openedResolve=resolve;openedReject=reject;});opened.catch(()=>{});
 const pending=new Map();let timeout=null;
 function close(reason='Battle connection closed.',notify=false){if(dead)return;dead=true;paired=false;clearTimeout(timeout);pending.clear();readyReject(Error(reason));openedReject(Error(reason));try{socket?.close(1000);}catch{}if(notify)failed(reason);}
 function start(room,token,guest){
  if(socket||dead)throw Error('Connection already started.');
  socket=new WebSocket(fcRelayEndpoint()+'/v1/'+room);
  timeout=setTimeout(()=>close('The battle relay did not respond. Try again.',true),30000);
  socket.onopen=()=>socket.send(JSON.stringify({type:'auth',role:host?'host':'guest',token,...(guest?{guest}:{})}));
  socket.onclose=event=>close(event.reason||'The battle relay connection closed.',true);
  socket.onerror=()=>close('Could not connect to the battle relay.',true);
  socket.onmessage=event=>{try{
   if(typeof event.data!=='string'||event.data.length>65536)throw Error('Invalid relay packet.');
   const part=JSON.parse(event.data);
   if(part.type==='ready'){if(part.protocol!==1)throw Error('Incompatible battle relay.');clearTimeout(timeout);readyResolve();return;}
   if(part.type==='paired'){paired=true;openedResolve();return;}
   if(!paired||!/^[a-z0-9]{10,60}$/.test(part.id)||!Number.isInteger(part.i)||!Number.isInteger(part.n)||part.n<1||part.n>256||part.i<0||part.i>=part.n||typeof part.text!=='string'||part.text.length>8000)throw Error('Invalid relay packet.');
   let item=pending.get(part.id);
   if(!item){if(pending.size>=4||part.i!==0)throw Error('Invalid packet order.');item={n:part.n,parts:[],length:0};pending.set(part.id,item);}
   if(item.n!==part.n||item.parts.length!==part.i)throw Error('Invalid packet order.');
   item.parts.push(part.text);item.length+=part.text.length;if(item.length>2000000)throw Error('Battle update is too large.');
   if(item.parts.length===item.n){pending.delete(part.id);receive(JSON.parse(item.parts.join('')));}
  }catch(error){close(error.message,true);}};
 }
 async function drained(){const until=Date.now()+10000;while(socket?.bufferedAmount>262144){if(dead||Date.now()>until)throw Error('Battle connection stalled.');await new Promise(resolve=>setTimeout(resolve,20));}if(dead||socket?.readyState!==1)throw Error('Battle connection closed.');}
 return {opened,
  async offer(){const room=fcRelaySecret(),token=fcRelaySecret(),guest=fcRelaySecret();start(room,token,guest);await ready;return {type:'relay-v1',room,token:guest};},
  async answer(offer){if(!offer||offer.type!=='relay-v1'||!/^[a-f0-9]{64}$/.test(offer.room)||!/^[a-f0-9]{64}$/.test(offer.token))throw Error('Invalid relay invitation.');start(offer.room,offer.token);await opened;},
  send(packet){const result=serial.then(async()=>{await opened;const text=JSON.stringify(packet);if(text.length>2000000)throw Error('Battle update is too large.');const id=fcNonce(),n=Math.max(1,Math.ceil(text.length/8000));for(let i=0;i<n;i++){await drained();socket.send(JSON.stringify({id,i,n,text:text.slice(i*8000,(i+1)*8000)}));}});serial=result.catch(()=>{});return result;},
  close,get open(){return !dead&&paired&&socket?.readyState===1;}
 };
}


// Only the challenger runs a battle engine. The other client renders P2's
// protocol and submits choices; it never replays the engine independently.
// Stable data-only additions to protocol 3. No peer code or asset URLs are run.
const FC_FEATURES=['native-v1','host-engine-v1','relay-v1','data-v1'];
const FC_REQUIRED_FEATURES=['native-v1','host-engine-v1','relay-v1'];
function fcPeerFeatures(data,legacy=true){
 if(data.protocol!==undefined&&data.protocol!==3)throw Error('These sandbox connections use different transports.');
 const features=data.capabilities===undefined&&legacy?FC_FEATURES.slice(0,3):data.capabilities;
 if(!Array.isArray(features)||features.length>32||features.some(f=>typeof f!=='string'||!/^[a-z0-9-]{1,40}$/.test(f))||!FC_REQUIRED_FEATURES.every(f=>features.includes(f)))throw Error('These sandbox connections use different transports.');
 const required=data.requires||[];if(!Array.isArray(required)||required.length>16||required.some(f=>!FC_FEATURES.includes(f)))throw Error('This battle needs controls this client cannot represent.');
 return features;
}
function fcDataCopy(input){
 let nodes=0,bytes=0;
 function visit(value,depth){
  if(++nodes>40000||depth>20)throw Error('Shared data is too complex.');
  if(value===null||typeof value==='boolean')return value;
  if(typeof value==='number'){if(!Number.isFinite(value)||Math.abs(value)>1e15)throw Error('Invalid shared number.');return value;}
  if(typeof value==='string'){bytes+=value.length;if(value.length>100000||bytes>260000||/[\x00\r]/.test(value))throw Error('Shared text is too large.');return value;}
  if(Array.isArray(value)){if(value.length>10000)throw Error('Shared list is too large.');return value.map(v=>visit(v,depth+1));}
  if(!value||typeof value!=='object')throw Error('Invalid shared value.');
  const out={};for(const key of Object.keys(value)){if(['__proto__','constructor','prototype'].includes(key)||key.length>80)throw Error('Unsafe shared property.');if(value[key]!==undefined)out[key]=visit(value[key],depth+1);}return out;
 }
 return visit(input,0);
}
function fcSafeDefinitions(raw){
 if(raw===undefined)return undefined;
 if(!raw||raw.schema!==1||!Array.isArray(raw.moves)||raw.moves.length>256)throw Error('Invalid shared move data.');
 const types=new Set('Normal Fire Water Electric Grass Ice Fighting Poison Ground Flying Psychic Bug Rock Ghost Dragon Dark Steel Fairy Stellar'.split(' '));
 const targets=new Set('normal self adjacentAlly adjacentAllyOrSelf adjacentFoe allAdjacent allAdjacentFoes all allAllies allies allySide allyTeam foeSide scripted randomNormal any'.split(' '));
 const moves=[],seen=new Set();
 for(const m of raw.moves){
  if(!m||typeof m!=='object'||Object.keys(m).some(k=>!['id','name','type','category','basePower','accuracy','pp','priority','target','shortDesc','noPPBoosts'].includes(k)))throw Error('Unsupported shared move field.');
  if(typeof m.id!=='string'||!/^[a-z0-9]{1,80}$/.test(m.id)||['constructor','prototype'].includes(m.id)||seen.has(m.id))throw Error('Invalid shared move ID.');seen.add(m.id);
  if(typeof m.name!=='string'||m.name.length>80||/[<>\x00-\x1f|]/.test(m.name)||fcId(m.name)!==m.id||!types.has(m.type)||!['Physical','Special','Status'].includes(m.category)||!targets.has(m.target))throw Error('Invalid shared move description.');
  for(const [key,min,max]of [['basePower',0,100000],['pp',1,1000],['priority',-20,20]])if(!Number.isInteger(m[key])||m[key]<min||m[key]>max)throw Error('Invalid shared move value.');
  if(m.accuracy!==true&&(!Number.isFinite(m.accuracy)||m.accuracy<0||m.accuracy>100))throw Error('Invalid shared accuracy.');
  if(m.shortDesc!==undefined&&(typeof m.shortDesc!=='string'||m.shortDesc.length>500||/[<>\x00-\x1f]/.test(m.shortDesc)))throw Error('Invalid shared move text.');
  moves.push({id:m.id,name:m.name,type:m.type,category:m.category,basePower:m.basePower,accuracy:m.accuracy,pp:m.pp,priority:m.priority,target:m.target,noPPBoosts:!!m.noPPBoosts,shortDesc:m.shortDesc||''});
 }
 return {schema:1,moves};
}
function fcSafeState(raw){
 const value=fcDataCopy(raw);
 if(!value||!value.frames||!value.requests||!Array.isArray(value.frames.p2)||!Number.isInteger(value.turn)||value.turn<0||value.turn>100000||typeof value.ended!=='boolean'||!value.sandbox||!Array.isArray(value.sandbox.sides)||value.sandbox.sides.length!==2)throw Error('Invalid shared battle state.');
 // Application-control and raw HTML messages never belong in a battle stream.
 const blocked=new Set('init deinit noinit title eval js html raw uhtml uhtmlchange pagehtml selector location queryresponse formats popup challstr updateuser updatesearch updatechallenges pm refresh tempnotify tempnotifyoff notification fieldhtml controlshtml c c: chat chatmsg chatmsg-raw'.split(' '));
 value.frames={p1:[],p2:value.frames.p2.filter(line=>{
  if(typeof line!=='string'||line.length>60000||/[\r\n\x00]/.test(line)||line[0]!=='|')throw Error('Invalid shared battle line.');
  const command=line.split('|',3)[1];if(blocked.has(command)||command.includes('html')||!/^-?[a-zA-Z0-9:]*$/.test(command))throw Error('Unsafe shared battle message.');
  if(command==='player'){const avatar=line.split('|')[4]||'';if(!/^[a-zA-Z0-9-]{0,80}$/.test(avatar))throw Error('Unsafe shared avatar.');}
  return command!=='request';
 })};
 const request=value.requests.p2;
 if(request!==null&&request!==undefined){
  if(!request||typeof request!=='object'||Array.isArray(request)||(!request.wait&&(!request.side||request.side.id!=='p2'))||(request.side&&(!Array.isArray(request.side.pokemon)||request.side.pokemon.length>64)))throw Error('Invalid shared choice request.');
  if(request.active!==undefined&&(!Array.isArray(request.active)||request.active.length>8||request.active.some(a=>a&&(!Array.isArray(a.moves)||a.moves.length>64))))throw Error('Unsupported shared choice controls.');
 }
 value.requests={p1:null,p2:request||null};value.history=[];delete value.cfg;
 if(value.definitions!==undefined)value.definitions=fcSafeDefinitions(value.definitions);
 for(const side of value.sandbox.sides)if(!side||!['p1','p2'].includes(side.id)||!Array.isArray(side.pokemon)||side.pokemon.length>64)throw Error('Invalid shared roster.');
 return value;
}
function installSharedBattleData(room,definitions){
 const battle=room.battle,cache=new Map();let previous,dex;
 function refreshDex(){
  if(battle.dex===dex)return;
  previous=battle.dex;
  const moves=new Proxy(previous.moves,{get(target,key){if(key==='get')return value=>{const id=fcId(value?.id||value),data=definitions.get(id);if(!data)return target.get(value);const cached=cache.get(id);if(cached?.data===data)return cached.move;const base=target.get(id),move=new window.Move(id,data.name,{...base,...data,exists:true});cache.set(id,{data,move});return move;};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
  cache.clear();dex=Object.create(previous);Object.defineProperty(dex,'moves',{value:moves});battle.dex=dex;
 }
 refreshDex();return {refreshDex,isCurrent(){return battle.dex===dex;},destroy(){cache.clear();if(battle.dex===dex)battle.dex=previous;}};
}

function createFakeChallengeLink(state,s,wire,fail){
 const side=state.host?'p1':'p2',base=s.rpc.bind(s),baseStop=s.stop.bind(s),pending=new Map();
 let chain=Promise.resolve(),seq=0,dead=false,ready=false,queuedQueries=0;
 const processed=new Map();
 function complete(id,value,error){const item=pending.get(id);if(!item)return;clearTimeout(item.timer);pending.delete(id);error?item.reject(Error(error)):item.resolve(value);}
 function stop(reason='',notify=true){reason=String(reason).replace(/[\x00\r\n|]/g,' ').slice(0,180);if(dead)return;dead=true;ready=false;clock?.end();const closing=notify?wire({kind:'bye',reason:reason.slice(0,180)}).catch(()=>{}):Promise.resolve();for(const [id]of pending)complete(id,null,reason||'Battle closed.');baseStop();closing.finally(()=>fail(reason));}
 const sentDefinitions=new Map();
 function project(result){const out={...result,frames:{p1:[],p2:result.frames.p2},requests:{p1:null,p2:result.requests.p2},history:[],cfg:undefined};delete out.definitions;
  if(state.features?.includes('data-v1')&&result.definitions){const definitions=fcSafeDefinitions(result.definitions),moves=definitions.moves.filter(move=>sentDefinitions.get(move.id)!==JSON.stringify(move));for(const move of moves)sentDefinitions.set(move.id,JSON.stringify(move));if(sentDefinitions.size>1024)throw Error('Too many custom moves in one battle.');if(moves.length)out.definitions={schema:1,moves};}return out;}

 function chat(actor,text){localBattleChatLine(s.roomids[0],'|c| '+(actor==='p1'?s.cfg.name:s.cfg.nameB)+'|'+text);}
 function nativeLine(line){s.receiveClock?.(line);}
 const clock=state.host?createNativeSharedTimer(s,(line,target)=>{
  if(!target||target==='p1')nativeLine(line);
  if(!target||target==='p2')wire({kind:'line',line}).catch(error=>stop(error.message));
 },raw=>hostRun(fcNonce(),raw,raw.entry?.side||'p1','',true)):null;
 async function timer(actor,on){if(typeof on!=='boolean')throw Error('Invalid timer request.');clock?.request(on,actor);}
 function hostRun(id,raw,actor,key,internal=false){chain=chain.then(async()=>{
  if(dead)return;if(processed.has(id)){await wire(processed.get(id));return;}
  try{
   const op=internal?raw:fcOperation(raw,actor);
   if(!internal&&op.method==='act'&&['choose','undo'].includes(op.entry.type)&&key!==fcRequestKey(s,actor))throw Error('That choice is stale. Choose again.');
   let value=null;
   if(op.method==='chat')chat(actor,op.text);else value=await base(op.method,...(op.method==='act'?[op.entry]:op.method==='timeout'?[{side:op.side}]:[]));
   clock?.sync();
   const concealed=op.entry?.kind==='command'&&/^\/set\s+move\s+/i.test(op.entry.text);
   const commit={kind:'state',seq:++seq,id,actor,...(value?{result:project(value),entry:concealed?undefined:op.entry}:{chat:op.text})};processed.set(id,commit);if(processed.size>128)processed.delete(processed.keys().next().value);
   await wire(commit);complete(id,value);
  }catch(error){await wire({kind:'error',id,message:String(error.message).slice(0,250)});complete(id,null,error.message);}
 }).catch(error=>stop(error.message));}
 function propose(raw){
  if(dead||!ready)return Promise.reject(Error('Waiting for the other player.'));let op;try{op=fcOperation(raw,side);}catch(error){return Promise.reject(error);}
  if(pending.size>=16)return Promise.reject(Error('Wait for the previous actions.'));
  const id=fcNonce(),result=new Promise((resolve,reject)=>pending.set(id,{resolve,reject,timer:setTimeout(()=>{complete(id,null,'The other player did not respond.');stop('Direct battle connection timed out.');},20000)}));
  if(state.host)hostRun(id,op,side,fcRequestKey(s,side));else wire({kind:'proposal',id,op,key:fcRequestKey(s,side)}).catch(error=>stop(error.message));return result;
 }
 const queries=new Set(['inspect','checkTeams','catalog','export']);
 function query(method,args){if(state.host)return base(method,...args);if(pending.size>=16)return Promise.reject(Error('Wait for the previous actions.'));const id=fcNonce(),result=new Promise((resolve,reject)=>pending.set(id,{resolve,reject,timer:setTimeout(()=>complete(id,null,'The host did not respond.'),15000)}));wire({kind:'query',id,method,args}).catch(error=>complete(id,null,error.message));return result;}
 s.rpc=(method,...args)=>['act','rewind'].includes(method)?propose({method,...(method==='act'?{entry:args[0]}:{})}):queries.has(method)?query(method,args):Promise.reject(Error('That operation is unavailable in a shared battle.'));
 s.enqueue=(entry,id)=>s.rpc('act',entry).catch(error=>localBattleError(id,error.message));s.stop=()=>stop('',true);
 return {side,propose,stop,toggle(){s.setHackEnabled(!s.hackEnabled);return s.hackEnabled;},
  markReady(){ready=true;},
  receive(packet){if(dead||!packet||typeof packet!=='object')return;
   if(packet.kind==='bye'){stop(String(packet.reason||'The other player left.').slice(0,180),false);return;}
   if(packet.kind==='error'){complete(packet.id,null,String(packet.message||'Action rejected.').replace(/[\x00\r\n|]/g,' ').slice(0,250));return;}
   if(state.host&&packet.kind==='ready'){if(ready)return;ready=true;wire({kind:'state',seq:0,result:project(s.lastResult),initial:true}).catch(error=>stop(error.message));return;}
   if(packet.kind==='timer'){if(state.host)timer('p2',packet.on).catch(error=>stop(error.message));return;}
   if(!state.host&&packet.kind==='line'){if(typeof packet.line==='string'&&/^\|inactive(?:off)?\|/.test(packet.line)&&packet.line.length<500&&!/[\x00\r\n]/.test(packet.line))nativeLine(packet.line);return;}
   if(state.host&&packet.kind==='proposal'){if(!/^[a-z0-9]{10,60}$/.test(packet.id)||typeof packet.key!=='string'||packet.key.length>30000)return;hostRun(packet.id,packet.op,'p2',packet.key);return;}
   if(state.host&&packet.kind==='query'){
    if(!queries.has(packet.method)||!/^[a-z0-9]{10,60}$/.test(packet.id)||!Array.isArray(packet.args)||packet.args.length>2)return;
    if(queuedQueries>=16)return;queuedQueries++;
    chain=chain.then(async()=>{try{await wire({kind:'answer',id:packet.id,value:await base(packet.method,...packet.args)});}catch(error){await wire({kind:'error',id:packet.id,message:String(error.message).slice(0,250)});}finally{queuedQueries--;}}).catch(error=>stop(error.message));return;
   }
   if(!state.host&&packet.kind==='answer'){try{complete(packet.id,fcDataCopy(packet.value));}catch(error){stop(error.message);}return;}
   if(!state.host&&packet.kind==='state'){chain=chain.then(()=>{
    if(packet.initial){if(ready||packet.seq!==0)throw Error('Invalid initial battle state.');ready=true;}
    else if(packet.seq!==seq+1)throw Error('Battle updates arrived out of order.');
    if(packet.result){packet.result=fcSafeState(packet.result);s.applyRemote(packet.result,packet.entry?fcDataCopy(packet.entry):undefined);}
    else if(typeof packet.chat==='string'&&['p1','p2'].includes(packet.actor))chat(packet.actor,fcString(packet.chat,300));
    seq=packet.seq;complete(packet.id,packet.result||null);
   }).catch(error=>stop(error.message));}
  },timer(on){return state.host?timer(side,on):wire({kind:'timer',on});},get sequence(){return seq;},get closed(){return dead;}};
}

function createFakeChallenges(){
 const states=new Map(),pieces=new Map(),hellos=new Map();let sendChain=Promise.resolve(),receiveChain=Promise.resolve(),lastSend=0,inbox=0;
 const me=()=>fcId(app.user?.get?.('userid')||app.user?.get?.('name'));
 const name=()=>String(app.user?.get?.('name')||me()).replace(/[|\r\n]/g,'').slice(0,30);
 const avatar=()=>String(app.user?.get?.('avatar')||app.user?.avatar||'1').replace(/[^a-z0-9-]/gi,'').slice(0,80)||'1';
 const disabled=()=>{try{return localStorage.getItem(FC_PREF)==='1';}catch{return false;}};
 const say=(message,room,error=true)=>{if(room?.add)room.add((error?'|error|':'|chatmsg|')+String(message).replace(/[\r\n|]/g,' '));else app.addPopupMessage?.(message);};
 async function signal(state,data){const promise=sendChain.then(async()=>{
  const text=await fcEncode(data),id=fcNonce(),total=Math.ceil(text.length/850);if(total>106)throw Error('Connection description is too large.');
  for(let i=0;i<total;i++){const socket=app.socket||app.connection;if(!socket||socket.readyState!==1)throw Error('Connect to Showdown to challenge another player.');const delay=Math.max(0,700-(Date.now()-lastSend));if(delay)await new Promise(resolve=>setTimeout(resolve,delay));socket.send('|/pm '+state.peer+', '+FC_PREFIX+state.sid+'.'+id+'.'+i+'.'+total+'.'+text.slice(i*850,(i+1)*850));lastSend=Date.now();}
 });sendChain=promise.catch(()=>{});return promise;}
 function wire(state,data){return state.peerLink?.open?state.peerLink.send(data):Promise.reject(Error('The battle relay connection is not open.'));}
 const home=app.rooms[''];let nativeData={challengesFrom:{},challengeTo:null},refreshing=false;
 function refresh(){if(!home.updateChallenges)return;refreshing=true;try{home.updateChallenges(nativeData);}finally{refreshing=false;}for(const state of states.values()){const pm=home.openPM(state.peerName||state.peer,true),host=pm?.[0]||pm,card=host?.querySelector?.('.challenge');if(card&&state.stage!=='playing'){card.dataset.qolFc=state.sid;state.card=card;}}}
 patchMethod(home,'updateChallenges','__qolNativeSharedChallenges',original=>function(data){
  if(!refreshing)nativeData={...data,challengesFrom:{...(data.challengesFrom||{})},challengeTo:data.challengeTo?{...data.challengeTo}:null};
  const merged={...nativeData,challengesFrom:{...nativeData.challengesFrom}};
  for(const state of states.values()){
   if(!state.host&&['invited','accepted','connecting'].includes(state.stage))merged.challengesFrom[state.peer]=state.format;
   if(state.host&&['offered','waiting','connecting','starting'].includes(state.stage))merged.challengeTo={to:state.peerName||state.peer,format:state.format};
  }
  return original.call(this,merged);
 });
 function removeCard(state){clearTimeout(state.timer);clearInterval(state.acceptTimer);if(state.card?.dataset.qolFc===state.sid)state.card.remove();state.card=null;home.closeNotification?.('challenge:'+state.peer);}
 function end(state,message='',notify=false){
  const sent=state.stage!=='choose';removeCard(state);states.delete(state.sid);
  if(state.link&&!state.link.closed){state.link.stop(message,notify);return;}
  if(notify&&sent){const bye={kind:'bye',reason:message.slice(0,180)};(state.peerLink?.open?wire(state,bye):signal(state,bye)).catch(()=>{}).finally(()=>state.peerLink?.close());}else state.peerLink?.close();
  refresh();
 }
 for(const method of ['rejectChallenge','cancelChallenge','dismissChallenge'])if(typeof home[method]==='function')patchMethod(home,method,'__qolSharedCancel',original=>function(value,target,...rest){const card=target?.closest?.('[data-qol-fc]'),state=states.get(card?.dataset.qolFc);if(state){end(state,'Challenge cancelled.',true);return;}return original.call(this,value,target,...rest);});
 function nativeCard(state){
  if(state.stage==='choose'){
   const opened=home.openPM(state.peerName||state.peer,true),host=opened?.[0]||opened;
   if(host?.querySelector('.challenge'))throw Error('Close the existing challenge with this player first.');
   home.challenge(state.peerName||state.peer,state.format);
  }else refresh();
  const opened=home.openPM(state.peerName||state.peer,true),host=opened?.[0]||opened;
  state.card=host?.querySelector?.('.challenge');if(!state.card)throw Error('The native challenge interface is unavailable.');state.card.dataset.qolFc=state.sid;
  const button=state.card.querySelector('button[name=team]');if(button&&!window.BattleFormats?.[state.format.split('@@@')[0]]){button.disabled=false;button.textContent='Select a team';button.value='';}
 }
 function connect(state,host){
  state.peerLink=createRelayBattlePeer(host,data=>{
   state.directChain=(state.directChain||Promise.resolve()).then(()=>{if(states.has(state.sid))return receive(state,data,true);}).catch(error=>{end(state,error.message,true);say(error.message);});
  },reason=>{if(states.has(state.sid)){end(state,reason);say(reason);}});
  if(!host)state.peerLink.opened.then(()=>{let attempts=0;const accept=()=>{if(!states.has(state.sid)||state.stage!=='accepted'){clearInterval(state.acceptTimer);return;}if(++attempts>20){end(state,'The host did not start the battle.',true);return;}wire(state,{kind:'accept',protocol:3,version:FC_VERSION,capabilities:FC_FEATURES,requires:FC_REQUIRED_FEATURES,packed:state.packed,name:name(),avatar:avatar()}).catch(error=>end(state,error.message));};accept();state.acceptTimer=setInterval(accept,1000);}).catch(()=>{});
  return state.peerLink;
 }
 async function prepare(state){
  state.format=fcFormat(state.card?.querySelector('button[name=format]')?.value||state.format);
  const input=state.card?.querySelector('button[name=team]'),index=input&&/^\d+$/.test(input.value)?Number(input.value):-1,team=index>=0?window.Storage?.teams?.[index]:null;
  let format=state.format;
  if(state.host){const form=state.card;const additions=[];if(form.querySelector('[name=terapreview]:checked'))additions.push('Tera Type Preview');if(form.querySelector('[name=itemclause]:checked'))additions.push('Item Clause = 1');if(form.querySelector('[name=bestof]:checked'))throw Error('Best-of series are not available for shared sandbox matches.');if(additions.length)format+=(format.includes('@@@')?',':'@@@')+additions.join(',');}
  if(!state.host){const packed=team?selfPackedOf(team):'';if(!packed&&!state.features?.includes('data-v1'))return localSimulatorTask('prepare',{format,packed:''});if(!packed&&input&&!input.disabled&&input.value!=='random')throw Error('Choose a team for this format.');return {format,packed};}
  return localSimulatorTask('prepare',{format,packed:team?selfPackedOf(team):''});
 }
 async function selectTeam(state){
  if(disabled())throw Error('Fake challenges are disabled. Use /enable fakechallenges.');
  if(localBattleSession&&!localBattleSession.over&&!localBattleSession.stopped)throw Error('Finish or close your current local battle first.');
  const checked=await prepare(state);if(!states.has(state.sid))return;state.format=checked.format;state.packed=checked.packed;state.gameType=checked.gameType;state.timerSettings=checked.timerSettings;
  if(state.host){state.stage='connecting';refresh();const offer=await connect(state,true).offer();if(!states.has(state.sid))return;state.stage='offered';refresh();await signal(state,{kind:'hello',protocol:3,version:FC_VERSION,capabilities:FC_FEATURES,requires:FC_REQUIRED_FEATURES,format:state.format,offer});
   if(!states.has(state.sid)||state.stage!=='offered')return;state.timer=setTimeout(()=>{if(state.stage==='offered'){end(state);say('No compatible script response from '+state.peer+'.');}},30000);
  }else{state.stage='accepted';const button=state.card.querySelector('[name=acceptChallenge]');if(button)button.disabled=true;await connect(state,false).answer(state.offer);}
 }
 async function startSession(state,cfg){
  if(state.session||localBattleSession&&!localBattleSession.over&&!localBattleSession.stopped)throw Error('A local battle is already running.');
  const s=await runSelfSession({...cfg,token:state.sid,shared:{side:state.host?'p1':'p2',peer:state.peer,remote:!state.host}});
  if(!s||s.stopped)throw Error('Could not start the battle.');if(!states.has(state.sid)){s.stop();return;}
  state.session=s;state.stage='playing';removeCard(state);refresh();
  state.link=createFakeChallengeLink(state,s,data=>wire(state,data),reason=>{states.delete(state.sid);removeCard(state);state.peerLink?.close();refresh();if(reason)localBattleNotice(s.roomids[0],reason);});s.sharedLink=state.link;
  const room=app.rooms[s.roomids[0]];if(room)room.closeAndRematch=function(){end(state,'Rematch requested.',true);this.close?.();app.focusRoom?.('');command('/fakechallenge '+state.peer+', '+state.format,home);};
  if(!state.host)await wire(state,{kind:'ready'});
 }
 async function receive(state,packet,direct=false){
  if(!packet||typeof packet!=='object'||Array.isArray(packet))return;
  // Battle operations are never accepted over the PM signalling channel.
  if(state.link){if(direct)state.link.receive(packet);else if(packet.kind==='bye')end(state,String(packet.reason||'Challenge cancelled.'));return;}
  if(packet.kind==='bye'||packet.kind==='denied'){end(state);if(packet.reason)say(String(packet.reason).slice(0,180));return;}
  if(packet.kind==='helloack'){if(state.host&&state.stage==='offered'){clearTimeout(state.timer);state.stage='waiting';refresh();}return;}
  if(state.host&&packet.kind==='accept'&&direct&&['offered','waiting'].includes(state.stage)){
   state.stage='checking';state.features=fcPeerFeatures(packet);const nameB=fcString(packet.name,30);if(fcId(nameB)!==state.peer)throw Error('Invalid player name.');
   const checkedB=await localSimulatorTask('prepare',{format:state.format,packed:packet.packed===''?'':fcPacked(packet.packed)});if(!states.has(state.sid))return;const packedB=checkedB.packed;
   const cfg={format:state.format,gameType:state.gameType,timerSettings:state.timerSettings,packedA:state.packed,packedB,name:name(),nameB,avatarA:avatar(),avatarB:String(packet.avatar||'1').replace(/[^a-z0-9-]/gi,'').slice(0,80),seed:Array.from(crypto.getRandomValues(new Uint16Array(4)))};
   state.stage='starting';await startSession(state,cfg);if(!states.has(state.sid))return;await wire(state,{kind:'start',cfg:{format:cfg.format,name:cfg.name,nameB,avatarA:cfg.avatarA,avatarB:cfg.avatarB}});return;
  }
  if(!state.host&&packet.kind==='start'&&direct&&state.stage==='accepted'){
   const c=packet.cfg;if(!c||c.format!==state.format||fcId(c.name)!==state.peer||fcId(c.nameB)!==me())throw Error('Invalid battle setup.');
   await startSession(state,{format:state.format,name:fcString(c.name,30),nameB:fcString(c.nameB,30),avatarA:fcString(c.avatarA||'1',80).replace(/[^a-z0-9-]/gi,''),avatarB:fcString(c.avatarB||'1',80).replace(/[^a-z0-9-]/gi,'')});
  }
 }
 async function packet(peer,sid,body,peerName=peer){
  let state=states.get(sid);if(state&&state.peer!==peer)return;const data=await fcDecode(body);
  if(!state){
   if(data?.kind!=='hello')return;
   let features;try{features=fcPeerFeatures(data,false);}catch(error){await signal({sid,peer},{kind:'denied',reason:error.message});return;}
   if(Date.now()-(hellos.get(peer)||0)<2000)return;hellos.set(peer,Date.now());if(hellos.size>64)hellos.delete(hellos.keys().next().value);
   state={sid,peer,peerName,host:false,features,format:fcFormat(data.format),offer:data.offer,stage:'invited'};
   if(disabled()||app.ignore?.[peer]||states.size>=4||localBattleSession&&!localBattleSession.over&&!localBattleSession.stopped){await signal(state,{kind:'denied',reason:disabled()?'Fake challenges are disabled.':'The other player is busy.'});return;}
   if(!data.offer||data.offer.type!=='relay-v1'||!/^[a-f0-9]{64}$/.test(data.offer.room)||!/^[a-f0-9]{64}$/.test(data.offer.token))return;
   states.set(sid,state);nativeCard(state);await signal(state,{kind:'helloack'});return;
  }
  await receive(state,data,false);
 }
 function line(value){
  const m=/^\|pm\|([^|]+)\|([^|]+)\|(.*)$/.exec(value);if(!m||!m[3].startsWith(FC_PREFIX))return false;
  const from=fcId(m[1]),to=fcId(m[2]);if(from===me())return true;if(to!==me()||!from||app.ignore?.[from])return true;
  const parts=/^([a-z0-9]{10,60})\.([a-z0-9]{10,60})\.(\d{1,3})\.(\d{1,3})\.([A-Za-z0-9+/=]{1,850})$/.exec(m[3].slice(FC_PREFIX.length));if(!parts)return true;
  const [,sid,id,part,count,body]=parts,index=Number(part),total=Number(count);if(!total||total>106||index>=total)return true;
  for(const [key,v]of pieces)if(Date.now()-v.time>45000)pieces.delete(key);
  const key=from+':'+sid+':'+id;if(!pieces.has(key)){if(pieces.size>=16)return true;pieces.set(key,{time:Date.now(),total,parts:new Map()});}
  const buffer=pieces.get(key);if(buffer.total!==total)return true;buffer.parts.set(index,body);
  if(buffer.parts.size===total){pieces.delete(key);if(inbox>=16)return true;inbox++;const text=Array.from({length:total},(_,i)=>buffer.parts.get(i)).join('');receiveChain=receiveChain.then(()=>packet(from,sid,text,m[1].replace(/^[^a-z0-9]+/i,'').slice(0,30))).catch(error=>{const state=states.get(sid);if(state)end(state,error.message,true);say('Shared battle: '+error.message);}).finally(()=>{inbox--;});}return true;
 }
 const originalReceive=app.receive;app.receive=function(data,...args){if(typeof data!=='string'||data.startsWith('>'))return originalReceive.call(this,data,...args);const kept=data.split('\n').filter(value=>!line(value));if(kept.length)return originalReceive.call(this,kept.join('\n'),...args);};
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('button'),card=button?.closest?.('[data-qol-fc]'),state=states.get(card?.dataset.qolFc);if(!state)return;
  if(button.name==='team'&&!window.BattleFormats?.[state.format.split('@@@')[0]]){
   event.preventDefault();event.stopImmediatePropagation();const fallback=Object.keys(window.BattleFormats||{}).find(id=>/^gen9/.test(id)&&window.BattleFormats[id].isTeambuilderFormat&&!window.BattleFormats[id].team);
   if(fallback)app.addPopup(window.TeamPopup,{team:button.value,format:fallback,sourceEl:button,folderToggleOn:true,folderNotExpanded:[]});return;
  }
  if(!['makeChallenge','acceptChallenge','cancelChallenge','rejectChallenge','dismissChallenge'].includes(button.name))return;
  event.preventDefault();event.stopImmediatePropagation();if(['cancelChallenge','rejectChallenge','dismissChallenge'].includes(button.name)){end(state,'Challenge cancelled.',true);return;}
  if(state.busy)return;state.busy=true;button.disabled=true;
  selectTeam(state).catch(error=>{if(states.has(state.sid)){state.peerLink?.close();state.peerLink=null;state.stage=state.host?'choose':'invited';removeCard(state);nativeCard(state);say(error.message);}}).finally(()=>{state.busy=false;});
 },true);
 document.addEventListener('submit',event=>{if(event.target.closest?.('[data-qol-fc]')){event.preventDefault();event.stopImmediatePropagation();}},true);
 function command(text,room){
  const toggle=/^\/(enable|disable)\s+fakechallenges\s*$/i.exec(text);if(toggle){try{localStorage.setItem(FC_PREF,toggle[1].toLowerCase()==='disable'?'1':'0');}catch{say('Could not save this preference.',room);return true;}if(disabled())for(const state of [...states.values()])if(!state.link)end(state,'Fake challenges disabled.',true);say('Fake challenges '+(disabled()?'disabled.':'enabled.'),room,false);return true;}
  if(/^\/hacks?\s*$/i.test(text)){const s=localBattleSession;if(!s||s.stopped){say('Use /hacks in a local battle.',room);return true;}s.setHackEnabled(!s.hackEnabled);return true;}
  const match=/^\/fakechallenge(?:\s+([\s\S]*))?$/i.exec(text);if(!match)return false;
  try{
   if(disabled())throw Error('Fake challenges are disabled. Use /enable fakechallenges.');fcRelayEndpoint();if(typeof WebSocket!=='function')throw Error('This browser does not support battle relay connections.');
   const argument=match[1]||'',comma=argument.indexOf(','),raw=(comma<0?argument:argument.slice(0,comma)).trim(),peer=fcId(raw);
   if(!peer||peer.length>18||peer===me()||/[\r\n|]/.test(raw))throw Error('Use /fakechallenge username, challenge code.');
   for(const state of [...states.values()])if(state.peer===peer&&(state.session?.over||state.session?.ended||state.session?.stopped))end(state,'Battle finished.',true);
   if(states.size>=4||[...states.values()].some(state=>state.peer===peer))throw Error('Close the existing shared challenge first.');
   if(localBattleSession&&!localBattleSession.over&&!localBattleSession.stopped)throw Error('Finish or close your current battle first.');
   const state={sid:fcNonce(),peer,peerName:raw,host:true,format:fcFormat(comma<0?(home.curFormat||'gen9ou'):argument.slice(comma+1)),stage:'choose'};
   states.set(state.sid,state);try{nativeCard(state);}catch(error){states.delete(state.sid);throw error;}
  }catch(error){say(error.message,room);}return true;
 }
 return {command,line,states,disabled};
}

let fakeChallengeManager=null;
function patchFakeChallenges(){
 if(!window.app?.send||!app.receive)return false;
 if(!fakeChallengeManager)fakeChallengeManager=createFakeChallenges();
 return patchMethod(app,'send','__qolFakeChallengeCommands',original=>function(data,...rest){
  if(typeof data!=='string')return original.call(this,data,...rest);
  const route=line=>{
   let text=line,id=typeof rest[0]==='string'?rest[0]:rest[0]?.id;
   // A pipe in command arguments is not a room separator.
   const packet=/^([^/|\n]*)\|([\s\S]*)$/.exec(line);if(packet){id=packet[1];text=packet[2];}
   let room=this.rooms?.[id]||this.curRoom;
   // Native PM submission wraps each input line before it reaches app.send.
   const pm=/^\/(?:pm|msg|whisper|w)\s+([^,\n]+),\s*([\s\S]*)$/i.exec(text);
   if(pm){text=pm[2];const peer=fcId(pm[1]);room={add:message=>{
    const opened=this.rooms?.['']?.openPM?.(peer,true),host=opened?.[0]||opened,log=host?.querySelector?.('.pm-log .inner');
    if(!log){this.addPopupMessage?.(message.replace(/^\|(?:error|chatmsg)\|/,''));return;}
    const entry=document.createElement('div');entry.className=message.startsWith('|error|')?'message-error':'chat';entry.textContent=message.replace(/^\|(?:error|chatmsg)\|/,'');log.append(entry);
   }};}
   return fakeChallengeManager.command(text,room);
  };
  const lines=data.split('\n'),kept=lines.filter(line=>!route(line));
  if(kept.length===lines.length)return original.call(this,data,...rest);
  if(kept.length)return original.call(this,kept.join('\n'),...rest);
 });
}

    function lockLocalP1View(s,room) {
        const battle=room.battle,homeSide=s.localPlayerSide||'p1';if(!battle)return {sync(){},destroy(){}};
        const originalView=battle.setViewpoint,originalSwitch=battle.switchViewpoint;
        const originalTipBattle=room.tooltips?.battle;
        const cache=new Map();let controlPokemon=null,lastPartyRequest=null;
        const fixedView=function(){if(battle.nearSide===battle[homeSide]&&battle.mySide===battle[homeSide]&&!!battle.viewpointSwitched===(homeSide==='p2'))return;return originalView?.call(battle,homeSide);};
        battle.setViewpoint=fixedView;battle.switchViewpoint=fixedView;
        const facade=new Proxy(battle,{
            get(target,key){
                const side=target[s.activeSide]||target.p1;
                if(key==='nearSide'||key==='mySide')return side;
                if(key==='farSide')return target[s.activeSide==='p1'?'p2':'p1'];
                if(key==='myPokemon')return controlPokemon||room.request?.side?.pokemon||[];
                const value=Reflect.get(target,key,target);
                if(typeof value!=='function')return value;
                if(!cache.has(value))cache.set(value,value.bind(target));return cache.get(value);
            },
            set(target,key,value){if(key==='myPokemon'){controlPokemon=value;return true;}return Reflect.set(target,key,value,target);}
        });
        room.battle=facade;if(room.tooltips)room.tooltips.battle=facade;
        function sync(){
            controlPokemon=null;
            const data=s.requests[homeSide]?.side?.pokemon;
            if(data&&lastPartyRequest!==s.requests[homeSide]?.rqid){lastPartyRequest=s.requests[homeSide]?.rqid;battle.myPokemon=JSON.parse(JSON.stringify(data));for(const p of battle.myPokemon){battle.parseDetails?.(p.ident?.slice(4),p.ident,p.details,p);battle.parseHealth?.(p.condition,p);}}
            if(battle.nearSide!==battle[homeSide])fixedView();
        }
        sync();
        return {battle,sync,destroy(){
            if(room.battle===facade)room.battle=battle;
            if(room.tooltips?.battle===facade)room.tooltips.battle=originalTipBattle;
            if(battle.setViewpoint===fixedView)battle.setViewpoint=originalView;
            if(battle.switchViewpoint===fixedView)battle.switchViewpoint=originalSwitch;
        }};
    }

    // Local choices never reach the server. Read-only data queries may use
    // the existing connection through the room-owned reply bridge.
    const LOCAL_SIM_STORE = 'qol-local-battle-v1';
    const LOCAL_ROOM_RE = /^battle-[a-z0-9]+-qollocal-[a-z0-9]+-p[12]$/;
    let localBattleSession = null;
    const localBattleRoomIDs=new Set();
    const isLocalBattleRoom = id => typeof id === 'string' && (LOCAL_ROOM_RE.test(id)||localBattleRoomIDs.has(id));

    function localBattlePacket(data, room) {
        const id = typeof room === 'string' ? room : room?.id;
        if (isLocalBattleRoom(id)) return {id, text:String(data)};
        if (typeof data !== 'string') return null;
        // These are client protocol messages, not arbitrary chat mentions.
        const prefix = /^([^|\n]+)\|([\s\S]*)$/.exec(data);
        if (prefix && isLocalBattleRoom(prefix[1])) return {id:prefix[1],text:prefix[2]};
        const global = /^(?:\|)?\/(?:noreply\s+\/)?(join|leave|autojoin|cmd fullformat)\s+([^\n]+)$/.exec(data);
        if (!global) return null;
        const ids = global[2].split(',').map(s=>s.trim());
        const locals = ids.filter(isLocalBattleRoom);
        if (!locals.length) return null;
        const remaining = ids.filter(id=>!isLocalBattleRoom(id));
        return {id:locals[0],text:'/'+global[1],global:true,remaining:remaining.length ? data.slice(0,data.lastIndexOf(global[2]))+remaining.join(',') : null,locals};
    }

    function localBattleError(id,text){localBattleChatLine(id,'|error|'+String(text).replace(/[\r\n]/g,' '));}

    function localBattleNotice(id,text){localBattleChatLine(id,'|chatmsg|'+String(text).replace(/[\r\n]/g,' '));}

    function patchLocalBattleRouting() {
        return patchMethod(window.app,'send','__qolLocalBattleRouter',original=>function(data,room) {
            // Handle protocol batches line by line; one local line must never
            // hide a live line or allow another local line through to the socket.
            if (typeof data==='string' && data.includes('\n') && (data.split('\n').some(line=>isLocalBattleRoom(line.split('|',1)[0])) || isLocalBattleRoom(typeof room==='string'?room:room?.id))) {
                for(const line of data.split('\n')) this.send(line,room);
                return;
            }
            const packet=localBattlePacket(data,room);
            if (!packet) return original.apply(this,arguments);
            const s=localBattleSession;
            if (packet.remaining) original.call(this,packet.remaining,room);
            if (packet.global) {
                if (packet.text==='/leave') for(const id of packet.locals) s?.closeRoom(id);
                if (packet.text==='/join') for(const id of packet.locals) if(s?.closed.has(id))s.openRoom?.(id);
                return;
            }
            if (!s || !s.roomids.includes(packet.id) || s.stopped) {
                localBattleNotice(packet.id,'This local battle has closed. Start another with Sandbox.');
                return;
            }
            s.send(packet.id,packet.text);
        });
    }

    // The compressed simulator is decoded only after a local battle is started.
    // It is never executed in the page context or installed into its Dex.
// One idle, initialized simulator can be handed from validation to a battle.
// Never share a running battle worker with a check or another session.
let idleLocalSimulator=null,localSimulatorSourceCache=null;
async function createLocalSimulatorWorker(){
 const source=await localSimulatorSource(),url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
 let worker;try{worker=new Worker(url);}catch(error){URL.revokeObjectURL(url);throw error;}
 const entry={worker,url,expiry:0,dispose(){clearTimeout(this.expiry);worker.terminate();URL.revokeObjectURL(url);}};
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('The local simulator did not start.')),30000);worker.onerror=e=>{clearTimeout(timer);reject(Error(e.message||'Local simulator failed.'));};worker.onmessage=e=>{if(e.data?.startupError){clearTimeout(timer);reject(Error(e.data.startupError));}else if(e.data?.ready){clearTimeout(timer);resolve();}};});return entry;}catch(error){entry.dispose();throw error;}
}
function releaseLocalSimulatorWorker(entry){
 if(idleLocalSimulator){entry.dispose();return;}
 const promise=Promise.resolve(entry);idleLocalSimulator=promise;
 entry.worker.onmessage=null;entry.worker.onerror=()=>{if(idleLocalSimulator===promise)idleLocalSimulator=null;entry.dispose();};
 entry.expiry=setTimeout(()=>{if(idleLocalSimulator===promise)idleLocalSimulator=null;entry.dispose();},120000);entry.expiry?.unref?.();
}
async function acquireLocalSimulatorWorker(){const pending=idleLocalSimulator;idleLocalSimulator=null;const entry=await(pending||createLocalSimulatorWorker());clearTimeout(entry.expiry);return entry;}
async function warmLocalSimulator(){if(idleLocalSimulator)return idleLocalSimulator;const pending=createLocalSimulatorWorker();idleLocalSimulator=pending;try{const entry=await pending;if(idleLocalSimulator===pending){idleLocalSimulator=null;releaseLocalSimulatorWorker(entry);}return entry;}catch(error){if(idleLocalSimulator===pending)idleLocalSimulator=null;throw error;}}
async function clearLocalSimulatorCache(){const pending=idleLocalSimulator;idleLocalSimulator=null;if(pending){try{(await pending).dispose();}catch{}}}
globalThis.addEventListener?.('pagehide',()=>{clearLocalSimulatorCache();});

    const LOCAL_SIM_WORKER_EXTENSION = "// Shared clients use the actual format's timer configuration.\nconst sharedBaseFormat=methods.format;\nmethods.format=async function(format){\n const checked=await sharedBaseFormat(format),resolved=Dex.formats.get(checked.format),rules=Dex.formats.getRuleTable(resolved);\n return {...checked,gameType:resolved.gameType,timerSettings:rules.timer?.[0]?JSON.parse(JSON.stringify(rules.timer[0])):null};\n};\nmethods.tie=async function(){const s=current();await s.stream.write('>forcetie');return result(s);};\nconst baseSandboxCatalog=methods.catalog;\nmethods.catalog=async function(kind,...args){if(kind==='effects')return sandboxConditionNames(current().stream.battle);return baseSandboxCatalog.call(this,kind,...args);};\nmethods.timeout=async function({side}){if(side!=='p1'&&side!=='p2')throw Error('Invalid timer side.');const s=current();await s.stream.write('>'+side+' default');return result(s);};\n\n// Set edits update the displayed identity/statbar without pretending that a\n// battle move changed the Pok\u00e9mon's type or healed/damaged it.\nsyncPokemon=function(b,p,prior){\n const details=prior.details!==p.details;\n if(details)b.add('detailschange',p,p.details,'[qolinstant]');\n if(prior.status!==p.status){if(prior.status)b.add('-curestatus',p,prior.status,'[silent]');if(p.status)b.add('-status',p,p.status,'[silent]');}\n if(prior.hp!==p.hp||prior.maxhp!==p.maxhp)b.add('-sethp',p,p.getHealth,'[silent]','[qolinstant]');\n if(!details&&prior.types!==p.getTypes(true).join('/'))b.add('-start',p,'typechange',p.getTypes(true).join('/'),'[silent]');\n for(const [stat,value]of Object.entries(p.boosts))if(prior.boosts?.[stat]!==value)b.add('-setboost',p,stat,value,'[silent]');\n if(prior.item!==p.item){if(prior.item)b.add('-enditem',p,b.dex.items.get(prior.item).name,'[silent]');if(p.item)b.add('-item',p,b.dex.items.get(p.item).name,'[silent]');}\n if(details||prior.ability!==p.ability){if(p.ability)b.add('-ability',p,b.dex.abilities.get(p.ability).name,'[silent]');else if(prior.ability)b.add('-endability',p,'[silent]');}\n};\n\nconst nativeInstallRng=installRng;\ninstallRng=function(b,s){\n nativeInstallRng(b,s);s.qolForcedMoves=[];\n const resolve=b.queue.resolveAction;\n b.queue.resolveAction=function(action,...args){\n  const forced=action?.choice==='move'&&s.qolForcedMoves.find(rule=>rule.turn===b.turn&&rule.pokemon===action.pokemon);\n  if(forced){s.qolForcedMoves=s.qolForcedMoves.filter(rule=>rule!==forced);const move=b.dex.getActiveMove(forced.move);move.qolForced=true;action={...action,moveid:forced.move,move,targetLoc:0,zmove:undefined,maxMove:undefined,priority:undefined};}\n  return resolve.call(this,action,...args);\n };\n const runMove=b.actions.runMove;\n b.actions.runMove=function(move,pokemon,...args){\n  if(!move?.qolForced)return runMove.call(this,move,pokemon,...args);\n  const deduct=pokemon.deductPP;\n  pokemon.deductPP=function(selected,...rest){return toID(selected?.id||selected)===move.id&&!this.moveSlots.some(slot=>slot.id===move.id)?1:deduct.call(this,selected,...rest);};\n  try{return runMove.call(this,move,pokemon,...args);}finally{pokemon.deductPP=deduct;}\n };\n};\nconst nativeSandboxCommand=sandboxCommand;\nsandboxCommand=async function(s,entry){\n const health=/^\\/set\\s+(?:hp|health)\\s+(\\d+)(?:\\s+(me|opp))?\\s*$/i.exec(entry.text);\n if(health){const b=s.stream.battle,percent=number(Number(health[1]),1,100,'HP percentage'),side=b[health[2]?.toLowerCase()==='opp'?(entry.side==='p1'?'p2':'p1'):entry.side],active=side.active.filter(p=>p&&!p.fainted);if(b.ended||b.turn<1)throw Error('Set HP after team preview and before the battle ends.');if(!active.length)throw Error('No unfainted active Pok\u00e9mon; use /set revive first.');for(const p of active){const prior=pokemonView(p);p.hp=Math.max(1,Math.ceil(p.maxhp*percent/100));syncPokemon(b,p,prior);}if(side.activeRequest)side.emitRequest({...side.activeRequest,side:side.getRequestData()});b.sendUpdates();return;}\n const switchCommand=/^\\/set\\s+switch\\s+(.+?)(?:\\s+(me|opp))?\\s*$/i.exec(entry.text);\n if(switchCommand){\n  const b=s.stream.battle,sideId=switchCommand[2]?.toLowerCase()==='me'?entry.side:(entry.side==='p1'?'p2':'p1'),side=b[sideId];\n  if(b.ended||b.turn<1)throw Error('Switch after team preview and before the battle ends.');\n  if(side.active.length!==1)throw Error('Use the native switch controls for a multi-active battle.');\n  const value=switchCommand[1].trim().replace(/^\\[|\\]$/g,''),roster=editorRoster(side);\n  let target;\n  if(/^\\d+$/.test(value))target=roster[number(Number(value),1,roster.length,'Original team slot')-1];\n  else{const matches=roster.filter(p=>[p.name,p.species.name,p.species.baseSpecies].some(name=>toID(name)===toID(value)));if(matches.length!==1)throw Error(matches.length?'Multiple Pok\u00e9mon match; use an original team slot.':'No Pok\u00e9mon on that team matches '+value+'.');target=matches[0];}\n  if(target.fainted||!target.hp)throw Error('That Pok\u00e9mon has fainted.');\n  if(target.isActive)throw Error('That Pok\u00e9mon is already active.');\n  if(!b.actions.switchIn(target,0,null,true))throw Error('The switch was prevented.');\n  b.resolveFaints();if(!b.ended){for(const player of b.sides)player.clearChoice();b.makeRequest(b.sides.some(player=>player.active.some(p=>p?.fainted))?'switch':'move');}b.sendUpdates();return;\n }\n if(await sandboxConditionCommand(s,entry))return;\n const heaven=/^\\/set\\s+(?:auto\\s*)?heaven(?:\\s+(me|opp))?(?:\\s+(on|off))?(?:\\s+(auto))?\\s*$/i.exec(entry.text);\n if(heaven){const side=heaven[1]?.toLowerCase()==='opp'?(entry.side==='p1'?'p2':'p1'):entry.side,enabled=heaven[2]?.toLowerCase()!=='off',automatic=/auto/i.test(entry.text);if(s.stream.battle.ended)throw Error('Rewind before editing an ended battle.');if(!enabled){setAutomaticEdit(s,'heaven',side,{kind:'heaven'},false);applyHeaven(s,side,false);}else if(automatic)setAutomaticEdit(s,'heaven',side,{kind:'heaven',enabled:true},true);else applyHeaven(s,side,true);refreshEffectChoices(s,side);return;}\n const match=/^\\/set\\s+move\\s+(.+?)\\s+(opp|me)\\s*$/i.exec(entry.text);\n if(!match)return nativeSandboxCommand(s,entry);\n const b=s.stream.battle;if(b.ended||b.turn<1||b.requestState!=='move')throw Error('Override a move while this turn is choosing moves.');\n const move=b.dex.moves.get(match[1]);if(!move.exists)throw Error('Unknown move: '+match[1]);\n const side=match[2].toLowerCase()==='opp'?(entry.side==='p1'?'p2':'p1'):entry.side;\n if(!['p1','p2'].includes(side))throw Error('Invalid player side.');\n const pokemon=b[side].active[0];if(!pokemon||pokemon.fainted)throw Error('That side has no active Pok\u00e9mon.');\n s.qolForcedMoves=s.qolForcedMoves.filter(rule=>rule.turn===b.turn&&rule.pokemon!==pokemon);\n s.qolForcedMoves.push({turn:b.turn,pokemon,move:move.id});\n // No log line, request refresh, altered move slot or opponent notification.\n};\n\nconst HEAVEN_EFFECTS=['flashfire','focusenergy','laserfocus','aquaring','magnetrise','charge','defensecurl','stockpile','helpinghand','protect','endure'];\nconst HEAVEN_SCREENS=['reflect','lightscreen','auroraveil','safeguard','mist','tailwind','luckychant'];\nfunction applyHeaven(s,sideId,enabled){\n const b=s.stream.battle,side=b[sideId];if(!side)throw Error('Invalid player side.');\n for(const p of (enabled?side.active:side.pokemon).filter(p=>p&&!p.fainted)){\n  if(enabled){setSandboxStatus(b,p,'');for(const effect of HELL_EFFECTS)if(p.volatiles[effect])removeSandboxCondition(b,p,effect);const prior=pokemonView(p);p.hp=p.maxhp;syncPokemon(b,p,prior);}\n  for(const stat of Object.keys(p.boosts)){const amount=enabled?6:0;if(p.boosts[stat]!==amount){p.boosts[stat]=amount;b.add('-setboost',p,stat,amount,'[silent]');}}\n  for(const effect of [...HEAVEN_EFFECTS,...(!enabled?['ingrain']:[])]){if(!enabled){removeSandboxCondition(b,p,effect);continue;}if(p.volatiles[effect]||!b.dex.conditions.get(effect).exists)continue;const move=b.dex.moves.get(effect);p.addVolatile(effect,p,move.exists?move:b.dex.moves.get('helpinghand'));}\n  if(enabled&&p.volatiles.stockpile)p.volatiles.stockpile.layers=3;\n }\n for(const condition of HEAVEN_SCREENS){if(enabled){if(!side.sideConditions[condition])side.addSideCondition(condition,side.active.find(Boolean));}else side.removeSideCondition(condition);}\n b.sendUpdates();\n}\nconst nativeApplyAutomaticEdit=applyAutomaticEdit;\napplyAutomaticEdit=function(s,rule){if(s.stream.battle.ended||s.stream.battle.turn<1)return;if(rule.kind==='heaven')return applyHeaven(s,rule.side,rule.enabled);if(rule.kind==='qolcondition')return applySandboxCondition(s,rule.side,rule.value,rule.enabled,false);return nativeApplyAutomaticEdit(s,rule);};\n\n// Resolve native conditions from the selected generation instead of maintaining\n// a small, drifting list of effects. Field and side conditions use existing commands.\nfunction sandboxConditionNames(b){\n const names=new Set(Object.keys(b.dex.data.Conditions));\n for(const move of b.dex.moves.all())if(move.condition)names.add(move.id);\n for(const ability of b.dex.abilities.all())if(ability.condition)names.add(ability.id);\n return [...names].filter(id=>{const c=b.dex.conditions.get(id);return c.exists&&!['brn','par','slp','frz','psn','tox','frostbite'].includes(id)&&!c.onSideStart&&!c.onFieldStart&&!c.onWeather&&!['Weather','Status'].includes(c.effectType)&&!['arceus','silvally','zacian','zamazenta','futuremove','healreplacement','rolloutstorage','commanded','commanding','trapper','twoturnmove','lockedmove','gem','stall'].includes(id);}).sort();\n}\nfunction removeSandboxCondition(b,p,id){\n // Perish Song's natural expiry faints the Pok\u00e9mon; curing it must not do that.\n if(id==='perishsong'&&p.volatiles[id]){delete p.volatiles[id];b.add('-end',p,'Perish Song','[silent]');return;}\n if(!p.volatiles[id])return;\n const offset=b.log.length;p.removeVolatile(id);\n if(!b.log.slice(offset).some(line=>line.startsWith('|-end|'+p+'|')))b.add('-end',p,b.dex.conditions.get(id).name,'[silent]');\n}\nfunction applySandboxCondition(s,sideId,id,enabled,strict=true){\n const b=s.stream.battle,side=b[sideId],active=side?.active.filter(p=>p&&!p.fainted)||[];\n if(!active.length){if(strict)throw Error('That side has no active Pok\u00e9mon.');return;}\n const source=b[sideId==='p1'?'p2':'p1'].active.find(p=>p&&!p.fainted)||active[0];\n for(const p of active){\n  if(!enabled){removeSandboxCondition(b,p,id);continue;}\n  if(p.volatiles[id])continue;\n  const aliases={partiallytrapped:'bind',trapped:'meanlook',mustrecharge:'hyperbeam',choicelock:p.lastMove?.id||'tackle'};\n  const move=b.dex.moves.get(aliases[id]||id);\n  if(!p.addVolatile(id,source,move.exists?move:b.dex.moves.get('tackle'))&&strict)throw Error('Cannot apply '+id+' now: its native prerequisites must be met.');\n  if(id==='perishsong'&&p.volatiles[id])b.add('-start',p,'perish3','[silent]');\n }\n b.sendUpdates();\n}\nasync function sandboxConditionCommand(s,entry){\n const text=String(entry.text).trim();if(!/^\\/set\\s+/i.test(text))return false;\n const b=s.stream.battle;if(b.ended)throw Error('Rewind before editing an ended battle.');\n let words=text.replace(/^\\/set\\s+/i,'').toLowerCase().split(/\\s+/);\n if(words.length===1&&['effects','statuses'].includes(words[0]))return true;\n const target=words.includes('me')?entry.side:words.includes('opp')?(entry.side==='p1'?'p2':'p1'):entry.side==='p1'?'p2':'p1';\n if(words.includes('me')&&words.includes('opp'))throw Error('Choose either me or opp.');\n const enabled=!words.includes('off'),automatic=words.includes('auto');\n words=words.filter(w=>!['me','opp','on','off','auto'].includes(w));\n const explicit=['effect','volatile'].includes(words[0]),statusPrefix=words[0]==='status';\n if(explicit||statusPrefix)words.shift();\n const alias={infatuation:'attract',seeded:'leechseed',trapping:'partiallytrapped',recharge:'mustrecharge',drowsy:'yawn',perish:'perishsong',sub:'substitute',confused:'confusion',frozen:'freeze',paralyzed:'paralysis',burned:'burn',poisoned:'poison',asleep:'sleep'};\n const raw=toID(words.join('')),id=alias[raw]||raw;\n const statuses={burn:'brn',brn:'brn',paralysis:'par',par:'par',poison:'psn',psn:'psn',toxic:'tox',tox:'tox',sleep:'slp',slp:'slp',freeze:'frz',frz:'frz',frostbite:'frostbite',cure:'',healthy:''};\n if(statusPrefix||Object.hasOwn(alias,raw)&&Object.hasOwn(statuses,id)){\n  if(!Object.hasOwn(statuses,id))throw Error('Unknown major status: '+id);\n  const value=enabled?statuses[id]:'';if(value&&!b.dex.conditions.get(value).exists)throw Error('That status is unavailable in this generation.');\n  if(automatic)setAutomaticEdit(s,'status:'+id,target,{kind:'status',value},enabled);else{for(const p of b[target].active.filter(p=>p&&!p.fainted))setSandboxStatus(b,p,value);b.sendUpdates();}return true;\n }\n const names=sandboxConditionNames(b);if(!explicit&&!names.includes(id))return false;\n if(!names.includes(id))throw Error('Unknown temporary effect. Use /set effects for available names.');\n if(automatic){setAutomaticEdit(s,'effect:'+id,target,{kind:'qolcondition',value:id,enabled:true},enabled);if(!enabled)applySandboxCondition(s,target,id,false);}\n else applySandboxCondition(s,target,id,enabled);\n refreshEffectChoices(s,target);return true;\n}\n\nconst nativeSandboxCatalog=methods.catalog;\nmethods.catalog=async function(kind,...args){if(kind==='effects')return sandboxConditionNames(current().stream.battle);return nativeSandboxCatalog(kind,...args);};\n\nfunction withoutTera(value){\n if(Array.isArray(value))return value.map(withoutTera);\n if(!value||typeof value!=='object')return value;\n return Object.fromEntries(Object.entries(value).filter(([key])=>!['teraType','terastallized','canTerastallize'].includes(key)).map(([key,item])=>[key,withoutTera(item)]));\n}\nconst nativeResult=result;\nconst nativeInspectSandbox=inspectSandbox;\ninspectSandbox=function(s){const value=nativeInspectSandbox(s),b=s.stream.battle;value.teraAllowed=b.gen>=9&&!b.ruleTable.has('terastalclause');if(value.teraAllowed)return value;const hidden=withoutTera(value);for(const team of hidden.sides)team.paste=team.paste.replace(/^Tera Type:.*\\n?/gm,'');return hidden;};\nresult=function(s){\n const value=nativeResult(s),b=s.stream.battle;value.sandbox.teraAllowed=b.gen>=9&&!b.ruleTable.has('terastalclause');\n if(!value.sandbox.teraAllowed){value.requests=withoutTera(value.requests);value.sandbox=withoutTera(value.sandbox);for(const team of value.sandbox.sides)team.paste=team.paste.replace(/^Tera Type:.*\\n?/gm,'');for(const side of ['p1','p2'])value.frames[side]=value.frames[side].map(line=>line.startsWith('|request|')?'|request|'+JSON.stringify(withoutTera(JSON.parse(line.slice(9)))):line);}\n return value;\n};\n\n// This extension executes only inside the isolated sandbox simulator Worker.\nconst NUCLEAR_SANDBOX_MOVE={num:-10001,name:'Nuclear Bomb',accuracy:100,basePower:1000,category:'Special',pp:64,noPPBoosts:true,ignoreImmunity:true,onEffectiveness(typeMod,target,type){return type===target.getTypes()[0]?1:0;},priority:7,flags:{protect:1,mirror:1},target:'normal',type:'Fire',onModifyType(move){move.type='Fairy';},onTryMove(pokemon,target,move){move.type='Fairy';},gen:1,isNonstandard:'Custom',shortDesc:'Sandbox only. Displayed as Fire; resolves as Fairy, always super effective (2x), 64 PP.'};\nfunction installSandboxNuclearDex(dex){\n if(dex.data.Moves.nuclearbomb)return;\n dex.data.Moves.nuclearbomb={...NUCLEAR_SANDBOX_MOVE,flags:{...NUCLEAR_SANDBOX_MOVE.flags}};\n dex.moves.moveCache?.delete('nuclearbomb');dex.moves.allCache=null;\n}\nconst nuclearCheckedSet=checkedSet;\ncheckedSet=function(b,set){installSandboxNuclearDex(b.dex);installSandboxNuclearDex(Dex.forFormat('gen'+b.dex.gen+'customgame'));return nuclearCheckedSet(b,set);};\nconst nuclearInstallRng=installRng;\ninstallRng=function(b,s){installSandboxNuclearDex(b.dex);return nuclearInstallRng(b,s);};\nconst nuclearSandboxCommand=sandboxCommand;\nsandboxCommand=async function(s,entry){\n const match=/^\\/set\\s+(?:nuclearbomb|nuclear\\s+bomb)(?:\\s+(me|opp))?\\s*$/i.exec(entry.text);\n if(!match)return nuclearSandboxCommand(s,entry);\n const b=s.stream.battle,side=match[1]?.toLowerCase()==='opp'?(entry.side==='p1'?'p2':'p1'):entry.side;\n if(b.ended||b.turn<1)throw Error('Teach Nuclear Bomb after team preview and before the battle ends.');\n for(const p of b[side].active.filter(p=>p&&!p.fainted)){\n  if(p.moveSlots.some(slot=>slot.id==='nuclearbomb'))continue;\n  const moves=p.set.moves.slice();if(moves.length<4)moves.push('Nuclear Bomb');else moves[3]='Nuclear Bomb';\n  changeSet(s,p,{...p.set,moves});\n }\n refresh(s);\n};\n\n// Manual item changes are edits, not consumption/removal events.\nconst qolEditedSyncPokemon=syncPokemon;\nsyncPokemon=function(b,p,prior){\n const add=b.add;\n b.add=function(...args){if(['-item','-enditem'].includes(args[0])&&args[1]===p)args.push('[qolinstant]');return add.apply(this,args);};\n try{return qolEditedSyncPokemon(b,p,prior);}finally{b.add=add;}\n};\n// Scope the bypass to execution of this sandbox-only move. Never remove terrain\n// or mutate ability data: normal moves immediately regain all ordinary checks.\nconst qolNuclearInstall=installRng;\ninstallRng=function(b,s){\n qolNuclearInstall(b,s);\n const handlers=b.findEventHandlers,run=b.actions.runMove;\n b.findEventHandlers=function(...args){const values=handlers.apply(this,args);return s.qolNuclearResolving?values.filter(h=>h.effect?.effectType!=='Ability'&&h.effect?.id!=='psychicterrain'):values;};\n b.actions.runMove=function(move,pokemon,...args){\n  if(toID(move?.id||move)!=='nuclearbomb')return run.call(this,move,pokemon,...args);\n  const previous=s.qolNuclearResolving;s.qolNuclearResolving=true;\n  const restores=[];\n  for(const side of b.sides)for(const p of side.pokemon){const own=Object.hasOwn(p,'ignoringAbility'),original=p.ignoringAbility;p.ignoringAbility=()=>true;restores.push(()=>{if(own)p.ignoringAbility=original;else delete p.ignoringAbility;});}\n  try{return run.call(this,move,pokemon,...args);}finally{for(const restore of restores)restore();s.qolNuclearResolving=previous;}\n };\n};\n\n// Emit only display data. All callbacks and battle mechanics remain in this Worker.\nconst compatNativeResult=result;\nresult=function(s){\n const value=compatNativeResult(s);if(!s.cfg?.shared)return value;\n const moves=new Map(),dex=s.stream.battle.dex;\n for(const side of value.sandbox.sides)for(const p of side.pokemon)for(const slot of p.moves||[]){const move=dex.moves.get(slot.id);if(!move.exists)continue;moves.set(move.id,{id:move.id,name:move.name,type:move.type,category:move.category,basePower:move.basePower,accuracy:move.accuracy,pp:move.pp,priority:move.priority,target:move.target,noPPBoosts:!!move.noPPBoosts,shortDesc:String(move.shortDesc||'').replace(/<[^>]*>/g,'').slice(0,500)});}\n value.definitions={schema:1,moves:[...moves.values()]};return value;\n};\n\n// A sandbox type override belongs to this Pokemon, survives switches/reloads,\n// and never changes shared Dex species data or another Pokemon's types.\nconst qolNativeTypes=Pokemon.prototype.getTypes;\nPokemon.prototype.getTypes=function(...args){return this.qolSandboxTypes&&(args[1]||!this.terastallized||this.terastallized==='Stellar')?this.qolSandboxTypes.slice():qolNativeTypes.apply(this,args);};\nconst qolTypeInstall=installRng;\ninstallRng=function(b,s){\n qolTypeInstall(b,s);\n const add=b.add;\n b.add=function(...args){\n  const value=add.apply(this,args),p=args[1];\n  if(['switch','drag','replace'].includes(args[0])&&p?.qolSandboxTypes)add.call(this,'-start',p,'typechange',p.qolSandboxTypes.join('/'),'[silent]');\n  return value;\n };\n};\nconst qolTypeCommand=sandboxCommand;\nsandboxCommand=async function(s,entry){\n if(!/^\\/set\\s+types?(?:\\s|$)/i.test(entry.text))return qolTypeCommand(s,entry);\n const b=s.stream.battle;\n if(b.ended||b.turn<1)throw Error('Set types after team preview and before the battle ends.');\n if(!['p1','p2'].includes(entry.side))throw Error('Invalid player side.');\n const words=singleLine(entry.text,'type command',250).trim().split(/\\s+/).slice(2);\n const targets=words.filter(w=>/^(me|opp)$/i.test(w));\n if(targets.length>1)throw Error('Choose either me or opp.');\n const side=b[targets[0]?.toLowerCase()==='opp'?(entry.side==='p1'?'p2':'p1'):entry.side];\n let values=words.filter(w=>! /^(me|opp)$/i.test(w)),slot=null;\n if(/^\\d+$/.test(values[0]||''))slot=Number(values.shift());\n const roster=editorRoster(side),p=slot===null?side.active[0]:roster[number(slot,1,roster.length,'Original team slot')-1];\n if(!p)throw Error('No Pokemon at that slot.');\n const reset=values.length===1&&/^(reset|clear|off)$/i.test(values[0]);\n let types=[];\n if(!reset){\n  const names=values.join(' ').split(/[\\s/,]+/).filter(Boolean);\n  if(!names.length)throw Error('Use /set type [team slot] [me/opp] Fire Flying, or reset.');\n  for(const name of names){const type=b.dex.types.get(name);if(!type.exists||type.name==='Stellar')throw Error('Unknown base type: '+name+'.');if(!types.includes(type.name))types.push(type.name);}\n }\n p.qolSandboxTypes=reset?null:types;\n p.setType(reset?p.species.types:types,true);\n if(p.isActive)b.add('-start',p,'typechange',p.getTypes().join('/'),'[silent]');\n refreshEditedRequests(s);b.sendUpdates();\n};\n";
    async function localSimulatorSource() {
        if(localSimulatorSourceCache)return localSimulatorSourceCache;
        if(typeof DecompressionStream!=='function')throw Error('This browser needs DecompressionStream support for local battles.');
        const payload=await localSimulatorPayload();
        const bootstrap=async function(payload,extension){
            try{
                const bytes=Uint8Array.from(atob(payload),c=>c.charCodeAt(0));
                const source=(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text())+'\n'+extension;
                const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
                try{importScripts(url);}finally{URL.revokeObjectURL(url);}
            }catch(error){self.postMessage({startupError:String(error?.message||error)});}
        };
        return localSimulatorSourceCache='('+bootstrap.toString()+')('+JSON.stringify(payload)+','+JSON.stringify(LOCAL_SIM_WORKER_EXTENSION)+');';
    }

// These controls belong to one local room. Native tooltip text stays intact.
function createLocalBattleTools(s,room,rpc){
 const root=room.el,tt=room.tooltips,TT=window.BattleTooltips;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const id=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const token=s.roomids[0];let state=null,dead=false,held=false,dragging=false,grace=0,hideTimer=0,busy=0,editingRange=null;const optimistic=new Map();
 const style=document.createElement('style');
 style.textContent=`
.qol-rng-panel{border-top:1px solid #999;margin:0;padding:2px 4px;font:12px Verdana,sans-serif;pointer-events:auto}
.qol-rng-row{display:flex;align-items:center;gap:4px;height:20px;white-space:nowrap}
.qol-rng-row label{display:flex;align-items:center;gap:3px;width:72px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis}
.qol-rng-row input[type=checkbox]{margin:0;width:13px;height:13px;flex-shrink:0}
.qol-rng-row button{box-sizing:border-box;min-width:34px;height:17px;line-height:13px;padding:0 6px;margin:0;font:11px Verdana,sans-serif;border:1px solid #bbb;border-radius:3px;color:#222;background:linear-gradient(#fff,#e5e5e5);cursor:pointer}
.qol-rng-row button+button{margin-left:-4px}
.qol-rng-row button[aria-pressed=true]{background:linear-gradient(#d4dce4,#ecf0f4);box-shadow:inset 0 1px 2px #7776;border-color:#a0a8b0}
.qol-rng-row button:disabled{color:#999;cursor:default;box-shadow:none;background:#eee}
.qol-rng-row input[type=range]{min-width:0;flex:1;width:100%;height:17px;margin:0;padding:0;touch-action:pan-y;accent-color:#bbb}
.qol-rng-row output{width:37px;flex-shrink:0;font-size:11px;text-align:right}
#tooltipwrapper.qol-local-tooltip-host{z-index:1000;max-width:calc(100vw - 12px)}
#tooltipwrapper .tooltip.qol-local-tooltip{box-sizing:border-box;background:#efefea;border-radius:3px;width:300px;max-width:calc(100vw - 12px);max-height:calc(100vh - 12px);max-height:calc(100dvh - 12px);overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;border-width:1px}
#tooltipwrapper.qol-local-tooltip-host .tooltip::before,#tooltipwrapper.qol-local-tooltip-host .tooltip::after{display:none!important}\n.qol-local-field,.qol-local-rewind{position:absolute;z-index:8;font-size:11px!important;padding:2px 6px!important;line-height:17px!important;min-height:21px;box-sizing:border-box}
.qol-local-field{top:23px;left:8px}.qol-local-rewind[hidden],.qol-local-popover[hidden],.qol-local-choices [hidden]{display:none!important}
.qol-local-popover{position:absolute;z-index:20;top:48px;left:8px;width:250px;max-width:calc(100% - 32px);max-height:calc(100% - 64px);max-height:min(440px,calc(100dvh - 110px));overflow:auto;box-sizing:border-box;padding:7px;border:1px solid #888;border-radius:4px;background:#eee;color:#222;font:11px Verdana,sans-serif;overscroll-behavior:contain}
.qol-local-popover header{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
.qol-local-popover .button{font-size:11px;padding:1px 5px}.qol-local-popover label{display:flex;align-items:center;justify-content:space-between;gap:6px;margin:4px 0}
.qol-local-popover select{font:11px Verdana,sans-serif;max-width:140px;min-width:95px}.qol-local-popover input[type=checkbox]{margin:3px 2px;width:14px;height:14px}
.qol-local-popover .qol-side-tabs{display:flex;gap:4px;border-top:1px solid #bbb;padding-top:5px;margin-top:5px}
.qol-local-popover .qol-side-tabs button{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qol-local-popover .qol-side-tabs button[aria-pressed=true]{font-weight:bold;background:#dce5ed}
@media(pointer:coarse){.qol-rng-row{height:27px}.qol-rng-row button{height:24px;min-width:42px}.qol-rng-row input[type=range]{height:24px}.qol-rng-row label{height:27px}.qol-local-popover select{min-height:28px}.qol-local-field,.qol-local-rewind{min-height:26px}}
`;
 document.head.append(style);
 const fieldButton=document.createElement('button');fieldButton.type='button';fieldButton.className='button qol-local-field';fieldButton.textContent='Field';fieldButton.setAttribute('aria-expanded','false');
 const field=document.createElement('section');field.className='qol-local-popover';field.hidden=true;field.setAttribute('aria-label','Battle conditions');
 root.append(fieldButton,field);
 let fieldSide='p1';
 const rewind=document.createElement('button');rewind.type='button';rewind.className='button qol-local-rewind';rewind.textContent='↶';rewind.setAttribute('aria-label','Rewind one turn');rewind.style.setProperty('font-size','18px','important');rewind.onclick=()=>{release(true);execute('rewind');};root.append(rewind);
 const weather=[['','None'],['sunnyday','Sun'],['raindance','Rain'],['sandstorm','Sand'],['snowscape','Snow'],['hail','Hail'],['desolateland','Harsh sunlight'],['primordialsea','Heavy rain'],['deltastream','Strong winds']];
 const terrain=[['','None'],['electricterrain','Electric'],['grassyterrain','Grassy'],['mistyterrain','Misty'],['psychicterrain','Psychic']];
 const conditions=[['stealthrock','Stealth Rock',1],['spikes','Spikes',3],['toxicspikes','Toxic Spikes',2],['stickyweb','Sticky Web',1],['reflect','Reflect',1],['lightscreen','Light Screen',1],['auroraveil','Aurora Veil',1],['tailwind','Tailwind',1],['safeguard','Safeguard',1],['mist','Mist',1]];
 const select=(label,attr,values,value)=>'<label>'+esc(label)+'<select '+attr+' aria-label="'+esc(label)+'">'+values.map(([v,n])=>'<option value="'+esc(v)+'"'+(String(value)===String(v)?' selected':'')+'>'+esc(n)+'</option>').join('')+'</select></label>';
 const check=(label,attr,value)=>'<label>'+esc(label)+'<input type="checkbox" '+attr+' aria-label="'+esc(label)+'"'+(value?' checked':'')+'></label>';
 function drawField(){if(!state)return;const side=state.sides.find(v=>v.id===fieldSide);field.innerHTML='<header><strong>Battle conditions</strong><button class="button" type="button" data-field-close aria-label="Close battle conditions">×</button></header>'+select('Weather','data-field="weather"',weather,state.weather)+select('Terrain','data-field="terrain"',terrain,state.terrain)+[['trickroom','Trick Room'],['gravity','Gravity'],['magicroom','Magic Room'],['wonderroom','Wonder Room']].map(([v,n])=>check(n,'data-pseudo="'+v+'"',state.pseudoWeather?.includes(v))).join('')+'<div class="qol-side-tabs">'+state.sides.map(v=>'<button class="button" type="button" data-field-side="'+v.id+'" aria-pressed="'+(v.id===fieldSide)+'">'+v.id.toUpperCase()+' · '+esc(v.name)+'</button>').join('')+'</div>'+[...conditions].sort((a,b)=>b[2]-a[2]).map(([v,n,max])=>{const layers=side?.conditionStates?.find(c=>c.id===v)?.layers||0;return max===1?check(n,'data-condition="'+v+'"',layers):select(n,'data-condition="'+v+'"',Array.from({length:max+1},(_,i)=>[i,i===0?'None':i+' layer'+(i===1?'':'s')]),layers);}).join('');}
 function syncField(){for(const input of field.querySelectorAll('select,input[type=checkbox]')){let value;if(input.dataset.field)value=state[input.dataset.field];else if(input.dataset.pseudo)value=!!state.pseudoWeather?.includes(input.dataset.pseudo);else if(input.dataset.condition){const side=state.sides.find(v=>v.id===fieldSide);value=side?.conditionStates?.find(v=>v.id===input.dataset.condition)?.layers||0;}if(input.type==='checkbox')input.checked=!!value;else if(value!==undefined&&input.value!==String(value))input.value=String(value);}}
 function closeField(){field.hidden=true;fieldButton.setAttribute('aria-expanded','false');}
 function outsideField(event){if(!field.hidden&&!field.contains(event.target)&&!fieldButton.contains(event.target))closeField();}
 function notice(error){if(!dead)localBattleNotice(token,error?.message||String(error));}
 async function execute(method,...args){if(dead)return;busy++;syncControls();try{return await rpc(method,...args);}catch(error){notice(error);}finally{busy--;syncControls();layout();}}
 fieldButton.onclick=()=>{field.hidden=!field.hidden;fieldButton.setAttribute('aria-expanded',String(!field.hidden));if(!field.hidden)drawField();};
 field.addEventListener('click',event=>{event.stopPropagation();if(event.target.closest('[data-field-close]')){field.hidden=true;fieldButton.setAttribute('aria-expanded','false');}const tab=event.target.closest('[data-field-side]');if(tab){fieldSide=tab.dataset.fieldSide;drawField();}});
 field.addEventListener('change',event=>{const input=event.target;if(input.dataset.field)execute('act',{type:'edit',kind:input.dataset.field,value:input.value});else if(input.dataset.pseudo)execute('act',{type:'edit',kind:'pseudo',value:input.dataset.pseudo,enabled:input.checked});else if(input.dataset.condition)execute('act',{type:'edit',kind:'condition',side:fieldSide,value:input.dataset.condition,layers:input.type==='checkbox'?Number(input.checked):Number(input.value)});});
 const ruleKey=spec=>JSON.stringify([spec.side,id(spec.pokemon),id(spec.move),spec.kind,spec.effect??null,id(spec.target)]);
 function matchingRule(spec){const pending=optimistic.get(ruleKey(spec));if(pending)return pending.enabled?{value:pending.value}:undefined;return state?.overrides.find(r=>r.side===spec.side&&r.pokemon===id(spec.pokemon)&&r.move===id(spec.move)&&r.kind===spec.kind&&r.effect===spec.effect&&(r.target||'')===id(spec.target));}
 function row(spec,label,values,defaultValue){const fixed=!!spec.fixed;const rule=matchingRule(spec),value=rule?.value??defaultValue,armed=!!rule;
  let controls;if(values===null)controls='';else if(Array.isArray(values))controls=values.map(([v,n])=>'<button type="button" data-outcome="'+v+'" aria-pressed="'+(armed&&value===v)+'"'+(!armed||fixed?' disabled':'')+'>'+esc(n)+'</button>').join('');
  else controls='<input type="range" min="'+values.min+'" max="'+values.max+'" step="1" value="'+(spec.kind==='roll'?100-value:value)+'" aria-label="'+esc(label)+'"'+(!armed||fixed?' disabled':'')+'><output>'+(spec.kind==='roll'?(100-value)+'%':value)+'</output>';
  return '<div class="qol-rng-row" data-rule="'+esc(JSON.stringify(spec))+'" data-default="'+String(defaultValue)+'"><label><input type="checkbox" aria-label="Override '+esc(label)+'"'+(armed?' checked':'')+(fixed?' disabled':'')+'>'+esc(label)+'</label>'+controls+'</div>';
 }
 function panel(rows){return rows?'<div class="qol-rng-panel" data-local-rng="'+esc(token)+'">'+rows+'</div>':'';}
 function effectLabel(effect,index){let v;try{v=JSON.parse(effect.label);}catch{return 'Effect '+(index+1);}const labels=[];if(v.status)labels.push({brn:'Burn',par:'Paralysis',psn:'Poison',tox:'Toxic',slp:'Sleep',frz:'Freeze'}[v.status]||v.status);if(v.volatileStatus)labels.push(v.volatileStatus==='flinch'?'Flinch':v.volatileStatus);for(const [stat,amount]of Object.entries(v.boosts||{}))labels.push(({atk:'Atk',def:'Def',spa:'SpA',spd:'SpD',spe:'Spe',accuracy:'Acc',evasion:'Eva'}[stat]||stat)+' '+(amount>0?'+':'')+amount);if(v.self)labels.push('Self effect');return labels.join(', ')||'Effect '+(index+1);}
 function compactMoveHTML(html){const box=document.createElement('div');box.innerHTML=html;let after=false;for(const element of [...box.children]){if(element.classList.contains('tooltip-section')){after=true;element.remove();continue;}if(after&&element.tagName==='P'&&!element.classList.contains('movetag')&&!element.querySelector('.effectiveness-icon')&&!element.textContent.trim().startsWith('◎'))element.remove();}return box.innerHTML;}
 const originalMove=tt?.showMoveTooltip,originalPokemon=tt?.showPokemonTooltip,originalPlace=tt?.placeTooltip,originalHide=TT?.hideTooltip;
 let moveWrapper,pokemonWrapper,placeWrapper,hideWrapper;
 if(originalMove)tt.showMoveTooltip=moveWrapper=function(move,type,pokemon,serverPokemon,...rest){const originalHTML=originalMove.call(this,move,type,pokemon,serverPokemon,...rest);if(s.isShared&&!s.hackEnabled)return originalHTML;const html=compactMoveHTML(originalHTML);if(dead||!state||s.ended||this.battle.gen<3)return html;
  const ident=serverPokemon?.ident||pokemon?.ident||'',name=ident.slice(4)||pokemon?.name,side=ident.slice(0,2)||s.activeSide;
  if(side!==s.activeSide)return html;
  const member=state.sides.find(v=>v.id===side)?.pokemon.find(p=>id(p.name)===id(name)&&p.active);if(!member)return html;
  const ownMove=member.moves.find(m=>m.id===move.id);if(!ownMove)return html;
  const spec={side,pokemon:member.name,move:move.id};let rows='';
  const foes=state.sides.find(v=>v.id!==side),targets=(foes?.pokemon||[]).filter(p=>p.active&&p.hp>0).sort((a,b)=>a.activeSlot-b.activeSlot);
  if(move.target==='allAdjacent')for(const ally of state.sides.find(v=>v.id===side)?.pokemon||[])if(ally.active&&ally.hp>0&&ally.name!==member.name)targets.push({...ally,ally:true});
  const spread=['allAdjacentFoes','allAdjacent'].includes(move.target)&&targets.length>1;
  const scopes=spread?targets.map(p=>({target:(p.ally?side:foes.id)+String.fromCharCode(97+p.activeSlot),label:p.ally?' A':((foes.id==='p1')===(p.activeSlot===0)?' L':' R')})):[{target:undefined,label:''}];
  for(const scope of scopes)rows+=row({...spec,target:scope.target,kind:'accuracy',fixed:move.accuracy===true},'Acc'+scope.label,[[false,'Miss'],[true,'Hit']],true);
  if(move.category!=='Status'&&!move.damage&&!move.damageCallback&&!move.ohko){for(const scope of scopes)rows+=row({...spec,target:scope.target,kind:'crit'},'Crit'+scope.label,[[false,'No'],[true,'Yes']],false);for(const scope of scopes)rows+=row({...spec,target:scope.target,kind:'roll'},'Roll'+scope.label,{min:85,max:100},0);}
  for(const effect of ownMove.secondaries||[])for(const scope of scopes)rows+=row({...spec,target:scope.target,kind:'secondary',effect:effect.index},effectLabel(effect,effect.index)+scope.label,[[false,'No'],[true,'Yes']],true);
  if(Array.isArray(ownMove.multihit))rows+=row({...spec,kind:'hits'},'Hits',{min:ownMove.multihit[0],max:ownMove.multihit[1]},ownMove.multihit[1]);
  return html+panel(rows);
 };
 if(originalPokemon)tt.showPokemonTooltip=pokemonWrapper=function(pokemon,serverPokemon,...rest){const html=originalPokemon.call(this,pokemon,serverPokemon,...rest);if(dead||!state||s.ended||this.battle.gen<3)return html;const ident=serverPokemon?.ident||pokemon?.ident||'',name=ident.slice(4)||pokemon?.name,side=ident.slice(0,2)||pokemon?.side?.id;
  if((s.isShared&&!s.hackEnabled)||side!==s.activeSide||!state.sides.find(v=>v.id===side)?.pokemon.some(p=>p.active&&id(p.name)===id(name)))return html;
  return html+panel(row({side,pokemon:name,move:'',kind:'speed'},'Speed tie',[[false,'Lose'],[true,'Win']],true)+row({side,pokemon:name,move:'',kind:'confusion'},'Confusion Hit-Self',null,true));
 };
 function currentPanel(){return document.querySelector('.qol-rng-panel[data-local-rng="'+token+'"]');}
 function hideNative(...args){const host=document.querySelector('#tooltipwrapper');if(host?.classList.contains('qol-local-tooltip-host')){host.classList.remove('qol-local-tooltip-host');host.style.pointerEvents='';host.style.maxWidth='';}return originalHide?.apply(TT,args);}
 function release(force=false){held=false;dragging=false;editingRange=null;grace=0;clearTimeout(hideTimer);if(force&&(currentPanel()||root.contains(TT?.parentElem)||document.querySelector('#tooltipwrapper.qol-local-tooltip-host')))hideNative();}
 if(originalHide)TT.hideTooltip=hideWrapper=function(...args){if(!dead&&currentPanel()){if(held||dragging)return;clearTimeout(hideTimer);hideTimer=setTimeout(()=>{if(!dead&&!held&&!dragging)hideNative(...args);},70);return;}return hideNative(...args);};
 if(originalPlace)tt.placeTooltip=placeWrapper=function(...args){release();const result=originalPlace.apply(this,args),p=currentPanel();if(p){grace=Date.now()+100;const tooltip=p.closest('.tooltip');if(tooltip){tooltip.style.pointerEvents='auto';tooltip.classList.add('qol-local-tooltip');} const wrapper=p.closest('#tooltipwrapper');if(wrapper){wrapper.style.pointerEvents='auto';wrapper.classList.add('qol-local-tooltip-host');fitTooltip();}}return result;};
 function fitTooltip(){const p=currentPanel(),tooltip=p?.closest('.tooltip'),wrapper=p?.closest('#tooltipwrapper');if(!tooltip||!wrapper)return;const viewport=window.visualViewport,width=viewport?.width||document.documentElement.clientWidth||window.innerWidth,height=viewport?.height||window.innerHeight;tooltip.style.maxWidth=Math.max(0,width-12)+'px';tooltip.style.maxHeight=Math.max(0,height-12)+'px';const box=tooltip.getBoundingClientRect();if(box.right>width-6||box.left<6)wrapper.style.left=(window.scrollX+Math.max(6,Math.min(box.left,width-box.width-6)))+'px';if(box.top<6)wrapper.style.top=(window.scrollY+box.height+6)+'px';else if(box.bottom>height-6)wrapper.style.top=(window.scrollY+height-6)+'px';}
 function syncControls(){const p=currentPanel();if(!p)return;for(const r of p.querySelectorAll('[data-rule]')){const spec=JSON.parse(r.dataset.rule),rule=matchingRule(spec);r.querySelector('input[type=checkbox]').checked=!!rule;for(const control of r.querySelectorAll('button,input[type=range]')){control.disabled=!!spec.fixed||!rule;if(control.tagName==='BUTTON')control.setAttribute('aria-pressed',String(!!rule&&String(rule.value)===control.dataset.outcome));else if(rule&&control!==editingRange){control.value=spec.kind==='roll'?100-rule.value:rule.value;r.querySelector('output').textContent=control.value+(spec.kind==='roll'?'%':'');}}}}
 function rngEvent(event){const p=event.target.closest?.('.qol-rng-panel');if(p?.dataset.localRng!==token)return;
  if(event.type==='input'){const output=event.target.closest('[data-rule]')?.querySelector('output');if(output)output.textContent=event.target.value+(JSON.parse(event.target.closest('[data-rule]').dataset.rule).kind==='roll'?'%':'');return;}
  const r=event.target.closest('[data-rule]');if(!r)return;
  if(event.type==='click'){event.stopImmediatePropagation();if(event.target.type==='checkbox'||event.target.tagName!=='BUTTON')return;}
  if(event.type==='change'&&event.target.tagName==='BUTTON')return;
  const spec=JSON.parse(r.dataset.rule);if(spec.fixed)return;delete spec.fixed;const checkbox=r.querySelector('input[type=checkbox]');let value=matchingRule(spec)?.value;
  if(event.target.type==='checkbox'&&!checkbox.checked){commitRule(spec,undefined,false);return;}
  if(event.target.tagName==='BUTTON')value=event.target.dataset.outcome==='true';else if(event.target.type==='range')value=spec.kind==='roll'?100-Number(event.target.value):Number(event.target.value);else if(value===undefined)value=['roll','hits'].includes(spec.kind)?Number(r.dataset.default):r.dataset.default==='true';
  if(event.target.type==='range')editingRange=null;commitRule(spec,value,true);
 }
 function commitRule(spec,value,enabled){const key=ruleKey(spec),pending={value,enabled};optimistic.set(key,pending);syncControls();const entry=enabled?{type:'rng',rule:{...spec,value}}:{type:'unrng',...spec};return execute('act',entry).finally(()=>{if(optimistic.get(key)===pending)optimistic.delete(key);syncControls();});}
 function pointerOver(event){if(event.target.closest?.('.qol-rng-panel')?.dataset.localRng===token){held=true;clearTimeout(hideTimer);}}
 function pointerOut(event){const p=currentPanel();if(!p||!p.contains(event.target)||p.contains(event.relatedTarget)||TT?.isLocked)return;held=false;grace=Date.now()+70;clearTimeout(hideTimer);hideTimer=setTimeout(()=>{if(!dead&&!held&&!dragging)hideNative();},80);}
 function pointerDown(event){outsideField(event);if(event.target.closest?.('.qol-rng-panel')?.dataset.localRng===token){TT?.cancelLongTap?.();held=true;dragging=event.target.type==='range';editingRange=dragging?event.target:null;}else if(currentPanel()&&!event.target.closest?.('.has-tooltip'))release(true);}
 function pointerUp(){dragging=false;TT?.cancelLongTap?.();}
 function keyboard(event){if(event.key==='Escape'){field.hidden=true;fieldButton.setAttribute('aria-expanded','false');release(true);}}
 const listeners=[['click',outsideField,true],['pointercancel',pointerUp,true],['contextmenu',event=>{if(event.target.closest?.('.qol-rng-panel')?.dataset.localRng===token)event.preventDefault();},true],['click',rngEvent,true],['change',rngEvent,true],['input',rngEvent,true],['pointerover',pointerOver,true],['pointerout',pointerOut,true],['pointerdown',pointerDown,true],['pointerup',pointerUp,true],['keydown',keyboard,true]];
 for(const args of listeners)document.addEventListener(...args);
 function layout(){fitTooltip();const turn=root.querySelector('.turn:last-child')||root.querySelector('.turn'),frame=root.querySelector('.battle');rewind.hidden=!turn;rewind.disabled=busy>0||s.turn<2||!(s.turns||[]).includes(s.turn-1);fieldButton.disabled=s.turn<1||s.ended;if(turn&&frame){const t=frame.getBoundingClientRect(),r=root.getBoundingClientRect(),scale=frame.offsetWidth?t.width/frame.offsetWidth:1;const left=Math.max(0,Math.min(t.left-r.left+(110+turn.offsetWidth)*scale+6,(r.width||window.innerWidth)-rewind.offsetWidth-6))+'px',top=Math.max(0,t.top-r.top+10*scale+(turn.offsetHeight*scale-rewind.offsetHeight)/2)+'px';if(rewind.style.left!==left)rewind.style.left=left;if(rewind.style.top!==top)rewind.style.top=top;}}

 window.addEventListener('resize',layout);window.visualViewport?.addEventListener('resize',layout);
 return {layout,update(value){state=value;layout();if(!field.hidden)syncField();syncControls();},dismissTooltip(){release(true);},rewind(){release(true);return execute('rewind');},destroy(){release(true);dead=true;window.removeEventListener('resize',layout);window.visualViewport?.removeEventListener('resize',layout);for(const args of listeners)document.removeEventListener(...args);if(tt?.showMoveTooltip===moveWrapper)tt.showMoveTooltip=originalMove;if(tt?.showPokemonTooltip===pokemonWrapper)tt.showPokemonTooltip=originalPokemon;if(tt?.placeTooltip===placeWrapper)tt.placeTooltip=originalPlace;if(TT?.hideTooltip===hideWrapper)TT.hideTooltip=originalHide;field.remove();fieldButton.remove();rewind.remove();style.remove();}};
}

// Display-only chat never enters the simulator or the replay step queue.
function localBattleChatLine(id,line){
 const room=window.app?.rooms?.[id],log=room?.battle?.scene?.log;
 if(!room||!log?.add)return;
 const containers=[log.innerElem,log.preemptElem,log.elem].filter(Boolean),before=new Set(containers.flatMap(el=>[...el.children]));
 try{const parser=window.BattleTextParser;if(parser?.parseBattleLine){const {args,kwArgs}=parser.parseBattleLine(line);log.add(args,kwArgs);}else{const parts=line.split('|');parts.shift();const type=parts.shift();const args=['c','chat'].includes(type)?[type,parts.shift(),parts.join('|')]:[type,parts.join('|')];log.add(args,{});}}
 catch(error){const target=log.innerElem||log.elem;if(target){const el=document.createElement('div');el.className='chat';el.textContent=line.replace(/^\|[^|]+\|/,'');target.append(el);}}
 for(const el of containers)for(const child of el.children)if(!before.has(child))child.setAttribute('data-qol-chat-only','');

}
function attachLocalChat(s,room){
 const original=room.add;
 if(typeof original!=='function')return ()=>{};
 const wrapper=function(data,...rest){
  if(!s.delivering&&typeof data==='string'){
   const lines=data.split('\n').filter(Boolean);
   if(lines.length&&lines.every(line=>/^\|(?:c|c:|chat|chatmsg|raw|html|uhtml|uhtmlchange|error)\|/.test(line))){for(const line of lines)localBattleChatLine(s.roomids[0],line);return;}
  }
  return original.call(this,data,...rest);
 };
 wrapper.__original=original;room.add=wrapper;
 return ()=>{if(room.add===wrapper)room.add=original;};
}

// Apply edits to the caught-up renderer without invoking native wait controls.
// The engine's actual field protocol remains in the replay, but no annotation
// or data-command output is mixed into it.
function reconcileLocalHazards(battle,snapshot){
 if(!snapshot?.sides)return;
 const names={spikes:'Spikes',toxicspikes:'Toxic Spikes',stealthrock:'Stealth Rock',stickyweb:'Sticky Web'};
 for(const state of snapshot.sides){
  const side=battle[state.id];if(!side?.sideConditions)continue;
  const desired=new Map((state.conditionStates||[]).map(condition=>[condition.id,condition.layers||1]));
  for(const [id,name]of Object.entries(names)){
   const layers=desired.get(id)||0,current=side.sideConditions[id];
   // The snapshot is authoritative. A missing SideEnd event must not leave
   // the native client or its rebuilt sprites believing a hazard still exists.
   if(!layers){delete side.sideConditions[id];continue;}
   if(current)current[1]=layers;
   else side.sideConditions[id]=[name,layers,0,0];
  }
 }
}
// Native downloads also embed a static HTML transcript, independently of the
// protocol. Clean that copy without removing anything from the live chat.
function patchLocalReplayDownload(){
 return patchMethod(window.BattleLog,'createReplayFile','__qolLocalReplayChat',original=>function(room,...args){
  const result=original.call(this,room,...args);
  if(typeof result!=='string'||!isLocalBattleRoom(room?.id))return result;
  const el=room.battle?.scene?.log?.elem;if(!el)return result;
  const clean=el.cloneNode(true);for(const node of clean.querySelectorAll('[data-qol-chat-only]'))node.remove();
  const prefix='<div class="battle-log battle-log-inline"><div class="inner">';
  const cleaned=result.replace(prefix+el.innerHTML,prefix+clean.innerHTML);
  const setup='<base href="https://play.pokemonshowdown.com/"><script>('+repairLocalReplayAssets.toString()+')('+JSON.stringify(LOCAL_REPLAY_PNGS)+');</script>';
  return cleaned.replace(/(<meta charset="utf-8"\s*\/?>)/i,'$1'+setup);
 });
}

// Read-only commands use the existing connection without a local room id.
// Only unscoped informational replies are mirrored into this local room.
function createLocalDataBridge(s){
 const original=app.receive;let current=null,queue=[],timer=0,finishTimer=0,dead=false;
 function finish(){clearTimeout(timer);clearTimeout(finishTimer);current=null;pump();}
 function pump(){if(dead||current||!queue.length)return;current=queue.shift();const socket=app.socket||app.connection;
  if(!socket||socket.readyState!==1){localBattleNotice(current.id,'Connect to the server to use data commands.');finish();return;}
  timer=setTimeout(()=>{if(current)localBattleNotice(current.id,'No data-command reply received.');finish();},10000);
  try{socket.send('|'+current.text);}catch{finish();}
 }
 const wrapper=function(data,...args){if(!current||typeof data!=='string'||data.startsWith('>'))return original.call(this,data,...args);
  const kept=[],reply=[];for(let line of data.split('\n')){
   const pm=/^\|pm\|([^|]*)\|~\|(.+)$/.exec(line),selfId=String(app.user?.get?.('userid')||app.user?.get?.('name')||'').toLowerCase().replace(/[^a-z0-9]/g,'');if(pm&&pm[1].toLowerCase().replace(/[^a-z0-9]/g,'')===selfId){const body=pm[2];if(body.startsWith('/raw '))line='|raw|'+body.slice(5);else if(body.startsWith('/error '))line='|error|'+body.slice(7);else if(body.startsWith('/text '))line='|chatmsg|'+body.slice(6);else if(body.startsWith('/data-'))line='|c|~|'+body;}
   if(/^\|(?:raw|html|chatmsg)\|/.test(line)||/^\|c\|[^|]*\|\/(?:raw |data-(?:pokemon|move|item|ability)\b)/.test(line)||/^\|(?:error|popup)\|/.test(line)||/^\|(?:message|inactive)\|/.test(line)){reply.push(line);}
   else kept.push(line);
  }
  if(reply.length){const id=current.id;for(const line of reply){if(/^\|(?:error|popup)\|/.test(line))localBattleError(id,line.replace(/^\|[^|]+\|/,''));else localBattleChatLine(id,line);}clearTimeout(finishTimer);finishTimer=setTimeout(finish,160);}
  if(kept.some(Boolean))return original.call(this,kept.join('\n'),...args);
 };
 wrapper.__original=original;
 app.receive=wrapper;
 return {send(id,text){if(!/^\/(?:dt[1-9]?|data|details|dex|pokedex|pstats|stats|dexsearch|ds|dsearch|nds|movesearch|ms[1-9]?|msearch|nms|itemsearch|is|learn|learnset|learnall|canlearn|weak|weakness|weaknesses|resist|effectiveness|eff|type|matchup|coverage|cover|statcalc|ns[1-9]?|natureswap|ce|crossevo|crossevolve|fuse[1-9]?|franticfusions|reevo|showevo|pokemove|mnm|mixandmega|scale[1-9]?|scalemons|flip[1-9]?|flipped|ts[1-9]?|tiershift|bnb|badnboosted|350|350cup|bss|randbats|help)(?:\s|$)/i.test(text)||/[\r\n|]/.test(text))return false;const match=/^\/(\w+)([\s\S]*)$/.exec(text),aliases={stats:'data',msearch:'ms',dsearch:'ds',nds:'ds',learnset:'learn',learnall:'learn',ns:'natureswap',ce:'crossevolve',crossevo:'crossevolve',fuse:'franticfusions',eff:'effectiveness',type:'effectiveness',matchup:'effectiveness',cover:'coverage'};if(match&&aliases[match[1].toLowerCase()])text='/'+aliases[match[1].toLowerCase()]+match[2];queue.push({id,text});pump();return true;},destroy(){dead=true;clearTimeout(timer);clearTimeout(finishTimer);queue=[];current=null;if(app.receive===wrapper)app.receive=original;}};
}

// Keep choice changes out of a running public animation. A cancelled native
// animation can leave a pending Deferred with no animation left to resolve it;
// resume that queue from its current step instead of seeking or resetting it.
function createLocalPlayback(s,room,battle,ready){
 let timer=0,dead=false;
 function check(){timer=0;if(dead||s.stopped)return;if(battle.atQueueEnd){ready();return;}timer=setTimeout(check,200);}
 return {kick(){if(!dead&&!timer)check();},destroy(){dead=true;clearTimeout(timer);timer=0;}};
}

// Runs inside the downloaded HTML. Hazard graphics are embedded so a file://
// replay does not depend on relative paths or a separate image request for them.
function repairLocalReplayAssets(assets){
 function normalize(raw){
  if(!raw||/^(?:data:|blob:)/i.test(raw))return raw;
  const name=raw.split(/[?#]/)[0].split('/').pop();if(assets[name])return assets[name];
  if(raw.startsWith('//'))return 'https:'+raw;
  if(raw.startsWith('file:')){const match=raw.match(/\/(fx|sprites)\/(.+)$/);if(match)return 'https://play.pokemonshowdown.com/'+match[1]+'/'+match[2];}
  return raw;
 }
 let soundObject=null,originalMute=null,allowSound=false;
 function configureSound(){
  const sound=window.BattleSound;
  if(!sound||sound===soundObject||typeof sound.setMute!=='function')return;
  soundObject=sound;originalMute=sound.setMute;
  sound.setMute=function(value){return originalMute.call(this,allowSound?value:true);};
  sound.setMute(true);
 }
 // Install on the sound script's load event, before replay initialization.
 // Explicit use of the replay's Music control may enable it again.
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('.soundchooser button[value], .startsoundchooser button[value]');
  if(!button)return;
  allowSound=button.value==='on';
  if(window.Replays)window.Replays.muted=!allowSound;
 },true);
 function repair(){
  configureSound();
  if(!allowSound){
   if(window.Replays)window.Replays.muted=true;
   for(const button of document.querySelectorAll('.soundchooser button[value], .startsoundchooser button[value]'))button.classList.toggle('sel',button.value==='off');
  }
  for(const img of document.querySelectorAll('img[src]')){const old=img.getAttribute('src'),value=normalize(old);if(value!==old)img.setAttribute('src',value);}
  if(window.BattleEffects)for(const effect of Object.values(window.BattleEffects))if(effect?.url)effect.url=normalize(effect.url);
 }
 document.addEventListener('load',repair,true);
 new MutationObserver(repair).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
 repair();
}

const LOCAL_REPLAY_PNGS={"web.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAB6CAYAAAB0rJfZAAAACXBIWXMAAAsSAAALEgHS3X78AAAgAElEQVR4nO2dd3hUVf7/3+fe6ZNeJo0ESEHpSFcQFKS5gKAgsougriIrrvBl14IFOwoqy6Loggqii+iKK00IEgwtQEgIENIr6ZnUmUyfWz6/P+4EWVd/WCjqzut55nkgmXtP+ZzyaecE8OPHjx8/fvz48ePHjx8/fvz48ePHjx8/fvz48ePHjx8/fvz48ePHjx8/fvz48ePHjx8/fvz48ePHjx8/fvz48ePHjx8/fvz48ePHjx8/fvz48ePHjx8/fvxcPtjVroCfywMjIu5qV8KPHz9+/PxPwV/tCvxMNFFRUbf27dv3bo1Gc2N7e7sdQDMA+WpX7AJ4AHS1K/FrQwNg0sSJE9/Nz893t7S0yJWVlfJDDz30LoDAq105AJg3b97vTCbTAwBMV7Mev1bNMQHAIp7nf280GrVBQUGsS5cuTK1WTwDQ62pWrHfv3n/98MMPC8aPH/+aLMuxALRXsz6/VmIAvMQYa7rmmmvo2LFjHkmSyGaz0ZgxYzYDiLxM5RoBRE6aNKnvnDlz7jWZTIsB3K3VasfOmDHjrYyMjIb6+npp165dzhkzZpzo27fv4vDw8Fgoy/RVmUyqq1HoJaAFwHoiMhcXF/9pwoQJPffu3ds2fPjwsMcee+wOs9lcXVtbu85qtToBqAEIUPZB2fdvLwDJ9zMGpR/Uvo82NjY2QKvVhmg0mtDAwMCQPn36dIuPj08OCAiI1+v1cdddd12X/v37B9ntdrm8vNwbFxenDg4OVhER2717t1xVVeUKDAyskSQpd9q0ae7Ro0fr5s6dK1xQjyvGr1XAAoBqABsA2Do6Oh6fOnVqaF5enjBhwgRtfHz8o2vWrLl28uTJ3pqaGjgcDrfBYPCKoihbrVbB4/EIXq/XpVarea1Wq9doNEE6nS5Ip9OFBAUFhUdERIRFRkYGhYaGavV6vQoAiIgREbxeLxobGyk1NVVMSUnhhw4dalCr1fB4PMjJyYHb7RZzc3Nzt2/f/kFcXFz+HXfcIWZmZkpQBtcVV7Z+rQLuxAHgI8bYiDFjxtxvMBgAAL169eLnzJkz5fDhw7Xjxo0LzM/PtxkMBsTHxwckJycHMcZ4SZKIMQbGGJMkCbKsKN6yLMNut6O9vR1nzpyRKyoqhKqqKk9NTY2ztLTUUl5e3hYaGqp//fXXexoMBo3VaoUsy9BqtWhubqZNmzaVHDt2bF1oaOiByspK97Zt27B+/XrxanXQpRAwmzp1asDEiRN78DyvOnToUPXZs2c7pk+f7nn++ecvV8M0Y8eODYyOjk65/fbbF/bs2XNGz549AQAOhwNGoxEjR47kvV5v/JQpUzLNZnNRQEBArCAIMYMGDbIlJCQYOI5TMcYgiiLa29slq9UqtrS0CG1tbR5BEJyiKFplWW70er01jLEqxlilJElVADS33HLLkuDg4Gujo6Oh0WjAGMP+/fuxdu3a+oyMjDcBbG9tbXUBYOvXrwd+pWYSA2DUarWJb7311kcNDQ0eu90u5efnN3/99ddfb9iwYda2bdsCiYgnInV6errqJ/p7GQD+2LFjUV999dXwbdu2PZCenv7v4uLiFofDIZOP/Px8euyxxygpKYlKS0tlIiKz2UyLFi3K53l+HIAbANwH4DEASzmOWwrgLwDmA7gTwHgA1wPoD6AHgC4AQnCBFkxEqnXr1k0tKChotdlsJIoiERG1trbS2rVrCcDnAOJ+co9eBn7ODNYDmObxeB7Jzs7uceutt2qio6PRq1eviC5dutxUXFxczhirzcjIaBwxYkTrTTfdZGeM/WAHBBGZzGZzUmVl5RAiGhkdHX3z8OHDIy78TktLC06cOIEvvvhC3LFjx1dVVVW1AOZMmjTJcPz4cVmWZa6iosIiSVIlgDIAR6EMGOZbkn9MfQKLiooeufPOO58xGo3ac+fOIT09HXl5eUhKSrKZTCZL//79cebMGcMPfeeV4OeEx4wA7gWwPCwsLHDu3LkYNWoUKisrO/R6vT0yMtLCGMsPDQ1t5XmeBEFwyLJclpycnJOYmFgPwOMr3wgg7Ny5cwkdHR3dBUFIBHCNwWDoHRsbGxUcHMw7HA6UlJTAbDajsbERjY2NOHfuHCorK235+fkHGhsbPwgICEjXaDRCc3PzcgB/njhxYs7GjRuvraurUz/wwAPPnzp16hX8BA8XETEAAyoqKl7p0qXLeLfbzfbs2YONGzfKBw8eLPd4PI3du3e3vvnmm005OTlBb7zxxk6LxbIVgPNn9O0l4+fGP3sAWMoYu8VgMHRwHCfZ7fZitVp9euDAgbp58+ZNmjp1aj+XyyWVl5ebOY7zRkZGBhmNRh3HcTJjTFar1ZxGo9FqNBqNVqvlPR4PqqurKT8/n2VlZbHi4mKUl5fLVqvV5XK52jweT5PH4ylnjJ1hjJ3QarX5TqezCYrZAwBJAF7gOG7sG2+8UXDffffduHPnzo4lS5bc29TUtOPHNI6IjHa7/X632/10RERERE1NDZYtW4a9e/fWNTQ0rFepVLsBqERRnHDttdc2rFmzJqK2tjZx9+7dWVu3bt0KoPXHdigRqQAQY0y66Jd/AD9XwDyA7gCiNBpNCwDIshwtiuJIxtjEQYMGRT3xxBMJgwcP1q5YscJ89OhRc0REhCYpKSmwV69egb179zb27duXDw8Ph0ql7BaSJMHlcqGjo4MsFovXbDa31dfXl1VXVx8vKipKP3bs2Lm2tjZrRESErbi42IlvBHshNwB4xWAwRKSlpamSk5OTX3311exVq1b9AcpSfVGIKLGiouLZ6Ojo3+v1epXZbMbUqVMpLy8vw+v1rgoICEi3Wq0WXx/0AjCQ53n71q1bYxMTEyfn5eU5jh8/fqitrW3P5s2bi319Td8qIwDKCqbz/T4CgAvK7K9njHl+pDz+i0uRwcCgNLLTcaAFMATA84yxQT179sxavXr18ObmZufixYu/bmlpCQWQwhiL12q16m7duuHtt9+GIAgoKytDSkoKxcXFsaioKISFhZ0vpKOjQzhy5MhJlUp1XKVSVQQGBp4bMmRIHoDq7xjtHIC7ATw/YMCA8p07d17ndrsD77///rcPHjz4JBTzCgDQ1NQUs3btWuH555+3Qdk2YLPZbrJYLK+ZTKZBRMQ++eQTJCUlYcyYMYWSJL0gy/In3ypPBcV9OgBAl9mzZ4fMnj17aGBgYGR7e3t9WFhYZbdu3ZjL5XJrNBpdUFBQvEajSeR5PkqSJDXHcWrGGE9EkGWZXC6X9+zZsxVPPvnkv7OysvYDONtZt58inMuBDsBoAI+rVKq6p556ynP33Xff9Ze//GXN9u3bdwCIhrK8T2eM9QsICKh/5513unbp0kV97733wuv1imPHjqXrr7+ej4iIwNChQ7mGhgZs3rw5f/To0eUpKSk9oqKiIrVarcrhcFiqqqpOiqJ4OC4uzllWVlY9ceLEw1CUwCcA3PXYY48VLl26dPTRo0ddDz300J+qqqo+gTIItFD2ZQZASk9Pl7p16zZFr9f/LTAwMN5ut3MLFy5ERkaG6+uvvxamTZu2u7i4+D0A+7+r0bfcckuK2+2+JTg4+NqBAwcaJk2a1D8pKalHSEhIoEajOW9BSJJEbrebGhoapLKyMlZcXEwVFRVie3u7aLVaxYaGBnd1dXWLxWI56/F4/gUgDRcMyl8KPICZAFIXLVq0et++faWvvPLKFwDCfb8PADAGwEcADut0ug1vv/12WUFBgeeWW26pZYw1AfCYTCb5hRdeaC0vLxd37NhhnzdvXvZtt92WWVBQ4KqsrJSrq6slu90ueTweqb293f7ll19m3HHHHZN9ZVwHYK9Op8vfu3fvmdbWVvGxxx47DWVJ5QEY4DODiIhVVVU92NbW1mKxWKSzZ89Sr169CECdSqXaX1pamrt06dJtAOYQkZ6IQogokoj6EdHtbrf7HafTmel2uxsFQRDoW7jdbiorK6M1a9bQlClTKCgoiNRqtcRxnAdAB2OsmTFWzRgrYox9zXHcU2q1egCAIPyCc8W6AXhvyJAhaw8ePJizbNmyLwH0/tZ3egN4DcAmtVo9Z8WKFXsqKysdy5YtSzUYDKsBFKakpJw8evRoS05Ojjhx4sTakJAQ56RJkxxPP/20d/v27UJlZaVstVrJ5XKRIAjk8Xik1tbWivz8/C3r16//pFevXueuu+66QzU1Na3FxcXeAQMGvApl7ztPdnb2zKampsb29nY5NTWVIiIiiDGWzXHcfQBWPPfcc39rbW01v/fee6llZWWrnE7nDpfLlet2u+s8Ho/N4/F4HA6H0NLSIhYXF0vZ2dlUUFBAkiRRTU0NPfrooxQaGtrpD7f5nCcHGGP/gGKPzwEwFcrKdw1+4YLtJACKY+H1wsLCismTJ38ApfLfpjuA5wFs4Thu7rPPPvtBVVWVY82aNZ8yxtYAqNq4cWOBzWaTV65caQ4PDz/FGCtgjFkAkEajoZ49e8ozZ860L1++3HbmzBnJ4XCcnz0ul0tqbGyUUlNTKzwej/zPf/6zRavV3gwARMRnZGSMzcvLy62rq5OefPJJCgkJkSIiItJfeumlCS0tLX/MysrKqqysrHM4HFZBEGSPxyM5nU6PxWLx5ubmet9//31x4cKFNGzYMAoNDSWj0UgDBgygdevWERFRbm4ujRs3jvR6fbOvPX3wGwojLkhJSXkrPz+/Qq/XP4/vD4BHAHgUwB6O4x58/PHH3zl37pxzyZIl/2KMlcTFxZ3weDxiXV0djR49ehOAPwJYBWA3gBMAihhjVigmhkWv17eMGjXK8eKLL3oyMzPJ4/FQbW0tWa1W0el0Uq9evbalpKTENTU1jW5paaksKChwz58/X37kkUfcJ06cqBIEoZaI7JIkebxer2C1WuWamho5LS1Nevnll2ncuHEUFRVFKpWKGGPEcRw9+OCDYkRERLtGoykdPnx4+fbt20UiosOHD0sDBw4knU63BkDXK9Dn57kSwQbtlClTgltaWqwul6sRihnwXbQAeAuAQ5bl2StWrNjUtWtX7YIFC2anpqaeYIzdoNFoeJVKhdjY2FEAHgZg8z3bBUAKEV0HYBIRpbhcroBDhw5pDh06pHrmmWfswcHBlJqaGlhRUcHuuusu3HvvvTdXVVVNDgkJWWmz2XREpF69ejXT6/VaWZbjvV6v7PNWcRkZGSwnJwfFxcUQBIERKdYOY8wBRcM9NGzYsNOrVq26Py8v7/XCwkIxKSnperVa/TgAgyAIMBgMHih28RVVli67gK+55prwcePGJZ49e7YJgBX/f8e7C8DbUOK1CxYvXvzCl19+mbRq1aqB77zzjkoURWi1WvTp0ycEikly2Pdcre+TDmAVEXHLli0bazAY7o6Ojh7TvXv36ISEBBYeHo4BAwZwDodDuvvuuwOI6HW1Wh0QFhZ23iRzuVzYvXs327BhA19fXw+VSoWmpibY7XaoVKomQRCyARzief6EWq0uDw4ObjWbzZ4+ffrcJghCRGZmZi9RFG07duywDRo0iIYNG4Y+ffpw48aNg9PpNOTk5Fyejv4eLreAuz/xxBPDBEHQv//++/kAGqAI72K8ByDE6/Uue+aZZ+5fvXr1/sGDBwdYrVYyGo2sublZB0VDPkJEagDBUPbxQQBGALjuhRdeSICiA0CSJJmIuE5nilar5QMCAgAgQJIk/P3vf4fb7QbP8wgMDIQkSbjrrrvQvXt3V0xMjNNoNLq1Wq2d47g6IqpijFmNRiOTJEmv1Wq1kyZNEqurqwe73e4Qg8EQY7fbVTabTVi7dq0zJiZGd/vtt/OzZ8/WEtF4j8eTmp+ffwjf7aC55FzWrMq//OUvD8yZM+f3Dz/8cHF2dvZBKDPMdrHnfJwBMKC2tvZWh8Nx4NZbb70hKSmJiaKI1NRUNnHixIKDBw8OgWLrvgRgEYDfAegnimJ4bW0tl5mZiQMHDrCWlhYuKioKOp0On332GYxGI8rKyhAaGoqVK1fimWeewf79+5GWlobU1FTLgQMHKk+cOFF8/Pjx0tOnTzdXV1cLTqdTHxkZmWwymW7U6XSTOY6bx3HcfFEU75g2bdoIg8HQu0ePHrEqlcojSVKrzWYrqa+vH9jU1BSTnJzs7N+/vzohIcEUExPTrW/fvsWHDx+uuSydfqV4//33/9TU1GR98cUX8xljH0PRHH8Uo0aNShk8eHD60qVLt9fV1RERkcfjOR+m68TpdIr5+fnezz//3Pvyyy/Ld955JyUlJVFMTAwtX76cbDYbeb1eeuaZZ8hgMNA999xDLS0t1NzcTJ9++ikBqAGwnzGWyhjbzhj7iDH2L8ZYGoCjjLETt99+e+n+/futbrdbJiISBIGsVqu3sbHRbrVanTabTRQEQXa5XGJVVVVzR0dHxsGDB88sX77cuXbtWk9eXp7L5XJRR0eHVFZWVlFRUfE3URRnElFXX0DjsnDJX0xEvMvlWixJ0gsff/yx/cEHH6wG8CaAfwFwX+TZYADxALpLknQNz/PXS5I0ied5/YXfM5vNKCwsFPLy8ig/P19dUlLCysrKUFdXB0mSwBiTQkJC2j766CPV7373u1BRFDF37lxs2bIFAFw6nc5z7Nix4H79+rH8/Hz069dvNxRbvA2K+RIIIFalUsXEx8cnz5gxY8j999/fq0ePHloiQltbGyoqKnD27Fls2rQJsizL8fHxYq9evYSePXsiPj6eS0xM9Oj1eg0ALRHxAGA0GsEY62wrZFl2C4JQarfbP1Kr1V8EBwfXMca+Twn9SVxSARNRN0mS3uZ5ftLf/vY3xwsvvOCwWCxroWjHbd/x/SgAyT5hXgOgtyzLfTmOS/j2d/Py8vDFF1/g1KlTqKysRHV1Ndrazr/SBUVDrWeMVd59990Nb7755m1BQUHdKysrpYkTJ/IlJSUAkMkYO05E4xcsWNDj7bff5iVJgl6vLxJFcS6ArAuKVK1YscI0c+bM+6Kjoxfr9fpwp9OJd955B//4xz9QVnY+ZiECsEPRZzgADp1Op01ISFAnJCRIXbt2ZZGRkerIyEhNfHy8bDKZYDKZuICAAAQGBsoBAQHwLURtPM9X8Tx/DkA9FH3lHIBzTqez1mAwtAPw+PzuPzhD5JIpWUR0H4B3eZ7nnnjiCfG1114TiWgLlMS4Nt934kRR7K9SqQYASAGQJElSEs/zUfDpAxzHoba2VsjMzKQjR45w5eXlKrPZjKqqKpjNZgCQfPZuE4AaxlgFYyyfMVYeFRXVcOzYsVEJCQkvAzBu27bNOn369GDGGIKDg49ardYlRFQOoFtUVFRPxhhUKhV+//vfd//www/DvtUeA4DbRFGcr1Kpwj0eDz399NPsrbfegiAIxBhzE5GZMdYOpcM1RBTJGDN6PB65pKTEU1JSIvjaxfM8j5CQEC4kJAQGgwFqtRohISFcXFwcunTpgsTERF3//v1ViYmJUcHBwX1VKlUcAMiy7NTpdB0A2gE0E1EDlC3lLIA9l3rG/xdEFEtEXxIRnT171j148GAZyohe+cEHHwwioulE9DwRbRVFMVeSJOu3/bRERDU1NdLrr78ujho1iqKiokitVpOv44gxZmOMFTLGUgG8znHcHwAMheIKDfTVI5qI1vg8V+7HH3+80yTzGo3GHcnJyV2ISENEk//whz88ZzabZSIiWZaptLSUVCrVXy9ok5qIhrpcrjNERF6vl3bu3EmBgYEExQrI4TjuWQCDfQI06fX64cOHD3/4gQce2PToo48efemll6o2btxo++qrr4QzZ85IFRUVcn5+Ph09epQ2bNhAd955J4WEhHS+z8kYo5iYGLrtttucn3/+eXtjY6NTFEXpW90k+vowV5KkLCIaeDH5/KwlmogmSpL0JsdxyZs3b5Y2btzIhYWFWR966KHcESNGMI1GEwtlT9Vc+JwgCGhrayMiYmq1GkFBQeB5Hu3t7UhPT6ePPvqoIz09vdJut58DUMcYK5Jl+RiUJasd38rMIKIkAK9ACW5gy5Yt9M4777DevXtLI0aMyJ4zZ84GKCbTH2VZbjpx4kTN8OHD725sbMSuXbvEuXPnqmbMmHFm586dswEUElF4c3PzX0JDQx9VqVQqi8WC8ePHIysrS2CMfUREfyYiEUA/KDlcQ6AMuGh8Ezq1O53OhoaGhqaioiJnZmamlJWVZaioqDC1t7dHhYeHh6WkpIQkJibqhgwZgh49elBUVBQFBQVBrVYzxhgkSYLFYqGCggJvRkZGh9lstp0+fbrB6/U2m0ymNrfb3XDo0KHDAL6GslVcGgGTkjy3zOPx/Km6ulpfXV1t9Hq9XI8ePbzdunVT8TzPAYDb7ZYaGhqEzMxM+cyZM2qr1apub29HdnY2KisrERoair59+2LKlCmYNGkSrr32WgBAfX19e2Fh4T937dr1yurVq83fFui36tIbwBookSkAwJ49e1BQUIDrrrsuc8iQIUfMZnN9TU2Nu62tzVNSUiInJiY+OWvWrOTMzEw89NBD2LVrF8rLy3HzzTc/Iorimzt37ozr37//V/Hx8b0AYO/evZg8eTJEUTx1/fXXrzx69GgEgPt9ApUAVIqimG02m0tPnz7t2LBhg3fHjh2BsixHybJs0ul0MUlJSTE33XRT9Pjx44P79eunCwkJ4bVaLRhjsiAIYkdHh9DU1OStr6/nzGaz0ev1aomIy8rK4jZv3gyv9z/cB3bGmJmIqgCsBLD3p8jx2x0ZTEQ3EtESt9v9cWNjY0FxcbHb4XCQ2+0mh8NBjY2N3pycHPu6devss2bNEhISEjqjJ51J352pKG4oLjsXAMlgMAgTJ060bdiwQWhubiYioubmZntaWtpaKCG976vTWCKqJyKqqqpyjBkzhnr06EFBQUGk1WrPAljCGHsFigb/AYAvevfuXbh3716RiGjz5s0UERFBW7dubfZ6vfLDDz98DEDEtGnTBpWVlbUQEUmSRP/3f/9HGo1GfO211/YSUQkRVRHRe8XFxbOnTJlyG4DFjLGNUJL6Khhj9QDMAJpnzpzZcfDgQW9JSYlw4sQJx6ZNm6pfeOGFg5999tmOsrKyQ1VVVRnHjh3btXTp0k1RUVEfMcaOMcaa8U0CxYUfL2OslTFWwxjLAvAILnK47aJKFhElAPirJEk3er1eWRCEUI1GE6/RaDiDwcC1t7ejsLCQdu/eLWzevJmam5v1ADgikn2+2jbGWAsR2RljbQAaOI5rlGXZBSAKQD+Xy9U/NTU1Mi8vz1tZWel+4IEHdPHx8cbExMR5n376qWvWrFlLoZxm6KxTEIAlAJ4lIrz77ruNDz74YLTv1yIUpY4xxuYRkRVKeK43ANWgQYNqExMTkwDwJSUlgtVqVc2cObMyKyvL8corrww3m80PVVVVVebl5akSExMhyzJqa2vx+eefe8aOHTsEwKeLFy/+9M0337yeiBYCSIRiWqmgKIACAFdCQoJ72LBhntmzZwfs27ev9OzZs2VZWVnm6OhooyAIxpqaGn1HR4cgy3IXxlgfIgoEoGOM8QA4xhiIqPOojQOAmTFWQkT5HMe5ZFmuBPAxLqJRX1TAVVVVQ/R6fW+NRpNoNpu5wsJC6ciRI0J7e7t++vTpmDx5MkJCQphKpdJwHCekpaU15ubmFjLGShljRUR01qf5OYjICaCF6HydVACGENEkAFPq6uoGvPHGG2CMOebPn2/s3r27saCgYM6iRYtO/v3vf9/iE24KgJcBzLTb7fXz58+nLVu2dOYiewGcZYwdAuBgjImMsTrGWBNjrI3n+frbbrvtOZPJpAKAkydPQhAEB2Osb1FRUfagQYO6fvjhh8+mpaUdLy0tNRIRXC4XFi9ejK5du7J169a99Pjjj/OCILxNRHG+NGA7gHIoJlptaGho3YMPPqidO3fuoNbW1lNHjhw5vGHDBkdLS8tQxtiwlpaWOFEUQ2VZDoSiFxhIcbcSlLQcK4AOIvIwxtwAKonotEqlOiiKYhGA9s5TGJeC2JiYmD/PmjXryNixYxuCg4M7D265BgwY4Fy9erW8e/dueefOnXTixAmpvr7eXVNTU1VTU/O+1+sd/SPK0QGYBGUptRuNRkpPT/f4NHN5+vTpOwAkE9EIIjpGRFRaWprTq1evNnxzqOwQz/Pjg4KCwqAE843wdaDv/Soi4vPy8k4SEdntdurRowcBKGWMlc+cOfNkTU1NPRGRw+EQ9+zZI8uyTI2NjVRdXU2DBw8+5fNsmQG0MsZOM8bWcBx3P4DhALrOnz8/gohGEtEOIhq1aNGibhzH3aVSqTZEREScVqvVpb449inGWJ7PxCsFkAngE47jnuV5fgaAcQAmArgZl++kJADFeb+BMWaGos2W+9b+L3mez4yMjHSZTCabyWSypqSkNI8cObJmyZIlpSdPnqxsamoqra6uXtfe3j7GZ0ppLlIWoKTSrON53rNv377zpxO6du1a/o9//GOVb7+V169ff1in07mg7OkOAGs1Gk0vXOSI5t69ewdYLBYbEdHBgwdFjUZDjLE9PpOndtq0afs6912n00k+Acs7duwgjuMsUG4POMcYW6FWq//DRCEirdfrvYGI3qqpqRkWHh5+LcdxS0JDQ/fp9foMADsAPA5gLJQslusB3A5gBpQBEvDDxXLpiIeSnfgMx3GLfKPrGt/P/wogx6dQ1DHGin1L457AwMCvBw4cmHXfffft37Nnz+aioqLHamtrbyCi8O8v6jz9hgwZsu/06dNERHTkyBF6+umnXUQkC4Jgnjp16iEo+6wM5YTho/iBo3zXrl1/9Hq9ssPhoJUrV3qhzP51KpXqBgAnhw8fbm9raxM77WNZlqm1tZUefvhhMplMIoBcXx/8B6TkaI0gor/Z7fbVMTExEwCsCA0NTVOpVP/kef6mC77OcAVTcS62B9cA+DeUox72C37OATgCoM63n0YQUed5nmC73d586tSpMzk5OeEbN2506fV6zJ8/f8gtt9zS1Ww2F5hMptxfWAEAAAwySURBVELG2PeFDUtMJlNGenr6GADMYDCwp59+Wpeenl48fvz4ekmSRkGZuZkcx70qSdJ+KPvgRdFoNEPVajWrq6vDmTNnOmf7ObVaXS2K4p6ioqLEhQsXGj/++OPzPmO1Wo3evXsjKCjI3tTU9JkkSVsvfKdv/xwCYIEkSUnPPvvsRovFMk+v18e4XK5Toig+BcVaYFDOH6ugWBG/ygNpIVCWnLUA1nIc9yiAezmOu4fn+Zl33nnnXTt37ny4qKhoDhF9X06SHsCiiRMn0okTJ2Sz2UwLFiyw+7YJDxQbcLNvifzBh9mIyHj8+PHjvuWZhg0bJkNJErgTiiOmJ4BtAOQbb7xRvDCna/v27XTNNdfkw+dI+dZ744noSSJqaGxsPKRWq9cB2MPz/CszZ87UAECXLl30wcHBofj1X3pzHh7KMj4ewHSe5yeoVKqhGo3mmnvuuWdMenr6iuLi4tXl5eX/FVQAEPb6669/ZrFY6MyZM+LQoUNboYx4LxQb8xUAsT+2Qi0tLT3LysoaiIjWr18vxsXFEWPsCJQsxs6OXwJlNaC8vLzzAj5+/DhNnz69FMB0KAMQgOLwIaJxRHSEiKQNGzYcZYwdAPCJRqOZDmW2GnzP/OIzJH8KWigNjIDi1rtBrVYPWLVq1YyKioqM5ubm7HPnznXmMIOItG63+1mn02nOzs5uTUhIsDDGbFCOcpziOO5eXNDBP4bs7OzfWywWFxHRkiVLXAaDgQBsNhqNfYhoIBEtLiws/HL37t3tX3zxBdXV1VF7ezv5nCi0du1aZ0RExFMxMTHnHS82my2KiP5PFMUOIqLrr7++CIo7dUNkZGQAAN2gQYM6l+XfPAYoWvIUnufHfPXVVyttNltHY2NjZVZW1gIiSiaiD4nojNlsPm4wGNKh2ITtAL5UqVQ3AucDAaGknOv5QRCRKi8vb23njBw2bJgDgGPJkiX/cjgcaUTUREQSEVncbre1paVFsNlsRETUmWhw7tw5WrVq1dcLFy6MveC9fa1W6+ZOzdtoNNZBWQGegSLUzhDi/wwaKArJknHjxi3Nz88/S0RUW1vb5HA4zhLRiYaGhn3dunX7t16vbx0xYoRt2bJluefOnVstSdJrRPQ1EdX4zKVaIsogokWkeNu+FyKKra6uPkpEVFZWRjfddJM7IyPDa7fbLYIgHCKix4nohvr6+sjRo0cnjxkz5sX58+e7Nm3aRLm5ubRr1y7yPWtNS0t7kojCiIgJgjC5o6OjnIioqKiIoKw0rQAm4H9MsBeiA/AHANs+/vjjUxaLxeP1eqm4uLixvLw857nnnst59tln3Xv37hWqq6stXq/3LBEdJqJySZJKRFE8KoriSVEUi0VRzJYkqcQn9C1ElPxdBQqCcFNbW1sjEVFxcbFcVlZGn332WduECRN+BwABAQGRAOYxxt5jjKUxxkoYY26e52n06NG0b98+EgSBBEGg4uLisrq6utm+QfOH9vb2ZiKibdu2dfrbK/GtUxNXk6uxN7gBHAkNDR3ndDrHaTQa/tSpU57Y2FhTeXl5UP/+/VUFBQXixo0bjwYFBS2zWq1V2dnZXSIiIpLq6urUBoMhODQ0NDkmJiY2MDAQsbGxwrBhwxyTJ08epFar9xPRJgCvMsbOH8BubW0dGBISEupwOFBWVia9++67qm3bth3geV4A8KzD4ZgCoCsRaX3uRwZALUkSDh48iH79+sHtdtOECRNYQkJC9/r6+kVOpzO4ra0tVKPRqAGgrKxMhqKsdeAXeFDsikJEQ8xmc6EkSXTkyBEpNzfX+8Ybb9DgwYNJr9fbGGMHOI5bwnHcI4yxfwHIAVAKJY3FgQuiUxqNhmJiYipuvPHGfR999NEej8dTT0TZRHT+xru6urpNRESZmZk0cuRIu+/ZPCiZmw1QPFQ1jLF8KG7DU4yxBp8v2G0ymaRZs2a5Dx065O3o6KCWlhZXS0tLTnV1dUZVVZXT7XbTggULOqM/+65cT16cKz6DiWgmgNdNJlN8WlrauYKCgm6bNm3C6dOn5aCgIJEx5lar1SFer3cuYyyUlIQ1xhgLABBI/5mB2O71ei1ms7lVrVbr1q1bZ9y0aVP9Bx98EB4VFbWXiO5njO1Vq9X9AGDr1q04evSoBoog4gBYoPiiTzPGchljNZIkWQGEkhJn7scYS2xubu6+devWmMjISJcsy+pBgwbpdDpdf41G4+R5XudwOBAcHMz53lt+JfvzYlxRARPRAgArAJiLi4uXv/fee2MOHz4ca7FY1BqNhhwOhyQIghOAlTHWCKCR47hqAAIRhTHGnIwxRkSRAMJ89TcRUURNTY2xvb29dOTIkaaGhoZExhgXERHxidVqXcTzfHcAyM7OhizLKigOkxKO43ZxHJcqimIJKWHFC8kA0IWIbgRwlyzLUZs2bdI6HA43AN0NN9zABQYGBgBKhkp4eHhniKf6Mnfjj+KKCJiIdABeB7AQQM7bb7/99+eff35WU1PTACiatQAlQpPJcVwGY+yMRqPJDwoKspjNZgm+6wZ9blGGb1JbdQAiOY7rodPpxno8ni4dHR3MbrdbYmNju7e2trpVKtWrRqMx2OFwIDc31wtAzRgr5DhuhSRJO2VZFr6jyoCylxZAmeXdiCjGZrNds2vXLq9arXaHh4fr+vRRUr1bW1thtVpFKEH6c5elE3+pEFESEe322YoHk5OTx3McdxLKPir5she+BLAYQL+oqKjOOyt+iJnR6d8NB3ATgOdUKtVXTz31VKHdbneXlJR4CwsL7UREq1evJigH3Oy+O7J+jKbbB8AyAFUAKDg42DJv3jxvRUUFCYJANpuNtmzZIkZFRbXjO9yZV5PL6hsloukA3ocSGtsQGxu7uaam5g2fAiQDOMZx3DqVSvVecHDwAbfb3ehwOLxQokU/1BkvQ3Hmt0ARgK22tnbs4cOHWwsLC6W4uLgQjUaDN954QywvL/cCaCeiDwDk/4imNPk+JsZYvMfjCcrNzfXGxcWpu3fvzsLDwxEUFMTFx8dzTU1NuXV1dUd+xLt/nRDRciJyEhF5PJ4Xw8LC7gHQCEUgdgCr1Wp1n7CwsCB8M1t/jr+WB6BRq9WDAGQwxly33367taGhgaxWK8XExAi+sk9CyYT8sTAot/e858uLIsaYGB0dTS+//DI1NzdTdXW1tHTp0nWdjpCf0ZZfLqTERv/c6Rb0eDyvBgQEPOXzKctQPD2PBwYG/pDY8I+BAYAv8P8FAFq+fLnU6UtWq9VCWFgYAdgCRUH7KWihBOw/9eVenU+IS0xMpK+++spz4MCBY6TkV/02IaIAIpoqSdJ7VVVVSxhjm6BorTIUm3MhlPsnLjWdM0YFJRlB2L9/v4eIKC0tjfR6fXNSUlIjgAfw87amAABTAOz1OUUIvi0lICBATE5O/hzAd3rUfjMQkdpkMg335TB17qetHMc9hCvjxkvs16/fX+12u0OSJFq5cqUTQB2UATbyErw/AMAdAIqgtE2CogO4fOUsBxB6Ccr5RcKgKFUHoDTcC0X5+TOu4B/MEARhrG+LkOfMmeOE0vkN+GZ2/dw90ghgKYDjjDGXzxo4CSX61QDgFvzE0OYvHQ7KQeyTvkNh6zmOuwtXcEQTkZGIPiNS7qdKSUlxQZlpFTqdLgGKcH5IEuDFMEC5SmItFDvezHHcY4yxCgCbocTBf5N0hWIPTvNFaq5o6IyIBhCRlYjIarWSRqPpFPBhvV4fB0VZUl/CItVQZmwZgM08z4/3/f9SDKJfJByURl+VmCgRPUFEAhFRTk4OcRzXGWB4z5c3fbkYCuCWLl266PEbXZ6vOj4zrbzTTMvMzCSdTueEIuBHcXlnlQq/MMH+FnOFboZybhiAcj0xfZN0X4EfdsvPT0XE9xzjvFr8FtNKbsMF7Vq3bh08Hk+n3dt+dark55JAyt82+rRzec7JySGdTnfh8ctLYQP7uZoQ0YiysrL0DRs2WKKioi4UrgQlGe5/it/cHswYy+B5vkSW5ZFE/xGQ4qDYrf91tf5vmd+cgAHESpKUjP9u2x4AJfgfEi7w21SyhuG7r+xNhZLS+j/Fb3EGa+C714Mpf5uwXJblD6EcLPtF/C2jK8lv5rTbBbQyxlSMMQKwmeO4N4noSygBAD+/ESKgnIO6rNcf+PHjx48fP378+PHj57fI/wOAZTcyrrtvRgAAAABJRU5ErkJggg==","caltrop.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAAACXBIWXMAAAsTAAALEwEAmpwYAAA5xWlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4KPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNS42LWMwMTQgNzkuMTU2Nzk3LCAyMDE0LzA4LzIwLTA5OjUzOjAyICAgICAgICAiPgogICA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPgogICAgICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIgogICAgICAgICAgICB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iCiAgICAgICAgICAgIHhtbG5zOmRjPSJodHRwOi8vcHVybC5vcmcvZGMvZWxlbWVudHMvMS4xLyIKICAgICAgICAgICAgeG1sbnM6cGhvdG9zaG9wPSJodHRwOi8vbnMuYWRvYmUuY29tL3Bob3Rvc2hvcC8xLjAvIgogICAgICAgICAgICB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIKICAgICAgICAgICAgeG1sbnM6c3RFdnQ9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZUV2ZW50IyIKICAgICAgICAgICAgeG1sbnM6dGlmZj0iaHR0cDovL25zLmFkb2JlLmNvbS90aWZmLzEuMC8iCiAgICAgICAgICAgIHhtbG5zOmV4aWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20vZXhpZi8xLjAvIj4KICAgICAgICAgPHhtcDpDcmVhdG9yVG9vbD5BZG9iZSBQaG90b3Nob3AgQ0MgMjAxNCAoV2luZG93cyk8L3htcDpDcmVhdG9yVG9vbD4KICAgICAgICAgPHhtcDpDcmVhdGVEYXRlPjIwMTYtMDMtMTlUMTk6Mjc6MTJaPC94bXA6Q3JlYXRlRGF0ZT4KICAgICAgICAgPHhtcDpNb2RpZnlEYXRlPjIwMTYtMDMtMjBUMjM6NTM6NTlaPC94bXA6TW9kaWZ5RGF0ZT4KICAgICAgICAgPHhtcDpNZXRhZGF0YURhdGU+MjAxNi0wMy0yMFQyMzo1Mzo1OVo8L3htcDpNZXRhZGF0YURhdGU+CiAgICAgICAgIDxkYzpmb3JtYXQ+aW1hZ2UvcG5nPC9kYzpmb3JtYXQ+CiAgICAgICAgIDxwaG90b3Nob3A6Q29sb3JNb2RlPjM8L3Bob3Rvc2hvcDpDb2xvck1vZGU+CiAgICAgICAgIDx4bXBNTTpJbnN0YW5jZUlEPnhtcC5paWQ6Mjg4NDIwYTEtZmQwZi0xYjRjLTkyNjMtMzEzZDJmYmZkZjRjPC94bXBNTTpJbnN0YW5jZUlEPgogICAgICAgICA8eG1wTU06RG9jdW1lbnRJRD54bXAuZGlkOjAwNGViNGM5LWUwMWUtNTc0OC1iNjk4LTUzYzc5ZjNjMjM0MDwveG1wTU06RG9jdW1lbnRJRD4KICAgICAgICAgPHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD54bXAuZGlkOjAwNGViNGM5LWUwMWUtNTc0OC1iNjk4LTUzYzc5ZjNjMjM0MDwveG1wTU06T3JpZ2luYWxEb2N1bWVudElEPgogICAgICAgICA8eG1wTU06SGlzdG9yeT4KICAgICAgICAgICAgPHJkZjpTZXE+CiAgICAgICAgICAgICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICA8c3RFdnQ6YWN0aW9uPmNyZWF0ZWQ8L3N0RXZ0OmFjdGlvbj4KICAgICAgICAgICAgICAgICAgPHN0RXZ0Omluc3RhbmNlSUQ+eG1wLmlpZDowMDRlYjRjOS1lMDFlLTU3NDgtYjY5OC01M2M3OWYzYzIzNDA8L3N0RXZ0Omluc3RhbmNlSUQ+CiAgICAgICAgICAgICAgICAgIDxzdEV2dDp3aGVuPjIwMTYtMDMtMTlUMTk6Mjc6MTJaPC9zdEV2dDp3aGVuPgogICAgICAgICAgICAgICAgICA8c3RFdnQ6c29mdHdhcmVBZ2VudD5BZG9iZSBQaG90b3Nob3AgQ0MgMjAxNCAoV2luZG93cyk8L3N0RXZ0OnNvZnR3YXJlQWdlbnQ+CiAgICAgICAgICAgICAgIDwvcmRmOmxpPgogICAgICAgICAgICAgICA8cmRmOmxpIHJkZjpwYXJzZVR5cGU9IlJlc291cmNlIj4KICAgICAgICAgICAgICAgICAgPHN0RXZ0OmFjdGlvbj5zYXZlZDwvc3RFdnQ6YWN0aW9uPgogICAgICAgICAgICAgICAgICA8c3RFdnQ6aW5zdGFuY2VJRD54bXAuaWlkOjI4ODQyMGExLWZkMGYtMWI0Yy05MjYzLTMxM2QyZmJmZGY0Yzwvc3RFdnQ6aW5zdGFuY2VJRD4KICAgICAgICAgICAgICAgICAgPHN0RXZ0OndoZW4+MjAxNi0wMy0yMFQyMzo1Mzo1OVo8L3N0RXZ0OndoZW4+CiAgICAgICAgICAgICAgICAgIDxzdEV2dDpzb2Z0d2FyZUFnZW50PkFkb2JlIFBob3Rvc2hvcCBDQyAyMDE0IChXaW5kb3dzKTwvc3RFdnQ6c29mdHdhcmVBZ2VudD4KICAgICAgICAgICAgICAgICAgPHN0RXZ0OmNoYW5nZWQ+Lzwvc3RFdnQ6Y2hhbmdlZD4KICAgICAgICAgICAgICAgPC9yZGY6bGk+CiAgICAgICAgICAgIDwvcmRmOlNlcT4KICAgICAgICAgPC94bXBNTTpIaXN0b3J5PgogICAgICAgICA8dGlmZjpPcmllbnRhdGlvbj4xPC90aWZmOk9yaWVudGF0aW9uPgogICAgICAgICA8dGlmZjpYUmVzb2x1dGlvbj43MjAwMDAvMTAwMDA8L3RpZmY6WFJlc29sdXRpb24+CiAgICAgICAgIDx0aWZmOllSZXNvbHV0aW9uPjcyMDAwMC8xMDAwMDwvdGlmZjpZUmVzb2x1dGlvbj4KICAgICAgICAgPHRpZmY6UmVzb2x1dGlvblVuaXQ+MjwvdGlmZjpSZXNvbHV0aW9uVW5pdD4KICAgICAgICAgPGV4aWY6Q29sb3JTcGFjZT42NTUzNTwvZXhpZjpDb2xvclNwYWNlPgogICAgICAgICA8ZXhpZjpQaXhlbFhEaW1lbnNpb24+NDA8L2V4aWY6UGl4ZWxYRGltZW5zaW9uPgogICAgICAgICA8ZXhpZjpQaXhlbFlEaW1lbnNpb24+NDA8L2V4aWY6UGl4ZWxZRGltZW5zaW9uPgogICAgICA8L3JkZjpEZXNjcmlwdGlvbj4KICAgPC9yZGY6UkRGPgo8L3g6eG1wbWV0YT4KICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAKPD94cGFja2V0IGVuZD0idyI/PhPvi7QAAAAgY0hSTQAAeiUAAICDAAD5/wAAgOkAAHUwAADqYAAAOpgAABdvkl/FRgAACcJJREFUeNrMmGlsHOUZx//vO+/Mzs7OHt5dr72+vXbiI45jSOIkjuOQoyIhHG1IKRVVglpEiyraqpValQ89BIgqQEMRVC0tJIBC0kIoDSiFpMRNG7ATgRLHCXHI6fv22nvP+faDUVuCC97IrXil+fiOfvMc//8zD+Gc4/N8GABsaFx5TZc5uCOWSGw913vlYDQR754LoKsDxgBgaGo86xfZnMPJpJaWlpZn5g9XPT88MnE3E8X/TQSvJcucA7puNDQ2rYCuGzcf2LEj30MwxAmZe8CIYWYPaNtIqO4607SwoG5B4DmODcf7e3YJTJx7wDOGkW3tgRKKIodcY+o6/P4cVDYsur2/5/IuBxXmHjDo815LMecpsjNiGSaYyLBu3do19qW+eT7Vc56Dzy0gk+UsIwhQkHJVVQOgBIwKWLvpJteB1/bffG5oYMdcNst0F4+NZnXJsm0E3N46RZZBCIFlmgiVlmDZqubbHnrkwR1ORYFA6NwBWtzOUmJsKE7nItWlwtQ0WIYJWBY23HJL844nn144Ep3oTFsZzIUJMADwS4HsAG0bisO5gDEGQ9ORiMWg6zrKa+YLd6z/4s279v6hc0qbmpMIUgDwZuTZP2kZXl12y5Kj0uY2TNOCPy/vX2LavGnVl6I0SsQ5qkMGAF3mxaysSGJiaQM8YcMwkEgk4A34Qei0QC9rXrm0qrS88cS5s8fmDNDO8CzSyyG4hBoOzgzThGlZ4JxjcmQcvrxc5IRDWN64bPOJrg+OeRTlky8gBCQLt2EAIBBp9jVBOETmqGcCA+cchqEjk0rjfMcpFFdUoLi2Chs23XTbnw68/lNFVTNXR980DBiWlR2gQ6VZpVhxSdeLjAGE8EwqTU60tcNMpTB86QqC4Tw037C6KjcQbLnc13NQEv/98ZQK4IaB8XgsO8BKf242U4zHkhz1lFIQwCKEsGRsCgIIEvEEzr9/CvXrW7By+Yotnc93HXQ5LIAQyIIARRYRz1J6pnVQVbMZEipkysKEEE0QBOZWVYBSGJoOLa2DW4ARi2PN+vU3/XHfK36n4pwwTAvUtkAJydoEGQDIbPY1aJhGjeyQBAKiAxBEUQQRBEzFYiCcwqd6Mdrbh/qGRYWNDddvHZsYfWIiFkciPq2L5FoAW4+/MzuLsyxUFpfV1M+rBiFE5JzDtm3YHNB0HS5ZheSQYBka/IEAikpKHvf4vOVTnZ0/Nw1zgov82oSafNT6n/ZwzuFV3c5wMHeTaZsAwCzbhqZrMA0DoijBq7oRDAWRNC3s3/caRCbS22659Tu/efKpjgXVtd/XDTOUrf0RzjnqyutmZ2+y+PWy4vCzkbIyDA4OQWQiQuE8rGhqAjUtVJRXIqoncejttwHbhtfjQfvx47hjyxY0Lm3E262tkw9vf+QHF3p7nhPozMphXiVBDABGxro/E86hKN6C/KoHBEIhihJqqqvRde5D6LoOhyQhLxzEhwPdaGtvh8QYxsfGkEwksWTxYuzeswc11TWoiER8km27Kt0eUEGYfQ3SROJTZz8RQFFu3n05Xm+FU5Yx0D+AhbULcH3DIlzu64HkcODoe8cxPDwCAcBAfz8CPj8cogTLMLBsaSPePPgWuru7Bweik6/ITjm7JpG8pZ8y+3EILl4XLCl9wO1UIDIGQRBgaiaqSubhYk83XtjzEirKyuFgDIlkGsV5BXCIEkSHBF03UFQcxsXebux/Y/8+0TYHeTqVpQ5Omf/138PBREQihdtD/oDbITkgiSI8qgd1tdWIp5M42dmJjJaBmdGweEE9auoroaU/cjiBQhRF2LaFDTesw9nz55rf2P9WII3UeFaAg6x/ZkATKA8X35sXDmxUHE74vT7kBUK4rqEeo/EJvPzGfhDOEfDloLevD1o6g613VqJu0UKM9A4C3AZjDMGSAgSL8vHD+7/XMNI//Osj77d/JasubvbUz5BbgHvsslBN+FikqCzk83gxr7QcVbXz0XXlIjpPdSKVSuHE6dNwKQoYY9A1Haqi4J5vfROr1t6AqdFREIHC6XFj8NwFREcmMZqO42ePPPijk11nt89ms0A458gjBZ9ILaMUdfUVLy1ZsvCrJflFKCsuRkmkCOcvX8GF8xcQyg3g9UOHMDI2DtkhgTEGAjJ9l1DcuGEjtn77Xri8Hlx67z1EB0YRT2TQOzyAWCZl/OJXj2/qGx4+NCvAu0q2fDx4ho1ETnxbZEnhrmW1i1FSWIj80ny8c/w4Ojo6saB6PoZGRnH4naOglIIQAockTdsYIRAoBbds1FbVYOt99yLgc2Oip5ePjERxubeb6JaFyXTyykOPP7o6loj3fCbgioZFHxPKkrz8SEFu4bEldQ3ByrJy7i8IkMNHj+Jw6xEkUkm0LF+OqXgcA0NDGI9ODBGQLpvzCkpJMRMYQACBUHDOkePxobysDPMi5QiH83lKy2BkdJTILhda2949/PKfX90oOZ06oRS2ZWF4eHiG3cx/zGycmtAt8uP5ZRXBitIy0xVQ6c69e0jHyVOgTECktBQiE3Gxp7u/o+vs07Jp/m7pkhVjfYND6nhmcrVbVrbKonQjkUSvKEqYSsbRcaYTHWc6EfDlkNrqapSVlyCdyWBNc/NamOajUS39XZsAmqbN3CSbF01H0LYsMI+vubZ+SeuaZSsFT66XP//yXnqy4xTcqhs+jwe5weDFI8fanuoZHtzFbT4ZVhQ0Lm1CT/8QxtITYIYJn9NVpDF2uyrLX3NI0mKRMSIIDIZpwjItlJeUoGlFIxxOJybTaeza+eK2v5849oIgUOi6/klAgRDYALyKi335C5v+tnnjrStDhbn2zr27aUfnabhdKmzYXQIRdgyORHf3jvYkCRVgWRbync6PA+omvE4Fk5YN29IFiYlLVad7m0txbJZlZ4hRinQmA0VR0LS8EZHKSnx4+dLow4891jI2Fe26ugYpAEQKClAaCuG6mrr71zWvXhnI9+PZ3S/SMx+chaqql1OGti2TSjbEEvFnbNtOUkrxWfuXjyYgyzSt9lgicd9wbLw6OjTwjXgi2UYFARlNQ+uRf+DQwb/ahfnh3Hvu2vqsIsjKjOOW6FZRUFhUtW558088OR78dtdOdJw53RZLJe+0BVpvgb8AcI0SClzD/o9Mr0ui0NLPmYa9ytJ501Rs8uGMpn3Q3dPDX933KoK5/qbVjct+OaOTZOJ6gz/k257MpHy/3/1i6+TkxHbDMg+Ox6bsQG5uVr+Js8C1GGVtqUy6LTY59ZDgdKwRBHb3wP7Xl4LS9IyAFariErjV/u77x56wbOuAy+EE9P/LjjxjWOZfJpLxN61URpJklzZjF3+eD8Xn/PxzAMgNZETL/3GIAAAAAElFTkSuQmCC","poisoncaltrop.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAAACXBIWXMAAAsTAAALEwEAmpwYAAA5xWlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4KPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNS42LWMwMTQgNzkuMTU2Nzk3LCAyMDE0LzA4LzIwLTA5OjUzOjAyICAgICAgICAiPgogICA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPgogICAgICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIgogICAgICAgICAgICB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iCiAgICAgICAgICAgIHhtbG5zOmRjPSJodHRwOi8vcHVybC5vcmcvZGMvZWxlbWVudHMvMS4xLyIKICAgICAgICAgICAgeG1sbnM6cGhvdG9zaG9wPSJodHRwOi8vbnMuYWRvYmUuY29tL3Bob3Rvc2hvcC8xLjAvIgogICAgICAgICAgICB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIKICAgICAgICAgICAgeG1sbnM6c3RFdnQ9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZUV2ZW50IyIKICAgICAgICAgICAgeG1sbnM6dGlmZj0iaHR0cDovL25zLmFkb2JlLmNvbS90aWZmLzEuMC8iCiAgICAgICAgICAgIHhtbG5zOmV4aWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20vZXhpZi8xLjAvIj4KICAgICAgICAgPHhtcDpDcmVhdG9yVG9vbD5BZG9iZSBQaG90b3Nob3AgQ0MgMjAxNCAoV2luZG93cyk8L3htcDpDcmVhdG9yVG9vbD4KICAgICAgICAgPHhtcDpDcmVhdGVEYXRlPjIwMTYtMDMtMTlUMTk6Mjk6MDJaPC94bXA6Q3JlYXRlRGF0ZT4KICAgICAgICAgPHhtcDpNb2RpZnlEYXRlPjIwMTYtMDMtMjBUMjM6NTQ6MDFaPC94bXA6TW9kaWZ5RGF0ZT4KICAgICAgICAgPHhtcDpNZXRhZGF0YURhdGU+MjAxNi0wMy0yMFQyMzo1NDowMVo8L3htcDpNZXRhZGF0YURhdGU+CiAgICAgICAgIDxkYzpmb3JtYXQ+aW1hZ2UvcG5nPC9kYzpmb3JtYXQ+CiAgICAgICAgIDxwaG90b3Nob3A6Q29sb3JNb2RlPjM8L3Bob3Rvc2hvcDpDb2xvck1vZGU+CiAgICAgICAgIDx4bXBNTTpJbnN0YW5jZUlEPnhtcC5paWQ6YmJmNjEzMWItN2QwMy1kNDQwLTliN2QtNzE5YzRkZDA5OWQxPC94bXBNTTpJbnN0YW5jZUlEPgogICAgICAgICA8eG1wTU06RG9jdW1lbnRJRD54bXAuZGlkOmNlYWJkMmEzLTMyYjYtODU0Mi04ZTAyLTkxYzdlYTllZjg5NzwveG1wTU06RG9jdW1lbnRJRD4KICAgICAgICAgPHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD54bXAuZGlkOmNlYWJkMmEzLTMyYjYtODU0Mi04ZTAyLTkxYzdlYTllZjg5NzwveG1wTU06T3JpZ2luYWxEb2N1bWVudElEPgogICAgICAgICA8eG1wTU06SGlzdG9yeT4KICAgICAgICAgICAgPHJkZjpTZXE+CiAgICAgICAgICAgICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICA8c3RFdnQ6YWN0aW9uPmNyZWF0ZWQ8L3N0RXZ0OmFjdGlvbj4KICAgICAgICAgICAgICAgICAgPHN0RXZ0Omluc3RhbmNlSUQ+eG1wLmlpZDpjZWFiZDJhMy0zMmI2LTg1NDItOGUwMi05MWM3ZWE5ZWY4OTc8L3N0RXZ0Omluc3RhbmNlSUQ+CiAgICAgICAgICAgICAgICAgIDxzdEV2dDp3aGVuPjIwMTYtMDMtMTlUMTk6Mjk6MDJaPC9zdEV2dDp3aGVuPgogICAgICAgICAgICAgICAgICA8c3RFdnQ6c29mdHdhcmVBZ2VudD5BZG9iZSBQaG90b3Nob3AgQ0MgMjAxNCAoV2luZG93cyk8L3N0RXZ0OnNvZnR3YXJlQWdlbnQ+CiAgICAgICAgICAgICAgIDwvcmRmOmxpPgogICAgICAgICAgICAgICA8cmRmOmxpIHJkZjpwYXJzZVR5cGU9IlJlc291cmNlIj4KICAgICAgICAgICAgICAgICAgPHN0RXZ0OmFjdGlvbj5zYXZlZDwvc3RFdnQ6YWN0aW9uPgogICAgICAgICAgICAgICAgICA8c3RFdnQ6aW5zdGFuY2VJRD54bXAuaWlkOmJiZjYxMzFiLTdkMDMtZDQ0MC05YjdkLTcxOWM0ZGQwOTlkMTwvc3RFdnQ6aW5zdGFuY2VJRD4KICAgICAgICAgICAgICAgICAgPHN0RXZ0OndoZW4+MjAxNi0wMy0yMFQyMzo1NDowMVo8L3N0RXZ0OndoZW4+CiAgICAgICAgICAgICAgICAgIDxzdEV2dDpzb2Z0d2FyZUFnZW50PkFkb2JlIFBob3Rvc2hvcCBDQyAyMDE0IChXaW5kb3dzKTwvc3RFdnQ6c29mdHdhcmVBZ2VudD4KICAgICAgICAgICAgICAgICAgPHN0RXZ0OmNoYW5nZWQ+Lzwvc3RFdnQ6Y2hhbmdlZD4KICAgICAgICAgICAgICAgPC9yZGY6bGk+CiAgICAgICAgICAgIDwvcmRmOlNlcT4KICAgICAgICAgPC94bXBNTTpIaXN0b3J5PgogICAgICAgICA8dGlmZjpPcmllbnRhdGlvbj4xPC90aWZmOk9yaWVudGF0aW9uPgogICAgICAgICA8dGlmZjpYUmVzb2x1dGlvbj43MjAwMDAvMTAwMDA8L3RpZmY6WFJlc29sdXRpb24+CiAgICAgICAgIDx0aWZmOllSZXNvbHV0aW9uPjcyMDAwMC8xMDAwMDwvdGlmZjpZUmVzb2x1dGlvbj4KICAgICAgICAgPHRpZmY6UmVzb2x1dGlvblVuaXQ+MjwvdGlmZjpSZXNvbHV0aW9uVW5pdD4KICAgICAgICAgPGV4aWY6Q29sb3JTcGFjZT42NTUzNTwvZXhpZjpDb2xvclNwYWNlPgogICAgICAgICA8ZXhpZjpQaXhlbFhEaW1lbnNpb24+NDA8L2V4aWY6UGl4ZWxYRGltZW5zaW9uPgogICAgICAgICA8ZXhpZjpQaXhlbFlEaW1lbnNpb24+NDA8L2V4aWY6UGl4ZWxZRGltZW5zaW9uPgogICAgICA8L3JkZjpEZXNjcmlwdGlvbj4KICAgPC9yZGY6UkRGPgo8L3g6eG1wbWV0YT4KICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAKPD94cGFja2V0IGVuZD0idyI/PvBSt5cAAAAgY0hSTQAAeiUAAICDAAD5/wAAgOkAAHUwAADqYAAAOpgAABdvkl/FRgAACddJREFUeNrMWGmMVeUZfr7vfGe599xl9oUBZ9+HCzMDjCyibHZAwBa1GtMiaRtbf2hTmyalrabG1kSKQoxSo4igNbFNRUFxHECrrTAiiAwIjIwDc4flzjDLneVuZ/u+/kAblQHnjtPEL/lOck7OOXnO877Pc973JUIIfJcXA4Cb0laP72kiVMlWVx+LHdzdaR8NTgSgrxPGACBodib9Ii44vMQ/v3HB4mcyz6Zv6/p05hpZlv4/DMKKj+NLHXDuml6/OICp0aoVv3pgR26Cu0IS+T8AlCR5HNGl8MqpNU6CIFBXkVacsvV77YP7tsqSMvEAY05yDAoIUEhwq94qy7CRmZGGQKDoliPvvr1VJgwEZGIB+mT/OADSbLfiKeImhyIzLL5x0YL2g/FS3ZXSDoiJBejn/qSVJjG5yO9OTSOEgEHGgtvn6q9ufWt519mPNyiKOrEAg7w7qYcc4SBHyql2yx6AAjwBeGtUzG2cefPeJ17eoMUVSJiYUDMAEDzJHOQOvMwzzaulwBkBHFMAFrDkthvnrd+UM/Wi3XnMIglYwvzWIC/loJKdpAc68Gq+asYY7CgQ60/AbcrIn+WXvn/t6uV73n/x2FnRiQhGvjWDFABMSxvzNiwNtu32akwv4ZzD4ibchRqIEIACLF65cJUNSsgECYUBQFR0JPUHcUmufNCSXIMnMBKNQM+VQT6PZMOKyhnsEW3WxcHeAxMG0BJmUuF1U71SEMEsx4TtWOACMDsdqMUSvBUEs2cvvOVw0+kDPua73OBBk8pLBgA6tLEDBIdG1QCjMjgc2IaNRMRB9+4hZNb54VsoYenNN9y8s+kfD+pETeBLYDg4DJFIihAGANnuvOQ8UFHrZaoAFCIxYpGON7rABlUMt3jhK5Ewd1ldWW56+vzO/rbdClU/Zw6glCFC4+g3Q8kB9EqeJBgUPklxByiRAIBTSiVjIAFqUwwNxmFtpyi8T0f9dQ23HX7twG4P8cCBA5kqSGU+cCeafA4SmjvWEgGUmMVumeQSEJNRxvxuHwTjsKIWhuN9cHUwFAbdWNQ4f+m/XtudlqL6BwZpP4atCCRI4xOJSydjBmg7qNKYm1JQQYigisJgaw6GzoeRMBTo/hzgOBCYUZFXNCmweiQxsFEmEQhzGGIc1sMAYPf5F8d0sy0sVPlmVNa6rwcBZeJz27GIjbhhQmIuuFwMiAHZahYKpk56LDGYVnj4dO9Dlm0PCEmMz6ghpG/cnAMpUpYrz1W8zOE2AEgOt2GYCVgGhyQr8GrpyM5V0Kv3Y+dL70KhKl2+dOV9Tz78fGugsO5+0zKzku2BiBAC9drsMRUIbjX1pyXZNZvL8yoQvHAeClMxaUo6GubPhBz2Y/KUIgylnkLTe82QDAV+nw8th/fhjpV3or6+AW//e8/gQ5vW/vrTwSNbJMJGjxK3RjFqlvFNyoVGhT9dz/wd4TJkpqC2shpH20/AsAyokoac/Fycsvdjf9M+uIQHfRf7kBiJYcb0BvztlW0oL69AcUFRitty65UsAEqlsTNISM5Vy1OAoMYzfe2M7GmPaLIXREiYVloPRePo6D2JFbcuw7H2owj1hgCDojfUi3RPDjRNgZ6qwlZsKLKMYFdn6Pldm+o1RbuiEXYZHZczmA/5Kuw5kJm7piK1aK2upIBRBZLEEBkhqEoPoL33GLb8czNKrimD20rFcDiOSd5yaESHqgpYwyamFOTjVN9RbG/e8YpAZsgwaXIqtq8gfw4OlWgoT531lyzvZK/KXJAlDbqSgdmltYiSizjY9iHidhR8hKI+bxHK8ksQj9gAAajiQE4hEAMEy+p/iJOdbfO2v78zPYq+/i8ayrG1nUi9Yu553Vl356TkN7plHanuHGToBZg3tRYxchqbd20GHIpMVx66znUhMbQHP1lRiukNZQgdtyFZFJpMkT4byKwB/qA/MD3U3blp72dNtwOxsedgGqm/XE3gyFTUgjmTZh8ozKjJ8mqZKMkOYFZ1AdoGD+LI0eOIxGLYd+Y/8Ko+yFRFwo7Bw9Jw9713Yf6KahidAFRAzQFG3gE6giYuek/g90/98ret3fsftWB/42SBAkAY5762uxBDL4pSKh+pyJ6VVZhRi4aiG9A4swBdw+3oOjWA+rw6BAfOQKIUXHBw4UBhGkwRxabHtuC59W/BqbWh3gCgFXBCgG2ZiAQd3LPq/ofzPWVLxsxggefHX7locYEpqnTXksI5WwNTlqAk5xpMq2Z489h+tHz8CeYW1eLcYBCvHt0BRikokaBIGiihIAKghEGYEsqKArjzwZtQrmfAOQh82h1BR28b4iyCEAkG//jMb+YPorfragwSIQR+Uf7YV0xFI6RIkumHMwqWplfllqO0GthxuBmvv7cXUXMAjTXLMRAfQNfAGfQN9/RAkJNciBKJSJNlKoOAgFIJwiHwq9konFKCafkVyM+ejAQJI9QfAk8naP749Xde2vvsUlkQEwKwYKFfDFwukh0dH33JyR1cP6V47Y2Tb0ovzSrnucUm2dD0LDlw+AiYQlGRUwmZMbT1tp7/KHTgKcV2PTsnb1Ffe/iMJ2KcvT7Tlb1aZlqjSjSfIquI2L04eroPRzo+QKY3G3WFdagsnYx4ZARLZi9dyIfF+p4Dp+8jkBAbRTgMAFKc1v95Xq5eOi+QW7umKm8WcgsN8tRbT5IPWg/Dr/uRoqdB1/SOFw799cngcNvWGLcHJ8nFAAQc8Ihhx3YNx0d2xXlisq7yW1NU3480Wa9TJJXIREZ/tBtNrTvR3lOOxoZ5yE64cd3C+fduCZ471BnqesGCMXqxEGYR9LNhDElxVpZ37aPzShtZfjHE081PkJbWQ/DpXliO2dYTvvDzvSebpnWPnN/IJDZIyFfLtC/Obc7PDRvhjV2D7Q1d4Y65oUj301Fz8KIsydA1Lzp6TmHb3pcRPHsWpWoRVq1qXK9JsYoRfDY6wOmiAbV8FhZk3HZvY+D2OYVFKp54YyM5eOIIPJrvzHCkb0330IXp/ZG+Zzh4VJIYhLjaBIaAgECAO4ZttvTEeu7pDLdVfBY+/rOhWF+LJEmIJwzs2L8br+9pFoWpxZmrfnDncwZs96gAm51DOEEvlteVzHkwL0fH+u3rcKT9UIuuanfAVAJRM7ZNgBt0HJMrQi51cja3whEr/Fw0Zl4XGTbmDER7/hy3oidPnTvD/759O3JTs+csLF75+Kg5WKZ6awO51esMRFIe37nu3Z6B4Domyc3gnBMgyUbxSpx+cSQOFawlagy19MTCf1IVLPSM6GvO7uycKVyXz2AuicRVpTs2/2DPJ9s3RE3lTZ9ELn06JnhcevkYL2HYiTe5HW+6MNKt+OKpxqhG/V1eFN/x9d8BAEDYTT3NCed3AAAAAElFTkSuQmCC","rock1.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAoCAMAAACo9wirAAABTVBMVEX///9OTUlgX1tiYmBubmx1dXN7enaIiIaJiISal5OhoaGnpJ66urhWVlRcXFqBgHyDg4GHhoJdXVteXFhCQkFMTExmZV8vLy3Q0M46OjhNTEh9fXt4eHiBgX9KSUeGhoRbW1loaGaIiIhoaGiJiYeMjIqQkJBubWmamphKSkhwb2uop6Krq6mzs7F1dXBCQT9ubWibmpadnZ1XVlFZWVeqpqFQT0t1dXG5ubeRkY+bmZWbm5rDw8FycG6qqqo/Pz9+fHeysrCysrKSkYy8vLqlo5+Eg3/W1cmBgHstLSubm5lAPz1CRzJoZ2NaWVW+vryCgX2dnZtbWlWenJqfn51CRzOjoZ1DQ0GmopympqRHR0WnpqBwcHCoqKZxcXFQUFBeXlytrKquratRUU+KiolhYV+0tLJVU05lZWO7u7tJSEaVlJCZmZk/Pzt/f305T/UEAAAAAXRSTlMAQObYZgAAAsFJREFUeF6NkVVz3FgUBn0ZxTzMDGZ2mLPMzEz//3GPZux1Jo6r9nvtrj5Xpa3rxXEcRVu3DqCERbfzEu/s7NxiVBjQUrBvvlIhTCkG/PT0jUZFSiYVnJg/fGj/nEQ3+HZggCqp1OgX+x5i0WtcbBtjfthWSr4/+/rd/v7ricjAcjtTMzmbWcvQZNOID4wRQlg7m80e5fZDRCZq46GVAymNEiIHJbcKeBD0NwRpDo6FhkaenyuEGmTC1IawK/+6c0doJYg1iJAhIoj1o43Ctn7wSGgtgA+HBMGCILoW7IPf72nd6ShhEWEIAh5jrzyjMp/LnjzodoUwuI0QZox5hAWvCLu7Pd3rKmMwbmNMPeZ5XkP9Z0TG2l5P31Nqv91mDCPcbWOvo1gUrbkYGJtD4onEhFE8HmPqfIdq6uoV0aAUtNZPMKEUoDOm1JkoFQTrRDwwJhfa2s8JYz6m41LAzqTzNlNrYT6w+UAba33jtyhtOe5YfoEak2f9q8I8hysfGWt8v/Uz5Cl+LnGjUesHlwXbG5jzF9YY/6ua3+2OXez8IzM0qdOrgp5O5xBguFvTP44/dShtZAiONNaCnE+nouQ+xtr3WatT+zbLMFqGYKyEx6YULMN4iAnzdJPcpX9k90ejajUEI47MYyGsFfAjh4T85jF66BTZ2dPqIlzEpfDrFM+tsSQF/g5w967zTXZyfLwIL8JVYXp/OsXMpmRIGPGawOu8+Al4koSrgs99JERKypV9Tl23GB2FYbJcxh+XBuc+TveoIVXSPDx0qFuvZ8VRsoTxt9YCf4lx2uXVZnPf+cCtnxTf193RRbKMOXAwYnDSvc84jzh1XFqcHC8WS0jwbMXXzt5e6n/CeZ3Sov70rBomRwWP4yu+vpOmX3IKOwG+XAK/xpd3YJTzZPUFPFsLN50W50dJ8vclv+lcb+t/7l8WS1PtwkZESQAAAABJRU5ErkJggg==","rock2.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACEAAAAkCAMAAAAw96PuAAABTVBMVEX///9dXVtmZV9ubmyBgX+Dg4GEg3+mopy6urhcXFovLy06OjhCQT97enZ9fXtEQz9MTExVU06EhIKXlJCjoZ1WVlSnpqCtrKqysrDW1clZWVfQ0M51dXGampibm5ufn59QT0s/Pz9/fnmppZ+qqqhKSUe5ubc9PDu8vLrDw8F1dXCWlpZgYGCZlpJbWlWbm5p4dnCcmpednZt6eXVAPz2lpaI2NjRCQkGBgHupqak/PzuCgXyxsbFoZ2NXVlFxcXG7u7uHh4eRkY9ycG4xMC6UkYuWlZFeXFheXl2Xl5VJSEaZl5OZmZaamZR4d3Wbm5l4eHhjYV2cmpVkY158e3dJSUegn5qhn5tmZWEwLy1qaWVra2unp6Vsa2iDg4McHBpxcW+wr62Hh4Q1NTWzs7G2trOIiIaKiomPjYhISEi+vrySkYzPz8+TkIuTko3zCLLRAAAAAXRSTlMAQObYZgAAAlpJREFUeF6V0UVz3EAQBWANj5hxmcnMzGFmZsb/f0yvYsdrZ7NVeQcdNF/1tJ6U/8v3YSYCwZvN5qU84wHnhYJMkoRPTz90x4tCmnBIwj8/+jaOuEKmnKvc96+8v3b/rjsGcCZj7Pv+rebzrx+JG54HUgyJ9Luw7fw8ybJzxG0IIXzCop/dZrcwL7KMkC9nQNLgXDAgQjYLQmS1pU1inwFw3mgzZmIcyJ7I7HBtm7ijIOFlPlhf90mnU4XraPj44tr2qcA8KZe5wJWtLlnEnU6tRrN7TykdEbBEI97am6tUyp6nulgVlO62KDkj4rL3sl6vz5FBV3WpEA+etFotd1Qseo1BZXmZEDqI40x9pxsGMlonIOoV+IUF70e7/prQt3txu0auakmpZFnHwI0imQpvIQeVNCXVUEezqdVHfXQ8gjEg8YcF6s0MUqnWwt3aQbvdR4cIPcvLiNgmBtK7LuuDmRgANfVPABwHGeh2XpebMBxFaSILMSNVk6iqXioi5MCymqYoiK0ynOAMB2naC6rVkKiUEr0I50PxSlFYxFaA7DBMZC/IwhmVHqQxVUuHjlHKN33DsLuyxCBBGphhqBJy0O73DRiiwSXI+v29qyuYCRlEJoHQdNZCTlGHn69ZaOO4NZvtwBDTpDdgBADD0DUNwJRxpPwhDFcjE5u2k3+HBlHsKXQE4oRcZkEQ2cMUHWdD024aIBwNwKlh0t7fz42u69aUA690AKMEwL5NKYId9Rd34An5i9hQhoFyDmAcGZYB4p+xh2VA2xMEzctQJglUhAmTAmWic1v8Am91RrH8zdBZAAAAAElFTkSuQmCC","greenmetal1.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC0AAAAtCAYAAAA6GuKaAAARWklEQVRYhdVZCXRc5XX+/rfNrlm1S5Zky5JsWUb1itlsFpscdo5TNkPLUtaYhoMhTcFAmkJTGsKekFICxaZNgEBxCYTNLovBBgySF0m2ZcnWLs1ImhmNZn/v/T3314xrYbOk5aQn7xwfj96bee/77//d7373PvwpHowwx40MVCZjR3IE860BsQyHpIIDiBgpeGUrEmZWXKfvHXlIAGI8iwrFiQaLT/yGfYNAbIh2XJjmxjKdmz+Zo/nClaoL5aoT1i/cP8tNpLgOl6SJvxljUP4/Aj2sJ+q3xPv+8eXPtlU9u2LNRyscFa/krxkCpIG4mUWGm+KcQ5oO848GmsBkwWlnvL8M73r0o2SwzpyIRxySaieASVMXYPMg/bIVMpNEpIf1uNjtbx209DWkIMC9mQlpR2rk/k+TI6uG+gbBUtnsSkfVrrCRglu2IMAksbghPYG96TAGjTiSZlZQlejzrYKWGEOC64f/Phaviaud2cjNG6J7r61UneB7DnFW5JHDRmqUaNCaCqFfjwla2CQVxbIdzZZCFCk2OHN8/oNB8y85T6yzQsa4mfrS79DRmgotfyXWtY4Ab08Ggc4B1nzOqV1bk4OutKkPF8p2NGp+FCt2FMiWaYuO56L9B4PWmAyJSce8xsAEJyfNjMhyfsQi9ansL/95eOfDIT1Z6ZEt6NnfDXNsAiNGOnGuc2bQ5Kbgb/4gpRo30oiaaXFfC5PRlFO1rwWdXy3xTGUSnJIqbsi+sPn0OIVJ4kF5acpyAxNGBjJj9g3Rjgfb0uFmr6QhpCdh7joIqarYdEmKzoAo8T2kJ0DcpqhSgAKKDbM1j/hM5488BGh+xINpZXZJYQY3Oa2eztFNST3dkoYJI32UVtNhgYwxPYkq1SWWRLRpT48hZKZu/3m47SKPpMIvW/jWVIghGAHcDvyFu76tNRWySWBJr2xBjeYW3I8aaXRlong/0Y/+7KS4/23+hdMjHTUzcCgOzLX4AgyoHjNSsWLFvo+g0dakuSFu5pOt6MvGjgJsCvpIh3nNcon3SWrkoq5M5JYmiwcyGGo1L17u7QBz2sCHxiW3bOlqthamKLrdmSi2J4fQm41BB0ehbMNM1Y1ltjLB86MiTdErUxz4NDlib8+Mf29rYsC3xt3wwkJr8e5ixb5LZTLteYbooXwJrwkUqQhxOGFmtb3p8Tmdmchd1WqBp1hxwCYpnL7DUhnwaBzSvOrUmJ5MPjTewjPcEAGpUQuwwFqMUsUO+xGJZ+SKzDTQJOp0oUxxhGo1z5YfbNv0rzvqx867rKD2k/2Z8OgP/Yt/M2TE+850VO1xStpog8XLPkmOcDN3M3oAPXhrfBDPR/ezvZnIpWNG+qZbfcfNa9R82JUZg43JjCLIxyYA0wT3u+JnO2sOUBBKFcc0dSAso3oSISOJMSOFDAycZq+cDjoPfLbFm1wz8PuXzjlu0RwA170+2bPkPFeNecLB/zhrrrVg7Bmtfftia1EbWYci2Rb1ydb+AlkTHH873oMK1UkJdNxzQx3fm+nxLR7S46jTvOKBMTMzlcTRBLjbAfSFnDNUV68953Eo2Ub0BMaNFFIw4GEWlKlO1GkeTI9zDrSdKQgbabHauwNLEw0W30+vHHzL0t6x/1bLXEl6tPQEszUV9L8W7z/7g2RwxY8+f/Omq5qWve6U1Ja/DSx5a0dypHWVo0p5fmL/jFte27jWsqhuoU+2YHO8XwA6wV4qgD803gJKQj6ZBLt4+cCBTFQRJRw6XEwTEZ+leYQoHMrGsC05iJ2pUdDi/7n09OmgSczzsuKRreTmwnf4Fz8YaUrPevuuR85vvXKVdGvjKead/gXmx8lhR2edC09/vvUiNjx+0eNl7149u742tM7X/ME/jbcsMVV5kZVJ0ufBATQVlqInO4HZukcowvrgDrDhcbDJFJodvu5ZmnuMpJR26snwblauOnlrNISBbExIbJVagKW2EiF9MTMjRYy0KAFCcEnm2lNjOM4aEPLWkgwKi6oyqT7wmzvfMH7/aTWrLMT8a1fzy931jNSEbOqmoU6wbe1AecBEU42Ej/dyc9FsxgbGwL1OlLs9WGD14+KC2eIZ1//ifvBwDDA5im68YMtqZ9WqgGI3DmWiIsErVBcaLX7UqR5BtSOT8T8nu9Ggelm91cdFpEme6EeJnG+lVZIMuiVt38vn3XTbBbM33WOs39C0a/gp9jc3n4/1lUtwuqMSznIVz53IICXSEv+wDax5FpOJs6NRMNPEgN2CudqUJ3kivBvmwWEwr1MUhdXOqv6AYpfqNI9xjrMGM1TX4cKEKfuKN+M9+CAxgPZ0GI8WL0edxcunJaJdUhDJVTQqtbSdJENnOGZseqpulfWvbhx93Hxus4f96g3cd0IvzjplOU6yleKWigV4NLoXy2bMJIXAloP7gMpCsI4+SKqC7MwiwcuWja+CFUzpLe8cwhyLv+NqT+Nh/aQEfG3yIN5PDGBPakycm2f1Y6WjCncFlgraZnLW9TDoAiqxRnKK15IFB7MTIiESZlavUQpefXvlDe6V4ckH2MCozXhvF16zaggvXIB6zY11nrl4PtaFFbYSXF23CL+KHADmzgAbj2HYSOJne94DJy47rOBZHWxWCQ5mo3gn3pv+IDGIllQQaW6i0eLFCkcl1vkWoEixC8WhyvheYgDnOmsO74LgtG4aMMDFCsmYcHB8lgyKlZJPJm7RF38c+vjJhyNtazK9QXtNzQxMmFlRMWeqTjRoHsS5juMsAfH/K7Fu7AkNg2sKsGkb0BMEAgVCOaSKwvSKyy98qkZ1rT3RXo4TbWWCwySJBLJHjwkfTR67Wik43IYRRouk/A9o8hm7UqPCO9CXyd8GZBvIE+T7trCRLnsk3HLfQ688f6VUWQgz4AYbCQMZXVS6xmUL4JMsWGArFLv1RrwX27ZsBd+0Hay6CDyZBlIZwGU3pcV1kdAV938nYqR3fJYa4ZNmVtByhuISCyAPTYsYyE6KzuUUR4XoYjRJFj4I6++5h9yY2A5SD/ox3STOs2KVZBH/K9FP52Jg6OUz/A2dz75abb71uaAA7+gV/4Zf/wh9i6vR6PBhkmfFYtvb2mHuHwA3dDBNBfO5wAfHGcIx20dNziaFsfYzHVV9C23FwkokuYEDmSj2ZsZFNaTaMdviFTtqguPv/+7HU5HOmIZQDEoGWhlRhD7TVsV4BjYoWGYvnUoiMkjcbHS/dNeb+LC9lIdjErNbwa0qeM8o5KtXoqihBsG+IaB/FAXHN2KmYkdry+4pQmoKeEUAjJxeXwjXnHX+S3cElqxrSYd6bJAFl6nI0G5TOaeiN2okUW/x0XOhSHLemnLxBVKOdC5D3Ud8Js2mrUqYOvyKjajUdsbS4/99c0/wr3kma+GkCqMTkJuqSLMR7O4DD0bAKgKYqxUIVblm2Wno0yexOx1BnBsorPXigCThqXDnuXZJSf9D0Ulr8ipC5bwzExEyTA0t7TZhUXM+floTQNEmG/j8xH68MXkIV7nn4lRHpfDJremQWHHc1LE1MUCR73t7YNTCbBYga4iE4yfPw1y3H3v7QgCdLw9g+74OsT2bS324raRZ5My+dATv794J/up2sDK/9ljRru+uuKKy1c20p/2KbYwwzJa9AhM5UDJP1DeW5CzqNNBUynuyMeGNb/A0idVtjHYIr/t5Kojt6XEkuwcRW3WH9uLEfoX3hcBmlgKGCeYvwA/mn4odqRF0uGzgA6NgB4fBW7vENSkcw4OpDG6Y0YyzXTUo+jMbXtQNYEsrzJZubbX3l3c/sOqyievtTU/3ZGPZ3pxvJztM9YL8xzTQ1NIQf+8MfSRo4ZctGNQTaE2PoavzINAfAkWUaMBDUdw7+omRMDMNUl0Fh24wPpHA/LUXCxrtSY/CKPNDiSXB9/UBk0nQdTazBOgewhOM4btl9TjRXob5J1+AO+fMAHvgt9Cfecd5m891W8UyZ+IkW9nGCsUhFC3fLxI1pxmmvelx1qvH8NrBdr6u/kSM6HG8FO8H9hwC6spxSdMSVCoulQqCwc1slpvGm/H+Yp5MMyZJkKqKcK2nUdCLmt8qxYre6mI45lSJpiATjXPzydeZtLTBwAe75d8eryNemcUiWzEeKlyCl9f7+YfPvszMjZtrL+ka+ungdT/b2a/Hd1GjbGWKkF1qMMgRHi4ufZkY88oWSWWS+VkyyF+d7MJyRyXOdFTlaaO8MNEpL7OVpimaUSPtv2LwzWc23/3YuczjBK5ciYF51+CteA/eiveKQUvL6DDcngJE27rj5yw6ftvFBbPfe3R85/IdfYdK0T3USJ56/nHzUKe5cYq93KDku+/QdhlP/A4L777uzceLl69tsgYO5KO7Nz0u3CglpYh0heokJTMSuQp3ZDtP9X7SzOpuWdM7MuOCAoN63LU5PtJAPCYD9MPyRUKiaMBSq3nQl53E4sIy7M9OcpbKbLrQNeveC121nRWK696mGRc0PtDw2RkJM9P8WPtH5/VUFCuvJwYLVjsq8UjtaeaL91RKWzv3nnmHpN7+auV569+J94ao0F3mbhB+6BjqIQvjVKY4sTs1KiJN4wJaCOknnaPVNVh8OnunpQRWDczrEp6XbkydximsHFRoN07sR2Qi1n7vyot+cb5rVgdtLem/hclt6wNL2roy0ZI1y+bctzUxePm25FBjeyZy0obRzpLbS5qNZK0h25h88er+36WtTLlznsUfo1wbzsaPBq2I2cZUB0HtO0WZmlGbpCAg2UQZpfnEmJGqZjUlcXNfv4s3VYskDkoJHjOzrMniR6FiJwO08+RAxb+0p8d20D2o0jJuQqcGGECl6hwmejZa/D+63tvkfjfeP6ei1Fl+3+gnl5xuryh6IdZ1Sm9b59rPz/x+m87N56xMjueb6mmgWW5iSf7B5FyAmWPxQcXUDpBxOpCJYEcqWIO+kIcpMuB1IWKmecScynByin3ZWPuG0jOummvxtdklVWSPxNnhqZOZ695NgFMgJCC6wlGxnfA8U7bqpXEjVXeSo6zp17aiP3998tAJzZbAOw0WX1feAx01YSIRdwpPbRX1n0DTAyiLC2UrTrCXsREjYTN3H7RKhR5RltOmQVLHaJBYqtgj1WrBvYtsxS3sC8NIU9ReLih3ZLM6tQhxCF3zydb9p9kr9zdovhafbPUY3JxAri08CvT9YzsEH6mLWO2qxUzNLc7TiIts4WzNS9xVg3pytlRRaJihiOypKMaBTBh9ehxBI4017vrHimX7r8la5i0t8Z0GOQ4oR3XWdO9y1YVZmlvQkQoa2QmyFW5J6yZx6EyHhTwW5NqvaaCpCpIK0DiBuEv0IJ0lalBVKrX4qBBlbh5+t8GciDNW5ME8zY2wmWEUvZs8c1/6jrP6J7TlxL98lGlAThXtixP9fB7lVYGKXF6LScFYbrJFC6WgScfiNJXwTCYi7CAZlTqLd9o7EAJjcJOm2yrvCUrypaeCKhfxeI7m2Xmdt+n7VqYkXZI0bexLoPM0+OJBi6UiQlEWk1mwr31vMw10reY+ahyVH6LQVJ4mnhqT/HZJdUmFbpQ31iI3IRq40Tv/VpekDeR/m+czz02gbEwR0ZKPAcfMTQQ0+ejB5teCpiSkrRIg9ThCRkJwjBKgTHZgvj1A8hf9y3f/bSYZpeOthWKqea133kPN1sItX/UgivaIkYCLqceMOJXpb3pMA/1y7MDhdxwE8mR7hbCqLFcZad7skNQSTCZ1alyDehIXu+uemmfxP5zIJd6RBztiuE7XTOOr3hV882Ma6KXWEjGxzL9VovarX3RYTHCbEvLdeH8jybmvppwy+p1LC+pvJyZ92TQ1f/CvfLnxfwBN2U1vlpAb4FAldCvaNC+ShjHBC+zWU+2lndd7m9aqTIp8a2j+N6Apewu+ABK5dyDEXbKv3Zno1kdOXP0AB1rKFMe+PzbgP80DwH8D8qxOx1T8bgsAAAAASUVORK5CYII=","greenmetal2.png":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADEAAAAvCAYAAABKQCL3AAAQJklEQVRoge1ZeXBd1X3+zt3evW/Xe3raV0teJNmObdk4NjZgHJZgHMyYJAMUAiU0y7QdkqEpJW0Kk6aZhJAAEwjMQGAKGFpoSAhbCdjYjndjW/Iiyda+r29f7333ns45enJlI2zJZZL+0TPz5kn3nnfu7zvn+32/5eL/x/+l8fjEUVBKkbKyiJs69iQG0JKe4NcOJYcRzKbwdLCZ/380NYqsZeLbQx9ixEigLR3E90Z28+8BI44d8T4+7+PkCDJWFr16lF9PmDpf+8be3/H/34t3s2vKRDbF14+ambMf9vvZftgQ/hx7qRLR7SXKTQa1KkUQSOR/zLByhs1l/MlBJNjpGLG7ngg13Zeg2UKBkHOMtwvynNeULsWQo+kxBt6a04OIAINa2OSsXHFF07YfST5X+GXJcTBiZsCAaIIEhYh8bshM878ZIJL7/Xg2hW4jirhlwJabd8kglqkBcjg1MuszJyB8l4NmBkWSXWzVQz+8sWyB00bE5oiZcdkEaYIZRab9xi0oEHMUi1k6uvUoJjgw4RMAcCl0OpYeo8vVwEVBWJickqEmiiU7stSSngo1P/Dqtn+/oVx2oUbxBu2CHFXPA8AGA6BTE6czIS4kEUvHJNDzZ06OS6LTBY0nk8ZPOatBTU4BiQjrv/fy039TuOUKWNRCc3pMk8m5e2hSi3N0MJvAgBFjwCHPsPPnj8/UsRUIkCjBaDaJfFFDnxFHleJh3C6o3fnEc9bO5sKbnBXWQDaBQsk+plOTby2DbeQAsNGlR/iuzwYAPisQYo4+XUYUy7UCtGaCKJOdnM+MBE+Fmv6OvvhBpbBqIepsfpzWI/CKNsECdGY82/HpYybez2S4ic8gTjDKsIUmzAwW2Xzoz8b4dU2Q0WPEUC270a6Hb/7+Y4/cj0hKwPrF0IhoRa0sOvWopBJxZpJfxHgKijDVocO8dBACEbjeB800qhUPP4XXoqexUi3EvtQQlqj5aNODkIlQ+pWB9x5GMgME3LixYhEdyCYE5uzzFe9YmprSbA2YmhejBv9USC6s00ouDQQ7fuas6+2l+H28ix/93/tX4oVwC+M5P2CWXqxUC6VfBI/+pOe9vUsYCGH1Imx0lJMhIy6EWrpRKjvHombGmC2ABLIIWxn4BBVrtWLU2Xxn48qc1alYcnDZcwsyOZgapodTI1ipFWKFFsCvQs24y1OP7ck+uATlzqfCLTdTmwwaT6HwqhXwCgqYU1OXlo2ambhfVIkFnCPXdNq/Qk6iEzQLr2DDYtWPAsmem3cuyAuOqcls91l0ZQ7Lxg3OarrFVUPeinfxe9/xrcA78R6kqIkvOqvnb9m/7UfRUMROi30gly3EZkc5+rMJ7E2Pgw6MixWya1wkAp1uPFuHnfR03jOXX2zzY429mAOg02wiFwMh5KYwujBHzZc07Ej2cy1fYMtDc3qcHStJWjq/7hNV+bv+5fhF8Ejg9oF3f0IOthUhFMeqhnpY1zZioc2HfclBxNr7gI4hMl/Jiyct46zKMOOn1CZCdcSpgWrJjcvtJWDBkZ63+9MVYUY6pWHCyKl2ieTgecsmZ7XwRqzDGjFTconkMATA5hFtBWvtJanDqZErGm0FoVcibat7jNj1hx576UprJASxPABlkYhGxc0N+Cg9BsqcvNiX2Znsz1bmjGPCIOTiAsuWikQHahQPHIJ8QeNnBMFSgAS1sF4rxW9i7Wiw+fPzJW38vxI9l1/nqOzfnuhbt1D2ak8Gm/KPpcfWVMjO8EvvvHUtXVuf+fGvn3HR4aBPcDsMRJMgigQSTWJvbwdurm7Aycw4kj3DIOE4iMdBN9jLI+yU2e6zWML+ZukGM3ipmv8J3l9IiyVMc6a3411Xr9GK6Rux9vx2PXLZQ2P7xZ+179vQWFKhf3n3i346Hq16Xd05br2yq1C8okE3d51UhOoCYO8pUFUGUWTQSEKmHjsQjMEaj4C09WPhovV4PHwKGA4Chgl6olt9cn3THfMUT2ie7D56MhMU/znweYPmjKXTjJ5NIOEgZCK6t/a/9fR7o93XCO2DQZwZWEA9jght7vKAVWkeB+hoGKSiALR3tFBYVQvaOaTw77Z+kPIAaEsvUB4Ak1PitgN2lV8jn6/DSDaBdHs/v0eNLFjk3pMa2fLyk88u+fpff+PtZ/uPN2911e5couaPThlm8LxpdhFAytGoNm2ZtYLL7kTAk08qC0FFwSNUFzE5BDnVCxZtyUQU5Jb10Jx2bLaXculLW1l82NEC4dYNwMvbQUrzYR3vArGrMAeCIKKAqGWAMoDtgyCs7OwehntJvZvcetXy/4h3LyeUnnkufOI/Hw6s+Xl/Nm7ZiDjBfJFlBLM5CT7nkfHDuMpedsNpPbREJsLKp0LHb6mSXVyJmGSyoMLy+Qabj/pEldQqXtqoFhAW3FitMJJN4rg+wVIMPBduxeDAEIQTPYxawJo6mCV+EMsCyRggrX38wVZ9Jb+2wVcGv6iaYTMjXues/OhEZnzXne66XQWS/WS14hm+KACSS9BZce4SFKSp6bKo5W7XI1e8GDl1e4aaazv0qEMkRMlQC05BQr3NRwOinRRIGq51VOKPqUGuXh16BEEzxWPBRxP9cDntKBBtKJcc2HHgAEgkCZrvBomlQCsCcJcE+P0qyYnNrnm40l6KlyKt6DGizCeOrdGKj5bKziNfcFS8oBIxTgEhZRmWNq3aOwcEPa84j1m6MmDEVYkIS58Pn/pmmmYXntbD1XvS4/4vOcpY3oPVWhEcRMZv4x3oM2I87T5pxGB0DYM6VU6nB8pWQqcWHh08AnSPAE6N08tdVojFigf5oooq2Y3rHBX8uXtSQ+g1ong/OYgyyW4UiGpUI2L/X3oXP+0Q5H01iqfPJ6rBGU/ifBDnO1VzenxD3NLrfhfv3Bg1MzfYiKj+hacOrXoQr0ROozMbx4iZgT4WBmnpAxaWoa60DN/2LcGe5CAHuDsyyYyN3hIstvngFzWe+bLnsETug2QfZ8RANkE79QhhyaU1GQRpoWQnSSvb9TVv3avlkutDv6h2FUj2zn4jjnLFxUsBPPTQQ+eAEMm57lQo2bs1Ih1foOQd6DXiuz+nBUIPju1bEDTTNEGz8olUBFZKBwnF2Y4AqoK7y5YhaWXxfrIfTQePAntOgi3bbaZQ5fGjWHagXHKhUnbzeRWyGx1GhA4aCRK2MrTTiHG3NkEJK1VlIuS9Hu1Y7xTkpe/GuxopQem78e7m7Y88a8x4EjONNDU59yUiKEWSXX8ieOy2Bzt3f03xOFZmgzGX0++R4y09MKsKAVnEI4Wr0ZKZwJvxXoze/TOISyphRRMQqopA+8cgfGkNMBoGNi7nT1so2dHW08sjOmnqBAq8oIMTEGpLQKNJIM8JyJKFRFpAWT60soKRnwdW33OHt/7tWYNgSiVOo1jSMtTCjhfr/tG3tP5ffvvyJvq5eY1IphcQ08LWhcvRa8TRYMvDrwdPgjz5e1CBgPhck0ZqCuhYBKTEzw1l3xgO8XhjtfWB1FXAau2bBMBknQLkmhUDZChYbF1ev2uR2+daqHh3X+Os+P7d3obkRUGcf4fkALFi/p14N08bymRnwUeJvq/+ITHweNe+Y2TVutXcyb/jbcC/7noTZDgEc38LSJ4TlJUQdhswHuXfLDBagxOQNq2Omjua3MK9X2xBxghoRf6Ttzmrxg+kR/Fd37KdMcuwFih5+9bZSyLH0mPSMjXQ9kLkFO72Nszs2DMBmPIS5kydepgniSpEfJwZ445ZINmrF3e/doS09nnpvCLc5qvljvlq/ymgaxjWOwdBRBGkrjwNw1SxqPzU2sYVoT1nWq3HGzfvaM1MOFdqRXuvtJdFfji+P/Vk0dUfH0gOla+2F58B4Hg/0ZOoktw8MUSurTMFYsYsdibjmVqcyYQQtDJwEAkeosAAxV95F/PC5a14VxGOnCGUEMiKzJps/KRWFpTicDg+uYhTxeZbt75RIGq/eazoqsPbIq2B0LzMoXu8DcyyCJvCnHiVVoSTmQnUq/4zrPe0wJaXWGoLYF9qkJfDaZqFiyhnbZQ+zfgpAAnLwBk9jKFsAjZB5BUWcj1MYVJ+0agVsMCnoW/MhaXzsE7N5ynDh6kx1MkOwOuEeNkifHnLTa9e76y8PU9UeY73jdef6WYO2156XbRW8eJAcgj708M8i34/0cs3iAnKlF2f1sKRPs14Fis69DB6cx0MZvz5DVgWZozJtISMZpMCrSo03fNKBFbIdOlhiO8eQpvdBto4nznp8MOBNT/IE22UxYZ7hz6gLJ4w5Xk/0Sv9IdFrsFNgsYO1fU7oE6zxPKPR549z0kSS+7B2CwtSPdkYnETm1MGndJDZjrMK7XB6pIgU+fQ1aj6Pwh8kBmAdbQdJ6yjyeOLb199zv0SEM6zQYfS7TCtCTWkJhEiCSbHVoPjkq+3laFD83AY275MNzguAmDKede72JgdxKjPBb3iJMtkQvsAC7P7B1Agtk50ODE44CkSNU7Bl9yFAkYGMga97Fr3mEZTX96QGOT0YLa7USnGLqwasBn++/4TZqBWaFbILLCfjG0Zn33TnIFin7khqFB+nR3mu4xNs/EGzWYbRie3aYDYRMJfVoFhyWvtSQ5TubwXxOlCzdWPTP+SvemCBLS9Tr/h4OyfnrCxzxvW1DSBvHWDJn+URbWfbMHMZHMTe1BCCVprzXpuD8awiZEX8CjWAXj3mCwgS6ydZ2yJdhA6FeBL4b8XX/KBDj4yx2MJqBPYe4khmlJ/6AsWLr7jnA19YjvsH9/J1WzLBiz57xpNwEZl/MIs3J2autcLaJyu0Qi55TLPzJY0yySWAIG5vAnUo+PHf3v9og833ZqnspIxGU2+BWLOZ1SDPR06hTHLhtpplsEQBz4SO41ehpjmD4Op0Md4jV4dzqokqWJeCHT1y0VsggmxQ07zM5re6jAiyfzwB4ZubTt/hqXuUGc9AsqZxpx7hbX7W7iyS7FxOmQqxmMIozfT/WmfVpYG42GBq4hRkMC2f3oFjqsRkMU9UzS49kl8s2ckHiX4iXrl0bHjdfXeJRBhiIHtzb3r8oor5Wh7vqrDfr1aL+Npn9BD/Pq2H8K28pZ8tCEYbJqGMMkw5pgSP7W7KMrgTekWVxRSyRA2Yx9Kj5MR7u/HTr9776LiZPsTmDhtxTiPWgmTVI82p4HA2CbsgYZGcx9dl/ngiE2KsIDOErrmDmIqRRZIDVYr7rGLo3Pgsf1E4/b2aQU2hNTPhadXDuHPLze98K2/pT6fe69UoXt49ZIO1QfuzcZiUciefus56ufeR5ey0Casf5EsBwfqcsxkMjCJOUoGdhMHakISwHSY7koM1rdHg+IriwD/1GDHaqBVyH2D32dtQlvU22Py5tKIER9JjaIt3cjAbHOX4ZagJzxRvpHuTg3StvWQuGObe2k/zd3D6ZOM3VwEmLWP+JmfV6Zb6Ox5sy4SOCHMMVv/bMefWfiZHp3NeohOMbXXV/hLAEWWWDa8/K4jpxrN6gVFLYG01Sx+dkt0/6QDw3xExFJ+v19ndAAAAAElFTkSuQmCC"};
function sandboxZip(files){
 const encoder=new TextEncoder(),chunks=[],central=[];let offset=0;
 const crc=bytes=>{let n=0xffffffff;for(const b of bytes){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return(n^0xffffffff)>>>0;};
 const header=(size,signature)=>{const a=new Uint8Array(size);new DataView(a.buffer).setUint32(0,signature,true);return a;};
 for(const [name,text]of Object.entries(files)){const n=encoder.encode(name),data=encoder.encode(text),sum=crc(data),h=header(30,0x04034b50),v=new DataView(h.buffer);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,sum,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,n.length,true);chunks.push(h,n,data);const c=header(46,0x02014b50),w=new DataView(c.buffer);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x800,true);w.setUint32(16,sum,true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,n.length,true);w.setUint32(42,offset,true);central.push(c,n);offset+=h.length+n.length+data.length;}
 const length=central.reduce((n,c)=>n+c.length,0),end=header(22,0x06054b50),v=new DataView(end.buffer);v.setUint16(8,Object.keys(files).length,true);v.setUint16(10,Object.keys(files).length,true);v.setUint32(12,length,true);v.setUint32(16,offset,true);return new Blob([...chunks,...central,end],{type:'application/zip'});
}

    async function runSelfSession(cfg) {
        if (localBattleSession && !localBattleSession.stopped) localBattleSession.stop();
        patchLocalBattleRouting();patchLocalReplayDownload();
        const s={stopped:false,over:false,ended:false,worker:null,url:null,roomids:[],closed:new Set(),pending:new Map(),counter:0,views:new Map(),requests:{p1:null,p2:null},history:[],serial:Promise.resolve(),cfg:null};
        localBattleSession=s;
        window.qolSelf=s;
        const token=cfg.token || Array.from(crypto.getRandomValues(new Uint32Array(2)),n=>n.toString(36)).join('');
        const base=toSearchId(String(cfg.format).split('@@@')[0]);
        const numeric=String([...token].reduce((n,c)=>(n*36n+BigInt(parseInt(c,36)||0))%9000000000000000n,0n)+1000000000000000n);
        s.roomids=[cfg.shared?`battle-${base}-${numeric}`:`battle-${base}-qollocal-${token}-p1`];localBattleRoomIDs.add(s.roomids[0]);
        s.localPlayerSide=cfg.shared?.side||'p1';s.activeSide=cfg.shared?s.localPlayerSide:'p1';s.isShared=!!cfg.shared;
        s.error='';s.sharedDefinitions=new Map();
        const roomFor=()=>s.roomids[0];
        const sideFor=()=>s.activeSide;
        const save=()=>{
            if (s.stopped || !s.cfg || cfg.shared) return;
            try {sessionStorage.setItem(LOCAL_SIM_STORE,JSON.stringify({...s.cfg,token,history:s.history,hackEnabled:!!s.hackEnabled,savedAt:Date.now()}));}
            catch(error) {if (!s.storageWarning) {s.storageWarning=true;localBattleNotice(s.roomids[0],'Browser storage is full; this battle cannot be resumed after reloading.');}}
        };
        const deliver=(id,lines)=>{
            if (s.stopped || s.closed.has(id) || !lines.length) return;
            let batch=[];
            const receive=text=>{s.delivering=true;try{app.receive(text);}finally{s.delivering=false;}};const flush=()=>{if(batch.length){receive('>'+id+'\n'+batch.join('\n'));batch=[];}};
            for(let line of lines) {
                if(line.startsWith('|error|')){localBattleError(id,line.slice(7));continue;}
                if (line.startsWith('|request|')) {flush();receive('>'+id+'\n'+line);}
                else batch.push(line);
            }
            flush();
        };
        // The only extra control is Back while P1 has a pending selection.
        function render(id) {
            const view=s.views.get(id),host=app.rooms?.[id]?.el?.querySelector?.('.battle-controls');
            if(s.stopped||!view||!host||s.closed.has(id))return;
            
            if(!s.isShared&&view.panel.parentNode!==host)host.prepend(view.panel);view.panel.hidden=s.isShared||(view.root.classList.contains('small-layout')&&view.root.classList.contains('showing-chat'));
            const back=view.panel.querySelector('[data-local-back]');back.hidden=s.isShared||s.activeSide!=='p2'||!s.canUndo?.p1;
            back.disabled=!!s.seeking;view.presentation?.sync();view.tools?.layout();view.editor?.layout();for(const button of view.root.querySelectorAll('[name=saveReplay]'))if(button.style.display!=='none')button.style.display='none';
            view.panel.dataset.player=s.activeSide;
            const request=s.requests[s.activeSide],room=app.rooms?.[id];
            const slot=room?.choice?.choices?.length||0;
            const active=request?.side?.pokemon?.filter(p=>p.active)?.[slot];
            const name=active?.ident?.slice(4)||'';
            const status=view.panel.querySelector('[data-local-player]');
            const player=s.activeSide==='p1'?'1':'2';
            const playerName=s.activeSide==='p1'?(s.cfg.name||'Player'):(s.cfg.nameB||'TestBot');const text=s.ended?'Battle ended.':playerName;
            if(status.textContent!==text)status.textContent=text;
            // Target choices are relative to the choosing player, while sprites
            // remain in P1 orientation. Keep their native hover references true.
            if(s.activeSide==='p2'&&!s.isShared)for(const button of host.querySelectorAll('button[name=chooseMoveTarget][data-tooltip^="activepokemon|"]')){
                if(button.dataset.qolFixedTarget)continue;
                const parts=button.dataset.tooltip.split('|');parts[1]=parts[1]==='0'?'1':'0';button.dataset.tooltip=parts.join('|');button.dataset.qolFixedTarget='1';
            }
        }
        function showSide(side) {
            if(s.stopped||!['p1','p2'].includes(side))return;
            s.activeSide=side;
            const id=roomFor(),room=app.rooms?.[id];if(!room)return;
            const view=s.views.get(id);view?.controller?.sync();
            view?.tools?.dismissTooltip();room.tooltips?.hideTooltip?.();
            if(s.requests[side]&&!(s.isShared&&s.requests[side].wait&&s.canUndo?.[side]&&room.choice?.waiting))deliver(id,['|request|'+JSON.stringify(s.requests[side])]);
            render(id);
        }
        function presentRequest(){const id=roomFor(),view=s.views.get(id),battle=view?.controller?.battle||app.rooms?.[id]?.battle;if(!view||battle?.atQueueEnd===false)return;if(!view.compat||!view.compat.isCurrent()){view.nuclear?.refreshDex?.();view.compat?.refreshDex();}if(s.pendingRoster){const snapshot=s.pendingRoster;s.pendingRoster=null;syncSandboxRoster(battle,snapshot);view.tools?.dismissTooltip();}const pending=s.pendingRequest;if(!pending)return;s.activeSide=pending.side;render(id);s.pendingRequest=null;showSide(pending.side);s.displayedRequestKey=pending.key;}
        function attach(id) {
            const room=app.rooms?.[id],root=room?.el;if(!root||s.views.has(id))return;
            const panel=document.createElement('div');panel.className='qol-local-choices';panel.setAttribute('aria-label','Current sandbox player');
            panel.innerHTML='<strong data-local-player></strong><span data-local-locked hidden></span><button class="button" type="button" data-local-back hidden>← Back</button>';
            const style=document.createElement('style');
            style.textContent='.qol-local-choices{display:flex;align-items:center;gap:6px;padding:2px 7px;margin:0 0 3px;border-radius:3px;color:#fff;height:25px;min-height:25px;box-sizing:border-box;font:11px Verdana,sans-serif;flex-wrap:nowrap}.qol-local-choices[data-player=p1]{background:#337ab7}.qol-local-choices[data-player=p2]{background:#b33b34}.qol-local-choices [data-local-player]{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}.qol-local-choices [data-local-locked]{display:none!important}.qol-local-choices [data-local-back]{margin-left:auto;white-space:nowrap;flex-shrink:0;font-size:11px;padding:1px 6px;line-height:17px}';style.textContent+='\n.qol-local-choices{height:20px;min-height:20px;padding:1px 5px;font:10px Verdana,sans-serif;border-radius:2px}.qol-local-choices [data-local-back]{font-size:10px;padding:0 4px;line-height:15px}.qol-local-choices[hidden],.qol-local-choices [data-local-back][hidden]{display:none!important}.qol-native-local.small-layout.showing-chat .qol-local-field,.qol-native-local.small-layout.showing-chat .qol-local-rewind,.qol-native-local.small-layout.showing-chat .qol-local-popover,.qol-native-local.small-layout.showing-chat .qol-sandbox-edit-buttons{display:none!important}@media(max-width:640px){.qol-local-choices{height:18px;min-height:18px;font-size:9px}.qol-local-choices [data-local-back]{font-size:9px}.qol-local-field,.qol-local-rewind,.qol-sandbox-edit-buttons .button{font-size:10px!important;min-height:20px!important;line-height:15px!important;padding:1px 4px!important}}';root.appendChild(style);
            const view={root,panel,style,raf:0,controller:lockLocalP1View(s,room),nativeCleanup:nativeLocalInteractions(room)};s.views.set(id,view);
            if(s.isShared){root.classList.add('qol-shared-battle');const sharedStyle=document.createElement('style');sharedStyle.textContent='.qol-shared-battle:not(.qol-hack-enabled) .qol-local-choices,.qol-shared-battle:not(.qol-hack-enabled) .qol-local-field,.qol-shared-battle:not(.qol-hack-enabled) .qol-local-rewind,.qol-shared-battle:not(.qol-hack-enabled) .qol-local-popover,.qol-shared-battle:not(.qol-hack-enabled) .qol-sandbox-edit-buttons{display:none!important}';root.append(sharedStyle);view.sharedStyle=sharedStyle;}
            view.observer=new MutationObserver(()=>{if(view.raf||s.stopped)return;view.raf=requestAnimationFrame(()=>{view.raf=0;render(id);});});
            view.observer.observe(root,{childList:true,subtree:true});
            if(!s.isShared){view.presentation=keepLocalControls(s,room,view.controller.battle||room.battle,presentRequest);}
            else{const battle=view.controller.battle||room.battle,original=battle.subscription,listener=function(...args){presentRequest();return original?.apply(this,args);};battle.subscribe(listener);view.presentation={sync(){},destroy(){if(battle.subscription===listener)battle.subscribe(original);}};}
            view.nuclear=installSandboxNuclearBattle(room);if(s.isShared)view.compat=installSharedBattleData(room,s.sharedDefinitions);view.instantEdits=instantLocalSetEdits(view.controller.battle||room.battle);
            view.playback=createLocalPlayback(s,room,view.controller.battle||room.battle,presentRequest);view.chatCleanup=attachLocalChat(s,room);view.click=event=>{const control=event.target.closest?.('[data-local-back]');if(!control)return;event.preventDefault();event.stopImmediatePropagation();if(!control.disabled&&s.activeSide==='p2')s.back();};
            root.addEventListener('click',view.click,true);render(id);
        }
        function detach(id) {
            const view=s.views.get(id);if(!view)return;
            view.compat?.destroy();view.nuclear?.destroy();view.nativeCleanup?.();view.playback?.destroy();view.observer.disconnect();if(view.raf)cancelAnimationFrame(view.raf);
            view.editor?.destroy();view.chatCleanup?.();view.presentation?.destroy();view.instantEdits?.destroy();view.root.removeEventListener('click',view.click,true);view.controller?.destroy();view.tools?.destroy();view.panel.remove();view.style.remove();view.sharedStyle?.remove();view.root.classList.remove('qol-shared-battle','qol-hack-enabled');s.views.delete(id);
        }
        function update(result,initial=false,entry=null) {
            if(s.stopped)return;
            if(result.definitions){for(const move of fcSafeDefinitions(result.definitions).moves)s.sharedDefinitions.set(move.id,move);if(s.sharedDefinitions.size>1024)throw Error('Too many shared move definitions.');}
            s.lastResult=result;
            if((!s.isShared&&initial)||result.reset||entry?.type==='edit')s.pendingRoster=result.sandbox;
            s.canUndo=result.canUndo||{};s.cursor=result.cursor??result.history.length;s.total=result.total??s.cursor;s.sandbox=result.sandbox;if(result.cfg)s.cfg=result.cfg;
            s.turns=result.turns||[];s.latestTurn=result.latestTurn||result.turn;
            s.requests=result.requests;s.turn=result.turn;s.rules=result.rules;s.ended=result.ended;s.over=result.ended;s.history=result.history;
            if(s.requests.p1&&!s.requests.p1.wait)s.p1ChoiceRequest=s.requests.p1;
            const id=roomFor();
            if(!s.closed.has(id)) {
                if(initial){deliver(id,['|init|battle','|title|'+(s.isShared?String(cfg.name)+' vs. '+String(cfg.nameB):'Local practice — '+String(cfg.name||'Player').replace(/[|\r\n]/g,'')+' vs. TestBot')]);if(s.isShared)deliver(id,['|j| '+cfg.name,'|j| '+cfg.nameB]);}
                if(app.rooms?.[id])app.rooms[id].__qolFullFormat=result.sandbox?.format||s.cfg?.format||cfg.format;
                // One renderer receives the public battle stream. Requests for
                // each player stay separate and only the selected one is shown.
                const lines=result.frames[s.isShared?s.localPlayerSide:'p1'].filter(line=>!line.startsWith('|request|')).map(line=>{if(s.isShared&&/^\|player\|p[12]\|/.test(line)){const parts=line.split('|');parts[4]=String(parts[2]==='p1'?cfg.avatarA||parts[4]||'1':cfg.avatarB||parts[4]||'1');return parts.join('|');}return line;});
                const room=app.rooms?.[id];
                if(entry?.kind==='command'&&/^\/set\s+(?:kill|revive)\b/i.test(entry.text))identifyLocalBench(s.views.get(id)?.controller?.battle||room?.battle,result.sandbox);
                if(result.reset && room?.battle) {
                    room.request=null;room.choice=null;room.controlsShown=false;room.battleEnded=false;
                    // Interrupt the old queue before replacing its history. Native reset()
                    // pauses playback and starts replaying the old queue immediately.
                    // Seek the replacement stream once, then remain in live mode.
                    const battle=room.battle;
                    s.pendingRequest=null;s.displayedRequestKey='';
                    battle.scene.animationOff();
                    battle.paused=false;battle.seeking=Infinity;
                    battle.setQueue(lines);
                    battle.scene.resume();
                } else deliver(id,lines);
                attach(id);
                if(result.reset)s.activeSide=s.isShared?s.localPlayerSide:'p1';
                const choosing=s.isShared?s.localPlayerSide:!s.requests.p1?.wait?'p1':!s.requests.p2?.wait?'p2':s.activeSide;
                const requestKey=choosing+':'+s.requests[choosing]?.rqid+':'+!!s.requests[choosing]?.wait;if(initial||result.reset||(!s.isShared&&(entry?.type==='choose'||entry?.type==='undo'))||s.displayedRequestKey!==requestKey)s.pendingRequest={side:choosing,key:requestKey};presentRequest();render(id);s.views.get(id)?.tools?.update(s.sandbox);s.views.get(id)?.playback?.kick();
            }
            save();
        }
        function call(method,...args) {
            if(s.stopped || !s.worker)return Promise.reject(new Error('Local simulator closed.'));
            return new Promise((resolve,reject)=>{
                const id=++s.counter;
                const timer=setTimeout(()=>{s.pending.delete(id);reject(new Error('The local simulator stopped responding.'));s.stop();},15000);
                s.pending.set(id,{resolve,reject,timer});
                s.worker.postMessage({id,method,args});
            });
        }
        s.setHackEnabled=enabled=>{s.hackEnabled=enabled;save();for(const [id,view]of s.views){view.root.classList.toggle('qol-hack-enabled',enabled);if(enabled&&!view.tools){const room=app.rooms[id];view.tools=createLocalBattleTools(s,room,(method,...args)=>s.rpc(method,...args));view.editor=createSandboxEditors(s,room);view.tools.update(s.sandbox);}else if(!enabled){view.tools?.destroy();view.editor?.destroy();view.tools=null;view.editor=null;}}};
        s.applyRemote=(result,entry)=>{if(s.stopped)return;const initial=!s.remoteStarted;if(initial)s.cfg={...cfg,...result.cfg};update(result,initial,entry);s.remoteStarted=true;if(initial)app.focusRoom?.(roomFor());};
        s.receiveClock=line=>deliver(roomFor(),[line]);
        s.back=()=>s.activeSide==='p2'&&s.canUndo?.p1?s.enqueue({type:'undo',side:'p1'},roomFor()):s.serial;
        const previousTurn=()=>[...(s.turns||[])].filter(t=>t<s.turn).sort((a,b)=>b-a)[0]??null;
        const nextTurn=()=>[...(s.turns||[])].filter(t=>t>s.turn).sort((a,b)=>a-b)[0]??null;
        s.seek=turn=>{
            if(turn===null || s.stopped || s.seeking)return s.serial;
            s.seeking=true;render(roomFor());
            s.serial=s.serial.then(async()=>{if(s.stopped)return;const result=await call('seek',turn);update(result);}).catch(error=>{s.error=error.message;}).finally(()=>{s.seeking=false;render(roomFor());});
            return s.serial;
        };
        s.rpc=(method,...args)=>{
            let answer;s.serial=s.serial.then(async()=>{if(s.stopped)throw Error('Local battle closed.');const response=await call(method,...args);if(response?.frames){s.error='';update(response,false,method==='act'?args[0]:null);}answer=response;});const operation=s.serial.then(()=>answer);s.serial=s.serial.catch(()=>{});return operation;
        };
        s.enqueue=(entry,id)=>{
            s.serial=s.serial.then(async()=>{
                if(s.stopped)return;
                s.error='';
                const result=await call('act',entry);update(result,false,entry);
            }).catch(error=>{if(!s.stopped){s.error=error.message;render(id);localBattleError(id,error.message);}});
            return s.serial;
        };
        s.send=(id,text)=>{
            if(fakeChallengeManager?.command(text,app.rooms?.[id]))return;
            if(s.isShared&&/^\/hack\s*$/i.test(text)){s.sharedLink?.toggle();return;}
            if(/^\/modhelp\s*$/i.test(text)){showModHelp(app.rooms?.[id]);return;}
            if(s.seeking)return;
            if(/^\/set\s+(?:effects|statuses)\s*$/i.test(text)){const room=app.rooms?.[id];s.rpc('catalog','effects').then(names=>{const esc=window.BattleLog.escapeHTML;const html='<div class="infobox qol-effect-help"><strong>/set effects</strong><p><code>/set effect &lt;name&gt; me/opp on/off [auto]</code></p><p>'+names.map(name=>'<code>'+esc(name)+'</code>').join(', ')+'</p><p>Major status: burn, paralysis, poison, toxic, sleep, freeze, cure.</p></div>';localBattleChatLine(id,'|uhtml|qol-effect-help|'+html);}).catch(error=>localBattleError(id,error.message));return;}
            if(/^\/set\s+teams\s*$/i.test(text)){if(!s.hackEnabled)s.setHackEnabled(true);s.views.get(id)?.editor?.open('teams');return;}
            if(/^\/steal(?:team)?(?:\s|$)/i.test(text))return stealBattleTeam(app.rooms[id],text.replace(/^\/\w+\s*/, '')).catch(error=>localBattleError(id,error.message));
            if(/^\/set(?:\s|$)/i.test(text))return s.enqueue({type:'edit',kind:'command',side:s.localPlayerSide||'p1',text},id);
            if(/^\/rewind\s*$/i.test(text))return s.rpc('rewind').catch(error=>localBattleError(id,error.message));
            if(/^\/(?:noreply\s+\/)?leave\b/.test(text))return s.closeRoom(id);
            if(s.isShared&&/^\/(?:timer|autotimer)\b/.test(text)){s.sharedLink?.timer(!/\s+off\s*$/.test(text)).catch(error=>localBattleError(id,error.message));return;}
            if(/^\/(?:join|cmd fullformat|timer|autotimer)\b/.test(text))return;
            const side=sideFor(id),choose=/^\/(choose|team)\s+(.+?)(?:\|(\d+))?$/.exec(text);
            if(choose) {
                s.enqueue({type:'choose',side,choice:(choose[1]==='team'?'team ':'')+choose[2],rqid:choose[3]===undefined?s.requests[side]?.rqid:Number(choose[3])},id);return;
            }
            if(/^\/undo(?:\|\d+)?$/.test(text))return s.enqueue({type:'undo',side},id);
            if(/^\/(?:forfeit|concede)$/.test(text))return s.enqueue({type:'forfeit',side},id);
            if(/^\/(dt[1-9]?|data|details)(?:\s|$)/i.test(text)){try{const argument=text.replace(/^\/\w+\s*/,''),parsed=parseCommandModifiers(argument,app.rooms?.[id]?.battle?.dex||window.Dex);if(!parsed.recognized&&s.dataBridge.send(id,text))return;}catch(error){localBattleError(id,error.message);return;}}
            if(/^\/(dt[1-9]?|data|details|dp|datapreview)(?:\s|$)/i.test(text)){const match=/^\/(\w+)\s*(.*)$/.exec(text),room=app.rooms?.[id];Promise.resolve().then(async()=>{if(/^dp|datapreview$/i.test(match[1]))return showDataPreviewTarget(room,match[2]);const gen=/dt([1-9])/.exec(match[1])?.[1],parsed=parseCommandModifiers(match[2],gen?window.Dex.forGen(Number(gen)):room.battle.dex);if(gen){parsed.gen=Number(gen);parsed.recognized=true;}const context=parsed.recognized?await commandModifierRoom(room,parsed):room;return renderLocalData(context,parsed.argument||s.sandbox.sides[1].pokemon.find(p=>p.active)?.species||'');}).catch(error=>localBattleError(id,error.message));return;}
            if(/^\/smogonpage(?:\s|$)/i.test(text)){runSmogonPageCommand(text.replace(/^\/\w+\s*/,''),app.rooms[id]).catch(error=>localBattleError(id,error.message));return;}
            const moveSearch=/^\/(ms[1-9]?|movesearch|msearch|nms)(?:\s+([\s\S]*))?$/i.exec(text);
            if(moveSearch){
                try{const command=moveSearch[1].toLowerCase(),gen=/^ms([1-9])$/.exec(command)?.[1],room=app.rooms[id],parsed=parseCommandModifiers(moveSearch[2]||'',gen?(window.Dex.forGen?.(Number(gen))||window.Dex):room.battle.dex||window.Dex);if(gen){parsed.gen=Number(gen);parsed.recognized=true;}
                    if(parsed.recognized){commandModifierRoom(room,parsed).then(context=>runBattleMoves(context,parsed.argument,command==='nms'?'nms':'ms')).then(handled=>{if(!handled)localBattleError(id,'Specify a Pokémon for a modified move search.');}).catch(error=>localBattleError(id,error.message));return;}
                }catch(error){localBattleError(id,error.message);return;}
            }
            if(s.dataBridge.send(id,text))return;
            if(text.startsWith('//'))text=text.slice(1);
            else if(/^\/(?:say|text)\s/i.test(text))text=text.replace(/^\/\w+\s/, '');
            else if(text.startsWith('/')){const command='/'+text.slice(1).split(/\s/)[0].toLowerCase();localBattleError(id,'The command "'+command+'" does not exist. To send a message starting with "'+command+'", type "/'+command+'".');return;}
            if(s.isShared){s.sharedLink?.propose({method:'chat',text}).catch(error=>localBattleError(id,error.message));return;}
            for(const rid of s.roomids)localBattleChatLine(rid,'|c| '+String(app.user?.get?.('name')||'Player').replace(/[|\r\n]/g,'')+'|'+text);
        };
        s.closeRoom=id=>{
            if(!s.roomids.includes(id))return;
            s.closed.add(id);detach(id);
            if(s.closed.size===s.roomids.length)s.stop();
        };
        s.openRoom=id=>{if(!s.stopped && s.roomids.includes(id))app.focusRoom?.(id);};
        s.stop=()=>{
            if(s.stopped)return;
            s.stopped=true;s.over=true;s.dataBridge?.destroy();
            if(s.startTimer)clearTimeout(s.startTimer);
            s.rejectReady?.(new Error('Local simulator closed.'));
            for(const id of s.roomids){
                detach(id);
                const room=app.rooms?.[id];
                if(room){room.expired=true;room.battleEnded=true;room.requireForfeit=false;}
            }
            s.worker?.terminate();s.worker=null;
            if(s.url)URL.revokeObjectURL(s.url);s.url=null;
            for(const pending of s.pending.values()){clearTimeout(pending.timer);pending.reject(new Error('Local simulator closed.'));}s.pending.clear();
            try{sessionStorage.removeItem(LOCAL_SIM_STORE);}catch{}
            window.removeEventListener('pagehide',pagehide);
            if(localBattleSession===s)localBattleSession=null;
        };
        s.dataBridge=createLocalDataBridge(s);
        function pagehide(){save();s.stop();/* Keep the saved recipe for a reload. */try{if(s.cfg&&!cfg.shared)sessionStorage.setItem(LOCAL_SIM_STORE,JSON.stringify({...s.cfg,token,history:s.history,hackEnabled:!!s.hackEnabled,savedAt:Date.now()}));}catch{}}
        window.addEventListener('pagehide',pagehide);
        if(cfg.shared?.remote){s.cfg=cfg;return s;}
        try {
            const prepared=await acquireLocalSimulatorWorker();
            if(s.stopped){prepared.dispose();return s;}
            s.url=prepared.url;s.worker=prepared.worker;
            s.worker.onerror=event=>{localBattleError(roomFor(),event.message||'Local simulator failed.');s.stop();};
            s.worker.onmessage=event=>{const msg=event.data,pending=s.pending.get(msg?.id);if(!pending)return;clearTimeout(pending.timer);s.pending.delete(msg.id);if(msg.error)pending.reject(Error(msg.error));else pending.resolve(msg.result);};
            if(s.stopped)return s;
            const result=await call('start',{...cfg,clearCurrentRng:false});s.cfg=result.cfg;update(result,true);if(cfg.history?.length){const battle=app.rooms?.[roomFor()]?.battle;battle?.seekTurn(Infinity,true);presentRequest();}if(cfg.hackEnabled)s.setHackEnabled(true);
            if(!s.closed.has(s.roomids[0]))app.focusRoom?.(s.roomids[0]);
        } catch(error) {s.stop();if(error.message!=='Local simulator closed.')app.addPopupMessage('Could not start the local battle: '+error.message);}
        return s;
    }

    function startSelfChallenge(cfg) {
        if(window.qolSelf && !window.qolSelf.over) {app.addPopupMessage('A self-battle is already running.');return;}
        const format=isNoHoldsBarredFormat(cfg.format)?NO_HOLDS_BARRED_FORMAT:cfg.format;
        // No login, guest account, assertion request, /utm, or /challenge.
        runSelfSession({...cfg,hackEnabled:true,format,wantName:SELF.BOT_NAME,name:app.user?.get?.('name')||'Player'});
    }

    function resumeSelfChallenge() {
        patchLocalBattleRouting();
        let saved;
        try {saved=JSON.parse(sessionStorage.getItem(LOCAL_SIM_STORE));}catch{}
        if(!saved)return;
        if(Date.now()-(saved.savedAt||0)>SELF.MAX_AGE) {try{sessionStorage.removeItem(LOCAL_SIM_STORE);}catch{}return;}
        let tries=0;
        const wait=()=>{
            if(window.app?.receive && window.app?.send && window.BattleLog && document.body) {
                if(!window.qolSelf || window.qolSelf.over)runSelfSession(saved);
            } else if(++tries<1200)setTimeout(wait,50);
        };
        wait();
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
                    '<p style=text-align:center><strong>Sandbox</strong></p>' +
                    `<p><label class="label">Format<br><select name="format" ${sel}>${formatOptions}</select></label></p>` +
                    `<p><label class="label">Your team<br><select name="teamA" ${sel}></select></label></p>` +
                    `<p><label class="label">Opponent's team<br><select name="teamB" ${sel}></select></label></p>` +
                    '<p class="buttonbar"><button type="submit" class="button"><strong>Start local battle</strong></button> ' +
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
        button.textContent = 'Sandbox';
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
    function saveCustomFormatLabel(format, label, replacing=null) {
        const key = customFormatLabelKey(format);
        if (!key) return;
        const nameError=customFormatNameError(format,label,replacing);if(nameError)throw new Error(nameError);
        const active=activeImportedFormatCodes();
        if(!active.includes(key)){active.push(key);try{localStorage.setItem('qol-active-imported-formats-v1',JSON.stringify(active));}catch(e){}}
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
        for (const format of activeImportedFormatCodes()) {
            const label=getCustomFormatLabel(format)||displayFormatName(format);
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
        if (!text.includes('@@@')) return format;
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

    const storageMigrationState = new WeakMap();
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
        const teams = storage.teams;
        let repairedNames=false;
        for(const team of teams||[]){const format=String(team?.format||'');if(!format.includes('@@@')||!format.includes('/'))continue;
            const prefix=format.slice(format.lastIndexOf('/')+1)+(team.capacity===24?'-box]':']');
            if(String(team.name||'').startsWith(prefix)){team.name=team.name.slice(prefix.length);repairedNames=true;}}
        if(repairedNames)storage.saveTeams?.();
        const migrated = storageMigrationState.get(storage);
        if (migrated?.teams === teams && migrated?.length === teams?.length) return packed && unpacked;
        let decodedExisting = false;
        for (const team of teams || []) {
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
        // Late-loaded/replaced arrays and newly added teams are still checked.
        storageMigrationState.set(storage, {teams, length: teams?.length});
        return packed && unpacked;
    }

    // "nationaldexgodlygift" -> "gen9nationaldexgodlygift" (the client's own format id), or null.
    function resolveFormatKey(text, preferredGeneration = null) {
        const raw = String(text || '').trim();
        const id = toSearchId(raw);
        if (!id) return null;
        const formats = window.BattleFormats || {};
        if (formats[id]) return id;
        if (id === 'noholdsbarred') return NO_HOLDS_BARRED_FORMAT;

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

        // Saved names resolve through their own storage, not fake native
        // registry entries. Keep imported-name support after picker cleanup.
        const namedCustom=Object.entries(getCustomFormatLabels()).filter(([code,label])=>code.includes('@@@')&&toSearchId(label)===id);
        if(namedCustom.length===1)return namedCustom[0][0];
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
        if(IS_DAMAGE_CALC)return;
        // Remove old DOM-injected sections as well as registry-owned rows.
        document.querySelectorAll('.qol-custom-formats, .qol-imported-oms, .qol-challengeable-format, .qol-challengeable-om-ultramix, .qol-challengeable-oms').forEach(element=>element.remove());
        removeInjectedFormatEntries();
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
            : (resolved?.split('@@@')[0] || resolveFormatKey(candidate.replace(/^\[Gen\s*(\d+)\]/i, 'gen$1'), preferredGen));
        if (!base) return {error: onlyRules
            ? 'Open a team first, or include a format name.'
            : `Unknown format "${candidate}". Use a Showdown format ID (e.g. gen4ou).`};
        const inheritedRules = !onlyRules && resolved?.includes('@@@') ? resolved.split('@@@').slice(1).join(',') : '';
        const rules = [inheritedRules, onlyRules ? s : ruleText].filter(Boolean).join(',').split(',').map(squash).filter(token =>
            token && (!/^[a-z\[]/i.test(token) || fmtId(token) !== fmtId(base))); 
        // The saved format must use the native *ID*, not the display string or
        // the original "/challenge" recipient, or Gen and Dex will drift.
        return {base, rules, format: base + (rules.length ? '@@@' + rules.join(',') : '')};
    }

    // Puts `base@@@rules` on the open team (keeps the generation / dex in step).
    function applyTeamFormat(room, base, rules, customName = '', rawFormat = null) {
        const team = room?.curTeam;
        if (!team) return false;

        const oldFormat=team.format;
        const oldGen = String(team.format || '').match(/^gen(\d+)/)?.[1];
        const newGen = String(base).match(/^gen(\d+)/)?.[1];

        const nextFormat = cleanChallengeFormat(rawFormat ?? (rules.length ? base + '@@@' + rules.join(',') : base));
        const formatChanged = team.format !== nextFormat;

        team.format = nextFormat;
        constrainChallengeRoom(room);
        if (rules.length && customName) saveCustomFormatLabel(team.format, customName,(window.Storage.teams||[]).some(t=>t!==team&&challengeFormatIdentity(t.format)===challengeFormatIdentity(oldFormat))?null:oldFormat);
        if (!formatChanged) {
            syncExplicitFormatGeneration(team);
            room.save?.();
            // A name change should not reset the editor or duplicate its rows.
            decorateCustomFormatNames();
            return true;
        }
        // Synchronize even when the format prefix is unchanged: team.gen can
        // be stale after importing or reopening an existing custom-format team.
        syncExplicitFormatGeneration(team);

        room.save?.();
        if(oldFormat!==nextFormat&&!(window.Storage.teams||[]).some(t=>t.format===oldFormat))localStorage.setItem('qol-active-imported-formats-v1',JSON.stringify(activeImportedFormatCodes().filter(f=>f!==oldFormat)));
        refreshAfterFormatChange(room);
        return true;
    }

    // Result for the popup / console: {ok, format, label, mods, unknown, counts} or {error}.
    function importFormatText(room, text, customName = '') {
        if (!room?.curTeam) return {error: 'Open a team first.'};
        const parsed = parseFormatImport(text, {currentFormat: room.curTeam.format});
        if (parsed.error) return {error: parsed.error};
        const label = squash(customName);
        const nameError=customFormatNameError(parsed.format,label,(window.Storage.teams||[]).some(t=>t!==room.curTeam&&challengeFormatIdentity(t.format)===challengeFormatIdentity(room.curTeam.format))?null:room.curTeam.format);if(nameError)return {error:nameError};
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

            initialize(data={}) {
                this.scope=data.scope||null;
                this.draw();this.qolSelectionCleanup=preserveEditorSelection(this.el);
            },
            remove(){this.qolSelectionCleanup?.();return window.Popup.prototype.remove.apply(this,arguments);},

            draw(text = null, noteHtml = '', customName = null) {
                const wrap = (inner) =>
                `<div style="width:min(380px,80vw);${BOX};font-size:12px;line-height:1.4;white-space:normal;overflow-wrap:anywhere">${inner}</div>`;
                const team = this.scope?{format:this.scope.format}:getTeambuilderRoom()?.curTeam;
                if (!team) {
                    this.$el.html(wrap(
                        '<p>Open a team first.</p>' +
                        '<p class="buttonbar"><button type="button" class="button" data-qolfmt="close">Close</button></p>'
                    ));
                    return;
                }

                const current = cleanChallengeFormat(team.format || '');
                const hasRules = current.includes('@@@');
                const value = text ?? ('/challenge ' + current);
                const nameValue = customName ?? (getCustomFormatLabel(current) || displayFormatName(current));

                this.$el.html(wrap(
                    '<form>' +
                    '<p style="font-size:14px"><strong>'+ (this.scope?'Edit format for '+this.scope.teams.length+' teams':'Import format')+'</strong></p>' +
                    (this.scope?'<p>This changes the format of all '+this.scope.teams.length+' teams in this format folder. Team names and rosters are kept.</p>':'') +
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
                    (hasRules&&!this.scope ? '<button type="button" class="button" data-qolfmt="remove">Remove custom rules</button> ' : '') +
                    '<button type="button" class="button" data-qolfmt="close">Close</button></p></form>'
                ));
            },

            submit(e) {
                e.preventDefault();
                e.stopPropagation();

                const text = this.$('textarea[name=qolfmt]').val();
                const customName = this.$('input[name=qolfmtname]').val();
                const res = this.scope?applyBulkChallengeFormat(getTeambuilderRoom(),this.scope,text,customName):importFormatText(getTeambuilderRoom(), text, customName);
                if(this.scope&&res.ok){this.close();return;}

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
        if (!team) {installBulkFormatButton(room);return;}

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

// Run the real bundled validator without uploading teams or naming a guest.
    async function localSimulatorTask(method,...args){
        if(!['format','validate','prepare'].includes(method))throw Error('Unsupported local check.');
        const entry=await acquireLocalSimulatorWorker();
        return new Promise((resolve,reject)=>{let done=false;
            function finish(error,value,reusable=true){if(done)return;done=true;clearTimeout(timer);if(reusable)releaseLocalSimulatorWorker(entry);else entry.dispose();error?reject(error):resolve(value);}
            const timer=setTimeout(()=>finish(Error('The local validator timed out.'),null,false),30000);
            entry.worker.onerror=e=>finish(Error(e.message||'Local validator failed.'),null,false);
            entry.worker.onmessage=e=>{const message=e.data;if(message?.id===1)finish(message.error?Error(message.error):null,message.result);};
            try{entry.worker.postMessage({id:1,method,args});}catch(error){finish(error,null,false);}
        });
    }
    let customValidation=null;
    async function validateCustomFormatLocally(team) {
        if(customValidation)return app.addPopupMessage('A team check is already running.');
        const room=getTeambuilderRoom();room?.save?.();
        const packed=selfPackedOf(team),format=cleanChallengeFormat(team.format);
        if(!packed)return app.addPopupMessage('Add a Pokémon before validating this team.');
        const button=room?.el?.querySelector('button[name=validate]');
        const state={button,label:button?.textContent};customValidation=state;
        if(button){button.disabled=true;button.textContent='Checking…';}
        try {
            const result=await localSimulatorTask('validate',{format,packed});
            const name=displayFormatName(format);
            app.addPopupMessage(result.problems.length?'Local validation · '+name+'\n\n'+result.problems.map(p=>'• '+p).join('\n'):'Team passed local validation for '+name+'.\n\nChecked all custom rules using the bundled Showdown validator. Online servers may have newer rules.');
            return result;
        }catch(error){app.addPopupMessage('Could not validate this format locally: '+error.message);}
        finally{if(button?.isConnected){button.disabled=false;button.textContent=state.label;}if(customValidation===state)customValidation=null;}
    }
    // Compatibility aliases for existing integrations; no helper connection exists.
    const validateCustomFormatWithBot=validateCustomFormatLocally;
    const filterValidationTraffic=data=>data;
    function closeValidationHelper(){}
    function validationFinish(){}

    // Custom formats use the bundled validator; plain formats keep native validation.
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
            try { validateCustomFormatLocally(team); }
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
    function customFormatNameError(format,label,replacing=null){
        const name=squash(label).toLowerCase();if(!name)return '';
        const labels=getCustomFormatLabels(),codes=new Set([...activeImportedFormatCodes(),...(window.Storage?.teams||[]).map(t=>t?.format)]);
        for(const code of codes)if(code?.includes('@@@')&&(!replacing||challengeFormatIdentity(code)!==challengeFormatIdentity(replacing))&&challengeFormatIdentity(code)!==challengeFormatIdentity(format)&&squash(labels[code]||displayFormatName(code)).toLowerCase()===name)return 'That format name already belongs to a different challenge code. Choose a different name.';
        return '';
    }
    function normalizeImportedFormatNames(){
        const labels=getCustomFormatLabels(),codes=[...new Set([...(window.Storage?.teams||[]).map(t=>t?.format),...activeImportedFormatCodes()])].filter(f=>f?.includes('@@@'));
        const renames=new Map(),used=new Map(),reserved=new Set(codes.map(f=>squash(labels[f]||displayFormatName(f)).toLowerCase()).filter(Boolean));let changed=false;
        for(const code of codes){const name=squash(labels[code]||displayFormatName(code));if(!name)continue;if(!labels[code]){labels[code]=name;changed=true;}const id=challengeFormatIdentity(code),key=name.toLowerCase(),prior=used.get(key);
            if(!prior||prior===id){used.set(key,id);continue;}
            const group=id+'\n'+key;if(renames.has(group)){labels[code]=renames.get(group);changed=true;continue;}
            let n=2,next;do{next=name+' ('+n++ +')';}while(reserved.has(next.toLowerCase()));
            labels[code]=next;renames.set(group,next);reserved.add(next.toLowerCase());used.set(next.toLowerCase(),id);changed=true;}
        if(changed)localStorage.setItem(CUSTOM_FORMAT_LABELS_KEY,JSON.stringify(labels));
    }
    function activeImportedFormatCodes() {
        return [...new Set((window.Storage?.teams||[]).map(team=>String(team?.format||'')).filter(format=>format.includes('@@@')))];
    }
    function savedCustomFormats() {
        normalizeImportedFormatNames();
        const map=new Map(),excluded=new Set([...getHiddenImportedFormatKeys(),...getDeletedImportedFormatKeys()].map(challengeFormatIdentity));
        const add=f=>{f=String(f||'');if(!f.includes('@@@')||excluded.has(challengeFormatIdentity(f)))return;
            const key=JSON.stringify([challengeFormatIdentity(f),getCustomFormatLabel(f)]);if(!map.has(key))map.set(key,f);};
        for(const f of activeImportedFormatCodes())add(f);
        for(const team of window.Storage?.teams||[])add(team?.format);

        return [...map.values()].sort((a,b)=>displayFormatName(a).localeCompare(displayFormatName(b))||a.localeCompare(b));
    }

    // Keep the native dropdown native. Imported formats remain saved with
    // their teams and in Import Format, but never become dropdown entries.
    function isImportedFormatEntry(key, format) {
        return !!format?.__qolSavedFormat || String(key).includes('@@@') || String(format?.id || '').includes('@@@');
    }
    function removeInjectedFormatEntries() {
        const formats=window.BattleFormats;
        if(!formats)return;
        const saved=new Set(savedCustomFormats());for(const [key,format]of Object.entries(formats))if(isImportedFormatEntry(key,format)&&!(format.__qolSavedFormat&&format.section==='Imported Formats'&&saved.has(key)))delete formats[key];
    }
    function installNativeCustomFormats() {
        removeInjectedFormatEntries();
        const proto=window.FormatPopup?.prototype,log=window.BattleLog;
        if(!proto?.renderFormats||!log)return;
        for(const method of ['formatName','escapeFormat'])if(typeof log[method]==='function')patchMethod(log,method,'qol-saved-format-label-only',original=>function(format,...args){
            if(String(format||'').includes('@@@')){const name=getCustomFormatLabel(format)||displayFormatName(format);return method==='escapeFormat'?log.escapeHTML(name):name;}
            return original.call(this,format,...args);
        });
        patchMethod(proto,'shouldDisplayFormat','qol-imported-challenge-only',original=>function(format,...args){if(format?.__qolSavedFormat)return this.selectType==='challenge'||this.selectType==='teambuilder';return original.call(this,format,...args);});
        patchMethod(proto,'renderFormats','qol-imported-challenge-formats',original=>function(...args){
            removeInjectedFormatEntries();
            const saved=savedCustomFormats();
            for(const code of saved){const base=window.BattleFormats?.[code.split('@@@')[0]];if(!base)continue;window.BattleFormats[code]={...base,id:code,name:displayFormatName(code),effectType:'Format',battleFormat:undefined,section:'Imported Formats',column:Object.values(window.BattleFormats).find(f=>/^Challengeable OMs$/i.test(f.section||''))?.column||2,searchShow:false,challengeShow:true,isTeambuilderFormat:true,teambuilderFormat:code,__qolSavedFormat:true};}
            let html=renderImportedFormatSearch(this,()=>original.apply(this,args));for(const code of saved)html=html.split('value="'+code+'"').join('value="'+log.escapeHTML(code)+'"');            const section=/<p><details([^>]*section="Imported Formats"[^>]*)>[\s\S]*?(?:<\/details><\/p>|(?=<\/ul>))/;
            const match=section.exec(html);if(match){const target=/<p><details[^>]*section="Challengeable OMs"[^>]*>[\s\S]*?<\/details><\/p>/i;if(target.test(html)){html=html.replace(section,'');const content=match[0]+(match[0].endsWith('</p>')?'':'</details></p>');html=html.replace(target,heading=>heading+content);}}
            return html;
        });
    }

    function decorateCustomFormatDropdown() {if(!IS_DAMAGE_CALC)installNativeCustomFormats();}

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
        ['revelationmons', 'Revelationmons', 'Changes the first move slots to match the Pokémon’s type slots.'],
        ['categoryswap', 'Category Swap', 'Swaps physical and special move categories.'],
        ['flipped', 'Flipped', 'Reverses HP / Atk / Def / SpA / SpD / Spe.'],
        ['reevolution', 'Re-Evolution', 'Adds the base-stat difference from the immediate pre-evolution, capped at 255.'],
        ['350cup', '350 Cup', 'Doubles every base stat when the original BST is 350 or lower.'],
        ['natureswap', 'Nature Swap', 'Swaps the base stats boosted and lowered by the selected nature.'],
        ['franticfusions', 'Frantic Fusions', 'Adds one quarter of the donor’s non-HP stats.'],
        ['godlygift', 'Godly Gift', 'Receives the selected God’s stat for this team position.'],
        ['sharedpower', 'Shared Power', 'Each Pokémon also has the abilities listed under Team abilities.'],
    ];

    let calcOmMode = '';
    let calcOmOverflow = true;
    const calcOmSelected = () => calcOmMode;

    // ====================================================================
    // Prepare both Pokémon and ability-specific field/move behavior before damage.
    // ====================================================================
    // Pokébilities / Shared Power core
    // ====================================================================

    const CALC_OM_ABILITY_MODES = new Set(['pokebilities', 'sharedpower']);
    const calcOmAbilityMode = () => CALC_OM_ABILITY_MODES.has(calcOmSelected());

    const calcOmSupport = {ok: false, reason: 'not installed yet', calls: 0, cloneLost: false, neverCalled: false};

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




// Preserve calculated move edits through the calculator's reconstructing clone.
function calcOmPreparedMove(move){
 if(move.__qolPreparedMove)return move;
 const clone=move.clone;
 move.clone=function(...args){const copy=clone.apply(this,args);copy.flags={...this.flags};copy.hits=this.hits;copy.type=this.type;copy.bp=this.bp;copy.category=this.category;return calcOmPreparedMove(copy);};
 Object.defineProperty(move,'__qolPreparedMove',{value:true});return move;
}

function calcOmPreserveFormValues(form){
 const values=form.find('input,select,textarea').toArray().filter(el=>!el.matches('.set-selector,.forme,.total')).map(el=>({el,value:window.$(el).val(),checked:el.checked}));
 return ()=>{for(const entry of values){if(!entry.el.isConnected)continue;window.$(entry.el).val(entry.value);if(entry.el.type==='checkbox'||entry.el.type==='radio')entry.el.checked=entry.checked;}};
}

// Install before native DOM-ready initialization, not on every calculator tick.
function installCalcLoadGuards(){
 if(!window.$||typeof window.getSetOptions!=='function')return;
 let cache=null;
 const original=window.getSetOptions;
 window.getSetOptions=function(sets){const key=[window.pokedex,window.setdex,window.randdex,sets,!!window.$('#randoms').prop('checked')];if(cache&&key.every((item,i)=>item===cache.key[i]))return cache.value;const value=original.apply(this,arguments);cache={key,value};return value;};
 document.addEventListener('change',event=>{if(event.target.matches('.gen,#importedSets,#randoms'))cache=null;},true);
 // Imported sets can mutate the current data object in place.
 for(const method of ['addSets','loadCustomList'])if(typeof window[method]==='function'){const fn=window[method];window[method]=function(...args){cache=null;return fn.apply(this,args);};}
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

        calcOmNeutralize(a,d);calcOmNeutralize(d,a);
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

        if(preparedMove!==move)calcOmPreparedMove(preparedMove);
        return {attacker: a, defender: d, move: preparedMove, field: calcOmFieldFromAbilities(field, a, d)};
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
            const active = calcOmAbilityMode();
            if (!active && !attacker?.__qolOmTracked && !defender?.__qolOmTracked) {
                return originalCalculate.call(ns, gen, attacker, defender, move, field, ...rest);
            }
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

            if (!active) return run();

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
                onLoad();
            })
            .catch((error) => {
                calcOmPsDexRequested = false;
                console.warn(LOG, 'Could not load Pokédex abilities:', error);
            });
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
        if (fromGeneration?.baseStats && fromGeneration.exists !== false) return fromGeneration;
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
        return calcOmFormSource(pokeInfo, pokemon.gen);
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

    function calcOmSwapMoveCategory(move) {
        if (!move || move.category === 'Status' || CATEGORY_DYNAMIC_MOVES.has(toSearchId(move.name))) return move;
        let category = move.category;
        const clone = move.clone;
        Object.defineProperty(move, 'category', {
            configurable: true, enumerable: true,
            get: () => category === 'Status' ? 'Status' : category === 'Physical' ? 'Special' : 'Physical',
            set: (value) => { category = value; },
        });
        if (typeof clone === 'function') {
            move.clone = function () {
                const next = clone.call(this);
                next.category = category;
                return calcOmSwapMoveCategory(next);
            };
        }
        return move;
    }

    function calcOmPreviewMoves(pokemon, mod) {
        pokemon.moves = (pokemon.moves || []).map((move, slot) => {
            if (!move || typeof move !== 'object') return move;
            if (mod === 'categoryswap') return calcOmSwapMoveCategory(move);
            if (pokemon.types?.[slot] && !REVELATION_UNCHANGED_MOVES.has(toSearchId(move.name))) {
                move.type = pokemon.types[slot];
            }
            return move;
        });
        return pokemon;
    }

    function applyCalcOm(pokemon, pokeInfo) {
        const mod = calcOmSelected();
        if (!mod || !pokemon?.species) return pokemon;
        if (mod === 'categoryswap' || mod === 'revelationmons') return calcOmPreviewMoves(pokemon, mod);

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
                    : clamp255(pokemon.species.baseStats[stat] + Math.floor(calcOmSpeciesStat(donor, stat) / 4));
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
                stats[donatedStat] = calcOmSpeciesStat(god, donatedStat);
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
        return g == null ? 9 : Number(g);
    }

    function calcOmGeneration() {
        try {
            return window.calc?.Generations?.get?.(calcOmGenNumber());
        } catch (e) {
            return undefined;
        }
    }

    // Only read the species table when the user types in a donor field.
    let calcOmSourceIndex;
    function calcOmSourceSuggestions(query) {
        const term = toSearchId(query);
        if (!term) return [];
        const gen = calcOmGenNumber();
        const dex = (typeof pokedex !== 'undefined' && pokedex) || window.pokedex || window.calc?.SPECIES?.[gen];
        if (!calcOmSourceIndex || calcOmSourceIndex.gen !== gen || calcOmSourceIndex.dex !== dex) {
            calcOmSourceIndex = {gen, dex, names: calcOmIndexSpecies(dex)};
        }
        const matches = [];
        for (const [id, name] of calcOmSourceIndex.names) {
            if (!id.includes(term)) continue;
            matches.push(name);
            if (matches.length === 30) break;
        }
        return matches;
    }

    function calcOmIndexSpecies(legacy) {
        const names = new Map(); // searchId -> display name
        const add = (name) => {
            const key = toSearchId(name);
            if (key && !names.has(key)) names.set(key, String(name));
        };

        for (const [key, entry] of Object.entries(legacy || {})) add(entry?.name || key);

        const genSpecies = calcOmGeneration()?.species;
        try {
            for (const entry of genSpecies || []) add(entry?.name);
        } catch (e) { /* not iterable in this build */ }

        return [...names].sort((a, b) => a[1].localeCompare(b[1]));
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
        const formMod = mod && !CALC_OM_ABILITY_MODES.has(mod) &&
            !['revelationmons', 'categoryswap'].includes(mod) ? mod : '';
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

    function installCalcOmStatOverflow() {
        const stats = window.calc?.Stats;
        if (typeof stats?.calcStat !== 'function' || stats.calcStat.__qolOverflow) return;
        const original = stats.calcStat;
        const wrapped = function (gen, stat, base, iv, ev, level, natureName) {
            if (gen.num < 3 || stat === 'hp') return original.apply(this, arguments);
            const nature = gen.natures.get(toSearchId(natureName || 'Serious'));
            const multiplier = nature?.plus === nature?.minus ? 1 :
                nature?.plus === stat ? 1.1 : nature?.minus === stat && calcOmMode !== 'natureswap' ? 0.9 : 1;
            if (multiplier === 1) return original.apply(this, arguments);
            const raw = original.call(this, gen, stat, base, iv, ev, level, 'Serious');
            return natureStatValue(raw, multiplier, calcOmOverflow);
        };
        wrapped.__qolOverflow = true;
        stats.calcStat = wrapped;
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
            installCalcOmStatOverflow();

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

            const overflowLabel = document.createElement('label');
            overflowLabel.style.cssText = 'display:block;text-align:center;margin:6px 0;font-size:12px;';
            const overflow = document.createElement('input');
            overflow.type = 'checkbox';
            overflow.checked = calcOmOverflow;
            overflow.className = 'qol-calc-overflow';
            overflowLabel.append(overflow, document.createTextNode(' Overflow Stat Mod'));
            row.append(overflowLabel);

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
                const source = document.createElement('input');
                source.type = 'search';
                source.id = `qol-om-source-${side}`;
                source.className = 'qol-calc-om-source';
                source.placeholder = '(none)';
                source.style.width = '170px';
                source.autocomplete = 'off';
                source.setAttribute('list', 'qol-om-source-list');
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

            const updateSourceSuggestions = (event) => {
                const source = event.currentTarget;
                let list = document.getElementById('qol-om-source-list');
                if (!list) {
                    list = document.createElement('datalist');
                    list.id = 'qol-om-source-list';
                    row.append(list);
                }
                list.replaceChildren(...calcOmSourceSuggestions(source.value).map((name) => new Option(name, name)));
            };
            for (const source of document.querySelectorAll('.qol-calc-om-source')) {
                source.addEventListener('focus', updateSourceSuggestions);
                source.addEventListener('input', updateSourceSuggestions);
            }

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
                    const source = sourceLabel.querySelector('.qol-calc-om-source');
                    const slotLabel = fields.querySelector('.qol-om-slot-label');

                    fields.style.display = config ? 'flex' : 'none';
                    sourceText.textContent = config ? config[0] : '';
                    source.title = config ? config[1] : '';
                    source.setAttribute('aria-label', `${side.toUpperCase()} ${config?.[0] || 'OM source'}`);
                    slotLabel.style.display = mod === 'godlygift' ? 'inline-flex' : 'none';
                }

                for (const sharedGroup of document.querySelectorAll('.qol-om-shared-group')) {
                    sharedGroup.style.display = sharedMode ? '' : 'none';
                }
                if (sharedMode) calcOmFillAbilityDatalist();
                updateStatus();
            };

            // ---------- wrap the calculator's own functions ----------

            window.createPokemon = function (pokeInfo, ...args) {
                const pokemon = originalCreatePokemon.call(this, pokeInfo, ...args);
                if (!calcOmMode || typeof pokeInfo === 'string') return pokemon;
                const applied = window.$(pokeInfo).data('qolOmApplied');
                return applied === calcOmSelected() ? pokemon : applyCalcOm(pokemon, pokeInfo);
            };

            window.autoUpdateStats = function (side, ...args) {
                const pokeInfo = window.$(side);
                const ability = pokeInfo.find('select.ability');
                const restoreUserValues=calcOmPreserveFormValues(pokeInfo);const flags=[!!window.shouldUseMnM,!!window.shouldUseTS,!!window.shouldUseScale,calcOmSelected()].join('|');const previousFlags=pokeInfo.data('qolOmLastNativeFlags');
                const previousAbility = ability.val();
                const previousOption = ability.find('option:selected').first();
                const previousLabel = previousOption.text();
                const previousSpecies = String(pokeInfo.find('input.set-selector,select.set-selector').first().val() || '');
                const previousForme = String(pokeInfo.find('.forme').val() || '');
                const lastLoaded = pokeInfo.data('qolOmLastLoadedSpecies');
                // Keep native set loading when the actual Pokémon changes, but
                // preserve manually chosen abilities on routine calculator updates.
                pokeInfo.find('.ability option[data-qol-om="true"]').remove();
                const result = originalAutoUpdateStats.call(this, side, ...args);
                const currentSpecies = String(pokeInfo.find('input.set-selector,select.set-selector').first().val() || '');
                const currentForme = String(pokeInfo.find('.forme').val() || '');
                const sameSpecies = previousSpecies === currentSpecies &&
                    previousForme === currentForme &&
                    lastLoaded === currentSpecies + '|' + currentForme;
                if(sameSpecies&&(previousFlags===undefined||previousFlags===flags)&&!window.shouldUseMnM)restoreUserValues();pokeInfo.data('qolOmLastNativeFlags',flags);
                const updatedAbility = pokeInfo.find('select.ability');
                if (sameSpecies && !window.shouldUseMnM && previousAbility && updatedAbility.length &&
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
                if(sameSpecies&&!window.shouldUseMnM){window.calcHP?.(pokeInfo);window.calcStats?.(pokeInfo);}
                pokeInfo.data('qolOmLastLoadedSpecies', currentSpecies + '|' + currentForme);
                if (pokeInfo.length) syncCalcOmForm(pokeInfo);
                return result;
            };

            const syncForms = () => {
                for (const side of ['#p1', '#p2']) {
                    const form = window.$(side);
                    if (form.length) syncCalcOmForm(form);
                }
            };
            let refreshPending = false;
            const switchIns = new Set();
            const refreshForms = (autoSide) => {
                if (autoSide === 'p1' || autoSide === 'p2') switchIns.add(autoSide);
                if (refreshPending) return;
                refreshPending = true;
                window.setTimeout(() => {
                    refreshPending = false;
                    // The native set loader would reset manually edited moves, items and abilities.
                    syncForms();
                    // Apply switch-in weather/terrain only for sides that changed.
                    if (calcOmAbilityMode()) switchIns.forEach(calcOmAutoSetField);
                    switchIns.clear();
                    const callsBefore = calcOmSupport.calls;
                    window.performCalculationsOM?.();
                    calcOmSupport.neverCalled =
                        calcOmAbilityMode() && calcOmSupport.ok && calcOmSupport.calls === callsBefore;
                    updateStatus();
                }, 0);
            };

            // ---------- jQuery handlers (Select2 only fires jQuery events) ----------

            for (const side of ['p1', 'p2']) {
                const form = window.$(`#${side}`);
                // Record the currently loaded Pokémon/form before native
                // updates; never restore another set's ability by mistake.
                form.data('qolOmLastLoadedSpecies',
                    String(form.find('input.set-selector,select.set-selector').first().val() || '') + '|' +
                    String(form.find('.forme').val() || ''));

                // The native handler (registered earlier) has just overwritten the
                // form with the new Pokémon's data, so our "applied" flag is no
                // longer true. A new Pokémon switching in also sets weather/terrain.
                form.find('input.set-selector, select.set-selector, .forme')
                    .off('change.qolCalcOm')
                    .on('change.qolCalcOm', () => {
                    if (!calcOmMode) return;
                    form.removeData('qolOmApplied');
                    form.removeData('qolOmFormKey'); // Native set reload also resets the base stats.
                    refreshForms(side);
                });

                // Changing the selected ability is also a switch-in state change
                // for entry abilities, even when species and set stay the same.
                form.find('.ability').off('change.qolCalcOmWeather').on('change.qolCalcOmWeather', () => {
                    if (!calcOmAbilityMode()) return;
                    refreshForms(side);
                });

                form.find('.move-selector, .move-type')
                    .off('change.qolCalcOm')
                    .on('change.qolCalcOm', () => {
                    if (calcOmSelected() !== 'camomons') return;
                    refreshForms();
                });
            }

            document.addEventListener('qol-shared-change', (event) => refreshForms(event.detail?.side));
            overflow.addEventListener('change', () => {
                calcOmOverflow = overflow.checked;
                for (const side of ['#p1', '#p2']) window.calcStats?.(window.$(side));
                refreshForms();
            });

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
                calcOmMode = input.checked ? input.value : '';
                if (calcOmAbilityMode()) {
                    installCalcOmAbilitySupport();
                    refreshForms('p1');
                    refreshForms('p2');
                    if (calcOmMode === 'pokebilities') {
                        calcOmLoadPsDex(() => {
                            if (calcOmMode !== 'pokebilities') return;
                            refreshForms();
                        });
                    }
                } else {
                    refreshForms();
                }
                updateInlineControls();
            });

            document.addEventListener('change', (event) => {
                if (!calcOmMode) return;
                if (event.target.matches('.om-trigger') && event.target.checked) {
                    calcOmMode = '';
                    for (const input of row.querySelectorAll('.qol-calc-om')) input.checked = false;
                    updateInlineControls();
                    // Restore the base form before the native modifier reads it.
                    syncForms();
                } else if (event.target.matches('#p1 .nature, #p2 .nature')) {
                    if (calcOmMode === 'natureswap') refreshForms();
                } else if (event.target.closest('.qol-calc-om-fields')) {
                    refreshForms();
                }
            }, true);

            console.info(LOG, 'Damage Calculator OM controls ready');
        }, 250);
    }

    // Editor consequences of challenge rules. Keep the full rule string for
    // validation; only simplify controls when the permitted choice is certain.
    function categoryBanned(bans,kind,id){
        const unbans=bans?.[{items:'unbannedItems',abilities:'unbannedAbilities',moves:'unbannedMoves',species:'unbanned'}[kind]];
        if(unbans?.has(id))return false;
        return !!bans?.[kind]?.has(id)||!!bans?.tags?.has('all'+({species:'pokemon'}[kind]||kind));
    }
    const challengeEditorProfiles=new Map();
    function editorRuleProfile(format,bans){
        const implicit=arguments.length<2,key=String(format||''),now=Date.now();
        if(implicit){const hit=challengeEditorProfiles.get(key);if(hit&&now-hit.time<250)return hit.profile;bans=getMergedBansForFormat(format);}
        bans=bans||addExplicitClauseBans(applyCustomRuleTokens(emptyBanSections(),formatRuleTokens(format).map(op=>op.raw)),format);
        const clauses=resolveClauseRules(bans,format),ops=[...(bans.ruleset||[]),...formatRuleTokens(format).map(op=>op.raw)];
        const values=new Map();
        for(const raw of ops){const op=parseChallengeRule(raw);if(op?.kind==='remove')values.delete(op.id);else if(['value','replace'].includes(op?.kind))values.set(op.id,op.value);}
        const ranges={};
        for(const entry of String(values.get('evlimits')||'').split('/')){
            const m=/^\s*(hp|atk|def|spa|spd|spe)\s+(\d{1,4})\s*-\s*(\d{1,4})\s*$/i.exec(entry);
            if(!m)continue;const min=Number(m[2]),max=Number(m[3]);
            // Invalid/unrepresentable ranges remain a validator error, not a
            // reason to silently fabricate different rules or stat mechanics.
            if(min<=max&&max<=252)ranges[m[1].toLowerCase()]={min,max};
        }
        const noItems=!!bans.tags?.has('allitems')&&![...(bans.unbannedItems||[])].some(id=>id&&id!=='noitem');
        const noAbility=!!bans.tags?.has('allabilities')&&bans.unbannedAbilities?.has('noability')&&
            ![...bans.unbannedAbilities].some(id=>id!=='noability')&&!clauses.has('obtainableabilities');
        const profile={bans,clauses,values,ranges,noItems,noAbility,noTera:clauses.has('terastalclause')};
        if(implicit){if(challengeEditorProfiles.size>=64)challengeEditorProfiles.delete(challengeEditorProfiles.keys().next().value);challengeEditorProfiles.set(key,{time:now,profile});}
        return profile;
    }
    function constrainChallengeSet(set,profile){
        if(!set?.species)return false;let changed=false;
        const assign=(object,key,value)=>{if(object[key]!==value){object[key]=value;changed=true;}};
        if(profile.noItems)assign(set,'item','');
        if(profile.noAbility)assign(set,'ability','No Ability');
        const levelRule=(key)=>/^\d+$/.test(profile.values.get(key)||'')?Number(profile.values.get(key)):null;
        const low=levelRule('minlevel'),high=levelRule('maxlevel'),initial=levelRule('defaultlevel');
        if((low||high||initial)&&((low||1)<=(high||100))){
            const level=Math.max(low||1,Math.min(high||100,set.level??initial??100));
            if(level!==100||set.level!==undefined)assign(set,'level',level);
        }
        return changed;
    }
    function initializeChallengeRanges(set,next,previous){
        if(!set?.species)return false;let changed=false;
        for(const [stat,range]of Object.entries(next.ranges)){
            const old=previous?.ranges[stat];
            if(old?.min===range.min&&old?.max===range.max)continue;
            if(!set.evs)set.evs={};
            if(set.evs[stat]!==range.min){set.evs[stat]=range.min;changed=true;}
        }
        return changed;
    }
    function constrainChallengeRoom(room){
        if(!room?.curTeam?.format?.includes('@@@'))return false;
        const profile=editorRuleProfile(room.curTeam.format);let changed=false;
        for(const set of room.curSetList||[])changed=constrainChallengeSet(set,profile)||changed;
        if(profile.values.has('evlimit')){
            const limit=explicitSuggestionEVLimit(room.curTeam.format,room.curTeam.gen);
            if(limit!==undefined)room.ignoreEVLimits=limit===null;
        }else if(formatRuleTokens(room.curTeam.format).some(op=>op.id==='evlimit'&&op.kind==='remove'))room.ignoreEVLimits=true;
        return changed;
    }
    const FORME_REQUIRED_ABILITIES={"castformsunny":"Forecast","castformrainy":"Forecast","castformsnowy":"Forecast","cherrimsunshine":"Flower Gift","darmanitanzen":"Zen Mode","darmanitangalarzen":"Zen Mode","greninjaash":"Battle Bond","aegislashblade":"Stance Change","zygardecomplete":"Power Construct","wishiwashischool":"Schooling","miniormeteor":"Shields Down","mimikyubusted":"Disguise","mimikyubustedtotem":"Disguise","cramorantgulping":"Gulp Missile","cramorantgorging":"Gulp Missile","eiscuenoice":"Ice Face","morpekohangry":"Hunger Switch","palafinhero":"Zero to Hero","terapagosterastal":"Tera Shift","terapagosstellar":"Tera Shift"};
    function challengeTechnicalReason(sp,format,bans,dex,profile=editorRuleProfile(format,bans)){
        if(!sp?.exists)return null;
        if(profile.clauses.has('obtainableformes')){
            if(sp.id==='terapagosstellar'&&profile.noTera)return 'Terastal Clause prevents the Stellar transformation';
            const ability=sp.requiredAbility||FORME_REQUIRED_ABILITIES[sp.id];
            if(ability&&categoryBanned(bans,'abilities',toID(ability)))return 'Required transformation ability: '+ability;
            const required=sp.requiredItems|| (sp.requiredItem?[sp.requiredItem]:[]);
            if(required.length&&required.every(item=>categoryBanned(bans,'items',toID(item))))return 'Required item: '+required.join(' or ');
            if(sp.requiredMove&&categoryBanned(bans,'moves',toID(sp.requiredMove)))return 'Required move: '+sp.requiredMove;
        }
        if(isPokebilitiesFormat(format)){
            const ability=nativeBannedAbility(bans,sp);if(ability)return 'Native ability: '+ability;
            const combo=nativeBannedCombo(bans,sp);if(combo)return 'Native ability combination: '+combo;
        }
        // With ordinary obtainable abilities, a species needs at least one
        // legal native slot. AAA-style formats deliberately remove that rule.
        if(profile.clauses.has('obtainableabilities')){
            const abilities=Object.entries(sp.abilities||{}).filter(([slot])=>slot!=='S').map(([,name])=>name);
            if(abilities.length&&abilities.every(name=>categoryBanned(bans,'abilities',toID(name))))return 'No permitted native ability';
        }
        return null;
    }
    function paintChallengeEditor(room){
        const root=room?.el;if(!root)return;
        const profile=room.curTeam?.format?.includes('@@@')?editorRuleProfile(room.curTeam.format):null;
        root.classList.toggle('qol-no-items',!!profile?.noItems);
        root.classList.toggle('qol-no-abilities',!!profile?.noAbility);
        root.classList.toggle('qol-no-tera',!!profile?.noTera);
        if(!profile)return;
        for(const [stat,{min,max}]of Object.entries(profile.ranges))for(const input of root.querySelectorAll(`input[name="stat-${stat}"],input[name="evslider-${stat}"]`)){
            input.min='0';input.max='252';
            if(input.name.startsWith('evslider')){input.step='1';input.disabled=min===max;}
            else input.readOnly=false;
            input.title=min===max?`Required by EV Limits: ${min}`:`EV Limits: ${min}–${max}`;
            if(room.curSet)input.value=String(room.curSet.evs?.[stat]??min)+(input.name.startsWith('stat-')&&room.plus===stat?'+':input.name.startsWith('stat-')&&room.minus===stat?'-':'');
        }
        for(const label of root.querySelectorAll('.detailcell label'))if(label.textContent==='Tera Type')label.parentElement.classList.add('qol-tera-detail');
        for(const input of root.querySelectorAll('select[name=teratype]'))input.closest('.formrow')?.classList.add('qol-tera-detail');

    }
    function stripChallengeAbilityColumns(html){
        const format=getActiveTeambuilderRoom()?.curTeam?.format||'';
        if(!String(format).includes('@@@')||!editorRuleProfile(format).noAbility)return html;
        return html.replace(/(<span class="col (?:two)?abilitycol[^\"]*">)[\s\S]*?<\/span>/g,'$1</span>');
    }
    function renderImportedFormatSearch(popup,render){
        const query=toSearchId(popup.search||'');if(!query)return render();
        const search=popup.search,open=popup.open,display=popup.shouldDisplayFormat,own=Object.hasOwn(popup,'shouldDisplayFormat');
        popup.search='';popup.open={...open};
        for(const format of Object.values(window.BattleFormats||{}))if(format?.section)popup.open[format.section]=true;
        popup.shouldDisplayFormat=function(format,...args){
            const name=format?.__qolSavedFormat?displayFormatName(format.id):format?.name||'';
            return (toSearchId(format?.id||'').includes(query)||toSearchId(name).includes(query))&&display.call(this,format,...args);
        };
        try{return render();}finally{popup.search=search;popup.open=open;if(own)popup.shouldDisplayFormat=display;else delete popup.shouldDisplayFormat;}
    }
    function customFormatUploadInfo(team){
        const format=String(team?.format||'');if(!format.includes('@@@'))return null;
        const base=fmtId(format.split('@@@')[0]);
        const clean=value=>String(value||'').replace(/[,\r\n|\x00]/g,' ').replace(/\s+/g,' ').trim();
        const label=clean(getCustomFormatLabel(format)||displayFormatName(format)).slice(0,60)||'Custom';
        const name=(clean(team.name)||'Untitled Team').slice(0,100-label.length-3)+' ('+label+')';
        return {format:base,name};
    }
    function patchChallengeRuleEditor(){
        const proto=window.TeambuilderRoom?.prototype;if(!proto)return false;
        if(!document.getElementById('qol-challenge-editor-style')){
            const style=document.createElement('style');style.id='qol-challenge-editor-style';
            style.textContent='.qol-no-items .setcell-item,.qol-no-items .itemicon,.qol-no-abilities .setcell-ability,.qol-no-tera .qol-tera-detail{display:none!important}.qol-no-items .setcell-typeicons{margin-left:0}';document.head.appendChild(style);
        }
        patchMethod(proto,'psExport','__qolCustomFormatDatabaseUpload',original=>function(...args){
            const team=this.curTeam,info=customFormatUploadInfo(team);if(!info)return original.apply(this,args);
            if(window.BattleFormats?.[info.format]?.team){app.addPopupMessage('The Showdown database requires a base format that uses player-built teams.');return;}
            this.curTeam={...team,...info};
            try{return original.apply(this,args);}finally{this.curTeam=team;}
        });
        for(const method of ['update','updateTeamView','updateSetView','updateDetailsForm','updateStatForm','updateStatGraph','save','chartSet','setPokemon']){
            if(typeof proto[method]!=='function')continue;
            patchMethod(proto,method,'__qolChallengeRules_'+method,original=>function(...args){
                // Reconcile before native rendering/saving, and again after
                // species selection or guessed EVs have initialized a set.
                const priorSpecies=this.curSet?.species;
                const before=constrainChallengeRoom(this);
                const result=original.apply(this,args);
                const initialized=method==='setPokemon'&&this.curSet?.species!==priorSpecies&&this.curTeam?.format?.includes('@@@')?initializeChallengeRanges(this.curSet,editorRuleProfile(this.curTeam.format),null):false;
                const changed=constrainChallengeRoom(this)||before||initialized;
                if(initialized)this.updateStatGraph?.();
                if(changed&&method!=='save'&&!this.__qolRuleSaving){this.__qolRuleSaving=true;try{this.save?.();}finally{this.__qolRuleSaving=false;}}
                paintChallengeEditor(this);
                if(method==='setPokemon'&&args[1]&&this.curTeam?.format?.includes('@@@')&&editorRuleProfile(this.curTeam.format).noItems)this.$('input[name=move1]').select();
                return result;
            });
        }
        for(const method of ['statSlide','statChange'])patchMethod(proto,method,'__qolChallengeRange_'+method,original=>function(event,...args){
            const profile=this.curTeam?.format?.includes('@@@')?editorRuleProfile(this.curTeam.format):null;
            const input=event?.currentTarget,stat=input?.name?.replace(/^(?:stat-|evslider-)/,'');
            const range=profile?.ranges[stat];
            if(range&&method==='statSlide'){const n=parseInt(input.value,10);input.value=String(Math.max(range.min,Math.min(range.max,Number.isFinite(n)?n:range.min)))+(/[+-]$/.test(input.value)?input.value.slice(-1):'');}
            constrainChallengeRoom(this);const result=original.call(this,event,...args);
            if(range&&method==='statSlide'&&this.curSet?.evs){this.curSet.evs[stat]=Math.max(range.min,Math.min(range.max,this.curSet.evs[stat]??range.min));this.save?.();this.updateStatGraph?.();}
            paintChallengeEditor(this);return result;
        });
        for(const method of ['renderPokemonRow','renderPokemonSortRow'])patchMethod(window.BattleSearch?.prototype,method,'__qolChallengeAbilityColumn',original=>function(...args){return stripChallengeAbilityColumns(original.apply(this,args));});
        // These two native consumers intentionally reduce custom formats to
        // their base ID. Supply the full code as the team-selection format
        // for that synchronous render, then restore the shared registry.
        const withTeamFormat=(format,fn)=>{
            const base=String(format||'').split('@@@')[0],original=window.BattleFormats?.[base];
            if(!String(format||'').includes('@@@')||!original)return fn();
            window.BattleFormats[base]={...original,teambuilderFormat:format,isTeambuilderFormat:true};
            try{return fn();}finally{window.BattleFormats[base]=original;}
        };
        patchMethod(window.MainMenuRoom?.prototype,'renderTeams','__qolCustomTeamFormat',original=>function(format,...args){return withTeamFormat(format||this.curFormat,()=>original.call(this,format,...args));});
        patchMethod(window.TeamPopup?.prototype,'initialize','__qolCustomTeamFormat',original=>function(data,...args){return withTeamFormat(data?.format,()=>original.call(this,data,...args));});
        patchMethod(window.MainMenuRoom?.prototype,'renderFormats','__qolEscapeCustomFormat',original=>function(format,...args){const html=original.call(this,format,...args);const code=format||this.curFormat;return typeof html==='string'&&String(code).includes('@@@')?html.split('value="'+code+'"').join('value="'+BattleLog.escapeHTML(code)+'"'):html;});
        return true;
    }

    // Canonicalize spelling and spacing, preserving rule order and operators.
    // Different names remain distinct; teams themselves are never deduplicated.
    function challengeFormatIdentity(format){
        const [base,...rest]=String(format||'').split('@@@');
        return toSearchId(base)+(rest.length?'@@@'+rest.join('@@@').split(',').map(rule=>rule.trim().toLowerCase().replace(/\s+/g,' ').replace(/\s*([:=/+])\s*/g,'$1').replace(/^([!+*\-]+)\s+/,'$1')).join(','):'');
    }
    function combineImportedFormatGroups(){
        const groups=new Map(),labels=getCustomFormatLabels();let changed=false;
        for(const team of window.Storage?.teams||[]){
            if(!team?.format?.includes('@@@'))continue;
            const old=team.format,label=getCustomFormatLabel(old),key=JSON.stringify([challengeFormatIdentity(old),label]);
            const canonical=groups.get(key);
            if(!canonical){groups.set(key,old);continue;}
            if(old!==canonical){team.format=canonical;delete labels[old];localStorage.setItem('qol-active-imported-formats-v1',JSON.stringify([...new Set(activeImportedFormatCodes().map(f=>f===old?canonical:f))]));const room=getTeambuilderRoom();if(room?.curFolder===old)room.curFolder=canonical;if(room?.curFolderKeep===old)room.curFolderKeep=canonical;changed=true;}
        }
        if(changed){localStorage.setItem(CUSTOM_FORMAT_LABELS_KEY,JSON.stringify(labels));window.Storage.saveTeams?.();}
        return changed;
    }
    function bulkFormatScope(room){
        if(!room||room.curTeam||!room.curFolder?.includes('@@@')||room.curFolder.endsWith('/'))return null;
        const teams=(window.Storage?.teams||[]).filter(team=>team?.format===room.curFolder);
        return teams.length?{format:room.curFolder,teams}:null;
    }
    function applyBulkChallengeFormat(room,scope,text,name){
        const parsed=parseFormatImport(text,{currentFormat:scope.format});if(parsed.error)return parsed;
        const nameError=customFormatNameError(parsed.format,name,scope.format);if(nameError)return {error:nameError};
        const current=new Set(window.Storage?.teams||[]),targets=scope.teams.filter(team=>current.has(team)&&team.format===scope.format);
        if(!targets.length)return {error:'These teams changed while the editor was open. Reopen the format folder and try again.'};
        // Parse everything before modifying storage. Preserve each team's name,
        // folder and roster. Only the selected format group's teams are updated.
        const changes=[];
        for(const team of targets){
            const sets=window.Storage.unpackTeam(team.team||'')||[];
            const profile=editorRuleProfile(parsed.format);
            const previous=editorRuleProfile(team.format);
            let changed=false;for(const set of sets)changed=constrainChallengeSet(set,profile)||changed;
            changes.push({team,packed:changed?window.Storage.packTeam(sets):team.team});
        }
        if(parsed.rules.length)saveCustomFormatLabel(parsed.format,squash(name),scope.format);
        for(const {team,packed}of changes){team.format=parsed.format;team.gen=formatGeneration(parsed.format,team.gen);team.team=packed;}
        const labels=getCustomFormatLabels();
        if(scope.format!==parsed.format&&!(window.Storage.teams||[]).some(team=>team.format===scope.format)){delete labels[scope.format];localStorage.setItem(CUSTOM_FORMAT_LABELS_KEY,JSON.stringify(labels));localStorage.setItem('qol-active-imported-formats-v1',JSON.stringify(activeImportedFormatCodes().filter(f=>f!==scope.format)));}
        combineImportedFormatGroups();room.curFolder=targets[0].format;room.curFolderKeep=room.curFolder;
        window.Storage.saveTeams?.();room.update?.();
        return {ok:true,format:targets[0].format,count:targets.length};
    }
    function installBulkFormatButton(room){
        if(combineImportedFormatGroups()){room?.update?.();return;}
        const scope=bulkFormatScope(room),heading=room?.el?.querySelector('.teampane h2');
        if(!scope||!heading)return;
        if(heading.parentElement.querySelector('.qol-format-bulk'))return;
        const button=document.createElement('button');button.type='button';button.className='button qol-format-bulk';button.textContent='Edit format for all '+scope.teams.length+' teams';
        button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();const fresh=bulkFormatScope(room);if(fresh)app.addPopup(getImportPopupClass(),{scope:fresh});});heading.after(button);
    }

    // ---------- patch everything ----------

    function patchEverything() {
        const results = [
            // server messages + banlists
            patchServerReceive(),
            patchTsaSearchLegality(),
            patchUsageRoomTraffic(),
            patchSmogonPageCommand(),
            patchBattleCommands(),
            patchModHelpCommands(),
            patchFakeChallenges(),
            patchDataPreview(),
            patchLocalBattleRouting(),

            // search: results (legality, banlists, natdex, filters)
            patchPokemonSearchResults(),
            patchPokemonFilter(),
            patchMoveSearchFilters(),
            patchMoveRowPreview(),
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
            patchNoHoldsBarredSortRow(),

            // teambuilder: stats, icons, chooser
            patchMonocolorAddPokemon(),
            patchNativeFormatRefresh(),
            patchGetStat(),
            patchBattleStatOptimizerConstructor(),
            patchStatForm(),
            patchNoHoldsBarredMoveIVs(),
            patchCustomTeamGenerationRendering(),
            patchChallengeRuleEditor(),
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
    const patchLoopStartedAt = Date.now();
    function patchRetryDelay(ok) {
        if (document.hidden) return 5000;
        if (ok) return 1000;
        const elapsed = Date.now() - patchLoopStartedAt;
        return elapsed < 5000 ? 100 : elapsed < 30000 ? 500 : 1500;
    }

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

        setTimeout(patchLoop, patchRetryDelay(ok));
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
                banned: !!categoryBanned(bans,'moves',move.id),
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
        if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installCalcLoadGuards,{once:true});else installCalcLoadGuards();
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

    }
})(typeof unsafeWindow !== 'undefined' ? unsafeWindow : window,
   typeof GM_getResourceText === 'function' ? GM_getResourceText : null);
