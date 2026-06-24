// src/lib/watermark.ts — THE single source of truth for the sample watermark.
//
// CA SIGN-OFF COMPLETE (per owner confirmation, 2026-06-24): the SAMPLE—UNVERIFIED posture is lifted,
// so the watermark + status ribbon are OFF by default everywhere (screen, PDF, XLSX) — every consumer
// reads WATERMARK_ENABLED from here and nowhere else. The kill switch is retained, inverted: set
// VCFO_WATERMARK_ON=1 in the server env to force the sample watermark back on (e.g. a fresh, not-yet-
// verified environment) without touching any rule logic.
export const WATERMARK_TEXT = 'SAMPLE — UNVERIFIED · NOT FOR CLIENT USE';
export const WATERMARK_ENABLED = process.env.VCFO_WATERMARK_ON === '1';
