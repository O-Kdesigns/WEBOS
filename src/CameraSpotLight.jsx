import React, { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function CameraSpotLight({ appConfig }) {
  const spotRef = useRef();
  const [targetObj] = useState(() => new THREE.Object3D());
  const smoothPointer = useRef(new THREE.Vector2(0, 0));

  const cfg = appConfig?.cameraSpotLight || {};
  const enabled = cfg.enabled ?? true;
  const intensity = cfg.intensity ?? 25;
  const color = cfg.color || '#ffffff';
  const angle = cfg.angle ?? 0.85;
  const penumbra = cfg.penumbra ?? 0.85;
  const distance = cfg.distance ?? 0;
  const decay = cfg.decay ?? 0;
  const mouseOffset = cfg.mouseOffset ?? 1.5;

  useEffect(() => {
    if (spotRef.current && targetObj) {
      spotRef.current.target = targetObj;
    }
  }, [targetObj, enabled]);

  // Reusable pomocné objekty pro eliminaci garbage collection (žádný allocation lag v useFrame)
  const camPos = useRef(new THREE.Vector3());
  const camQuat = useRef(new THREE.Quaternion());
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const up = useRef(new THREE.Vector3());
  const targetPos = useRef(new THREE.Vector3());

  useFrame((state, delta) => {
    if (!spotRef.current || !targetObj || !enabled) return;

    const safeDelta = Math.min(Math.max(delta, 0), 0.1);
    const camera = state.camera;

    // Plynulé vyhlazení pozice myši (-1 až 1)
    const pointerX = state.pointer?.x ?? 0;
    const pointerY = state.pointer?.y ?? 0;

    smoothPointer.current.x = THREE.MathUtils.damp(
      smoothPointer.current.x,
      pointerX,
      4.0,
      safeDelta
    );
    smoothPointer.current.y = THREE.MathUtils.damp(
      smoothPointer.current.y,
      pointerY,
      4.0,
      safeDelta
    );

    camera.getWorldPosition(camPos.current);
    camera.getWorldQuaternion(camQuat.current);

    // Směrové vektory z orientace kamery
    forward.current.set(0, 0, -1).applyQuaternion(camQuat.current);
    right.current.set(1, 0, 0).applyQuaternion(camQuat.current);
    up.current.set(0, 1, 0).applyQuaternion(camQuat.current);

    // Pozice světla: přesně na kameře (lehce předsazeno dopředu)
    spotRef.current.position.copy(camPos.current).addScaledVector(forward.current, 0.1);

    // Cíl míří dopředu do středu zorného pole s mírným offsetem od myši
    const targetDist = 18.0;
    targetPos.current.copy(camPos.current)
      .addScaledVector(forward.current, targetDist)
      .addScaledVector(right.current, smoothPointer.current.x * mouseOffset)
      .addScaledVector(up.current, smoothPointer.current.y * mouseOffset);

    targetObj.position.copy(targetPos.current);
    targetObj.updateMatrixWorld();
  });

  if (!enabled) return null;

  return (
    <>
      <primitive object={targetObj} />
      <spotLight
        ref={spotRef}
        target={targetObj}
        color={color}
        intensity={intensity}
        angle={angle}
        penumbra={penumbra}
        distance={distance}
        decay={decay}
      />
    </>
  );
}
