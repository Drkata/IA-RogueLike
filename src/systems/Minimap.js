import { PALETTE } from '../core/Palette.js';
import { CONSTANTS } from '../core/Constants.js';
import { PLAYER_CLIMB, cellTopHeight } from './MapGenerator.js';

const RESOLUTION = 312; // Canvas px: twice the mirror's 156 CSS px, sharp on high-density screens
const CELL_PX = 6; // Relief layer px per cell (whole, so cells meet without seams); scaled down to the view
const TOP = CONSTANTS.WALL_HEIGHT * 3; // Highest cell top (a Floor 2 wall)
// Cells from the player to the mirror's rim: a small map nearly fills it, a big one shows 44 cells (88 m) around
const viewRadius = (mapWidth) => Math.min(44, Math.max(28, 0.75 * mapWidth));
const ENEMY_RADIUS = 4.5; // Canvas px
const css = (c) => `#${c.toString(16).padStart(6, '0')}`;
const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

// Relief: the higher a cell's top, the lighter, from dark ink at the ground toward vellum (held back: the
// plateau at 6 m covers much of a level and must not glare)
function heightColor(h) {
    const t = 0.22 + 0.5 * h / TOP;
    const [low, high] = [rgb(PALETTE.ink), rgb(PALETTE.vellum)];
    return `rgb(${low.map((l, i) => Math.round(l + (high[i] - l) * t)).join()})`;
}

// The scrying mirror: the level's height map turning about the player, who faces up at its centre
export class Minimap {
    constructor(levelManager, player) {
        this.levelManager = levelManager;
        this.player = player;
        this.size = RESOLUTION;
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.canvas.height = RESOLUTION;
        this.ctx = this.canvas.getContext('2d');
        this.layer = null;
    }

    // The relief never changes during a level: drawn once into an offscreen canvas. Each cell in the shade of its
    // height, with a shadow along every drop the player cannot walk back up (more than PLAYER_CLIMB).
    _buildLayer() {
        const { width, height, data, dataFloor1, dataFloor2 } = this.levelManager;
        const tops = Array.from({ length: width * height }, (_, i) => cellTopHeight(data[i], dataFloor1?.[i], dataFloor2?.[i]));
        this.layer = document.createElement('canvas');
        this.layer.width = width * CELL_PX;
        this.layer.height = height * CELL_PX;
        const ctx = this.layer.getContext('2d');
        const colors = new Map();
        for (let i = 0; i < tops.length; i++) {
            if (!colors.has(tops[i])) colors.set(tops[i], heightColor(tops[i]));
            ctx.fillStyle = colors.get(tops[i]);
            ctx.fillRect((i % width) * CELL_PX, Math.floor(i / width) * CELL_PX, CELL_PX, CELL_PX);
        }
        // The shadow lies on the low side of the edge, the width of a third of a cell
        const w = CELL_PX / 3;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        for (let z = 0; z < height; z++) {
            for (let x = 0; x < width; x++) {
                const top = tops[z * width + x] - PLAYER_CLIMB;
                const X = x * CELL_PX;
                const Z = z * CELL_PX;
                if (x > 0 && tops[z * width + x - 1] < top) ctx.fillRect(X - w, Z, w, CELL_PX);
                if (x < width - 1 && tops[z * width + x + 1] < top) ctx.fillRect(X + CELL_PX, Z, w, CELL_PX);
                if (z > 0 && tops[(z - 1) * width + x] < top) ctx.fillRect(X, Z - w, CELL_PX, w);
                if (z < height - 1 && tops[(z + 1) * width + x] < top) ctx.fillRect(X, Z + CELL_PX, CELL_PX, w);
            }
        }
        this._layerData = data;
        this.zoom = RESOLUTION / 2 / (viewRadius(width) * CELL_PX); // Canvas px per layer px
    }

    // Takes the raw entities array (filtered inline, no allocation)
    update(entities = []) {
        if (!this.levelManager.levelData) return;
        if (this._layerData !== this.levelManager.data) this._buildLayer();

        const ctx = this.ctx;
        const c = RESOLUTION / 2;
        const k = this.zoom;
        const unit = CELL_PX / this.levelManager.cellSize; // Layer px per metre
        const px = this.player.position.x * unit;
        const pz = this.player.position.z * unit;
        ctx.clearRect(0, 0, RESOLUTION, RESOLUTION);

        ctx.save();
        ctx.translate(c, c);
        ctx.rotate(this.player.yaw);
        ctx.scale(k, k);
        ctx.drawImage(this.layer, -px, -pz);
        ctx.fillStyle = css(PALETTE.ember);
        ctx.strokeStyle = css(PALETTE.ink);
        ctx.lineWidth = 1.5 / k;
        for (let i = 0; i < entities.length; i++) {
            const entity = entities[i];
            if (entity.entityType !== 'enemy' || entity.isDead) continue;
            ctx.beginPath();
            ctx.arc(entity.position.x * unit - px, entity.position.z * unit - pz, ENEMY_RADIUS / k, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();

        // The player: an arrow of aether, pointing where they look
        ctx.beginPath();
        ctx.moveTo(c, c - 11);
        ctx.lineTo(c + 7, c + 7);
        ctx.lineTo(c, c + 3);
        ctx.lineTo(c - 7, c + 7);
        ctx.closePath();
        ctx.fillStyle = css(PALETTE.aetherBright);
        ctx.fill();
        ctx.strokeStyle = css(PALETTE.ink);
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}
