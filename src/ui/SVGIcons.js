// Game-Icons.net via the Iconify HTTP API, as plain <img> tags
// (custom elements render badly while the pointer is locked).

// Icon tints = upgrade card tints (see ART_DIRECTION.md, section 4)
const OFFENSE = '#e58f6f';
const VITALITY = '#8fcf9a'; // --sage
const ARCANA = '#c9a6ff'; // --hex-bright
const GILT = '#e6c983'; // --gilt-bright

const makeIcon = (iconName, color = GILT) =>
    `<img class="ico" alt="" src="https://api.iconify.design/game-icons/${iconName}.svg?color=${encodeURIComponent(color)}">`;

export const SVG_ICONS = {
    // Weapon upgrades
    damage: makeIcon('crossed-swords', OFFENSE),
    fireRate: makeIcon('arrow-flights', OFFENSE),
    reload: makeIcon('ammo-box', OFFENSE),
    ammo: makeIcon('bullets', OFFENSE),
    range: makeIcon('bullseye', OFFENSE),
    projectileSpeed: makeIcon('fast-arrow', OFFENSE),
    critChance: makeIcon('rolling-dices', OFFENSE),
    critDamage: makeIcon('skull-mask', OFFENSE),

    // Body upgrades
    maxHealth: makeIcon('heart-shield', VITALITY),
    armor: makeIcon('shield', VITALITY),
    vampirism: makeIcon('glass-heart', VITALITY),
    regen: makeIcon('healing', VITALITY),
    speed: makeIcon('sprint', VITALITY),

    // Special effects
    arc: makeIcon('split-arrows', ARCANA),
    bulletCount: makeIcon('shatter', ARCANA),
    piercing: makeIcon('barbed-spear', ARCANA),
    knockback: makeIcon('punch', ARCANA),
    explosion: makeIcon('explosion-rays', ARCANA),
    ricochet: makeIcon('ricochet', ARCANA),
    immolation: makeIcon('fire-ring', ARCANA),
    magnet: makeIcon('magnet', ARCANA),
    meleeDamage: makeIcon('wood-club', ARCANA),
    homing: makeIcon('target-arrows', ARCANA),

    // Altar pacts
    blood: makeIcon('blood', '#e0563f'),
    wizard: makeIcon('wizard-staff', '#7fd6c9'),
    greed: makeIcon('gold-stack', GILT),
    precision: makeIcon('bullseye', '#7fd6c9'),
    resilience: makeIcon('stone-wall', '#c9bfa8'),
    vampire: makeIcon('vampire-dracula', '#e0563f'),
    armor_pact: makeIcon('shield', '#8fcf9a'),
    speed_pact: makeIcon('sprint', '#d8b465'),
    hunter: makeIcon('crosshair', OFFENSE),
    storm: makeIcon('lightning-arc', '#9ef0e2'),
    cataclysm: makeIcon('earth-crack', '#e0563f'),
    wings: makeIcon('feathered-wing', '#ece3cc'),
    pyre: makeIcon('campfire', '#e58f6f'),
    pyromancy: makeIcon('fire-bomb', '#e0563f'),
    colossus: makeIcon('giant', '#c9bfa8'),
    aegis: makeIcon('magic-shield', '#9ef0e2'),

    // Shop
    potion: makeIcon('health-potion', '#e0563f'),
    mana_reserve: makeIcon('ammo-box', '#7fd6c9'),
    ward: makeIcon('shield', '#7fd6c9'),
    soul_shard: makeIcon('shatter', ARCANA),
    coin: makeIcon('crown-coin', GILT),

    // Touch controls
    touchFire: makeIcon('fire-ray', '#9ef0e2'), // --aether-bright
    touchJump: makeIcon('jump-across', '#ece3cc'), // --vellum
    touchReload: makeIcon('magic-swirl', '#9ef0e2'),
    touchAction: makeIcon('open-palm', GILT),

    // HUD
    audioOn: makeIcon('speaker', GILT),
    audioOff: makeIcon('speaker-off', '#8a8170'),
    dungeon_gate: makeIcon('dungeon-gate', GILT),
    hostile: makeIcon('skull-mask', '#e0563f')
};
