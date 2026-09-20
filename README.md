# Showdown-Teambuilder-Mod

# Pokémon Showdown Teambuilder Mod

A Tampermonkey userscript that adds improved teambuilder support for custom Pokémon Showdown formats.

## Some features

**For Tier Shift:**
- Automatically applies Tier Shift's base-stat boosts.
- Displays the modified stats in the Teambuilder.
- Supports Tier Shift stat boosts which are:
  - UU / RUBL: +15
  - RU / NUBL: +20
  - NU / PUBL: +25
  - PU / ZU / ZUBL / LC / NFE: +30
- Makes stat sorting/search results account for the modified stats.
- Supports Tier Shift AAA's dynamic banlist that is not client side for some reason.

**For Mix N Mega:**
- Calculates Pokémon stats after Mega Evolution.
- Applies the appropriate Mega Stone stat changes.
- Displays modified base stats in the Teambuilder.
- Calculates final stats using the modified stats.
- Accounts for Mix and Mega's Speed-related mechanics.

**For Godly Gift:**
- Applies the God's base stat to the appropriate team position.
- Supports all donated stats.
- Updates displayed base stats.
- Prevents additional Restricted Pokémon from appearing as legal team members once a God has been selected.
## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Click the installation link below.
3. Click **Install** in Tampermonkey.
4. Open Pokémon Showdown.

**[Install the Userscript](https://raw.githubusercontent.com/Jake18236/showdown-teambuilder-mod/main/showdown-teambuilder.user.js))**
https://raw.githubusercontent.com/Jake18236/showdown-teambuilder-mod/main/showdown-teambuilder.user.js

## Note

This is a client-side script.
