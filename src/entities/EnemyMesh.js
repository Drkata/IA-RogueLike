import * as THREE from 'three';

export class EnemyMeshBuilder {
    // Shared Geometries (Unit size, scaled later)
    static geometries = {
        box: new THREE.BoxGeometry(1, 1, 1),
        sphere: new THREE.SphereGeometry(0.5, 8, 8),
        cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
        cone: new THREE.ConeGeometry(0.5, 1, 6),
        octahedron: new THREE.OctahedronGeometry(0.5),
        eye: new THREE.SphereGeometry(0.05, 4, 4) // Low poly eyes
    };

    // Shared Materials Palette
    static materials = [];
    static eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00, opacity: 0.9, transparent: true });
    static armorMaterial = new THREE.MeshLambertMaterial({ color: 0x444444 });
    static initialized = false;

    static init() {
        if (this.initialized) return;

        const colorVariants = [
            0xff3333, 0x3333ff, 0x33ff33, 0xff33ff, 0xffaa33,
            0x33ffff, 0xffff33, 0xff6633, 0x9933ff, 0x33ff99
        ];

        this.materials = colorVariants.map(color =>
            new THREE.MeshLambertMaterial({ color: color })
        );

        // Emissive variants for high levels could be added here if needed, 
        // but for perf we'll stick to base materials or use uniforms if we went shader route.
        // For now, simple colored materials are fast.

        this.initialized = true;
    }

    static build(level) {
        if (!this.initialized) this.init();

        const group = new THREE.Group();
        const seed = Math.random();

        // Pick random shared material
        const matIndex = Math.floor(seed * this.materials.length);
        const material = this.materials[matIndex];

        const bodyWidth = 0.5;
        const bodyHeight = 0.9;
        const headSize = 0.25;
        const legLength = 0.75;

        // HEAD
        let head;
        const headType = Math.floor(Math.random() * 4);
        if (headType === 0) {
            head = new THREE.Mesh(this.geometries.box, material);
            head.scale.set(headSize, headSize, headSize);
        } else if (headType === 1) {
            head = new THREE.Mesh(this.geometries.sphere, material);
            head.scale.set(headSize * 1.2, headSize * 1.2, headSize * 1.2);
        } else if (headType === 2) {
            head = new THREE.Mesh(this.geometries.cone, material);
            head.scale.set(headSize, headSize * 1.2, headSize);
        } else {
            head = new THREE.Mesh(this.geometries.octahedron, material);
            head.scale.set(headSize * 1.2, headSize * 1.2, headSize * 1.2);
        }
        head.position.y = legLength + bodyHeight + headSize * 0.6;
        group.add(head);

        // BODY
        let body;
        const bodyShape = Math.floor(Math.random() * 3);
        if (bodyShape === 0) {
            body = new THREE.Mesh(this.geometries.box, material);
            body.scale.set(bodyWidth, bodyHeight, bodyWidth * 0.6);
        } else if (bodyShape === 1) {
            body = new THREE.Mesh(this.geometries.cylinder, material);
            body.scale.set(bodyWidth * 0.8, bodyHeight, bodyWidth * 0.8);
        } else {
            body = new THREE.Mesh(this.geometries.sphere, material);
            body.scale.set(bodyWidth * 1.2, bodyHeight, bodyWidth * 1.2);
        }
        body.position.y = legLength + bodyHeight * 0.5;
        group.add(body);

        // ARMS
        const numArms = Math.random() > 0.7 ? 4 : 2;
        const armLength = 0.6;
        const armThickness = 0.12;
        const armPositions = numArms === 2 ? [[0]] : [[bodyHeight * 0.3], [-bodyHeight * 0.1]];

        for (let i = 0; i < numArms / 2; i++) {
            const yOffset = armPositions[i] ? armPositions[i][0] : 0;

            const leftArm = new THREE.Mesh(this.geometries.box, material);
            leftArm.scale.set(armThickness, armLength, armThickness);
            leftArm.position.set(-bodyWidth * 0.6, legLength + bodyHeight * 0.5 + yOffset, 0);
            group.add(leftArm);

            const rightArm = new THREE.Mesh(this.geometries.box, material);
            rightArm.scale.set(armThickness, armLength, armThickness);
            rightArm.position.set(bodyWidth * 0.6, legLength + bodyHeight * 0.5 + yOffset, 0);
            group.add(rightArm);
        }

        // LEGS
        const legThickness = 0.15;
        const leftLeg = new THREE.Mesh(this.geometries.box, material);
        leftLeg.scale.set(legThickness, legLength, legThickness);
        leftLeg.position.set(-bodyWidth * 0.25, legLength * 0.5, 0);
        group.add(leftLeg);

        const rightLeg = new THREE.Mesh(this.geometries.box, material);
        rightLeg.scale.set(legThickness, legLength, legThickness);
        rightLeg.position.set(bodyWidth * 0.25, legLength * 0.5, 0);
        group.add(rightLeg);

        // SPIKES (Simplified: fewer spikes, shared geometry)
        if (Math.random() > 0.8) {
            const numSpikes = 3;
            for (let i = 0; i < numSpikes; i++) {
                const spike = new THREE.Mesh(this.geometries.cone, material);
                spike.scale.set(0.1, 0.2, 0.1);
                spike.position.set(
                    (Math.random() - 0.5) * bodyWidth,
                    legLength + Math.random() * bodyHeight,
                    (Math.random() - 0.5) * bodyWidth * 0.6
                );
                spike.rotation.z = Math.random() * Math.PI * 2;
                group.add(spike);
            }
        }

        // HORNS
        if (Math.random() > 0.7) {
            const leftHorn = new THREE.Mesh(this.geometries.cone, material);
            leftHorn.scale.set(0.16, 0.3, 0.16);
            leftHorn.position.set(-headSize * 0.4, legLength + bodyHeight + headSize, 0);
            leftHorn.rotation.z = -0.3;
            group.add(leftHorn);

            const rightHorn = new THREE.Mesh(this.geometries.cone, material);
            rightHorn.scale.set(0.16, 0.3, 0.16);
            rightHorn.position.set(headSize * 0.4, legLength + bodyHeight + headSize, 0);
            rightHorn.rotation.z = 0.3;
            group.add(rightHorn);
        }

        // ARMOR (level 4+)
        if (level >= 4) {
            const chestPlate = new THREE.Mesh(this.geometries.box, this.armorMaterial);
            chestPlate.scale.set(bodyWidth * 0.8, 0.15, bodyWidth * 0.5);
            chestPlate.position.y = legLength + bodyHeight * 0.7;
            group.add(chestPlate);
        }

        // EYES (level 7+)
        if (level >= 7) {
            const leftEye = new THREE.Mesh(this.geometries.eye, this.eyeMaterial);
            leftEye.position.set(-headSize * 0.3, legLength + bodyHeight + headSize * 0.5, headSize * 0.3);
            group.add(leftEye);

            const rightEye = new THREE.Mesh(this.geometries.eye, this.eyeMaterial);
            rightEye.position.set(headSize * 0.3, legLength + bodyHeight + headSize * 0.5, headSize * 0.3);
            group.add(rightEye);
        }

        return group;
    }

    static storeOriginalColors(mesh) {
        // No longer needed as we use shared materials, 
        // but kept empty to prevent breaking existing calls
    }
}
