import { Router } from 'express';
import * as store from '../store.js';
import { parseExpense, isMonth, monthOf } from '../validation.js';

export const router = Router();

// GET /api/expenses?month=YYYY-MM&category=...
router.get('/', async (req, res, next) => {
  try {
    let expenses = await store.getAll();

    if (req.query.month !== undefined) {
      if (!isMonth(req.query.month)) {
        return res.status(400).json({ error: 'month : format YYYY-MM requis' });
      }
      expenses = expenses.filter((e) => monthOf(e.date) === req.query.month);
    }

    if (req.query.category !== undefined) {
      expenses = expenses.filter(
        (e) => e.category.toLowerCase() === String(req.query.category).toLowerCase(),
      );
    }

    res.json(expenses);
  } catch (err) {
    next(err);
  }
});

// POST /api/expenses
router.post('/', async (req, res, next) => {
  try {
    const { expense, errors } = parseExpense(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }
    const created = await store.create(expense);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// GET /api/expenses/:id
router.get('/:id', async (req, res, next) => {
  try {
    const expense = await store.getById(req.params.id);
    if (!expense) {
      return res.status(404).json({ error: 'Dépense introuvable' });
    }
    res.json(expense);
  } catch (err) {
    next(err);
  }
});

// PUT /api/expenses/:id
router.put('/:id', async (req, res, next) => {
  try {
    const existing = await store.getById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Dépense introuvable' });
    }
    const { expense, errors } = parseExpense(req.body, { partial: true });
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }
    const updated = await store.update(req.params.id, expense);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/expenses/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await store.remove(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Dépense introuvable' });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export const summaryRouter = Router();

// GET /api/summary?month=YYYY-MM
summaryRouter.get('/', async (req, res, next) => {
  try {
    const month = req.query.month;
    let expenses = await store.getAll();

    if (month !== undefined) {
      if (!isMonth(month)) {
        return res.status(400).json({ error: 'month : format YYYY-MM requis' });
      }
      expenses = expenses.filter((e) => monthOf(e.date) === month);
    }

    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    const byCategory = expenses.reduce((acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + e.amount;
      return acc;
    }, {});

    res.json({
      month: month ?? null,
      count: expenses.length,
      total: Math.round(total * 100) / 100,
      byCategory,
    });
  } catch (err) {
    next(err);
  }
});
