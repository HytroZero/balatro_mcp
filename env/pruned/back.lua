Back = Object:extend()
function Back:init(selected_back)
    if not selected_back then
selected_back = G.P_CENTERS.b_red
end
    self.name = selected_back.name or 'Red Deck'
    self.effect = {center = selected_back,
text_UI = '',
config = copy_table(selected_back.config)}
    self.loc_name = localize{type = 'name_text', set = 'Back', key = self.effect.center.key}
    local pos = (self.effect.center.unlocked and self.effect.center.pos) or {x = 4, y = 0}
    self.pos = self.pos or {}
    self.pos.x = pos.x
    self.pos.y = pos.y
end
function Back:trigger_effect(args)
    if not args then
return
end
    if self.name == 'Plasma Deck' and args.context == 'blind_amount' then
return
end
    if self.name == 'Plasma Deck' and args.context == 'final_scoring_step' then
local tot = args.chips + args.mult
args.chips = math.floor(tot/2)
args.mult = math.floor(tot/2)
return args.chips, args.mult
end
end
