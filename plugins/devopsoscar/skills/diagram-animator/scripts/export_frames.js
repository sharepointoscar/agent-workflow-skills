#!/usr/bin/env node
/**
 * export_frames.js — deterministic capture from a built animated diagram.
 *
 * Works because engine.js models the whole animation as a pure function of a
 * scalar timeline position: this script calls window.DiagramAnim.seek(t) and
 * screenshots, so output is identical run to run and independent of machine
 * speed. It also sets body.exporting, which kills the remaining CSS
 * transitions/animations that would otherwise be captured mid-phase.
 *
 * Usage
 *   node scripts/export_frames.js <built.html> <outdir> [options]
 *
 * Options
 *   --stills            one PNG per step (default on if nothing else asked)
 *   --gif               animated GIF via ffmpeg palettegen
 *   --mp4               H.264 mp4 via ffmpeg (web, Slack, most decks)
 *   --mov               H.264 in a QuickTime container (macOS-native playback,
 *                       Keynote, Final Cut). Same encode, different wrapper.
 *   --prores            ProRes 422 HQ .mov — huge, but the right choice when the
 *                       video will be re-edited or re-encoded downstream
 *   --fps <n>           frame rate for gif/mp4 (default 20)
 *   --width <px>        viewport width (default 1760)
 *   --scale <n>         deviceScaleFactor, 2 for retina stills (default 1)
 *   --gif-width <px>    downscale width for the GIF (default 1200)
 *   --full              capture the whole page instead of just #capture
 *   --hold-end <ms>     extra still time on the final frame (default 1200)
 *   --chromium <path>   browser executable (default $PLAYWRIGHT_CHROMIUM or
 *                       /opt/pw-browsers/chromium, else Playwright's bundled)
 *
 * Requires: playwright (node). ffmpeg only for --gif / --mp4.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? def : process.argv[i + 1];
}
function flag(name) { return process.argv.includes('--' + name); }

(async () => {
  const htmlPath = process.argv[2];
  const outDir = process.argv[3];
  if (!htmlPath || !outDir) {
    console.error('usage: node export_frames.js <built.html> <outdir> [--stills] [--gif] [--mp4]');
    process.exit(1);
  }
  const wantGif = flag('gif'), wantMp4 = flag('mp4');
  const wantMov = flag('mov'), wantProRes = flag('prores');
  const wantVideo = wantGif || wantMp4 || wantMov || wantProRes;
  const wantStills = flag('stills') || !wantVideo;
  const fps = parseInt(arg('fps', '20'), 10);
  const width = parseInt(arg('width', '1760'), 10);
  const scale = parseFloat(arg('scale', '1'));
  const gifWidth = parseInt(arg('gif-width', '1200'), 10);
  const holdEnd = parseInt(arg('hold-end', '1200'), 10);

  fs.mkdirSync(outDir, { recursive: true });
  const framesDir = path.join(outDir, 'frames');

  const { chromium } = require('playwright');
  const exe = arg('chromium', process.env.PLAYWRIGHT_CHROMIUM ||
    (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined));

  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const page = await browser.newPage({
    viewport: { width, height: 1200 },
    deviceScaleFactor: scale
  });

  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('file://' + path.resolve(htmlPath));
  await page.waitForFunction(() => window.DiagramAnim && window.DiagramAnim.ready, { timeout: 15000 });
  await page.evaluate(() => { document.body.classList.add('exporting'); });
  await page.waitForTimeout(250);

  const meta = await page.evaluate(() => ({
    total: window.DiagramAnim.total,
    stepsEnd: window.DiagramAnim.stepsEnd,
    stepMs: window.DiagramAnim.stepMs,
    draw: window.DiagramAnim.timing.draw,
    count: window.DiagramAnim.steps.length
  }));

  const seek = async (t) => {
    await page.evaluate(ms => window.DiagramAnim.seek(ms), t);
    await page.waitForTimeout(30);   // let layout settle; no transitions are running
  };

  /* Lock the caption height before capturing.
   * Captions of different lengths wrap to different line counts, so the capture
   * element changes height between steps. Frames of differing dimensions make
   * ffmpeg's image2 demuxer abort partway ("Conversion failed"), which shows up
   * as a GIF that stops early — a genuinely confusing symptom. Measure the tallest
   * caption across the timeline once, pin it, and every frame matches. */
  await page.evaluate(async (m) => {
    const cap = document.getElementById('caption');
    if (!cap) return;
    cap.style.height = 'auto';
    let max = 0;
    for (let n = 0; n <= m.count + 1; n++) {
      window.DiagramAnim.seek(n === 0 ? -1 : (n > m.count ? m.total : (n - 1) * m.stepMs + m.draw));
      max = Math.max(max, cap.getBoundingClientRect().height);
    }
    cap.style.height = Math.ceil(max) + 'px';
  }, meta);
  await page.waitForTimeout(120);

  // capture target: the caption + diagram block, or the full page
  const target = flag('full') ? page : (await page.$('#capture')) || page;
  const shoot = async (file) => { await target.screenshot({ path: file }); };

  /* ---- per-step stills ------------------------------------------------- */
  if (wantStills) {
    await seek(-1);
    await shoot(path.join(outDir, 'step-00-overview.png'));
    for (let n = 1; n <= meta.count; n++) {
      // mid-hold reads best as a still: path fully drawn, dot mid-flight
      await seek((n - 1) * meta.stepMs + meta.draw + 600);
      await shoot(path.join(outDir, `step-${String(n).padStart(2, '0')}.png`));
    }
    await seek(meta.total);
    await shoot(path.join(outDir, `step-${String(meta.count + 1).padStart(2, '0')}-complete.png`));
    console.log(`stills → ${outDir}/step-*.png`);
  }

  /* ---- frame sequence for gif / mp4 ------------------------------------ */
  if (wantVideo) {
    fs.rmSync(framesDir, { recursive: true, force: true });
    fs.mkdirSync(framesDir, { recursive: true });
    const dt = 1000 / fps;
    const endT = meta.total + holdEnd;
    let i = 0;
    for (let t = 0; t <= endT; t += dt) {
      await seek(Math.min(t, meta.total));
      await shoot(path.join(framesDir, `f${String(i).padStart(5, '0')}.png`));
      i++;
    }
    console.log(`captured ${i} frames @ ${fps}fps`);

    const has = (() => {
      try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; }
      catch (_) { return false; }
    })();
    if (!has) {
      console.warn('ffmpeg not found — frames are in ' + framesDir + '; install ffmpeg to encode');
    } else {
      const pattern = path.join(framesDir, 'f%05d.png');
      if (wantGif) {
        // Two-pass palette. -framerate on the INPUT matters: frames were already
        // captured at the target rate, so adding an fps= filter would resample
        // and silently drop most of them. Leave palettegen's stats_mode at its
        // default — stats_mode=diff trips a filter-graph bug on some builds.
        const pal = path.join(outDir, 'palette.png');
        const scale = `scale=${gifWidth}:-1:flags=lanczos`;
        execFileSync('ffmpeg', ['-y', '-framerate', String(fps), '-i', pattern,
          '-vf', `${scale},palettegen=max_colors=${arg('gif-colors', '200')}`,
          pal], { stdio: 'inherit' });
        execFileSync('ffmpeg', ['-y', '-framerate', String(fps), '-i', pattern,
          '-i', pal, '-filter_complex',
          `[0:v]${scale}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3`,
          '-loop', '0',
          path.join(outDir, 'animation.gif')], { stdio: 'inherit' });
        fs.rmSync(pal, { force: true });
        const mb = fs.statSync(path.join(outDir, 'animation.gif')).size / 1048576;
        console.log(`gif → ${outDir}/animation.gif (${mb.toFixed(1)} MB)`);
      }
      // H.264 encode, shared by --mp4 and --mov. The only difference is the
      // container: .mov is what QuickTime, Keynote, and Final Cut expect, and
      // some macOS apps refuse to preview an .mp4 inline. Same bytes otherwise.
      // yuv420p + even dimensions are required for the file to open in
      // QuickTime and Preview at all — an odd width silently produces a file
      // that plays in VLC and nowhere else.
      const h264 = (outPath, faststart) => {
        const a = ['-y', '-framerate', String(fps), '-i', pattern,
          '-c:v', 'libx264', '-preset', 'slow', '-crf', arg('crf', '18'),
          '-pix_fmt', 'yuv420p',
          '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2'];
        if (faststart) a.push('-movflags', '+faststart');
        a.push(outPath);
        execFileSync('ffmpeg', a, { stdio: 'inherit' });
        const mb = fs.statSync(outPath).size / 1048576;
        console.log(`${path.extname(outPath).slice(1)} → ${outPath} (${mb.toFixed(1)} MB)`);
      };
      if (wantMp4) h264(path.join(outDir, 'animation.mp4'), true);
      if (wantMov) h264(path.join(outDir, 'animation.mov'), true);
      if (wantProRes) {
        execFileSync('ffmpeg', ['-y', '-framerate', String(fps), '-i', pattern,
          '-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le',
          '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
          path.join(outDir, 'animation-prores.mov')], { stdio: 'inherit' });
        const mb = fs.statSync(path.join(outDir, 'animation-prores.mov')).size / 1048576;
        console.log(`prores → ${outDir}/animation-prores.mov (${mb.toFixed(1)} MB)`);
      }
    }
  }

  if (errors.length) console.warn('page errors:', errors);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
