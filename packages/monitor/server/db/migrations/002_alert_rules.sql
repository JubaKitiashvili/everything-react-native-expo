-- 002_alert_rules.sql
-- Additional indexes optimized for alert evaluation queries.
-- The alert engine periodically scans enabled rules and queries current
-- metric values; these indexes accelerate those hot-path lookups.

BEGIN;

-- Composite index for the alert evaluation loop:
-- "for each enabled rule targeting a given metric, fetch by app"
CREATE INDEX IF NOT EXISTS idx_alert_rules_evaluation
  ON alert_rules (app_id, metric, enabled)
  WHERE enabled = TRUE;

-- Support fast cooldown checks: find the latest trigger per rule
CREATE INDEX IF NOT EXISTS idx_alert_history_rule_latest
  ON alert_history (rule_id, triggered_at DESC);

-- Support auto-resolution queries: find unresolved alerts by rule
-- that are older than the window
CREATE INDEX IF NOT EXISTS idx_alert_history_resolution
  ON alert_history (rule_id, triggered_at)
  WHERE resolved_at IS NULL;

-- Channel-based lookups for notification routing
CREATE INDEX IF NOT EXISTS idx_alert_rules_channel
  ON alert_rules (channel)
  WHERE enabled = TRUE;

COMMIT;
