import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import EditorView from '../views/EditorView.vue'
import AIToolsView from '../views/AIToolsView.vue'
import SnippetView from '../views/SnippetView.vue'
import HelpView from '../views/HelpView.vue'
import MyDesignsView from '../views/MyDesignsView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/design/:id', name: 'editor', component: EditorView, props: true },
    { path: '/ai-tools', name: 'ai-tools', component: AIToolsView },
    { path: '/s/:id', name: 'snippet', component: SnippetView },
    { path: '/help', name: 'help', component: HelpView },
    { path: '/mine', name: 'mine', component: MyDesignsView },
    // PDF 合并/拆分已并入工具箱页面，旧链接重定向过去，避免已分享的 /pdf-tools 链接失效
    { path: '/pdf-tools', redirect: { path: '/ai-tools', query: { tab: 'pdf' } } },
  ],
})
