/**
 * ERNE Dashboard — WebSocket client with exponential backoff reconnect
 */
(function () {
  'use strict';

  const createWSClient = (onStateUpdate, onConnectionChange, onHistoryUpdate) => {
    let ws = null;
    let connected = false;
    let reconnectDelay = 1000;

    const connect = () => {
      try {
        ws = new WebSocket('ws://' + location.host);
      } catch (e) {
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        connected = true;
        reconnectDelay = 1000;
        if (onConnectionChange) onConnectionChange(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'init' && data.agents) {
            // Initial payload with agents + history
            onStateUpdate(data.agents);
            if (onHistoryUpdate && data.history) {
              onHistoryUpdate(data.history);
            }
          } else if (data.type === 'state' && data.agents) {
            onStateUpdate(data.agents);
          } else if (!data.type) {
            // Raw agent state object (incremental broadcast)
            onStateUpdate(data);
          }
        } catch (e) {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        connected = false;
        if (onConnectionChange) onConnectionChange(false);
        scheduleReconnect();
      };

      ws.onerror = () => {
        if (ws) ws.close();
      };
    };

    const scheduleReconnect = () => {
      setTimeout(() => {
        connect();
      }, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    };

    connect();

    return {
      isConnected: () => connected,
    };
  };

  window.WSClient = {
    createWSClient,
  };
})();
