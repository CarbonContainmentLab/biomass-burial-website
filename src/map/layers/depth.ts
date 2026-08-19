/**
 * The depth surface: the layer the page exists to show.
 *
 * A `BitmapLayer` subclass rather than a layer from scratch, because the mesh,
 * the 64-bit position handling and the Mercator projection are all wanted
 * unchanged — only the fragment shader differs. The base vertex shader is kept,
 * which is why the `bitmap` uniform block is still supplied below even though
 * this fragment shader ignores it.
 *
 * The threshold is a uniform. Dragging the soil column writes one float per
 * frame and re-renders; nothing is refetched and no pixel is recoloured on the
 * CPU (03 §10).
 */

import type { DefaultProps, LayerContext, UpdateParameters } from '@deck.gl/core';
import { BitmapLayer, type BitmapLayerProps } from '@deck.gl/layers';
import type { Texture } from '@luma.gl/core';

import { createRampTexture, createRasterTexture, type RasterGrid } from '../../data/textures';
import { mToCm, type Meters } from '../../lib/units';
import { DEPTH_STOPS } from '../palette';
import { DEPTH_FRAGMENT_SHADER } from '../shaders/depth.frag.glsl';

/** The top of the ramp, in centimetres: `display_max_m` is 10 m. */
const DISPLAY_MAX_CM = 1000;

/** Slightly translucent so the terrain reads through, as in the mockup. */
const SURFACE_ALPHA = 0.92;

const depthRampUniforms = {
  name: 'depthRamp',
  fs: `\
layout(std140) uniform depthRampUniforms {
  float maxDepthCm;
  float displayMaxCm;
  float alpha;
} depthRamp;
`,
  uniformTypes: {
    maxDepthCm: 'f32',
    displayMaxCm: 'f32',
    alpha: 'f32',
  },
} as const;

interface DepthExtraProps {
  grid: RasterGrid | null;
  maxDepthCm: number;
}

/**
 * GPU resources this layer owns. deck.gl types `Layer.state` per layer class, so
 * the extra keys are read through one cast rather than by widening the base type.
 */
interface DepthGpuState {
  dataTexture?: Texture | null;
  rampTexture?: Texture | null;
}

class DepthSurfaceLayer extends BitmapLayer<DepthExtraProps> {
  static override layerName = 'DepthSurfaceLayer';
  static override defaultProps: DefaultProps<BitmapLayerProps & DepthExtraProps> = {
    ...BitmapLayer.defaultProps,
    // `compare: false` because the grid is a 19.5 MB typed array: deck.gl would
    // otherwise deep-compare it on every prop update.
    // `compare: false` means reference equality: the grid is a multi-megabyte
    // typed array and deck.gl would otherwise deep-compare it on every update.
    grid: { type: 'object', value: null, compare: false },
    maxDepthCm: { type: 'number', value: DISPLAY_MAX_CM },
  };

  override getShaders() {
    const shaders = super.getShaders();
    return {
      ...shaders,
      fs: DEPTH_FRAGMENT_SHADER,
      modules: [...shaders.modules, depthRampUniforms],
    };
  }

  private get gpu(): DepthGpuState {
    return this.state as unknown as DepthGpuState;
  }

  override updateState(params: UpdateParameters<this>) {
    super.updateState(params);
    const props = this.props;
    const oldProps = params.oldProps as unknown as typeof props;

    if (props.grid !== oldProps.grid) {
      this.gpu.dataTexture?.destroy();
      this.setState({
        dataTexture: props.grid ? createRasterTexture(this.context.device, props.grid) : null,
      });
    }
    if (!this.gpu.rampTexture) {
      this.setState({ rampTexture: createRampTexture(this.context.device, DEPTH_STOPS) });
    }
  }

  override finalizeState(context: LayerContext) {
    this.gpu.dataTexture?.destroy();
    this.gpu.rampTexture?.destroy();
    super.finalizeState(context);
  }

  override draw() {
    const model = this.state.model;
    const { dataTexture, rampTexture } = this.gpu;
    if (!model || !dataTexture || !rampTexture) return;

    model.shaderInputs.setProps({
      // The vertex shader reads `bitmap.coordinateConversion`, so the block has
      // to be populated. `bitmapTexture` is deliberately absent: the replacement
      // fragment shader never declares that sampler.
      bitmap: {
        bounds: this.state.bounds,
        coordinateConversion: this.state.coordinateConversion,
        desaturate: 0,
        tintColor: [1, 1, 1],
        transparentColor: [0, 0, 0, 0],
      },
      depthRamp: {
        depthData: dataTexture,
        depthRampTex: rampTexture,
        maxDepthCm: this.props.maxDepthCm,
        displayMaxCm: DISPLAY_MAX_CM,
        alpha: SURFACE_ALPHA,
      },
    });
    model.draw(this.context.renderPass);
  }
}

export function depthLayer(grid: RasterGrid | null, maxDepth: Meters): DepthSurfaceLayer | null {
  if (!grid) return null;

  return new DepthSurfaceLayer({
    id: 'depth',
    grid,
    maxDepthCm: mToCm(maxDepth) as number,
    bounds: grid.bounds,
    pickable: false,
  });
}
