import { EnchantedForestTheme } from './EnchantedForestTheme.js';
import { MedievalCityTheme } from './MedievalCityTheme.js';
import { DeepCaveTheme } from './DeepCaveTheme.js';
import { DemonicBaseTheme } from './DemonicBaseTheme.js';

// A theme needs `biome` (a key of TextureGenerator) and a calibrated `lighting` rig: see ART_DIRECTION.md.
export class ThemeManager {
    constructor() {
        this.themes = [
            EnchantedForestTheme,
            MedievalCityTheme,
            DeepCaveTheme,
            DemonicBaseTheme
        ];
    }

    // The theme changes every 5 levels
    getTheme(levelIndex) {
        const themeIndex = Math.floor((levelIndex - 1) / 5) % this.themes.length;
        return this.themes[themeIndex];
    }
}
