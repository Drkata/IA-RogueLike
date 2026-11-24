import * as THREE from 'three';
import { PALETTE, css } from '../core/Palette.js';

const MAX_CACHED_TEXTURES = 200;
const _spawnPos = new THREE.Vector3();

export class FloatingText {
    // text+color -> CanvasTexture. Damage numbers vary a lot, so the cache is bounded (oldest evicted).
    static cache = new Map();

    static getTexture(text, color) {
        const key = `${text}_${color}`;
        let texture = FloatingText.cache.get(key);
        if (texture) return texture;

        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const context = canvas.getContext('2d');
        context.font = 'bold 60px monospace';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.lineWidth = 4;
        context.strokeStyle = 'black';
        context.strokeText(text, 128, 64);
        context.fillStyle = color;
        context.fillText(text, 128, 64);

        texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        FloatingText.cache.set(key, texture);
        if (FloatingText.cache.size > MAX_CACHED_TEXTURES) {
            // A text still on screen re-uploads its texture transparently if it was evicted
            const [oldestKey, oldest] = FloatingText.cache.entries().next().value;
            FloatingText.cache.delete(oldestKey);
            oldest.dispose();
        }
        return texture;
    }

    // Damage number above an entity: hex violet with "!" for crits
    static spawnDamage(entityManager, position, yOffset, amount, isCritical, size, color = css(PALETTE.vellum)) {
        _spawnPos.copy(position);
        _spawnPos.y += yOffset;
        const text = amount.toFixed(1) + (isCritical ? '!' : '');
        entityManager.add(new FloatingText(_spawnPos, text, isCritical ? css(PALETTE.hexBright) : color, size));
    }

    constructor(position, text, color = css(PALETTE.vellum), size = 1) {
        this.isDead = false;
        this.lifeTime = 1.0; // Seconds
        this.age = 0;

        // Own material per instance so each text fades independently
        const material = new THREE.SpriteMaterial({
            map: FloatingText.getTexture(text, color),
            transparent: true,
            depthTest: false,
            depthWrite: false
        });

        this.mesh = new THREE.Sprite(material);
        this.mesh.position.copy(position);
        // Random slight offset to avoid overlapping perfectly
        this.mesh.position.x += (Math.random() - 0.5) * 0.5;
        this.mesh.position.y += 0.5 + Math.random() * 0.5;
        this.mesh.position.z += (Math.random() - 0.5) * 0.5;
        this.mesh.scale.set(2 * size, 1 * size, 1); // Canvas aspect ratio

        this.riseSpeed = 1.5;
    }

    update(dt) {
        this.age += dt;
        if (this.age >= this.lifeTime) {
            this.isDead = true;
            return;
        }

        this.mesh.position.y += this.riseSpeed * dt;

        // Fade out in the last half
        if (this.age > this.lifeTime * 0.5) {
            this.mesh.material.opacity = 1 - ((this.age - this.lifeTime * 0.5) / (this.lifeTime * 0.5));
        }
    }

    // Called by EntityManager when the entity is removed
    dispose() {
        this.mesh.material.dispose();
    }
}
