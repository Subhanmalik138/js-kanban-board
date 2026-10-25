'use strict';

/**
 * Atomic JSON file store.
 *
 * Boards are persisted as one JSON document. Writes go to a temp file in
 * the same directory and are then renamed over the target, so a crash or
 * power loss can never leave a half-written database behind. Reads tolerate
 * a missing file (fresh database) but fail loudly on corrupt JSON, because
 * silently dropping a user's boards would be worse than crashing.
 */

const fs = require('node:fs');
const path = require('node:path');

class JsonStore {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
  }

  load() {
    if (!fs.existsSync(this.filePath)) return { boards: [] };
    const raw = fs.readFileSync(this.filePath, 'utf8');
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`corrupt database file: ${this.filePath} is not valid JSON`);
    }
    if (!data || !Array.isArray(data.boards)) {
      throw new Error(`corrupt database file: ${this.filePath} has no boards array`);
    }
    return data;
  }

  save(data) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp-${process.pid}`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, this.filePath);
  }
}

module.exports = { JsonStore };
