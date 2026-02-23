import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

type ImportMap = Map<string, Set<string>>;

type BackendMount = {
  mountPath: string;
  routerSymbol: string;
  sourceFile: string | null;
};

type FrontendRoute = {
  path: string;
  component: string | null;
};

const ROOT = process.cwd();
const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"];
const IGNORE_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  "test-results",
  "tmp",
  ".venv",
  ".vscode",
  ".devcontainer",
  ".claude",
  ".local",
  "storage",
  "attached_assets",
]);
const IGNORE_PATH_PREFIXES = [
  ".git/",
  "dist/",
  "build/",
  "node_modules/",
  "coverage/",
  "test-results/",
  "tmp/",
  ".venv/",
  ".vscode/",
  ".devcontainer/",
  ".claude/",
  ".local/",
  "storage/",
  "attached_assets/",
];

function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

function rel(absPath: string): string {
  return toPosix(path.relative(ROOT, absPath));
}

function abs(relPath: string): string {
  return path.resolve(ROOT, relPath);
}

function fileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isCodeFile(filePath: string): boolean {
  return CODE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function shouldIgnoreDirectory(dirPath: string): boolean {
  const relPath = rel(dirPath);
  const baseName = path.basename(dirPath);
  if (IGNORE_DIR_NAMES.has(baseName)) {
    return true;
  }
  return IGNORE_PATH_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

function walkCodeFiles(startDir: string, out: string[]): void {
  if (!fs.existsSync(startDir)) return;
  if (shouldIgnoreDirectory(startDir)) return;

  const entries = fs.readdirSync(startDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(startDir, entry.name);
    if (entry.isDirectory()) {
      walkCodeFiles(fullPath, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!isCodeFile(fullPath)) continue;
    out.push(fullPath);
  }
}

function extractSpecifiers(sourceText: string): string[] {
  const specs = new Set<string>();
  const patterns = [
    /\bimport\s+[^"'`]*?\s+from\s+["'`]([^"'`]+)["'`]/g,
    /\bexport\s+[^"'`]*?\s+from\s+["'`]([^"'`]+)["'`]/g,
    /\bimport\s*["'`]([^"'`]+)["'`]/g,
    /\brequire\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
    /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null = null;
    while ((match = pattern.exec(sourceText)) !== null) {
      if (match[1]) specs.add(match[1]);
    }
  }
  return [...specs];
}

function stripQueryAndHash(spec: string): string {
  return spec.replace(/[?#].*$/, "");
}

function candidateBases(fromFileAbs: string, specifier: string): string[] {
  const clean = stripQueryAndHash(specifier);
  if (!clean) return [];

  if (clean.startsWith(".")) {
    return [path.resolve(path.dirname(fromFileAbs), clean)];
  }
  if (clean.startsWith("@/")) {
    return [path.resolve(ROOT, "client", "src", clean.slice(2))];
  }
  if (clean === "@") {
    return [path.resolve(ROOT, "client", "src", "index")];
  }
  if (clean.startsWith("@shared/")) {
    return [path.resolve(ROOT, "shared", clean.slice("@shared/".length))];
  }
  if (clean === "@shared") {
    return [path.resolve(ROOT, "shared", "index")];
  }
  if (clean.startsWith("server/") || clean.startsWith("client/") || clean.startsWith("shared/") || clean.startsWith("src/")) {
    return [path.resolve(ROOT, clean)];
  }
  if (clean.startsWith("/")) {
    return [path.resolve(ROOT, clean.slice(1))];
  }
  return [];
}

function resolveCandidateToFile(base: string): string | null {
  const tried = new Set<string>();
  const candidates: string[] = [];
  const baseExt = path.extname(base).toLowerCase();
  const baseWithoutExt = baseExt ? base.slice(0, -baseExt.length) : base;

  const push = (p: string) => {
    const normalized = path.normalize(p);
    if (!tried.has(normalized)) {
      tried.add(normalized);
      candidates.push(normalized);
    }
  };

  push(base);
  for (const ext of RESOLVE_EXTENSIONS) {
    push(`${base}${ext}`);
  }
  for (const ext of RESOLVE_EXTENSIONS) {
    push(path.join(base, `index${ext}`));
  }

  // Allow TS source resolution when code imports .js/.mjs/.cjs transpiled paths.
  if ([".js", ".mjs", ".cjs", ".jsx"].includes(baseExt)) {
    for (const ext of [".ts", ".tsx", ".js", ".mjs", ".cjs", ".jsx"]) {
      push(`${baseWithoutExt}${ext}`);
    }
    for (const ext of [".ts", ".tsx", ".js", ".mjs", ".cjs", ".jsx"]) {
      push(path.join(baseWithoutExt, `index${ext}`));
    }
  }

  for (const candidate of candidates) {
    if (!fileExists(candidate)) continue;
    if (!isCodeFile(candidate)) continue;
    return candidate;
  }
  return null;
}

function resolveImportFile(fromFileAbs: string, specifier: string): string | null {
  const bases = candidateBases(fromFileAbs, specifier);
  for (const base of bases) {
    const resolved = resolveCandidateToFile(base);
    if (resolved) return resolved;
  }
  return null;
}

function buildImportGraph(allCodeFilesAbs: string[]): ImportMap {
  const allRel = allCodeFilesAbs.map((p) => rel(p));
  const known = new Set(allRel);
  const graph: ImportMap = new Map<string, Set<string>>();

  for (const fileAbs of allCodeFilesAbs) {
    const fileRel = rel(fileAbs);
    graph.set(fileRel, new Set<string>());

    let sourceText = "";
    try {
      sourceText = fs.readFileSync(fileAbs, "utf8");
    } catch {
      continue;
    }

    const specs = extractSpecifiers(sourceText);
    for (const spec of specs) {
      const resolvedAbs = resolveImportFile(fileAbs, spec);
      if (!resolvedAbs) continue;
      const resolvedRel = rel(resolvedAbs);
      if (!known.has(resolvedRel)) continue;
      graph.get(fileRel)?.add(resolvedRel);
    }
  }
  return graph;
}

function traverseReachable(graph: ImportMap, entrypoints: string[]): Set<string> {
  const visited = new Set<string>();
  const stack: string[] = [];

  for (const entry of entrypoints) {
    if (graph.has(entry)) stack.push(entry);
  }

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const neighbors = graph.get(current);
    if (!neighbors) continue;
    for (const next of neighbors) {
      if (!visited.has(next)) stack.push(next);
    }
  }
  return visited;
}

function extractScriptEntrypointsFromPackageJson(): string[] {
  const pkgPath = abs("package.json");
  if (!fileExists(pkgPath)) return [];

  try {
    const parsed = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> };
    const scripts = parsed.scripts ?? {};
    const out = new Set<string>();
    const pattern = /([A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx|mjs|cjs))/g;

    for (const cmd of Object.values(scripts)) {
      let match: RegExpExecArray | null = null;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(cmd)) !== null) {
        const maybe = match[1];
        const maybeAbs = abs(maybe);
        if (!fileExists(maybeAbs)) continue;
        if (!isCodeFile(maybeAbs)) continue;
        out.add(rel(maybeAbs));
      }
    }
    return [...out].sort();
  } catch {
    return [];
  }
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function parseBackendRoutes(routesRelPath: string): {
  mounts: BackendMount[];
  importedRouteFiles: string[];
  mountedRouteFiles: string[];
} {
  const routeFileAbs = abs(routesRelPath);
  if (!fileExists(routeFileAbs)) {
    return { mounts: [], importedRouteFiles: [], mountedRouteFiles: [] };
  }

  const sourceText = fs.readFileSync(routeFileAbs, "utf8");
  const sourceFile = ts.createSourceFile(routeFileAbs, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const symbolToModule = new Map<string, string>();

  const registerImport = (localName: string, moduleSpecifier: string) => {
    symbolToModule.set(localName, moduleSpecifier);
  };

  const importVisitor = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const moduleSpecifier = node.moduleSpecifier.text;
      if (!moduleSpecifier.startsWith("./routes/")) {
        return;
      }
      const clause = node.importClause;
      if (!clause) return;

      if (clause.name) {
        registerImport(clause.name.text, moduleSpecifier);
      }

      if (clause.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings)) {
          registerImport(clause.namedBindings.name.text, moduleSpecifier);
        } else if (ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) {
            registerImport(element.name.text, moduleSpecifier);
          }
        }
      }
    }
    ts.forEachChild(node, importVisitor);
  };
  importVisitor(sourceFile);

  const mounts: BackendMount[] = [];
  const mountVisitor = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "app" &&
      node.expression.name.text === "use"
    ) {
      const args = node.arguments;
      if (args.length > 0) {
        let mountPath = "(no-prefix)";
        for (const arg of args) {
          if (ts.isStringLiteralLike(arg)) {
            mountPath = arg.text;
            break;
          }
        }

        const lastArg = args[args.length - 1];
        if (ts.isIdentifier(lastArg)) {
          const symbol = lastArg.text;
          const moduleSpec = symbolToModule.get(symbol);
          let sourceRel: string | null = null;
          if (moduleSpec) {
            const resolved = resolveImportFile(routeFileAbs, moduleSpec);
            sourceRel = resolved ? rel(resolved) : null;
          }
          mounts.push({
            mountPath,
            routerSymbol: symbol,
            sourceFile: sourceRel,
          });
        }
      }
    }
    ts.forEachChild(node, mountVisitor);
  };
  mountVisitor(sourceFile);

  const importedRouteFiles = uniqueSorted(
    [...symbolToModule.values()]
      .map((moduleSpec) => resolveImportFile(routeFileAbs, moduleSpec))
      .filter((v): v is string => !!v)
      .map((v) => rel(v))
  );
  const mountedRouteFiles = uniqueSorted(
    mounts.map((m) => m.sourceFile).filter((v): v is string => !!v)
  );

  return {
    mounts,
    importedRouteFiles,
    mountedRouteFiles,
  };
}

function parseFrontendRoutes(appRelPath: string): FrontendRoute[] {
  const appAbs = abs(appRelPath);
  if (!fileExists(appAbs)) return [];

  const sourceText = fs.readFileSync(appAbs, "utf8");
  const sourceFile = ts.createSourceFile(appAbs, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const routes: FrontendRoute[] = [];

  function tagNameOf(node: ts.JsxOpeningLikeElement): string {
    if (ts.isIdentifier(node.tagName)) return node.tagName.text;
    return node.tagName.getText(sourceFile);
  }

  function attrValueOf(node: ts.JsxOpeningLikeElement, attrName: string): string | null {
    for (const attr of node.attributes.properties) {
      if (!ts.isJsxAttribute(attr)) continue;
      if (attr.name.text !== attrName) continue;
      if (!attr.initializer) return "";
      if (ts.isStringLiteral(attr.initializer)) return attr.initializer.text;
      if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
        return attr.initializer.expression.getText(sourceFile);
      }
      return attr.initializer.getText(sourceFile);
    }
    return null;
  }

  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node)) {
      if (tagNameOf(node) === "Route") {
        routes.push({
          path: attrValueOf(node, "path") ?? "(no-path)",
          component: attrValueOf(node, "component"),
        });
      }
    } else if (ts.isJsxOpeningElement(node)) {
      if (tagNameOf(node) === "Route") {
        routes.push({
          path: attrValueOf(node, "path") ?? "(no-path)",
          component: attrValueOf(node, "component"),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return routes;
}

function isCoreOperationalDomain(file: string): boolean {
  if (file.startsWith("server/")) {
    if (file.startsWith("server/tests/")) return false;
    if (file.startsWith("server/__tests__/")) return false;
    if (file.startsWith("server/scripts/")) return false;
    if (file.startsWith("server/migrations/")) return false;
    if (file.includes("/__tests__/")) return false;
    return true;
  }
  if (file.startsWith("client/src/")) {
    if (file.includes("/__tests__/")) return false;
    if (file.includes("/integration-tests/")) return false;
    return true;
  }
  if (file.startsWith("shared/")) {
    if (file.includes("/__tests__/")) return false;
    return true;
  }
  if (file.startsWith("src/")) {
    if (file.includes("/__tests__/")) return false;
    return true;
  }
  return false;
}

function matchCategory(file: string, regex: RegExp): boolean {
  return regex.test(file);
}

function takeFirst(values: string[], limit: number): string[] {
  return values.slice(0, Math.max(0, limit));
}

function buildMarkdownReport(report: any): string {
  const lines: string[] = [];
  lines.push("# Active File Audit");
  lines.push("");
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Entrypoints");
  lines.push("");
  lines.push(`- Core runtime: ${report.entrypoints.coreRuntime.join(", ") || "(none)"}`);
  lines.push(`- Package script files discovered: ${report.entrypoints.packageScript.length}`);
  lines.push("");
  lines.push("## Counts");
  lines.push("");
  lines.push(`- Total code files scanned: ${report.counts.totalCodeFiles}`);
  lines.push(`- Runtime reachable files: ${report.counts.runtimeReachable}`);
  lines.push(`- Runtime + package-script reachable files: ${report.counts.operationalReachable}`);
  lines.push(`- Tooling-only files (not runtime but reachable from package scripts): ${report.counts.toolingOnly}`);
  lines.push(`- Core-domain files not operationally reachable (candidate archive): ${report.counts.candidateArchive}`);
  lines.push("");
  lines.push("## Backend Route Footprint");
  lines.push("");
  lines.push(`- Route modules on disk: ${report.backendRoutes.routeFilesOnDiskCount}`);
  lines.push(`- Route modules mounted via app.use: ${report.backendRoutes.mountedRouteFilesCount}`);
  lines.push(`- Route modules imported in server/routes.ts: ${report.backendRoutes.importedRouteFilesCount}`);
  lines.push(`- Route modules likely unused (not mounted and not runtime-reachable): ${report.backendRoutes.likelyUnusedRouteFilesCount}`);
  lines.push("");
  lines.push("## Frontend Route Footprint");
  lines.push("");
  lines.push(`- <Route> declarations in App.tsx: ${report.frontendRoutes.declaredCount}`);
  lines.push(`- Unique route paths: ${report.frontendRoutes.uniquePathCount}`);
  lines.push("");
  lines.push("## Operational Category Coverage (runtime-reachable)");
  lines.push("");
  lines.push(`- Campaign/Execution files: ${report.categories.campaign.count}`);
  lines.push(`- AI files: ${report.categories.ai.count}`);
  lines.push(`- Database/Data files: ${report.categories.database.count}`);
  lines.push(`- Integration/Webhook files: ${report.categories.integrations.count}`);
  lines.push("");
  lines.push("## Candidate Archive Files (sample)");
  lines.push("");
  for (const f of takeFirst(report.files.candidateArchive, 80)) {
    lines.push(`- ${f}`);
  }
  if (report.files.candidateArchive.length > 80) {
    lines.push(`- ... and ${report.files.candidateArchive.length - 80} more`);
  }
  lines.push("");
  lines.push("## Likely Manual Scripts (sample)");
  lines.push("");
  for (const f of takeFirst(report.files.manualScriptsLikely, 80)) {
    lines.push(`- ${f}`);
  }
  if (report.files.manualScriptsLikely.length > 80) {
    lines.push(`- ... and ${report.files.manualScriptsLikely.length - 80} more`);
  }
  lines.push("");
  lines.push("## Safety Note");
  lines.push("");
  lines.push("- This is static reachability (imports + route mounts).");
  lines.push("- Dynamic runtime loading (string-based imports, DB-driven config, external schedulers) can create false negatives.");
  lines.push("- Treat candidate lists as review queues, not delete queues.");
  lines.push("");
  lines.push(`Full details: docs/reports/active-files-audit.json`);
  lines.push("");
  return lines.join("\n");
}

function toCsvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildTrackerCsv(report: any): string {
  const classification = new Map<string, string>();

  for (const file of report.files.runtimeReachable as string[]) {
    classification.set(file, "active_runtime");
  }
  for (const file of report.files.toolingOnly as string[]) {
    if (!classification.has(file)) {
      classification.set(file, "active_tooling");
    }
  }
  for (const file of report.files.candidateArchive as string[]) {
    if (!classification.has(file)) {
      classification.set(file, "candidate_archive");
    }
  }
  for (const file of report.files.manualScriptsLikely as string[]) {
    if (!classification.has(file)) {
      classification.set(file, "manual_script");
    }
  }

  const header = [
    "file_path",
    "classification",
    "review_status",
    "owner",
    "decision_date",
    "action",
    "notes",
  ];

  const rows = [header.join(",")];
  const sortedFiles = [...classification.keys()].sort((a, b) => a.localeCompare(b));
  for (const file of sortedFiles) {
    rows.push(
      [
        toCsvCell(file),
        toCsvCell(classification.get(file) || ""),
        "pending_review",
        "",
        "",
        "",
        "",
      ].join(",")
    );
  }
  return `${rows.join("\n")}\n`;
}

function main() {
  const allCodeAbs: string[] = [];
  walkCodeFiles(ROOT, allCodeAbs);
  const allCodeRelSorted = uniqueSorted(allCodeAbs.map((f) => rel(f)));

  const graph = buildImportGraph(allCodeAbs);
  const packageScriptEntrypointsRaw = extractScriptEntrypointsFromPackageJson();
  const packageScriptEntrypoints = uniqueSorted(
    packageScriptEntrypointsRaw.filter((p) => graph.has(p))
  );
  const coreRuntimeEntrypoints = uniqueSorted([
    "server/index.ts",
    "client/src/main.tsx",
    "server/gemini-relay.ts",
    "server/services/livekit/worker.ts",
  ].filter((p) => graph.has(p)));

  const operationalEntrypoints = uniqueSorted([...coreRuntimeEntrypoints, ...packageScriptEntrypoints]).filter((p) =>
    graph.has(p)
  );

  const runtimeReachable = traverseReachable(graph, coreRuntimeEntrypoints);
  const operationalReachable = traverseReachable(graph, operationalEntrypoints);
  const toolingOnly = uniqueSorted(
    [...operationalReachable].filter((f) => !runtimeReachable.has(f))
  );

  const coreDomainFiles = allCodeRelSorted.filter((f) => isCoreOperationalDomain(f));
  const candidateArchive = uniqueSorted(
    coreDomainFiles.filter((f) => !operationalReachable.has(f))
  );

  const backendRoutes = parseBackendRoutes("server/routes.ts");
  const routeFilesOnDisk = uniqueSorted(
    allCodeRelSorted.filter((f) => f.startsWith("server/routes/") && !f.includes("/__tests__/"))
  );
  const mountedRouteSet = new Set(backendRoutes.mountedRouteFiles);
  const likelyUnusedRouteFiles = uniqueSorted(
    routeFilesOnDisk.filter((f) => !mountedRouteSet.has(f) && !runtimeReachable.has(f))
  );

  const frontendRoutes = parseFrontendRoutes("client/src/App.tsx");
  const frontendUniquePaths = uniqueSorted(frontendRoutes.map((r) => r.path));

  const runtimeReachableSorted = uniqueSorted(runtimeReachable);
  const campaignRegex = /(campaign|queue|dialer|telemarketing|lead|verification|suppression|booking|pipeline|call)/i;
  const aiRegex = /(ai|agent|prompt|gemini|vertex|intelligence|llm|openai|anthropic|simulation|transcription|knowledge)/i;
  const databaseRegex = /(^|\/)(db|storage|schema|migration|drizzle|redis|sql|repository|orm|queue|worker)/i;
  const integrationsRegex = /(integration|webhook|telnyx|gmail|m365|oauth|smtp|domain|mercury|gcp|cloud|s3|pubsub|livekit|sip|texml)/i;

  const categoryCampaign = uniqueSorted(runtimeReachableSorted.filter((f) => matchCategory(f, campaignRegex)));
  const categoryAi = uniqueSorted(runtimeReachableSorted.filter((f) => matchCategory(f, aiRegex)));
  const categoryDb = uniqueSorted(runtimeReachableSorted.filter((f) => matchCategory(f, databaseRegex)));
  const categoryIntegrations = uniqueSorted(runtimeReachableSorted.filter((f) => matchCategory(f, integrationsRegex)));

  const rootScriptExclusions = new Set([
    "server.js",
    "vite.config.ts",
    "vitest.config.ts",
    "tailwind.config.ts",
    "drizzle.config.ts",
  ]);
  const rootScriptPattern =
    /^(?:_|\.tmp-|add-|analyze-|approve-|apply-|backfill-|batch-|check-|clear-|clone-|count-|debug-|diagnose-|enable-|ensure-|execute-|fetch-|find-|fix-|flush-|full-|generate-|get-|import-|inspect-|investigate-|link-|list-|monitor-|pause-|process-|project-|push-|quick-|re|recover-|refresh-|remove-|repopulate-|reprocess-|requeue-|rescore-|reset-|run-|score-|seed-|send-|set-|show-|simple-|start-|status-|switch-|sync-|temp-|test-|thorough-|transcribe-|transfer-|trigger-|update-|validate-|verify-|view-|virtual-)/i;
  const rootStandaloneCodeFiles = allCodeRelSorted.filter((f) => /^[^/]+\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(f));
  const rootLikelyScriptFiles = rootStandaloneCodeFiles.filter(
    (f) => !rootScriptExclusions.has(f) && rootScriptPattern.test(f)
  );
  const scriptLikeFiles = uniqueSorted([
    ...allCodeRelSorted.filter((f) => f.startsWith("scripts/")),
    ...rootLikelyScriptFiles,
  ]);
  const manualScriptsLikely = uniqueSorted(
    scriptLikeFiles.filter((f) => !operationalReachable.has(f) && !packageScriptEntrypoints.includes(f))
  );

  const report = {
    generatedAt: new Date().toISOString(),
    root: ROOT,
    entrypoints: {
      coreRuntime: coreRuntimeEntrypoints,
      packageScript: packageScriptEntrypoints,
      operational: operationalEntrypoints,
    },
    counts: {
      totalCodeFiles: allCodeRelSorted.length,
      runtimeReachable: runtimeReachable.size,
      operationalReachable: operationalReachable.size,
      toolingOnly: toolingOnly.length,
      candidateArchive: candidateArchive.length,
    },
    backendRoutes: {
      routeFilesOnDiskCount: routeFilesOnDisk.length,
      mountedRouteFilesCount: backendRoutes.mountedRouteFiles.length,
      importedRouteFilesCount: backendRoutes.importedRouteFiles.length,
      likelyUnusedRouteFilesCount: likelyUnusedRouteFiles.length,
      mounts: backendRoutes.mounts,
      mountedRouteFiles: backendRoutes.mountedRouteFiles,
      importedRouteFiles: backendRoutes.importedRouteFiles,
      likelyUnusedRouteFiles,
    },
    frontendRoutes: {
      declaredCount: frontendRoutes.length,
      uniquePathCount: frontendUniquePaths.length,
      routes: frontendRoutes,
    },
    categories: {
      campaign: {
        count: categoryCampaign.length,
        sample: takeFirst(categoryCampaign, 80),
      },
      ai: {
        count: categoryAi.length,
        sample: takeFirst(categoryAi, 80),
      },
      database: {
        count: categoryDb.length,
        sample: takeFirst(categoryDb, 80),
      },
      integrations: {
        count: categoryIntegrations.length,
        sample: takeFirst(categoryIntegrations, 80),
      },
    },
    files: {
      runtimeReachable: runtimeReachableSorted,
      toolingOnly,
      candidateArchive,
      manualScriptsLikely,
      routeFilesOnDisk,
    },
  };

  const reportDir = abs("docs/reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const jsonPath = path.join(reportDir, "active-files-audit.json");
  const mdPath = path.join(reportDir, "active-files-audit.md");
  const trackerPath = path.join(reportDir, "active-files-tracker.csv");

  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(mdPath, `${buildMarkdownReport(report)}\n`, "utf8");
  fs.writeFileSync(trackerPath, buildTrackerCsv(report), "utf8");

  console.log("Active file audit complete.");
  console.log(`- JSON: ${rel(jsonPath)}`);
  console.log(`- Markdown: ${rel(mdPath)}`);
  console.log(`- Tracker CSV: ${rel(trackerPath)}`);
  console.log(`- Runtime reachable files: ${report.counts.runtimeReachable}`);
  console.log(`- Candidate archive files: ${report.counts.candidateArchive}`);
}

main();
