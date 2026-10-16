-- Wire protocol and operation lifecycle; independent of the socket transport.
return function(json, game, clock, instance, timeout, analysis, effects)
  local bridge = {}
  local serial, runSerial, previousRun, fingerprint = 0, 0, nil, ''
  local pending, poisoned, operations, order = nil, false, {}, {}
  local function blocked()
    return type(poisoned) == 'string' and poisoned or poisoned and 'Previous action needs manual inspection' or pending and 'Waiting for the current action' or nil
  end
  local function read()
    local state = game.state(); local gameReady, reason = game.ready()
    local ready = not pending and not poisoned and gameReady
    reason = blocked() or not ready and reason or nil
    -- Deck-only edits also invalidate action references, without adding deck
    -- composition to ordinary observations or model context.
    return state, ready, reason, json.encode({state=state,ready=ready,notReadyReason=reason,cards=game.cards()})
  end
  local function snapshot()
    if G.GAME ~= previousRun then previousRun = G.GAME; runSerial = runSerial + 1 end
    local state, ready, reason, text = read()
    if text ~= fingerprint then serial = serial + 1; fingerprint = text end
    -- Original end_round can set won=true even on a losing final Boss.
    -- The game-over phase takes precedence over that flag.
    local outcome = state.state == 'GAME_OVER' and 'lost' or state.won and 'won' or 'ongoing'
    return {contract=1,backend='balatro_mcp_mod',revision=instance .. ':' .. serial,runId=instance .. ':run:' .. runSerial,
      gameVersion=(G.VERSION or ''):gsub('%-FULL$', ''),terminal=outcome ~= 'ongoing',outcome=outcome,ready=ready,state=state,
      availableMethods=ready and game.methods() or json.array(),legality='backend-authoritative',notReadyReason=reason}
  end
  local function exact(params, fields)
    for key in pairs(params) do if not fields[key] then game.fail('invalid_arguments', 'Unexpected RPC argument') end end
  end
  function bridge.dispatch(method, params)
    if method == 'sf.health' then
      exact(params, {})
      local ready, reason = game.ready()
      ready = not pending and not poisoned and ready
      reason = blocked() or not ready and reason or nil
      return {status='ok',bridge='balatro_mcp_mod',protocol=1,instanceId=instance,gameVersion=G.VERSION,luaRuntime=jit and jit.version,
        ready=ready,notReadyReason=reason,preservesTiming=true,transport='http-jsonrpc',
        capabilities=json.array({'observe','deck_observe','act','operation','reroll_boss','buy_and_use','decision_state','analysis_snapshot'})}
    elseif method == 'sf.observe' then exact(params, {}); return snapshot()
    elseif method == 'sf.deck_observe' then
      exact(params, {})
      local current = snapshot(); local cards = game.cards()
      cards.revision = current.revision; cards.runId = current.runId
      return cards
    elseif method == 'sf.analysis_snapshot' then
      -- Read-only and on demand: the public observation and the sandbox input
      -- are taken in the same frame, and neither enters the revision fingerprint.
      exact(params, {})
      return {observation=snapshot(),analysis=analysis.analysis(game.phase())}
    elseif method == 'sf.operation' then
      exact(params, {actionId=true,instanceId=true})
      if params.instanceId ~= instance then game.fail('incompatible_backend', 'Bridge instance changed') end
      local operation = operations[params.actionId]
      if not operation then game.fail('invalid_arguments', 'Unknown operation identifier') end
      return operation.result
    elseif method == 'sf.act' then
      exact(params, {action=true,revision=true,instanceId=true,actionId=true})
      if params.instanceId ~= instance then game.fail('incompatible_backend', 'Bridge instance changed') end
      if type(params.actionId) ~= 'string' or #params.actionId < 1 or #params.actionId > 128 then game.fail('invalid_arguments', 'Invalid action identifier') end
      local request = json.encode(params)
      if operations[params.actionId] then
        if operations[params.actionId].request ~= request then game.fail('invalid_arguments', 'Action identifier reused with different arguments') end
        return operations[params.actionId].result
      end
      if pending or poisoned then game.fail('illegal_action', 'Previous action is pending or uncertain; inspect operation status') end
      local before = snapshot()
      if type(params.revision) ~= 'string' or params.revision ~= before.revision then game.fail('stale_state', 'State changed inside game; observe again') end
      local invoke = game.prepare(params.action)
      if #order >= 10000 then game.fail('backend_failure', 'Operation identifier capacity reached; restart bridge before further actions') end
      local id = params.actionId
      local operation = {request=request,result={actionId=id,status='pending',applied='unknown'},deadline=clock() + timeout,quiet=0,
        recordEffects=params.action.method == 'play'}
      operations[id] = operation; order[#order + 1] = id; pending = operation; serial = serial + 1
      if operation.recordEffects then effects.begin(before.state) end
      local ok = pcall(invoke)
      if not ok then
        poisoned = true; pending = nil
        operation.result = {actionId=id,status='failed',applied='unknown',code='uncertain_outcome',message='Original game handler failed after dispatch; inspect current state'}
        if operation.recordEffects then operation.result.effects = effects.finish() end
      else operation.result.applied = true end
      return operation.result
    end
    game.fail('invalid_arguments', 'Unknown balatro_mcp_mod RPC method')
  end
  function bridge.update()
    if not pending then return end
    local operation = pending
    if game.ready() then operation.quiet = operation.quiet + 1 else operation.quiet = 0 end
    if operation.quiet >= 2 then
      pending = nil; serial = serial + 1
      operation.result = {actionId=operation.result.actionId,status='completed',applied=true,observation=snapshot()}
      if operation.recordEffects then operation.result.effects = effects.finish() end
      if #order > 128 then
        local old = operations[order[#order - 128]]
        if old and old ~= operation and old.result.status == 'completed' then old.result={actionId=old.result.actionId,status='retired',applied=true} end
      end
    elseif clock() >= operation.deadline then
      poisoned = true; pending = nil
      operation.result = {actionId=operation.result.actionId,status='failed',applied=true,code='uncertain_outcome',message='Game did not reach a ready state before deadline; inspect the run'}
      if operation.recordEffects then operation.result.effects = effects.finish() end
    end
  end
  return bridge
end
