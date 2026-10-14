import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // package.json의 version을 앱 전역 상수로 주입 → 설정 화면에 자동 표시
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // 단위 테스트(Vitest) — 날짜 계산은 사용자 기기와 같은 한국 시간으로 재현
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    setupFiles: ['src/test/setup.js'],
    env: { TZ: 'Asia/Seoul' },
  },
})
