const MASTER_NUMBERS = new Set([11, 22]);

export const NUMBER_KEYWORDS = {
  1: 'Beginnings, initiative, independence',
  2: 'Partnership, patience, sensitivity',
  3: 'Expression, creativity, social joy',
  4: 'Structure, discipline, steady work',
  5: 'Change, freedom, adventure',
  6: 'Care, home, responsibility',
  7: 'Reflection, study, solitude',
  8: 'Ambition, power, material results',
  9: 'Completion, release, compassion',
  11: 'Master intuition, inspiration, heightened sensitivity',
  22: 'Master builder, large-scale vision made practical',
};

const digitSum = (n) => String(n).split('').reduce((s, d) => s + Number(d), 0);

/**
 * Reduces to a single digit, keeping 11 and 22 when `keepMasters` is set.
 * Returns the value plus a human-readable trail like "29 → 2 + 9 = 11".
 */
export function reduce(n, { keepMasters = true } = {}) {
  const trail = [];
  let value = n;
  while (value > 9 && !(keepMasters && MASTER_NUMBERS.has(value))) {
    const next = digitSum(value);
    trail.push(`${value} → ${String(value).split('').join(' + ')} = ${next}`);
    value = next;
  }
  return { value, trail };
}

/** Master numbers act as their root digit when they feed into a later sum. */
const root = (n) => (MASTER_NUMBERS.has(n) ? digitSum(n) : n);

const describe = (step, label, sumExpr, total, reduced) => {
  const tail = reduced.trail.length ? `\n${reduced.trail.join('; ')}` : '';
  return `**Step ${step} — ${label}.** ${sumExpr} = ${total}${tail}\n${label} = **${reduced.value}**`;
};

export function personalNumbers(birth, today) {
  const yearDigits = String(today.year).split('').map(Number);
  const yearDigitSum = yearDigits.reduce((a, b) => a + b, 0);

  const pyTotal = birth.month + birth.day + yearDigitSum;
  const py = reduce(pyTotal);
  const pmTotal = root(py.value) + today.month;
  const pm = reduce(pmTotal);
  const pdTotal = root(pm.value) + today.day;
  const pd = reduce(pdTotal);

  const pyExpr = `${birth.month} (birth month) + ${birth.day} (birth day) + ${yearDigits.join(' + ')} (digits of ${today.year})`;
  const pmExpr = `${root(py.value)}${MASTER_NUMBERS.has(py.value) ? ` (${py.value} as its root)` : ''} + ${today.month} (current month)`;
  const pdExpr = `${root(pm.value)}${MASTER_NUMBERS.has(pm.value) ? ` (${pm.value} as its root)` : ''} + ${today.day} (current day)`;

  return {
    personalYear: py.value,
    personalMonth: pm.value,
    personalDay: pd.value,
    isMaster: MASTER_NUMBERS.has(pd.value),
    keywords: NUMBER_KEYWORDS[pd.value],
    yearKeywords: NUMBER_KEYWORDS[py.value],
    steps: [
      `**Step 1 — Birth month and day.** Month = ${birth.month}, day = ${birth.day}. (Only month and day are used; the birth year is not part of this method.)`,
      `**Step 2 — Today's date.** Month = ${today.month}, day = ${today.day}, year = ${today.year}.`,
      describe(3, 'Personal Year', pyExpr, pyTotal, py),
      describe(4, 'Personal Month', pmExpr, pmTotal, pm),
      describe(5, 'Personal Day', pdExpr, pdTotal, pd),
      `Numbers are reduced by adding their digits until one digit remains. ${MASTER_NUMBERS.has(pd.value) ? `**${pd.value} is a master number**, so it is kept rather than reduced.` : 'The master numbers 11 and 22 would be kept unreduced.'}`,
    ],
  };
}

export function personalDayOnly(birth, day) {
  return personalNumbers(birth, day).personalDay;
}
