// Game-Icons.net integration via Iconify HTTP API
// Uses standard native <img> tags to bypass Pointer Lock custom element rendering bugs in browsers.
// This guarantees that icons load instantly and correctly in all contexts.

const makeIcon = (iconName, color = "#d4af37") => {
    const encodedColor = encodeURIComponent(color);
    return `
    <img src="https://api.iconify.design/game-icons/${iconName}.svg?color=${encodedColor}" style="width: 1em; height: 1em; display: inline-block; vertical-align: middle;" />
    `;
};

export const SVG_ICONS = {
    // Stats & Upgrades
    damage: makeIcon('crossed-swords', '#ff8888'),
    fireRate: makeIcon('arrow-flights', '#ff8888'),
    arc: makeIcon('split-arrows', '#aaaaff'),
    reload: makeIcon('ammo-box', '#ff8888'),
    ammo: makeIcon('bullets', '#ff8888'),
    range: makeIcon('bullseye', '#ff8888'),
    projectileSpeed: makeIcon('fast-arrow', '#ff8888'),
    bulletCount: makeIcon('shatter', '#aaaaff'),
    piercing: makeIcon('barbed-spear', '#aaaaff'),
    critChance: makeIcon('rolling-dices', '#ff8888'),
    critDamage: makeIcon('skull-mask', '#ff8888'),
    maxHealth: makeIcon('heart-shield', '#88ff88'),
    armor: makeIcon('shield', '#88ff88'),
    vampirism: makeIcon('glass-heart', '#88ff88'),
    regen: makeIcon('healing', '#88ff88'),
    speed: makeIcon('sprint', '#88ff88'),
    knockback: makeIcon('punch', '#aaaaff'),
    explosion: makeIcon('explosion-rays', '#aaaaff'),
    ricochet: makeIcon('ricochet', '#aaaaff'),
    immolation: makeIcon('fire-ring', '#aaaaff'),
    meleeDamage: makeIcon('wood-club', '#aaaaff'),
    homing: makeIcon('target-arrows', '#aaaaff'),

    // Pact / Chaos Icons
    blood: makeIcon('blood', '#ff3333'),
    wizard: makeIcon('wizard-staff', '#00aaff'),
    greed: makeIcon('gold-stack', '#ffd700'),
    precision: makeIcon('bullseye', '#00ffaa'),
    resilience: makeIcon('stone-wall', '#aaaaaa'),
    vampire: makeIcon('vampire-dracula', '#ff0055'),
    armor_pact: makeIcon('shield', '#00ffaa'),
    speed_pact: makeIcon('sprint', '#ffff00'),

    // Shop & Audio
    potion: makeIcon('health-potion', '#ff3333'),
    backpack_shop: makeIcon('ammo-box', '#00aaff'),
    coin: makeIcon('crown-coin', '#ffd700'),
    audioOn: makeIcon('speaker', '#d4af37'),
    audioOff: makeIcon('speaker-off', '#888888'),

    // HUD / Level Info
    dungeon_gate: makeIcon('dungeon-gate', '#00ff00'),
    hostile: makeIcon('skull-mask', '#ff3333')
};
