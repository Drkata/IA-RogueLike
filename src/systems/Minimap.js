import { CONSTANTS } from '../core/Constants.js';

export class Minimap {
    constructor(levelManager, player, canvasId) {
        this.levelManager = levelManager;
        this.player = player;
        this.canvas = document.createElement('canvas');
        this.canvas.width = 200;
        this.canvas.height = 200;
        this.ctx = this.canvas.getContext('2d');

        this.size = 200; // Canvas size in pixels
        this.scale = 1;
    }

    // Accept the raw entities array to avoid .filter() allocation in the caller (Game.js)
    update(entities = []) {
        if (!this.levelManager.levelData) return;

        const mapWidth  = this.levelManager.width;
        const mapHeight = this.levelManager.height;

        // Calculate scale to fit map in canvas
        const scaleX = this.size / mapWidth;
        const scaleY = this.size / mapHeight;
        this.scale = Math.min(scaleX, scaleY);

        // Player grid position
        const playerGridX = this.player.position.x / CONSTANTS.CELL_SIZE;
        const playerGridZ = this.player.position.z / CONSTANTS.CELL_SIZE;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.size, this.size);
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(0, 0, this.size, this.size);

        // ----- Draw rotating map -----
        this.ctx.save();
        const cx = this.size / 2;
        const cz = this.size / 2;
        this.ctx.translate(cx, cz);
        this.ctx.rotate(this.player.yaw);

        // Draw map cells relative to player
        for (let y = 0; y < mapHeight; y++) {
            for (let x = 0; x < mapWidth; x++) {
                const index = y * mapWidth + x;
                if (this.levelManager.data[index] === 1) {
                    const offsetX = (x - playerGridX) * this.scale;
                    const offsetZ = (y - playerGridZ) * this.scale;
                    this.ctx.fillStyle = '#555';
                    this.ctx.fillRect(offsetX, offsetZ, this.scale, this.scale);
                }
            }
        }

        // Draw enemies — filter inline (no .filter() allocation)
        for (let i = 0; i < entities.length; i++) {
            const entity = entities[i];
            if (entity.entityType !== 'enemy' || entity.isDead) continue;
            const offsetX = (entity.position.x / CONSTANTS.CELL_SIZE - playerGridX) * this.scale;
            const offsetZ = (entity.position.z / CONSTANTS.CELL_SIZE - playerGridZ) * this.scale;
            this.ctx.fillStyle = 'orange';
            this.ctx.beginPath();
            this.ctx.arc(offsetX, offsetZ, this.scale * 1.2, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Restore to original orientation – player will be drawn on top of the rotated map
        this.ctx.restore();

        // ----- Draw fixed player marker at centre -----
        const playerScreenX = this.size / 2;
        const playerScreenZ = this.size / 2;
        this.ctx.fillStyle = 'red';
        this.ctx.beginPath();
        this.ctx.arc(playerScreenX, playerScreenZ, this.scale * 1.5, 0, Math.PI * 2);
        this.ctx.fill();

        // Draw player direction arrow pointing up (static forward direction)
        this.ctx.strokeStyle = 'red';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(playerScreenX, playerScreenZ);
        this.ctx.lineTo(playerScreenX, playerScreenZ - this.scale * 2.5); // Point straight UP
        this.ctx.stroke();
    }
}
