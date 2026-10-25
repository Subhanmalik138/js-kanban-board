'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { Board, List, Card } = require('../src/model');
const { JsonStore } = require('../src/store');
const { KanbanService } = require('../src/kanban');
const { main } = require('../src/cli');

function tmpDb() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-test-')), 'db.json');
}

test('model: card validation rejects empty titles and bad dates', () => {
  assert.throws(() => new Card({ title: '  ' }), /non-empty string/);
  assert.throws(() => new Card({ title: 'x', dueDate: 'not-a-date' }), /valid date/);
  const card = new Card({ title: 'Ship it', labels: ['urgent', 'urgent'], dueDate: '2020-01-01' });
  assert.deepEqual(card.labels, ['urgent']); // duplicates removed
  assert.equal(card.isOverdue(), true);
  assert.equal(new Card({ title: 'No date' }).isOverdue(), false);
});

test('model: moveCard reorders within and across lists', () => {
  const board = new Board({ title: 'B' });
  const todo = board.addList(new List({ title: 'Todo' }));
  const done = board.addList(new List({ title: 'Done' }));
  const a = todo.addCard(new Card({ title: 'a' }));
  const b = todo.addCard(new Card({ title: 'b' }));
  board.moveCard(b.id, done.id);
  assert.deepEqual(todo.cards.map((c) => c.id), [a.id]);
  assert.deepEqual(done.cards.map((c) => c.id), [b.id]);
  board.moveCard(a.id, done.id, 0);
  assert.deepEqual(done.cards.map((c) => c.id), [a.id, b.id]);
  assert.throws(() => board.moveCard('nope', done.id), /card not found/);
  assert.throws(() => board.moveCard(a.id, 'nope'), /list not found/);
});

test('model: JSON round-trip preserves structure', () => {
  const board = new Board({ title: 'B' });
  const list = board.addList(new List({ title: 'Todo' }));
  list.addCard(new Card({ title: 'a', labels: ['x'], dueDate: '2030-01-01' }));
  const restored = Board.fromJSON(JSON.parse(JSON.stringify(board.toJSON())));
  assert.equal(restored.lists[0].cards[0].title, 'a');
  assert.deepEqual(restored.lists[0].cards[0].labels, ['x']);
});

test('store: atomic save/load and corrupt-file failure', () => {
  const file = tmpDb();
  const store = new JsonStore(file);
  assert.deepEqual(store.load(), { boards: [] }); // missing file is fine
  store.save({ boards: [{ id: 'b1' }] });
  assert.deepEqual(store.load(), { boards: [{ id: 'b1' }] });
  assert.equal(fs.existsSync(`${file}.tmp-${process.pid}`), false); // temp file renamed away
  fs.writeFileSync(file, '{not json');
  assert.throws(() => store.load(), /corrupt database/);
});

test('service: full workflow — create, add, move, archive, search, stats', () => {
  const service = new KanbanService(new JsonStore(tmpDb()));
  const board = service.createBoard('Launch');
  const todo = service.addList(board.id, 'Todo');
  const done = service.addList(board.id, 'Done');
  const card = service.addCard(board.id, todo.id, {
    title: 'Write README', description: 'docs', labels: ['docs'], dueDate: '2030-06-01',
  });
  service.moveCard(board.id, card.id, done.id);
  const moved = service.getBoard(board.id).findCard(card.id);
  assert.equal(moved.list.id, done.id);

  const hits = service.search(board.id, 'readme');
  assert.equal(hits.length, 1);
  assert.equal(service.search(board.id, 'zzz').length, 0);

  const stats = service.stats(board.id);
  assert.equal(stats.cards, 1);
  assert.equal(stats.byList.Done, 1);
  assert.equal(stats.byLabel.docs, 1);
  assert.equal(stats.overdue, 0);

  const archived = service.archiveCard(board.id, card.id);
  assert.equal(archived.id, card.id);
  assert.equal(service.stats(board.id).cards, 0);
});

test('service: import/export round-trip and duplicate rejection', () => {
  const service = new KanbanService(new JsonStore(tmpDb()));
  const board = service.createBoard('Export me');
  service.addList(board.id, 'Todo');
  const exported = service.exportBoard(board.id);

  const service2 = new KanbanService(new JsonStore(tmpDb()));
  const imported = service2.importBoard(exported);
  assert.equal(imported.title, 'Export me');
  assert.throws(() => service2.importBoard(exported), /already exists/);
  assert.throws(() => service.getBoard('missing'), /board not found/);
});

test('cli: end-to-end board create/list/show through main()', () => {
  const db = tmpDb();
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    main(['--db', db, 'board', 'create', 'CLI Board']);
    main(['--db', db, 'board', 'list']);
    assert.ok(logs.some((l) => l.includes('CLI Board')));
    assert.throws(() => main(['--db', db, 'board', 'show']), /missing argument/);
    assert.throws(() => main(['--db', db, 'nonsense']), /unknown command/);
  } finally {
    console.log = originalLog;
  }
});
