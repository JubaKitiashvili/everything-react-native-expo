/**
 * Slack notification channel — sends alert payloads via webhook.
 */

// ────────────────────────────────────────────────────────────
// HTTP client interface (dependency injection)
// ────────────────────────────────────────────────────────────

export interface HttpClient {
  post(
    url: string,
    body: Record<string, unknown>,
    headers?: Record<string, string>,
  ): Promise<{ status: number; body: unknown }>;
}

// ────────────────────────────────────────────────────────────
// Notification channel interface
// ────────────────────────────────────────────────────────────

export interface AlertNotification {
  readonly ruleId: string;
  readonly metric: string;
  readonly currentValue: number;
  readonly threshold: number;
  readonly reason: string;
  readonly appId: string;
  readonly appName?: string;
  readonly triggeredAt: Date;
}

export interface NotificationChannel {
  send(notification: AlertNotification): Promise<{ success: boolean; error?: string }>;
}

// ────────────────────────────────────────────────────────────
// Slack channel
// ────────────────────────────────────────────────────────────

export interface SlackChannelConfig {
  readonly webhookUrl: string;
  readonly channel?: string;
  readonly username?: string;
  readonly iconEmoji?: string;
}

export const createSlackChannel = (
  config: SlackChannelConfig,
  httpClient: HttpClient,
): NotificationChannel => {
  const formatMessage = (notification: AlertNotification): Record<string, unknown> => {
    const appLabel = notification.appName ?? notification.appId;
    const time = notification.triggeredAt.toISOString();

    return {
      ...(config.channel && { channel: config.channel }),
      ...(config.username && { username: config.username }),
      ...(config.iconEmoji && { icon_emoji: config.iconEmoji }),
      text: `Alert fired for *${appLabel}*`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `Alert: ${notification.metric}`,
          },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*App:*\n${appLabel}` },
            { type: 'mrkdwn', text: `*Metric:*\n${notification.metric}` },
            { type: 'mrkdwn', text: `*Current:*\n${notification.currentValue}` },
            { type: 'mrkdwn', text: `*Threshold:*\n${notification.threshold}` },
          ],
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `${notification.reason} | ${time}` },
          ],
        },
      ],
    };
  };

  return {
    send: async (notification) => {
      try {
        const body = formatMessage(notification);
        const result = await httpClient.post(config.webhookUrl, body, {
          'Content-Type': 'application/json',
        });

        if (result.status >= 200 && result.status < 300) {
          return { success: true };
        }
        return { success: false, error: `Slack returned ${result.status}` };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
};
