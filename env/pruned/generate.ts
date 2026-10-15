import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { devNull } from 'node:os';
import { projectRoot } from '../../src/config.ts';
const require = createRequire(import.meta.url);
const lua = require('luaparse');
type Node = any;
const luaExecutable = process.env.LUAJIT ?? 'luajit';
const root = resolve(projectRoot, 'env/sandbox/vendor'), out = resolve(projectRoot, 'env/pruned');
const paths = ['engine/object.lua', 'game.lua', 'globals.lua', 'card.lua', 'blind.lua', 'back.lua',
  'functions/misc_functions.lua', 'functions/common_events.lua', 'functions/state_events.lua'];
// Preserve UTF-16 ranges; non-ASCII localization text is copied verbatim, never specialized.
const parse = (s: string): Node => {
  return lua.parse(s.replace(/[^\x00-\x7f]/g, '?').replace(/\bbreak(\s*);/g, 'break$1 '), { ranges: true, locations: true, luaVersion: 'LuaJIT', encodingMode: 'pseudo-latin1' });
};
const members = (n: Node): string => !n ? '' : n.type === 'Identifier' ? n.name : n.type === 'MemberExpression'
  ? members(n.base) + '.' + n.identifier.name : '';
function children(n: Node): Node[] {
  return Object.entries(n).filter(([k]) => !['range', 'loc', 'comments'].includes(k)).flatMap(([, v]) =>
    Array.isArray(v) ? v.filter(x => x?.type) : (v as Node)?.type ? [v] : []);
}
function walk(n: Node, fn: (n: Node) => void) { fn(n); for (const child of children(n)) walk(child, fn); }
const removed = new Set(['card_eval_status_text', 'juice_card', 'highlight_card', 'play_sound', 'delay',
  'attention_text', 'check_for_unlock', 'inc_career_stat', 'check_and_set_high_score', 'set_hand_usage',
  'ease_discard', 'get_joker_win_sticker', 'juice_card_until', 'G.E_MANAGER.add_event', 'update_hand_text',
  'unlock_card', 'discover_card']);
const visualMethods = new Set(['set_sprites', 'juice_up', 'update_alert', 'wiggle']);
// These events never occur in the one-hand score-only boundary.
const neverContexts = new Set(['open_booster', 'buying_card', 'selling_self', 'selling_card', 'reroll_shop',
  'ending_shop', 'skip_blind', 'skipping_booster', 'setting_blind', 'first_hand_drawn', 'playing_card_added',
  'pre_discard', 'discard', 'end_of_round', 'after', 'destroying_card', 'remove_playing_cards', 'cards_destroyed',
  'using_consumeable', 'consumeable', 'blind', 'other_consumeable']);
const unknown = Symbol('unknown');
function constant(n: Node, joker?: string): any {
  if (!n) return unknown;
  if (['BooleanLiteral', 'StringLiteral', 'NumericLiteral', 'NilLiteral'].includes(n.type)) return n.value;
  const name = members(n);
  if (joker !== undefined && name === 'self.ability.name') return joker;
  if (name.startsWith('context.') && neverContexts.has(name.slice(8))) return false;
  if (n.type === 'UnaryExpression' && n.operator === 'not') { const v = constant(n.argument, joker); return v === unknown ? unknown : !truth(v); }
  if (n.type === 'BinaryExpression' && ['==', '~='].includes(n.operator)) {
    const a = constant(n.left, joker), b = constant(n.right, joker);
    return a === unknown || b === unknown ? unknown : n.operator === '==' ? a === b : a !== b;
  }
  if (n.type === 'LogicalExpression') {
    const a = constant(n.left, joker), b = constant(n.right, joker);
    if (n.operator === 'and') {
      if (a !== unknown && !truth(a) || b !== unknown && !truth(b)) return false;
      if (a !== unknown && b !== unknown) return b;
    } else {
      if (a !== unknown && truth(a)) return a;
      if (a !== unknown && b !== unknown) return b;
      // Unknown left OR true still must evaluate left (e.g. RNG); retain it.
    }
  }
  return unknown;
}
const truth = (v: any): boolean => v !== false && v !== null && v !== undefined;
function isPure(n: Node, joker?: string): boolean {
  if (['CallExpression', 'TableCallExpression', 'StringCallExpression'].includes(n.type)) return false;
  if (n.type === 'LogicalExpression') {
    if (!isPure(n.left, joker)) return false;
    const a = constant(n.left, joker);
    if (a !== unknown && (n.operator === 'and' && !truth(a) || n.operator === 'or' && truth(a))) return true;
    return isPure(n.right, joker);
  }
  return children(n).every(c => isPure(c, joker));
}
function render(n: Node, source: string, joker?: string): string {
  const raw = () => source.slice(n.range[0], n.range[1]);
  if (n.type === 'PrunedCommonMain') return 'local effect = scoring_common_main(self,context)\nif effect then return effect end';
  if (n.type === 'PrunedCommonIndividual') return 'local effect = scoring_common_individual(self,context)\nif effect then return effect end';
  if (n.type === 'CallStatement') {
    const base = n.expression.base, name = members(base), method = base?.identifier?.name;
    if (removed.has(name) || base?.indexer === ':' && visualMethods.has(method)) return '';
  }
  if (n.type === 'AssignmentStatement' && n.variables.every((v: Node) => v.type === 'Identifier' && ['percent', 'percent_delta'].includes(v.name))) return '';
  if (n.type === 'AssignmentStatement' && n.variables.every((v: Node) => v.type === 'MemberExpression' && ['colour', 'sell_cost_label'].includes(v.identifier.name))) return '';
  if (n.type === 'LocalStatement' && n.variables.every((v: Node) => ['percent', 'percent_delta'].includes(v.name))) return '';
  if (n.type === 'TableConstructorExpression') {
    const fields = n.fields.filter((f: Node) => !(f.type === 'TableKeyString' && ['message', 'colour', 'no_juice', 'sound', 'pitch', 'volume', 'pos', 'atlas', 'soul_pos', 'unlock_condition'].includes(f.key.name)));
    return '{' + fields.map((f: Node) => render(f, source, joker)).join(',\n') + '}';
  }
  if (n.type === 'IfStatement') {
    const clauses: { condition?: string; body: string }[] = [];
    for (const c of n.clauses) {
      const value = c.condition ? constant(c.condition, joker) : true;
      if (value !== unknown && !truth(value) && isPure(c.condition, joker)) continue;
      const body = c.body.map((x: Node) => render(x, source, joker)).filter(Boolean).join('\n');
      if (value !== unknown && truth(value)) {
        if (!clauses.length) return body ? 'do\n' + body + '\nend' : '';
        clauses.push({ body }); break;
      }
      clauses.push({ condition: render(c.condition, source, joker), body });
    }
    if (!clauses.length) return '';
    if (clauses.every(c => !c.body) && n.clauses.every((c: Node) => !c.condition || isPure(c.condition, joker))) return '';
    return clauses.map((c, i) => (c.condition ? (i ? 'elseif ' : 'if ') + c.condition + ' then' : 'else') + '\n' + c.body).join('\n') + '\nend';
  }
  let result = raw();
  for (const c of children(n).sort((a, b) => b.range[0] - a.range[0])) {
    const start = c.range[0] - n.range[0]; let end = c.range[1] - n.range[0];
    const replacement = render(c, source, joker);
    if (!replacement && result[end] === ';') end++;
    result = result.slice(0, start) + replacement + result.slice(end);
  }
  return result;
}
const modules = paths.map(path => { const source = readFileSync(resolve(root, path), 'utf8'); return { path, source, ast: parse(source) }; });
const defs = new Map<string, { module: typeof modules[number]; node: Node; code: string }>();
for (const module of modules) for (const node of module.ast.body) {
  let name = node.type === 'FunctionDeclaration' ? members(node.identifier) : '';
  if (node.type === 'AssignmentStatement' && node.init.length === 1 && node.init[0].type === 'FunctionDeclaration') name = members(node.variables[0]);
  if (!name) continue;
  let code: string;
  if (name === 'Game.init_item_prototypes') {
    const init = node.body.filter((n: Node) => n.type === 'AssignmentStatement' && ['self.P_CARDS', 'self.P_BLINDS', 'self.P_CENTERS'].includes(members(n.variables[0])));
    assert.equal(init.length, 3);
    code = 'function Game:init_item_prototypes()\n' + init.map((n: Node) => render(n, module.source)).join('\n') +
      '\nfor k,v in pairs(self.P_CENTERS) do v.key=k; v.discovered=true end\nfor k,v in pairs(self.P_BLINDS) do v.key=k end\nend';
  } else if (name === 'Game.set_globals') {
    const keepGlobals = new Set(['self.VERSION', 'self.STAGES', 'self.STATES', 'self.FUNCS']);
    code = 'function Game:set_globals()\n' + node.body.filter((n: Node) => n.type === 'AssignmentStatement' && keepGlobals.has(members(n.variables[0])))
      .map((n: Node) => render(n, module.source)).join('\n') + '\nself.SETTINGS={}\nend';
  } else if (name === 'Back.init') {
    const effect = node.body.findIndex((n: Node) => n.type === 'AssignmentStatement' && members(n.variables[0]) === 'self.effect');
    assert.ok(effect >= 0); node.body = node.body.slice(0, effect + 1); code = render(node, module.source);
  } else if (name === 'Card.update') {
    const stage = node.body.find((n: Node) => n.type === 'IfStatement' && module.source.slice((n.clauses[0].condition.range)[0], (n.clauses[0].condition.range)[1]) === 'G.STAGE == G.STAGES.RUN');
    assert.ok(stage);
    const counters = new Set(['Throwback', "Driver's License", 'Steel Joker', 'Cloud 9', 'Stone Joker', 'Joker Stencil', 'Swashbuckler']);
    const body = stage.clauses[0].body.filter((n: Node) => n.type === 'IfStatement' && (module.source.slice((n.clauses[0].condition.range)[0], (n.clauses[0].condition.range)[1]).includes('perma_debuff') ||
      [...counters].some(key => module.source.slice((n.clauses[0].condition.range)[0], (n.clauses[0].condition.range)[1]).includes(key))));
    code = 'function Card:update(dt)\n' + body.map((n: Node) => render(n, module.source)).join('\n') + '\nend';
  } else if (name === 'Card.set_edition') {
    node.body = node.body.filter((n: Node) => !(n.type === 'IfStatement' && module.source.slice((n.clauses[0].condition.range)[0], (n.clauses[0].condition.range)[1]) === 'self.edition and not silent'));
    code = render(node, module.source);
  } else if (name === 'G.FUNCS.evaluate_play') {
    const fn = node.init[0];
    const branch = fn.body.find((x: Node) => x.type === 'IfStatement' && module.source.slice((x.range)[0], (x.range)[1]).startsWith('if not G.GAME.blind:debuff_hand'));
    assert.ok(branch);
    const body = branch.clauses[0].body;
    const final = body.findIndex((x: Node) => x.type === 'LocalStatement' && x.variables[0]?.name === 'nu_chip');
    assert.ok(final >= 0); branch.clauses[0].body = body.slice(0, final + 3);
    // Cut all destruction/after-hand scheduling after the scoring/debuff branch.
    fn.body = fn.body.slice(0, fn.body.indexOf(branch) + 1);
    code = 'G.FUNCS.evaluate_play = function(e)\n' + fn.body.map((x: Node) => render(x, module.source)).filter(Boolean).join('\n') + '\nend';
  } else if (name === 'Card.calculate_joker') {
    let commonMain = '', commonIndividual = '';
    function factor(n: Node) {
      if (n.type === 'IfStatement' && module.source.slice((n.clauses[0].condition.range)[0], (n.clauses[0].condition.range)[1]).startsWith("self.ability.effect == 'Suit Mult'")) {
        commonIndividual = render(n, module.source); n.type = 'PrunedCommonIndividual'; return;
      }
      for (const [key, value] of Object.entries(n)) {
        if (key === 'body' && Array.isArray(value)) {
          for (let i = 0; i + 2 < value.length; i++) {
            const seq = value.slice(i, i + 3);
            if (seq.every((s: Node, at: number) => s.type === 'IfStatement' && module.source.slice((s.clauses[0].condition.range)[0], (s.clauses[0].condition.range)[1]).startsWith(['self.ability.x_mult > 1 and', 'self.ability.t_mult > 0 and', 'self.ability.t_chips > 0 and'][at]))) {
              commonMain = seq.map((s: Node) => render(s, module.source)).join('\n');
              value.splice(i, 3, { type: 'PrunedCommonMain', range: [seq[0].range[0], seq[2].range[1]] });
            }
          }
        }
      }
      for (const child of children(n)) factor(child);
    }
    factor(node);
    const names = new Set<string>();
    walk(node, n => {
      if (n.type === 'BinaryExpression' && ['==', '~='].includes(n.operator)) {
        if (members(n.left) === 'self.ability.name' && n.right.type === 'StringLiteral') names.add(n.right.value);
        if (members(n.right) === 'self.ability.name' && n.left.type === 'StringLiteral') names.add(n.left.value);
      }
    });
    const jokerBranch = node.body.find((n: Node) => n.type === 'IfStatement' && module.source.slice((n.clauses[0].condition.range)[0], (n.clauses[0].condition.range)[1]) === 'self.ability.set == "Joker" and not self.debuff');
    assert.ok(jokerBranch);
    const bodyFor = (key: string) => jokerBranch.clauses[0].body.map((x: Node) => render(x, module.source, key)).filter(Boolean).join('\n');
    const parts = ['local scoring_jokers = {}', 'local function scoring_common_main(self,context)\n' + commonMain + '\nend',
      'local function scoring_common_individual(self,context)\n' + commonIndividual + '\nend'];
    const fallback = bodyFor('__unknown_joker__'), seenBodies = new Map<string, string>();
    for (const key of names) {
      const body = bodyFor(key); if (body === fallback) continue;
      if (seenBodies.has(body)) parts.push('scoring_jokers[' + JSON.stringify(key) + '] = scoring_jokers[' + JSON.stringify(seenBodies.get(body)) + ']');
      else { seenBodies.set(body, key); parts.push('scoring_jokers[' + JSON.stringify(key) + '] = function(self,context)\n' + body + '\nend'); }
    }
    parts.push('local function scoring_other(self,context)\n' + fallback + '\nend');
    const prefix = node.body.slice(0, node.body.indexOf(jokerBranch)).map((n: Node) => render(n, module.source)).join('\n');
    parts.push('function Card:calculate_joker(context)\n' + prefix + '\nif self.ability.set == "Joker" then return (scoring_jokers[self.ability.name] or scoring_other)(self,context) end\nend');
    code = parts.join('\n');
  } else code = render(node, module.source);
  // Remove comments and blank lines after slicing, without changing code tokens.
  const comments = parse(code).comments ?? [];
  for (const c of comments.sort((a: Node, b: Node) => b.range[0] - a.range[0])) code = code.slice(0, c.range[0]) + code.slice(c.range[1]);
  defs.set(name, { module, node, code });
}
const keep = new Set(['Game.init', 'Game.set_globals', 'Game.init_item_prototypes', 'Game.init_game_object',
  'Card.set_base', 'Card.set_ability', 'Card.set_edition', 'Card.set_debuff', 'Card.set_cost', 'Card.change_suit',
  'Card.add_to_deck', 'Card.remove_from_deck', 'Card.update', 'Card.calculate_joker', 'Card.get_chip_mult', 'Card.get_p_dollars',
  'Card.get_id', 'Blind.debuff_card', 'Blind.debuff_hand', 'Blind.modify_hand', 'Back.init', 'Back.trigger_effect',
  'pseudorandom', 'pseudoseed', 'pseudorandom_element', 'pseudohash', 'level_up_hand', 'G.FUNCS.evaluate_play', 'G.FUNCS.get_poker_hand_info']);
const overridden = new Set([...removed, 'ease_dollars', 'play_area_status_text', 'localize', 'copy_card',
  'create_card', 'create_playing_card', 'convert_save_to_meta', 'Game.save_progress', 'get_compressed', 'STR_UNPACK',
  'Blind.disable']);
// Conservative static call closure. Any receiver of a retained Card/Blind/Back method may use it.
let changed = true;
while (changed) {
  changed = false;
  for (const name of [...keep]) {
    const def = defs.get(name); if (!def) continue;
    walk(parse(def.code), n => {
      if (['CallExpression', 'TableCallExpression', 'StringCallExpression'].includes(n.type)) {
        const exact = members(n.base), method = n.base?.identifier?.name;
        const className = members(n.base?.base);
        const owner = className === 'self' && name.includes('.') ? name.split('.')[0] : '';
        const candidates = n.base?.indexer === ':' ? owner ? [owner + '.' + method] : [exact, 'Card.' + method, 'Blind.' + method, 'Back.' + method] : [exact];
        for (const key of candidates) if (defs.has(key) && !overridden.has(key) && !visualMethods.has(method) && !keep.has(key)) { keep.add(key); changed = true; }
      }
    });
  }
}
// Functions already overridden by runtime must not pull their original UI dependencies back in.
for (const name of removed) keep.delete(name);
for (const name of ['Card.init', 'Card.set_sprites', 'Card.juice_up', 'Card.update_alert', 'Blind.juice_up', 'Blind.wiggle', 'Blind.disable']) keep.delete(name);
const report: any = { mode: 'normal-jit', inputBytes: 0, outputBytes: 0, inputLines: 0, outputLines: 0, functionsKept: [...keep].sort(), modules: [] };
for (const module of modules) {
  let code: string;
  if (module.path === 'engine/object.lua') code = module.source;
  else {
    const parts: string[] = [];
    for (const node of module.ast.body) {
      const def = [...defs.entries()].find(([, v]) => v.module === module && v.node === node);
      if (def) { if (keep.has(def[0])) parts.push(def[1].code); }
      else parts.push(render(node, module.source));
    }
    code = parts.join('\n');
  }
  code = code.split('\n').map(s => s.trimEnd()).filter(s => s.trim()).join('\n') + '\n';
  const target = resolve(out, module.path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, code);
  execFileSync(luaExecutable, ['-b', target, devNull]);
  const row = { path: module.path, inputBytes: Buffer.byteLength(module.source), outputBytes: Buffer.byteLength(code), inputLines: module.source.split('\n').length, outputLines: code.split('\n').length };
  report.modules.push(row); for (const key of ['inputBytes', 'outputBytes', 'inputLines', 'outputLines'] as const) report[key] += row[key];
}
let runtime = readFileSync(resolve(projectRoot, 'env/sandbox/runtime.lua'), 'utf8');
runtime = runtime.replace('-- Scoring adapter for unchanged Balatro 1.0.1o source. Each worker owns its Lua VM.',
  '-- Score-only adapter for the bundled pruned Balatro 1.0.1o modules.')
  .replace('Missing Balatro source (', 'Missing pruned engine module (')
  .replace('; run npm run sandbox:prepare: ', ': ');
// Set this before source/prototype initialization allocates the first machine-code
// area. These macOS arm64 workers own their Lua VM; other platforms keep defaults.
// A larger single area avoids the measured allocation/flush/recompile cycle while
// retaining normal JIT, including the random-expectation Joker adapters.
runtime = `-- Pruned engine JIT policy; applied to direct runtime and worker callers.
local jit = require('jit')
if jit.os == 'OSX' and jit.arch == 'arm64' then
  jit.opt.start('sizemcode=2048')
end
` + runtime;
report.jitPolicy = { os: 'OSX', arch: 'arm64', machineCodeAreaKB: 2048 };
runtime = runtime.replace("function runtime.load(snapshot, onlyScore, onlyClassify)", "function runtime.load(snapshot, onlyScore, onlyClassify)\n    if snapshot.trace or not onlyScore and snapshot.random ~= 'minimal' and snapshot.random ~= 'expectation' then\n      restoreBaseline = nil\n      return {status='unsupported', message='Pruned experiment requires score-only mode without trace'}\n    end");
runtime = runtime.replace('error(scoringFinished, 0)', 'return env.hand_chips, env.mult');
writeFileSync(resolve(out, 'runtime.lua'), runtime);
report.runtimeSha256 = createHash('sha256').update(runtime).digest('hex');
const worker = readFileSync(resolve(projectRoot, 'env/sandbox/worker.lua'), 'utf8')
  .replace('local root, source = assert(arg[1]), assert(arg[2])',
    "-- ScoringSandbox supplies (projectRoot, source); direct callers need no arguments.\nlocal source = arg[2] or arg[1] or (arg[0]:match('^(.*)[/\\\\]') or '.')")
  .replace("dofile(root .. '/play/mod/json.lua')", "dofile(source .. '/json.lua')")
  .replace("dofile(root .. '/env/sandbox/runtime.lua')", "dofile(source .. '/runtime.lua')");
writeFileSync(resolve(out, 'worker.lua'), worker);
writeFileSync(resolve(out, 'json.lua'), readFileSync(resolve(projectRoot, 'play/mod/json.lua')));
report.files = Object.fromEntries([...paths, 'runtime.lua', 'worker.lua', 'json.lua'].map(path =>
  [path, createHash('sha256').update(readFileSync(resolve(out, path))).digest('hex')]));
writeFileSync(resolve(out, 'manifest.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
