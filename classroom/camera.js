// CLASSROOM-STUB: replaced by the camera workstream before delivery.
// Contract: createCamera({video, onStatus, onFrame}) returns {start, stop}.
// onStatus receives {state, detail?}: loading, ready, denied, unavailable, error.
// onFrame receives {landmarks: normalized mirrored [{x,y,z?}] | null}.
// start(): Promise<void>; stop(): synchronous and cancels pending starts.
export function createCamera() {
  return { async start() {}, stop() {} };
}
