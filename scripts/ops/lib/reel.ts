// Turns designed 4:5 slides into a vertical 9:16 Reel with ffmpeg: each slide
// sits on the brand gradient, drifts in slowly, and cross-fades to the next.
// Output: H.264 + AAC (a silent track), 30 fps, 1080x1920, which Instagram accepts.
// The GitHub runner image ships ffmpeg; locally it must be on PATH.

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface ReelOptions {
  /** Seconds each slide stays on screen (before the cross-fade). */
  secondsPerSlide?: number;
  /** A 1080x1920 PNG the slides sit on (the brand backdrop). */
  backdrop: Buffer;
}

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => { err += d; });
    p.on('error', reject);
    p.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed (${code}): ${err.slice(-800)}`))));
  });
}

export async function makeReel(slides: Buffer[], opts: ReelOptions): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'reel-'));
  try {
    const hold = opts.secondsPerSlide ?? 3.6;
    const fade = 0.35;
    const fps = 30;
    await writeFile(join(dir, 'bg.png'), opts.backdrop);
    const inputs: string[] = ['-loop', '1', '-framerate', String(fps), '-t', String(hold * slides.length + 1), '-i', join(dir, 'bg.png')];
    for (let i = 0; i < slides.length; i++) {
      await writeFile(join(dir, `s${i}.png`), slides[i]);
      inputs.push('-loop', '1', '-framerate', String(fps), '-t', String(hold + fade), '-i', join(dir, `s${i}.png`));
    }
    const frames = Math.round((hold + fade) * fps);
    const parts: string[] = [];
    // Each slide: a slow push-in (about 5%) at 1000px wide, placed on the backdrop.
    for (let i = 0; i < slides.length; i++) {
      parts.push(
        `[${i + 1}:v]scale=1000:1250,zoompan=z='min(zoom+0.0005,1.05)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1000x1250:fps=${fps},setsar=1[z${i}]`,
        `[0:v][z${i}]overlay=40:(H-h)/2+40,trim=duration=${hold + fade},setpts=PTS-STARTPTS,format=yuv420p[v${i}]`,
      );
    }
    // Chain cross-fades.
    let last = 'v0';
    for (let i = 1; i < slides.length; i++) {
      const offset = (hold * i).toFixed(2);
      parts.push(`[${last}][v${i}]xfade=transition=slideleft:duration=${fade}:offset=${offset}[x${i}]`);
      last = `x${i}`;
    }
    const duration = hold * slides.length + fade;
    const out = join(dir, 'reel.mp4');
    await ffmpeg([
      ...inputs,
      '-f', 'lavfi', '-t', String(duration), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-filter_complex', parts.join(';'),
      '-map', `[${last}]`, '-map', `${slides.length + 1}:a`,
      '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(fps), '-b:v', '4M', '-maxrate', '5M', '-bufsize', '8M',
      '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', out,
    ]);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
