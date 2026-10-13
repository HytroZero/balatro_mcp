-- Headless original-game state -> live exporter -> independent worker round-trip fixture.
local json = dofile('play/mod/json.lua')
local runtime = dofile('env/sandbox/runtime.lua').new(assert(arg[1]),json)
local exporter = dofile('play/mod/score_snapshot.lua')(json)
local function upvalue(fn, wanted)
  for i=1,100 do
    local name,value=debug.getupvalue(fn,i)
    if name == wanted then return value end
    if not name then break end
  end
  error('Missing test upvalue: '..wanted)
end
local configurations = {
  {hand={'S_K','H_K','D_A'},jokers={'j_joker','j_green_joker'},game={dollars=25}},
  {hand={'S_K','H_K','D_A'},jokers={'j_bull'},blind='bl_tooth',game={dollars=10}},
  {hand={'S_K','H_K','D_A'},jokers={'j_bull'},blind='bl_ox',game={dollars=10,current_round={most_played_poker_hand='Pair'}}},
  {hand={{key='S_A',enhancement='m_lucky'}},jokers={'j_oops'},game={probabilities={normal=3}}},
  {hand={'S_K','H_K','D_A'},jokers={'j_stencil'},jokerSlots=3},
  {hand={'S_K','H_K','D_A'},jokers={'j_juggler','j_chicot'},blind='bl_hook',consumables={'c_mercury'},game={used_vouchers={v_observatory=true}}},
  {hand={{key='S_K',enhancement='m_steel',seal='Red'},'H_K','D_A'},jokers={'j_baron'},back='b_plasma'},
  {hand={'S_K','H_K','D_A'},blind={key='bl_eye',hands={Pair=true}}},
  {hand={'S_K','H_K','D_A'},blind={key='bl_mouth',only_hand='High Card'}},
  {hand={'S_K','H_K','D_A'},jokers={'j_stone'},deck={{key='D_2',enhancement='m_stone'}},discard={{key='C_2',enhancement='m_stone'}}},
}
local out=json.array()
for _, configuration in ipairs(configurations) do
  configuration.random='fixed'
  local loaded=runtime.load(configuration)
  assert(loaded.status=='ready',loaded.message)
  G=upvalue(runtime.load,'G')
  G.hand.config.highlighted_limit=5
  local snapshot=exporter.read()
  assert(snapshot.status=='ready',snapshot.message)
  -- Scoring must not be necessary to serialize a live position.
  local plays=json.array()
  for i=1,#G.hand.cards do plays[#plays+1]=json.array({i-1}) end
  if #G.hand.cards>1 then plays[#plays+1]=json.array({0,1}) end
  local expected=json.array()
  for _, play in ipairs(plays) do expected[#expected+1]=runtime.score(play) end
  out[#out+1]={snapshot=snapshot,plays=plays,expected=expected}
end
print(json.encode(out))
