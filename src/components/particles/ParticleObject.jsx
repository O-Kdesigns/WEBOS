import React from 'react';
import { StandardParticleObject } from './StandardParticleObject';
import { CustomParticleObject } from './CustomParticleObject';
import { GeometryParticleObject } from './GeometryParticleObject';

export function ParticleObject({ settings, appConfig, videoTexture, opacity, renderOrder = 0, rotationY, pageDistance, transitionProgress, dnaGeometry, dnaMatrix, nodeMatrix, currentIndex }) {
  if (!settings?.hasParticles) return null;
  
  if (settings.shape === 'custom' && settings.customModel) {
    return <CustomParticleObject settings={settings} appConfig={appConfig} videoTexture={videoTexture} opacity={opacity} renderOrder={renderOrder} rotationY={rotationY} pageDistance={pageDistance} transitionProgress={transitionProgress} dnaGeometry={dnaGeometry} dnaMatrix={dnaMatrix} nodeMatrix={nodeMatrix} currentIndex={currentIndex} />;
  }

  if (settings.shape === 'geometry' && settings.customGeometry) {
    return <GeometryParticleObject settings={settings} appConfig={appConfig} videoTexture={videoTexture} opacity={opacity} renderOrder={renderOrder} rotationY={rotationY} pageDistance={pageDistance} transitionProgress={transitionProgress} dnaGeometry={dnaGeometry} dnaMatrix={dnaMatrix} nodeMatrix={nodeMatrix} currentIndex={currentIndex} />;
  }
  
  return <StandardParticleObject settings={settings} appConfig={appConfig} videoTexture={videoTexture} opacity={opacity} renderOrder={renderOrder} rotationY={rotationY} pageDistance={pageDistance} transitionProgress={transitionProgress} dnaGeometry={dnaGeometry} dnaMatrix={dnaMatrix} nodeMatrix={nodeMatrix} currentIndex={currentIndex} />;
}
