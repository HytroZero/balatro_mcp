-- Persistent newline-delimited JSON protocol. Source/prototypes load once per VM.
local root, source = assert(arg[1]), assert(arg[2])
local json = dofile(root .. '/play/mod/json.lua')
local sandbox = dofile(root .. '/env/sandbox/runtime.lua')
local runtime
io.stdout:setvbuf('no')
for line in io.lines() do
  local request
  local ok, result = pcall(function()
    request = json.decode(line)
    if not runtime then runtime = sandbox.new(source, json) end
    if request.method == 'load' then return runtime.load(request.state) end
    if request.method == 'score' then return runtime.score(request.play) end
    if request.method == 'stats' then return runtime.stats() end
    if request.method == 'batch' or request.method == 'scores' then
      local results = json.array()
      for i, play in ipairs(request.plays) do results[i] = runtime.score(play, request.method == 'scores') end
      return results
    end
    error('Unknown sandbox method')
  end)
  if not ok then result = type(result) == 'table' and result or {status='error', message=tostring(result)} end
  io.write(json.encode({id=request and request.id, result=result}), '\n')
end
