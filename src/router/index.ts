import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import EditorView from '../views/EditorView.vue'
import AIToolsView from '../views/AIToolsView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/design/:id', name: 'editor', component: EditorView, props: true },
    { path: '/ai-tools', name: 'ai-tools', component: AIToolsView },
  ],
})
