# Rippers Unmasked — 1892 Equipment

Native **Project FU** Item packs for the campaign's QA'd, 1892-rethemed basic gear. A pure
content module for Foundry VTT **v13** — no automation code, no system fork.

## What ships

| Pack | Foundry type | Count | Source |
|------|--------------|-------|--------|
| **Rippers — 1892 Weapons** | `weapon` | 21 | CRB pp.130–131 |
| **Rippers — 1892 Armor & Shields** | `armor` (9) + `shield` (2) | 11 | CRB pp.132–133 |
| **Rippers — 1892 Services** | `treasure` | 8 | CRB pp.124–125 (+1 campaign addition) |

All names, stats and prices come verbatim from
[`lodge-docs/EQUIPMENT-basic-priced-1892.json`](../../lodge-docs/EQUIPMENT-basic-priced-1892.json)
(QA-passed). The build only maps that data onto Project FU item fields — nothing is re-priced,
and no item or stat is invented.

## Price mapping (£/s/d ↔ Zenit)

Project FU's `cost.value` is a single Zenit integer. Per `CURRENCY-zenit-and-sterling.md` §3,
**1 zenit = 1 penny** (12d = 1s, 240z = £1), so the source's `cost_z` *is* the faithful pence
value. Each item therefore carries:

- `system.cost.value` = the Zenit integer (e.g. the Bulldog = `250`), and
- the human-readable **£/s/d** string in the item **summary and description** (e.g. `£1 0s 10d`),
  where a player reads it.

Free items (Bare Knuckles, Anything at Hand, Ordinary Clothes) map to `cost.value: 0` with the
word "free" preserved in the price line.

## Not included — a flagged gap

**Mounts & Vehicles** are priced in the source, but they are the printed generic tiers
(Terrestrial / Aquatic / Submarine / Flying) with **no 1892 register name** — the source itself
flags this. Rather than invent names, they are left out. If Austin wants them, they can be named
and added as a fourth pack later.

## Requirements

- Foundry VTT **v13**
- **Project FU** system (`projectfu`)

## Install

Manifest: `https://github.com/RoscoeRackham/rippers-equipment/releases/latest/download/module.json`

## Build (maintainers)

```sh
npm install
npm run build   # regenerate src/packs/*/*.json from the lodge-docs JSON
npm run pack    # compile src/packs -> packs/ LevelDB (clears each target first)
```

Never hand-edit `src/packs/**` — edit the lodge-docs source, then `npm run build`.
