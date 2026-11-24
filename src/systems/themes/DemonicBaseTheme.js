// Values are calibrated: see ART_DIRECTION.md (« Lumière ») before changing them.
export const DemonicBaseTheme = {
    name: 'Demonic Base',
    biome: 'hell', // Basalt split by lava under a blood moon
    lighting: {
        sky: 0xd05850,
        ground: 0x502018,
        fill: 10.0,
        sun: 0xff7840, // Blood moon
        sunIntensity: 9.5,
        sunDirection: [0.5, 0.55, -0.6],
        point: 0xff6a20, // Braziers
        pointIntensity: 22
    },
    fogColor: 0x2a0a08,
    fogDensity: 0.03,
    accent: 0xff5a1a,
    foliage: 0x6a1a10
};
