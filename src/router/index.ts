import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import EditorView from '../views/EditorView.vue'
import AIToolsView from '../views/AIToolsView.vue'
import PDFToolsView from '../views/PDFToolsView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/design/:id', name: 'editor', component: EditorView, props: true },
    { path: '/ai-tools', name: 'ai-tools', component: AIToolsView },
    { path: '/pdf-tools', name: 'pdf-tools', component: PDFToolsView },
  ],
})
