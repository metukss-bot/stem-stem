import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'io.github.metukssbot.stemstem',
  appName: 'StemStem',
  webDir: 'dist',
  android: {
    // 폰 파일 선택, 오디오 재생은 WebView 기본 기능으로 동작
    allowMixedContent: false,
  },
}

export default config
