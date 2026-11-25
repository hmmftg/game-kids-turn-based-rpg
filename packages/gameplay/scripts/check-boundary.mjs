import { error as logError, log } from 'node:console';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

export const EXPECTED_EXPORTS = [
  'AbilityTargetKind',
  'CompiledGameplay',
  'CompiledLightweightEncounter',
  'GameplayAbilityDefinition',
  'GameplayAbilityEffectDefinition',
  'GameplayAbilityTargetDefinition',
  'GameplayAttributeDefinition',
  'GameplayAttributeRequirement',
  'GameplayBoardDefinition',
  'GameplayCell',
  'GameplayCharacterDefinition',
  'GameplayCharacterProgressState',
  'GameplayCombatantState',
  'GameplayCommand',
  'GameplayCommandBase',
  'GameplayDefinition',
  'GameplayDefinitionError',
  'GameplayDiagnostic',
  'GameplayEncounterDefinition',
  'GameplayEncounterParticipantDefinition',
  'GameplayEncounterState',
  'GameplayEquipmentSlotDefinition',
  'GameplayGrantCommand',
  'GameplayItemDefinition',
  'GameplayItemEquipmentDefinition',
  'GameplayJsonPrimitive',
  'GameplayJsonValue',
  'GameplayOutcome',
  'GameplayOutcomeMappingDefinition',
  'GameplayOutcomeMarker',
  'GameplayPlayerIntent',
  'GameplayProgressionDefinition',
  'GameplayRejectionCode',
  'GameplayResourceDefinition',
  'GameplayRewardBundle',
  'GameplayRewardEquipment',
  'GameplayRewardExperience',
  'GameplayRewardItem',
  'GameplayState',
  'GameplayStateCodecError',
  'GameplayStateDecodeFailureCode',
  'GameplayStateDecodeResult',
  'GameplayStatModifier',
  'GameplayStatusEffectDefinition',
  'GameplayStatusInstance',
  'GameplayTeam',
  'GameplayTransitionResult',
  'GameplayValidationReport',
  'LightweightEncounterCommand',
  'LightweightEncounterDefinition',
  'LightweightEncounterDefinitionError',
  'LightweightEncounterDiagnostic',
  'LightweightEncounterOutcomeDefinition',
  'LightweightEncounterPhase',
  'LightweightEncounterRound',
  'LightweightEncounterState',
  'LightweightEncounterValidationReport',
  'compileGameplay',
  'compileLightweightEncounter',
  'applyGameplayGrant',
  'createGameplayState',
  'createLightweightEncounter',
  'decodeGameplayState',
  'encodeGameplayState',
  'getCharacterAttributes',
  'getEffectiveCharacterAttributes',
  'getCharacterLevel',
  'getInventorySlotCount',
  'getUnlockedAbilityIds',
  'transitionGameplay',
  'transitionLightweightEncounter',
  'validateLightweightEncounter',
  'validateGameplay',
];

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(packageRoot, 'src');

async function listTypeScript(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listTypeScript(target)));
    else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(target);
  }
  return files;
}

export function analyzeSourceText(sourceText, relativeFile, packageSources) {
  const file = path.posix.normalize(relativeFile.replaceAll('\\', '/'));
  const source = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const errors = [];
  const checkSpecifier = (specifier) => {
    if (
      !specifier.startsWith('./') ||
      !specifier.endsWith('.js') ||
      specifier.includes('\\') ||
      specifier.split('/').includes('..')
    ) {
      errors.push(
        `${file}: only local .js imports inside package source are allowed (${specifier}).`,
      );
      return;
    }
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
    const sourcePath = `${resolved.slice(0, -'.js'.length)}.ts`;
    if (!resolved.startsWith('src/') || !packageSources.has(sourcePath))
      errors.push(
        `${file}: import escapes or does not resolve within package source (${specifier}).`,
      );
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) {
        if (ts.isStringLiteralLike(node.moduleSpecifier)) checkSpecifier(node.moduleSpecifier.text);
        else errors.push(`${file}: import/export specifiers must be string literals.`);
      }
      if (ts.isExportDeclaration(node) && !node.exportClause)
        errors.push(`${file}: wildcard exports are forbidden.`);
    }
    if (ts.isImportTypeNode(node)) {
      if (ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal))
        checkSpecifier(node.argument.literal.text);
      else errors.push(`${file}: non-literal import types are forbidden.`);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
      errors.push(`${file}: dynamic imports are forbidden.`);
    if (ts.isIdentifier(node) && ['eval', 'Function'].includes(node.text)) {
      const parent = node.parent;
      if (
        (ts.isCallExpression(parent) && parent.expression === node) ||
        (ts.isNewExpression(parent) && parent.expression === node)
      )
        errors.push(`${file}: dynamic code evaluation is forbidden.`);
    }
    if (ts.isIdentifier(node) && node.text === 'require') {
      const parent = node.parent;
      const isPropertyName =
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isPropertyAssignment(parent) && parent.name === node) ||
        (ts.isMethodDeclaration(parent) && parent.name === node) ||
        (ts.isPropertyDeclaration(parent) && parent.name === node);
      if (!isPropertyName) errors.push(`${file}: CommonJS require is forbidden.`);
    }
    if (ts.isImportEqualsDeclaration(node))
      errors.push(`${file}: TypeScript import assignments are forbidden.`);
    if (ts.isExportAssignment(node) && node.isExportEquals)
      errors.push(`${file}: CommonJS export assignments are forbidden.`);
    if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name))
      errors.push(`${file}: ambient external modules are forbidden.`);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return errors;
}

export function validateManifest(manifest) {
  const errors = [];
  if (manifest.name !== 'waypoint-rpg-gameplay')
    errors.push('package name must be waypoint-rpg-gameplay');
  if (manifest.type !== 'module') errors.push('package must use ESM');
  if (manifest.private !== true) errors.push('package must remain private until release review');
  if (manifest.sideEffects !== false) errors.push('sideEffects must be false');
  if (manifest.engines?.node !== '>=22.0.0') errors.push('consumer Node runtime must be >=22.0.0');
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies'])
    if (manifest[field] && Object.keys(manifest[field]).length > 0)
      errors.push(`${field} must be empty`);
  if (
    !manifest.devDependencies ||
    Object.keys(manifest.devDependencies).sort().join('\0') !== 'typescript' ||
    manifest.devDependencies.typescript !== '6.0.3'
  )
    errors.push('development dependencies must contain only TypeScript 6.0.3');
  if (manifest.main !== undefined || manifest.module !== undefined || manifest.types !== undefined)
    errors.push('package entry points must be declared only by the root exports map');
  if (
    !Array.isArray(manifest.files) ||
    [...manifest.files].sort().join('\0') !== ['LICENSE', 'README.md', 'dist'].sort().join('\0')
  )
    errors.push('package contents must be limited to dist, README.md, and LICENSE');
  const exports = manifest.exports;
  if (!exports || Object.keys(exports).length !== 1 || !Object.hasOwn(exports, '.'))
    errors.push('package must expose only its root entry');
  else {
    const root = exports['.'];
    if (
      !root ||
      Object.keys(root).sort().join('\0') !== ['import', 'types'].sort().join('\0') ||
      root.import !== './dist/index.js' ||
      root.types !== './dist/index.d.ts'
    )
      errors.push('root entry must point to built ESM and declaration files');
  }
  return errors;
}

export async function checkBoundary() {
  const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  const errors = validateManifest(manifest);
  const sourceFiles = await listTypeScript(sourceRoot);
  const sourceSet = new Set(
    sourceFiles.map((file) => path.relative(packageRoot, file).replaceAll('\\', '/')),
  );
  for (const file of sourceFiles) {
    const relative = path.relative(packageRoot, file).replaceAll('\\', '/');
    errors.push(...analyzeSourceText(await readFile(file, 'utf8'), relative, sourceSet));
    if (relative === 'src/index.ts') {
      const ast = ts.createSourceFile(
        relative,
        await readFile(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      const names = [];
      for (const statement of ast.statements) {
        if (
          !ts.isExportDeclaration(statement) ||
          !statement.exportClause ||
          !ts.isNamedExports(statement.exportClause)
        )
          continue;
        for (const specifier of statement.exportClause.elements) names.push(specifier.name.text);
      }
      if (names.sort().join('\0') !== [...EXPECTED_EXPORTS].sort().join('\0'))
        errors.push('src/index.ts public exports differ from the exact gameplay package root API');
    }
  }
  if (errors.length > 0) throw new Error(errors.join('\n'));
  return { sourceCount: sourceFiles.length, exportCount: EXPECTED_EXPORTS.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await checkBoundary();
    log(
      `gameplay boundary: ${result.sourceCount} source files, ${result.exportCount} root exports, no runtime dependencies`,
    );
  } catch (error) {
    logError(error);
    process.exitCode = 1;
  }
}
