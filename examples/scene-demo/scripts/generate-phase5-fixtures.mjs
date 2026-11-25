#!/usr/bin/env node

/**
 * Generates two tiny, deterministic, self-contained glTF 2.0 binary fixtures.
 *
 * The files are intentionally authored from procedural geometry and a tiny
 * generated PNG. No model provider, source asset, paid service, or network is
 * used. Run with `--check` to verify checked-in fixtures without rewriting.
 */
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { log } from 'node:console';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { deflateSync } from 'node:zlib';
import { Accessor, Document, NodeIO } from '@gltf-transform/core';

const outputDirectory = fileURLToPath(new URL('../fixtures/model-source/', import.meta.url));
const checkOnly = process.argv.includes('--check');
const io = new NodeIO();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.allocUnsafe(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

function makeTexturePng(primary, secondary) {
  const width = 8;
  const height = 8;
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    scanlines[row] = 0; // PNG filter: None.
    for (let x = 0; x < width; x += 1) {
      const color = (Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0 ? primary : secondary;
      const pixel = row + 1 + x * 4;
      scanlines[pixel] = color[0];
      scanlines[pixel + 1] = color[1];
      scanlines[pixel + 2] = color[2];
      scanlines[pixel + 3] = 255;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  header[10] = 0; // compression
  header[11] = 0; // filter
  header[12] = 0; // no interlace
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function createTexturedMaterial(document, image, name) {
  const texture = document
    .createTexture(`${name} generated checker`)
    .setMimeType('image/png')
    .setImage(image);
  return document
    .createMaterial(`${name} PBR material`)
    .setBaseColorTexture(texture)
    .setBaseColorFactor([1, 1, 1, 1])
    .setMetallicFactor(0)
    .setRoughnessFactor(0.82);
}

function meshData() {
  return {
    positions: [],
    normals: [],
    uvs: [],
    joints: [],
    weights: [],
    indices: [],
  };
}

function addBox(data, bounds, jointIndex = 0) {
  const {
    min: [x0, y0, z0],
    max: [x1, y1, z1],
  } = bounds;
  const faces = [
    {
      normal: [0, 0, 1],
      points: [
        [x0, y0, z1],
        [x1, y0, z1],
        [x1, y1, z1],
        [x0, y1, z1],
      ],
    },
    {
      normal: [0, 0, -1],
      points: [
        [x1, y0, z0],
        [x0, y0, z0],
        [x0, y1, z0],
        [x1, y1, z0],
      ],
    },
    {
      normal: [1, 0, 0],
      points: [
        [x1, y0, z1],
        [x1, y0, z0],
        [x1, y1, z0],
        [x1, y1, z1],
      ],
    },
    {
      normal: [-1, 0, 0],
      points: [
        [x0, y0, z0],
        [x0, y0, z1],
        [x0, y1, z1],
        [x0, y1, z0],
      ],
    },
    {
      normal: [0, 1, 0],
      points: [
        [x0, y1, z1],
        [x1, y1, z1],
        [x1, y1, z0],
        [x0, y1, z0],
      ],
    },
    {
      normal: [0, -1, 0],
      points: [
        [x0, y0, z0],
        [x1, y0, z0],
        [x1, y0, z1],
        [x0, y0, z1],
      ],
    },
  ];
  const faceUvs = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];

  for (const face of faces) {
    const firstVertex = data.positions.length / 3;
    for (let corner = 0; corner < 4; corner += 1) {
      data.positions.push(...face.points[corner]);
      data.normals.push(...face.normal);
      data.uvs.push(...faceUvs[corner]);
      data.joints.push(jointIndex, 0, 0, 0);
      data.weights.push(1, 0, 0, 0);
    }
    data.indices.push(
      firstVertex,
      firstVertex + 1,
      firstVertex + 2,
      firstVertex,
      firstVertex + 2,
      firstVertex + 3,
    );
  }
}

function accessor(document, buffer, name, array, type) {
  return document.createAccessor(name, buffer).setArray(array).setType(type);
}

function addMesh(document, buffer, data, material, { skin = false } = {}) {
  const primitive = document
    .createPrimitive()
    .setAttribute(
      'POSITION',
      accessor(document, buffer, 'positions', new Float32Array(data.positions), Accessor.Type.VEC3),
    )
    .setAttribute(
      'NORMAL',
      accessor(document, buffer, 'normals', new Float32Array(data.normals), Accessor.Type.VEC3),
    )
    .setAttribute(
      'TEXCOORD_0',
      accessor(document, buffer, 'uvs', new Float32Array(data.uvs), Accessor.Type.VEC2),
    )
    .setIndices(
      accessor(document, buffer, 'indices', new Uint16Array(data.indices), Accessor.Type.SCALAR),
    )
    .setMaterial(material);

  if (skin) {
    primitive
      .setAttribute(
        'JOINTS_0',
        accessor(document, buffer, 'joints', new Uint8Array(data.joints), Accessor.Type.VEC4),
      )
      .setAttribute(
        'WEIGHTS_0',
        accessor(document, buffer, 'weights', new Float32Array(data.weights), Accessor.Type.VEC4),
      );
  }

  return document.createMesh('Fixture mesh').addPrimitive(primitive);
}

function finishDocument(document, rootNode, name) {
  document.createScene(name).addChild(rootNode);
  document.getRoot().setDefaultScene(document.getRoot().listScenes()[0]);
}

function createStaticDocument() {
  const document = new Document();
  const buffer = document.createBuffer('static model data');
  const data = meshData();
  addBox(data, { min: [-0.5, 0, -0.25], max: [0.5, 1, 0.25] });
  const material = createTexturedMaterial(
    document,
    makeTexturePng([31, 142, 130], [243, 190, 79]),
    'Static prop',
  );
  const node = document
    .createNode('Textured sample prop')
    .setMesh(addMesh(document, buffer, data, material));
  finishDocument(document, node, 'Static model source');
  return document;
}

function addAnimation(document, name, targetNode, path, type, times, values) {
  const buffer = document.getRoot().listBuffers()[0];
  const input = accessor(
    document,
    buffer,
    `${name} time keys`,
    new Float32Array(times),
    Accessor.Type.SCALAR,
  );
  const output = accessor(document, buffer, `${name} output keys`, new Float32Array(values), type);
  const sampler = document
    .createAnimationSampler(`${name} linear sampler`)
    .setInput(input)
    .setOutput(output)
    .setInterpolation('LINEAR');
  const animation = document.createAnimation(name).addSampler(sampler);
  animation.addChannel(
    document
      .createAnimationChannel(`${name} ${path} channel`)
      .setSampler(sampler)
      .setTargetNode(targetNode)
      .setTargetPath(path),
  );
}

function createRiggedDocument() {
  const document = new Document();
  const buffer = document.createBuffer('rigged model data');
  const data = meshData();
  addBox(data, { min: [-0.28, -0.35, -0.14], max: [0.28, 0.35, 0.14] }, 0);
  addBox(data, { min: [-0.18, 0.35, -0.13], max: [0.18, 0.68, 0.13] }, 0);
  addBox(data, { min: [-0.22, -0.58, -0.12], max: [-0.04, -0.34, 0.12] }, 0);
  addBox(data, { min: [0.04, -0.58, -0.12], max: [0.22, -0.34, 0.12] }, 0);
  addBox(data, { min: [0.28, 0.12, -0.1], max: [0.62, 0.62, 0.1] }, 1);

  const material = createTexturedMaterial(
    document,
    makeTexturePng([39, 92, 162], [238, 184, 86]),
    'Rigged character',
  );
  const rootJoint = document.createNode('Character root joint');
  const shoulderJoint = document.createNode('Right shoulder joint').setTranslation([0.28, 0.42, 0]);
  rootJoint.addChild(shoulderJoint);

  const inverseBindMatrices = accessor(
    document,
    buffer,
    'inverse bind matrices',
    new Float32Array([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -0.28,
      -0.42, 0, 1,
    ]),
    Accessor.Type.MAT4,
  );
  const skin = document
    .createSkin('Character skeleton')
    .setSkeleton(rootJoint)
    .setInverseBindMatrices(inverseBindMatrices)
    .addJoint(rootJoint)
    .addJoint(shoulderJoint);
  const meshNode = document
    .createNode('Rigged character mesh')
    .setMesh(addMesh(document, buffer, data, material, { skin }))
    .setSkin(skin);

  addAnimation(
    document,
    'idle',
    rootJoint,
    'translation',
    Accessor.Type.VEC3,
    [0, 0.5, 1],
    [0, 0, 0, 0, 0.025, 0, 0, 0, 0],
  );
  addAnimation(
    document,
    'move',
    rootJoint,
    'translation',
    Accessor.Type.VEC3,
    [0, 1.25, 2.5],
    [0, 0, 0, 0.07, 0, 0, 0, 0, 0],
  );
  addAnimation(
    document,
    'interact',
    shoulderJoint,
    'rotation',
    Accessor.Type.VEC4,
    [0, 0.5, 1],
    [0, 0, 0, 1, 0.12, 0, 0, 0.9927739, 0, 0, 0, 1],
  );
  addAnimation(
    document,
    'combat',
    shoulderJoint,
    'rotation',
    Accessor.Type.VEC4,
    [0, 0.3, 0.65, 1],
    [0, 0, 0, 1, 0, 0, 0.3428978, 0.9393727, 0, 0, -0.1736482, 0.9848078, 0, 0, 0, 1],
  );

  const scene = document.createScene('Rigged model source').addChild(meshNode).addChild(rootJoint);
  document.getRoot().setDefaultScene(scene);
  return document;
}

function assertTextureIsEmbedded(document, label) {
  const textures = document.getRoot().listTextures();
  if (textures.length === 0) throw new Error(`${label} fixture has no texture.`);
  for (const texture of textures) {
    if (texture.getMimeType() !== 'image/png' || texture.getImage()?.length === 0) {
      throw new Error(`${label} fixture must contain an embedded PNG image.`);
    }
    if (texture.getURI()) throw new Error(`${label} fixture must not reference an external image.`);
  }
  const hasTexturedMaterial = document
    .getRoot()
    .listMaterials()
    .some((material) => material.getBaseColorTexture() !== null);
  if (!hasTexturedMaterial) throw new Error(`${label} fixture has no textured PBR material.`);
}

function validateStatic(document) {
  assertTextureIsEmbedded(document, 'Static');
  const meshCount = document.getRoot().listMeshes().length;
  if (meshCount !== 1) throw new Error(`Static fixture expected one mesh, received ${meshCount}.`);
}

function validateRigged(document) {
  assertTextureIsEmbedded(document, 'Rigged');
  const root = document.getRoot();
  const skins = root.listSkins();
  if (skins.length !== 1 || skins[0].listJoints().length < 2) {
    throw new Error('Rigged fixture must contain a skin with at least two joints.');
  }
  const skinnedMesh = root.listNodes().find((node) => node.getSkin() !== null);
  const primitives = skinnedMesh?.getMesh()?.listPrimitives() ?? [];
  if (
    primitives.length !== 1 ||
    !primitives[0].getAttribute('JOINTS_0') ||
    !primitives[0].getAttribute('WEIGHTS_0')
  ) {
    throw new Error('Rigged fixture must include joint indices and skin weights.');
  }
  const animations = root.listAnimations();
  const names = animations.map((animation) => animation.getName());
  for (const required of ['idle', 'move', 'interact', 'combat']) {
    if (!names.includes(required))
      throw new Error(`Rigged fixture is missing the ${required} clip.`);
  }
  if (animations.some((animation) => animation.listChannels().length === 0)) {
    throw new Error('Every named animation must have a target channel.');
  }
}

async function writeOrCheck(fileName, document, validate) {
  const bytes = await io.writeBinary(document);
  const roundTrip = await io.readBinary(bytes);
  validate(roundTrip);
  const path = resolve(outputDirectory, fileName);

  if (checkOnly) {
    let existing;
    try {
      existing = await readFile(path);
    } catch {
      throw new Error(`Missing generated fixture: ${path}`);
    }
    if (!existing.equals(Buffer.from(bytes))) {
      throw new Error(`Fixture differs from deterministic generator output: ${path}`);
    }
  } else {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }

  const inventory = await io.readBinary(checkOnly ? await readFile(path) : bytes);
  validate(inventory);
  const digest = createHash('sha256').update(bytes).digest('hex');
  const root = inventory.getRoot();
  const skinInventory = root
    .listSkins()
    .map(
      (skin) =>
        `${skin.getName()}<${skin
          .listJoints()
          .map((joint) => joint.getName())
          .join(',')}>`,
    )
    .join(';');
  const clipInventory = root
    .listAnimations()
    .map(
      (animation) =>
        `${animation.getName()}[${animation
          .listChannels()
          .map(
            (channel) => `${channel.getTargetNode()?.getName() ?? '?'}:${channel.getTargetPath()}`,
          )
          .join(',')}]`,
    )
    .join(';');
  log(
    `${checkOnly ? 'Verified' : 'Generated'} ${fileName}: ${bytes.byteLength} bytes, sha256=${digest}, meshes=${root.listMeshes().length}, skins=${skinInventory || 'none'}, clips=${clipInventory || 'none'}`,
  );
}

await mkdir(outputDirectory, { recursive: true });
await writeOrCheck('static-textured.glb', createStaticDocument(), validateStatic);
await writeOrCheck('rigged-animated.glb', createRiggedDocument(), validateRigged);
