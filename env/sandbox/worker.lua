-- Persistent newline-delimited JSON protocol. Source/prototypes load once per VM.
local root, source = assert(arg[1]), assert(arg[2])
local json = dofile(root .. '/play/mod/json.lua')
local sandbox = dofile(root .. '/env/sandbox/runtime.lua')
local runtime
io.stdout:setvbuf('no')
for line in io.lines() do
  local request
  local ok, result = pcall(function()
    request = json.decode(line, 4194304)
    if not runtime then runtime = sandbox.new(source, json) end
    if request.method == 'load' then return runtime.load(request.state) end
    if request.method == 'score' then return runtime.score(request.play) end
    if request.method == 'stats' then return runtime.stats() end
    if request.method == 'discard_hits' then return runtime.discardHits(request.state, request.cards, request.draws, request.hand, request.limit) end
    if request.method == 'best' then return runtime.best(request.minSize, request.maxSize, request.key, request.keep) end
    if request.method == 'plays' then return runtime.plays(request.state, request.selectionLimit) end
    if request.method == 'batch' or request.method == 'scores' then
      local results = json.array()
      for i, play in ipairs(request.plays) do results[i] = runtime.score(play, request.method == 'scores', request.ordered == true) end
      return results
    end
    error('Unknown sandbox method')
  end)
  if not ok then
    local message = type(result) == 'table' and result.message or tostring(result)
    result = request and request.method == 'plays' and json.array({'unavailable: ' .. message}) or
      (type(result) == 'table' and result or {status='error', message=message})
  end
  io.write(json.encode({id=request and request.id, result=result}), '\n')
end
