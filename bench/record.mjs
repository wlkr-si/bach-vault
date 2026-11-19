import { chromium } from 'playwright'
import { spawnSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', ...args], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.error?.message ?? result.stderr)
  return result.stderr
}

export function launchBrowser() {
  const graphics = process.platform === 'darwin' ? ['--enable-gpu', '--use-angle=metal'] : []
  return chromium.launch({
    chromiumSandbox: true,
    ignoreDefaultArgs: ['--mute-audio'],
    args: ['--autoplay-policy=no-user-gesture-required', '--proxy-server=http://127.0.0.1:1', '--proxy-bypass-list=<-loopback>', ...graphics, '--force-webrtc-ip-handling-policy=disable_non_proxied_udp']
  })
}

/** @param {string} source @param {string} raw */
export async function record(source, raw) {
  const browser = await launchBrowser()
  try {
    const context = await browser.newContext({ offline: true, serviceWorkers: 'block' })
    const page = await context.newPage()
    await page.route('**/*', route => route.abort())
    await page.routeWebSocket('**/*', socket => socket.close())
    await page.setContent(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src blob:"><canvas width="1080" height="1350"></canvas>`)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    let title = ''
    await page.exposeBinding('reportTitle', (_caller, value) => { title = value })
    let timeout
    try {
      const capture = page.evaluate(async source => {
        const canvas = document.querySelector('canvas')
        if (!canvas) throw new Error('Canvas missing')
        const audioContext = new AudioContext({ sampleRate: 48000 })
        const mix = audioContext.createGain()
        const captureAudio = audioContext.createMediaStreamDestination()
        mix.connect(captureAudio)
        Object.defineProperty(audioContext, 'destination', { value: mix })
        await audioContext.resume()
        // Capture the Piece canvas directly, before a WebGL drawing buffer can be discarded.
        const video = canvas.captureStream(30)
        const stream = new MediaStream([...video.getVideoTracks(), ...captureAudio.stream.getAudioTracks()])
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus', videoBitsPerSecond: 6_000_000 })
        const chunks = []
        const finished = new Promise((resolve, reject) => {
          recorder.ondataavailable = event => chunks.push(event.data)
          recorder.onerror = () => reject(new Error('MediaRecorder failed'))
          recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }))
        })
        let seed = 42
        const random = () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
          return seed / 2 ** 32
        }
        let issue = ''
        let start
        try {
          const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
          try {
            const module = await import(url)
            if (typeof module.title === 'string') {
              await /** @type {Window & {reportTitle?: (value: string) => Promise<void>}} */ (window).reportTitle?.(module.title)
            }
            if (typeof module.title !== 'string' || typeof module.start !== 'function') {
              throw new Error('Module must export a title and start function')
            }
            start = module.start
          } finally {
            URL.revokeObjectURL(url)
          }
        } catch (error) {
          issue = String(error)
        }
        recorder.start()
        const stop = setTimeout(() => recorder.stop(), 15000)
        try {
          Promise.resolve(start?.({ audioContext, canvas, duration: 15, random }))
            .catch(error => { issue = String(error) })
        } catch (error) {
          issue = String(error)
        }
        const blob = /** @type {Blob} */ (await finished)
        clearTimeout(stop)
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result).split(',')[1])
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(blob)
        })
        return { issue, hasContract: Boolean(start), data: String(data) }
      }, source)
      const deadline = new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Browser recording timed out')), 30000)
      })
      const { issue, hasContract, data } = await Promise.race([capture, deadline])
      await writeFile(raw, Buffer.from(data, 'base64'))
      return { title, hasContract, reason: issue || errors[0] || '' }
    } catch (error) {
      return { title, reason: String(error) }
    } finally {
      clearTimeout(timeout)
    }
  } finally {
    await browser.close()
  }
}

export function encode(folder, raw, hasRecording) {
  const streams = hasRecording
    ? ['-i', raw, '-vf', 'fps=30,tpad=stop_mode=clone:stop_duration=15', '-af', 'apad']
    : ['-f', 'lavfi', '-i', 'color=black:s=1080x1350:r=30', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo']
  const clip = join(folder, 'clip.mp4')
  ffmpeg(['-y', ...streams, '-t', '15', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', clip])
  ffmpeg(['-y', '-ss', '1', '-i', clip, '-frames:v', '1', '-update', '1', join(folder, 'poster.jpg')])
  const levels = ffmpeg(['-i', clip, '-vn', '-af', 'volumedetect', '-f', 'null', '-'])
  return Number(levels.match(/max_volume: (-?[\d.]+) dB/)?.[1] ?? -Infinity) > -90
}
