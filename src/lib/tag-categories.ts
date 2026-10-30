/**
 * Fine tag categories (our own mapping; the taxonomy's top level follows the
 * axes people expect from tag pickers, the rules are derived from Danbooru's
 * `tag_groups` table plus name heuristics).
 *
 * ── Category list ────────────────────────────────────────────────────────────
 * Non-general Danbooru tags keep their Danbooru category:
 *   character, artist, copyright, meta(*)           (* Danbooru "meta" tags)
 * General tags (Danbooru category 0) get one top-level category and a fine one:
 *   subject         people_count, occupation, creature
 *   expression      (expression)
 *   pose_action     posture, gesture, gaze, action
 *   location        indoor, outdoor, background
 *   object          food, animal, plant, weapon, item, symbol
 *   clothing        cloth_outfit, cloth_top, cloth_bottom, cloth_legwear,
 *                   cloth_footwear, cloth_headwear, cloth_under, cloth_swim,
 *                   cloth_accessory
 *   characteristic  hair_style, hair_color, bangs, eyes, ears, body_type,
 *                   skin, body_feature
 *   meta            composition, style, lighting, text
 *   nsfw            nudity, sex_act, sex_gear
 *   uncategorized   (general tags no rule could place)
 * A tag with no finer information gets fineCategory === its top-level key.
 *
 * ── Mapping rules (classifyTag) ──────────────────────────────────────────────
 * Every rule that fires produces a candidate (category, score); the highest
 * score wins (ties: the earlier rule).
 *  1. `tag_group:*` membership (GROUP_RULES): each Danbooru tag group maps to a
 *     category with a score 5..40 (broad/noisy groups such as food_tags,
 *     water, fire score low; narrow groups such as hair_color score high), so a
 *     tag in several groups ends up in the most specific one.
 *  2. Name rules (NAME_RULES, score 50 = beats any group): regexes on the
 *     normalised tag (underscores kept); color words are stripped first for the
 *     `<color> <item>` family (black_skirt, blue_eyes, ...).
 *  3. Nothing fired -> `uncategorized`.
 * Danbooru categories 1/3/4/5 never go through the rules.
 */

export interface TagCategoryDef {
  key: string
  /** Top-level key (itself for top-level categories) */
  parent: string
  en: string
  ko: string
  /** oklch hue for the small label */
  hue: number
}

function top(key: string, en: string, ko: string, hue: number): TagCategoryDef {
  return { key, parent: key, en, ko, hue }
}
function sub(
  key: string,
  parent: string,
  en: string,
  ko: string,
): TagCategoryDef {
  return { key, parent, en, ko, hue: 0 }
}

const TOP_DEFS: Array<TagCategoryDef> = [
  top('character', 'Character', '캐릭터', 145),
  top('artist', 'Artist', '작가', 25),
  top('copyright', 'Copyright', '작품', 310),
  top('subject', 'Subject', '대상', 90),
  top('expression', 'Expression', '표정', 350),
  top('pose_action', 'Pose / action', '포즈·동작', 200),
  top('location', 'Location', '장소', 165),
  top('object', 'Object', '사물', 70),
  top('clothing', 'Clothing', '의상', 280),
  top('characteristic', 'Characteristic', '외형', 230),
  top('meta', 'Meta', '메타', 260),
  top('nsfw', 'NSFW', 'NSFW', 15),
  top('uncategorized', 'Uncategorized', '미분류', 250),
]

const SUB_DEFS: Array<TagCategoryDef> = [
  sub('people_count', 'subject', 'People count', '인원'),
  sub('occupation', 'subject', 'Occupation', '직업'),
  sub('creature', 'subject', 'Creature', '크리처'),
  sub('posture', 'pose_action', 'Posture', '자세'),
  sub('gesture', 'pose_action', 'Gesture', '제스처'),
  sub('gaze', 'pose_action', 'Gaze', '시선'),
  sub('action', 'pose_action', 'Action', '동작'),
  sub('indoor', 'location', 'Indoor', '실내'),
  sub('outdoor', 'location', 'Outdoor', '야외'),
  sub('background', 'location', 'Background', '배경'),
  sub('food', 'object', 'Food', '음식'),
  sub('animal', 'object', 'Animal', '동물'),
  sub('plant', 'object', 'Plant', '식물'),
  sub('weapon', 'object', 'Weapon', '무기'),
  sub('item', 'object', 'Item', '소품'),
  sub('symbol', 'object', 'Symbol', '기호'),
  sub('cloth_outfit', 'clothing', 'Outfit', '의상 세트'),
  sub('cloth_top', 'clothing', 'Top', '상의'),
  sub('cloth_bottom', 'clothing', 'Bottom', '하의'),
  sub('cloth_legwear', 'clothing', 'Legwear', '레그웨어'),
  sub('cloth_footwear', 'clothing', 'Footwear', '신발'),
  sub('cloth_headwear', 'clothing', 'Headwear', '모자·머리장식'),
  sub('cloth_under', 'clothing', 'Underwear', '속옷'),
  sub('cloth_swim', 'clothing', 'Swimwear', '수영복'),
  sub('cloth_accessory', 'clothing', 'Accessory', '액세서리'),
  sub('hair_style', 'characteristic', 'Hair style', '헤어스타일'),
  sub('hair_color', 'characteristic', 'Hair color', '머리색'),
  sub('bangs', 'characteristic', 'Bangs', '앞머리'),
  sub('eyes', 'characteristic', 'Eyes', '눈'),
  sub('ears', 'characteristic', 'Ears', '귀'),
  sub('body_type', 'characteristic', 'Body type', '체형'),
  sub('skin', 'characteristic', 'Skin', '피부'),
  sub('body_feature', 'characteristic', 'Body feature', '신체 특징'),
  sub('composition', 'meta', 'Composition', '구도'),
  sub('style', 'meta', 'Style', '화풍'),
  sub('lighting', 'meta', 'Lighting', '조명'),
  sub('text', 'meta', 'Text', '텍스트'),
  sub('nudity', 'nsfw', 'Nudity', '노출'),
  sub('sex_act', 'nsfw', 'Sex act', '성행위'),
  sub('sex_gear', 'nsfw', 'Sex gear', '성인 소품'),
]

export const TAG_CATEGORIES: Array<TagCategoryDef> = [...TOP_DEFS, ...SUB_DEFS]

const BY_KEY = new Map(TAG_CATEGORIES.map((c) => [c.key, c]))

export function getCategoryDef(key: string): TagCategoryDef | undefined {
  return BY_KEY.get(key)
}

export function topCategoryOf(key: string): string {
  return BY_KEY.get(key)?.parent ?? 'uncategorized'
}

export function categoryLabel(key: string, locale: string): string {
  const def = BY_KEY.get(key)
  if (!def) return key
  return locale === 'ko' ? def.ko : def.en
}

/** Top-level categories that carry general tags (tab chips in Tag Search). */
export const GENERAL_TOP_CATEGORIES = [
  'subject',
  'expression',
  'pose_action',
  'location',
  'object',
  'clothing',
  'characteristic',
  'meta',
  'nsfw',
  'uncategorized',
] as const

/** Danbooru category id -> our category key for non-general tags. */
export const DANBOORU_CATEGORY_KEY: Record<number, string> = {
  1: 'artist',
  3: 'copyright',
  4: 'character',
  5: 'meta',
}

/** Small label color (CSS) for a category key's top level. */
export function categoryColor(key: string): string {
  const hue = BY_KEY.get(topCategoryOf(key))?.hue ?? 250
  return `oklch(0.75 0.1 ${hue})`
}

// ── rules ────────────────────────────────────────────────────────────────────

interface GroupRule {
  category: string
  score: number
}

/** tag_group (without the `tag_group:` prefix) -> category. */
export const GROUP_RULES: Record<string, GroupRule> = {
  // characteristic
  hair_styles: { category: 'hair_style', score: 40 },
  hair_color: { category: 'hair_color', score: 40 },
  hair: { category: 'hair_style', score: 20 },
  eyes_tags: { category: 'eyes', score: 30 },
  ears_tags: { category: 'ears', score: 35 },
  skin_color: { category: 'skin', score: 40 },
  skin_folds: { category: 'skin', score: 40 },
  breasts_tags: { category: 'body_type', score: 30 },
  body_parts: { category: 'body_feature', score: 25 },
  tail: { category: 'body_feature', score: 25 },
  wings: { category: 'body_feature', score: 40 },
  face_tags: { category: 'expression', score: 30 },
  // pose / action
  posture: { category: 'posture', score: 35 },
  gestures: { category: 'gesture', score: 40 },
  hands: { category: 'gesture', score: 30 },
  verbs_and_gerunds: { category: 'action', score: 15 },
  dances: { category: 'action', score: 35 },
  covering: { category: 'action', score: 35 },
  // location
  locations: { category: 'outdoor', score: 30 },
  real_world_locations: { category: 'outdoor', score: 20 },
  backgrounds: { category: 'background', score: 40 },
  holidays_and_celebrations: { category: 'item', score: 10 },
  // meta
  image_composition: { category: 'composition', score: 30 },
  focus_tags: { category: 'composition', score: 35 },
  lighting: { category: 'lighting', score: 30 },
  colors: { category: 'style', score: 25 },
  artistic_license: { category: 'style', score: 12 },
  scan: { category: 'style', score: 20 },
  drawing_software: { category: 'style', score: 20 },
  text: { category: 'text', score: 35 },
  year_tags: { category: 'text', score: 35 },
  phrases: { category: 'text', score: 30 },
  metatags: { category: 'text', score: 30 },
  // clothing
  attire: { category: 'clothing', score: 20 },
  dress: { category: 'cloth_outfit', score: 40 },
  fashion_style: { category: 'cloth_outfit', score: 30 },
  headwear: { category: 'cloth_headwear', score: 40 },
  neck_and_neckwear: { category: 'cloth_accessory', score: 30 },
  handwear: { category: 'cloth_accessory', score: 40 },
  eyewear: { category: 'cloth_accessory', score: 40 },
  mask: { category: 'cloth_accessory', score: 35 },
  piercings: { category: 'cloth_accessory', score: 35 },
  sleeves: { category: 'cloth_top', score: 30 },
  shoulders: { category: 'cloth_top', score: 12 },
  legwear: { category: 'cloth_legwear', score: 40 },
  panties: { category: 'cloth_under', score: 40 },
  bra: { category: 'cloth_under', score: 40 },
  sexual_attire: { category: 'cloth_under', score: 25 },
  prints: { category: 'cloth_outfit', score: 15 },
  patterns: { category: 'cloth_outfit', score: 15 },
  embellishment: { category: 'cloth_accessory', score: 15 },
  // subject
  groups: { category: 'people_count', score: 40 },
  family_relationships: { category: 'people_count', score: 35 },
  jobs: { category: 'occupation', score: 30 },
  legendary_creatures: { category: 'creature', score: 30 },
  // object
  food_tags: { category: 'food', score: 8 },
  flowers: { category: 'plant', score: 12 },
  birds: { category: 'animal', score: 25 },
  cats: { category: 'animal', score: 12 },
  dogs: { category: 'animal', score: 12 },
  fire: { category: 'item', score: 6 },
  water: { category: 'item', score: 6 },
  audio_tags: { category: 'item', score: 15 },
  technology: { category: 'item', score: 12 },
  video_game: { category: 'item', score: 12 },
  board_games: { category: 'item', score: 15 },
  cards: { category: 'item', score: 15 },
  sports: { category: 'item', score: 10 },
  symbols: { category: 'symbol', score: 30 },
  // nsfw
  nudity: { category: 'nudity', score: 22 },
  censorship: { category: 'nudity', score: 30 },
  pussy: { category: 'nudity', score: 12 },
  ass: { category: 'nudity', score: 12 },
  sex_acts: { category: 'sex_act', score: 25 },
  sexual_positions: { category: 'sex_act', score: 35 },
  simulated_sex_acts: { category: 'sex_act', score: 35 },
  sex_objects: { category: 'sex_gear', score: 35 },
}

const COLOR_WORDS =
  'black|white|red|blue|green|yellow|pink|purple|orange|brown|grey|gray|silver|gold|golden|blonde|aqua|cyan|beige|tan|multicolored|two-tone|gradient|streaked|colored|rainbow|light_blue|dark_blue|light_brown|light_green|light_purple|dark_green|dark|light|pale|transparent|teal|magenta|lavender|navy|maroon|violet|crimson'

const COLOR_PREFIX = `(?:(?:${COLOR_WORDS})_)+`

interface NameRule {
  re: RegExp
  category: string
}

function nr(re: RegExp, category: string): NameRule {
  return { re, category }
}

/**
 * Name rules, tested in order against the tag name (lowercase, underscores).
 * Specific rules first (the first match at score 50 wins).
 */
export const NAME_RULES: Array<NameRule> = [
  // people count
  nr(
    /^(?:\d+\+?(?:girls?|boys?|others?)|solo|multiple_(?:girls|boys|others)|no_humans|\d+other)$/,
    'people_count',
  ),
  nr(
    /^(?:1girl|1boy|1other|2girls|2boys|3girls|3boys|4girls|4boys|5girls|6\+girls|6\+boys)$/,
    'people_count',
  ),
  // hair
  nr(new RegExp(`^${COLOR_PREFIX}hair$`), 'hair_color'),
  nr(
    /^(?:multicolored|two-tone|gradient|streaked|colored_inner|split-color)_hair$/,
    'hair_color',
  ),
  nr(/^hair_(?:between|over)_|^hair_intakes$/, 'bangs'),
  nr(/(?:^|_)(?:bangs|sidelocks|forehead|fringe)$/, 'bangs'),
  nr(/(?:^|_)bangs(?:_|$)/, 'bangs'),
  nr(
    /_hair$|^(?:ponytail|twintails|braid|braids|bun|ahoge|hime_cut|bob_cut|drill_hair|bald|updo|pigtails|side_ponytail|double_bun|hair_bun|twin_braids|single_braid|french_braid|crown_braid|bowl_cut)$/,
    'hair_style',
  ),
  nr(/(?:ponytail|twintails|braid|hair_bun|pigtails|ahoge)s?$/, 'hair_style'),
  // eyes / ears / skin
  nr(new RegExp(`^${COLOR_PREFIX}eyes$`), 'eyes'),
  nr(
    /_eyes$|^(?:eyelashes|heterochromia|slit_pupils|pupils|eyeshadow|eyeliner|sanpaku|eyebrows)$|_pupils$|_eyebrows$|_eyelashes$/,
    'eyes',
  ),
  nr(/_ears$|^(?:ears|pointy_ears|animal_ears|elf_ears|extra_ears)$/, 'ears'),
  nr(/_skin$|^(?:tan|tanlines|pale_skin|tanline)$/, 'skin'),
  nr(
    /_(?:breasts|ass|thighs|physique|muscles?|abs|pectorals)$|^(?:flat_chest|muscular|muscular_female|muscular_male|plump|slim|thick_thighs|petite|curvy|toned|chubby|skinny|abs|breasts)$/,
    'body_type',
  ),
  nr(
    /^(?:collarbone|navel|armpits?|stomach|midriff|thighs|cleavage_cutout|shoulders|back|neck|feet|legs|arms|hands|fingers|toes|belly|waist|hips|nape|bare_back|armpit_crease)$/,
    'body_feature',
  ),
  nr(
    /_(?:tail|wings|horns?|halo|antennae?|claws|fangs?|scales|fur|feathers|whiskers|ahoge)s?$|^(?:tail|wings|horns|halo|fangs|claws|mole|scar|tattoo|freckles|mole_under_eye|facial_mark|mole_under_mouth|scar_on_face|body_markings|birthmark|dimples|beauty_mark|forehead_mark)$/,
    'body_feature',
  ),
  // swimwear and underwear before generic clothing
  nr(
    /(?:^|_)(?:bikini|swimsuit|swim_trunks|swim_briefs|swim_ring|swimwear|rash_guard|monokini|microkini|sling_bikini)(?:_|$)/,
    'cloth_swim',
  ),
  nr(
    /(?:^|_)(?:panties|panty|bra|underwear|lingerie|thong|boxers|briefs|fundoshi|g-string|loincloth|garter_belt|garter_straps|babydoll|negligee|sarashi|bandeau|pasties)(?:_|$)/,
    'cloth_under',
  ),
  // legwear
  nr(
    /(?:^|_)(?:thighhighs|pantyhose|socks|kneehighs|legwear|leggings|stockings|tights|fishnets|leg_warmers|legband|garter)(?:_|$)/,
    'cloth_legwear',
  ),
  // footwear
  nr(
    /(?:^|_)(?:footwear|shoes|boots|sandals|heels|sneakers|loafers|slippers|geta|zouri|high_heels|mary_janes|pumps|uwabaki|clogs)(?:_|$)|^barefoot$|^no_shoes$/,
    'cloth_footwear',
  ),
  // headwear / hair accessories
  nr(
    /(?:^|_)(?:hat|cap|beret|hood|helmet|headband|hairband|crown|headdress|tiara|headpiece|bonnet|kerchief|headwear|hair_ribbon|hair_bow|hairclip|hair_ornament|hair_flower|hair_tie|scrunchie|hair_stick|kanzashi|headgear|veil|visor|turban|bandana|circlet|hair_bobbles|hairpin|hair_tubes)s?(?:_|$)/,
    'cloth_headwear',
  ),
  // top
  nr(
    new RegExp(
      `(?:^|_)(?:shirt|jacket|coat|sweater|hoodie|vest|blouse|top|cardigan|tank_top|camisole|t-shirt|tunic|crop_top|sleeves|poncho|turtleneck|capelet|bolero|tabard|haori|tube_top|halterneck|midriff_peek|collared_shirt|polo_shirt|raincoat|trench_coat|overcoat|windbreaker|parka|blazer)s?(?:_|$)`,
    ),
    'cloth_top',
  ),
  // bottom
  nr(
    /(?:^|_)(?:skirt|pants|shorts|jeans|miniskirt|bloomers|trousers|hakama|culottes|buruma|sarong|kilt|skort|bike_shorts|pelvic_curtain|loincloth|overalls|chaps)s?(?:_|$)/,
    'cloth_bottom',
  ),
  // outfit
  nr(
    /(?:^|_)(?:dress|kimono|uniform|serafuku|armor|armour|costume|leotard|bodysuit|robe|yukata|cheongsam|china_dress|hanfu|jumpsuit|apron|overall|outfit|clothes|clothing|pajamas|nightgown|gown|wedding_dress|lolita_fashion|sailor_collar|school_uniform|maid|miko|habit|suit|tuxedo|gym_uniform|cosplay|onesie|kigurumi|hoodie_dress|santa_costume|backless_outfit|revealing_clothes)s?(?:_|$)/,
    'cloth_outfit',
  ),
  // accessories
  nr(
    /(?:^|_)(?:gloves|glove|necktie|bowtie|scarf|choker|necklace|earrings|earring|ring|glasses|eyewear|belt|ribbon|bow|collar|bracelet|watch|jewelry|goggles|mask|ornament|pin|brooch|cape|cloak|armband|bandage|bandaid|eyepatch|sash|pendant|anklet|wristband|cuffs|corset|bag|backpack|handbag|purse|pouch|choker|lanyard|hairpin|piercing|tassel|charm|badge|emblem|amulet|bell|obi|shawl|stole|suspenders|gauntlets|bracer|bangle|crest|hoop_earrings)s?(?:_|$)/,
    'cloth_accessory',
  ),
  // gaze / gestures / posture
  nr(
    /^looking_|^eye_contact$|^staring$|^glaring$|^gazing|^closed_eyes$|^one_eye_closed$|^half-closed_eyes$|^wink$/,
    'gaze',
  ),
  nr(
    /^(?:v|w|peace_sign|pointing|waving|salute|thumbs_up|heart_hands|clenched_hand|clenched_hands|double_v|fist|finger_gun|ok_sign|shushing|beckoning|open_hand|outstretched_hand|outstretched_arms|paw_pose|claw_pose)$|^(?:hand|hands|finger|fingers|arm|arms)_(?:up|on|to|in|behind|together|between|over|at|under)(?:_|$)|_(?:pose|gesture)$|^(?:index_finger_raised|reaching|reaching_out|hand_up|hands_up|arm_up|arms_up)$/,
    'gesture',
  ),
  nr(
    /^(?:sitting|standing|lying|kneeling|squatting|crouching|leaning_(?:forward|back|on|against)|on_back|on_side|on_stomach|on_(?:ground|floor|bed|couch|chair)|spread_legs|crossed_arms|crossed_legs|bent_over|all_fours|seiza|wariza|yokozuwari|indian_style|arched_back|head_tilt|leaning|stretching|hug|hugging|lying_on_back|lying_on_side|on_one_knee|straddling|tiptoes|legs_up|knees_up|knees_together_feet_apart|sitting_on_lap|crossed_ankles|pigeon-toed|jumping|walking|running)$/,
    'posture',
  ),
  nr(
    /^(?:holding(?:_[a-z0-9'-]+)*|eating|drinking|sleeping|crying|laughing|dancing|singing|playing_[a-z_]+|reading|cooking|fighting|swimming|bathing|washing|brushing_[a-z_]+|stretching|waking_up|yawning|kissing|hug|hugging|carrying|pulling|pushing|grabbing|licking|biting|undressing|dressing|adjusting_[a-z_]+|tying_[a-z_]+|taking_[a-z_]+|waving|cheering|riding|flying|falling|floating|jumping|walking|running)$/,
    'action',
  ),
  // expression
  nr(
    /^(?:smile|smiling|blush|blushing|angry|crying|tears|frown|laughing|embarrassed|surprised|sad|happy|expressionless|serious|annoyed|nervous|scared|jitome|closed_mouth|open_mouth|parted_lips|tongue_out|fang|fangs|grin|smirk|smug|pout|pouting|sweat|sweatdrop|disgust|blush_stickers|light_smile|evil_smile|:d|:o|:3|:p|;d|;\)|:\)|\^_\^|>_<|:<|:q|;p|>:\)|:\||:\/|:t|;o|o_o|\+_\+|@_@|=_=|ahegao|crazy_smile|naughty_face|seductive_smile|shy|worried|confused|determined|tearing_up|wide-eyed|heart-shaped_pupils|trembling|nose_blush|full-face_blush|light_blush|shaded_face|v-shaped_eyebrows|raised_eyebrows|furrowed_brow|open_mouth|crying_with_eyes_open|wavy_mouth|biting_lip|lip_biting|clenched_teeth|teeth|upper_teeth_only|fang_out|skin_fang|tongue|sleepy|tired|yawning|drooling|saliva|smug|half-closed_eyes|empty_eyes|glowing_eyes|dark_circles|ringed_eyes)$/,
    'expression',
  ),
  // location / background
  nr(
    /_background$|^(?:background|backgrounds|simple_background)$/,
    'background',
  ),
  nr(
    /^(?:indoors|bedroom|bathroom|kitchen|classroom|room|living_room|office|library|hallway|stairs|bed|church|restaurant|cafe|shop|train_interior|locker_room|hospital|laboratory|gym|stage|hotel|dining_room|bath|bathtub|onsen|shower|arena|castle|throne_room|school|school_infirmary|storage_room|attic|closet|garage|balcony)$/,
    'indoor',
  ),
  nr(
    /^(?:outdoors|sky|day|night|sunset|sunrise|beach|ocean|sea|forest|city|cityscape|street|park|garden|field|mountain|river|lake|pool|rain|snow|cloud|clouds|cloudy_sky|blue_sky|night_sky|starry_sky|star_\(sky\)|moon|full_moon|sun|horizon|road|bridge|rooftop|shore|waterfall|cave|desert|ruins|village|town|shrine|temple|torii|path|railing|alley|grass|tree|trees|flower_field|meadow|cliff|hill|island|jungle|swamp|dusk|twilight|evening|morning|sunlight|underwater|space|rainbow|petals|falling_petals|cherry_blossoms|autumn_leaves|autumn|summer|winter|spring)$/,
    'outdoor',
  ),
  // composition
  nr(
    /^(?:full_body|upper_body|lower_body|cowboy_shot|close-up|portrait|face|from_(?:above|below|behind|side)|pov|dutch_angle|wide_shot|very_wide_shot|profile|facing_viewer|facing_away|facing_to_the_side|from_outside|foreshortening|fisheye|split_screen|multiple_views|letterboxed|border|white_border|black_border|rounded_corners|fake_screenshot|bust|head_out_of_frame|out_of_frame|cropped_legs|cropped_torso|cropped_arms|feet_out_of_frame|upper_body|straight-on|sideways|looking_at_viewer|reflection|depth_of_field|motion_lines|speed_lines|zoom_layer|chromatic_aberration|film_grain|blurry|blurry_foreground|blurry_background|bokeh|tilt-shift|anaglyph|stereogram|vignetting|sparkle|sparkle_background|light_particles|backlighting|lens_flare|bloom|glowing|shadow|sunbeam|light_rays|dappled_sunlight|sunlight)$|_focus$|_view$|_shot$/,
    'composition',
  ),
  nr(
    /^(?:backlighting|lens_flare|bloom|sunbeam|light_rays|dappled_sunlight|sunlight|spotlight|rim_light|volumetric_lighting|shadow|dark|light_particles|glowing|sparkle|moonlight|candlelight|neon_lights|lamp|soft_light)$/,
    'lighting',
  ),
  nr(
    /^(?:monochrome|greyscale|sketch|lineart|traditional_media|watercolor_\(medium\)|oil_painting_\(medium\)|pixel_art|chibi|realistic|photorealistic|3d|flat_color|cel_shading|anime_coloring|retro_artstyle|1980s_\(style\)|1990s_\(style\)|2000s_\(style\)|ukiyo-e|impressionism|painting_\(medium\)|colorful|limited_palette|spot_color|partially_colored|sepia|comic|manga|4koma|screentones|halftone|crosshatching|official_style|western_comics_\(style\)|toon_\(style\)|parody|style_parody|cinematic|oekaki|gradient|vector_trace|cropped|upscaled|highres|absurdres|lowres)$|_theme$|_\((?:medium|style)\)$/,
    'style',
  ),
  nr(
    /^(?:text|english_text|chinese_text|korean_text|artist_name|signature|watermark|twitter_username|dated|web_address|patreon_username|character_name|copyright_name|speech_bubble|thought_bubble|translation_request|translated|commentary|commentary_request|subtitled|title|logo|username|pixiv_username|instagram_username|twitter_logo|text_focus|content_rating|\d{4})$|_text$|_username$|_name$/,
    'text',
  ),
  // objects
  nr(
    /(?:^|_)(?:sword|gun|knife|spear|staff|axe|katana|rifle|weapon|shield|polearm|dagger|bow_\(weapon\)|handgun|pistol|cannon|whip|hammer|mace|scythe|trident|wand|sheath|scabbard|bullet|grenade|arrow|bomb|missile|club|chainsaw|boomerang|flail|shotgun|revolver|machine_gun|submachine_gun|crossbow|naginata|nodachi|claymore|rapier|saber|sabre|greatsword|energy_sword|lightsaber)s?(?:_|$)/,
    'weapon',
  ),
  nr(
    /(?:^|_)(?:food|cake|bread|fruit|candy|cookie|pizza|sushi|ramen|noodles|rice|tea|coffee|drink|cup|bottle|apple|strawberry|banana|chocolate|ice_cream|pocky|onigiri|sandwich|donut|doughnut|burger|hamburger|egg|milk|juice|beer|wine|sake|cocktail|alcohol|soda|lemon|orange_\(fruit\)|peach|cherry|grapes|watermelon|pumpkin|meat|fish_\(food\)|sweets|dessert|pudding|parfait|crepe|macaron|cupcake|pie|toast|soup|curry|taiyaki|dango|mochi|wagashi|bento|plate|bowl|spoon|fork|chopsticks|teacup|teapot|mug|glass|tray)s?(?:_|$)/,
    'food',
  ),
  nr(
    /(?:^|_)(?:cat|dog|bird|fox|wolf|rabbit|bunny|horse|dragon|fish|butterfly|bug|insect|bear|mouse|pig|cow|sheep|deer|snake|frog|turtle|penguin|owl|crow|squirrel|hamster|tiger|lion|animal|pokemon_\(creature\)|stuffed_toy|stuffed_animal|bee|spider|crab|octopus|dolphin|whale|shark|jellyfish|seagull|duck|chicken|monkey|panda|raccoon|slime_\(creature\)|creature)s?(?:_|$)/,
    'animal',
  ),
  nr(
    /(?:^|_)(?:flower|rose|lily|petals|plant|leaf|leaves|tree|branch|bush|grass|bouquet|sunflower|tulip|lotus|clover|moss|vines|vine|bamboo|mushroom|cherry_blossoms|hydrangea|spider_lily|camellia|wisteria|daisy|chrysanthemum|dandelion|cactus|seaweed|palm_tree|potted_plant)s?(?:_|$)/,
    'plant',
  ),
  nr(
    /^(?:heart|star_\(symbol\)|sweatdrop|flying_sweatdrops|cross|\?|!|\.\.\.|crescent|\^\^\^|musical_note|anger_vein|spoken_heart|spoken_ellipsis|spoken_exclamation_mark|spoken_question_mark|exclamation_mark|question_mark|ellipsis|sparkle|hearts|notice_lines|emphasis_lines|bubble|squiggle|pentagram|hexagram|symbol-shaped_pupils|heart_in_eye|ahoge|\+\+|:|-|\*|\^|~)$|_\(symbol\)$|^symbol|_symbol$|^heart-shaped|^spoken_/,
    'symbol',
  ),
  nr(
    /(?:^|_)(?:book|phone|cellphone|smartphone|computer|laptop|pillow|chair|table|desk|couch|bed|window|door|curtains|lamp|candle|clock|umbrella|bag|box|gift|camera|microphone|instrument|guitar|piano|violin|flute|drum|headphones|headset|towel|blanket|futon|mirror|paper|pen|pencil|brush|letter|envelope|card|doll|toy|balloon|flag|banner|sign|lantern|fan|hand_fan|key|coin|money|crystal|gem|orb|sphere|cube|ball|rope|chain|cup|vehicle|car|motor_vehicle|bicycle|motorcycle|train|ship|boat|airplane|aircraft|mecha|robot|spacecraft|staff|tray|cart|bucket|basket|bottle|jar|vase|pot|pan|shelf|bookshelf|cushion|stuffed_toy|pillar|building|ground_vehicle|ground_vehicle|wheelchair|crutch|syringe|pill|needle|scissors|tool|wrench|hammer|screwdriver|saw|ladder|barrel|crate|bell)s?(?:_|$)/,
    'item',
  ),
  // creatures / occupations
  nr(
    /^(?:elf|demon|angel|ghost|vampire|mermaid|fairy|monster|monster_girl|oni|robot|android|cyborg|orc|goblin|dragon_girl|horse_girl|fox_girl|cat_girl|catboy|catgirl|wolf_girl|rabbit_girl|bunny_girl|demon_girl|devil|zombie|skeleton|alien|slime_girl|harpy|lamia|centaur|kemonomimi_mode|furry|furry_female|furry_male|animalization|beastman|giant|giantess|dwarf|fairy_wings|ghost_girl|succubus|incubus|witch|werewolf|nekomata|kitsune|kappa|tengu|yokai|youkai|spirit|undead|lich|golem|homunculus|plant_girl|bug_girl|insect_girl|arachne|spider_girl|scylla|siren|selkie|naga|dryad|ent|treant|phoenix|chimera)$/,
    'creature',
  ),
  nr(
    /^(?:maid|nun|miko|witch|ninja|nurse|office_lady|waitress|idol|police|sailor|teacher|soldier|student|doctor|chef|priest|knight|princess|queen|king|prince|samurai|pirate|detective|scientist|cheerleader|athlete|lifeguard|shrine_maiden|gamer|streamer|vtuber|virtual_youtuber|magical_girl|schoolgirl|salaryman|businessman|businesswoman|bartender|barista|florist|farmer|fisherman|hunter|assassin|thief|spy|mercenary|adventurer|wizard|mage|sorceress|priestess|paladin|archer|rogue|bard|monk|cleric|druid|ranger|barbarian|warlock|child|adult|teenager|baby|old_man|old_woman|elderly|mature_female|mature_male|loli|shota|milf|onee-san|oyaji|ojousama|gyaru|kogal)$/,
    'occupation',
  ),
  // nsfw
  nr(
    /(?:^|_)(?:sex|cum|vaginal|anal|oral|fellatio|cunnilingus|paizuri|masturbation|fingering|handjob|footjob|blowjob|deepthroat|gangbang|threesome|doggystyle|missionary|cowgirl_position|spooning|69|sixty-nine|creampie|cum_in_[a-z_]+|group_sex|tentacle_sex|clothed_sex|after_sex|implied_sex|sex_from_behind|rape|incest|orgasm|ejaculation|bukkake|facial)(?:_|$)/,
    'sex_act',
  ),
  nr(
    /(?:^|_)(?:sex_toy|vibrator|dildo|gag|ball_gag|blindfold|handcuffs|shibari|bdsm|bondage|leash|collar|restraints|bound_[a-z_]+|anal_beads|butt_plug|strap-on|pasties)(?:_|$)/,
    'sex_gear',
  ),
  nr(
    /(?:^|_)(?:nude|nudity|topless|bottomless|naked|nipples|pussy|penis|anus|cum|sex|vaginal|anal|oral|fellatio|cunnilingus|paizuri|masturbation|fingering|erection|testicles|pubic_hair|cameltoe|areolae|clitoris|uncensored|censored|bar_censor|mosaic_censoring|bdsm|bondage|bound|rape|gangbang|threesome|orgasm|ejaculation|creampie|facial|bukkake|handjob|footjob|blowjob|deepthroat|futanari|sex_toy|vibrator|dildo|gag|blindfold|handcuffs|shibari|nsfw|explicit|cleavage|underboob|sideboob|areola_slip|nipple_slip|panty_pull|upskirt|pantyshot|covered_nipples|exposed|exhibitionism|stripping|undressing|spread_pussy|spread_anus|bare_breasts|bare_pussy|bare_ass|presenting|lactation|pregnant|impregnation|incest|netorare|yaoi|yuri|hetero|group_sex|sex_from_behind|doggystyle|missionary|cowgirl_position|spooning|69|sixty-nine|tentacles|tentacle_sex|slave|collar|leash|ball_gag|ahegao|fucked_silly|rolling_eyes|clothed_sex|after_sex|before_sex|implied_sex|pubic_tattoo|crotch_tattoo)(?:_|$)/,
    'nudity',
  ),
]

// ── classifier ───────────────────────────────────────────────────────────────

/** Strip the `tag_group:` prefix Danbooru adds. */
export function groupKey(tagGroup: string): string {
  return tagGroup.replace(/^tag_group:/, '')
}

export interface ClassifyInput {
  name: string
  /** Danbooru category id (0 general, 1 artist, 3 copyright, 4 character, 5 meta) */
  category: number
  /** `tag_group` values the tag belongs to (with or without the prefix) */
  groups?: ReadonlyArray<string>
}

export interface TagClassification {
  /** Top-level key */
  top: string
  /** Fine key (the top-level key when nothing finer applies) */
  fine: string
}

function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, '_')
}

/** The best (category, score) candidate for a general tag, or null. */
export function matchRules(
  name: string,
  groups: ReadonlyArray<string> = [],
): { category: string; score: number } | null {
  const n = normalizeName(name)
  let best: { category: string; score: number } | null = null
  for (const g of groups) {
    const rule = GROUP_RULES[groupKey(g)]
    if (rule && (!best || rule.score > best.score)) {
      best = { category: rule.category, score: rule.score }
    }
  }
  for (const rule of NAME_RULES) {
    if (rule.re.test(n)) {
      // Name rules are specific: they beat every group.
      return { category: rule.category, score: 50 }
    }
  }
  return best
}

export function classifyTag(input: ClassifyInput): TagClassification {
  const dan = DANBOORU_CATEGORY_KEY[input.category]
  if (dan) return { top: dan, fine: dan }
  const hit = matchRules(input.name, input.groups)
  if (!hit) return { top: 'uncategorized', fine: 'uncategorized' }
  return { top: topCategoryOf(hit.category), fine: hit.category }
}

/** Danbooru main-category colors (same hues as the editor's completion list). */
export const DANBOORU_COLORS: Record<number, string> = {
  0: 'oklch(0.75 0.08 250)',
  1: 'oklch(0.75 0.12 25)',
  3: 'oklch(0.75 0.12 310)',
  4: 'oklch(0.75 0.12 145)',
  5: 'oklch(0.8 0.01 260)',
}

export function danbooruColor(category: number): string {
  return DANBOORU_COLORS[category] ?? DANBOORU_COLORS[0]
}
