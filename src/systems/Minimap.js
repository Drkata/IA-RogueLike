import { CONSTANTS } from '../core/Constants.js';

export class Minimap {
    constructor(levelManager, player) {
        this.levelManager = levelManager;
        this.player = player;
        this.size = 200; // Canvas size in pixels
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.size;
        this.canvas.height = this.size;
        this.ctx = this.canvas.getContext('2d');
        this.scale = 1;
        this.wallLayer = null;
    }

    // Walls never change during a level: draw them once into an offscreen canvas
    _buildWallLayer() {
        const { width, height, data } = this.levelManager;
        this.scale = Math.min(this.size / width, this.size / height);
        this.wallLayer = document.createElement('canvas');
        this.wallLayer.width = Math.ceil(width * this.scale);
        this.wallLayer.height = Math.ceil(height * this.scale);
        const ctx = this.wallLayer.getContext('2d');
        ctx.fillStyle = '#555';
        for (let z = 0; z < height; z++) {
            for (let x = 0; x < width; x++) {
                if (data[z * width + x] === 1) ctx.fillRect(x * this.scale, z * this.scale, this.scale, this.scale);
            }
        }
        this._layerData = data;
    }

    // Takes the raw entities array (filtered inline, no allocation)
    update(entities = []) {
        if (!this.levelManager.levelData) return;
        if (this._layerData !== this.levelManager.data) this._buildWallLayer();

        const ctx = this.ctx;
        const playerGridX = this.player.position.x / CONSTANTS.CELL_SIZE;
        const playerGridZ = this.player.position.z / CONSTANTS.CELL_SIZE;

        ctx.clearRect(0, 0, this.size, this.size);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, this.size, this.size);

        // Map rotates around the player, who stays at the centre facing up
        ctx.save();
        ctx.translate(this.size / 2, this.size / 2);
        ctx.rotate(this.player.yaw);
        ctx.drawImage(this.wallLayer, -playerGridX * this.scale, -playerGridZ * this.scale);

        ctx.fillStyle = 'orange';
        for (let i = 0; i < entities.length; i++) {
            const entity = entities[i];
            if (entity.entityType !== 'enemy' || entity.isDead) continue;
            ctx.beginPath();
            ctx.arc(
                (entity.position.x / CONSTANTS.CELL_SIZE - playerGridX) * this.scale,
                (entity.position.z / CONSTANTS.CELL_SIZE - playerGridZ) * this.scale,
                this.scale * 1.2, 0, Math.PI * 2
            );
            ctx.fill();
        }
        ctx.restore();

        // Fixed player marker and forward arrow
        const c = this.size / 2;
        ctx.fillStyle = 'red';
        ctx.beginPath();
        ctx.arc(c, c, this.scale * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.lineTo(c, c - this.scale * 2.5);
        ctx.stroke();
    }
}
