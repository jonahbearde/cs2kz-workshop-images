/**
 * What the Sync's download phase did, per map. The run-result message
 * vocabulary retired when the report and run-result merged; these names
 * survive for the run's own log output and to derive the per-line ✓/✗
 * marks in the report.
 */
export interface DownloadOutcome {
  /** Maps whose image was newly downloaded (previously Missing). */
  downloaded: string[];
  /** Maps whose stored image was replaced with the winner's current preview (previously Stale). */
  updated: string[];
  /** Maps whose download failed after every attempt. */
  failures: { name: string; reason: string }[];
}