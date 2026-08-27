/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 构建期开关：'true' 时「签名」工具里显示印章/骑缝章（仅本机开发，服务器 build 不带） */
  readonly VITE_SEAL_TOOLS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
