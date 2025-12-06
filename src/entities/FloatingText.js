import * as THREE from 'three';

export class FloatingText {
    constructor(position, text, color = '#ffffff', size = 1) {
        this.isDead = false;
        this.lifeTime = 1.0; // Seconds
        this.age = 0;

        // Create canvas for text
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
        const texture = new THREE.CanvasTexture(canvas);

        // Create sprite material
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false, // Always visible on top (optional, maybe true is better for depth)
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

        // Move up
        this.mesh.position.add(this.velocity.clone().multiplyScalar(dt));

        // Fade out in the last half
        if (this.age > this.lifeTime * 0.5) {
            this.mesh.material.opacity = 1 - ((this.age - this.lifeTime * 0.5) / (this.lifeTime * 0.5));
        }
    }
}
