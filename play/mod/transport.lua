-- Incremental HTTP transport. All reads/writes are non-blocking and frame-bounded.
return function(socket, json, dispatch, clock, port)
  local listener = assert(socket.tcp())
  listener:setoption('reuseaddr', true)
  assert(listener:bind('127.0.0.1', port)); assert(listener:listen(8)); listener:settimeout(0)
  local clients = {}
  local function response(client, status, value)
    local body = json.encode(value)
    if #body > 2097152 then body = json.encode({ jsonrpc='2.0', id=json.null, error={code=-32603,message='Response size limit'} }); status = '500 Internal Server Error' end
    client.output = 'HTTP/1.1 ' .. status .. '\r\nContent-Type: application/json\r\nContent-Length: ' .. #body .. '\r\nConnection: close\r\n\r\n' .. body
    client.sent = 0
  end
  local function request(client)
    local split = client.input:find('\r\n\r\n', 1, true)
    if not split then assert(#client.input <= 8192, 'Header limit'); return end
    assert(split <= 8192, 'Header limit')
    local header = client.input:sub(1, split - 1)
    assert(header:match('^POST / HTTP/1%.[01]\r\n'), 'Only POST / is supported')
    local headers = {}
    for key, value in header:gmatch('\r\n([^:\r\n]+):[ \t]*([^\r\n]*)') do
      key = key:lower(); assert(not headers[key], 'Duplicate HTTP header'); headers[key] = value
    end
    assert(not headers['transfer-encoding'], 'Chunked encoding is unsupported')
    assert(headers['content-type'] and headers['content-type']:lower():match('^application/json'), 'Expected JSON content type')
    local length = headers['content-length']; assert(length and length:match('^%d+$'), 'Content-Length required'); length = tonumber(length)
    assert(length <= 65536, 'Body limit')
    if #client.input < split + 3 + length then return end
    assert(#client.input == split + 3 + length, 'Pipelining unsupported')
    local value = json.decode(client.input:sub(split + 4)); local id = type(value) == 'table' and value.id or nil
    assert(type(value) == 'table' and value.jsonrpc == '2.0' and (type(id) == 'string' or type(id) == 'number' and id % 1 == 0), 'Invalid JSON-RPC envelope')
    assert(type(value.method) == 'string' and (value.params == nil or type(value.params) == 'table' and getmetatable(value.params) ~= json.array_mt), 'Invalid method or params')
    local ok, result = pcall(dispatch, value.method, value.params or {})
    if ok then response(client, '200 OK', {jsonrpc='2.0', id=id, result=result})
    else
      local structured = type(result) == 'table' and result or {code='backend_failure', applied='unknown', message='Bridge execution failed'}
      response(client, '200 OK', {jsonrpc='2.0',id=id,error={code=-32000,message=structured.message,data=structured}})
    end
  end
  local transport = {}
  function transport.update()
    if #clients < 8 then
      local conn = listener:accept()
      if conn then conn:settimeout(0); clients[#clients + 1] = {socket=conn, input='', deadline=clock() + 5} end
    end
    for i = #clients, 1, -1 do
      local client = clients[i]; local closed = clock() >= client.deadline
      if not closed and not client.output then
        local bytes, err, partial = client.socket:receive(8192)
        client.input = client.input .. (bytes or partial or '')
        if #client.input > 73728 then closed = true
        else
          local ok = pcall(request, client)
          if not ok then response(client, '400 Bad Request', {jsonrpc='2.0',id=json.null,error={code=-32600,message='Invalid or oversized request'}}) end
          if err == 'closed' then closed = true end
        end
      end
      if not closed and client.output then
        -- LuaSocket returns the last sent byte index, including on partial sends.
        local sent, err, partial = client.socket:send(client.output, client.sent + 1, math.min(#client.output, client.sent + 8192))
        client.sent = sent or partial or client.sent
        if client.sent >= #client.output or err and err ~= 'timeout' then closed = true end
      end
      if closed then client.socket:close(); table.remove(clients, i) end
    end
  end
  function transport.close() for _, client in ipairs(clients) do client.socket:close() end; clients = {}; listener:close() end
  return transport
end
