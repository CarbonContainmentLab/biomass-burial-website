/**
 * Wildfire hazard fragment shader.
 *
 * Five discrete classes, not a stretch (03 §11). The classified 1 km raster is
 * what the pipeline shipped; interpolating between "moderate" and "high" would
 * invent a hazard level the source does not have.
 *
 * Class 0 is nodata — non-burnable ground and open water — and is written
 * transparent, so the terrain shows through rather than a grey wash over every
 * lake. As in `depth.frag`, transparent rather than `discard`: same image, and it
 * keeps the GPU on its fast fragment path.
 *
 * Colours come from a 5 x 1 lookup texture read with `texelFetch`, so each class
 * is its exact token value with no sampling error.
 */

export const WHP_FRAGMENT_SHADER = `\
#version 300 es
#define SHADER_NAME whp-fragment-shader

precision highp float;

uniform sampler2D whpData;
uniform sampler2D whpClassTex;

in vec2 vTexCoord;
in vec2 vTexPos;

out vec4 fragColor;

void main(void) {
  // r8unorm gives class/255; recover the integer with a rounded multiply.
  float cls = floor(texture(whpData, vTexCoord).r * 255.0 + 0.5);
  float shown = step(1.0, cls) * (1.0 - step(6.0, cls));

  int index = int(clamp(cls, 1.0, 5.0)) - 1;
  vec3 color = texelFetch(whpClassTex, ivec2(index, 0), 0).rgb;

  fragColor = vec4(color, whp.alpha * layer.opacity * shown);

  geometry.uv = vTexCoord;
  DECKGL_FILTER_COLOR(fragColor, geometry);
}
`;
