// src/lib/watermark.ts — THE single source of truth for the sample watermark.
//
// Every screen and every exported PDF reads WATERMARK_ENABLED / WATERMARK_TEXT from here and nowhere
// else. After CA sign-off (Thursday), clear the watermark EVERYWHERE with ONE change: set the env var
// VCFO_WATERMARK_OFF=1 (no redeploy of the rule logic), or flip the constant below to false.
//
// This is the visible layer of the same truth as the data's PENDING/UNVERIFIED status — removing the
// watermark does NOT make any number "correct"; that still requires the CA-checked golden fixture.
export const WATERMARK_TEXT = 'SAMPLE — UNVERIFIED · NOT FOR CLIENT USE';
export const WATERMARK_ENABLED = process.env.VCFO_WATERMARK_OFF !== '1';
