import * as THREE from 'three';

export const BunkerTheme = {
    name: 'Bunker',

    // Color palette
    wallColors: [
        0x4a5a4a, // Olive gray
        0x5a5a5a, // Concrete gray
        0x3a4a3a  // Dark olive
    ],

    wallTextureType: 'panel',
    floorTextureType: 'metal_floor',

    floorColor: 0x3a3a3a,
    ceilingColor: 0x2a2a2a,

    // Lighting
    ambientLight: { color: 0xaaaaaa, intensity: 0.4 },
    pointLightColor: 0xffffaa,

    // Decorations
    decorations: [
        {
            name: 'military_crate',
            create: () => {
                const group = new THREE.Group();

                // Crate
                const geo = new THREE.BoxGeometry(0.8, 0.6, 0.8);
                const mat = new THREE.MeshStandardMaterial({
                    color: 0x4a5a3a,
                    roughness: 0.9
                });
                const crate = new THREE.Mesh(geo, mat);
                group.add(crate);

                // Stencil markings (white rectangles)
                const markGeo = new THREE.BoxGeometry(0.3, 0.15, 0.01);
                const markMat = new THREE.MeshStandardMaterial({
                    color: 0xeeeeee,
                    emissive: 0x666666,
                    emissiveIntensity: 0.1
                });
                const mark = new THREE.Mesh(markGeo, markMat);
                mark.position.set(0, 0.1, 0.41);
                group.add(mark);

                // Metal straps
                const strapGeo = new THREE.BoxGeometry(0.82, 0.05, 0.82);
                const strapMat = new THREE.MeshStandardMaterial({
                    color: 0x222222,
                    metalness: 0.8
                });
                const strap = new THREE.Mesh(strapGeo, strapMat);
                strap.position.y = 0.15;
                group.add(strap);

                return { mesh: group, height: 0.3 };
            },
            spawnChance: 0.4,
            minPerRoom: 1,
            maxPerRoom: 4
        },
        {
            name: 'sandbag_fortification',
            create: () => {
                const group = new THREE.Group();

                // Create staggered sandbags
                for (let i = 0; i < 4; i++) {
                    const layer = Math.floor(i / 2);
                    const offset = (i % 2) * 0.35 - 0.175;

                    const geo = new THREE.BoxGeometry(0.6, 0.2, 0.4);
                    const mat = new THREE.MeshStandardMaterial({
                        color: 0x8B7355,
                        roughness: 0.95
                    });
                    const bag = new THREE.Mesh(geo, mat);
                    bag.position.set(offset, layer * 0.2, 0);
                    bag.rotation.y = (Math.random() - 0.5) * 0.2;
                    group.add(bag);
                }

                return { mesh: group, height: 0.2 };
            },
            spawnChance: 0.35,
            minPerRoom: 0,
            maxPerRoom: 3
        },
        {
            name: 'tactical_locker',
            create: () => {
                const group = new THREE.Group();

                // Locker
                const geo = new THREE.BoxGeometry(0.6, 2, 0.4);
                const mat = new THREE.MeshStandardMaterial({
                    color: 0x3a3a3a,
                    metalness: 0.7,
                    roughness: 0.4
                });
                const locker = new THREE.Mesh(geo, mat);
                group.add(locker);

                // Door seam
                const seamGeo = new THREE.BoxGeometry(0.61, 1.9, 0.02);
                const seamMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
                const seam = new THREE.Mesh(seamGeo, seamMat);
                seam.position.z = 0.21;
                group.add(seam);

                // Indicator light
                const lightGeo = new THREE.SphereGeometry(0.05, 8, 8);
                const lightMat = new THREE.MeshStandardMaterial({
                    color: 0x00ff00,
                    emissive: 0x00ff00,
                    emissiveIntensity: 0.8
                });
                const light = new THREE.Mesh(lightGeo, lightMat);
                light.position.set(0.2, 0.8, 0.21);
                group.add(light);

                return { mesh: group, height: 1 };
            },
            spawnChance: 0.25,
            minPerRoom: 0,
            maxPerRoom: 2,
            wallOnly: true
        },
        {
            name: 'concrete_barrier',
            create: () => {
                const group = new THREE.Group();

                // Barrier
                const geo = new THREE.BoxGeometry(0.6, 1.2, 0.3);
                const mat = new THREE.MeshStandardMaterial({
                    color: 0x6a6a6a,
                    roughness: 0.95
                });
                const barrier = new THREE.Mesh(geo, mat);
                group.add(barrier);

                // Yellow/black warning stripes
                for (let i = 0; i < 3; i++) {
                    const stripeGeo = new THREE.BoxGeometry(0.61, 0.15, 0.31);
                    const stripeMat = new THREE.MeshStandardMaterial({
                        color: i % 2 === 0 ? 0xffcc00 : 0x000000
                    });
                    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
                    stripe.position.y = -0.4 + i * 0.4;
                    group.add(stripe);
                }

                return { mesh: group, height: 0.6 };
            },
            spawnChance: 0.3,
            minPerRoom: 0,
            maxPerRoom: 2,
            cornerOnly: true
        },
        {
            name: 'ammo_box',
            create: () => {
                const group = new THREE.Group();

                // Box
                const geo = new THREE.BoxGeometry(0.5, 0.3, 0.4);
                const mat = new THREE.MeshStandardMaterial({
                    color: 0x556B2F,
                    roughness: 0.8
                });
                const box = new THREE.Mesh(geo, mat);
                group.add(box);

                // Ammo symbol (cross)
                const symbolGeo = new THREE.BoxGeometry(0.2, 0.05, 0.01);
                const symbolMat = new THREE.MeshStandardMaterial({
                    color: 0xffffff,
                    emissive: 0x888888,
                    emissiveIntensity: 0.2
                });
                const symbol1 = new THREE.Mesh(symbolGeo, symbolMat);
                symbol1.position.set(0, 0, 0.21);
                const symbol2 = new THREE.Mesh(symbolGeo, symbolMat);
                symbol2.rotation.z = Math.PI / 2;
                symbol2.position.set(0, 0, 0.21);
                group.add(symbol1, symbol2);

                return { mesh: group, height: 0.15 };
            },
            spawnChance: 0.3,
            minPerRoom: 0,
            maxPerRoom: 4
        }
    ]
};
