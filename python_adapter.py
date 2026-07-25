#!/usr/bin/env python3
"""
Python Adapter for the Repodre visualization dashboard.

Parses a Python source file using the built-in `ast` module and emits a JSON
object describing nodes (functions, classes) and edges (function calls) that
the React dashboard can render directly.

Output format:
  {
    "nodes": [{"id": "qualified.name", "type": "function"|"class"}, ...],
    "edges": [{"source": "caller.id", "target": "callee.id"}, ...]
  }

Usage:
  python python_adapter.py path/to/file.py        # print JSON to stdout
  python python_adapter.py --test                 # run built-in self-test
"""

from __future__ import annotations

import ast
import json
import sys
from pathlib import Path


class DashboardVisitor(ast.NodeVisitor):
    """Walks a Python AST and collects dashboard nodes and edges.

    Nodes are created for every FunctionDef/AsyncFunctionDef and ClassDef,
    using dot-separated qualified names (e.g. ``Calculator.add``) so each
    id is unique.  Edges are created for every Call whose target resolves to
    a known node; the source is the innermost enclosing function.
    """

    def __init__(self) -> None:
        self.nodes: list[dict] = []
        self.edges: list[dict] = []
        # Stack of (qualified_name, node_type) for the current lexical scope.
        self._scope: list[tuple[str, str]] = []
        # Qualified names of enclosing classes, for ``self.method`` resolution.
        self._class_stack: list[str] = []
        self._seen_nodes: set[str] = set()
        self._seen_edges: set[tuple[str, str]] = set()

    # ── public API ──────────────────────────────────────────────────────

    def result(self) -> dict:
        """Return the final JSON-serializable result with edges filtered
        to only those whose target is a known node."""
        valid = self._seen_nodes
        edges = [
            e for e in self.edges
            if e["target"] in valid and e["source"] in valid
        ]
        return {"nodes": self.nodes, "edges": edges}

    # ── node visitors ────────────────────────────────────────────────────

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        qid = self._qualified(node.name)
        self._add_node(qid, "function")
        self._scope.append((qid, "function"))
        self.generic_visit(node)
        self._scope.pop()

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        qid = self._qualified(node.name)
        self._add_node(qid, "class")
        self._scope.append((qid, "class"))
        self._class_stack.append(qid)
        self.generic_visit(node)
        self._scope.pop()
        self._class_stack.pop()

    def visit_Call(self, node: ast.Call) -> None:
        target = self._resolve_target(node.func)
        caller = self._current_function()
        if target and caller:
            self._add_edge(caller, target)
        self.generic_visit(node)

    # ── helpers ──────────────────────────────────────────────────────────

    def _qualified(self, name: str) -> str:
        if self._scope:
            return self._scope[-1][0] + "." + name
        return name

    def _add_node(self, qid: str, ntype: str) -> None:
        if qid not in self._seen_nodes:
            self._seen_nodes.add(qid)
            self.nodes.append({"id": qid, "type": ntype})

    def _add_edge(self, source: str, target: str) -> None:
        key = (source, target)
        if key not in self._seen_edges:
            self._seen_edges.add(key)
            self.edges.append({"source": source, "target": target})

    def _current_function(self) -> str | None:
        """Return the qualified name of the innermost enclosing function."""
        for qid, ntype in reversed(self._scope):
            if ntype == "function":
                return qid
        return None

    def _resolve_target(self, func: ast.expr) -> str | None:
        """Resolve a Call's func expression to a target node id.

        - ``foo()``           -> ``foo``
        - ``self.method()``   -> ``ClassName.method``
        - ``obj.method()``    -> ``method``
        """
        if isinstance(func, ast.Name):
            return func.id
        if isinstance(func, ast.Attribute):
            if (
                isinstance(func.value, ast.Name)
                and func.value.id == "self"
                and self._class_stack
            ):
                return self._class_stack[-1] + "." + func.attr
            return func.attr
        return None


# ── CLI entry points ──────────────────────────────────────────────────────

def analyze_source(source: str) -> dict:
    """Parse Python source text and return the dashboard JSON dict."""
    tree = ast.parse(source)
    visitor = DashboardVisitor()
    visitor.visit(tree)
    return visitor.result()


def analyze_file(path: str | Path) -> dict:
    """Parse a Python file and return the dashboard JSON dict."""
    return analyze_source(Path(path).read_text(encoding="utf-8"))


def test_adapter() -> None:
    """Self-test: parse a small class with two methods and print the JSON."""
    source = """
class Calculator:
    def add(self, a, b):
        return a + b

    def calculate(self):
        return self.add(1, 2)
"""
    result = analyze_source(source)
    print(json.dumps(result, indent=2))


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("Usage: python python_adapter.py <file.py>  |  --test", file=sys.stderr)
        return 1

    if argv[1] == "--test":
        test_adapter()
        return 0

    path = argv[1]
    try:
        result = analyze_file(path)
    except FileNotFoundError:
        print(f"Error: file not found: {path}", file=sys.stderr)
        return 1
    except SyntaxError as exc:
        print(f"Error: could not parse {path}: {exc}", file=sys.stderr)
        return 1

    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
