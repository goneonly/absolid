import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // package.json의 version을 앱 전역 상수로 주입 → 설정 화면에 자동 표시
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
})
