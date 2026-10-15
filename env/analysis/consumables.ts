export const PLANETS: Record<string, string> = {
  c_pluto: 'High Card', c_mercury: 'Pair', c_uranus: 'Two Pair', c_venus: 'Three of a Kind', c_saturn: 'Straight', c_jupiter: 'Flush',
  c_earth: 'Full House', c_mars: 'Four of a Kind', c_neptune: 'Straight Flush', c_planet_x: 'Five of a Kind', c_ceres: 'Flush House', c_eris: 'Flush Five',
};
export const TAROTS: Record<string, { min?: number; max: number }> = {
  c_magician: { max: 2 }, c_empress: { max: 2 }, c_hierophant: { max: 2 }, c_lovers: { max: 1 }, c_chariot: { max: 1 }, c_justice: { max: 1 },
  c_devil: { max: 1 }, c_tower: { max: 1 }, c_strength: { max: 2 }, c_star: { max: 3 }, c_moon: { max: 3 }, c_sun: { max: 3 }, c_world: { max: 3 },
  c_death: { min: 2, max: 2 },
};
