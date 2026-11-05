# Riftbound icons

Original SVG/PNG files downloaded on 2026-11-05 from the [League of Legends Wiki RB icons category](https://wiki.leagueoflegends.com/en-us/Category:RB_icons). All 31 files in that category are retained here, including resource and rune icons available for future use. They are served from the application build; the app does not hotlink the Wiki.

Copyright © Riot Games, Inc. These game assets are not covered by the application's code license. The Wiki file pages identify them as Riot Games assets used under [Riot's Legal Jibber Jabber policy](https://www.riotgames.com/en/legal). This project is not endorsed or sponsored by Riot Games.

`sources.json` records each original file page, download URL, byte size and SHA-256 checksum. The original files are unmodified. `src/icons.ts` maps the six domains, seven card types and five rarities to these assets. Signature Spell uses the Spell icon. Neutral stays text-only because this category does not provide a Neutral domain icon; Wild Power is not a Neutral domain symbol.

The interface keeps text labels alongside decorative icons. Multi-domain cards show one icon for each domain. White card-type symbols use a dark backing for contrast. Type icons are explicitly inlined by Vite so generated fallback card SVGs remain self-contained; the larger rarity images are separate cached build assets.
