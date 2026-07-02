/**
 * Environment Variable Dependency Scanner
 *
 * Scans source code for process.env.* tokens and configuration keys,
 * binding discovered environment variables to their respective file contexts.
 */

export interface EnvVariable {
  name: string;
  line?: number;
  context: string;
}

export interface EnvScanResult {
  variables: EnvVariable[];
  hasDefaults: boolean;
  requiredVars: string[];
  optionalVars: string[];
}

const PROCESS_ENV_PATTERN = /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g;
const IMPORT_META_ENV_PATTERN = /import\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)/g;
const DOTENV_PATTERN = /(?:config|dotenv)\s*\(\s*\{[^}]*path\s*:\s*['"`]([^'"`]+)['"`]/gi;

const CONFIG_KEY_PATTERNS = [
  /(?:NEXT_PUBLIC|VITE_|REACT_APP_|NUXT_ENV_|GATSBY_)([A-Za-z_][A-Za-z0-9_]*)/g,
  /getenv\s*\(\s*['"`]([A-Za-z_][A-Za-z0-9_]*)['"`]\s*\)/gi,
  /os\.getenv\s*\(\s*['"`]([A-Za-z_][A-Za-z0-9_]*)['"`]\s*\)/gi,
];

const OPTIONAL_PATTERN = /process\.env\.([A-Za-z_][A-Za-z0-9_]*)\s*\|\|/g;
const DEFAULT_VALUE_PATTERN = /process\.env\.([A-Za-z_][A-Za-z0-9_]*)\s*\?\?/g;

export function extractLineNumber(source: string, matchIndex: number): number {
  const beforeMatch = source.slice(0, matchIndex);
  return (beforeMatch.match(/\n/g) || []).length + 1;
}

export function scanForEnvVariables(source: string): EnvScanResult {
  const variables: EnvVariable[] = [];
  const seen = new Set<string>();

  // Extract process.env.* tokens
  let match: RegExpExecArray | null;
  const envPattern = new RegExp(PROCESS_ENV_PATTERN.source, 'g');
  while ((match = envPattern.exec(source)) !== null) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      variables.push({
        name,
        line: extractLineNumber(source, match.index),
        context: 'process.env',
      });
    }
  }

  // Extract import.meta.env.* tokens (Vite)
  const metaPattern = new RegExp(IMPORT_META_ENV_PATTERN.source, 'g');
  while ((match = metaPattern.exec(source)) !== null) {
    const name = match[1];
    const fullName = `VITE_${name}`;
    if (!seen.has(fullName)) {
      seen.add(fullName);
      variables.push({
        name: fullName,
        line: extractLineNumber(source, match.index),
        context: 'import.meta.env',
      });
    }
  }

  // Extract config key patterns
  for (const pattern of CONFIG_KEY_PATTERNS) {
    const configPattern = new RegExp(pattern.source, 'gi');
    while ((match = configPattern.exec(source)) !== null) {
      const name = match[1];
      if (!seen.has(name)) {
        seen.add(name);
        variables.push({
          name,
          line: extractLineNumber(source, match.index),
          context: 'config-key',
        });
      }
    }
  }

  // Determine which vars have defaults (optional vs required)
  const optionalVars: string[] = [];
  const optionalPattern = new RegExp(OPTIONAL_PATTERN.source, 'g');
  while ((match = optionalPattern.exec(source)) !== null) {
    optionalVars.push(match[1]);
  }

  const defaultPattern = new RegExp(DEFAULT_VALUE_PATTERN.source, 'g');
  while ((match = defaultPattern.exec(source)) !== null) {
    optionalVars.push(match[1]);
  }

  const requiredVars = variables
    .map(v => v.name)
    .filter(name => !optionalVars.includes(name));

  const uniqueOptionalVars = [...new Set(optionalVars)];

  return {
    variables,
    hasDefaults: optionalVars.length > 0,
    requiredVars: [...new Set(requiredVars)],
    optionalVars: uniqueOptionalVars,
  };
}

export function buildEnvMapForModules(
  modules: Array<{ path: string; source: string }>
): Map<string, EnvScanResult> {
  const envMap = new Map<string, EnvScanResult>();

  for (const mod of modules) {
    const result = scanForEnvVariables(mod.source);
    if (result.variables.length > 0) {
      const key = mod.path.split('/').pop()?.replace(/\.(ts|tsx|js|jsx)$/, '') || mod.path;
      envMap.set(key, result);
    }
  }

  return envMap;
}

export function getEnvVarsForNode(
  nodeLabel: string,
  envMap: Map<string, EnvScanResult>
): EnvScanResult | null {
  const normalizedLabel = nodeLabel.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const [key, result] of envMap) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalizedLabel.includes(normalizedKey) || normalizedKey.includes(normalizedLabel)) {
      return result;
    }
  }

  return null;
}
