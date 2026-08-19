/**
 * Wildfire hazard potential: a classified 1 km raster, not a county choropleth
 * (03 §0). The paper's own figure is per-county; the raster is the honest
 * rendering of a layer that varies within a county.
 *
 * Same `BitmapLayer` subclass pattern as `depth.ts` — see the note there about
 * keeping the base vertex shader and therefore the `bitmap` uniform block.
 *
 * Opacity 0.85 so depth stays readable when both rasters are on. 03 §10 prefers
 * this to a user-facing opacity slider, and it is the right call: an opacity
 * control is a GIS affordance for an audience that has not asked for one.
 */

import type { DefaultProps, LayerContext, UpdateParameters } from '@deck.gl/core';
import { BitmapLayer, type BitmapLayerProps } from '@deck.gl/layers';
import type { Texture } from '@luma.gl/core';

import { createClassTexture, createRasterTexture, type RasterGrid } from '../../data/textures';
import { WHP_CLASS_COLORS } from '../palette';
import { WHP_FRAGMENT_SHADER } from '../shaders/whp.frag.glsl';

const WHP_ALPHA = 0.85;

const whpUniforms = {
  name: 'whp',
  fs: `\
layout(std140) uniform whpUniforms {
  float alpha;
} whp;
`,
  uniformTypes: {
    alpha: 'f32',
  },
} as const;

interface WhpExtraProps {
  grid: RasterGrid | null;
}

/** See the note in `depth.ts`: extra state keys are read through one cast. */
interface WhpGpuState {
  dataTexture?: Texture | null;
  classTexture?: Texture | null;
}

class WhpSurfaceLayer extends BitmapLayer<WhpExtraProps> {
  static override layerName = 'WhpSurfaceLayer';
  static override defaultProps: DefaultProps<BitmapLayerProps & WhpExtraProps> = {
    ...BitmapLayer.defaultProps,
    grid: { type: 'object', value: null, compare: false },
  };

  override getShaders() {
    const shaders = super.getShaders();
    return {
      ...shaders,
      fs: WHP_FRAGMENT_SHADER,
      modules: [...shaders.modules, whpUniforms],
    };
  }

  private get gpu(): WhpGpuState {
    return this.state as unknown as WhpGpuState;
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
    if (!this.gpu.classTexture) {
      this.setState({ classTexture: createClassTexture(this.context.device, WHP_CLASS_COLORS) });
    }
  }

  override finalizeState(context: LayerContext) {
    this.gpu.dataTexture?.destroy();
    this.gpu.classTexture?.destroy();
    super.finalizeState(context);
  }

  override draw() {
    const model = this.state.model;
    const { dataTexture, classTexture } = this.gpu;
    if (!model || !dataTexture || !classTexture) return;

    model.shaderInputs.setProps({
      bitmap: {
        bounds: this.state.bounds,
        coordinateConversion: this.state.coordinateConversion,
        desaturate: 0,
        tintColor: [1, 1, 1],
        transparentColor: [0, 0, 0, 0],
      },
      whp: {
        whpData: dataTexture,
        whpClassTex: classTexture,
        alpha: WHP_ALPHA,
      },
    });
    model.draw(this.context.renderPass);
  }
}

export function whpLayer(grid: RasterGrid | null): WhpSurfaceLayer | null {
  if (!grid) return null;

  return new WhpSurfaceLayer({
    id: 'whp',
    grid,
    bounds: grid.bounds,
    pickable: false,
  });
}
