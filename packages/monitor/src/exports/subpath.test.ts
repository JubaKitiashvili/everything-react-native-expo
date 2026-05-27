/**
 * Subpath export smoke test. Verifies every tree-shakeable subpath
 * exports the symbols consumers are expected to reach. If a rename or
 * accidental re-export breaks one of these, CI catches it immediately.
 *
 * Consumers import like:
 *   import { RenderCollector } from '@erne/monitor/performance';
 *   import { NetworkCollector } from '@erne/monitor/network';
 *   import { SignalRouter } from '@erne/monitor/ai';
 *   import { ReplayMasker } from '@erne/monitor/replay';
 *   import { BugReporter } from '@erne/monitor/dev';
 */

import * as Performance from './performance';
import * as Network from './network';
import * as AI from './ai';
import * as Replay from './replay';
import * as BugReports from './bug-reports';
import * as Discovery from './discovery';
import * as Dev from './dev';
import * as Testing from './testing';

describe('subpath exports', () => {
  describe('@erne/monitor/performance', () => {
    it('exports all performance collectors', () => {
      expect(Performance.RenderCollector).toBeDefined();
      expect(Performance.FrameDropCollector).toBeDefined();
      expect(Performance.StartupCollector).toBeDefined();
      expect(Performance.MemoryCollector).toBeDefined();
      expect(Performance.LongTaskCollector).toBeDefined();
      expect(Performance.ActivityCollector).toBeDefined();
      expect(Performance.SuspenseCollector).toBeDefined();
      expect(Performance.DualThreadFPSCollector).toBeDefined();
      expect(Performance.FabricCommitCollector).toBeDefined();
      expect(Performance.HermesProfilerCollector).toBeDefined();
    });

    it('does NOT leak unrelated collectors', () => {
      expect((Performance as Record<string, unknown>).CrashCollector).toBeUndefined();
      expect((Performance as Record<string, unknown>).NetworkCollector).toBeUndefined();
      expect((Performance as Record<string, unknown>).SignalRouter).toBeUndefined();
      expect((Performance as Record<string, unknown>).ReplayMasker).toBeUndefined();
    });
  });

  describe('@erne/monitor/network', () => {
    it('exports NetworkCollector only', () => {
      expect(Network.NetworkCollector).toBeDefined();
    });

    it('does NOT leak unrelated collectors', () => {
      expect((Network as Record<string, unknown>).RenderCollector).toBeUndefined();
      expect((Network as Record<string, unknown>).CrashCollector).toBeUndefined();
      expect((Network as Record<string, unknown>).SignalRouter).toBeUndefined();
    });
  });

  describe('@erne/monitor/ai', () => {
    it('exports the full SignalRouter pipeline', () => {
      expect(AI.SignalRouter).toBeDefined();
      expect(AI.DedupEngine).toBeDefined();
      expect(AI.CorrelationEngine).toBeDefined();
      expect(AI.ConfidenceScorer).toBeDefined();
      expect(AI.ContextBuilder).toBeDefined();
      expect(AI.DispatchEngine).toBeDefined();
      expect(AI.FeedbackTracker).toBeDefined();
      expect(AI.PatternLibrary).toBeDefined();
    });

    it('exports the Phase 4 intelligence layer', () => {
      expect(AI.AnomalyDetector).toBeDefined();
      expect(AI.ModelLoader).toBeDefined();
      expect(AI.OTAUpdater).toBeDefined();
      expect(AI.PatternSync).toBeDefined();
    });

    it('does NOT leak unrelated surfaces', () => {
      expect((AI as Record<string, unknown>).RenderCollector).toBeUndefined();
      expect((AI as Record<string, unknown>).NetworkCollector).toBeUndefined();
      expect((AI as Record<string, unknown>).MonitorProvider).toBeUndefined();
    });
  });

  describe('@erne/monitor/replay', () => {
    it('exports replay surface', () => {
      expect(Replay.ReplayMasker).toBeDefined();
      expect(Replay.ReplayCollector).toBeDefined();
      expect(Replay.LayoutSnapshotCollector).toBeDefined();
      expect(Replay.VisualReproCollector).toBeDefined();
    });

    it('does NOT leak unrelated surfaces', () => {
      expect((Replay as Record<string, unknown>).SignalRouter).toBeUndefined();
      expect((Replay as Record<string, unknown>).NetworkCollector).toBeUndefined();
    });
  });

  describe('@erne/monitor/bug-reports', () => {
    it('exports the bidirectional bug-report channel + shake detector', () => {
      expect(BugReports.BugReportChannel).toBeDefined();
      expect(BugReports.ShakeDetector).toBeDefined();
    });

    it('does NOT leak unrelated surfaces', () => {
      expect((BugReports as Record<string, unknown>).SignalRouter).toBeUndefined();
      expect((BugReports as Record<string, unknown>).BugReporter).toBeUndefined();
    });
  });

  describe('@erne/monitor/discovery', () => {
    it('exports the LAN discovery surface', () => {
      expect(Discovery.DashboardDiscovery).toBeDefined();
      expect(Discovery.ERNE_SERVICE_TYPE).toBe('_erne-monitor._tcp');
    });

    it('does NOT leak unrelated surfaces', () => {
      expect((Discovery as Record<string, unknown>).SignalRouter).toBeUndefined();
      expect((Discovery as Record<string, unknown>).BugReportChannel).toBeUndefined();
    });
  });

  describe('@erne/monitor/dev', () => {
    it('exports developer-only integrations', () => {
      expect(Dev.TerminalReporter).toBeDefined();
      expect(Dev.ExpoDevToolsPlugin).toBeDefined();
      expect(Dev.BugReporter).toBeDefined();
      expect(Dev.DashboardBridge).toBeDefined();
    });

    it('does NOT leak production-facing surfaces', () => {
      expect((Dev as Record<string, unknown>).MonitorClient).toBeUndefined();
      expect((Dev as Record<string, unknown>).SignalRouter).toBeUndefined();
    });
  });

  describe('@erne/monitor/testing', () => {
    it('exports synthetic event helpers', () => {
      expect(Testing.generateSyntheticEvent).toBeDefined();
      expect(Testing.generateSyntheticEventBatch).toBeDefined();
      expect(Testing.isSyntheticEvent).toBeDefined();
      expect(Testing.SYNTHETIC_MARKER).toBe('_synthetic');
    });

    it('does NOT leak runtime surfaces', () => {
      expect((Testing as Record<string, unknown>).MonitorClient).toBeUndefined();
      expect((Testing as Record<string, unknown>).SignalRouter).toBeUndefined();
      expect((Testing as Record<string, unknown>).CrashCollector).toBeUndefined();
    });
  });
});
