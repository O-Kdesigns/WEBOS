import { useState, useEffect } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export function useEditorState(pages, setPages, appConfig, setAppConfig) {
  const updatePage = (id, field, value) => {
    setPages(pages.map(p => p.id === id ? { ...p, [field]: value } : p));
  };


  const updateParticlesSettings = (id, field, value) => {
    setPages(pages.map(p => {
      if (p.id === id) {
        return {
          ...p,
          particlesSettings: {
            ...(p.particlesSettings || {}),
            [field]: value
          }
        };
      }
      return p;
    }));
  };

  const updateConfig = (field, value) => {
    setAppConfig({ ...appConfig, [field]: value });
  };

  const updateVolumetric = (field, value) => {
    setAppConfig({
      ...appConfig,
      volumetricLight: {
        ...(appConfig.volumetricLight || {}),
        [field]: value
      }
    });
  };

  const updateInsideFog = (field, value) => {
    setAppConfig({
      ...appConfig,
      insideFog: {
        ...(appConfig.insideFog || {}),
        [field]: value
      }
    });
  };

  const updateCameraSpotLight = (field, value) => {
    setAppConfig({
      ...appConfig,
      cameraSpotLight: {
        ...(appConfig.cameraSpotLight || {}),
        [field]: value
      }
    });
  };

  const updateBackground = (field, value) => {
    setAppConfig({
      ...appConfig,
      backgroundSettings: {
        ...(appConfig.backgroundSettings || {}),
        [field]: value
      }
    });
  };

  const updatePhysics = (field, value) => {
    setAppConfig({
      ...appConfig,
      physics: {
        ...(appConfig.physics || {}),
        [field]: value
      }
    });
  };

  const updateParticlePhysics = (field, value) => {
    setAppConfig({
      ...appConfig,
      particlePhysics: {
        ...(appConfig.particlePhysics || {}),
        [field]: value
      }
    });
  };

  const updateCylinderSettings = (field, value) => {
    setAppConfig({
      ...appConfig,
      cylinderSettings: {
        ...(appConfig.cylinderSettings || {}),
        [field]: value
      }
    });
  };

  const updatePowerSaving = (field, value) => {
    setAppConfig({
      ...appConfig,
      powerSaving: {
        ...(appConfig.powerSaving || {}),
        [field]: value
      }
    });
  };

  const updateVolumetricVideo = (field, value) => {
    setAppConfig({
      ...appConfig,
      volumetricVideo: {
        ...(appConfig.volumetricVideo || {}),
        [field]: value
      }
    });
  };

  const updateVolumetricDepth = (field, value) => {
    setAppConfig({
      ...appConfig,
      volumetricDepth: {
        ...(appConfig.volumetricDepth || {}),
        [field]: value
      }
    });
  };

  const updateUi2d = (field, value) => {
    setAppConfig({
      ...appConfig,
      ui2d: {
        ...(appConfig.ui2d || {}),
        [field]: value
      }
    });
  };

  const updateUi2dBottomLeft = (field, value) => {
    setAppConfig({
      ...appConfig,
      ui2d: {
        ...(appConfig.ui2d || {}),
        bottomLeft: {
          ...(appConfig.ui2d?.bottomLeft || {}),
          [field]: value
        }
      }
    });
  };

  const updateUi2dBottomLeftItem = (index, field, value) => {
    const currentItems = [...(appConfig.ui2d?.bottomLeft?.items || [])];
    if (currentItems[index]) {
      currentItems[index] = { ...currentItems[index], [field]: value };
      updateUi2dBottomLeft('items', currentItems);
    }
  };

  const addUi2dBottomLeftItem = () => {
    const currentItems = [...(appConfig.ui2d?.bottomLeft?.items || [])];
    currentItems.push({
      id: Date.now().toString(),
      text: 'NOVÝ ŘÁDEK',
      link: '',
      bullet: appConfig.ui2d?.bottomLeft?.defaultBullet || '->',
      dimmed: false
    });
    updateUi2dBottomLeft('items', currentItems);
  };

  const removeUi2dBottomLeftItem = (index) => {
    const currentItems = [...(appConfig.ui2d?.bottomLeft?.items || [])];
    currentItems.splice(index, 1);
    updateUi2dBottomLeft('items', currentItems);
  };

  const updateUi2dPillButton = (field, value) => {
    setAppConfig({
      ...appConfig,
      ui2d: {
        ...(appConfig.ui2d || {}),
        bottomLeft: {
          ...(appConfig.ui2d?.bottomLeft || {}),
          pillButton: {
            ...(appConfig.ui2d?.bottomLeft?.pillButton || {}),
            [field]: value
          }
        }
      }
    });
  };

  const addPage = () => {
    setPages([...pages, {
      id: Date.now().toString(),
      title: "Nová stránka",
      description: "",
      travaSettings: {
        surfaceModel: "",
        surfaceMode: "color",
        surfaceTexture: "",
        surfaceColor: "#4d9900",
        hasBasicGrass: false
      },
      image: "",
      color: "#ffffff"
    }]);
  };

  const deletePage = (id) => {
    setPages(pages.filter(p => p.id !== id));
  };

  const getFilteredAssets = (list, prefix) => list.filter(f => f.startsWith(prefix));

  return {
    updatePage,
    updateParticlesSettings,
    updateConfig,
    updateVolumetric,
    updateInsideFog,
    updateCameraSpotLight,
    updateBackground,
    updatePhysics,
    updateParticlePhysics,
    updateCylinderSettings,
    updatePowerSaving,
    updateVolumetricVideo,
    updateVolumetricDepth,
    updateUi2d,
    updateUi2dBottomLeft,
    updateUi2dBottomLeftItem,
    addUi2dBottomLeftItem,
    removeUi2dBottomLeftItem,
    updateUi2dPillButton,
    addPage,
    deletePage,
    getFilteredAssets
  };
}
