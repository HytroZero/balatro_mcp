local json=dofile('play/mod/json.lua')
local r=dofile('env/sandbox/runtime.lua').new(arg[1],json)
local G
for i=1,100 do local k,v=debug.getupvalue(r.load,i); if k=='G' then G=v; break end end
local keys=json.array()
for k,c in pairs(G.P_CENTERS) do if c.set=='Joker' then keys[#keys+1]=k end end
table.sort(keys);print(json.encode(keys))
