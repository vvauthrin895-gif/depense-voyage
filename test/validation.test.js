import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExpense, isMonth, monthOf } from '../src/validation.js';

test('parseExpense valide un corps complet', () => {
  const { expense, errors } = parseExpense({
    label: '  Courses  ',
    amount: '42.50',
    category: 'Alimentation',
    date: '2026-08-01',
  });
  assert.deepEqual(errors, []);
  assert.equal(expense.label, 'Courses');
  assert.equal(expense.amount, 42.5);
  assert.equal(expense.category, 'Alimentation');
  assert.equal(expense.date, '2026-08-01');
});

test('parseExpense applique les valeurs par défaut', () => {
  const { expense, errors } = parseExpense({ label: 'Loyer', amount: 800 });
  assert.deepEqual(errors, []);
  assert.equal(expense.category, 'Autre');
  assert.match(expense.date, /^\d{4}-\d{2}-\d{2}$/);
});

test('parseExpense rejette les valeurs invalides', () => {
  const { errors } = parseExpense({ label: '   ', amount: -5, date: '01/08/2026' });
  assert.ok(errors.length > 0);
  assert.ok(errors.some((e) => e.startsWith('label')));
  assert.ok(errors.some((e) => e.startsWith('amount')));
  assert.ok(errors.some((e) => e.startsWith('date')));
});

test('parseExpense en mode partiel n’exige rien', () => {
  const { expense, errors } = parseExpense({ amount: 10 }, { partial: true });
  assert.deepEqual(errors, []);
  assert.equal(expense.amount, 10);
  assert.equal(expense.label, undefined);
});

test('isMonth et monthOf', () => {
  assert.equal(isMonth('2026-08'), true);
  assert.equal(isMonth('2026-8'), false);
  assert.equal(isMonth('2026-13'), true); // seul le format compte ici
  assert.equal(monthOf('2026-08-15'), '2026-08');
});
