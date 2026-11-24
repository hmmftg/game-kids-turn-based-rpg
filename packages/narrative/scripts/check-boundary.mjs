import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

export const EXPECTED_EXPORTS = [
  'ActiveDialogue',
  'CompiledNarrative',
  'DialogueChoiceDefinition',
  'DialogueChoiceView',
  'DialogueDefinition',
  'DialogueNodeDefinition',
  'DialogueView',
  'JsonPrimitive',
  'JsonValue',
  'LocalizedText',
  'NarrativeCommand',
  'NarrativeCommandBase',
  'NarrativeCondition',
  'NarrativeDecodeResult',
  'NarrativeDefinition',
  'NarrativeDefinitionError',
  'NarrativeDiagnostic',
  'NarrativeEffect',
  'NarrativeFactDefinition',
  'NarrativeFactType',
  'NarrativeFactValue',
  'NarrativeQuestHistory',
  'NarrativeRejectionCode',
  'NarrativeState',
  'NarrativeStateSeed',
  'NarrativeTransitionResult',
  'NarrativeTriggerDefinition',
  'NarrativeValidationReport',
  'PersistedQuestStatus',
  'QuestDefinition',
  'QuestStatus',
  'compileNarrative',
  'createNarrativeState',
  'decodeNarrativeState',
  'evaluateCondition',
  'getDialogueView',
  'getFact',
  'getQuestStatus',
  'transitionNarrative',
  'validateNarrative',
];

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_ROOT = path.join(PACKAGE_ROOT, 'src');

async function listTypeScript(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await listTypeScript(target)));
    else if (entry.isFile() && entry.name.endsWith('.ts')) paths.push(target);
  }
  return paths;
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
        `${file}: only local .js specifiers within package source are allowed (${specifier}).`,
      );
      return;
    }
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
    if (!resolved.startsWith('src/') || !resolved.endsWith('.js')) {
      errors.push(`${file}: import escapes package source (${specifier}).`);
      return;
    }
    const sourcePath = `${resolved.slice(0, -'.js'.length)}.ts`;
    if (packageSources && !packageSources.has(sourcePath))
      errors.push(`${file}: import has no package source target (${specifier}).`);
  };
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      checkSpecifier(node.moduleSpecifier.text);
      if (ts.isExportDeclaration(node) && !node.exportClause)
        errors.push(`${file}: wildcard exports are forbidden.`);
    }
    if (ts.isImportTypeNode(node)) {
      if (ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) {
        checkSpecifier(node.argument.literal.text);
      } else errors.push(`${file}: non-literal import types are forbidden.`);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      errors.push(`${file}: dynamic import is forbidden in library source.`);
    }
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
      const propertyName =
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isPropertyAssignment(parent) && parent.name === node) ||
        (ts.isMethodDeclaration(parent) && parent.name === node);
      if (!propertyName) errors.push(`${file}: CommonJS require is forbidden.`);
    }
    if (ts.isImportEqualsDeclaration(node))
      errors.push(`${file}: TypeScript import assignments are forbidden.`);
    if (ts.isExportAssignment(node) && node.isExportEquals)
      errors.push(`${file}: CommonJS exports are forbidden.`);
    if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name))
      errors.push(`${file}: ambient external modules are forbidden.`);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return errors;
}

export function validateManifest(manifest) {
  const errors = [];
  if (manifest.name !== 'waypoint-rpg-narrative')
    errors.push('manifest name must be waypoint-rpg-narrative');
  if (manifest.type !== 'module') errors.push('package must use ESM');
  if (manifest.private !== true) errors.push('package must remain private until release review');
  if (manifest.sideEffects !== false) errors.push('sideEffects must be false');
  if (manifest.engines?.node !== '>=22.0.0') errors.push('consumer Node runtime must be >=22.0.0');
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    if (manifest[field] && Object.keys(manifest[field]).length > 0)
      errors.push(`${field} must be empty`);
  }
  if (
    !manifest.devDependencies ||
    Object.keys(manifest.devDependencies).sort().join('\0') !== 'typescript' ||
    manifest.devDependencies.typescript !== '6.0.3'
  )
    errors.push('development dependencies must contain only TypeScript 6.0.3');
  const exports = manifest.exports;
  if (!exports || Object.keys(exports).length !== 1 || !Object.hasOwn(exports, '.')) {
    errors.push('package must expose only the root entry');
  } else {
    const root = exports['.'];
    if (
      !root ||
      Object.keys(root).sort().join('\0') !== ['import', 'types'].join('\0') ||
      root.import !== './dist/index.js' ||
      root.types !== './dist/index.d.ts'
    )
      errors.push('root entry must point to the built ESM and declaration files');
  }
  if (
    !Array.isArray(manifest.files) ||
    [...manifest.files].sort().join('\0') !== ['LICENSE', 'README.md', 'dist'].sort().join('\0')
  )
    errors.push('package contents must be limited to dist, README.md, and LICENSE');
  return errors;
}

export async function checkBoundary() {
  const manifest = JSON.parse(await readFile(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  const errors = validateManifest(manifest);
  const sourceFiles = await listTypeScript(SOURCE_ROOT);
  const relativeFiles = new Set(
    sourceFiles.map((file) => path.relative(PACKAGE_ROOT, file).replaceAll('\\', '/')),
  );
  for (const file of sourceFiles) {
    const source = await readFile(file, 'utf8');
    const relative = path.relative(PACKAGE_ROOT, file).replaceAll('\\', '/');
    for (const error of analyzeSourceText(source, relative, relativeFiles)) errors.push(error);
  }
  for (const file of relativeFiles) {
    const source = await readFile(path.join(PACKAGE_ROOT, file), 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    if (file === 'src/index.ts') {
      const names = [];
      for (const statement of ast.statements) {
        if (!ts.isExportDeclaration(statement)) continue;
        if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue;
        for (const specifier of statement.exportClause.elements) names.push(specifier.name.text);
      }
      if (names.sort().join('\0') !== [...EXPECTED_EXPORTS].sort().join('\0')) {
        errors.push('src/index.ts public exports differ from the approved exact root API');
      }
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return { sourceCount: sourceFiles.length, exportCount: EXPECTED_EXPORTS.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  checkBoundary()
    .then(({ sourceCount, exportCount }) => {
      console.log(
        `narrative boundary: ${sourceCount} source files, ${exportCount} root exports, no runtime dependencies`,
      );
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
