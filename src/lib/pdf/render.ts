// src/lib/pdf/render.ts — HTML → A4 PDF via puppeteer-core. On serverless (Vercel/Lambda) it uses
// @sparticuz/chromium; locally it uses an installed Chrome/Edge (or PUPPETEER_EXECUTABLE_PATH).
// setContent (not navigation) so no auth/self-fetch is needed — the caller passes fully-built HTML.
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const isServerless = () => !!(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL);

const LOCAL_CANDIDATES: Record<string, string[]> = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'],
};

async function resolveExecutable(): Promise<string> {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  if (isServerless()) {
    const chromium = (await import('@sparticuz/chromium')).default;
    return chromium.executablePath();
  }
  const found = (LOCAL_CANDIDATES[process.platform] ?? LOCAL_CANDIDATES.linux).find(existsSync);
  if (!found) throw new Error('No Chrome/Edge found for PDF export. Set PUPPETEER_EXECUTABLE_PATH to a Chromium binary.');
  return found;
}

export async function htmlToPdf(html: string): Promise<Uint8Array> {
  let args = ['--no-sandbox', '--disable-setuid-sandbox'];
  if (isServerless()) {
    const chromium = (await import('@sparticuz/chromium')).default;
    args = chromium.args;
  }
  const browser = await puppeteer.launch({ args, headless: true, executablePath: await resolveExecutable() });
  try {
    const page = await browser.newPage();
    // The HTML is fully self-contained (inline CSS + data-URI SVG; no external requests),
    // so 'load' fires immediately — no need for networkidle.
    await page.setContent(html, { waitUntil: 'load' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
    });
  } finally {
    await browser.close();
  }
}
