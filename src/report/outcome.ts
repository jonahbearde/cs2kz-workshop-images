/** The outcome of the Sync's download phase, as the run-result message presents it. */
export interface SyncOutcome {
  /** Maps whose image was newly downloaded (previously Missing). */
  downloaded: string[];
  /** Maps whose stored image was replaced with the winner's current preview (previously Stale). */
  updated: string[];
  /** Maps whose download failed after every attempt. */
  failures: { name: string; reason: string }[];
}
