import fury from '../assets/riftbound/RB_fury_icon.svg';
import calm from '../assets/riftbound/RB_calm_icon.svg';
import mind from '../assets/riftbound/RB_mind_icon.svg';
import body from '../assets/riftbound/RB_body_icon.svg';
import chaos from '../assets/riftbound/RB_chaos_icon.svg';
import order from '../assets/riftbound/RB_order_icon.svg';
// Inline type icons so generated fallback card SVGs are self-contained too.
import legend from '../assets/riftbound/RB_legend_icon.png?inline';
import champion from '../assets/riftbound/RB_champion_icon.png?inline';
import unit from '../assets/riftbound/RB_unit_icon.png?inline';
import spell from '../assets/riftbound/RB_spell_icon.png?inline';
import gear from '../assets/riftbound/RB_gear_icon.png?inline';
import battlefield from '../assets/riftbound/RB_battlefield_icon.png?inline';
import rune from '../assets/riftbound/RB_rune_icon.png?inline';
import common from '../assets/riftbound/RB_common_icon.png';
import uncommon from '../assets/riftbound/RB_uncommon_icon.png';
import rare from '../assets/riftbound/RB_rare_icon.png';
import epic from '../assets/riftbound/RB_epic_icon.png';
import showcase from '../assets/riftbound/RB_showcase_icon.png';
import riftbound from '../assets/riftbound/RB_riftbound_icon.svg?inline';

export const DOMAIN_ICONS: Readonly<Record<string, string | undefined>> = {
  Fury: fury, Calm: calm, Mind: mind, Body: body, Chaos: chaos, Order: order,
  Neutral: riftbound,
};

export const TYPE_ICONS: Readonly<Record<string, string | undefined>> = {
  Legend: legend, Champion: champion, Unit: unit, Spell: spell,
  'Signature Spell': spell, Gear: gear, Battlefield: battlefield, Rune: rune,
};

export const RARITY_ICONS: Readonly<Record<string, string | undefined>> = {
  Common: common, Uncommon: uncommon, Rare: rare, Epic: epic, Showcase: showcase,
};

export const FALLBACK_ICON = riftbound;
