# Pokémon Showdown Teambuilder Mod

A Tampermonkey/Userscripts userscript that adds quality of life features to [Pokémon Showdown](https://play.pokemonshowdown.com/), mostly for OMs. It makes custom formats easier to build for by showing modified stats, typings, abilities, and movepools directly in the teambuilder instead of making you work them out yourself.

It also adds extra search commands, custom format tools, and support for the [Pokémon Showdown damage calculator](https://calc.pokemonshowdown.com/).

## Installation

### Chrome, Firefox, and Edge

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the **[installation link](https://github.com/Jake18236/Showdown-Teambuilder-Mod/releases/latest/download/showdown-teambuilder.user.js)**.
3. Click **Install** in Tampermonkey.
4. Open [Pokémon Showdown](https://play.pokemonshowdown.com/).

### Safari (macOS and iOS)

1. Install **Userscripts** from the App Store.
2. Enable its Safari extension in Settings and give it permission to run on Pokémon Showdown.
3. Open the **[installation link](https://github.com/Jake18236/Showdown-Teambuilder-Mod/releases/latest/download/showdown-teambuilder.user.js)**.
4. Choose **View** and install the script in Userscripts.
5. If the above steps do not work, ask chatgpt or smth idk.

The script also runs on Smogtours and the Pokémon Showdown damage calculator.

## Features

### Extra teambuilder search commands

Use these in Pokémon search to find things that Showdown's normal filters don't cover:

- `weak [type]`, `resists [type]` — filter by type matchups.
- `pivot`, `recovery`, `priority` — finds pokemon with useful move categories. 
- `fe` — fully evolved Pokémon.
- `natdex` — the script's extended National Dex / historical legality search.
- `legendary`, `mythical`, `paradox`, `eeveelution` — Pokémon groups.
- `!` — negate a supported search, such as `!fire`, `!weak ice`, or `!fe`.

Filters can be combined with the regular move, ability, type, and stat searches.

### Cross Evolution

- Displays the resulting base stats, typing, and abilities when you nickname a Pokémon after an evolution donor.
- Combines the base Pokémon's **and** donor's movepools in move searches.
- `into [Pokémon]` — show base Pokémon that can evolve into the named donor.
- `[Pokémon] into` — show evolution donors for the named base Pokémon.
- `stage1`, `stage2`, `stage3` (or `1`, `2`, `3`) — filter by evolutionary stage.
- `showevo` / `ce` / `crossevo` / `evo` — display evolution stat gains and type changes, similar to Showdown's `/showevo` command.
- **`Full List`** — browse all eligible base Pokémon + donor combinations as individual search results. Each row shows the two Pokémon icons, resulting stats, typing, abilities, and BST. Click a combination to select the base Pokémon with the donor already set as its nickname.
- Sort Full List by the resulting stats, or narrow it using moves, abilities, types, and the other CE filters.
- Distinguishes **Restricted** evolution donors from **Banned** Pokémon.
- Includes Speed-related battle tooltip support.

Full List is very laggy since its rendering 82,000+ pokemon (and their movesets)

### Convergence and Convergence Megamons

- Shows moves and abilities shared by Pokémon with matching types.
- Adds donor icons so you can see which Pokémon supply each move or ability.
- Uses format bans when deciding which Pokémon can contribute to shared movepools.
- Supports the extra Mega Evolutions made legal by Convergence Megamons, including item selection and item icons.

### Mix and Mega

- Applies the selected Mega Stone's stat and type changes to teambuilder displays and stat calculations.
- Displays modified base stats and accounts for pre-Mega Speed when relevant.
- Adds Speed information to battle tooltips.

### Godly Gift

- Applies the designated God's donated base stat according to team position.
- Updates the displayed base stats and calculated stats.
- Accounts for restricted Pokémon when selecting the team's God.

### Bad 'n Boosted

- Applies its base-stat boosts to the Pokémon's displayed and calculated stats.
- Updates stat-based search and sorting, with Speed tooltip support.

### Tier Shift

- Applies tier-based stat boosts to the teambuilder and stat calculations.
- Uses modified stats in searches and sorting.
- Supports server-provided format bans, including mashups.

### Other supported metagames

- **Alphabet Cup:** Expands movepools according to the Pokémon's name and evolutionary line, while respecting generation and format restrictions.
- **Camomons:** Changes typing based on the first two moves.
- **Flipped:** Reverses base stats.
- **350 Cup:** Doubles the stats correctly.
- **Scalemons:** Displays scaled base stats, with Speed tooltip support.
- **Nature Swap:** Swaps correctly
- **Inheritance:** Uses the nickname as an ability/movepool donor.
- **Frantic Fusions, Re-Evolution, Pokébilities, Shared Power, Force of the Fallen, and other supported custom-format combinations:** Some additional stuff.

### Custom formats and legality

- Supports importing and using custom challenge codes with `@@@` rules.
- Recognizes format clauses, modifiers, bans, unbans, and restrictions, including rules received from Showdown's `/formathelp` responses.
- Separates **Banned**, **Restricted**, and **Illegal** Pokémon in supported search results where applicable.
- Accounts for generation-specific move availability and special rules like Sleep Moves Clause.
- Supports combinations of multiple OMs.

Some complicated rule interactions still require Showdown's actual server-side team validator; the script isn't a replacement for server validation.

### Other tools

- **Damage calculator integration:** Applies supported OM effects to calculator stats and typing.
- **Battle tooltips:** Additional modified stat and Speed information in supported formats.
- **Self-challenge:** Tools for testing teams/mechanics against yourself without incognito windows.
- **Usage stats and custom-format utilities:** Extra teambuilder utilities for experimenting with nonstandard formats.

## Screenshots

<img width="402" height="390" alt="Screenshot 2026-09-19 142100" src="https://github.com/user-attachments/assets/35682ef8-8e9a-422c-9779-40b86ce72121" />
<img width="344" height="347" alt="Screenshot 2026-09-23 190824" src="https://github.com/user-attachments/assets/e7f9c764-fa92-458d-9fd0-30e5fb6dfa63" />
<img width="402" height="402" alt="Screenshot 2026-09-24 224640" src="https://github.com/user-attachments/assets/f5139ab4-bcca-4c34-ab92-e649b2f60357" />
<img width="403" height="399" alt="Screenshot 2026-09-27 085118" src="https://github.com/user-attachments/assets/4c3a1210-73c2-4ca2-83ec-f209c0d4b222" />
<img width="400" height="333" alt="Screenshot 2026-09-27 195956" src="https://github.com/user-attachments/assets/c22600eb-5b9c-4848-876e-c453b184b50f" />
<img width="402" height="395" alt="Screenshot 2026-09-27 200204" src="https://github.com/user-attachments/assets/d24a481a-ee94-4d73-9496-e52c2694f089" />
<img width="402" height="373" alt="Screenshot 2026-09-29 001559" src="https://github.com/user-attachments/assets/149b93f7-13cc-4e6a-8f06-9541f7d3f74c" />
<img width="404" height="339" alt="Screenshot 2026-09-29 211715" src="https://github.com/user-attachments/assets/8ee2d838-9577-4381-964e-c03eff493e97" />
<img width="403" height="402" alt="Screenshot 2026-09-30 085614" src="https://github.com/user-attachments/assets/5c9e071e-eafb-40ce-b0f5-0c4d28016387" />
<img width="412" height="402" alt="Screenshot 2026-09-30 085500" src="https://github.com/user-attachments/assets/153dd965-d45f-47d1-8b82-3729382a130d" />
