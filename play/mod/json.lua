-- Small independent JSON codec for the bounded balatro_mcp_mod wire protocol.
local J = { null = {}, array_mt = {} }
function J.array(t) return setmetatable(t or {}, J.array_mt) end
local escapes = { ['"']='\\"', ['\\']='\\\\', ['\b']='\\b', ['\f']='\\f', ['\n']='\\n', ['\r']='\\r', ['\t']='\\t' }
local function quote(s)
  return '"' .. s:gsub('[%z\1-\31\\"]', function(c) return escapes[c] or string.format('\\u%04x', c:byte()) end) .. '"'
end
function J.encode(value)
  local seen = {}
  local function emit(v, depth)
    assert(depth < 64, 'JSON nesting limit')
    if v == J.null or v == nil then return 'null' end
    local kind = type(v)
    if kind == 'string' then return quote(v) end
    if kind == 'boolean' then return tostring(v) end
    if kind == 'number' then assert(v == v and v ~= math.huge and v ~= -math.huge, 'Non-finite JSON number'); return string.format('%.17g', v) end
    assert(kind == 'table' and not seen[v], 'Unsupported or cyclic JSON value')
    seen[v] = true
    local items, keys = {}, {}
    if getmetatable(v) == J.array_mt then
      for i = 1, #v do items[i] = emit(v[i], depth + 1) end
      seen[v] = nil; return '[' .. table.concat(items, ',') .. ']'
    end
    for key in pairs(v) do assert(type(key) == 'string', 'JSON object keys must be strings'); keys[#keys + 1] = key end
    table.sort(keys)
    for _, key in ipairs(keys) do items[#items + 1] = quote(key) .. ':' .. emit(v[key], depth + 1) end
    seen[v] = nil; return '{' .. table.concat(items, ',') .. '}'
  end
  return emit(value, 0)
end
local function utf8(code)
  if code < 128 then return string.char(code) end
  if code < 2048 then return string.char(192 + math.floor(code / 64), 128 + code % 64) end
  if code < 65536 then return string.char(224 + math.floor(code / 4096), 128 + math.floor(code / 64) % 64, 128 + code % 64) end
  return string.char(240 + math.floor(code / 262144), 128 + math.floor(code / 4096) % 64, 128 + math.floor(code / 64) % 64, 128 + code % 64)
end
function J.decode(text, maxBytes)
  assert(type(text) == 'string' and #text <= (maxBytes or 65536), 'JSON input size limit')
  local pos = 1
  local function ws() local _, finish = text:find('^[ \t\r\n]*', pos); pos = (finish or pos - 1) + 1 end
  local parse
  local function string_value()
    pos = pos + 1; local pieces = {}
    while pos <= #text do
      local c = text:sub(pos, pos); pos = pos + 1
      if c == '"' then return table.concat(pieces) end
      if c == '\\' then
        local escape = text:sub(pos, pos); pos = pos + 1
        if escape == 'u' then
          local hex = text:sub(pos, pos + 3); assert(hex:match('^%x%x%x%x$'), 'Bad Unicode escape'); pos = pos + 4
          local code = tonumber(hex, 16)
          if code >= 0xD800 and code <= 0xDBFF then
            assert(text:sub(pos, pos + 1) == '\\u', 'Missing low surrogate'); pos = pos + 2
            local low = tonumber(text:sub(pos, pos + 3), 16); assert(low and low >= 0xDC00 and low <= 0xDFFF, 'Bad low surrogate')
            pos = pos + 4; code = 0x10000 + (code - 0xD800) * 1024 + low - 0xDC00
          else assert(code < 0xDC00 or code > 0xDFFF, 'Unexpected low surrogate') end
          pieces[#pieces + 1] = utf8(code)
        else
          local map = { ['"']='"', ['\\']='\\', ['/']='/', b='\b', f='\f', n='\n', r='\r', t='\t' }
          assert(map[escape], 'Bad JSON escape'); pieces[#pieces + 1] = map[escape]
        end
      else assert(c:byte() >= 32, 'Control character in JSON'); pieces[#pieces + 1] = c end
    end
    error('Unterminated JSON string')
  end
  parse = function(depth)
    assert(depth < 64, 'JSON nesting limit'); ws(); local c = text:sub(pos, pos)
    if c == '"' then return string_value() end
    if c == '[' or c == '{' then
      local array = c == '['; local result = array and J.array() or {}; local close = array and ']' or '}'
      pos = pos + 1; ws(); if text:sub(pos, pos) == close then pos = pos + 1; return result end
      while true do
        local key
        if not array then
          assert(text:sub(pos, pos) == '"', 'Expected object key'); key = string_value(); ws()
          assert(result[key] == nil and text:sub(pos, pos) == ':', 'Duplicate key or missing colon'); pos = pos + 1
        end
        local value = parse(depth + 1)
        if array then result[#result + 1] = value else result[key] = value end
        ws(); local delimiter = text:sub(pos, pos); pos = pos + 1
        if delimiter == close then return result end
        assert(delimiter == ',', 'Expected JSON delimiter'); ws()
      end
    end
    for token, value in pairs({ ['true']=true, ['false']=false, ['null']=J.null }) do
      if text:sub(pos, pos + #token - 1) == token then pos = pos + #token; return value end
    end
    local start = pos
    if c == '-' then pos = pos + 1 end
    if text:sub(pos, pos) == '0' then pos = pos + 1
    else local digits = text:match('^[1-9]%d*', pos); assert(digits, 'Invalid JSON value'); pos = pos + #digits end
    if text:sub(pos, pos) == '.' then
      pos = pos + 1; local digits = text:match('^%d+', pos); assert(digits, 'Invalid fraction'); pos = pos + #digits
    end
    if text:sub(pos, pos):match('[eE]') then
      pos = pos + 1; if text:sub(pos, pos):match('[+-]') then pos = pos + 1 end
      local digits = text:match('^%d+', pos); assert(digits, 'Invalid exponent'); pos = pos + #digits
    end
    local number = tonumber(text:sub(start, pos - 1)); assert(number and number ~= math.huge and number ~= -math.huge, 'Invalid number'); return number
  end
  local value = parse(0); ws(); assert(pos == #text + 1, 'Trailing JSON content'); return value
end
return J
