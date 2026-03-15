'use strict';
const { sendSync } = require('../lib/context-client');

// Request dashboard to build and save snapshot
sendSync('snapshot', {}, 1000).then(snapshot => {
  if (snapshot) {
    console.log(JSON.stringify({ snapshot_saved: true, session_id: snapshot.session_id }));
  }
}).catch(() => {
  process.exit(1);
});
