// Tvar DNA nafitovaný z cílů particlů (DnaCore.fitHelix): osa vláken = šroubovice, příčky = vodorovné tyče.
// Sdílený mezi DnaCore (páteř) a GPGPU particlů (utils.js – dojezd podél DNA). Bez závislostí (žádný cyklus importů).
export const MAX_RUNGS = 48;
export const dnaShape = {
  valid: false,
  th0: 9.3727, k: 0.4963, R: 1.599,    // θ(y) = th0 + k·y (atan2(z,x)), druhé vlákno +π
  rungs: [],                            // world Y příček
  version: 0,                           // mění se při novém fitu
};
