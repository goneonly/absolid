// 로컬 미리보기·녹화 서버: 정적 파일 제공 + 브라우저가 만든 영상을 out/ 폴더에 저장
// 실행: node prototypes/situp-video/server.mjs  →  http://localhost:5179
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.fbx': 'application/octet-stream', '.mp4': 'video/mp4' }

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  try {
    if (req.method === 'POST' && url.pathname === '/save') {
      const name = basename(url.searchParams.get('name') || 'video.mp4') // 경로 조작 방지
      const chunks = []
      for await (const c of req) chunks.push(c)
      const buf = Buffer.concat(chunks)
      await writeFile(join(ROOT, 'out', name), buf)
      console.log(`저장: out/${name} (${(buf.length / 1048576).toFixed(2)}MB)`)
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, bytes: buf.length }))
      return
    }
    const path = url.pathname === '/' ? '/index.html' : url.pathname
    const file = join(ROOT, path)
    if (!file.startsWith(ROOT)) throw new Error('forbidden')
    const data = await readFile(file)
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(data)
  } catch {
    res.writeHead(404).end('not found')
  }
}).listen(5179, '127.0.0.1', () => console.log('http://localhost:5179'))
