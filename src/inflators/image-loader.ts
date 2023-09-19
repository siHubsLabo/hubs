import { HubsWorld } from "../app";
import { MediaImageLoaderData } from "../bit-components";
import { AlphaModeName, getAlphaModeFromAlphaModeName } from "../utils/create-image-mesh";
import { ProjectionModeName, getProjectionFromProjectionName } from "../utils/projection-mode";
import { inflateMediaLoader } from "./media-loader";

export interface ImageLoaderParams {
  src: string;
  projection: ProjectionModeName;
  alphaMode: AlphaModeName;
  alphaCutoff: number;
  linkSrc?: string;
  controls: true;
}

const DEFAULTS: Partial<ImageLoaderParams> = {
  projection: ProjectionModeName.FLAT,
  alphaMode: AlphaModeName.OPAQUE,
  alphaCutoff: 0.5
};

export function inflateImageLoader(world: HubsWorld, eid: number, params: ImageLoaderParams) {
  inflateMediaLoader(world, eid, {
    src: params.src,
    recenter: false,
    resize: false,
    animateLoad: false,
    isObjectMenuTarget: params.linkSrc && params.controls ? true : false,
    linkSrc: params.controls ? params.linkSrc : undefined
  });

  const requiredParams = Object.assign({}, DEFAULTS, params) as Required<ImageLoaderParams>;
  MediaImageLoaderData.set(eid, {
    alphaCutoff: requiredParams.alphaCutoff,
    // This inflator is glTF inflator. alphaMode and projection are
    // passed as strings from glTF. They are different typed, just regular enum,
    // in Hubs Client internal. So needs to convert here.
    alphaMode: getAlphaModeFromAlphaModeName(requiredParams.alphaMode),
    projection: getProjectionFromProjectionName(requiredParams.projection)
  });
}
