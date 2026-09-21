import React from 'react';
import { StandardParticleObject } from './StandardParticleObject';
import { CustomParticleObject } from './CustomParticleObject';
import { GeometryParticleObject } from './GeometryParticleObject';

export function ParticleObject({ settings, appConfig, videoTexture, opacity, renderOrder = 0, rotationY, pageDistance }) {
  if (!settings?.hasParticles) return null;
  
  if (settings.shape === 'custom' && settings.customModel) {
    return <CustomParticleObject settings={settings} appConfig={appConfig} videoTexture={videoTexture} opacity={opacity} renderOrder={renderOrder} rotationY={rotationY} pageDistance={pageDistance} />;
  }

  if (settings.shape === 'geometry' && settings.customGeometry) {
    return <GeometryParticleObject settings={settings} appConfig={appConfig} videoTexture={videoTexture} opacity={opacity} renderOrder={renderOrder} rotationY={rotationY} pageDistance={pageDistance} />;
  }
  
  return <StandardParticleObject settings={settings} appConfig={appConfig} videoTexture={videoTexture} opacity={opacity} renderOrder={renderOrder} rotationY={rotationY} pageDistance={pageDistance} />;
}
