/**
 * Infrastructure Parser — Edge Network & Cloud Resource Detection
 *
 * Scans repository configuration files to detect deployment targets,
 * storage buckets, and cloud services. Automatically injects cloud gateway
 * nodes and media pipelines into the blueprint.
 */

import type { ParsedModule } from "./ast-parser";
import type { BlueprintNode, BlueprintEdge, BlueprintNodeType } from "./blueprint-analyzer";

export interface CloudResource {
  type: "storage" | "cdn" | "function" | "database" | "queue" | "gateway";
  provider: "vercel" | "aws" | "gcp" | "azure" | "cloudflare" | "supabase" | "netlify";
  name: string;
  config?: Record<string, unknown>;
}

export interface DetectedInfrastructure {
  resources: CloudResource[];
  deploymentTarget?: CloudResource;
  storageBuckets: CloudResource[];
  edgeFunctions: CloudResource[];
  cdnInstances: CloudResource[];
}

/**
 * Parse common configuration files for cloud resources.
 */
export function detectInfrastructure(modules: ParsedModule[]): DetectedInfrastructure {
  const resources: CloudResource[] = [];
  const storageBuckets: CloudResource[] = [];
  const edgeFunctions: CloudResource[] = [];
  const cdnInstances: CloudResource[] = [];
  let deploymentTarget: CloudResource | undefined;

  for (const mod of modules) {
    const path = mod.path.toLowerCase();
    const src = mod.source;

    // ── Vercel Configuration ──────────────────────────────────────
    if (path.includes("vercel.json") || path === "vercel.json") {
      deploymentTarget = {
        type: "gateway",
        provider: "vercel",
        name: "Vercel Edge Network",
      };
      resources.push(deploymentTarget);

      // Check for storage in vercel config
      if (src.includes("storage") || src.includes("blob")) {
        const bucket: CloudResource = {
          type: "storage",
          provider: "vercel",
          name: "Vercel Blob Storage",
        };
        storageBuckets.push(bucket);
        resources.push(bucket);
      }

      // Check for edge functions
      if (src.includes("functions") || src.includes("middleware")) {
        edgeFunctions.push({
          type: "function",
          provider: "vercel",
          name: "Vercel Edge Middleware",
        });
      }
    }

    // ── Next.js Config ───────────────────────────────────────────
    if (path.includes("next.config")) {
      // Vercel is default for Next.js
      if (!deploymentTarget) {
        deploymentTarget = {
          type: "gateway",
          provider: "vercel",
          name: "Vercel Edge Network",
        };
        resources.push(deploymentTarget);
      }
    }

    // ── Dockerfile ────────────────────────────────────────────────
    if (path.includes("dockerfile") || path.endsWith(".dockerfile")) {
      if (!deploymentTarget) {
        deploymentTarget = {
          type: "gateway",
          provider: "aws", // Generic container
          name: "Docker Container",
        };
        resources.push(deploymentTarget);
      }
    }

    // ── AWS / Terraform / CloudFormation ─────────────────────────
    if (
      path.includes("aws") ||
      path.includes("terraform") ||
      path.includes("cloudformation") ||
      path.endsWith(".tf") ||
      path.endsWith(".tfvars")
    ) {
      // S3 buckets
      const s3Match = src.match(/aws_s3_bucket[^"]*"([^"]+)"/g);
      if (s3Match) {
        for (const match of s3Match) {
          const nameMatch = match.match(/"([^"]+)"$/);
          if (nameMatch) {
            const bucket: CloudResource = {
              type: "storage",
              provider: "aws",
              name: `S3: ${nameMatch[1]}`,
            };
            storageBuckets.push(bucket);
            resources.push(bucket);
          }
        }
      }

      // Lambda functions
      if (src.includes("aws_lambda_function") || src.includes("Lambda")) {
        edgeFunctions.push({
          type: "function",
          provider: "aws",
          name: "AWS Lambda",
        });
      }

      // CloudFront CDN
      if (src.includes("cloudfront") || src.includes("CloudFront")) {
        const cdn: CloudResource = {
          type: "cdn",
          provider: "aws",
          name: "CloudFront CDN",
        };
        cdnInstances.push(cdn);
        resources.push(cdn);
      }
    }

    // ── Supabase Configuration ───────────────────────────────────
    if (path.includes("supabase") || src.includes("@supabase/supabase-js")) {
      // Supabase Storage
      if (src.includes(".storage.") || src.includes("createBucket") || src.includes("storage.from")) {
        const bucket: CloudResource = {
          type: "storage",
          provider: "supabase",
          name: "Supabase Storage",
        };
        storageBuckets.push(bucket);
        resources.push(bucket);
      }

      // Edge Functions (Supabase native)
      if (path.includes("/functions/") && path.endsWith(".ts")) {
        edgeFunctions.push({
          type: "function",
          provider: "supabase",
          name: `Supabase Edge Function`,
        });
      }
    }

    // ── Cloudflare Workers ───────────────────────────────────────
    if (path.includes("wrangler.toml") || path.includes("cloudflare-worker")) {
      if (!deploymentTarget) {
        deploymentTarget = {
          type: "gateway",
          provider: "cloudflare",
          name: "Cloudflare Workers",
        };
        resources.push(deploymentTarget);
      }

      // R2 Storage
      if (src.includes("r2") || src.includes("bucket")) {
        const bucket: CloudResource = {
          type: "storage",
          provider: "cloudflare",
          name: "Cloudflare R2",
        };
        storageBuckets.push(bucket);
        resources.push(bucket);
      }
    }

    // ── Netlify Configuration ─────────────────────────────────────
    if (path.includes("netlify.toml") || path.includes("netlify.")) {
      if (!deploymentTarget) {
        deploymentTarget = {
          type: "gateway",
          provider: "netlify",
          name: "Netlify Edge",
        };
        resources.push(deploymentTarget);
      }

      // Netlify Functions
      if (src.includes("functions") || path.includes("/netlify/functions/")) {
        edgeFunctions.push({
          type: "function",
          provider: "netlify",
          name: "Netlify Functions",
        });
      }
    }

    // ── Asset Upload Detection (Form-based file uploads) ──────────
    if (
      src.includes('type="file"') ||
      src.includes("FormData") ||
      src.includes("upload") ||
      src.includes("multipart/form-data")
    ) {
      // Track that this module handles file uploads
      mod.hasAssetUpload = true; // Extension to ParsedModule
    }
  }

  return {
    resources,
    deploymentTarget,
    storageBuckets,
    edgeFunctions,
    cdnInstances,
  };
}

/**
 * Create cloud gateway nodes for the blueprint.
 */
export function createCloudNodes(
  infrastructure: DetectedInfrastructure,
  existingNodes: BlueprintNode[]
): BlueprintNode[] {
  const cloudNodes: BlueprintNode[] = [];
  let yOffset = existingNodes.length > 0
    ? Math.max(...existingNodes.map((n) => n.y || 0)) + 160
    : 80;

  // Determine the center x position based on existing nodes
  const centerX = existingNodes.length > 0
    ? Math.max(...existingNodes.map((n) => n.x || 0)) + 300
    : 400;

  // Deployment gateway node
  if (infrastructure.deploymentTarget) {
    cloudNodes.push({
      type: "gateway" as BlueprintNodeType,
      shape: "document",
      accent: "orange",
      label: infrastructure.deploymentTarget.name,
      sub: infrastructure.deploymentTarget.provider.toUpperCase(),
      x: centerX,
      y: yOffset,
    });
    yOffset += 140;
  }

  // Storage bucket nodes
  for (const bucket of infrastructure.storageBuckets) {
    cloudNodes.push({
      type: "storage" as BlueprintNodeType,
      shape: "cylinder",
      accent: "blue",
      label: bucket.name,
      sub: bucket.provider.toUpperCase(),
      x: centerX,
      y: yOffset,
    });
    yOffset += 140;
  }

  // CDN nodes
  for (const cdn of infrastructure.cdnInstances) {
    cloudNodes.push({
      type: "cdn" as BlueprintNodeType,
      shape: "parallelogram",
      accent: "teal",
      label: cdn.name,
      sub: "CDN",
      x: centerX,
      y: yOffset,
    });
    yOffset += 140;
  }

  return cloudNodes;
}

/**
 * Create edges from frontend views to storage for asset uploads.
 */
export function createStorageEdges(
  modules: ParsedModule[],
  storageNodes: BlueprintNode[],
  viewNodes: BlueprintNode[]
): BlueprintEdge[] {
  const edges: BlueprintEdge[] = [];

  if (storageNodes.length === 0) return edges;

  // Find modules with asset uploads and create edges to storage
  for (const mod of modules) {
    const hasUpload =
      mod.source.includes('type="file"') ||
      mod.source.includes("FormData") ||
      mod.source.includes("multipart") ||
      mod.source.includes(".upload(");

    if (hasUpload) {
      // Find matching view node
      const viewNode = viewNodes.find(
        (n) =>
          mod.path.includes(n.label.replace("/", "")) ||
          mod.path.toLowerCase().includes(n.label.toLowerCase().replace("/", ""))
      );

      if (viewNode && storageNodes[0]) {
        edges.push({
          from: viewNode.x,
          to: storageNodes[0].x,
          label: "Asset Upload",
        });
      }
    }
  }

  return edges;
}

// Extend ParsedModule for infrastructure detection
declare module "./ast-parser" {
  interface ParsedModule {
    hasAssetUpload?: boolean;
  }
}
