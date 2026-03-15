'use strict';
const { sendAsync } = require('../lib/context-client');

// Signal dashboard to graduate session knowledge to project DB
sendAsync('graduate', { timestamp: new Date().toISOString() });
