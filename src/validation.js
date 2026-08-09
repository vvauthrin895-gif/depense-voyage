const CATEGORIES = [
  'Alimentation',
  'Logement',
  'Transport',
  'Loisirs',
  'Santé',
  'Abonnements',
  'Autre',
];

function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Valide et normalise une dépense.
 * @param {object} body - corps de la requête
 * @param {{ partial?: boolean }} options - partial = mise à jour (champs optionnels)
 * @returns {{ expense?: object, errors: string[] }}
 */
export function parseExpense(body, { partial = false } = {}) {
  const errors = [];
  const expense = {};
  const input = body ?? {};

  // label
  if (!partial || input.label !== undefined) {
    if (typeof input.label !== 'string' || !input.label.trim()) {
      errors.push('label : chaîne non vide requise');
    } else {
      expense.label = input.label.trim();
    }
  }

  // amount
  if (!partial || input.amount !== undefined) {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push('amount : nombre strictement positif requis');
    } else {
      expense.amount = Math.round(amount * 100) / 100;
    }
  }

  // category
  if (input.category !== undefined) {
    if (typeof input.category !== 'string' || !input.category.trim()) {
      errors.push('category : chaîne requise');
    } else {
      expense.category = input.category.trim();
    }
  } else if (!partial) {
    expense.category = 'Autre';
  }

  // date
  if (input.date !== undefined) {
    if (!isDate(input.date)) {
      errors.push('date : format YYYY-MM-DD requis');
    } else {
      expense.date = input.date;
    }
  } else if (!partial) {
    expense.date = new Date().toISOString().slice(0, 10);
  }

  return { expense, errors };
}

export function isMonth(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value);
}

export function monthOf(date) {
  return date.slice(0, 7);
}

export { CATEGORIES };
