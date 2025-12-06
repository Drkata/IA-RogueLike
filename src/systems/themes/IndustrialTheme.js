import * as THREE from 'three';

export const IndustrialTheme = {
    name: 'Industrial',

    // Color palette
    wallColors: [
        0x3a3a3a, // Dark gray
        0x4a4a4a, // Medium gray
        0x5a4a3a  // Rusty gray
    ],

    wallTextureType: 'panel',
    floorTextureType: 'metal_floor',

    floorColor: 0x2a2a2a,
    ceilingColor: 0x1a1a1a,

    // Lighting
    ambientLight: { color: 0xffaa66, intensity: 0.3 },
    pointLightColor: 0xff8800,

    // Decorations
    decorations: [
        {
            name: 'metal_crate_marked',
            create: () => {
                const group = new THREE.Group();

                // Main crate
                const geo = new THREE.BoxGeometry(1, 1, 1);
                const mat = new THREE.MeshStandardMaterial({
                    color: 0x555555,
                    metalness: 0.8,
                    roughness: 0.5
                });
                const crate = new THREE.Mesh(geo, mat);
                group.add(crate);

                // Yellow warning stripes
                const stripeGeo = new THREE.BoxGeometry(1.01, 0.15, 1.01);
                const stripeMat = new THREE.MeshStandardMaterial({
                    color: 0xffcc00,
                    emissive: 0x664400,
                    emissiveIntensity: 0.2
                });
                const stripe1 = new THREE.Mesh(stripeGeo, stripeMat);
                stripe1.position.y = 0.3;
                const stripe2 = new THREE.Mesh(stripeGeo, stripeMat);
                stripe2.position.y = -0.3;
                group.add(stripe1, stripe2);

                return { mesh: group, height: 0.5 };
            },
            spawnChance: 0.4,
            minPerRoom: 1,
            maxPerRoom: 3
        },
        {
            name: 'hazard_barrel',
            create: () => {
                const group = new THREE.Group();

                // Barrel body
                const geo = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12);
                const mat = new THREE.MeshStandardMaterial({
                    color: 0xff6600,
                    metalness: 0.6,
                    roughness: 0.4
                });
                const barrel = new THREE.Mesh(geo, mat);
                group.add(barrel);

                // Black hazard bands
                const bandGeo = new THREE.CylinderGeometry(0.31, 0.31, 0.1, 12);
                const bandMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
                const band1 = new THREE.Mesh(bandGeo, bandMat);
                band1.position.y = 0.25;
                const band2 = new THREE.Mesh(bandGeo, bandMat);
                band2.position.y = -0.25;
                group.add(band1, band2);

                // Glowing top
                const topGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 12);
                const topMat = new THREE.MeshStandardMaterial({
                    color: 0xffff00,
                    emissive: 0xffaa00,
                    emissiveIntensity: 0.5
                });
                const top = new THREE.Mesh(topGeo, topMat);
                top.position.y = 0.45;
                group.add(top);

                return { mesh: group, height: 0.45 };
            },
            spawnChance: 0.35,
            minPerRoom: 0,
            maxPerRoom: 3
        },
        {
            name: 'industrial_pillar',
            create: () => {
                const group = new THREE.Group();

                // Main pillar
                const geo = new THREE.BoxGeometry(0.4, 3, 0.4);
                const mat = new THREE.MeshStandardMaterial({
                    color: 0x666666,
                    metalness: 0.9,
                    roughness: 0.2
                });
                const pillar = new THREE.Mesh(geo, mat);
                group.add(pillar);

                // Rivets/bolts
                for (let i = 0; i < 5; i++) {
                    const rivetGeo = new THREE.SphereGeometry(0.05, 8, 8);
                    const rivetMat = new THREE.MeshStandardMaterial({
                        color: 0x333333,
                        metalness: 1,
                        roughness: 0.3
                    });
                    const rivet = new THREE.Mesh(rivetGeo, rivetMat);
                    rivet.position.set(0.21, -1 + i * 0.5, 0);
                    group.add(rivet);
                }

                return { mesh: group, height: 1.5 };
            },
            spawnChance: 0.2,
            minPerRoom: 0,
            maxPerRoom: 2,
            cornerOnly: true
        },
        {
            name: 'steam_pipe',
            create: () => {
                const group = new THREE.Group();

                // Pipe
                const geo = new THREE.CylinderGeometry(0.15, 0.15, 2, 8);
                geo.rotateZ(Math.PI / 2);
                const mat = new THREE.MeshStandardMaterial({
                    color: 0x777777,
                    metalness: 0.8,
                    roughness: 0.3
                });
                const pipe = new THREE.Mesh(geo, mat);
                group.add(pipe);

                // Rust spots
                const rustGeo = new THREE.SphereGeometry(0.08, 6, 6);
                const rustMat = new THREE.MeshStandardMaterial({
                    color: 0x8B4513,
                    roughness: 0.9
                });
                for (let i = 0; i < 3; i++) {
                    const rust = new THREE.Mesh(rustGeo, rustMat);
                    rust.position.set((Math.random() - 0.5) * 1.5, 0.16, (Math.random() - 0.5) * 0.2);
                    group.add(rust);
                }

                return { mesh: group, height: 2.5 };
            },
            spawnChance: 0.15,
            minPerRoom: 0,
            maxPerRoom: 1,
            wallOnly: true
        },
        {
            name: 'toolbox',
            create: () => {
                const group = new THREE.Group();

                // Box
                const geo = new THREE.BoxGeometry(0.7, 0.4, 0.5);
                const mat = new THREE.MeshStandardMaterial({
                    color: 0xcc0000,
                    metalness: 0.7,
                    roughness: 0.4
                });
                const box = new THREE.Mesh(geo, mat);
                group.add(box);

                // Handle
                const handleGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8);
                handleGeo.rotateZ(Math.PI / 2);
                const handleMat = new THREE.MeshStandardMaterial({
                    color: 0x333333,
                    metalness: 0.9
                });
                const handle = new THREE.Mesh(handleGeo, handleMat);
                handle.position.y = 0.25;
                group.add(handle);

                return { mesh: group, height: 0.2 };
            },
            spawnChance: 0.25,
            minPerRoom: 0,
            maxPerRoom: 4
        }
    ]
};
