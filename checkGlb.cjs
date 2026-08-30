import fs from 'fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// to load a glb in node we need a mock polyfill or just use gltf-pipeline or something?
// Actually, it's easier to just read the strings from the binary.
