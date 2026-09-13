// This file is the only change in the safe regression demonstration.
export const release = { name: 'good', schemaVersion: '14', contractVersion: '1' };
export function normalizePromo(value) { return (value ?? '').trim().toUpperCase(); }
