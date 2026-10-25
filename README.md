# Kanban Board CLI

A persistent command-line Kanban board manager in plain Node.js — no
dependencies, no server, no account. Boards live in a single JSON file on
your machine, so your workflow survives reboots and works offline.

## What it does

- **Boards, lists, cards** — the classic Kanban shape, with cards that carry
  descriptions, labels, and due dates.
- **Move cards** between lists (or reorder within a list) by position.
- **Search** cards by title, description, or label.
- **Stats** — per-list and per-label counts, plus overdue and due-soon
  (≤ 3 days) totals.
- **Import / export** boards as JSON, so you can back up a board or move it
  to another machine.
- **Safe storage** — writes go to a temp file and are renamed over the
  database, so a crash can never leave a half-written file.

## Quick start

Requires Node.js 18 or newer. No install step beyond cloning:

```bash
git clone https://github.com/Subhanmalik138/js-kanban-board.git
cd js-kanban-board

# Create a board and a list
node kanban.js board create "Website launch"
node kanban.js board list            # note the board id

# Add cards (use the ids printed by the commands above)
node kanban.js list add <board-id> "Todo"
node kanban.js card add <board-id> <list-id> "Write landing copy" \
  --label copy,marketing --due 2026-11-01

# See the board, move a card, check stats
node kanban.js board show <board-id>
node kanban.js card move <board-id> <card-id> <other-list-id>
node kanban.js stats <board-id>
```

Boards are stored in `~/.kanban-board.json` by default. Point at a
different file with the global `--db` flag, e.g.
`node kanban.js --db ./work.json board list`.

## Commands

| Command | What it does |
| --- | --- |
| `board create <title>` | Create a board |
| `board list` | List all boards with list/card counts |
| `board show <board-id>` | Print a board with its lists and cards |
| `list add <board-id> <title>` | Add a list to a board |
| `card add <board-id> <list-id> <title> [--desc text] [--label a,b] [--due YYYY-MM-DD]` | Add a card |
| `card move <board-id> <card-id> <list-id> [--pos N]` | Move (or reorder) a card |
| `card archive <board-id> <card-id>` | Remove a card from the board |
| `search <board-id> <query>` | Search titles, descriptions, labels |
| `stats <board-id>` | Per-list / per-label counts, overdue, due-soon |
| `export <board-id> [--file path]` | Print board JSON (or write it to a file) |
| `import [--file path]` | Read board JSON from a file or stdin |

## Design decisions

1. **Model, store, service, CLI are separate modules.** The domain model
   (`src/model.js`) knows nothing about files; the store (`src/store.js`)
   knows nothing about boards; the service (`src/kanban.js`) orchestrates;
   the CLI (`src/cli.js`) only parses arguments. Each layer is testable in
   isolation, and the model could be reused by a future web UI untouched.
2. **Whole-document atomic writes over a row-per-card database.** A
   single-user local tool does not need SQLite; one JSON document plus
   write-to-temp-and-rename gives crash safety with zero dependencies.
3. **Stable ids, not array positions, identify cards.** Moving a card is
   a lookup by id, so reordering a list can never move the wrong card.
4. **Fail loudly on corrupt data.** A missing database means "fresh
   start"; a malformed one throws instead of silently discarding boards.

## Tests

```bash
npm test   # node:test, no test framework to install — 7 tests
```

## Tech stack

- Node.js 18+ (built-ins only: `fs`, `path`, `node:test`)
- Zero runtime dependencies
