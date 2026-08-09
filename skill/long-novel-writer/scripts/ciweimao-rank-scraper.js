#!/usr/bin/env node
'use strict';
require('./rank-adapter').run('ciweimao').catch((error) => { process.stderr.write(JSON.stringify({ ok: false, code: error.code || 'RANK_SCAN_ERROR', message: error.message }) + '\n'); process.exitCode = 1; });
