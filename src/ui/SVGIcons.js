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
    homing: makeIcon('target-arrows', ARCANA),

    // Sword upgrades
    meleeDamage: makeIcon('broadsword', OFFENSE),
    attackSpeed: makeIcon('sword-brandish', OFFENSE),
    reach: makeIcon('saber-slash', OFFENSE),

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
    berserker: makeIcon('bloody-sword', '#e0563f'),
    duelist: makeIcon('fencer', OFFENSE),
    reach_pact: makeIcon('sword-array', '#c9bfa8'),
    executioner: makeIcon('executioner-hood', '#e0563f'),
    whirlwind: makeIcon('whirlwind', '#9ef0e2'),
    riposte: makeIcon('sword-clash', GILT),
    mirror: makeIcon('shield-reflect', '#9ef0e2'),
    greedy_blade: makeIcon('energy-sword', '#7fd6c9'),
    leech: makeIcon('dripping-sword', '#e0563f'),
    wave: makeIcon('sword-slice', '#9ef0e2'),

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
    touchSlash: makeIcon('sword-slice', '#ece3cc'),
    touchCharge: makeIcon('crystal-wand', '#9ef0e2'),
    touchGuard: makeIcon('checked-shield', '#ece3cc'),
    touchSwitch: makeIcon('switch-weapon', GILT),

    // Weapon in hand
    weaponStaff: makeIcon('wizard-staff', '#9ef0e2'),
    weaponSword: makeIcon('broadsword', '#ece3cc'),

    // HUD
    audioOn: makeIcon('speaker', GILT),
    audioOff: makeIcon('speaker-off', '#8a8170'),
    dungeon_gate: makeIcon('dungeon-gate', GILT),
    hostile: makeIcon('skull-mask', '#e0563f')
};
