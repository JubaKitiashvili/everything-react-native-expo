/**
 * Email notification channel via SMTP interface.
 */

import type { AlertNotification, NotificationChannel } from './slack';

// ────────────────────────────────────────────────────────────
// SMTP client interface (dependency injection)
// ────────────────────────────────────────────────────────────

export interface SmtpClient {
  send(options: {
    readonly from: string;
    readonly to: readonly string[];
    readonly subject: string;
    readonly html: string;
    readonly text: string;
  }): Promise<{ success: boolean; messageId?: string }>;
}

// ────────────────────────────────────────────────────────────
// Email channel
// ────────────────────────────────────────────────────────────

export interface EmailChannelConfig {
  readonly from: string;
  readonly to: readonly string[];
  readonly subjectPrefix?: string;
}

export const createEmailChannel = (
  config: EmailChannelConfig,
  smtpClient: SmtpClient,
): NotificationChannel => {
  const formatSubject = (notification: AlertNotification): string => {
    const prefix = config.subjectPrefix ?? '[ERNE Alert]';
    const appLabel = notification.appName ?? notification.appId;
    return `${prefix} ${notification.metric} — ${appLabel}`;
  };

  const formatHtml = (notification: AlertNotification): string => {
    const appLabel = notification.appName ?? notification.appId;
    const time = notification.triggeredAt.toISOString();

    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px;">
        <h2 style="color: #e53e3e;">Alert: ${notification.metric}</h2>
        <table style="border-collapse: collapse; width: 100%;">
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">App</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${appLabel}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Metric</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${notification.metric}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Current Value</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${notification.currentValue}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Threshold</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${notification.threshold}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Reason</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${notification.reason}</td>
          </tr>
        </table>
        <p style="color: #718096; font-size: 12px; margin-top: 16px;">
          Triggered at ${time} | Rule ID: ${notification.ruleId}
        </p>
      </div>
    `.trim();
  };

  const formatText = (notification: AlertNotification): string => {
    const appLabel = notification.appName ?? notification.appId;
    return [
      `ERNE Alert: ${notification.metric}`,
      `App: ${appLabel}`,
      `Current: ${notification.currentValue}`,
      `Threshold: ${notification.threshold}`,
      `Reason: ${notification.reason}`,
      `Triggered: ${notification.triggeredAt.toISOString()}`,
      `Rule: ${notification.ruleId}`,
    ].join('\n');
  };

  return {
    send: async (notification) => {
      try {
        const result = await smtpClient.send({
          from: config.from,
          to: config.to,
          subject: formatSubject(notification),
          html: formatHtml(notification),
          text: formatText(notification),
        });

        return { success: result.success };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
};
