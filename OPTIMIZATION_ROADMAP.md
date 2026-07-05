# ROADMAP D'OPTIMISATIONS (PRODUCTION READY)

Ce document est destiné aux développeurs et futures IA qui interviendront sur le code. Le jeu a subi une passe d'optimisation majeure, mais pour atteindre un standard de qualité "AAA" ou "Production Ready" (notamment pour du mobile ou des plateformes limitées), les chantiers suivants doivent être priorisés.

## 1. Zero-Allocation Math (Priorité: Critique)
Dans Three.js, l'instanciation de vecteurs (`new THREE.Vector3()`) et le clonage (`.clone()`) à l'intérieur des boucles `update(dt)` sont strictement interdits en production. Cela force le Garbage Collector (GC) de V8 à tourner constamment, causant des micro-freezes.

**À Faire :**
- **Fichiers cibles** : `EnemyAI.js`, `BossSentinel.js`, `Pickup.js`, `Player.js`.
- **Solution** : Déclarer des vecteurs temporaires globaux en haut des fichiers ou comme propriétés statiques des classes.
```javascript
// Exemple de bonne pratique
const _tempPos = new THREE.Vector3();
const _tempDir = new THREE.Vector3();

class Enemy {
    update(dt) {
        // MAUVAIS : const dir = new THREE.Vector3().subVectors(A, B);
        // BON : _tempDir.subVectors(A, B);
    }
}
```

## 2. Object Pooling (Priorité: Haute)
Actuellement, le jeu instancie dynamiquement les objets éphémères (`new Projectile()`, `new FloatingText()`, `new Pickup()`).

**À Faire :**
- Implémenter une classe `ObjectPool<T>`.
- Au lieu d'utiliser `this.entityManager.add(new Projectile(...))`, utiliser `pool.get().init(...)`.
- Au lieu de `scene.remove(...)` et de détruire l'entité, utiliser `pool.release(entity)` qui masque le mesh (`visible = false`) et réinitialise ses variables.

## 3. Optimisation de la Génération (Priorité: Moyenne)
Dans `LevelManager.js`, les murs (`walls`) utilisent déjà `THREE.InstancedMesh`, ce qui est parfait. Cependant, d'autres éléments lourds ne l'utilisent pas.

**À Faire :**
- Convertir les générateurs de **Ponts** (Bridges) pour qu'ils fusionnent leurs géométries ou utilisent `InstancedMesh`. Actuellement, chaque planche de pont est un Mesh indépendant.
- Les blocs des **Îles Flottantes** devraient idéalement être un seul grand `InstancedMesh` par biome.

## 4. Partitionnement Spatial (Priorité: Basse - pour le scale)
`EntityManager.js` gère les collisions via des boucles imbriquées (O(N*M)). C'est performant jusqu'à ~150 entités actives.

**À Faire :**
- Si le jeu doit inclure des centaines d'ennemis ou de projectiles simultanés, implémenter une grille spatiale (Spatial Hash Grid) ou un QuadTree.
- Actuellement, le jeu tourne parfaitement avec les boucles natives, cette optimisation n'est donc nécessaire que pour des modes de jeu extrêmes (ex: mode Survie avec 500 mobs).

---
*Note: Les freezes causés par la recompilation des shaders (retrait dynamique de PointLight) et par l'instanciation asynchrone des matériaux d'explosion ont été corrigés.*
