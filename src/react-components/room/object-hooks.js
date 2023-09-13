import { useEffect, useState, useCallback, useMemo } from "react";
import { removeNetworkedObject } from "../../utils/removeNetworkedObject";
import { findAncestorWithComponent, shouldUseNewLoader } from "../../utils/bit-utils";
import { rotateInPlaceAroundWorldUp, affixToWorldUp } from "../../utils/three-utils";
import { getPromotionTokenForFile } from "../../utils/media-utils";
import { hasComponent } from "bitecs";
import { isPinned as isObjectPinned } from "../../bit-systems/networking";
import { isPinned as getPinnedState } from "../../bit-systems/networking";
import { MediaContentBounds, MediaInfo, MediaLoader, Owned, Static } from "../../bit-components";
import { deleteTheDeletableAncestor } from "../../bit-systems/delete-entity-system";
import { setPinned } from "../../utils/bit-pinning-helper";
import { debounce } from "lodash";

export function isMe(object) {
  return object.id === "avatar-rig";
}

export function isPlayer(object) {
  if (shouldUseNewLoader()) {
    // TODO Add when networked avatar is migrated?
    // We don't list players in the objects list so do we need this function at all?
    return false;
  } else {
    return !!object.el.components["networked-avatar"];
  }
}

export function getObjectUrl(object) {
  let url;
  if (shouldUseNewLoader()) {
    const urlSid = MediaInfo.accessibleUrl[object.eid];
    url = APP.getString(urlSid);
  } else {
    const mediaLoader = object.el.components["media-loader"];
    url =
      mediaLoader && ((mediaLoader.data.mediaOptions && mediaLoader.data.mediaOptions.href) || mediaLoader.data.src);
  }

  if (url && !url.startsWith("hubs://")) {
    return url;
  }

  return null;
}

export function usePinObject(hubChannel, scene, object) {
  const [isPinned, setIsPinned] = useState(getPinnedState(object.eid));

  const pinObject = useCallback(() => {
    if (shouldUseNewLoader()) {
      const mediaRootEid = findAncestorWithComponent(APP.world, MediaContentBounds, object.eid);
      setPinned(hubChannel, APP.world, mediaRootEid, true);
    } else {
      const el = object.el;
      if (!NAF.utils.isMine(el) && !NAF.utils.takeOwnership(el)) return;
      window.APP.pinningHelper.setPinned(el, true);
    }
  }, [object, hubChannel]);

  const unpinObject = useCallback(() => {
    if (shouldUseNewLoader()) {
      const mediaRootEid = findAncestorWithComponent(APP.world, MediaContentBounds, object.eid);
      setPinned(hubChannel, APP.world, mediaRootEid, false);
    } else {
      const el = object.el;
      if (!NAF.utils.isMine(el) && !NAF.utils.takeOwnership(el)) return;
      window.APP.pinningHelper.setPinned(el, false);
    }
  }, [object, hubChannel]);

  const _togglePinned = useCallback(() => {
    if (isPinned) {
      unpinObject();
    } else {
      pinObject();
    }
  }, [isPinned, pinObject, unpinObject]);

  const togglePinned = useMemo(() => debounce(_togglePinned, 100), [_togglePinned]);
  useEffect(() => {
    return () => {
      togglePinned.cancel();
    };
  }, [togglePinned]);

  useEffect(() => {
    if (shouldUseNewLoader()) {
      const handler = setInterval(() => {
        const mediaRootEid = findAncestorWithComponent(APP.world, MediaContentBounds, object.eid);
        setIsPinned(isObjectPinned(mediaRootEid));
      }, 100);
      return () => {
        clearInterval(handler);
      };
    }

    const el = object.el;

    function onPinStateChanged() {
      setIsPinned(getPinnedState(el.eid));
    }
    el.addEventListener("pinned", onPinStateChanged);
    el.addEventListener("unpinned", onPinStateChanged);
    setIsPinned(getPinnedState(el.eid));
    return () => {
      el.removeEventListener("pinned", onPinStateChanged);
      el.removeEventListener("unpinned", onPinStateChanged);
    };
  }, [object]);

  let userOwnsFile = false;

  if (shouldUseNewLoader()) {
    const fileId = MediaLoader.fileId[object.eid];
    const mediaRootEid = findAncestorWithComponent(APP.world, MediaContentBounds, object.eid);
    const fileIsOwned = hasComponent(APP.world, Owned, mediaRootEid);
    userOwnsFile = fileIsOwned || (fileId && getPromotionTokenForFile(fileId));
  } else {
    const el = object.el;
    if (el.components["media-loader"]) {
      const { fileIsOwned, fileId } = el.components["media-loader"].data;
      userOwnsFile = fileIsOwned || (fileId && getPromotionTokenForFile(fileId));
    }
  }

  let targetEid;
  if (shouldUseNewLoader()) {
    targetEid = findAncestorWithComponent(APP.world, MediaContentBounds, object.eid);
  } else {
    targetEid = object.el.eid;
  }
  const isStatic = hasComponent(APP.world, Static, targetEid);

  const canPin = !!(
    scene.is("entered") &&
    !isPlayer(object) &&
    !isStatic &&
    hubChannel.can("pin_objects") &&
    userOwnsFile
  );

  return { canPin, isPinned, togglePinned, pinObject, unpinObject };
}

export function useGoToSelectedObject(scene, object) {
  const goToSelectedObject = useCallback(() => {
    const viewingCamera = document.getElementById("viewing-camera");
    const targetMatrix = new THREE.Matrix4();
    const translation = new THREE.Matrix4();
    viewingCamera.object3DMap.camera.updateMatrices();
    targetMatrix.copy(viewingCamera.object3DMap.camera.matrixWorld);
    affixToWorldUp(targetMatrix, targetMatrix);
    translation.makeTranslation(0, -1.6, 0.15);
    targetMatrix.multiply(translation);
    rotateInPlaceAroundWorldUp(targetMatrix, Math.PI, targetMatrix);

    scene.systems["hubs-systems"].characterController.enqueueWaypointTravelTo(targetMatrix, true, {
      willDisableMotion: false,
      willDisableTeleporting: false,
      snapToNavMesh: false,
      willMaintainInitialOrientation: false
    });
  }, [scene]);

  const uiRoot = useMemo(() => document.getElementById("ui-root"), []);
  const isSpectating = uiRoot && uiRoot.firstChild && uiRoot.firstChild.classList.contains("isGhost");
  const canGoTo = !isSpectating && !isPlayer(object);

  return { canGoTo, goToSelectedObject };
}

export function useRemoveObject(hubChannel, scene, object) {
  const removeObject = useCallback(() => {
    if (shouldUseNewLoader()) {
      deleteTheDeletableAncestor(APP.world, object.eid);
    } else {
      removeNetworkedObject(scene, object.el);
    }
  }, [scene, object]);

  const eid = object.eid;

  const canRemoveObject = !!(
    scene.is("entered") &&
    !isPlayer(object) &&
    !getPinnedState(eid) &&
    !hasComponent(APP.world, Static, eid) &&
    hubChannel.can("spawn_and_move_media")
  );

  return { removeObject, canRemoveObject };
}

export function useHideAvatar(hubChannel, avatarEl) {
  const hideAvatar = useCallback(() => {
    if (avatarEl.components.networked) {
      const clientId = avatarEl.components.networked.data.owner;

      if (clientId && clientId !== NAF.clientId) {
        hubChannel.hide(clientId);
      }
    }
  }, [hubChannel, avatarEl]);

  return hideAvatar;
}
