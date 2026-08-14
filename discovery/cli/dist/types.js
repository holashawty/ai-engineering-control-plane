// Detector interface per ADR-0009 (detector-driven, no per-stack enumeration
// in the orchestrator). Each stack detector implements this same shape and
// is registered in discover.ts. Adding a new stack means adding one file
// here and one line in the registry — the orchestrator never branches on
// stack name itself.
export {};
