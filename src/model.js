'use strict';

/**
 * Domain model for the Kanban board.
 *
 * A Board owns an ordered array of Lists; each List owns an ordered array
 * of Cards. Cards carry labels and an optional due date. Every entity has
 * a stable id so cards can be moved between lists without losing identity.
 *
 * The model is deliberately persistence-agnostic: it only knows how to
 * validate itself and serialize to plain JSON. Storage lives in store.js,
 * orchestration lives in kanban.js.
 */

let counter = 0;

function newId(prefix) {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

function requireNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function requireValidDate(value, field) {
  if (value === null || value === undefined) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} must be a valid date (YYYY-MM-DD) or null`);
  }
  return date.toISOString().slice(0, 10);
}

class Card {
  constructor({ id, title, description = '', labels = [], dueDate = null, createdAt } = {}) {
    this.id = id || newId('card');
    this.title = requireNonEmptyString(title, 'card title');
    this.description = typeof description === 'string' ? description : '';
    if (!Array.isArray(labels)) throw new Error('labels must be an array');
    this.labels = [...new Set(labels.map((l) => requireNonEmptyString(l, 'label')))];
    this.dueDate = requireValidDate(dueDate, 'dueDate');
    this.createdAt = createdAt || new Date().toISOString();
  }

  isOverdue(now = new Date()) {
    if (!this.dueDate) return false;
    return new Date(this.dueDate) < new Date(now.toISOString().slice(0, 10));
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      labels: this.labels,
      dueDate: this.dueDate,
      createdAt: this.createdAt,
    };
  }

  static fromJSON(data) {
    return new Card(data);
  }
}

class List {
  constructor({ id, title, cards = [] } = {}) {
    this.id = id || newId('list');
    this.title = requireNonEmptyString(title, 'list title');
    this.cards = cards.map((c) => (c instanceof Card ? c : Card.fromJSON(c)));
  }

  addCard(card) {
    if (!(card instanceof Card)) throw new Error('addCard expects a Card');
    this.cards.push(card);
    return card;
  }

  removeCard(cardId) {
    const index = this.cards.findIndex((c) => c.id === cardId);
    if (index === -1) return null;
    return this.cards.splice(index, 1)[0];
  }

  findCard(cardId) {
    return this.cards.find((c) => c.id === cardId) || null;
  }

  toJSON() {
    return { id: this.id, title: this.title, cards: this.cards.map((c) => c.toJSON()) };
  }

  static fromJSON(data) {
    return new List({ ...data, cards: (data.cards || []).map((c) => Card.fromJSON(c)) });
  }
}

class Board {
  constructor({ id, title, lists = [], createdAt } = {}) {
    this.id = id || newId('board');
    this.title = requireNonEmptyString(title, 'board title');
    this.lists = lists.map((l) => (l instanceof List ? l : List.fromJSON(l)));
    this.createdAt = createdAt || new Date().toISOString();
  }

  addList(list) {
    if (!(list instanceof List)) throw new Error('addList expects a List');
    this.lists.push(list);
    return list;
  }

  findList(listId) {
    return this.lists.find((l) => l.id === listId) || null;
  }

  findListByTitle(title) {
    const needle = title.trim().toLowerCase();
    return this.lists.find((l) => l.title.toLowerCase() === needle) || null;
  }

  /** Locate a card anywhere on the board. Returns { list, card } or null. */
  findCard(cardId) {
    for (const list of this.lists) {
      const card = list.findCard(cardId);
      if (card) return { list, card };
    }
    return null;
  }

  moveCard(cardId, targetListId, position = null) {
    const found = this.findCard(cardId);
    if (!found) throw new Error(`card not found: ${cardId}`);
    const target = this.findList(targetListId);
    if (!target) throw new Error(`list not found: ${targetListId}`);
    found.list.removeCard(cardId);
    if (position === null || position >= target.cards.length) {
      target.cards.push(found.card);
    } else if (position <= 0) {
      target.cards.unshift(found.card);
    } else {
      target.cards.splice(position, 0, found.card);
    }
    return found.card;
  }

  allCards() {
    return this.lists.flatMap((l) => l.cards.map((card) => ({ list: l, card })));
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      createdAt: this.createdAt,
      lists: this.lists.map((l) => l.toJSON()),
    };
  }

  static fromJSON(data) {
    return new Board({ ...data, lists: (data.lists || []).map((l) => List.fromJSON(l)) });
  }
}

module.exports = { Board, List, Card, newId };
