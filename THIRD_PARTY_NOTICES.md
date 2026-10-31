# Third-party notices

## NAIA2.0 (DNT-LAB) — Korean tag data

- Project: NAIA2.0 — https://github.com/DNT-LAB/NAIA2.0
- Author: DNT-LAB
- License: GNU General Public License v3.0
- Commit used: `b5e79e244b4de537c204bdc8d312cc097c1cca8a`
  (https://github.com/DNT-LAB/NAIA2.0/tree/b5e79e244b4de537c204bdc8d312cc097c1cca8a)

Files used from that commit:

| File | Used for |
| ---- | -------- |
| `data/KR_tags.parquet` | Korean tag descriptions, search keywords, small categories, post counts |
| `data/tag_index/tag_translation_overrides.json` | Manual Korean description / keyword overrides |
| `data/ezmode/category_groups_mapping.json` | Grouping of small categories into 12 groups |

The data was **converted and modified** for 87 Studio:

- Converted from Parquet / JSON into a SQLite file (`naia-ko-v1.db`) built by
  `scripts/build-ko-tags.mjs`, which is hosted in the project's HuggingFace
  dataset and downloaded by the app on demand.
- Tag names were normalised to Danbooru's underscore form (`long hair` -> `long_hair`,
  escaped parentheses unescaped); keywords were normalised (trim, lowercase,
  collapsed spaces), bracketed group tokens (`<무늬>`) were turned into separate
  group keywords and the `<primary>:` prefix was dropped.
- Overrides from `tag_translation_overrides.json` were merged over `KR_tags.parquet`.
- Small categories were regrouped into the 12 NAIA groups with stable ascii keys.
  Categories missing in NAIA's mapping file (e.g. "인물", "구성", "작품") were
  assigned to a group by this project (see `SUPPLEMENT_*` in the build script).

87 Studio itself is licensed under GPL-3.0-only (see `LICENSE`), the same license
as NAIA2.0.
