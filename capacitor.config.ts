import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.twentyonecode.editor',
  appName: '21 Code',
  webDir: 'dist',
  android: {
    backgroundColor: '#0b111a',
    webContentsDebuggingEnabled: false,
    allowMixedContent: false,
  },
}

export default config
