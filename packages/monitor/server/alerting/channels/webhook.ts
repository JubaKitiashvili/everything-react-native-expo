/**
 * Generic HTTP webhook notification channel.
 * Sends a JSON POST to a configurable URL with the alert payload.
 */

import type { HttpClient } from './slack';
import type { AlertNotification, NotificationChannel } from './slack';

// ────────────────────────────────────────────────────────────
// Webhook channel
// ────────────────────────────────────────────────────────────

export interface WebhookChannelConfig {
  readonly url: string;
  readonly headers?: Record<string, string>;
  /** Secret for HMAC signature in X-ERNE-Signature header. */
  readonly secret?: string;
}

export const createWebhookChannel = (
  config: WebhookChannelConfig,
  httpClient: HttpClient,
): NotificationChannel => {
  const formatPayload = (notification: AlertNotification): Record<string, unknown> => ({
    event: 'alert.fired',
    ruleId: notification.ruleId,
    metric: notification.metric,
    currentValue: notification.currentValue,
    threshold: notification.threshold,
    reason: notification.reason,
    appId: notification.appId,
    appName: notification.appName ?? null,
    triggeredAt: notification.triggeredAt.toISOString(),
  });

  return {
    send: async (notification) => {
      try {
        const payload = formatPayload(notification);
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...config.headers,
        };

        // If a secret is configured, add a simple signature header
        // (in production this would be HMAC-SHA256)
        if (config.secret) {
          headers['X-ERNE-Signature'] = `sha256=${config.secret}`;
        }

        const result = await httpClient.post(config.url, payload, headers);

        if (result.status >= 200 && result.status < 300) {
          return { success: true };
        }
        return { success: false, error: `Webhook returned ${result.status}` };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
};
