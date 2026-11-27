import * as THREE from 'three';
import { TextureGenerator } from './TextureGenerator.js';

// Hides the repetition of the level's tiled textures, in the shader, at no draw call (ART_DIRECTION.md, section 6):
// - every walkable top (the floor, the tops of walls, ramps) shows the biome's ground in world space, one tile per
//   4 m, its own tiling broken by a copy of itself turned a quarter in patches of a few metres, and the biome's
//   second ground in patches of about ten metres. Patches are blended by height: where one fades, the higher
//   surface shows, so slabs and pebbles stay whole;
// - wall faces keep their masonry, each instance mirrored or not by a hash of its position (twice the variants),
//   grime darkening the foot of the ground floor's walls;
// - on everything, a tone and a weathering tint drift over tens of metres: no two copies of a texture look alike.

// Multipliers (linear) of the weathered patches, per biome
const TINTS = {
    forest: [0.7, 0.95, 0.55], // Moss
    city: [0.7, 0.66, 0.6], // Soot
    cave: [0.7, 0.8, 1.0], // Mineral bloom
    hell: [0.62, 0.5, 0.44] // Char
};
let noise = null; // Shared by every biome: made once

const VERTEX_PARS = /* glsl */`
varying vec3 vWeatherPos;
varying float vWeatherUp;
`;

const UV_VERTEX = /* glsl */`
vec2 weatherUv = uv;
#ifdef USE_INSTANCING
	if ( fract( sin( dot( instanceMatrix[ 3 ].xyz, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 ) > 0.5 ) weatherUv.x = 1.0 - weatherUv.x;
#endif
#undef MAP_UV
#define MAP_UV weatherUv
#undef BUMPMAP_UV
#define BUMPMAP_UV weatherUv
#undef EMISSIVEMAP_UV
#define EMISSIVEMAP_UV weatherUv
#include <uv_vertex>
`;

const POSITION_VERTEX = /* glsl */`
vec4 weatherWorld = vec4( transformed, 1.0 );
vec3 weatherNormal = objectNormal;
#ifdef USE_INSTANCING
	weatherWorld = instanceMatrix * weatherWorld;
	weatherNormal = mat3( instanceMatrix ) * weatherNormal;
#endif
vWeatherPos = ( modelMatrix * weatherWorld ).xyz;
vWeatherUp = abs( normalize( mat3( modelMatrix ) * weatherNormal ).y );
`;

const FRAGMENT_PARS = /* glsl */`
uniform sampler2D weatherNoise;
uniform vec3 weatherTint;
varying vec3 vWeatherPos;
varying float vWeatherUp;
`;

// In place of the bump map's dHdxy_fwd (bumpMap is declared just before). Textures are read with the pixel's own
// gradients: a read inside a branch has no reliable ones.
const GROUND_PARS = /* glsl */`
uniform sampler2D weatherGroundMap;
uniform sampler2D weatherGroundBump;
uniform sampler2D weatherAltMap;
uniform sampler2D weatherAltBump;
#ifdef WEATHER_GROUND_GLOW
	uniform sampler2D weatherGroundGlow;
#endif
bool weatherTop; // This pixel shows the ground
vec2 weatherUv; // Ground coordinates, in world space
float weatherSelf; // The turned copy's patch here: 0 or 1 away from the patch edges
float weatherMask; // Same for the second ground
float weatherS; // Share of the turned copy in this pixel
float weatherW; // Share of the second ground in this pixel
const mat2 WEATHER_TURN = mat2( 0.0, -1.0, 1.0, 0.0 );
const mat2 WEATHER_ALT = mat2( 0.88, -0.48, 0.48, 0.88 ) * 1.13; // Turned and scaled: the two tilings never line up
vec2 weatherTurnUv( vec2 uv ) { return WEATHER_TURN * uv + vec2( 0.5, 0.25 ); }
vec2 weatherAltUv( vec2 uv ) { return WEATHER_ALT * uv + vec2( 0.37, 0.71 ); }
float weatherBlend( float h1, float h2, float mask ) { return smoothstep( -0.08, 0.08, ( h2 + mask ) - ( h1 + 1.0 - mask ) ); }

// The first ground's height, blended with its turned copy; s: the copy's share
float weatherFirst( vec2 uv, vec2 gx, vec2 gy, out float s ) {
	s = 0.0;
	if ( weatherSelf <= 0.0 ) return textureGrad( weatherGroundBump, uv, gx, gy ).x;
	float hb = textureGrad( weatherGroundBump, weatherTurnUv( uv ), WEATHER_TURN * gx, WEATHER_TURN * gy ).x;
	s = 1.0;
	if ( weatherSelf >= 1.0 ) return hb;
	float ha = textureGrad( weatherGroundBump, uv, gx, gy ).x;
	s = weatherBlend( ha, hb, weatherSelf );
	return mix( ha, hb, s );
}

float weatherGroundHeight( vec2 uv, vec2 gx, vec2 gy ) {
	float h2 = weatherMask > 0.0 ? textureGrad( weatherAltBump, weatherAltUv( uv ), WEATHER_ALT * gx, WEATHER_ALT * gy ).x : 0.0;
	if ( weatherMask >= 1.0 ) return h2;
	float s;
	float h1 = weatherFirst( uv, gx, gy, s );
	return weatherMask <= 0.0 ? h1 : mix( h1, h2, weatherBlend( h1, h2, weatherMask ) );
}

vec2 dHdxy_fwd() {
	vec2 gx = dFdx( weatherUv );
	vec2 gy = dFdy( weatherUv );
	vec2 dSTdx = dFdx( vBumpMapUv );
	vec2 dSTdy = dFdy( vBumpMapUv );
	if ( weatherTop ) {
		float H = weatherGroundHeight( weatherUv, gx, gy );
		return bumpScale * vec2( weatherGroundHeight( weatherUv + gx, gx, gy ) - H, weatherGroundHeight( weatherUv + gy, gx, gy ) - H );
	}
	float Hll = textureGrad( bumpMap, vBumpMapUv, dSTdx, dSTdy ).x;
	return bumpScale * vec2( textureGrad( bumpMap, vBumpMapUv + dSTdx, dSTdx, dSTdy ).x - Hll, textureGrad( bumpMap, vBumpMapUv + dSTdy, dSTdx, dSTdy ).x - Hll );
}
`;

const MAP_FRAGMENT = /* glsl */`
#ifdef WEATHER_FLOOR
	weatherTop = true;
#else
	weatherTop = vWeatherUp > 0.5; // Wall tops and ramps
#endif
weatherUv = vWeatherPos.xz / 4.0;
vec2 weatherGx = dFdx( weatherUv );
vec2 weatherGy = dFdy( weatherUv );
vec2 weatherMx = dFdx( vMapUv );
vec2 weatherMy = dFdy( vMapUv );
weatherSelf = 0.0;
weatherMask = 0.0;
weatherS = 0.0;
weatherW = 0.0;
vec4 sampledDiffuseColor = vec4( 0.0 );
if ( weatherTop ) {
	weatherSelf = smoothstep( 0.4, 0.6, textureLod( weatherNoise, vWeatherPos.zx / 7.3, 0.0 ).r );
	weatherMask = smoothstep( 0.45, 0.65, textureLod( weatherNoise, vWeatherPos.xz / 31.0, 0.0 ).b );
	weatherW = 1.0;
	if ( weatherMask < 1.0 ) {
		float h1 = weatherFirst( weatherUv, weatherGx, weatherGy, weatherS );
		if ( weatherS < 1.0 ) sampledDiffuseColor = textureGrad( weatherGroundMap, weatherUv, weatherGx, weatherGy ) * ( 1.0 - weatherS );
		if ( weatherS > 0.0 ) sampledDiffuseColor += textureGrad( weatherGroundMap, weatherTurnUv( weatherUv ), WEATHER_TURN * weatherGx, WEATHER_TURN * weatherGy ) * weatherS;
		weatherW = weatherMask > 0.0 ? weatherBlend( h1, textureGrad( weatherAltBump, weatherAltUv( weatherUv ), WEATHER_ALT * weatherGx, WEATHER_ALT * weatherGy ).x, weatherMask ) : 0.0;
	}
	if ( weatherW > 0.0 ) sampledDiffuseColor = mix( sampledDiffuseColor, textureGrad( weatherAltMap, weatherAltUv( weatherUv ), WEATHER_ALT * weatherGx, WEATHER_ALT * weatherGy ), weatherW );
} else {
	sampledDiffuseColor = textureGrad( map, vMapUv, weatherMx, weatherMy );
}
diffuseColor *= sampledDiffuseColor;

// Tone and weathering in world space (the height shifts the lookup, so walls vary up their faces too), then grime
float weatherTone = texture2D( weatherNoise, ( vWeatherPos.xz + vWeatherPos.y * vec2( 0.37, 0.61 ) ) / 23.0 ).r;
float weatherAge = smoothstep( 0.5, 0.8, texture2D( weatherNoise, ( vWeatherPos.zx - vWeatherPos.y * vec2( 0.53, 0.29 ) ) / 17.0 ).g );
diffuseColor.rgb *= ( 0.84 + 0.32 * weatherTone ) * mix( vec3( 1.0 ), weatherTint, weatherAge );
diffuseColor.rgb *= mix( 1.0, 0.62 + 0.38 * smoothstep( 0.0, 1.5, vWeatherPos.y ), 1.0 - vWeatherUp );
`;

// The ground's glow (lava, crystals) follows its blend, and none shows through the second ground
const EMISSIVE_FRAGMENT = /* glsl */`
#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = vec4( 0.0 );
	if ( weatherTop ) {
		#ifdef WEATHER_GROUND_GLOW
			emissiveColor = mix( textureGrad( weatherGroundGlow, weatherUv, weatherGx, weatherGy ), textureGrad( weatherGroundGlow, weatherTurnUv( weatherUv ), WEATHER_TURN * weatherGx, WEATHER_TURN * weatherGy ), weatherS ) * ( 1.0 - weatherW );
		#endif
	} else {
		emissiveColor = textureGrad( emissiveMap, vEmissiveMapUv, weatherMx, weatherMy );
	}
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif
`;

/**
 * Weathers a level surface of `biome`: a wall (also its top and the ramps), or the floor (`floor`). `ground`: the
 * biome's grounds, { map, bumpMap, emissiveMap } of the floor tile and { altMap, altBump } of the second ground;
 * the latter are kept in userData.weatherMaps for ThemeKit to dispose.
 */
export function weather(material, biome, ground, floor = false) {
    noise ??= TextureGenerator.toTexture(TextureGenerator.weatherCanvas(), { color: false });
    const tint = new THREE.Vector3(...(TINTS[biome] || [1, 1, 1]));
    material.defines = { ...material.defines };
    if (floor) material.defines.WEATHER_FLOOR = '';
    if (ground.emissiveMap) material.defines.WEATHER_GROUND_GLOW = '';
    material.userData.weatherMaps = [ground.altMap, ground.altBump];
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, {
            weatherNoise: { value: noise },
            weatherTint: { value: tint },
            weatherGroundMap: { value: ground.map },
            weatherGroundBump: { value: ground.bumpMap },
            weatherGroundGlow: { value: ground.emissiveMap },
            weatherAltMap: { value: ground.altMap },
            weatherAltBump: { value: ground.altBump }
        });
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
            .replace('#include <uv_vertex>', UV_VERTEX)
            .replace('#include <project_vertex>', `#include <project_vertex>\n${POSITION_VERTEX}`);
        const chunk = THREE.ShaderChunk.bumpmap_pars_fragment;
        const bump = chunk.slice(0, chunk.indexOf('vec2 dHdxy_fwd()')) + GROUND_PARS + chunk.slice(chunk.indexOf('vec3 perturbNormalArb'));
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
            .replace('#include <bumpmap_pars_fragment>', bump)
            .replace('#include <map_fragment>', MAP_FRAGMENT)
            .replace('#include <emissivemap_fragment>', EMISSIVE_FRAGMENT);
    };
    material.customProgramCacheKey = () => 'weather';
    return material;
}
