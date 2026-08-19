/**
 * Depth fragment shader.
 *
 * Kept as a `.ts` export rather than a `.glsl` file so it needs no Vite plugin
 * and the sentinel constants can be interpolated from `data/textures.ts` rather
 * than retyped here.
 *
 * The whole filtering rule is two comparisons:
 *
 *   cm < 1              nodata (0 after unpacking: the pipeline's 65535 sentinel
 *                       becomes 0 only if it were stored, so see below)
 *   cm > maxDepthCm     excluded — either the user's threshold, or the 65534
 *                       "deeper than the display ceiling" sentinel, or the 65535
 *                       nodata sentinel, all of which exceed any slider value
 *
 * The 65534 sentinel deserves a note. The pipeline could have clamped
 * over-ceiling pixels to 1000 cm, which would have painted a spot needing 47 m of
 * cover the same navy as one needing exactly 10 m. It shipped a distinct sentinel
 * instead, and because that sentinel is larger than any slider value it lands in
 * the excluded branch for free.
 *
 * **No `discard`.** Excluded pixels are written as fully transparent instead.
 * The image is identical — deck.gl blends src-alpha over the terrain, so alpha 0
 * contributes nothing — but `discard` forces the GPU off its fast fragment path,
 * and 72% of this texture is nodata. On integrated graphics that cost is the
 * difference between a smooth pan and a visibly stuttering one.
 *
 * Depth arrives as two unorm bytes rather than one float: see the format note in
 * `data/textures.ts`. `floor(x * 255 + 0.5)` recovers each byte exactly.
 */

export const DEPTH_FRAGMENT_SHADER = `\
#version 300 es
#define SHADER_NAME depth-surface-fragment-shader

precision highp float;

uniform sampler2D depthData;
uniform sampler2D depthRampTex;

in vec2 vTexCoord;
in vec2 vTexPos;

out vec4 fragColor;

void main(void) {
  vec2 packed = texture(depthData, vTexCoord).rg;
  float cm = floor(packed.r * 255.0 + 0.5) + floor(packed.g * 255.0 + 0.5) * 256.0;

  // Nodata, over-ceiling and user-filtered pixels all fall through to the
  // terrain beneath. Nothing is hatched: 57% of the study area is masked, and
  // hatching that much of the map would bury the layer it explains.
  float shown = step(1.0, cm) * (1.0 - step(depthRamp.maxDepthCm + 0.5, cm));

  float t = clamp(cm / depthRamp.displayMaxCm, 0.0, 1.0);
  vec3 color = texture(depthRampTex, vec2(t, 0.5)).rgb;

  fragColor = vec4(color, depthRamp.alpha * layer.opacity * shown);

  geometry.uv = vTexCoord;
  DECKGL_FILTER_COLOR(fragColor, geometry);
}
`;
