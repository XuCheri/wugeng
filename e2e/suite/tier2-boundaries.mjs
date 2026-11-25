// Tier 2 Barrel: Boundary, Negative, Security & Invariant E2E Tests across all 15 v3 Features (F1–F15)
// STRICT OPAQUE-BOX: ZERO imports from ../../src/**.

import { TIER2_F1_F7 } from './tier2-f1-f7.mjs';
import { TIER2_F8_F15 } from './tier2-f8-f15.mjs';
import { TIER2_F16 } from './tier2-f16.mjs';
import { TIER2_F17 } from './tier2-f17.mjs';
import { TIER2_F18 } from './tier2-f18.mjs';
import { TIER2_F19 } from './tier2-f19.mjs';

export { TIER2_F1_F7, TIER2_F8_F15, TIER2_F16, TIER2_F17, TIER2_F18, TIER2_F19 };
export const TIER2_TESTS = [...TIER2_F1_F7, ...TIER2_F8_F15, ...TIER2_F16, ...TIER2_F17, ...TIER2_F18, ...TIER2_F19];
