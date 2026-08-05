const parser = require("../lib/parser");

let passed = 0;
let failed = 0;

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

let _idSeq = 1000;
function compile(template) {
  return parser(template, _idSeq++, "App.html");
}

function parses(out) {
  const body = out
    .replace(/^\s*import .*$/gm, "")
    .replace(/^\s*export\s+default\s+/m, "const __x=");
  new Function(body);
  return true;
}

function tmpl(out) {
  const m = out.match(/innerHTML = `([\s\S]*?)`;\s*olum\.injectStyle/);
  return m ? m[1] : "";
}

let currentSection = "(no section)";
const failedSections = [];

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
    console.log(
      "  " + FAIL_ICON + " " + name + dim("  (threw: " + e.message + ")"),
    );
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

const STATE = `const state = { count: 0, name: "Ann", cls: "on", items: [{ id: 1, name: "a" }], settings: { a: 1 }, html: "<b>x</b>", color: "#fff" };`;
function comp(template, extraScript) {
  return `<script>\n${STATE}\n${extraScript || ""}\n</script>\n${template}`;
}

console.log(
  "\n" + bold("🧪 OlumJS compiler fixtures") + "\n========================",
);

section("§1 Component file structure");

check(
  "compiles to a parseable JS module",
  comp(`<div class="box">{state.count}</div>`),
  (out) => parses(out),
);

check("exports a default factory", comp(`<div></div>`), (out) =>
  /export default \(_instanceKey\) =>/.test(out),
);

section("§3 State & reactivity");

check(
  "state is wrapped in olum.proxyHandler (reactive)",
  comp(`<div></div>`),
  (out) => /state = olum\.proxyHandler\(state,/.test(out) && parses(out),
);

section("§4 Text interpolation");

check(
  "{expr} in text is wrapped in olum.esc",
  comp(`<p>{state.name}</p>`),
  (out) => /\$\{olum\.esc\(state\.name\)\}/.test(tmpl(out)),
);

check(
  "expression with operators interpolates as-is (escaped)",
  comp(`<p>{state.count + 1}</p>`),
  (out) =>
    /\$\{olum\.esc\(state\.count \+ 1\)\}/.test(tmpl(out)) && parses(out),
);

check(
  "comparison operators in a text {expr} survive the parse5 round-trip",
  comp(`<p>{state.width > 380 && state.width < 800 ? 'mid' : 'other'}</p>`),
  (out) =>
    /olum\.esc\(state\.width > 380 && state\.width < 800 \? 'mid' : 'other'\)/.test(
      tmpl(out),
    ) && parses(out),
);

section("§5 String attributes");

check(
  "static attribute stays a literal string (no esc)",
  comp(`<img alt="avatar" src="/logo.png" />`),
  (out) =>
    /alt="avatar"/.test(tmpl(out)) && !/olum\.esc\('avatar'\)/.test(tmpl(out)),
);

check(
  "{expr} inside a string attribute interpolates",
  comp(`<div class="card {state.cls}"></div>`),
  (out) =>
    /class="card \$\{olum\.esc\(state\.cls\)\}"/.test(tmpl(out)) && parses(out),
);

check(
  "dynamic string style interpolates",
  comp(`<div style="color:{state.color}; padding:8px;"></div>`),
  (out) =>
    /style="color:\$\{olum\.esc\(state\.color\)\}; padding:8px;"/.test(
      tmpl(out),
    ) && parses(out),
);

check(
  "textarea value attribute becomes text content",
  comp(`<textarea value="{state.cls}"></textarea>`),
  (out) =>
    /<textarea[^>]*>\$\{olum\.esc\(state\.cls\)\}<\/textarea>/.test(
      tmpl(out),
    ) &&
    !/value=/.test(tmpl(out)) &&
    parses(out),
);

check(
  "textarea value attribute wins over authored content",
  comp(`<textarea value="{state.cls}">stale</textarea>`),
  (out) =>
    /<textarea[^>]*>\$\{olum\.esc\(state\.cls\)\}<\/textarea>/.test(
      tmpl(out),
    ) &&
    !/stale/.test(tmpl(out)) &&
    parses(out),
);

check(
  "boolean attribute compiles to a presence toggle (checked)",
  comp(`<input type="checkbox" checked="{state.count}" />`),
  (out) =>
    /\$\{\(state\.count\) \? "checked" : ""\}/.test(tmpl(out)) &&
    !/checked="\$\{olum\.esc/.test(tmpl(out)) &&
    parses(out),
);

check(
  "boolean attribute with an expression (disabled)",
  comp(`<button disabled="{!state.count}">Go</button>`),
  (out) =>
    /\$\{\(!state\.count\) \? "disabled" : ""\}/.test(tmpl(out)) && parses(out),
);

check(
  "static boolean attribute is left alone",
  comp(`<input type="text" disabled />`),
  (out) =>
    /disabled/.test(tmpl(out)) &&
    !/\? "disabled"/.test(tmpl(out)) &&
    parses(out),
);

check(
  "boolean attribute inside <for> stays a presence toggle",
  comp(
    `<for each="x of state.items"><option selected="{x.id === state.count}">{x.name}</option></for>`,
  ),
  (out) =>
    /\$\{\(x\.id === state\.count\) \? "selected" : ""\}/.test(tmpl(out)) &&
    parses(out),
);

section("§6 Events");

check(
  "method-call handler compiles to data-o-event",
  comp(
    `<button onclick="inc()">+</button>`,
    `const inc = () => state.count++;`,
  ),
  (out) => /data-o-event=[^>]*onclick\|inc/.test(tmpl(out)) && parses(out),
);

check(
  "multiple handlers in one attribute",
  comp(
    `<button onclick="a(), b()">x</button>`,
    `const a = () => 0; const b = () => 0;`,
  ),
  (out) => /onclick\|a=[^&]*&b=/.test(tmpl(out)) && parses(out),
);

check(
  "$event is forwarded to the handler",
  comp(`<input oninput="setVal($event)" />`, `const setVal = (e) => 0;`),
  (out) =>
    /oninput\|setVal=\$\{JSON\.stringify\(\['\$event'\]\)\}/.test(tmpl(out)) &&
    parses(out),
);
check(
  "inline arrow handler becomes a named __olumAnon_ method",
  comp(`<input oninput="(e) => state.name = e.target.value" />`),
  (out) =>
    /__olumAnon_\w+/.test(out) && /data-o-event/.test(tmpl(out)) && parses(out),
);

check(
  "anon handler inside <for> receives the loop variable as an argument",
  comp(
    `<for each="flavour of state.items"><input type="checkbox" onchange="toggle(flavour)($event)" /></for>`,
    `const toggle = (f) => (e) => 0;`,
  ),
  (out) =>
    /const __olumAnon_\w+ = \(\$event, flavour\) => \{ toggle\(flavour\)\(\$event\) \}/.test(
      out,
    ) &&
    /JSON\.stringify\(\['\$event', flavour\]\)/.test(tmpl(out)) &&
    parses(out),
);

check(
  "inline arrow handler inside <for> receives the loop variable as an argument",
  comp(
    `<for each="(x, i) of state.items"><button onclick="(e) => state.count = i">x</button></for>`,
  ),
  (out) =>
    /const __olumAnon_\w+ = \(\$event, i\) =>/.test(out) &&
    /JSON\.stringify\(\['\$event', i\]\)/.test(tmpl(out)) &&
    parses(out),
);

section("§7 Conditionals");

check(
  "if/else-if/else compiles to a raw (un-escaped) ternary",
  comp(
    `<if when="state.count === 1"><p>a</p></if><else-if when="state.count === 2"><p>b</p></else-if><else><p>c</p></else>`,
  ),
  (out) =>
    /\$\{state\.count === 1\?/.test(tmpl(out)) &&
    out.indexOf("olum.esc(state.count === 1)") === -1 &&
    parses(out),
);

check(
  "comparison operators survive in a condition (no &gt;)",
  comp(`<if when="state.count > 0"><p>x</p></if>`),
  (out) =>
    /\$\{state\.count > 0\?/.test(tmpl(out)) &&
    !/state\.count &gt; 0/.test(tmpl(out)) &&
    parses(out),
);

section("§8 Show");

check(
  "<show> emits ONE stable wrapper whose display toggles (contents/none)",
  comp(`<show when="state.count"><span>v</span></show>`),
  (out) =>
    /data-o-show/.test(tmpl(out)) &&
    /display:\$\{\(state\.count\)\?'contents':'none'\}/.test(tmpl(out)) &&
    (tmpl(out).match(/<span>v<\/span>/g) || []).length === 1 &&
    parses(out),
);

check(
  "a double-quoted string inside the <show> condition survives the attribute context",
  comp(`<show when='state.tab === "a"'><span>v</span></show>`),

  (out) =>
    /display:\$\{\(state\.tab === "a"\)\?'contents':'none'\}/.test(tmpl(out)) &&
    parses(out),
);

section("§9 Loops");

check(
  'array loop "x of arr" compiles to .map()',
  comp(`<for each="item of state.items"><li>{item.name}</li></for>`),
  (out) => /state\.items\.map\(function\(item\)/.test(tmpl(out)) && parses(out),
);

check(
  'numeric loop "i of N" is 1-based new Array(N)',
  comp(`<for each="i of 6"><span>{i}</span></for>`),
  (out) => /new Array\(6\)\.fill\(\)\.map/.test(tmpl(out)) && parses(out),
);

check(
  'object loop "key in obj" compiles to Object.keys().map',
  comp(`<for each="key in state.settings"><i>{key}</i></for>`),
  (out) =>
    /Object\.keys\(state\.settings\)\.map/.test(tmpl(out)) && parses(out),
);

check(
  "keyed loop stamps data-o-key on a component placeholder",
  comp(
    `<for each="item of state.items" key="item.id"><Row item="{item}" /></for>`,
    `import Row from "./Row";`,
  ),
  (out) => /data-o-key/.test(tmpl(out)) && parses(out),
);

check(
  "<for> inside <select> survives the parse and scopes the loop variable",
  comp(
    `<select><for each="q of state.questions"><option value="{q.id}">{q.text}</option></for></select>`,
  ),
  (out) =>
    /<select>\$\{state\.questions\.map\(function\(q\)/.test(tmpl(out)) &&
    !/<olum-select/.test(tmpl(out)) &&
    parses(out),
);

check(
  "<for> inside <table>/<tbody> is not foster-parented out",
  comp(
    `<table><tbody><for each="row of state.rows"><tr><td>{row.a}</td></tr></for></tbody></table>`,
  ),
  (out) =>
    /<tbody>\$\{state\.rows\.map\(function\(row\)/.test(tmpl(out)) &&
    /<tr><td>/.test(tmpl(out)) &&
    parses(out),
);

section("§10 Raw HTML");

check(
  'html="expr" sets unescaped ${expr} content, other attrs kept',
  comp(`<div class="rich" html="state.html">fallback</div>`),
  (out) =>
    /<div class="rich">\$\{state\.html\}<\/div>/.test(tmpl(out)) &&
    !/olum\.esc\(state\.html\)/.test(tmpl(out)) &&
    parses(out),
);

check(
  "olum.html(...) inline opt-out is preserved (esc detects it at runtime)",
  comp(`<p>{olum.html(state.html)}</p>`),
  (out) =>
    /olum\.esc\(olum\.html\(state\.html\)\)/.test(tmpl(out)) && parses(out),
);

section("§11 Components & props");

check(
  "PascalCase component compiles to an <olum> placeholder",
  comp(`<Badge />`, `import Badge from "./Badge";`),
  (out) => /<olum name="Badge"/.test(tmpl(out)) && parses(out),
);

check(
  "literal prop is a string",
  comp(`<C title="Hello" />`, `import C from "./C";`),
  (out) => /title: 'Hello'/.test(out) && parses(out),
);

check(
  'whole-value prop "{expr}" keeps the expression type',
  comp(
    `<C count="{state.count + 1}" data="{state.settings}" />`,
    `import C from "./C";`,
  ),
  (out) =>
    /count: state\.count \+ 1/.test(out) &&
    /data: state\.settings/.test(out) &&
    parses(out),
);

check(
  "mixed-text prop becomes a template literal (string)",
  comp(`<C greet="Hi {state.name}" />`, `import C from "./C";`),
  (out) => /greet: `Hi \$\{state\.name\}`/.test(out) && parses(out),
);

check(
  "passing state.X records a write-back source",
  comp(`<C v="{state.count}" />`, `import C from "./C";`),
  (out) => /data-o-props-src="v:state:count"/.test(out) && parses(out),
);

check(
  "a slash in an attribute value still yields an <olum> placeholder",
  comp(`<Item returnTo="#/top/1" />`, `import Item from "./Item";`),
  (out) =>
    /<olum name="Item"/.test(out) && !/<item\b/.test(tmpl(out)) && parses(out),
);

check(
  "an interpolated URL attribute compiles to a template literal prop",
  comp(`<Item returnTo="#/top/{state.page}" />`, `import Item from "./Item";`),
  (out) =>
    /returnTo: `#\/top\/\$\{state\.page\}`/.test(out) &&
    /<olum name="Item"/.test(out) &&
    parses(out),
);

check(
  "object prop encoding escapes single quotes to survive the single-quoted attribute",
  comp(`<C data="{state.settings}" />`, `import C from "./C";`),
  (out) =>
    /encodeURIComponent\(JSON\.stringify\([\s\S]*\)\)\.replace\(\/'\/g,'%27'\)/.test(
      out,
    ) && parses(out),
);

section("§11a Nested components");

check(
  "a component nested directly inside another of the same name (both normal pairs)",
  comp(
    `<Spinner><Spinner></Spinner></Spinner>`,
    `import Spinner from "./Spinner";`,
  ),
  (out) =>
    /<olum name="Spinner"><olum name="Spinner"><\/olum><\/olum>/.test(
      tmpl(out),
    ) && parses(out),
);

check(
  "a component wrapping multiple same-named children pairs with its OWN close tag",
  comp(
    `<KbdGroup><Kbd>Ctrl</Kbd><Kbd>Alt</Kbd><Kbd>Del</Kbd></KbdGroup>`,
    `import KbdGroup from "./KbdGroup";\nimport Kbd from "./Kbd";`,
  ),
  (out) =>
    /<olum name="KbdGroup">\s*<olum name="Kbd">Ctrl<\/olum>\s*<olum name="Kbd">Alt<\/olum>\s*<olum name="Kbd">Del<\/olum>\s*<\/olum>/.test(
      tmpl(out),
    ) && parses(out),
);

check(
  "a component wrapping differently-named children (each with its own props) nests correctly",
  comp(
    `<Card variant="outline"><CardHeader>Title</CardHeader><CardContent>Body</CardContent></Card>`,
    `import Card from "./Card";\nimport CardHeader from "./CardHeader";\nimport CardContent from "./CardContent";`,
  ),
  (out) =>
    /<olum name="Card" data-o-props/.test(tmpl(out)) &&
    /<olum name="CardHeader">Title<\/olum>/.test(tmpl(out)) &&
    /<olum name="CardContent">Body<\/olum>/.test(tmpl(out)) &&
    parses(out),
);

check(
  "a child component name that is a PREFIX of the parent's name doesn't confuse pairing (Card / CardHeader)",
  comp(
    `<Card><CardHeader>Hi</CardHeader></Card>`,
    `import Card from "./Card";\nimport CardHeader from "./CardHeader";`,
  ),
  (out) =>
    /<olum name="Card">\s*<olum name="CardHeader">Hi<\/olum>\s*<\/olum>/.test(
      tmpl(out),
    ) && parses(out),
);

check(
  "same-name recursive nesting depth-tracks correctly (Tree > Tree > Tree)",
  comp(
    `<Tree label="root"><Tree label="child"><Tree label="grandchild" /></Tree></Tree>`,
    `import Tree from "./Tree";`,
  ),
  (out) =>
    /<olum name="Tree"[\s\S]*<olum name="Tree"[\s\S]*<olum name="Tree"[\s\S]*<\/olum>\s*<\/olum>\s*<\/olum>/.test(
      tmpl(out),
    ) && parses(out),
);

check(
  "three levels of different-named nesting all convert (Accordion > AccordionItem > AccordionTrigger/Content)",
  comp(
    `<Accordion multiple="{true}"><AccordionItem value="a"><AccordionTrigger>Q</AccordionTrigger><AccordionContent>A</AccordionContent></AccordionItem></Accordion>`,
    `import Accordion from "./Accordion";\nimport AccordionItem from "./AccordionItem";\nimport AccordionTrigger from "./AccordionTrigger";\nimport AccordionContent from "./AccordionContent";`,
  ),
  (out) =>
    /<olum name="Accordion"/.test(tmpl(out)) &&
    /<olum name="AccordionItem"/.test(tmpl(out)) &&
    /<olum name="AccordionTrigger">Q<\/olum>/.test(tmpl(out)) &&
    /<olum name="AccordionContent">A<\/olum>/.test(tmpl(out)) &&
    parses(out),
);

check(
  "self-closing and normal component siblings mix correctly inside plain HTML",
  comp(
    `<div class="row"><Button variant="outline">Click</Button><Badge /><Button>Second</Button></div>`,
    `import Button from "./Button";\nimport Badge from "./Badge";`,
  ),
  (out) =>
    /<olum name="Button" data-o-props[\s\S]*>Click<\/olum>/.test(tmpl(out)) &&
    /<olum name="Badge"><\/olum>/.test(tmpl(out)) &&
    /<olum name="Button">Second<\/olum>/.test(tmpl(out)) &&
    parses(out),
);

check(
  "attributes split across lines and indented with tabs keep the component name intact",
  comp(
    `<div>\n\t<Foo\n\t\tbar="1"\n\t\tbaz="2">x</Foo>\n</div>`,
    `import Foo from "./Foo";`,
  ),
  (out) =>
    /<olum name="Foo" data-o-props=/.test(tmpl(out)) &&
    /bar: '1', baz: '2'/.test(tmpl(out)) &&
    parses(out),
);

check(
  "an unbalanced component tag is left alone, but the components inside it still convert",
  comp(
    `<div><Foo>a<Bar>b</Bar></div>`,
    `import Foo from "./Foo";\nimport Bar from "./Bar";`,
  ),
  (out) =>
    !/<olum name="Foo"/.test(tmpl(out)) &&
    /<olum name="Bar">b<\/olum>/.test(tmpl(out)) &&
    parses(out),
);

section("§11b Function props");

check(
  "a prop naming a top-level function is a method source, not a JSON entry",
  comp(
    `<C todo="{state.items}" toggle="{toggle}" />`,
    `import C from "./C";\nconst toggle = (id) => id;`,
  ),
  (out) =>
    /toggle:method:toggle/.test(out) &&
    /todo: state\.items/.test(out) &&
    !/toggle: toggle/.test(out) &&
    parses(out),
);

check(
  "function prop can be renamed on the child",
  comp(
    `<C onToggle="{toggle}" />`,
    `import C from "./C";\nfunction toggle(id) { return id; }`,
  ),
  (out) => /data-o-props-src="onToggle:method:toggle"/.test(out) && parses(out),
);

check(
  "function-only props emit data-o-props-src without data-o-props",
  comp(
    `<C toggle="{toggle}" remove="{remove}" />`,
    `import C from "./C";\nconst toggle = (id) => id;\nconst remove = (id) => id;`,
  ),
  (out) =>
    /data-o-props-src="toggle:method:toggle\|remove:method:remove"/.test(out) &&
    !/data-o-props=/.test(tmpl(out)) &&
    parses(out),
);

check(
  "a bare identifier NOT naming a function (e.g. loop var) stays a JSON prop",
  comp(
    `<for each="item of state.items" key="item.id"><C item="{item}" /></for>`,
    `import C from "./C";`,
  ),
  (out) => /item: item/.test(out) && !/item:method/.test(out) && parses(out),
);

check(
  "forwarding a destructured prop emits a kind-props source (function props survive nesting)",
  comp(
    `<C onMessage="{onMessage}" />`,
    `import C from "./C";\nconst { onMessage } = props();`,
  ),
  (out) =>
    /data-o-props-src="onMessage:props:onMessage"/.test(out) &&
    /onMessage: __props\.onMessage/.test(out) &&
    !/onMessage:method/.test(out) &&
    parses(out),
);

check(
  "forwarding a RENAMED destructured prop keys the source by the original prop name",
  comp(
    `<C onMessage="{om}" />`,
    `import C from "./C";\nconst { onMessage: om } = props();`,
  ),
  (out) =>
    /data-o-props-src="onMessage:props:onMessage"/.test(out) && parses(out),
);

check(
  "calling a destructured prop in an event handler wraps it in an anon method",
  comp(
    `<button onclick="onclick()">x</button>`,
    `const { onclick } = props();`,
  ),

  (out) =>
    /__olumAnon_\w+ = \(\$event\) => \{ __props\.onclick\(\) \}/.test(out) &&
    /onclick\|__olumAnon_/.test(out) &&
    parses(out),
);

check(
  "forwarding a function prop records a props source (resolved live at runtime)",
  comp(
    `<C fn="{props().onSave}" />`,
    `import C from "./C";\nimport { props } from "../core/olum.js";`,
  ),
  (out) => /fn:props:onSave/.test(out) && parses(out),
);

check(
  "calling a function prop in an event compiles to an anon handler",
  comp(
    `<button onclick="props().toggle(props().todo.id)">x</button>`,
    `import { props } from "../core/olum.js";`,
  ),
  (out) =>
    /const __olumAnon_\w+ = \(\$event\) => \{ props\(_storeKey\)\.toggle\(props\(_storeKey\)\.todo\.id\) \};/.test(
      out,
    ) && parses(out),
);

check(
  "plain method-call events still use the direct call-list path (no anon wrapper)",
  comp(
    `<button onclick="inc(), dec($event)">x</button>`,
    `const inc = () => {};\nconst dec = (e) => {};`,
  ),
  (out) =>
    !/__olumAnon_/.test(out) &&
    /onclick\|inc=/.test(out) &&
    /dec=/.test(out) &&
    parses(out),
);

section("§12 Slots");

check(
  "{children} compiles to the slot interpolation",
  comp(`<div class="slot">{children}</div>`),
  (out) =>
    /<div class="slot">\$\{children\}<\/div>/.test(tmpl(out)) && parses(out),
);

section("§14 Watchers");

check(
  "a watcher is wired into proxyHandler",
  comp(`<div></div>`, `const watcher = { count(o, n) {} };`),
  (out) => /olum\.proxyHandler\(state, ?watcher,/.test(out) && parses(out),
);

check(
  "no watcher -> proxyHandler gets null",
  comp(`<div></div>`),
  (out) => /olum\.proxyHandler\(state, ?null,/.test(out) && parses(out),
);

section("§15 Lifecycle hooks");

check(
  "mounted hook is resolved at runtime via a typeof guard",
  comp(`<div></div>`, `const mounted = () => 0; const unMounted = () => 0;`),
  (out) =>
    /mounted: ?typeof mounted !== "undefined" \? mounted : null/.test(out) &&
    parses(out),
);

check(
  "unMounted is emitted as a null placeholder (assigned at runtime)",
  comp(`<div></div>`),
  (out) => /unMounted: ?null/.test(out) && parses(out),
);

section("§16 Scoped CSS");

check(
  "styles are scoped onto the selector's last compound and injected",
  comp(`<div class="box"></div>`).replace(
    "</script>",
    "</script>\n<style>.box{color:red}\np:hover{color:blue}</style>",
  ),
  (out) =>
    /\.box\[data-o-\w+\]/.test(out) &&
    /p\[data-o-\w+\]:hover/.test(out) &&
    /olum\.injectStyle\(/.test(out) &&
    parses(out),
);

section("§17 Imports");

check(
  "component import is preserved (resolved to .js) and registered",
  comp(`<Badge />`, `import Badge from "./Badge";`),
  (out) =>
    /import Badge from "\.\/Badge\.js"/.test(out) &&
    /components:\s*\{[^}]*Badge\s*:\s*Badge/.test(out) &&
    parses(out),
);

section("§19 Unsupported prop syntax");

check(
  "naked-brace prop shorthand <Comp {a}/> is ignored (no props)",
  comp(`<C {state} />`, `import C from "./C";`),

  (out) =>
    /<olum name="C"/.test(tmpl(out)) &&
    !/data-o-props=/.test(tmpl(out)) &&
    parses(out),
);

check(
  "unquoted brace prop <Comp a={a}/> is ignored (no props)",
  comp(`<C a={state} />`, `import C from "./C";`),
  (out) =>
    /<olum name="C"/.test(tmpl(out)) &&
    !/data-o-props=/.test(tmpl(out)) &&
    parses(out),
);

section("§20 File-based routing (compileRoutes)");

const { compileRoutes } = require("../lib/helpers");
const fs = require("fs");
const os = require("os");
const nodePath = require("path");

function checkFn(name, producer, assertion) {
  let out;
  try {
    out = producer();
  } catch (e) {
    recordFail(name);
    console.log(
      "  " + FAIL_ICON + " " + name + dim("  (threw: " + e.message + ")"),
    );
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
    if (!detail)
      detail = "\n      " + dim(String(out).replace(/\s+/g, " ").slice(0, 200));
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
        "components/Widget.html",
        "_drafts/page.html",
      ],
      (root) => compileRoutes(root),
    ),
  (out) => {
    const paths = [...out.matchAll(/path: "([^"]+)"/g)].map((m) => m[1]);
    return (
      /import App from "\.\/page\.js";/.test(out) &&
      /import NotFound from "\.\/not-found\.js";/.test(out) &&
      /import About from "\.\/about\/page\.js";/.test(out) &&
      /import Club from "\.\/\(main\)\/club\/page\.js";/.test(out) &&
      /import BlogSlug from "\.\/01-blog\/\[slug\]\/page\.js";/.test(out) &&
      /\{ path: "\/club", comp: Club \}/.test(out) &&
      /\{ path: "\/blog\/:slug", comp: BlogSlug \}/.test(out) &&
      /\{ path: "\/about", comp: About \}/.test(out) &&
      paths[0] === "/" &&
      paths[paths.length - 1] === "/404" &&
      /err: "\/404",/.test(out) &&
      !/Widget|_drafts|Drafts/.test(out) &&
      /new Router\(config\)/.test(out) &&
      /new Olum\(\)\.\$\("#app"\)\.use\(router\)/.test(out)
    );
  },
);

checkFn(
  "no not-found.html -> no /404 route and no err in the router config",
  () =>
    withRouteTree(["page.html", "about/page.html"], (root) =>
      compileRoutes(root),
    ),
  (out) =>
    !/\/404/.test(out) &&
    !/err:/.test(out) &&
    /\{ path: "\/", comp: App \}/.test(out) &&
    /\{ path: "\/about", comp: About \}/.test(out),
);

section("§21 Live destructured props");

const LIVE_FIXTURE = `<script>
  import { props } from "olum";
  const { color, size = "md", theme: t } = props();
  const shout = () => color + "!";
  const shadowed = (color) => color.trim();
  const payload = () => ({ color });
  const keyed = { color: 1 };
  const member = (o) => o.color;
</script>
<p>{color} {size} {t}</p>
<for each="color of [1,2]"><i>{color}</i></for>`;

check("template reference becomes a live read", LIVE_FIXTURE, (out) =>
  /esc\(__props\.color\)/.test(tmpl(out)),
);

check("method body reference is rewritten too", LIVE_FIXTURE, (out) =>
  /__props\.color \+ "!"/.test(out),
);

check("a default becomes an undefined-guarded ternary", LIVE_FIXTURE, (out) =>
  /__props\.size === undefined \? \("md"\) : __props\.size/.test(out),
);

check("an alias reads its original prop key", LIVE_FIXTURE, (out) =>
  /esc\(__props\.theme\)/.test(tmpl(out)),
);

check("a shadowing param is left alone", LIVE_FIXTURE, (out) =>
  /\(color\) => color\.trim\(\)/.test(out),
);

check(
  "a loop variable shadowing the prop is left alone",
  LIVE_FIXTURE,
  (out) =>
    /map\(function\(color\)/.test(tmpl(out)) &&
    /<i>\$\{olum\.esc\(color\)\}<\/i>/.test(tmpl(out)),
);

check(
  "object-expression shorthand expands with its key; keys and members untouched",
  LIVE_FIXTURE,
  (out) =>
    /\(\{ color: __props\.color \}\)/.test(out) &&
    /\{ color: 1 \}/.test(out) &&
    /o\.color/.test(out),
);

check(
  "the declaration is kept and the output still parses",
  LIVE_FIXTURE,
  (out) =>
    /\{ color, size = "md", theme: t \} = props\(_storeKey\)/.test(out) &&
    parses(out),
);

section("§22 <log> debug tag");

check(
  "<log>{expr}</log> compiles to console.log(expr) rendering nothing",
  "<log>{state.user}</log>",
  (out) =>
    /\$\{\(console\.log\(state\.user\), ''\)\}/.test(tmpl(out)) &&
    !/<log>/.test(out),
);

check(
  "the logged state key becomes a template dep (so it re-fires on change)",
  "<script>\n  const state = { n: 0, user: {} };\n</script>\n<div>{state.n}</div>\n<log>{state.user}</log>",
  (out) => /deps:\s*\[[^\]]*"user"[^\]]*\]/.test(out),
);

check(
  "multiple comma-separated args pass straight through to console.log",
  "<log>{state.a, state.b}</log>",
  (out) => /console\.log\(state\.a, state\.b\)/.test(tmpl(out)),
);

check(
  "an object-literal argument keeps its braces",
  "<log>{ {name: state.user} }</log>",
  (out) =>
    /console\.log\(\{name: state\.user\}\)/.test(tmpl(out)) && parses(out),
);

check(
  "a comment containing the text <script> doesn't wipe the template",
  `<!-- put this in <script> -->\n<script>\n  const state = { n: 0 };\n</script>\n<p>{state.n}</p>`,
  (out) => /olum\.esc\(state\.n\)/.test(tmpl(out)) && parses(out),
);

section("§23 <transition> tag");

check(
  "<transition> dissolves and stamps data-o-trans on its child",
  comp(`<transition in="fly({ y: 200 })" out="fade"><p>hi</p></transition>`),
  (out) =>
    /<p[^>]*data-o-trans=/.test(tmpl(out)) &&
    !/<transition/.test(tmpl(out)) &&
    parses(out),
);

check(
  "in and out defs are encoded with render-time params",
  comp(`<transition in="fly({ y: 200 })" out="fade"><p>hi</p></transition>`),
  (out) =>
    /in:fly=\$\{JSON\.stringify\(\[\{ y: 200 \}\]\)\}/.test(out) &&
    /out:fade=\$\{JSON\.stringify\(\[\]\)\}/.test(out),
);

check(
  "transition shorthand applies the same fn to in and out",
  comp(`<transition transition="fade"><p>hi</p></transition>`),
  (out) => /in:fade=/.test(out) && /out:fade=/.test(out) && parses(out),
);

check(
  "flip attribute encodes a flip= segment with render-time params",
  comp(`<transition flip="{ duration: 300 }"><li>x</li></transition>`),
  (out) =>
    /flip=\$\{JSON\.stringify\(\[\{ duration: 300 \}\]\)\}/.test(out) &&
    /<li[^>]*data-o-trans=/.test(tmpl(out)) &&
    parses(out),
);

check(
  "bare flip (no params) encodes flip= with an empty arg list",
  comp(`<transition flip><li>x</li></transition>`),
  (out) => /flip=\$\{JSON\.stringify\(\[\]\)\}/.test(out) && parses(out),
);

check(
  "flip composes with in/out on the same wrapper (crossfade + flip)",
  comp(
    `<transition in="receive({ key: id })" out="send({ key: id })" flip><li>x</li></transition>`,
  ),
  (out) =>
    /in:receive=/.test(out) &&
    /out:send=/.test(out) &&
    /flip=/.test(out) &&
    parses(out),
);

console.log("\n========================");
const summary = `${passed} passed, ${failed} failed`;
console.log((failed ? red(bold(summary)) : green(bold(summary))) + "\n");

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

const EXPECTED_CHECKS = 90;
const total = passed + failed;
if (total !== EXPECTED_CHECKS) {
  console.log(
    yellow(
      `⚠ ran ${total} checks but expected ${EXPECTED_CHECKS} — did a test get dropped?`,
    ) + "\n",
  );
  process.exit(1);
}

process.exit(failed ? 1 : 0);
