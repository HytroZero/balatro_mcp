-- Standalone Steamodded mod; the game owns rules, rendering and event timing.
if BALATRO_MCP_MOD_BRIDGE then error('balatro_mcp_mod bridge already loaded; restart before reloading') end
local function load(name) return assert(SMODS.load_file(name))() end
local json = load('json.lua')
local game = load('game.lua')(json, load('decision.lua')(json))
local socket = require('socket')
local clock = love.timer.getTime
local instance = tostring({}) .. ':' .. tostring(os.time())
local port = tonumber(os.getenv('BALATRO_MCP_MOD_PORT') or '12347')
assert(port and port % 1 == 0 and port >= 1024 and port <= 65535, 'Invalid BALATRO_MCP_MOD_PORT')
local action_timeout = tonumber(os.getenv('BALATRO_MCP_MOD_ACTION_TIMEOUT') or '20')
assert(action_timeout and action_timeout >= 1 and action_timeout <= 600, 'Invalid BALATRO_MCP_MOD_ACTION_TIMEOUT')
local bridge = load('bridge.lua')(json, game, clock, instance, action_timeout)
local transport = load('transport.lua')(socket, json, bridge.dispatch, clock, port)
BALATRO_MCP_MOD_BRIDGE = {bridge=bridge,transport=transport}
local original_update, original_quit = love.update, love.quit
love.update = function(dt)
  original_update(dt)
  bridge.update()
  transport.update()
end
love.quit = function(...)
  local cancel = original_quit and original_quit(...)
  if cancel then return cancel end
  transport.close()
end
