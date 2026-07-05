import * as THREE from 'three';

export class FloatingText {
    static cache = {}; // Cache to prevent canvas recreation

    constructor(position, text, color = '#ffffff', size = 1) {
        this.isDead = false;
        this.lifeTime = 1.0; // Seconds
        this.age = 0;

        const cacheKey = `${text}_${color}`;
        
        let texture = FloatingText.cache[cacheKey];
        
        if (!texture) {
            // Create canvas for text ONLY ONCE per unique text/color
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = 256;
            canvas.height = 128; // Rectangular for text

            // Text style
            context.font = 'bold 60px monospace';
            context.textAlign = 'center';
            context.textBaseline = 'middle';

            // Stroke (outline)
            context.lineWidth = 4;
            context.strokeStyle = 'black';
            context.strokeText(text, 128, 64);

            // Fill
            context.fillStyle = color;
            context.fillText(text, 128, 64);

            // Create texture
            texture = new THREE.CanvasTexture(canvas);
            FloatingText.cache[cacheKey] = texture;
        }

        // Create sprite material
        // We MUST create a new material instance so opacity fades independently per text instance
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false
        });

        this.mesh = new THREE.Sprite(material);
        this.mesh.position.copy(position);

        // Random slight offset to avoid overlapping perfectly
        this.mesh.position.x += (Math.random() - 0.5) * 0.5;
        this.mesh.position.y += 0.5 + Math.random() * 0.5; // Start slightly above
        this.mesh.position.z += (Math.random() - 0.5) * 0.5;

        this.mesh.scale.set(2 * size, 1 * size, 1); // Aspect ratio match canvas

        // Velocity for floating up
        this.velocity = new THREE.Vector3(0, 1.5, 0);
    }

    update(dt) {
        this.age += dt;

        if (this.age >= this.lifeTime) {
            this.isDead = true;
            return;
        }

        // Move up — zero-allocation: addScaledVector avoids velocity.clone()
        this.mesh.position.addScaledVector(this.velocity, dt);

        // Fade out in the last half
        if (this.age > this.lifeTime * 0.5) {
            this.mesh.material.opacity = 1 - ((this.age - this.lifeTime * 0.5) / (this.lifeTime * 0.5));
        }
    }
}
