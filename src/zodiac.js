export const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

export const SIGN_ELEMENTS = {
  Aries: 'Fire', Leo: 'Fire', Sagittarius: 'Fire',
  Taurus: 'Earth', Virgo: 'Earth', Capricorn: 'Earth',
  Gemini: 'Air', Libra: 'Air', Aquarius: 'Air',
  Cancer: 'Water', Scorpio: 'Water', Pisces: 'Water',
};

export function normalizeDeg(deg) {
  return ((deg % 360) + 360) % 360;
}

/** Signed shortest difference a - b, in (-180, 180]. */
export function angleDiff(a, b) {
  const d = normalizeDeg(a - b);
  return d > 180 ? d - 360 : d;
}

export function signOf(lon) {
  return SIGNS[Math.floor(normalizeDeg(lon) / 30)];
}

export function formatZodiac(lon) {
  const l = normalizeDeg(lon);
  const within = l % 30;
  let deg = Math.floor(within);
  let min = Math.round((within - deg) * 60);
  if (min === 60) { deg += 1; min = 0; }
  return `${deg}°${String(min).padStart(2, '0')}′ ${signOf(l)}`;
}
