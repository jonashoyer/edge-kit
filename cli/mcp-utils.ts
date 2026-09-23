import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-api';
import { jsonToXml } from '../src/utils/markdown-utils.js';
import { getNormalizedRelativePath } from '../src/utils/path-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const JSDOC_START = /^\s*\/\*\*/;
const JSDOC_END = /\*\/$/;
const JSDOC_LINE = /^\s*\*\s?/;

const isModuleFile = (entry: fs.Dirent) =>
  entry.isFile() &&
  entry.name.endsWith('.ts') &&
  !entry.name.endsWith('.test.ts') &&
  !entry.name.endsWith('.d.ts');

const PROJECT_ROOT = path.resolve(__dirname, '..');

export interface Feature {
  category: string;
  description: string;
  entryPoint: string;
  id: string;
  name: string;
}

export interface FeatureBundle {
  documentation?: string;
  feature: Feature;
  files: { path: string; content: string }[];
  npmDependencies: Record<string, string>;
}

export function featureListToXml(features: Feature[]): string {
  return jsonToXml(features, 'features', { disableIndentation: true });
}

export function featureBundleToXml(bundle: FeatureBundle): string {
  return jsonToXml(bundle, 'bundle', {
    disableEscape: true,
    disableIndentation: true,
  });
}

export class FeatureRegistry {
  private readonly features: Feature[] = [];
  private initialized = false;

  async init() {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: Initialization state changes after the first call.
    if (this.initialized) return;

    const searchPaths = [
      { category: 'service', dir: 'src/services' },
      { category: 'composer', dir: 'src/composers' },
      { category: 'database', dir: 'src/db' },
      { category: 'utility', dir: 'src/utils' },
    ];

    for (const { dir, category } of searchPaths) {
      const fullDir = path.join(PROJECT_ROOT, dir);
      if (!fs.existsSync(fullDir)) continue;

      const entries = fs.readdirSync(fullDir, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(fullDir, entry.name);

        if (entry.isDirectory()) {
          this.addDirectoryFeatures(entryPath, entry.name, category);
        }
        // 2. Standalone file
        else if (isModuleFile(entry)) {
          this.addFeature(path.parse(entry.name).name, entryPath, category);
        }
      }
    }
    this.initialized = true;
  }

  private addDirectoryFeatures(
    entryPath: string,
    name: string,
    category: string
  ) {
    const children = fs.readdirSync(entryPath, { withFileTypes: true });
    for (const child of children) {
      if (isModuleFile(child)) {
        this.addFeature(
          `${name}/${path.parse(child.name).name}`,
          path.join(entryPath, child.name),
          category
        );
      }
    }
  }

  private addFeature(
    id: string,
    entryPoint: string,
    category: string,
    docRoot?: string
  ) {
    // Skip internal files
    if (id === 'index' || id.startsWith('abstract-')) return;

    const content = fs.readFileSync(entryPoint, 'utf-8');
    const description = this.extractDescription(content);

    // Clean up ID
    const cleanId = category === 'service' ? id : `${category}/${id}`;

    this.features.push({
      category,
      description: description || `No description available for ${id}`,
      entryPoint,
      id: cleanId,
      name: id.split('/').pop() || id,
    });
  }

  private extractDescription(content: string): string {
    const sourceFile = ts.createSourceFile(
      'temp.ts',
      content,
      ts.ScriptTarget.Latest,
      true
    );
    let description = '';

    ts.forEachChild(sourceFile, (node) => {
      if (description) return;

      const comments = ts.getLeadingCommentRanges(content, node.pos);
      if (comments && comments.length > 0) {
        const [comment] = comments;
        const text = content.slice(comment.pos, comment.end);
        // Parse JSDoc comment
        if (text.startsWith('/**')) {
          const clean = text
            .replace(JSDOC_START, '') // Remove starting /**
            .replace(JSDOC_END, '') // Remove ending */
            .split('\n') // Split into lines
            .map((line) => line.replace(JSDOC_LINE, '').trim()) // Remove leading * and whitespace
            .filter((line) => line.length > 0) // Remove empty lines
            .join(' '); // Join with spaces

          if (clean) description = clean;
        }
      }
    });

    return description;
  }

  list(): Feature[] {
    return this.features;
  }

  get(id: string): Feature | undefined {
    return this.features.find((f) => f.id === id);
  }
}

export class DependencyResolver {
  private readonly visited = new Set<string>();
  private files: { path: string; content: string }[] = [];
  private readonly npmDeps = new Set<string>();
  private readonly packageJson: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  constructor() {
    const pkgPath = path.join(PROJECT_ROOT, 'package.json');
    this.packageJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  }

  resolve(entryPoint: string): FeatureBundle {
    this.visited.clear();
    this.files = [];
    this.npmDeps.clear();

    this.processFile(entryPoint);

    const npmDependencies: Record<string, string> = {};
    for (const dep of this.npmDeps) {
      const version =
        this.packageJson.dependencies?.[dep] ||
        this.packageJson.devDependencies?.[dep];
      if (version) {
        npmDependencies[dep] = version;
      }
    }

    // Try to find docs
    let docContent: string | undefined;
    const dir = path.dirname(entryPoint);
    const readmePath = path.join(dir, 'README.md');
    const agentsPath = path.join(dir, 'AGENTS.md');

    if (fs.existsSync(agentsPath)) {
      docContent = fs.readFileSync(agentsPath, 'utf-8');
    } else if (fs.existsSync(readmePath)) {
      docContent = fs.readFileSync(readmePath, 'utf-8');
    }

    return {
      documentation: docContent,
      feature: {
        category: '',
        description: '',
        entryPoint,
        id: 'resolved',
        name: 'resolved',
      }, // Placeholder
      files: this.files,
      npmDependencies,
    };
  }

  private processFile(requestedPath: string) {
    let filePath = requestedPath;
    if (this.visited.has(filePath)) return;
    this.visited.add(filePath);

    if (!fs.existsSync(filePath)) {
      // Try adding .ts or .tsx
      if (fs.existsSync(`${filePath}.ts`)) filePath += '.ts';
      else if (fs.existsSync(`${filePath}.tsx`)) filePath += '.tsx';
      else return; // Can't find it
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const relPath = getNormalizedRelativePath(PROJECT_ROOT, filePath);
    this.files.push({ content, path: relPath });

    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true
    );

    const imports: string[] = [];

    const visit = (node: ts.Node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        imports.push(node.moduleSpecifier.text);
      }
      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);

    for (const imp of imports) {
      if (imp.startsWith('.')) {
        // Local import
        const resolvedPath = path.resolve(path.dirname(filePath), imp);
        this.processFile(resolvedPath);
      } else {
        // NPM import
        // Handle @scope/pkg or pkg
        const parts = imp.split('/');
        const pkgName = imp.startsWith('@')
          ? `${parts[0]}/${parts[1]}`
          : parts[0];
        this.npmDeps.add(pkgName);
      }
    }
  }
}
