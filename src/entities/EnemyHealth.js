import * as THREE from 'three';

export class EnemyHealthSystem {
    // Shared Resources
    static bgGeo = new THREE.PlaneGeometry(1.2, 0.15);
    static fillGeo = new THREE.PlaneGeometry(1.2, 0.1);
    static bgMat = new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide });

    // Shared Status Materials
    static matGreen = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
    static matYellow = new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide });
    static matRed = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide });

    constructor(enemy, mesh, level) {
        this.enemy = enemy;
        this.mesh = mesh;
        this.level = level;

        this.health = ((10 + (level * 5)) / 2) * 0.7; // Reduced by 30%
        this.maxHealth = this.health;
        this.isFlashing = false;

        this.createHealthBar();
    }

    createHealthBar() {
        // Use shared geometry and materials
        this.healthBarBg = new THREE.Mesh(EnemyHealthSystem.bgGeo, EnemyHealthSystem.bgMat);

        // Start with green
        this.healthBarFill = new THREE.Mesh(EnemyHealthSystem.fillGeo, EnemyHealthSystem.matGreen);

        this.healthBarBg.position.set(0, 2.5, 0);
        this.healthBarFill.position.set(0, 2.5, 0.01);

        this.healthBarBg.visible = false;
        this.healthBarFill.visible = false;

        this.mesh.add(this.healthBarBg);
        this.mesh.add(this.healthBarFill);
    }

    updateHealthBar(camera) {
        if (this.health >= this.maxHealth) {
            this.healthBarBg.visible = false;
            this.healthBarFill.visible = false;
            return;
        }

        this.healthBarBg.visible = true;
        this.healthBarFill.visible = true;

        const healthPercent = this.health / this.maxHealth;
        this.healthBarFill.scale.x = healthPercent;
        this.healthBarFill.position.x = -(1.2 * (1 - healthPercent)) / 2;

        // Swap shared materials based on health
        if (healthPercent > 0.6) {
            if (this.healthBarFill.material !== EnemyHealthSystem.matGreen) {
                this.healthBarFill.material = EnemyHealthSystem.matGreen;
            }
        } else if (healthPercent > 0.3) {
            if (this.healthBarFill.material !== EnemyHealthSystem.matYellow) {
                this.healthBarFill.material = EnemyHealthSystem.matYellow;
            }
        } else {
            if (this.healthBarFill.material !== EnemyHealthSystem.matRed) {
                this.healthBarFill.material = EnemyHealthSystem.matRed;
            }
        }

        // Billboard effect
        if (camera) {
            this.healthBarBg.lookAt(camera.position);
            this.healthBarFill.lookAt(camera.position);
        }
    }

    takeDamage(amount) {
        this.health -= amount;

        if (this.isFlashing) return;
        this.isFlashing = true;

        // Flash effect - this still modifies material color, which is tricky with shared materials.
        // However, EnemyMeshBuilder uses shared materials now too.
        // If we change color on a shared material, ALL enemies will flash.
        // FIX: We need to use emissive or a separate material for flashing, or accept that we can't flash easily without unique materials.
        // For now, let's DISABLE the flash effect to save performance and avoid bugs with shared materials.
        // Or better: Use a simple visibility toggle or scale punch.

        /* 
        // Disabled for performance/shared material compatibility
        this.mesh.traverse((child) => {
            if (child.material && child.material.color) {
                child.material.color.setHex(0xffffff);
            }
        });

        setTimeout(() => {
            if (this.health > 0) {
                this.mesh.traverse((child) => {
                    if (child.material && child.userData.originalColor !== undefined) {
                        child.material.color.setHex(child.userData.originalColor);
                    }
                });
            }
            this.isFlashing = false;
        }, 50);
        */

        // Simple scale punch instead
        this.mesh.scale.multiplyScalar(1.1);
        setTimeout(() => {
            this.mesh.scale.multiplyScalar(1 / 1.1);
            this.isFlashing = false;
        }, 50);

        return this.health <= 0;
    }
}
