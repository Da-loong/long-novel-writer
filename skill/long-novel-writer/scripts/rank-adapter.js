#!/usr/bin/env node
'use strict';
const rankScan = require('./rank-scan');
async function run(platform, argv = process.argv.slice(2)) { return rankScan.main(['--platform', platform, ...argv]); }
module.exports = { run };
