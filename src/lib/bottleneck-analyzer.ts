/**
 * Bottleneck Heuristics Engine — Pipeline Latency Analyzer
 *
 * Scans controller source code for heavy sequential operations that
 * could benefit from async delegation (queues, workers, caching).
 * Flags synchronous bottlenecks and generates advisory warnings.
 */

import type { ParsedModule } from "./ast-parser";

export interface BottleneckWarning {
  type: "sync_db_chain" | "sync_payment" | "sync_email" | "sync_heavy_loop";
  severity: "high" | "medium" | "low";
  modulePath: string;
  line?: number;
  description: string;
  recommendation: string;
  detectedPatterns: string[];
}

export interface BottleneckAnalysis {
  warnings: BottleneckWarning[];
  hasAsyncDelegation: boolean;
  delegationLibraries: string[];
}

const ASYNC_DELEGATION_PATTERNS = [
  /bull|bullmq/i,
  /redis/i,
  /rabbitmq|amqp/i,
  /sidekiq/i,
  /celery/i,
  /kafka/i,
  /queue/i,
  /worker/i,
  /background.?task/i,
  /edge.?function/i,
  /serverless.?function/i,
];

const SYNC_DB_PATTERNS = [
  /await\s+\w+\.insert/,
  /await\s+\w+\.update/,
  /await\s+\w+\.delete/,
  /await\s+\w+\.create/,
  /await\s+\w+\.save/,
  /\.query\(/g,
  /\.execute\(/g,
  /prisma\.\w+\.(create|update|delete|upsert)/,
  /supabase.*\.(insert|update|delete|upsert)/,
  /knex\((insert|update|delete)/,
  /sequelize.*(create|update|destroy)/,
];

const PAYMENT_PATTERNS = [
  /stripe\.(charges|customers|payments|invoices)/i,
  /paypal/i,
  /braintree/i,
  /square\./i,
  /payment.*process/i,
  /charge.*create/i,
];

const EMAIL_PATTERNS = [
  /sendgrid/i,
  /mailgun/i,
  /postmark/i,
  /ses\.send/i,
  /nodemailer/i,
  /resend/i,
  /brevo/i,
  /smtp.*send/i,
];

const HEAVY_LOOP_PATTERNS = [
  /for\s*\(.*await/g,
  /for await/g,
  /\.map\s*\(\s*async/g,
  /\.forEach\s*\(\s*async/g,
  /Promise\.all/g,
  /\.map\(.*await/g,
];

function detectAsyncDelegation(source: string): { has: boolean; libs: string[] } {
  const libs: string[] = [];

  for (const pattern of ASYNC_DELEGATION_PATTERNS) {
    if (pattern.test(source)) {
      const match = source.match(pattern);
      if (match) {
        libs.push(match[0]);
      }
    }
  }

  return {
    has: libs.length > 0,
    libs: [...new Set(libs)],
  };
}

function countSequentialDbOperations(source: string): number {
  let count = 0;

  for (const pattern of SYNC_DB_PATTERNS) {
    const matches = source.match(pattern);
    if (matches) {
      count += matches.length;
    }
  }

  return count;
}

function hasPaymentProcessing(source: string): boolean {
  return PAYMENT_PATTERNS.some(pattern => pattern.test(source));
}

function hasEmailDispatch(source: string): boolean {
  return EMAIL_PATTERNS.some(pattern => pattern.test(source));
}

function hasHeavyAsyncLoop(source: string): boolean {
  return HEAVY_LOOP_PATTERNS.some(pattern => pattern.test(source));
}

function extractLineNumber(source: string, pattern: RegExp): number | undefined {
  const match = source.match(pattern);
  if (!match || match.index === undefined) return undefined;

  const beforeMatch = source.slice(0, match.index);
  return (beforeMatch.match(/\n/g) || []).length + 1;
}

export function analyzeModuleForBottlenecks(
  mod: ParsedModule
): BottleneckWarning[] {
  const warnings: BottleneckWarning[] = [];
  const source = mod.source;
  const path = mod.path;

  const delegation = detectAsyncDelegation(source);
  const dbOpsCount = countSequentialDbOperations(source);
  const hasPayments = hasPaymentProcessing(source);
  const hasEmail = hasEmailDispatch(source);
  const hasHeavyLoops = hasHeavyAsyncLoop(source);

  if (delegation.has) {
    return warnings;
  }

  if (dbOpsCount >= 3) {
    warnings.push({
      type: "sync_db_chain",
      severity: dbOpsCount >= 5 ? "high" : "medium",
      modulePath: path,
      description: `Detected ${dbOpsCount} sequential database operations without async delegation`,
      recommendation:
        "Consider batching operations or offloading to a background worker queue (BullMQ, Redis) to reduce Time-To-First-Byte",
      detectedPatterns: [`Sequential DB ops: ${dbOpsCount}`],
    });
  }

  if (hasPayments && !delegation.has) {
    warnings.push({
      type: "sync_payment",
      severity: "high",
      modulePath: path,
      description: "Synchronous payment processing detected without background worker delegation",
      recommendation:
        "Move payment processing to a background job queue to prevent request timeouts and improve reliability",
      detectedPatterns: ["Payment API calls"],
    });
  }

  if (hasEmail && dbOpsCount > 0 && !delegation.has) {
    warnings.push({
      type: "sync_email",
      severity: "medium",
      modulePath: path,
      description: "Email dispatch combined with database operations in synchronous flow",
      recommendation:
        "Offload email sending to a message queue for better latency and retry handling",
      detectedPatterns: ["Email service calls"],
    });
  }

  if (hasHeavyLoops && dbOpsCount > 2 && !delegation.has) {
    warnings.push({
      type: "sync_heavy_loop",
      severity: "medium",
      modulePath: path,
      description: "Heavy async iteration detected with multiple database operations",
      recommendation:
        "Consider streaming results or using cursor-based pagination to reduce memory footprint",
      detectedPatterns: ["Async iteration with DB ops"],
    });
  }

  return warnings;
}

export function analyzeBottlenecks(
  modules: ParsedModule[]
): BottleneckAnalysis {
  const allWarnings: BottleneckWarning[] = [];
  const allDelegationLibs: string[] = [];
  let hasAnyAsyncDelegation = false;

  for (const mod of modules) {
    const delegation = detectAsyncDelegation(mod.source);
    if (delegation.has) {
      hasAnyAsyncDelegation = true;
      allDelegationLibs.push(...delegation.libs);
    }

    const moduleWarnings = analyzeModuleForBottlenecks(mod);
    allWarnings.push(...moduleWarnings);
  }

  return {
    warnings: allWarnings,
    hasAsyncDelegation: hasAnyAsyncDelegation,
    delegationLibraries: [...new Set(allDelegationLibs)],
  };
}

export function getControllerBottleneckMap(
  modules: ParsedModule[]
): Map<string, BottleneckWarning[]> {
  const map = new Map<string, BottleneckWarning[]>();

  for (const mod of modules) {
    const warnings = analyzeModuleForBottlenecks(mod);
    if (warnings.length > 0) {
      const controllerKey = mod.path.split("/").pop()?.replace(/\.(ts|tsx|js|jsx)$/, "") || mod.path;
      map.set(controllerKey, warnings);
    }
  }

  return map;
}

export function hasBottleneckWarning(
  nodeLabel: string,
  bottleneckMap: Map<string, BottleneckWarning[]>
): boolean {
  for (const [key, warnings] of bottleneckMap) {
    if (warnings.length > 0) {
      const normalizedLabel = nodeLabel.toLowerCase().replace(/[^a-z0-9]/g, "");
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (normalizedLabel.includes(normalizedKey) || normalizedKey.includes(normalizedLabel)) {
        return true;
      }
    }
  }
  return false;
}

export function getWarningsForNode(
  nodeLabel: string,
  bottleneckMap: Map<string, BottleneckWarning[]>
): BottleneckWarning[] {
  const matchingWarnings: BottleneckWarning[] = [];

  for (const [key, warnings] of bottleneckMap) {
    const normalizedLabel = nodeLabel.toLowerCase().replace(/[^a-z0-9]/g, "");
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normalizedLabel.includes(normalizedKey) || normalizedKey.includes(normalizedLabel)) {
      matchingWarnings.push(...warnings);
    }
  }

  return matchingWarnings;
}
