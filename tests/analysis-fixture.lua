-- Headless original-game positions -> the mod's analysis snapshot, for tests/analysis.test.ts.
-- arg[1] is the original source directory, arg[2] a JSON array of sandbox positions. Each may
-- add test-only keys: hide (zero-based hand indices turned face down) and forced (one index).
local json = dofile('play/mod/json.lua')
local runtime = dofile('env/sandbox/runtime.lua').new(assert(arg[1]), json)
local exporter = dofile('play/mod/score_snapshot.lua')(json)
local function upvalue(fn, wanted)
  for i = 1, 100 do
    local name, value = debug.getupvalue(fn, i)
    if name == wanted then return value end
    if not name then break end
  end
  error('Missing test upvalue: ' .. wanted)
end
local out = json.array()
for _, configuration in ipairs(json.decode(assert(arg[2]), 1048576)) do
  local hide, forced = configuration.hide or {}, configuration.forced
  configuration.hide, configuration.forced = nil, nil
  configuration.random = 'fixed'
  local loaded = runtime.load(configuration)
  -- The Hook is refused only at the scoring boundary; its position still exports.
  assert(loaded.status == 'ready' or configuration.blind == 'bl_hook', loaded.message)
  G = upvalue(runtime.load, 'G')
  G.hand.config.highlighted_limit = 5
  for _, index in ipairs(hide) do G.hand.cards[index + 1].facing = 'back' end
  if forced then G.hand.cards[forced + 1].ability.forced_selection = true end
  out[#out + 1] = exporter.analysis('SELECTING_HAND')
end
print(json.encode(out))
