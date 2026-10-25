#!/usr/bin/env node
'use strict';

const { main } = require('./src/cli');

try {
  main(process.argv.slice(2));
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
