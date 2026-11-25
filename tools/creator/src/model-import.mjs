#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { error as logError, log } from 'node:console';
import { readFile, realpath, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { format, resolveConfig } from 'prettier';

const IMPORTER = 'waypoint-rpg-local-model-import';
const IMPORTER_VERSION = '1.0.0';
const DEFAULT_BUDGET = Object.freeze({
  maxFileBytes: 12 * 1024 * 1024,
  maxTriangles: 60_000,
  maxPrimitives: 256,
  maxTextureDimension: 2048,
  maxDecodedTextureBytes: 24 * 1024 * 1024,
  maxJoints: 64,
  maxClips: 16,
  maxClipSeconds: 180,
});
const LOCAL_PILOT_MAX_TRIANGLES = 400_000;
const UNSUPPORTED_EXTENSIONS = new Set([
  'KHR_draco_mesh_compression',
  'KHR_texture_basisu',
  'EXT_meshopt_compression',
  'EXT_texture_webp',
  'EXT_texture_avif',
  'EXT_mesh_gpu_instancing',
]);
const SUPPORTED_EXTENSIONS = ALL_EXTENSIONS.filter(
  (extension) => !UNSUPPORTED_EXTENSIONS.has(extension.EXTENSION_NAME),
);
const SUPPORTED_EXTENSION_NAMES = new Set(
  SUPPORTED_EXTENSIONS.map((extension) => extension.EXTENSION_NAME),
);
const AXIS = /^[+-]?[XYZ]$/;
const SEMANTIC_ACTIONS = new Set(['idle', 'move', 'interact', 'combat', 'defeat']);
const defaultOutputDirectory = resolve(process.cwd(), 'assets/models');
const defaultManifestPath = resolve(process.cwd(), 'assets/catalog.json');

function fail(message) {
  throw new Error(message);
}

function isPlainObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    (prototype === Object.prototype || prototype === null) &&
    !Object.keys(value).some((key) => ['__proto__', 'prototype', 'constructor'].includes(key))
  );
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function resolveBudget(budget) {
  if (!isPlainObject(budget)) fail('Budget must be an object of trusted resource limits.');
  const resolved = { ...DEFAULT_BUDGET };
  for (const [name, value] of Object.entries(budget)) {
    if (!Object.hasOwn(DEFAULT_BUDGET, name)) fail(`Unknown importer budget ${name}.`);
    if (!Number.isSafeInteger(value) || value <= 0)
      fail(`${name} must be a positive safe integer.`);
    const hardLimit = name === 'maxTriangles' ? LOCAL_PILOT_MAX_TRIANGLES : DEFAULT_BUDGET[name];
    if (value > hardLimit) {
      if (name === 'maxTriangles')
        fail(`maxTriangles cannot exceed the local pilot limit ${LOCAL_PILOT_MAX_TRIANGLES}.`);
      fail(`${name} cannot exceed its hard limit ${hardLimit}.`);
    }
    resolved[name] = value;
  }
  return Object.freeze(resolved);
}

function parseGlbJson(bytes, sourcePath) {
  if (bytes.byteLength < 20 || bytes.toString('ascii', 0, 4) !== 'glTF')
    fail(`${sourcePath}: invalid GLB header.`);
  if (bytes.readUInt32LE(4) !== 2) fail(`${sourcePath}: only GLB version 2 is supported.`);
  if (bytes.readUInt32LE(8) !== bytes.byteLength)
    fail(`${sourcePath}: declared GLB length does not match the file size.`);

  let offset = 12;
  let jsonText = null;
  let sawBinary = false;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) fail(`${sourcePath}: truncated GLB chunk header.`);
    const length = bytes.readUInt32LE(offset);
    const kind = bytes.readUInt32LE(offset + 4);
    offset += 8;
    if (length % 4 !== 0 || length > bytes.byteLength - offset)
      fail(`${sourcePath}: invalid or truncated GLB chunk length.`);
    if (kind === 0x4e4f534a) {
      if (jsonText !== null) fail(`${sourcePath}: GLB contains multiple JSON chunks.`);
      jsonText = bytes.toString('utf8', offset, offset + length);
      while (jsonText.endsWith('\0') || jsonText.endsWith(' ')) jsonText = jsonText.slice(0, -1);
    } else if (kind === 0x004e4942) {
      if (sawBinary) fail(`${sourcePath}: GLB contains multiple binary chunks.`);
      sawBinary = true;
    } else {
      fail(`${sourcePath}: unsupported GLB chunk type 0x${kind.toString(16)}.`);
    }
    offset += length;
  }
  if (jsonText === null) fail(`${sourcePath}: GLB is missing its JSON chunk.`);
  return parseJson(jsonText, sourcePath);
}

function parseAnyJson(text, sourcePath) {
  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) fail(`${sourcePath}: invalid JSON (${error.message}).`);
    throw error;
  }
}

function parseJson(text, sourcePath) {
  const parsed = parseAnyJson(text, sourcePath);
  if (!isPlainObject(parsed)) fail(`${sourcePath}: glTF root must be a plain JSON object.`);
  return parsed;
}

function dataUriBytes(uri, sourcePath) {
  const separator = uri.indexOf(',');
  if (separator < 0) fail(`${sourcePath}: malformed data URI.`);
  const metadata = uri.slice(0, separator);
  const payload = uri.slice(separator + 1);
  if (/;base64$/i.test(metadata)) {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(payload))
      fail(`${sourcePath}: invalid base64 data URI.`);
    return Buffer.from(payload, 'base64');
  }
  try {
    return Buffer.from(decodeURIComponent(payload), 'utf8');
  } catch {
    fail(`${sourcePath}: invalid percent-encoded data URI.`);
  }
}

async function resolveLocalReference(uri, sourceDirectory, sourcePath) {
  if (typeof uri !== 'string' || uri.length === 0)
    fail(`${sourcePath}: empty external resource URI.`);
  if (
    /^[a-z][a-z0-9+.-]*:/i.test(uri) ||
    uri.startsWith('//') ||
    uri.startsWith('/') ||
    uri.includes('\\')
  )
    fail(
      `${sourcePath}: external, absolute, or backslash resource references are not allowed: ${uri}`,
    );
  if (uri.includes('?') || uri.includes('#'))
    fail(`${sourcePath}: resource URI query and fragment components are not supported: ${uri}`);
  let decoded;
  try {
    decoded = decodeURIComponent(uri);
  } catch {
    fail(`${sourcePath}: invalid percent-encoding in resource URI: ${uri}`);
  }
  if (decoded.includes('\\') || decoded.includes(String.fromCharCode(0)))
    fail(`${sourcePath}: unsafe resource path: ${uri}`);
  const resolved = resolve(sourceDirectory, decoded);
  const rel = relative(sourceDirectory, resolved);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    fail(`${sourcePath}: resource path escapes the source folder: ${uri}`);
  const actual = await realpath(resolved).catch(() => null);
  if (!actual) fail(`${sourcePath}: referenced local resource does not exist: ${uri}`);
  const realRoot = await realpath(sourceDirectory);
  const realRelative = relative(realRoot, actual);
  if (realRelative === '..' || realRelative.startsWith(`..${sep}`) || isAbsolute(realRelative))
    fail(`${sourcePath}: resource symlink escapes the source folder: ${uri}`);
  return actual;
}

async function inspectSource(sourcePath, budget) {
  const extension = extname(sourcePath).toLowerCase();
  if (extension !== '.glb' && extension !== '.gltf')
    fail(`${sourcePath}: source must be .glb or .gltf; convert FBX/OBJ/BLEND locally first.`);
  const bytes = await readFile(sourcePath);
  if (bytes.byteLength > budget.maxFileBytes)
    fail(`${sourcePath}: source is ${bytes.byteLength} bytes; limit is ${budget.maxFileBytes}.`);
  const json =
    extension === '.glb'
      ? parseGlbJson(bytes, sourcePath)
      : parseJson(bytes.toString('utf8'), sourcePath);
  if (!isPlainObject(json.asset) || json.asset.version !== '2.0')
    fail(`${sourcePath}: expected glTF asset.version 2.0.`);

  const extensions = Array.isArray(json.extensionsUsed) ? json.extensionsUsed : [];
  const requiredExtensions = Array.isArray(json.extensionsRequired) ? json.extensionsRequired : [];
  for (const extensionName of [...new Set([...extensions, ...requiredExtensions])]) {
    if (typeof extensionName !== 'string' || !SUPPORTED_EXTENSION_NAMES.has(extensionName))
      fail(`${sourcePath}: unsupported glTF extension: ${String(extensionName)}.`);
  }

  const resources = new Map();
  const sourceDirectory = await realpath(dirname(sourcePath));
  for (const [kind, entries] of [
    ['buffer', Array.isArray(json.buffers) ? json.buffers : []],
    ['image', Array.isArray(json.images) ? json.images : []],
  ]) {
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (!isPlainObject(entry)) fail(`${sourcePath}: ${kind} ${index} must be an object.`);
      if (entry.uri === undefined) {
        if (kind === 'buffer' && extension === '.gltf')
          fail(`${sourcePath}: glTF buffer ${index} requires a local or data URI.`);
        continue;
      }
      const uri = entry.uri;
      if (typeof uri !== 'string') fail(`${sourcePath}: ${kind} ${index} URI must be a string.`);
      if (uri.startsWith('data:')) {
        const data = dataUriBytes(uri, sourcePath);
        if (data.byteLength > budget.maxFileBytes)
          fail(`${sourcePath}: embedded ${kind} ${index} exceeds the file-size limit.`);
        resources.set(uri, data);
      } else {
        if (extension === '.glb')
          fail(`${sourcePath}: GLB source must be self-contained; external ${kind} URI found.`);
        const resourcePath = await resolveLocalReference(uri, sourceDirectory, sourcePath);
        const resource = await readFile(resourcePath);
        if (resource.byteLength > budget.maxFileBytes)
          fail(`${sourcePath}: referenced ${kind} ${index} exceeds the file-size limit.`);
        resources.set(uri, resource);
      }
    }
  }
  const sourceHash = createHash('sha256').update(bytes);
  const hashableResources = [...resources.entries()]
    .map(([uri, resource]) => [uri, resource])
    .sort(([left], [right]) => left.localeCompare(right));
  const sourceBytes =
    bytes.byteLength +
    hashableResources.reduce((sum, [, resource]) => sum + resource.byteLength, 0);
  for (const [name, resource] of hashableResources) sourceHash.update(name).update(resource);
  if (sourceBytes > budget.maxFileBytes)
    fail(
      `${sourcePath}: source and local dependencies total ${sourceBytes} bytes; limit is ${budget.maxFileBytes}.`,
    );
  return { bytes, json, extension, resources, sourceBytes, sourceSha256: sourceHash.digest('hex') };
}

function parseAxis(direction) {
  if (typeof direction !== 'string' || !AXIS.test(direction))
    fail(`Invalid coordinate axis ${String(direction)}; use X, -X, Y, -Y, Z, or -Z.`);
  const sign = direction.startsWith('-') ? -1 : 1;
  const axis = direction.at(-1);
  return new Vector3(axis === 'X' ? sign : 0, axis === 'Y' ? sign : 0, axis === 'Z' ? sign : 0);
}

function makeNormalizationQuaternion(sourceUpAxis, sourceForwardAxis) {
  const up = parseAxis(sourceUpAxis);
  const forward = parseAxis(sourceForwardAxis);
  if (Math.abs(up.dot(forward)) > 1e-6) fail('Source up and forward axes must be perpendicular.');
  const right = forward.clone().cross(up).normalize();
  const matrix = new Matrix4().set(
    right.x,
    right.y,
    right.z,
    0,
    up.x,
    up.y,
    up.z,
    0,
    -forward.x,
    -forward.y,
    -forward.z,
    0,
    0,
    0,
    0,
    1,
  );
  return new Quaternion().setFromRotationMatrix(matrix).normalize();
}

function validateMetadata(metadataPath, metadata, requireApproval) {
  if (!isPlainObject(metadata)) fail(`${metadataPath}: expected a plain JSON object.`);
  if (typeof metadata.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.id))
    fail(`${metadataPath}: id must be stable lowercase kebab-case.`);
  if (typeof metadata.sourceOrigin !== 'string' || metadata.sourceOrigin.trim().length === 0)
    fail(`${metadataPath}: record the source provider, URL, or generated fixture origin.`);
  if (!isPlainObject(metadata.rights)) fail(`${metadataPath}: license rights are required.`);
  if (
    typeof metadata.rights.licenseId !== 'string' ||
    metadata.rights.licenseId.trim() === '' ||
    /unknown|unverified|unspecified/i.test(metadata.rights.licenseId)
  )
    fail(`${metadataPath}: an explicit, reviewed license ID is required.`);
  if (typeof metadata.rights.attribution !== 'string')
    fail(`${metadataPath}: attribution must be recorded, even when empty.`);
  for (const key of ['commercialUse', 'redistribution', 'approved']) {
    if (typeof metadata.rights[key] !== 'boolean')
      fail(`${metadataPath}: rights.${key} must be boolean.`);
  }
  if (requireApproval && !metadata.rights.approved)
    fail(`${metadataPath}: unapproved assets cannot be imported into the release consumer.`);
  if (!isPlainObject(metadata.normalization))
    fail(`${metadataPath}: source normalization is required.`);
  const metersPerUnit = metadata.normalization.metersPerUnit;
  if (
    typeof metersPerUnit !== 'number' ||
    !Number.isFinite(metersPerUnit) ||
    metersPerUnit <= 0 ||
    metersPerUnit > 1000
  )
    fail(`${metadataPath}: metersPerUnit must be positive, finite, and no greater than 1000.`);
  const rotation = makeNormalizationQuaternion(
    metadata.normalization.sourceUpAxis,
    metadata.normalization.sourceForwardAxis,
  );
  const clips = metadata.clips ?? {};
  if (!isPlainObject(clips)) fail(`${metadataPath}: clips must be a semantic-action object.`);
  for (const [action, name] of Object.entries(clips)) {
    if (!SEMANTIC_ACTIONS.has(action) || typeof name !== 'string' || name.trim() === '')
      fail(`${metadataPath}: invalid semantic clip mapping ${action}.`);
  }
  if (metadata.fallbackAction !== 'idle' && metadata.fallbackAction !== 'static')
    fail(`${metadataPath}: fallbackAction must be idle or static.`);
  return { rotation, clips };
}

function imageDimensions(texture, sourcePath) {
  const image = texture.getImage();
  const mimeType = texture.getMimeType();
  if (!image || image.byteLength === 0)
    fail(`${sourcePath}: texture ${texture.getName()} has no image bytes.`);
  if (mimeType === 'image/png' && image.byteLength >= 24) {
    const bytes = Buffer.from(image);
    if (bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a')
      fail(`${sourcePath}: invalid PNG texture.`);
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (mimeType === 'image/jpeg' && image.byteLength >= 4) {
    const bytes = Buffer.from(image);
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) fail(`${sourcePath}: invalid JPEG texture.`);
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        )
      )
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      if (length < 2) break;
      offset += 2 + length;
    }
  }
  fail(`${sourcePath}: only embedded PNG and JPEG textures are supported in this phase.`);
}

function checkFiniteAccessors(root, sourcePath) {
  for (const [accessorIndex, accessor] of root.listAccessors().entries()) {
    const values = accessor.getArray();
    if (!values) continue;
    for (let index = 0; index < values.length; index += 1) {
      if (!Number.isFinite(values[index]))
        fail(`${sourcePath}: accessor ${accessorIndex} contains a non-finite value at ${index}.`);
    }
  }
}

function checkSkinWeights(root, sourcePath) {
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    const skin = node.getSkin();
    if (!mesh || !skin) continue;
    const jointCount = skin.listJoints().length;
    for (const [primitiveIndex, primitive] of mesh.listPrimitives().entries()) {
      const jointAttribute = primitive.getAttribute('JOINTS_0');
      const weightAttribute = primitive.getAttribute('WEIGHTS_0');
      if (
        !jointAttribute ||
        !weightAttribute ||
        jointAttribute.getCount() !== weightAttribute.getCount()
      )
        fail(
          `${sourcePath}: skinned mesh ${mesh.getName()} primitive ${primitiveIndex} requires matching JOINTS_0/WEIGHTS_0.`,
        );
      if (jointAttribute.getNormalized())
        fail(`${sourcePath}: JOINTS_0 must use unnormalized integer joint indices.`);
      if (jointAttribute.getElementSize() !== 4 || weightAttribute.getElementSize() !== 4)
        fail(`${sourcePath}: only four skin influences per vertex are supported.`);
      const joints = [];
      const weights = [];
      for (let vertex = 0; vertex < jointAttribute.getCount(); vertex += 1) {
        jointAttribute.getElement(vertex, joints);
        weightAttribute.getElement(vertex, weights);
        let sum = 0;
        for (let influence = 0; influence < 4; influence += 1) {
          const joint = joints[influence];
          const weight = weights[influence];
          if (!Number.isInteger(joint) || joint < 0 || joint >= jointCount)
            fail(`${sourcePath}: skin joint index is out of range at vertex ${vertex}.`);
          if (!Number.isFinite(weight) || weight < 0)
            fail(`${sourcePath}: skin weight is invalid at vertex ${vertex}.`);
          sum += weight;
        }
        if (Math.abs(sum - 1) > 0.02)
          fail(
            `${sourcePath}: skin weights at vertex ${vertex} must sum to one (received ${sum}).`,
          );
      }
    }
  }
}

function checkTexturedPrimitives(root, sourcePath) {
  for (const mesh of root.listMeshes()) {
    for (const [primitiveIndex, primitive] of mesh.listPrimitives().entries()) {
      const material = primitive.getMaterial();
      if (!material) continue;
      const usesTexture = [
        material.getBaseColorTexture(),
        material.getMetallicRoughnessTexture(),
        material.getNormalTexture(),
        material.getOcclusionTexture(),
        material.getEmissiveTexture(),
      ].some(Boolean);
      if (usesTexture && !primitive.getAttribute('TEXCOORD_0'))
        fail(
          `${sourcePath}: textured mesh ${mesh.getName()} primitive ${primitiveIndex} has no TEXCOORD_0 UVs.`,
        );
    }
  }
}

function inspectDocument(
  document,
  sourcePath,
  metadata,
  sourceBytes,
  outputBytes,
  budget,
  preserveGlbBytes,
) {
  const root = document.getRoot();
  checkFiniteAccessors(root, sourcePath);
  checkTexturedPrimitives(root, sourcePath);
  const nodes = root.listNodes().filter((node) => node.getMesh() !== null);
  if (nodes.length === 0) fail(`${sourcePath}: model contains no mesh nodes.`);

  let triangles = 0;
  let primitiveCount = 0;
  const morphTargetNames = new Set();
  const boundsMin = [Infinity, Infinity, Infinity];
  const boundsMax = [-Infinity, -Infinity, -Infinity];
  const sourceRotation = metadata.rotation;
  const metersPerUnit = metadata.normalization.metersPerUnit;
  const matrix = new Matrix4();
  const position = new Vector3();
  for (const node of nodes) {
    const mesh = node.getMesh();
    matrix.fromArray(node.getWorldMatrix());
    for (const primitive of mesh.listPrimitives()) {
      primitiveCount += 1;
      const positions = primitive.getAttribute('POSITION');
      if (!positions || positions.getElementSize() !== 3)
        fail(`${sourcePath}: mesh primitive needs VEC3 positions.`);
      const indexCount = primitive.getIndices()?.getCount() ?? positions.getCount();
      if (primitive.getMode() === 4) triangles += Math.floor(indexCount / 3);
      else if (primitive.getMode() === 5 || primitive.getMode() === 6)
        triangles += Math.max(0, indexCount - 2);
      for (const target of primitive.listTargets()) {
        for (const semantic of target.listSemantics())
          morphTargetNames.add(`${mesh.getName() || 'mesh'}:${morphTargetNames.size}:${semantic}`);
      }
      const values = [];
      for (let index = 0; index < positions.getCount(); index += 1) {
        positions.getElement(index, values);
        position
          .set(values[0], values[1], values[2])
          .applyMatrix4(matrix)
          .applyQuaternion(sourceRotation)
          .multiplyScalar(metersPerUnit);
        for (let axis = 0; axis < 3; axis += 1) {
          boundsMin[axis] = Math.min(boundsMin[axis], position.getComponent(axis));
          boundsMax[axis] = Math.max(boundsMax[axis], position.getComponent(axis));
        }
      }
      const indices = primitive.getIndices()?.getArray();
      if (indices) {
        for (const index of indices) {
          if (!Number.isSafeInteger(index) || index < 0 || index >= positions.getCount())
            fail(`${sourcePath}: mesh primitive contains an out-of-range index.`);
        }
      }
    }
  }
  if (triangles > budget.maxTriangles)
    fail(`${sourcePath}: ${triangles} triangles exceed the limit ${budget.maxTriangles}.`);
  if (primitiveCount > budget.maxPrimitives)
    fail(`${sourcePath}: ${primitiveCount} primitives exceed the limit ${budget.maxPrimitives}.`);

  checkSkinWeights(root, sourcePath);
  const skins = root.listSkins();
  const jointCount = skins.reduce(
    (maximum, skin) => Math.max(maximum, skin.listJoints().length),
    0,
  );
  if (jointCount > budget.maxJoints)
    fail(`${sourcePath}: ${jointCount} joints exceed the limit ${budget.maxJoints}.`);

  const clipInventory = root.listAnimations().map((animation, index) => {
    const sourceName = animation.getName();
    const name = sourceName.trim() || `clip-${index + 1}`;
    let durationSeconds = 0;
    for (const channel of animation.listChannels()) {
      const times = channel.getSampler()?.getInput()?.getArray();
      if (times?.length)
        durationSeconds = Math.max(durationSeconds, Number(times[times.length - 1]));
    }
    if (
      !Number.isFinite(durationSeconds) ||
      durationSeconds < 0 ||
      durationSeconds > budget.maxClipSeconds
    )
      fail(`${sourcePath}: animation ${name} has an invalid or over-budget duration.`);
    return {
      id: `clip-${index + 1}`,
      animationIndex: index,
      name,
      sourceName,
      durationSeconds: Number(durationSeconds.toFixed(4)),
    };
  });
  if (clipInventory.length > budget.maxClips) fail(`${sourcePath}: too many animation clips.`);
  if (
    !preserveGlbBytes &&
    new Set(clipInventory.map((clip) => clip.name)).size !== clipInventory.length
  )
    fail(`${sourcePath}: animation clip names must be unique.`);
  for (const [action, clipName] of Object.entries(metadata.clips)) {
    const byId = clipInventory.find((clip) => clip.id === clipName);
    const byName = clipInventory.filter((clip) => clip.name === clipName);
    const matches = byId ? [byId] : byName;
    if (matches.length === 0)
      fail(`${sourcePath}: semantic action ${action} references missing clip ${clipName}.`);
    if (matches.length > 1)
      fail(`${sourcePath}: semantic action ${action} references ambiguous clip name ${clipName}.`);
  }

  const textures = root.listTextures();
  let textureBytes = 0;
  let maxTextureDimension = 0;
  for (const texture of textures) {
    const { width, height } = imageDimensions(texture, sourcePath);
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0)
      fail(`${sourcePath}: texture dimensions must be positive integers.`);
    if (width > budget.maxTextureDimension || height > budget.maxTextureDimension)
      fail(`${sourcePath}: texture ${texture.getName()} exceeds ${budget.maxTextureDimension}px.`);
    maxTextureDimension = Math.max(maxTextureDimension, width, height);
    textureBytes += width * height * 4;
  }
  if (textureBytes > budget.maxDecodedTextureBytes)
    fail(
      `${sourcePath}: decoded texture estimate ${textureBytes} exceeds ${budget.maxDecodedTextureBytes} bytes.`,
    );

  const accessorBytes = root
    .listAccessors()
    .reduce((sum, accessor) => sum + accessor.getByteLength(), 0);
  const extensions = [
    ...new Set(root.listExtensionsUsed().map((extension) => extension.extensionName)),
  ].sort();
  return {
    schemaVersion: 1,
    sourceFormat: extname(sourcePath).slice(1).toLowerCase(),
    sourceOrigin: metadata.sourceOrigin,
    importer: IMPORTER,
    importerVersion: IMPORTER_VERSION,
    conversionOptions: {
      outputFormat: 'glb',
      preserveSkinning: true,
      preserveMorphTargets: true,
      preserveAnimations: true,
    },
    rights: metadata.rights,
    normalization: {
      metersPerUnit,
      sourceUpAxis: metadata.normalization.sourceUpAxis,
      sourceForwardAxis: metadata.normalization.sourceForwardAxis,
      upAxis: 'Y',
      forwardAxis: '-Z',
      rootRotation: sourceRotation.toArray(),
    },
    bounds: {
      min: boundsMin.map((value) => Number(value.toFixed(5))),
      max: boundsMax.map((value) => Number(value.toFixed(5))),
    },
    metrics: {
      sourceBytes,
      outputBytes: outputBytes.byteLength,
      triangles,
      primitiveCount,
      textureCount: textures.length,
      textureBytes,
      maxTextureDimension,
      jointCount,
      skinCount: skins.length,
      morphTargetNames: [...morphTargetNames].sort(),
      estimatedDecodedBytes: accessorBytes + textureBytes,
    },
    extensions,
    materialNames: root
      .listMaterials()
      .map((material, index) => material.getName().trim() || `material-${index + 1}`),
    clipInventory,
    clips: metadata.clips,
    fallbackAction: metadata.fallbackAction,
    warnings: [],
  };
}

function validateRuntimeRecord(record, sourcePath, budget) {
  const issue = (path, detail) => fail(`${sourcePath}: ${path}: ${detail}`);
  if (record.metrics.outputBytes > budget.maxFileBytes)
    issue('metrics.outputBytes', `exceeds ${budget.maxFileBytes} bytes.`);
  if (record.metrics.estimatedDecodedBytes > budget.maxDecodedTextureBytes * 2)
    issue('metrics.estimatedDecodedBytes', 'exceeds the combined decoded-resource budget.');
  if (record.metrics.maxTextureDimension > budget.maxTextureDimension)
    issue('metrics.maxTextureDimension', `exceeds ${budget.maxTextureDimension}px.`);
}

async function stageWrite(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  await writeFile(temporary, bytes, { flag: 'wx' });
  return temporary;
}

async function commitFiles({
  outputPath,
  outputBytes,
  outputChanged,
  existingOutput,
  manifestFile,
  manifestBytes,
  manifestChanged,
}) {
  let stagedOutput;
  let stagedManifest;
  let backupPath;
  let outputCommitted = false;
  let existingOutputMoved = false;
  let manifestCommitted = false;
  try {
    if (manifestChanged) stagedManifest = await stageWrite(manifestFile, manifestBytes);
    if (outputChanged) stagedOutput = await stageWrite(outputPath, outputBytes);
    if (outputChanged && existingOutput) {
      backupPath = join(
        dirname(outputPath),
        `.${basename(outputPath)}.${process.pid}.${randomUUID()}.bak`,
      );
      await rename(outputPath, backupPath);
      existingOutputMoved = true;
    }
    if (stagedOutput) {
      await rename(stagedOutput, outputPath);
      stagedOutput = undefined;
      outputCommitted = true;
    }
    if (stagedManifest) {
      await rename(stagedManifest, manifestFile);
      stagedManifest = undefined;
      manifestCommitted = true;
    }
  } catch (error) {
    if (!manifestCommitted && outputCommitted) await rm(outputPath, { force: true });
    if (!manifestCommitted && existingOutputMoved && backupPath)
      await rename(backupPath, outputPath);
    throw error;
  } finally {
    if (stagedOutput) await rm(stagedOutput, { force: true });
    if (stagedManifest) await rm(stagedManifest, { force: true });
  }
  if (backupPath) await rm(backupPath, { force: true });
}

export async function importModel({
  sourcePath,
  metadataPath,
  outputDirectory = defaultOutputDirectory,
  manifestPath = defaultManifestPath,
  replace = false,
  budget = {},
  requireApproval = true,
  preserveGlbBytes = false,
}) {
  const absoluteSource = resolve(sourcePath);
  const absoluteMetadata = resolve(metadataPath);
  budget = resolveBudget(budget);
  if (preserveGlbBytes && extname(absoluteSource).toLowerCase() !== '.glb')
    fail(`${absoluteSource}: byte preservation is supported only for self-contained GLB sources.`);
  const source = await inspectSource(absoluteSource, budget);
  const metadata = parseJson((await readFile(absoluteMetadata)).toString('utf8'), absoluteMetadata);
  const normalizedMetadata = validateMetadata(absoluteMetadata, metadata, requireApproval);
  const io = new NodeIO().registerExtensions(SUPPORTED_EXTENSIONS);
  let document;
  try {
    document =
      source.extension === '.glb'
        ? await io.readBinary(source.bytes)
        : await io.readJSON({ json: source.json, resources: Object.fromEntries(source.resources) });
  } catch (error) {
    fail(
      `${absoluteSource}: glTF parser rejected the file (${error instanceof Error ? error.message : String(error)}).`,
    );
  }
  if (!preserveGlbBytes) {
    for (const [index, animation] of document.getRoot().listAnimations().entries()) {
      if (animation.getName().trim() === '') animation.setName(`clip-${index + 1}`);
    }
  }
  const outputBytes = preserveGlbBytes ? source.bytes : await io.writeBinary(document);
  const outputDocument = preserveGlbBytes ? document : await io.readBinary(outputBytes);
  const record = inspectDocument(
    outputDocument,
    absoluteSource,
    { ...metadata, rotation: normalizedMetadata.rotation, clips: normalizedMetadata.clips },
    source.sourceBytes,
    outputBytes,
    budget,
    preserveGlbBytes,
  );
  validateRuntimeRecord(record, absoluteSource, budget);
  const recordWithHashes = {
    ...record,
    id: metadata.id,
    runtimePath: `models/${metadata.id}.glb`,
    runtimeFormat: 'glb',
    sourceSha256: source.sourceSha256,
    outputSha256: sha256(outputBytes),
  };

  const outputPath = resolve(outputDirectory, `${metadata.id}.glb`);
  const manifestFile = resolve(manifestPath);
  const existingOutput = await readFile(outputPath).catch(() => null);
  if (existingOutput && sha256(existingOutput) !== recordWithHashes.outputSha256 && !replace)
    fail(`${outputPath}: existing asset differs; pass --replace to replace it.`);

  let records = [];
  const oldManifest = await readFile(manifestFile).catch(() => null);
  if (oldManifest) {
    const parsed = parseAnyJson(oldManifest.toString('utf8'), manifestFile);
    if (!Array.isArray(parsed) || !parsed.every(isPlainObject))
      fail(`${manifestFile}: expected an array of asset records.`);
    records = parsed.filter((entry) => entry.id !== metadata.id);
  }
  records.push(recordWithHashes);
  records.sort((left, right) => left.id.localeCompare(right.id));
  const prettierOptions = (await resolveConfig(manifestFile)) ?? {};
  const manifestText = await format(`${JSON.stringify(records, null, 2)}\n`, {
    ...prettierOptions,
    filepath: manifestFile,
  });
  const manifestBytes = Buffer.from(manifestText, 'utf8');

  const outputChanged = !existingOutput || sha256(existingOutput) !== recordWithHashes.outputSha256;
  const manifestChanged = !oldManifest?.equals(manifestBytes);
  await commitFiles({
    outputPath,
    outputBytes,
    outputChanged,
    existingOutput,
    manifestFile,
    manifestBytes,
    manifestChanged,
  });
  return { outputPath, manifestPath: manifestFile, record: recordWithHashes };
}

function parseArguments(args) {
  const options = { replace: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--replace') {
      options.replace = true;
      continue;
    }
    if (!['--source', '--metadata', '--output-directory', '--manifest'].includes(argument))
      fail(`Unknown argument: ${argument}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for ${argument}.`);
    const key = {
      '--source': 'sourcePath',
      '--metadata': 'metadataPath',
      '--output-directory': 'outputDirectory',
      '--manifest': 'manifestPath',
    }[argument];
    options[key] = resolve(value);
    index += 1;
  }
  if (!options.sourcePath || !options.metadataPath)
    fail(
      'Usage: node scripts/import-model.mjs --source <local.glb|local.gltf> --metadata <asset.json> [--replace]',
    );
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await importModel(parseArguments(process.argv.slice(2)));
    log(`Imported ${result.record.id} to ${result.record.runtimePath}`);
    log(`Output SHA-256: ${result.record.outputSha256}`);
    log(`Metrics: ${JSON.stringify(result.record.metrics)}`);
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export { DEFAULT_BUDGET, LOCAL_PILOT_MAX_TRIANGLES, parseGlbJson, parseArguments };
