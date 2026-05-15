import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
    plugins: [react()],
    base: '/',
    server: {
        port: 5173,
        proxy: {
            '/api/chat': 'http://127.0.0.1:8001',
            '/api/auth': 'http://127.0.0.1:8001',
            '/api/users': 'http://127.0.0.1:8001',
            '/api/admin': 'http://127.0.0.1:8001',
            '/api/ai': 'http://127.0.0.1:8001',
            '/api': 'http://127.0.0.1:8000',
            '/admin-dashboard': {
                target: 'http://127.0.0.1:7890',
                rewrite: (path) => path.replace(/^\/admin-dashboard/, ''),
            },
        },
    },
}))

