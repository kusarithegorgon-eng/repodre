/**
 * API Test Suite Generator — Postman Collection & HTTP File Export
 *
 * Parses discovered backend endpoint controllers and validation schemas
 * to generate a valid Postman Collection v2.1 JSON file or HTTP file
 * pre-configured with mock payloads matching required schema inputs.
 */

import type { DetectedController } from "./blueprint-analyzer";
import type { ParsedModule } from "./ast-parser";

export interface TestEndpoint {
  method: string;
  path: string;
  name: string;
  description?: string;
  requestBody?: {
    contentType: string;
    schema: Record<string, SchemaField>;
    example: Record<string, unknown>;
  };
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
}

export interface SchemaField {
  type: string;
  required: boolean;
  defaultValue?: unknown;
  example?: unknown;
  description?: string;
}

export interface PostmanCollection {
  info: {
    _postman_id: string;
    name: string;
    description: string;
    schema: string;
  };
  item: PostmanItem[];
  variable: PostmanVariable[];
}

export interface PostmanItem {
  name: string;
  request: {
    method: string;
    header: PostmanHeader[];
    body?: {
      mode: string;
      raw: string;
      options: {
        raw: {
          language: string;
        };
      };
    };
    url: {
      raw: string;
      host: string[];
      path: string[];
      query?: PostmanQueryParam[];
    };
    description?: string;
  };
}

export interface PostmanHeader {
  key: string;
  value: string;
}

export interface PostmanQueryParam {
  key: string;
  value: string;
}

export interface PostmanVariable {
  key: string;
  value: string;
}

/**
 * Generate mock data for a schema field.
 */
function generateMockValue(field: SchemaField): unknown {
  if (field.example !== undefined) return field.example;

  switch (field.type.toLowerCase()) {
    case "string":
    case "text":
      // Smart generation based on field name
      if (field.defaultValue !== undefined) return field.defaultValue;
      const name = (field as SchemaField & { name?: string }).name || "";
      if (name.includes("email")) return "user@example.com";
      if (name.includes("password")) return "SecureP@ss123";
      if (name.includes("name")) return "John Doe";
      if (name.includes("phone")) return "+1-555-123-4567";
      if (name.includes("url")) return "https://example.com";
      if (name.includes("id")) return "clx123456789";
      if (name.includes("date")) return new Date().toISOString().split("T")[0];
      return "sample_string";
    case "integer":
    case "number":
    case "int":
      return 1;
    case "float":
    case "double":
    case "decimal":
      return 1.5;
    case "boolean":
    case "bool":
      return true;
    case "array":
      return [];
    case "object":
      return {};
    case "date":
    case "timestamp":
      return new Date().toISOString();
    case "uuid":
      return "00000000-0000-0000-0000-000000000000";
    default:
      return null;
  }
}

/**
 * Extract schema from validation source (Zod, Yup, etc.).
 */
function extractSchemaFromValidation(source: string, endpoint: string): Record<string, SchemaField> | null {
  const fields: Record<string, SchemaField> = {};

  // Zod patterns
  const zodPatterns = [
    /z\.string\(\)(?:\.(\w+)\(\))?/g,
    /z\.number\(\)/g,
    /z\.boolean\(\)/g,
    /z\.email\(\)/g,
    /z\.min\((\d+)\)/g,
    /z\.max\((\d+)\)/g,
    /z\.required\(\)/g,
  ];

  // Extract field names and types from Zod schema
  const fieldMatch = source.matchAll(/(\w+):\s*z\.(string|number|boolean|email|array|object|date|uuid)/g);
  for (const match of fieldMatch) {
    const name = match[1];
    const type = match[2];
    fields[name] = {
      type: type === "email" ? "string" : type,
      required: source.slice(match.index!, match.index! + 100).includes(".min(") ||
               source.slice(match.index!, match.index! + 100).includes("required"),
      example: generateMockValue({ type, required: true, name } as SchemaField & { name: string }),
    };
  }

  // If no fields found, try to infer from typical login/signup patterns
  if (Object.keys(fields).length === 0) {
    const lowerSource = source.toLowerCase();
    if (lowerSource.includes("login") || lowerSource.includes("signin")) {
      fields.email = { type: "string", required: true, example: "user@example.com" };
      fields.password = { type: "string", required: true, example: "SecureP@ss123" };
    }
    if (lowerSource.includes("register") || lowerSource.includes("signup") || lowerSource.includes("create")) {
      fields.email = { type: "string", required: true, example: "newuser@example.com" };
      fields.password = { type: "string", required: true, example: "NewSecureP@ss123" };
      fields.name = { type: "string", required: false, example: "John Doe" };
    }
    if (lowerSource.includes("user") || lowerSource.includes("profile")) {
      fields.email = { type: "string", required: true, example: "user@example.com" };
      fields.name = { type: "string", required: false, example: "John Doe" };
    }
  }

  return Object.keys(fields).length > 0 ? fields : null;
}

/**
 * Generate test endpoints from controllers.
 */
export function generateTestEndpoints(
  controllers: DetectedController[],
  modules: ParsedModule[]
): TestEndpoint[] {
  const endpoints: TestEndpoint[] = [];

  for (const ctrl of controllers) {
    for (const method of ctrl.methods) {
      if (method === "HANDLER") {
        // Pages Router - assume POST/GET based on typical patterns
        endpoints.push({
          method: "POST",
          path: ctrl.key,
          name: `${method} ${ctrl.key}`,
          description: `Auto-generated test for ${ctrl.path}`,
          requestBody: {
            contentType: "application/json",
            schema: { email: { type: "string", required: true }, password: { type: "string", required: true } },
            example: { email: "test@example.com", password: "password123" },
          },
          headers: {
            "Content-Type": "application/json",
          },
        });
        continue;
      }

      const endpoint: TestEndpoint = {
        method: method.toUpperCase(),
        path: ctrl.key,
        name: `${method.toUpperCase()} ${ctrl.key}`,
        description: `Controller: ${ctrl.path}`,
        headers: {
          "Content-Type": "application/json",
        },
      };

      // Try to find schema for validation
      const pathParts = ctrl.path.split("/");
      const routeName = pathParts[pathParts.length - 2] || pathParts[pathParts.length - 1];

      for (const mod of modules) {
        const hasThisEndpoint = mod.source.includes(ctrl.key) || mod.path.toLowerCase().includes(routeName);
        if (hasThisEndpoint && (mod.source.includes("z.") || mod.source.includes("yup."))) {
          const schema = extractSchemaFromValidation(mod.source, ctrl.key);
          if (schema) {
            const example: Record<string, unknown> = {};
            for (const [name, field] of Object.entries(schema)) {
              example[name] = field.example || generateMockValue(field);
            }
            endpoint.requestBody = {
              contentType: "application/json",
              schema,
              example,
            };
          }
          break;
        }
      }

      // Default request body for POST/PUT/PATCH
      if (!endpoint.requestBody && ["POST", "PUT", "PATCH"].includes(method)) {
        endpoint.requestBody = {
          contentType: "application/json",
          schema: {
            data: { type: "object", required: true },
          },
          example: {
            data: {},
          },
        };
      }

      endpoints.push(endpoint);
    }
  }

  return endpoints;
}

/**
 * Generate a Postman Collection v2.1 from test endpoints.
 */
export function generatePostmanCollection(
  endpoints: TestEndpoint[],
  projectName: string
): PostmanCollection {
  const collectionId = `repodre_${Date.now()}`;
  const baseUrl = "{{base_url}}";

  const items: PostmanItem[] = endpoints.map((ep) => ({
    name: ep.name,
    request: {
      method: ep.method,
      header: [
        { key: "Content-Type", value: ep.headers?.["Content-Type"] || "application/json" },
        ...(ep.requestBody?.contentType === "application/json"
          ? [{ key: "Accept", value: "application/json" }]
          : []),
      ],
      body: ep.requestBody
        ? {
            mode: "raw",
            raw: JSON.stringify(ep.requestBody.example, null, 2),
            options: {
              raw: {
                language: "json",
              },
            },
          }
        : undefined,
      url: {
        raw: `${baseUrl}${ep.path}`,
        host: [baseUrl],
        path: ep.path.split("/").filter(Boolean),
        query: ep.queryParams
          ? Object.entries(ep.queryParams).map(([k, v]) => ({ key: k, value: v }))
          : undefined,
      },
      description: ep.description,
    },
  }));

  return {
    info: {
      _postman_id: collectionId,
      name: `${projectName} API Tests`,
      description: "Auto-generated API test suite from Repodre analysis",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: items,
    variable: [
      { key: "base_url", value: "http://localhost:3000" },
      { key: "api_key", value: "" },
    ],
  };
}

/**
 * Generate an HTTP file (for VS Code REST Client or IntelliJ).
 */
export function generateHttpFile(
  endpoints: TestEndpoint[],
  projectName: string
): string {
  const lines: string[] = [
    `# ${projectName} API Tests`,
    `# Generated by Repodre on ${new Date().toISOString().split("T")[0]}`,
    "",
    "@base_url = http://localhost:3000",
    "@content_type = application/json",
    "",
  ];

  for (const ep of endpoints) {
    lines.push(`### ${ep.name}`);
    if (ep.description) {
      lines.push(`# ${ep.description}`);
    }
    lines.push("");

    const filePath = ep.path.split("/").filter(Boolean);
    const url = `{{base_url}}/${filePath.join("/")}`;

    lines.push(`${ep.method} ${url}`);
    lines.push("Content-Type: {{content_type}}");

    if (ep.requestBody) {
      lines.push("");
      lines.push(JSON.stringify(ep.requestBody.example, null, 2));
    }

    lines.push("");
    lines.push("###");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Download a Postman Collection JSON file.
 */
export function downloadPostmanCollection(
  collection: PostmanCollection,
  filename = "api-tests.postman_collection.json"
): void {
  const json = JSON.stringify(collection, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Download an HTTP file.
 */
export function downloadHttpFile(
  content: string,
  filename = "api-tests.http"
): void {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
