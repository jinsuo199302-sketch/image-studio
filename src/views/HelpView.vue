<script setup lang="ts">
import { useRouter } from 'vue-router'
import AppHeader from '../components/AppHeader.vue'

const router = useRouter()

const SECTIONS = [
  {
    title: '快速开始',
    items: [
      {
        q: '怎么开始一个设计？',
        a: '首页点"创建设计"从空白画布开始，或者在"模板中心"挑一个喜欢的模板直接点"立即使用"进入编辑器，改改文字图片就能用。',
      },
      {
        q: '模板中心的分类/场景/行业筛选是干嘛的？',
        a: '三个维度可以叠加使用，比如"分类=宣传海报"+"场景=开业宣传"+"行业=餐饮美食"，能更快定位到想要的模板。右上角搜索框按模板名称关键词查找。',
      },
    ],
  },
  {
    title: '文字工具',
    items: [
      {
        q: '怎么改文字效果？',
        a: '选中一段文字，上方会出现工具条：字体、字号、加粗/斜体/下划线、颜色、渐变色、对齐方式、行高、字距、描边（颜色+粗细）、阴影、背景色（划重点效果），都是点一下就生效。',
      },
      {
        q: '透明度、图层顺序、复制怎么用？',
        a: '选中任意元素（文字/图片/形状），工具条最右边有透明度滑块、上移一层/下移一层、复制按钮，跟专业设计软件的图层操作是一个意思。',
      },
      {
        q: '想要稿定模板里那种立体渐变大字怎么办？',
        a: '那种效果本质是设计师做好的图片，不是活文字。推荐两个办法：①用"AI 生图"描述效果直接生成一张文字图（比如"中文文字XXX，金色立体质感，透明背景"），当图片素材用；②用 PS/AI 等软件做好导出 PNG 再上传。我们的文字工具能做到颜色、渐变、描边、阴影、背景色这个程度，更复杂的立体/多层效果建议走"文字变图片"这条路。',
      },
    ],
  },
  {
    title: '图片工具',
    items: [
      {
        q: '怎么换图片里的一部分内容？',
        a: '选中图片，工具条里有"替换图片"（整张换掉）、"AI 抠图"（把背景去掉）、"AI 消除/去水印"（涂抹掉图上局部的物体或水印，AI 自动补全背景）、"调色"（亮度/对比度/饱和度，还有黑白/复古滤镜预设）。',
      },
      {
        q: 'AI 消除/去水印怎么操作？',
        a: '点"AI 消除/去水印"，弹窗里用鼠标直接在图上涂抹想去掉的东西（笔刷大小可调），涂完点"开始处理"，AI 会自动用周围背景把涂抹区域填平。',
      },
    ],
  },
  {
    title: 'AI 生成工具',
    items: [
      {
        q: '生图/写作/翻译/视频在哪里？',
        a: '顶部导航"AI 工具"，或者首页顶部的工具条直接点对应 tab，也可以在编辑器左侧图标栏找到"AI工具"面板。',
      },
      {
        q: '为什么生成的是占位图/示例文案？',
        a: '没登录时是演示模式，方便你先体验交互流程。登录账号之后自动切换成真实 AI 生成。',
      },
    ],
  },
  {
    title: '其他工具',
    items: [
      {
        q: '二维码在哪里生成？',
        a: '进入编辑器，左侧图标栏点"形状"，往下滚动能看到"二维码生成"，输入内容（链接/文字）即可，支持生成名片模式（微信扫了能直接存通讯录）。',
      },
      {
        q: 'PDF 合并/拆分在哪？',
        a: '"AI 工具"页面里有 PDF 工具 tab，支持多个 PDF 合并成一个，或者把一个 PDF 拆成多份。',
      },
      {
        q: '做完怎么导出？',
        a: '编辑器右上角"下载"按钮，导出高清 PNG 图片；也可以点"另存为模板"存到自己的模板库里，下次直接复用。',
      },
    ],
  },
  {
    title: '账号',
    items: [
      {
        q: '为什么要登录？',
        a: '登录之后 AI 生图/写作/翻译/视频/消除水印才会用真实接口处理（不登录只能看演示效果），用量算在你的账号下面。',
      },
    ],
  },
]
</script>

<template>
  <div class="flex h-screen flex-col overflow-hidden">
    <AppHeader />
    <main class="flex-1 overflow-y-auto bg-gray-50">
      <section class="bg-gradient-to-b from-violet-50 to-white px-8 py-10 text-center">
        <h1 class="text-2xl font-bold text-gray-800">使用教程</h1>
        <p class="mt-2 text-sm text-gray-500">从创建设计到导出成品，常见问题都在这里</p>
      </section>

      <div class="mx-auto max-w-3xl px-6 pb-16">
        <div v-for="section in SECTIONS" :key="section.title" class="mb-8">
          <h2 class="mb-3 text-base font-semibold text-gray-800">{{ section.title }}</h2>
          <el-collapse>
            <el-collapse-item v-for="item in section.items" :key="item.q" :title="item.q">
              <p class="text-sm leading-relaxed text-gray-600">{{ item.a }}</p>
            </el-collapse-item>
          </el-collapse>
        </div>

        <div class="mt-10 text-center">
          <el-button type="primary" class="!bg-violet-500 !border-none" @click="router.push('/')">
            返回首页开始创作
          </el-button>
        </div>
      </div>
    </main>
  </div>
</template>
