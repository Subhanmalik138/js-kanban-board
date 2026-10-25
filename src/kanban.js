'use strict';

/**
 * Service layer: all board operations go through here so the CLI stays a
 * thin argument parser. Every mutating operation loads, changes, and
 * atomically saves the whole document — simple, predictable, and safe for
 * a single-user local tool.
 */

const { Board, List, Card } = require('./model');
const { JsonStore } = require('./store');

class KanbanService {
  constructor(store) {
    this.store = store;
  }

  _loadBoards() {
    return this.store.load().boards.map((b) => Board.fromJSON(b));
  }

  _saveBoards(boards) {
    this.store.save({ boards: boards.map((b) => b.toJSON()) });
  }

  _getBoard(boards, boardId) {
    const board = boards.find((b) => b.id === boardId);
    if (!board) throw new Error(`board not found: ${boardId}`);
    return board;
  }

  listBoards() {
    return this._loadBoards().map((b) => ({
      id: b.id,
      title: b.title,
      lists: b.lists.length,
      cards: b.allCards().length,
    }));
  }

  createBoard(title) {
    const boards = this._loadBoards();
    const board = new Board({ title });
    boards.push(board);
    this._saveBoards(boards);
    return board;
  }

  getBoard(boardId) {
    return this._getBoard(this._loadBoards(), boardId);
  }

  addList(boardId, title) {
    const boards = this._loadBoards();
    const board = this._getBoard(boards, boardId);
    const list = board.addList(new List({ title }));
    this._saveBoards(boards);
    return list;
  }

  addCard(boardId, listId, { title, description, labels, dueDate }) {
    const boards = this._loadBoards();
    const board = this._getBoard(boards, boardId);
    const list = board.findList(listId);
    if (!list) throw new Error(`list not found: ${listId}`);
    const card = list.addCard(new Card({ title, description, labels, dueDate }));
    this._saveBoards(boards);
    return card;
  }

  moveCard(boardId, cardId, targetListId, position = null) {
    const boards = this._loadBoards();
    const board = this._getBoard(boards, boardId);
    const card = board.moveCard(cardId, targetListId, position);
    this._saveBoards(boards);
    return card;
  }

  archiveCard(boardId, cardId) {
    const boards = this._loadBoards();
    const board = this._getBoard(boards, boardId);
    const found = board.findCard(cardId);
    if (!found) throw new Error(`card not found: ${cardId}`);
    found.list.removeCard(cardId);
    this._saveBoards(boards);
    return found.card;
  }

  /** Case-insensitive substring search over titles, descriptions, labels. */
  search(boardId, query) {
    const board = this.getBoard(boardId);
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return board.allCards().filter(({ card }) =>
      card.title.toLowerCase().includes(needle) ||
      card.description.toLowerCase().includes(needle) ||
      card.labels.some((l) => l.toLowerCase().includes(needle)));
  }

  stats(boardId) {
    const board = this.getBoard(boardId);
    const now = new Date();
    const cards = board.allCards();
    const byList = {};
    for (const list of board.lists) byList[list.title] = list.cards.length;
    const byLabel = {};
    for (const { card } of cards) {
      for (const label of card.labels) byLabel[label] = (byLabel[label] || 0) + 1;
    }
    return {
      board: board.title,
      lists: board.lists.length,
      cards: cards.length,
      byList,
      byLabel,
      overdue: cards.filter(({ card }) => card.isOverdue(now)).length,
      dueSoon: cards.filter(({ card }) => {
        if (!card.dueDate) return false;
        const diffDays = (new Date(card.dueDate) - new Date(now.toISOString().slice(0, 10))) / 86400000;
        return diffDays >= 0 && diffDays <= 3;
      }).length,
    };
  }

  exportBoard(boardId) {
    return this.getBoard(boardId).toJSON();
  }

  importBoard(data) {
    const boards = this._loadBoards();
    const board = Board.fromJSON(data);
    if (boards.some((b) => b.id === board.id)) {
      throw new Error(`a board with id ${board.id} already exists`);
    }
    boards.push(board);
    this._saveBoards(boards);
    return board;
  }
}

function defaultDataPath() {
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  return `${home}/.kanban-board.json`;
}

module.exports = { KanbanService, JsonStore, defaultDataPath };
