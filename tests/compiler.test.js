// ============================================================================
// OlumJS compiler test suite — one (or more) fixture per rule in docs.md.
//
// The compiler is a pure function: parser(templateString, id, filePath) -> JS string.
// Each `check` compiles a template and asserts on the emitted JS. Sections below
// map 1:1 to docs.md so the docs and the compiler can't drift apart.
//
// Run:  node tests/compiler.test.js   (or: npm test)
// ============================================================================

const parser = require("../lib/parser");

let passed = 0;
let failed = 0;

// ── Output styling ──────────────────────────────────────────────────────────
// ANSI colors + emoji icons. Disabled automatically when the output isn't a TTY
// (e.g. piped to a file or CI log) or when NO_COLOR is set, so logs stay clean.
const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, s) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = (s) => paint("32", s);
const red = (s) => paint("31", s);
const dim = (s) => paint("2", s);
const bold = (s) => paint("1", s);
const yellow = (s) => paint("33", s);
const cyan = (s) => paint("36", s);
const PASS_ICON = green("✔");
const FAIL_ICON = red("✖");

// Deterministic, monotonically-increasing ids so a run is fully reproducible
// (a flaky failure can be re-run and debugged with the exact same id in the output).
let _idSeq = 1000;
function compile(template) {
  return parser(template, _idSeq++, "App.html");
}

// compiled output is a parseable JS module (after stripping import/export)
function parses(out) {
  const body = out
    .replace(/^\s*import .*$/gm, "")
    .replace(/^\s*export\s+default\s+/m, "const __x=");
  new Function(body); // throws on syntax error
  return true;
}

// the rendered template literal region (between `el.innerHTML = ` and the injectStyle call)
function tmpl(out) {
  const m = out.match(/innerHTML = `([\s\S]*?)`;\s*olum\.injectStyle/);
  return m ? m[1] : "";
}

// Current section, tracked so a failure can point at the category to look into.
let currentSection = "(no section)";
const failedSections = []; // { section, name } per failure, for the end-of-run recap

function recordFail(name) {
  failed++;
  failedSections.push({ section: currentSection, name });
}

function check(name, template, assertion) {
  let out;
  try {
    out = compile(template);
  } catch (e) {
    recordFail(name);
    console.log("  " + FAIL_ICON + " " + name + dim("  (threw: " + e.message + ")"));
    console.log("      " + dim("↳ in " + currentSection));
    return;
  }
  let ok = false;
  let detail = "";
  try {
    ok = assertion(out);
  } catch (e) {
    detail = " (" + e.message + ")";
  }
  if (ok) {
    passed++;
    console.log("  " + PASS_ICON + " " + name);
  } else {
    recordFail(name);
    // On a plain assertion miss (no thrown error) show the rendered template so a
    // failure is diagnosable without re-instrumenting the test.
    if (!detail) {
      try {
        const snippet = tmpl(out).trim().replace(/\s+/g, " ").slice(0, 140);
        if (snippet) detail = "\n      " + dim("template: " + snippet);
      } catch (_) {}
    } else {
      detail = dim(detail);
    }
    console.log("  " + FAIL_ICON + " " + red(name) + detail);
    console.log("      " + dim("↳ in " + currentSection));
  }
}

function section(title) {
  currentSection = title;
  console.log("\n" + bold(cyan(title)));
}

// Build a component from a template + optional extra script lines. The <script> MUST be
// multiline (opening/closing tags on their own lines) — a single-line <script>…</script>
// hits a jsParser regex quirk that strips the whole body (real components are multiline).
const STATE = `const state = { count: 0, name: "Ann", cls: "on", items: [{ id: 1, name: "a" }], settings: { a: 1 }, html: "<b>x</b>", color: "#fff" };`;
function comp(template, extraScript) {
  return `<script>\n${STATE}\n${extraScript || ""}\n</script>\n${template}`;
}

console.log("\n" + bold("🧪 OlumJS compiler fixtures") + "\n========================");

// ── §1 Component file structure ────────────────────────────────────────────
section("§1 Component file structure");

check(
  "compiles to a parseable JS module",
  comp(`<div class="box">{state.count}</div>`),
  (out) => parses(out)
);

check(
  "exports a default factory",
  comp(`<div></div>`),
  (out) => /export default \(_instanceKey\) =>/.test(out)
);

// ── §3 State & reactivity ──────────────────────────────────────────────────
section("§3 State & reactivity");

check(
  "state is wrapped in olum.proxyHandler (reactive)",
  comp(`<div></div>`),
  (out) => /state = olum\.proxyHandler\(state,/.test(out) && parses(out)
);

// ── §4 Text interpolation {expr} (auto-escaped) ────────────────────────────
section("§4 Text interpolation");

check(
  "{expr} in text is wrapped in olum.esc",
  comp(`<p>{state.name}</p>`),
  (out) => /\$\{olum\.esc\(state\.name\)\}/.test(tmpl(out))
);

check(
  "expression with operators interpolates as-is (escaped)",
  comp(`<p>{state.count + 1}</p>`),
  (out) => /\$\{olum\.esc\(state\.count \+ 1\)\}/.test(tmpl(out)) && parses(out)
);

// ── §5 String attributes (literal + {expr}) ────────────────────────────────
section("§5 String attributes");

check(
  "static attribute stays a literal string (no esc)",
  comp(`<img alt="avatar" src="/logo.png" />`),
  (out) => /alt="avatar"/.test(tmpl(out)) && !/olum\.esc\('avatar'\)/.test(tmpl(out))
);

check(
  "{expr} inside a string attribute interpolates",
  comp(`<div class="card {state.cls}"></div>`),
  (out) => /class="card \$\{olum\.esc\(state\.cls\)\}"/.test(tmpl(out)) && parses(out)
);

check(
  "dynamic string style interpolates",
  comp(`<div style="color:{state.color}; padding:8px;"></div>`),
  (out) => /style="color:\$\{olum\.esc\(state\.color\)\}; padding:8px;"/.test(tmpl(out)) && parses(out)
);

// boolean attributes are truthy by PRESENCE (checked="false" is still checked), so
// attr="{expr}" must toggle the attribute's existence, never interpolate its value
check(
  "boolean attribute compiles to a presence toggle (checked)",
  comp(`<input type="checkbox" checked="{state.count}" />`),
  (out) => /\$\{\(state\.count\) \? "checked" : ""\}/.test(tmpl(out)) && !/checked="\$\{olum\.esc/.test(tmpl(out)) && parses(out)
);

check(
  "boolean attribute with an expression (disabled)",
  comp(`<button disabled="{!state.count}">Go</button>`),
  (out) => /\$\{\(!state\.count\) \? "disabled" : ""\}/.test(tmpl(out)) && parses(out)
);

check(
  "static boolean attribute is left alone",
  comp(`<input type="text" disabled />`),
  (out) => /disabled/.test(tmpl(out)) && !/\? "disabled"/.test(tmpl(out)) && parses(out)
);

check(
  "boolean attribute inside <for> stays a presence toggle",
  comp(`<for each="x of state.items"><option selected="{x.id === state.count}">{x.name}</option></for>`),
  (out) => /\$\{\(x\.id === state\.count\) \? "selected" : ""\}/.test(tmpl(out)) && parses(out)
);

// ── §6 Events on* (code in "") ─────────────────────────────────────────────
section("§6 Events");

check(
  "method-call handler compiles to data-o-event",
  comp(`<button onclick="inc()">+</button>`, `const inc = () => state.count++;`),
  (out) => /data-o-event=[^>]*onclick\|inc/.test(tmpl(out)) && parses(out)
);

check(
  "multiple handlers in one attribute",
  comp(`<button onclick="a(), b()">x</button>`, `const a = () => 0; const b = () => 0;`),
  (out) => /onclick\|a=[^&]*&b=/.test(tmpl(out)) && parses(out)
);

check(
  "$event is forwarded to the handler",
  comp(`<input oninput="setVal($event)" />`, `const setVal = (e) => 0;`),
  (out) => /oninput\|setVal=\$\{JSON\.stringify\(\['\$event'\]\)\}/.test(tmpl(out)) && parses(out)
);

check(
  "inline arrow handler becomes a named __olumAnon_ method",
  comp(`<input oninput="(e) => state.name = e.target.value" />`),
  (out) => /__olumAnon_\w+/.test(out) && /data-o-event/.test(tmpl(out)) && parses(out)
);

// ── §7 Conditionals <if>/<else-if>/<else> ──────────────────────────────────
section("§7 Conditionals");

check(
  "if/else-if/else compiles to a raw (un-escaped) ternary",
  comp(`<if when="state.count === 1"><p>a</p></if><else-if when="state.count === 2"><p>b</p></else-if><else><p>c</p></else>`),
  (out) => /\$\{state\.count === 1\?/.test(tmpl(out)) && out.indexOf("olum.esc(state.count === 1)") === -1 && parses(out)
);

check(
  "comparison operators survive in a condition (no &gt;)",
  comp(`<if when="state.count > 0"><p>x</p></if>`),
  (out) => /\$\{state\.count > 0\?/.test(tmpl(out)) && !/state\.count &gt; 0/.test(tmpl(out)) && parses(out)
);

// ── §8 Show ────────────────────────────────────────────────────────────────
section("§8 Show");

check(
  "<show> keeps the element and toggles display:none",
  comp(`<show when="state.count"><span>v</span></show>`),
  (out) => /\$\{state\.count\?/.test(tmpl(out)) && /display:none/.test(tmpl(out)) && parses(out)
);

// ── §9 Loops <for> ─────────────────────────────────────────────────────────
section("§9 Loops");

check(
  'array loop "x of arr" compiles to .map()',
  comp(`<for each="item of state.items"><li>{item.name}</li></for>`),
  (out) => /state\.items\.map\(function\(item\)/.test(tmpl(out)) && parses(out)
);

check(
  'numeric loop "i of N" is 1-based new Array(N)',
  comp(`<for each="i of 6"><span>{i}</span></for>`),
  (out) => /new Array\(6\)\.fill\(\)\.map/.test(tmpl(out)) && parses(out)
);

check(
  'object loop "key in obj" compiles to Object.keys().map',
  comp(`<for each="key in state.settings"><i>{key}</i></for>`),
  (out) => /Object\.keys\(state\.settings\)\.map/.test(tmpl(out)) && parses(out)
);

check(
  "keyed loop stamps data-o-key on a component placeholder",
  comp(`<for each="item of state.items" key="item.id"><Row item="{item}" /></for>`, `import Row from "./Row";`),
  (out) => /data-o-key/.test(tmpl(out)) && parses(out)
);

// ── §10 Raw HTML (html="expr" + olum.html()) ───────────────────────────────
section("§10 Raw HTML");

check(
  'html="expr" sets unescaped ${expr} content, other attrs kept',
  comp(`<div class="rich" html="state.html">fallback</div>`),
  (out) => /<div class="rich">\$\{state\.html\}<\/div>/.test(tmpl(out)) && !/olum\.esc\(state\.html\)/.test(tmpl(out)) && parses(out)
);

check(
  "olum.html(...) inline opt-out is preserved (esc detects it at runtime)",
  comp(`<p>{olum.html(state.html)}</p>`),
  (out) => /olum\.esc\(olum\.html\(state\.html\)\)/.test(tmpl(out)) && parses(out)
);

// ── §11 Components & props ──────────────────────────────────────────────────
section("§11 Components & props");

check(
  "PascalCase component compiles to an <olum> placeholder",
  comp(`<Badge />`, `import Badge from "./Badge";`),
  (out) => /<olum name="Badge"/.test(tmpl(out)) && parses(out)
);

check(
  "literal prop is a string",
  comp(`<C title="Hello" />`, `import C from "./C";`),
  (out) => /title: 'Hello'/.test(out) && parses(out)
);

check(
  'whole-value prop "{expr}" keeps the expression type',
  comp(`<C count="{state.count + 1}" data="{state.settings}" />`, `import C from "./C";`),
  (out) => /count: state\.count \+ 1/.test(out) && /data: state\.settings/.test(out) && parses(out)
);

check(
  "mixed-text prop becomes a template literal (string)",
  comp(`<C greet="Hi {state.name}" />`, `import C from "./C";`),
  (out) => /greet: `Hi \$\{state\.name\}`/.test(out) && parses(out)
);

check(
  "passing state.X records a write-back source",
  comp(`<C v="{state.count}" />`, `import C from "./C";`),
  (out) => /data-o-props-src="v:state:count"/.test(out) && parses(out)
);

// ── §11b Function props ─────────────────────────────────────────────────────
section("§11b Function props");

check(
  "a prop naming a top-level function is a method source, not a JSON entry",
  comp(`<C todo="{state.items}" toggle="{toggle}" />`, `import C from "./C";\nconst toggle = (id) => id;`),
  (out) => /toggle:method:toggle/.test(out) && /todo: state\.items/.test(out) && !/toggle: toggle/.test(out) && parses(out)
);

check(
  "function prop can be renamed on the child",
  comp(`<C onToggle="{toggle}" />`, `import C from "./C";\nfunction toggle(id) { return id; }`),
  (out) => /data-o-props-src="onToggle:method:toggle"/.test(out) && parses(out)
);

check(
  "function-only props emit data-o-props-src without data-o-props",
  comp(`<C toggle="{toggle}" remove="{remove}" />`, `import C from "./C";\nconst toggle = (id) => id;\nconst remove = (id) => id;`),
  (out) => /data-o-props-src="toggle:method:toggle\|remove:method:remove"/.test(out) && !/data-o-props=/.test(tmpl(out)) && parses(out)
);

check(
  "a bare identifier NOT naming a function (e.g. loop var) stays a JSON prop",
  comp(`<for each="item of state.items" key="item.id"><C item="{item}" /></for>`, `import C from "./C";`),
  (out) => /item: item/.test(out) && !/item:method/.test(out) && parses(out)
);

check(
  "forwarding a destructured prop emits a kind-props source (function props survive nesting)",
  comp(`<C onMessage="{onMessage}" />`, `import C from "./C";\nconst { onMessage } = props();`),
  (out) => /data-o-props-src="onMessage:props:onMessage"/.test(out) && /onMessage: onMessage/.test(out) && !/onMessage:method/.test(out) && parses(out)
);

check(
  "forwarding a RENAMED destructured prop keys the source by the original prop name",
  comp(`<C onMessage="{om}" />`, `import C from "./C";\nconst { onMessage: om } = props();`),
  (out) => /data-o-props-src="onMessage:props:onMessage"/.test(out) && parses(out)
);

check(
  // a destructured prop isn't in methodsRef, so the data-o-event chain can't dispatch it by
  // name — the compiler must wrap the call in an anon handler whose closure holds the prop
  "calling a destructured prop in an event handler wraps it in an anon method",
  comp(`<button onclick="onclick()">x</button>`, `const { onclick } = props();`),
  (out) => /__olumAnon_\w+ = \(\$event\) => \{ onclick\(\) \}/.test(out) && /onclick\|__olumAnon_/.test(out) && parses(out)
);

check(
  "forwarding a function prop records a props source (resolved live at runtime)",
  comp(`<C fn="{props().onSave}" />`, `import C from "./C";\nimport { props } from "../core/olum.js";`),
  (out) => /fn:props:onSave/.test(out) && parses(out)
);

check(
  "calling a function prop in an event compiles to an anon handler",
  comp(`<button onclick="props().toggle(props().todo.id)">x</button>`, `import { props } from "../core/olum.js";`),
  (out) => /const __olumAnon_\w+ = \(\$event\) => \{ props\(_storeKey\)\.toggle\(props\(_storeKey\)\.todo\.id\) \};/.test(out) && parses(out)
);

check(
  "plain method-call events still use the direct call-list path (no anon wrapper)",
  comp(`<button onclick="inc(), dec($event)">x</button>`, `const inc = () => {};\nconst dec = (e) => {};`),
  (out) => !/__olumAnon_/.test(out) && /onclick\|inc=/.test(out) && /dec=/.test(out) && parses(out)
);

// ── §12 Slots {children} ───────────────────────────────────────────────────
section("§12 Slots");

check(
  "{children} compiles to the slot interpolation",
  comp(`<div class="slot">{children}</div>`),
  (out) => /<div class="slot">\$\{children\}<\/div>/.test(tmpl(out)) && parses(out)
);

// ── §14 Watchers ────────────────────────────────────────────────────────────
section("§14 Watchers");

check(
  "a watcher is wired into proxyHandler",
  comp(`<div></div>`, `const watcher = { count(o, n) {} };`),
  (out) => /olum\.proxyHandler\(state, ?watcher,/.test(out) && parses(out)
);

check(
  "no watcher -> proxyHandler gets null",
  comp(`<div></div>`),
  (out) => /olum\.proxyHandler\(state, ?null,/.test(out) && parses(out)
);

// ── §15 Lifecycle hooks ─────────────────────────────────────────────────────
section("§15 Lifecycle hooks");

check(
  "mounted hook is resolved at runtime via a typeof guard",
  comp(`<div></div>`, `const mounted = () => 0; const unMounted = () => 0;`),
  (out) => /mounted: ?typeof mounted !== "undefined" \? mounted : null/.test(out) && parses(out)
);

check(
  "unMounted is emitted as a null placeholder (assigned at runtime)",
  comp(`<div></div>`),
  (out) => /unMounted: ?null/.test(out) && parses(out)
);

// ── §16 Scoped CSS ──────────────────────────────────────────────────────────
section("§16 Scoped CSS");

check(
  // the scope attr attaches to the selector's LAST COMPOUND (.box[data-o-x], p[data-o-x]:hover),
  // not as a `[data-o-x] .box` descendant prefix — a descendant rule would also match nested
  // components' elements, which sit inside this component's DOM but carry their own scope attr
  "styles are scoped onto the selector's last compound and injected",
  comp(`<div class="box"></div>`).replace("</script>", "</script>\n<style>.box{color:red}\np:hover{color:blue}</style>"),
  (out) => /\.box\[data-o-\w+\]/.test(out) && /p\[data-o-\w+\]:hover/.test(out) && /olum\.injectStyle\(/.test(out) && parses(out)
);

// ── §17 Imports ─────────────────────────────────────────────────────────────
section("§17 Imports");

check(
  "component import is preserved (resolved to .js) and registered",
  comp(`<Badge />`, `import Badge from "./Badge";`),
  (out) => /import Badge from "\.\/Badge\.js"/.test(out) && /components:\s*\{[^}]*Badge\s*:\s*Badge/.test(out) && parses(out)
);

// ── §19 Unsupported prop syntax (negative tests) ───────────────────────────
// NOTE: tests for commented-out/disabled compiler passes (:style, model, mode) were
// removed — a disabled feature has no stable contract to assert against. The checks
// below cover the parser's *active* behavior: brace-prop shorthand is silently ignored.
section("§19 Unsupported prop syntax");

check(
  "naked-brace prop shorthand <Comp {a}/> is ignored (no props)",
  comp(`<C {state} />`, `import C from "./C";`),
  // positive companion (<olum name="C">) proves the component WAS processed and the
  // brace syntax was merely dropped — without it the negative could pass vacuously.
  (out) => /<olum name="C"/.test(tmpl(out)) && !/data-o-props=/.test(tmpl(out)) && parses(out)
);

check(
  "unquoted brace prop <Comp a={a}/> is ignored (no props)",
  comp(`<C a={state} />`, `import C from "./C";`),
  (out) => /<olum name="C"/.test(tmpl(out)) && !/data-o-props=/.test(tmpl(out)) && parses(out)
);

// ── §20 File-based routing (compileRoutes) ──────────────────────────────────
// compileRoutes(entryPoint) scans a src tree and emits the router entry module:
// imports + `export const routes = [...]` + Router/Olum bootstrap. Unlike the
// parser checks above it reads the filesystem, so each check builds a throwaway
// fixture tree in the OS temp dir and removes it afterwards.
section("§20 File-based routing (compileRoutes)");

const { compileRoutes } = require("../lib/helpers");
const fs = require("fs");
const os = require("os");
const nodePath = require("path");

// like check() but for units that aren't parser(template): producer() returns
// the value under test (and owns its fixture setup/teardown)
function checkFn(name, producer, assertion) {
  let out;
  try {
    out = producer();
  } catch (e) {
    recordFail(name);
    console.log("  " + FAIL_ICON + " " + name + dim("  (threw: " + e.message + ")"));
    console.log("      " + dim("↳ in " + currentSection));
    return;
  }
  let ok = false;
  let detail = "";
  try {
    ok = assertion(out);
  } catch (e) {
    detail = dim(" (" + e.message + ")");
  }
  if (ok) {
    passed++;
    console.log("  " + PASS_ICON + " " + name);
  } else {
    recordFail(name);
    if (!detail) detail = "\n      " + dim(String(out).replace(/\s+/g, " ").slice(0, 200));
    console.log("  " + FAIL_ICON + " " + red(name) + detail);
    console.log("      " + dim("↳ in " + currentSection));
  }
}

function withRouteTree(files, fn) {
  const root = fs.mkdtempSync(nodePath.join(os.tmpdir(), "olum-routes-"));
  try {
    files.forEach((f) => {
      const abs = nodePath.join(root, f);
      fs.mkdirSync(nodePath.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "<div></div>");
    });
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

checkFn(
  "route tree compiles: / first, /404 last, [param] -> :param, (group) and NN- prefixes stripped",
  () =>
    withRouteTree(
      [
        "page.html",
        "not-found.html",
        "about/page.html",
        "(main)/club/page.html",
        "01-blog/[slug]/page.html",
        "components/Widget.html", // excluded dir — never a route
        "_drafts/page.html", // _-prefixed dir — excluded
      ],
      (root) => compileRoutes(root)
    ),
  (out) => {
    const paths = [...out.matchAll(/path: "([^"]+)"/g)].map((m) => m[1]);
    return (
      /import App from "\.\/page\.js";/.test(out) &&
      /import NotFound from "\.\/not-found\.js";/.test(out) &&
      /import About from "\.\/about\/page\.js";/.test(out) &&
      // imports keep the REAL file location; only route path/comp are cleaned
      /import Club from "\.\/\(main\)\/club\/page\.js";/.test(out) &&
      /import BlogSlug from "\.\/01-blog\/\[slug\]\/page\.js";/.test(out) &&
      /\{ path: "\/club", comp: Club \}/.test(out) &&
      /\{ path: "\/blog\/:slug", comp: BlogSlug \}/.test(out) &&
      /\{ path: "\/about", comp: About \}/.test(out) &&
      paths[0] === "/" &&
      paths[paths.length - 1] === "/404" &&
      /err: "\/404",/.test(out) && // not-found.html wires the router's 404 redirect
      !/Widget|_drafts|Drafts/.test(out) && // excluded dirs leave no trace
      /new Router\(config\)/.test(out) &&
      /new Olum\(\)\.\$\("#app"\)\.use\(router\)/.test(out)
    );
  }
);

checkFn(
  "no not-found.html -> no /404 route and no err in the router config",
  () => withRouteTree(["page.html", "about/page.html"], (root) => compileRoutes(root)),
  (out) => !/\/404/.test(out) && !/err:/.test(out) && /\{ path: "\/", comp: App \}/.test(out) && /\{ path: "\/about", comp: About \}/.test(out)
);

console.log("\n========================");
const summary = `${passed} passed, ${failed} failed`;
console.log((failed ? red(bold(summary)) : green(bold(summary))) + "\n");

// Recap which section(s) to look into, grouped so a run with several failures is
// still scannable ("go check §11b").
if (failed) {
  const bySection = {};
  failedSections.forEach(({ section, name }) => {
    (bySection[section] = bySection[section] || []).push(name);
  });
  console.log(bold("Failed in:"));
  Object.keys(bySection).forEach((sec) => {
    console.log("  " + red(sec));
    bySection[sec].forEach((name) => console.log("    " + dim("• " + name)));
  });
  console.log("");
}

// Guard against a whole section silently disappearing (a bad merge, a `check` that
// throws before registering, etc.). Bump EXPECTED_CHECKS when you add/remove tests.
const EXPECTED_CHECKS = 51;
const total = passed + failed;
if (total !== EXPECTED_CHECKS) {
  console.log(yellow(`⚠ ran ${total} checks but expected ${EXPECTED_CHECKS} — did a test get dropped?`) + "\n");
  process.exit(1);
}

process.exit(failed ? 1 : 0);
