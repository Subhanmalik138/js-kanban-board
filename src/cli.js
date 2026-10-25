'use strict';

/**
 * Command-line interface for the Kanban board manager.
 *
 * Zero dependencies: argument parsing is hand-rolled and intentionally
 * boring. Global flags: --db <path> (default ~/.kanban-board.json).
 *
 * Commands:
 *   board create <title> | board list | board show <board-id>
 *   list add <board-id> <title>
 *   card add <board-id> <list-id> <title> [--desc text] [--label a,b] [--due YYYY-MM-DD]
 *   card move <board-id> <card-id> <list-id> [--pos N]
 *   card archive <board-id> <card-id>
 *   search <board-id> <query>
 *   stats <board-id>
 *   export <board-id> [--file path] | import [--file path]
 */

const fs = require('node:fs');
const { KanbanService, JsonStore, defaultDataPath } = require('./kanban');

function parseArgs(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      args.push(token);
    }
  }
  return { args, flags };
}

function requireArg(args, index, name) {
  if (args[index] === undefined) throw new Error(`missing argument: ${name}`);
  return args[index];
}

function printBoard(board) {
  console.log(`\n${board.title} (${board.id})`);
  console.log('='.repeat(Math.max(board.title.length, 10)));
  if (board.lists.length === 0) {
    console.log('  (no lists yet — add one with: list add <board-id> <title>)');
    return;
  }
  for (const list of board.lists) {
    console.log(`\n[${list.title}] (${list.id}) — ${list.cards.length} card(s)`);
    for (const card of list.cards) {
      const labels = card.labels.length ? ` [${card.labels.join(', ')}]` : '';
      const due = card.dueDate ? ` due ${card.dueDate}${card.isOverdue() ? ' (OVERDUE)' : ''}` : '';
      console.log(`  - ${card.title} (${card.id})${labels}${due}`);
      if (card.description) console.log(`      ${card.description}`);
    }
  }
  console.log('');
}

function usage() {
  return [
    'kanban — persistent CLI Kanban board manager',
    '',
    'Usage: node kanban.js [--db <path>] <command> [args]',
    '',
    '  board create <title>              Create a board',
    '  board list                        List all boards',
    '  board show <board-id>             Show a board with its lists and cards',
    '  list add <board-id> <title>       Add a list to a board',
    '  card add <board-id> <list-id> <title> [--desc text] [--label a,b] [--due YYYY-MM-DD]',
    '  card move <board-id> <card-id> <list-id> [--pos N]',
    '  card archive <board-id> <card-id>',
    '  search <board-id> <query>         Search cards by title, description, label',
    '  stats <board-id>                  Per-list counts, label counts, overdue/due-soon',
    '  export <board-id> [--file path]   Print board JSON (or write to file)',
    '  import [--file path]               Read board JSON from file or stdin',
    '',
    'Data lives in ~/.kanban-board.json unless --db is given.',
  ].join('\n');
}

function main(argv) {
  const { args, flags } = parseArgs(argv);
  const service = new KanbanService(new JsonStore(flags.db || defaultDataPath()));
  let [group, action, ...rest] = args;
  // Single-word commands (search, stats, export, import) carry their first
  // positional in the `action` slot — fold it back into rest.
  if (['search', 'stats', 'export', 'import'].includes(group) && action !== undefined) {
    rest = [action, ...rest];
    action = undefined;
  }

  if (!group || group === 'help' || group === '--help') {
    console.log(usage());
    return;
  }

  if (group === 'board' && action === 'create') {
    const board = service.createBoard(requireArg(rest, 0, 'title'));
    console.log(`Created board "${board.title}" (${board.id})`);
  } else if (group === 'board' && action === 'list') {
    const boards = service.listBoards();
    if (boards.length === 0) console.log('No boards yet. Create one: board create <title>');
    for (const b of boards) {
      console.log(`${b.id}  ${b.title}  (${b.lists} lists, ${b.cards} cards)`);
    }
  } else if (group === 'board' && action === 'show') {
    printBoard(service.getBoard(requireArg(rest, 0, 'board-id')));
  } else if (group === 'list' && action === 'add') {
    const list = service.addList(requireArg(rest, 0, 'board-id'), requireArg(rest, 1, 'title'));
    console.log(`Added list "${list.title}" (${list.id})`);
  } else if (group === 'card' && action === 'add') {
    const card = service.addCard(requireArg(rest, 0, 'board-id'), requireArg(rest, 1, 'list-id'), {
      title: requireArg(rest, 2, 'title'),
      description: flags.desc || '',
      labels: flags.label ? String(flags.label).split(',').map((s) => s.trim()).filter(Boolean) : [],
      dueDate: flags.due || null,
    });
    console.log(`Added card "${card.title}" (${card.id})`);
  } else if (group === 'card' && action === 'move') {
    const pos = flags.pos !== undefined ? Number(flags.pos) : null;
    if (flags.pos !== undefined && Number.isNaN(pos)) throw new Error('--pos must be a number');
    const card = service.moveCard(
      requireArg(rest, 0, 'board-id'),
      requireArg(rest, 1, 'card-id'),
      requireArg(rest, 2, 'list-id'),
      pos);
    console.log(`Moved card "${card.title}" (${card.id})`);
  } else if (group === 'card' && action === 'archive') {
    const card = service.archiveCard(requireArg(rest, 0, 'board-id'), requireArg(rest, 1, 'card-id'));
    console.log(`Archived card "${card.title}" (${card.id})`);
  } else if (group === 'search') {
    const results = service.search(requireArg(rest, 0, 'board-id'), requireArg(rest, 1, 'query'));
    if (results.length === 0) console.log('No matching cards.');
    for (const { list, card } of results) {
      console.log(`${card.id}  [${list.title}]  ${card.title}`);
    }
  } else if (group === 'stats') {
    const s = service.stats(requireArg(rest, 0, 'board-id'));
    console.log(`Board: ${s.board}`);
    console.log(`Lists: ${s.lists}  Cards: ${s.cards}  Overdue: ${s.overdue}  Due soon (<=3d): ${s.dueSoon}`);
    console.log('By list:', JSON.stringify(s.byList));
    console.log('By label:', JSON.stringify(s.byLabel));
  } else if (group === 'export') {
    const json = JSON.stringify(service.exportBoard(requireArg(rest, 0, 'board-id')), null, 2);
    if (flags.file) {
      fs.writeFileSync(flags.file, `${json}\n`, 'utf8');
      console.log(`Exported to ${flags.file}`);
    } else {
      console.log(json);
    }
  } else if (group === 'import') {
    const raw = flags.file ? fs.readFileSync(flags.file, 'utf8') : fs.readFileSync(0, 'utf8');
    const board = service.importBoard(JSON.parse(raw));
    console.log(`Imported board "${board.title}" (${board.id})`);
  } else {
    throw new Error(`unknown command: ${[group, action].filter(Boolean).join(' ')}\n\n${usage()}`);
  }
}

module.exports = { main, usage, parseArgs };
