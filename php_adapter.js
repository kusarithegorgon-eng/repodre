#!/usr/bin/env node
/**
 * PHP / Laravel Adapter for the Repodre visualization dashboard.
 *
 * Reads a PHP source file and emits a JSON object describing nodes
 * (classes, methods, functions, Eloquent models, route definitions) and
 * edges (method calls, route-to-controller bindings) that the React
 * dashboard can render directly.
 *
 * This is a regex-based parser that runs in pure Node.js with no external
 * dependencies — it does not require nikic/php-parser or Composer.
 *
 * Output format (identical to python_adapter.py):
 *   {
 *     "nodes": [{"id": "qualified.name", "type": "class"|"function"|"route"|"model"}, ...],
 *     "edges": [{"source": "caller.id", "target": "callee.id"}, ...]
 *   }
 *
 * Usage:
 *   node php_adapter.js path/to/file.php        # print JSON to stdout
 *   node php_adapter.js --test                  # run built-in self-test
 */

import { readFileSync } from "node:fs";
import { argv, exit } from "node:process";

// ── PHP / Laravel regex patterns ──────────────────────────────────────────

const CLASS_RE =
  /^(?:abstract\s+|final\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s\\]+))?\s*\{?/;

const METHOD_RE =
  /^(?:public\s+|private\s+|protected\s+|static\s+|final\s+|abstract\s+)*function\s+(\w+)\s*\(([^)]*)\)/;

// Route::get('/path', [Controller::class, 'method'])
const ROUTE_RE =
  /Route::(\w+)\(\s*['"]([^'"]+)['"]\s*,\s*(?:\[?([\w:\\]+)::class\s*,\s*['"](\w+)['"]\]?)\)/;

// $this->method(), $obj->method(), Class::staticMethod(), bare function()
const THIS_CALL_RE = /\$this->(\w+)\s*\(/;
const SELF_CALL_RE = /\bself::(\w+)\s*\(/;
const STATIC_CALL_RE = /([\w]+)::(\w+)\s*\(/;
const OBJ_CALL_RE = /\$(\w+)->(\w+)\s*\(/;
const BARE_CALL_RE = /(?<![\w>$:])([a-z_]\w*)\s*\(/;

// Eloquent / Laravel signatures
const ELOQUENT_PARENTS = new Set(["Model", "Eloquent", "Authenticatable"]);

// ── Parser ────────────────────────────────────────────────────────────────

class PhpDashboardParser {
  constructor() {
    this.nodes = [];
    this.edges = [];
    this._seenNodes = new Set();
    this._seenEdges = new Set();
    this._scope = [];
    this._classStack = [];
  }

  parse(source) {
    const lines = source.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const indent = this._getIndent(line);

      if (
        !trimmed ||
        trimmed.startsWith("//") ||
        trimmed.startsWith("#") ||
        trimmed.startsWith("*") ||
        trimmed.startsWith("/*") ||
        trimmed === "{" ||
        trimmed === "}"
      ) {
        continue
      }

      this._popScopes(indent);

      const classMatch = trimmed.match(CLASS_RE);
      if (classMatch) {
        this._handleClass(classMatch[1], classMatch[2] || null, indent);
        continue;
      }

      const methodMatch = trimmed.match(METHOD_RE);
      if (methodMatch) {
        this._handleMethod(methodMatch[1], indent);
        continue;
      }

      const routeMatch = trimmed.match(ROUTE_RE);
      if (routeMatch) {
        this._handleRoute(routeMatch);
        continue;
      }

      this._handleCalls(trimmed);
    }

    return this._result();
  }

  _getIndent(line) {
    const m = line.match(/^(\s+)/);
    return m ? m[1].length : 0;
  }

  _popScopes(indent) {
    while (this._scope.length > 0 && indent <= this._scope[this._scope.length - 1].indent) {
      const popped = this._scope.pop();
      if (popped.type === "class") this._classStack.pop();
    }
  }

  _qualified(name) {
    if (this._scope.length > 0) {
      return this._scope[this._scope.length - 1].name + "." + name;
    }
    return name;
  }

  _currentFunction() {
    for (let i = this._scope.length - 1; i >= 0; i--) {
      if (this._scope[i].type === "function") return this._scope[i].name;
    }
    return null;
  }

  _addNode(qid, type) {
    if (!this._seenNodes.has(qid)) {
      this._seenNodes.add(qid);
      this.nodes.push({ id: qid, type });
    }
  }

  _addEdge(source, target) {
    const key = source + "|" + target;
    if (!this._seenEdges.has(key)) {
      this._seenEdges.add(key);
      this.edges.push({ source, target });
    }
  }

  _handleClass(name, parent, indent) {
    const qid = this._qualified(name);
    let type = "class";
    if (parent && ELOQUENT_PARENTS.has(parent)) type = "model";
    this._addNode(qid, type);
    this._scope.push({ name: qid, indent, type: "class" });
    this._classStack.push(qid);
  }

  _handleMethod(name, indent) {
    const qid = this._qualified(name);
    this._addNode(qid, "function");
    this._scope.push({ name: qid, indent, type: "function" });
  }

  _handleRoute(match) {
    const verb = match[1];
    const uri = match[2];
    const controller = match[3];
    const method = match[4];
    const routeId = `Route.${verb}.${uri}`.replace(/[^a-zA-Z0-9_.]/g, "_");
    this._addNode(routeId, "route");
    const targetId = `${controller}.${method}`;
    this._addEdge(routeId, targetId);
  }

  _handleCalls(trimmed) {
    const caller = this._currentFunction();
    if (!caller) return;

    const targets = new Set();

    // $this->method() -> ClassName.method
    for (const m of trimmed.matchAll(new RegExp(THIS_CALL_RE.source, "g"))) {
      if (this._classStack.length > 0) {
        targets.add(this._classStack[this._classStack.length - 1] + "." + m[1]);
      }
    }

    // self::method() -> ClassName.method
    for (const m of trimmed.matchAll(new RegExp(SELF_CALL_RE.source, "g"))) {
      if (this._classStack.length > 0) {
        targets.add(this._classStack[this._classStack.length - 1] + "." + m[1]);
      }
    }

    // Class::staticMethod() -> Class.method (and edge to the class itself)
    for (const m of trimmed.matchAll(new RegExp(STATIC_CALL_RE.source, "g"))) {
      const className = m[1];
      const methodTarget = `${className}.${m[2]}`;
      targets.add(methodTarget);
      // Also edge to the class node so cross-file calls show up
      // even when the method is inherited (e.g. Model::all())
      targets.add(className);
    }

    // $obj->method() -> obj.method (best-effort)
    for (const m of trimmed.matchAll(new RegExp(OBJ_CALL_RE.source, "g"))) {
      targets.add(`${m[1]}.${m[2]}`);
    }

    // bare function() -> function
    for (const m of trimmed.matchAll(new RegExp(BARE_CALL_RE.source, "g"))) {
      targets.add(m[1]);
    }

    for (const target of targets) {
      this._addEdge(caller, target);
    }
  }

  _result() {
    const valid = this._seenNodes;
    const edges = this.edges.filter(
      (e) => valid.has(e.source) && valid.has(e.target)
    );
    return { nodes: this.nodes, edges };
  }
}

// ── CLI entry points ───────────────────────────────────────────────────────

function analyzeSource(source) {
  const parser = new PhpDashboardParser();
  return parser.parse(source);
}

function analyzeFile(filePath) {
  const source = readFileSync(filePath, "utf-8");
  return analyzeSource(source);
}

function testAdapter() {
  const source = `<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Model;

class User extends Model
{
    public function posts()
    {
        return $this->hasMany(Post::class);
    }
}

<?php

namespace App\\Http\\Controllers;

use App\\Models\\User;
use Illuminate\\Http\\Request;

class UserController extends Controller
{
    public function index()
    {
        $users = User::all();
        return $this->respond($users);
    }

    public function show($id)
    {
        $user = User::find($id);
        return $this->respond($user);
    }

    private function respond($data)
    {
        return response()->json($data);
    }
}

Route::get('/users', [UserController::class, 'index']);
Route::get('/users/{id}', [UserController::class, 'show']);
`;

  const result = analyzeSource(source);
  console.log(JSON.stringify(result, null, 2));
}

function main(args) {
  if (args.length < 3) {
    console.error("Usage: node php_adapter.js <file.php>  |  --test");
    return 1;
  }

  if (args[2] === "--test") {
    testAdapter();
    return 0;
  }

  const filePath = args[2];
  try {
    const result = analyzeFile(filePath);
    console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (err) {
    if (err.code === "ENOENT") {
      console.error("Error: file not found: " + filePath);
    } else {
      console.error("Error: " + (err.message || String(err)));
    }
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  exit(main(argv));
}

export { PhpDashboardParser, analyzeSource, analyzeFile };
