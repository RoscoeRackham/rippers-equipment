// build-equipment.mjs — generate the rippers-equipment pack sources from the QA'd
// 1892 basic-equipment data. FORMATTING/MAPPING ONLY — no re-pricing, no invented items
// or stats; every value comes verbatim from the source JSON.
//
// SOURCE (read at build time, never re-derived):
//   ../../lodge-docs/EQUIPMENT-basic-priced-1892.json  (QA-passed; the machine source)
//     - 21 basic weapons (CRB pp.130-131)  -> src/packs/weapons/  (type:"weapon")
//     - 9 armor + 2 shields (CRB pp.132-133) -> src/packs/armor/  (type:"armor"/"shield")
//     - 8 services (7 printed pp.124-125 + 1 campaign "Common Lodging House") -> src/packs/services/ (type:"treasure")
//   Mounts & Vehicles are PRESENT in the source but are PRINTED generic labels with NO 1892
//   register name (the source flags this) — they are OUT of scope per the dispatch and are
//   NOT emitted. Left as a gap for Austin to name/ship later.
//
// PRICE MAPPING (reported to god): the campaign currency is £/s/d; projectfu's cost.value is a
//   single Zenit integer. Per CURRENCY-zenit-and-sterling.md §3, 1 zenit = 1 penny, so the
//   source's cost_z is the faithful pence value. We put cost_z in cost.value (the numeric field)
//   AND keep the human-readable £/s/d string (cost_lsd) in the item summary + description, where
//   the player reads it. No currency system is invented.
//
// projectfu item shapes mirror the base PFU basic-equipment packs exactly (armor uses the legacy
//   attributes.primary/secondary shape, which PFU's ArmorMigrations folds into def.attribute /
//   mdef.attribute on load). Enum keys verified against FoundryVTT-Fabula-Ultima-dev config.mjs:
//   weaponCategories {arcane,bow,brawling,dagger,firearm,flail,heavy,spear,sword,thrown},
//   weaponTypes {melee,ranged}, attributes {dex,ins,mig,wlp}, handedness {one-handed,two-handed},
//   damageTypes {physical,...}, treasureType {treasure,material,artifact}.
//
// Run:  node tools/build-equipment.mjs   (from the module dir)
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULE = dirname(HERE);
const SRC = join(MODULE, '..', '..', 'lodge-docs', 'EQUIPMENT-basic-priced-1892.json');
const PACKS = join(MODULE, 'src', 'packs');
const SOURCE = 'Rippers Unmasked — 1892 Register';

// 16-char deterministic id, same convention as the other rippers modules' generators.
function id16(prefix, n) {
	const p = prefix.replace(/[^A-Za-z0-9]/g, '').slice(0, 6);
	return (p + String(n).padStart(16 - p.length, '0')).slice(0, 16);
}
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const kebab = (s) => String(s ?? '').trim().toLowerCase()
	.replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const STATS = { systemId: 'projectfu', coreVersion: '13.0.0' };

const RANGED_CATEGORIES = new Set(['bow', 'firearm', 'thrown']);
const ATTR = new Set(['dex', 'ins', 'mig', 'wlp']);

// "DEX + INS +1" -> { primary:'dex', secondary:'ins', bonus:1 };  "WLP + WLP" -> bonus 0
function parseAccuracy(s) {
	const toks = String(s).split('+').map((t) => t.trim()).filter(Boolean);
	const attrs = [];
	let bonus = 0;
	for (const t of toks) {
		const low = t.toLowerCase();
		if (ATTR.has(low)) attrs.push(low);
		else if (/^-?\d+$/.test(t)) bonus += parseInt(t, 10);
	}
	if (attrs.length !== 2) throw new Error(`bad accuracy formula "${s}"`);
	return { primary: attrs[0], secondary: attrs[1], bonus };
}
// "HR + 6 physical" -> { value:6, type:'physical' }
function parseDamage(s) {
	const m = String(s).match(/HR\s*\+\s*(-?\d+)\s+([a-z]+)/i);
	if (!m) throw new Error(`bad damage formula "${s}"`);
	return { value: parseInt(m[1], 10), type: m[2].toLowerCase() };
}
// armor/shield defense token: "10"/"11"/"12" -> {attr:'', value:N};  "DEX size"/"DEX size +1" ->
// {attr:'dex', value:0/1};  "+2" (shield) -> {attr:'', value:2};  "—" -> {attr:'', value:0}
function parseDefense(s, defaultAttr) {
	const t = String(s).trim();
	if (t === '—' || t === '-' || t === '') return { attr: '', value: 0 };
	if (/^-?\d+$/.test(t)) return { attr: '', value: parseInt(t, 10) }; // flat (martial)
	if (/^\+\d+$/.test(t)) return { attr: '', value: parseInt(t, 10) }; // shield bonus
	const m = t.match(/^([A-Za-z]{3})\s+size(?:\s*\+\s*(\d+))?$/);
	if (m) return { attr: m[1].toLowerCase(), value: m[2] ? parseInt(m[2], 10) : 0 };
	throw new Error(`bad defense token "${s}"`);
}
const priceLine = (lsd, z) => (z == null ? `<strong>Price:</strong> ${esc(lsd)}` : `<strong>Price:</strong> ${esc(lsd)} (${z}z)`);

const src = JSON.parse(readFileSync(SRC, 'utf8'));

function fresh(dir) {
	const p = join(PACKS, dir);
	if (existsSync(p)) rmSync(p, { recursive: true, force: true });
	mkdirSync(p, { recursive: true });
	return p;
}
function write(dir, prefix, i, item) {
	writeFileSync(join(PACKS, dir, `${prefix}_${item._id}.json`), JSON.stringify(item, null, '\t') + '\n');
}

// ---------- WEAPONS ----------
const wdir = fresh('weapons');
const seen = new Set();
src.weapons.items.forEach((w, i) => {
	const cat = w.category.toLowerCase();
	if (!RANGED_CATEGORIES.has(cat) && !['arcane', 'brawling', 'dagger', 'flail', 'heavy', 'spear', 'sword'].includes(cat))
		throw new Error(`unknown weapon category "${w.category}"`);
	const type = RANGED_CATEGORIES.has(cat) ? 'ranged' : 'melee';
	const acc = parseAccuracy(w.accuracy);
	const dmg = parseDamage(w.damage);
	const hands = /two/i.test(w.grip) ? 'two-handed' : 'one-handed';
	const cost = w.cost_z ?? 0;
	let fuid = kebab(w.name);
	while (seen.has(fuid)) fuid += '-x';
	seen.add(fuid);
	const _id = id16('REwp', i + 1);
	const acc_txt = `${acc.primary.toUpperCase()} + ${acc.secondary.toUpperCase()}${acc.bonus ? ` +${acc.bonus}` : ''}`;
	const desc =
		`<p><em>${esc(w.category)} weapon · ${esc(w.grip)}${w.martial ? ' · Martial' : ''}</em></p>` +
		`<p><strong>Accuracy:</strong> ${esc(acc_txt)}<br><strong>Damage:</strong> 【HR + ${dmg.value}】 ${esc(dmg.type)}</p>` +
		`<p>${priceLine(w.cost_lsd, w.cost_z)}</p>`;
	write('weapons', 'weapon', i, {
		folder: null, name: w.name, type: 'weapon', img: 'icons/svg/sword.svg',
		system: {
			subtype: { value: '' }, summary: { value: w.cost_lsd }, description: desc,
			isFavored: { value: false }, showTitleCard: { value: false },
			cost: { value: cost }, isMartial: { value: !!w.martial }, quality: { value: '' },
			isEquipped: { value: false, slot: '' },
			attributes: { primary: { value: acc.primary }, secondary: { value: acc.secondary } },
			accuracy: { value: acc.bonus }, damage: { value: dmg.value },
			type: { value: type }, category: { value: cat }, hands: { value: hands },
			impType: { value: 'minor' }, damageType: { value: dmg.type },
			isBehavior: { value: false }, weight: { value: 1 }, isCustomWeapon: { value: false },
			source: SOURCE, rollInfo: { useWeapon: { hrZero: { value: false } } },
			defense: 'def', fuid,
		},
		effects: [], ownership: { default: 0 }, flags: {}, _stats: STATS,
		sort: (i + 1) * 1000, _id, _key: `!items!${_id}`,
	});
});

// ---------- ARMOR + SHIELDS (one pack) ----------
fresh('armor');
const seenA = new Set();
let a = 0;
src.armor.items.forEach((r, i) => {
	const name = /unnamed/i.test(r.name) ? 'Ordinary Clothes' : r.name;
	const def = parseDefense(r.defense, 'dex');
	const mdef = parseDefense(r.magic_defense, 'ins');
	const cost = r.cost_z ?? 0;
	let fuid = kebab(name); while (seenA.has(fuid)) fuid += '-x'; seenA.add(fuid);
	const _id = id16('REar', ++a);
	const dtxt = def.attr ? `${def.attr.toUpperCase()} size${def.value ? ` +${def.value}` : ''}` : `${def.value}`;
	const mtxt = mdef.attr ? `${mdef.attr.toUpperCase()} size${mdef.value ? ` +${mdef.value}` : ''}` : `${mdef.value}`;
	const desc =
		`<p><em>Armor${r.martial ? ' · Martial' : ''}</em></p>` +
		`<p><strong>Defense:</strong> ${esc(dtxt)}<br><strong>Magic Defense:</strong> ${esc(mtxt)}<br><strong>Initiative:</strong> ${r.initiative}</p>` +
		`<p>${priceLine(r.cost_lsd, r.cost_z)}</p>`;
	write('armor', 'armor', i, {
		folder: null, name, type: 'armor', img: 'icons/svg/statue.svg',
		system: {
			subtype: { value: '' }, summary: { value: r.cost_lsd }, description: desc,
			isFavored: { value: false }, showTitleCard: { value: false },
			cost: { value: cost }, isMartial: { value: !!r.martial }, quality: { value: '' },
			isEquipped: { value: false, slot: '' },
			def: { value: def.value }, mdef: { value: mdef.value }, init: { value: r.initiative },
			isBehavior: { value: false }, weight: { value: 1 },
			attributes: { primary: { value: def.attr }, secondary: { value: mdef.attr } },
			source: SOURCE, rollInfo: { useWeapon: { hrZero: { value: false } } }, fuid,
		},
		effects: [], ownership: { default: 0 }, flags: {}, _stats: STATS,
		sort: a * 1000, _id, _key: `!items!${_id}`,
	});
});
src.shields.items.forEach((r, i) => {
	const def = parseDefense(r.defense, '');
	const mdef = parseDefense(r.magic_defense, '');
	const cost = r.cost_z ?? 0;
	let fuid = kebab(r.name); while (seenA.has(fuid)) fuid += '-x'; seenA.add(fuid);
	const _id = id16('REsh', i + 1);
	const desc =
		`<p><em>Shield${r.martial ? ' · Martial' : ''}</em></p>` +
		`<p><strong>Defense:</strong> +${def.value}<br><strong>Magic Defense:</strong> ${mdef.value ? `+${mdef.value}` : '—'}<br><strong>Initiative:</strong> ${r.initiative}</p>` +
		`<p>${priceLine(r.cost_lsd, r.cost_z)}</p>`;
	write('armor', 'shield', i, {
		folder: null, name: r.name, type: 'shield', img: 'icons/svg/shield.svg',
		system: {
			subtype: { value: '' }, summary: { value: r.cost_lsd }, description: desc,
			isFavored: { value: false }, showTitleCard: { value: false },
			cost: { value: cost }, isMartial: { value: !!r.martial }, quality: { value: '' },
			isEquipped: { value: false, slot: '' },
			def: { value: def.value }, mdef: { value: mdef.value }, init: { value: r.initiative },
			attributes: { primary: { value: 'mig' }, secondary: { value: 'mig' } },
			accuracy: { value: 0 }, damage: { value: 5 },
			type: { value: 'melee' }, category: { value: 'brawling' }, hands: { value: 'two-handed' },
			impType: { value: 'minor' }, damageType: { value: 'physical' },
			isBehavior: { value: false }, weight: { value: 1 },
			source: SOURCE, rollInfo: { useWeapon: { hrZero: { value: false } } },
			defense: 'def', fuid,
		},
		effects: [], ownership: { default: 0 }, flags: {}, _stats: STATS,
		sort: (a + i + 1) * 1000, _id, _key: `!items!${_id}`,
	});
});

// ---------- SERVICES (treasure type) ----------
fresh('services');
const seenS = new Set();
src.services.items.forEach((s, i) => {
	const cost = s.cost_z ?? 0;
	let fuid = kebab(s.service); while (seenS.has(fuid)) fuid += '-x'; seenS.add(fuid);
	const _id = id16('REsv', i + 1);
	const desc =
		`<p><em>Service</em></p>` +
		`<p>${esc(s.description)}</p>` +
		(s.campaign_addition ? `<p><em>Campaign addition (below the printed floor).</em></p>` : '') +
		`<p>${priceLine(s.cost_lsd, s.cost_z)}</p>`;
	write('services', 'treasure', i, {
		folder: null, name: s.service, type: 'treasure', img: 'icons/svg/coins.svg',
		system: {
			subtype: { value: 'treasure' }, summary: { value: s.cost_lsd }, description: desc,
			showTitleCard: { value: false },
			cost: { value: cost }, quantity: { value: 1 }, origin: { value: '' },
			source: SOURCE, fuid,
		},
		effects: [], ownership: { default: 0 }, flags: {}, _stats: STATS,
		sort: (i + 1) * 1000, _id, _key: `!items!${_id}`,
	});
});

const nW = src.weapons.items.length, nA = src.armor.items.length, nSh = src.shields.items.length, nSv = src.services.items.length;
console.log('=== rippers-equipment source build ===');
console.log(`weapons/  : ${nW} (expect 21)`);
console.log(`armor/    : ${nA + nSh} (${nA} armor + ${nSh} shields; expect 11 = 9 + 2)`);
console.log(`services/ : ${nSv} (7 printed + ${src.services.items.filter((x) => x.campaign_addition).length} campaign; source has ${nSv})`);
console.log(`mounts/vehicles: NOT emitted — priced but no 1892 register name (out of scope, flagged as a gap).`);
if (nW !== 21) console.log(`⚠ expected 21 weapons, got ${nW}`);
if (nA + nSh !== 11) console.log(`⚠ expected 11 armor+shields, got ${nA + nSh}`);
