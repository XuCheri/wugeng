// Tier 1 Barrel: Feature Happy-Path E2E Tests across all 15 v3 Features (F1–F15)
// STRICT OPAQUE-BOX: ZERO imports from ../../src/**.

import { TIER1_F1_F7 } from './tier1-f1-f7.mjs';
import { TIER1_F8_F15 } from './tier1-f8-f15.mjs';
import { TIER1_F16 } from './tier1-f16.mjs';
import { TIER1_F17 } from './tier1-f17.mjs';
import { TIER1_F18 } from './tier1-f18.mjs';
import { TIER1_F19 } from './tier1-f19.mjs';
import { TIER1_F20 } from './tier1-f20.mjs';

export { TIER1_F1_F7, TIER1_F8_F15, TIER1_F16, TIER1_F17, TIER1_F18, TIER1_F19, TIER1_F20 };
export const TIER1_TESTS = [
  ...TIER1_F1_F7, ...TIER1_F8_F15, ...TIER1_F16, ...TIER1_F17, ...TIER1_F18, ...TIER1_F19, ...TIER1_F20,
];
