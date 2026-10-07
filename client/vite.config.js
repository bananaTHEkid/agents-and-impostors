import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
export default defineConfig(function (_a) {
    var mode = _a.mode;
    // Load environment variables based on the mode
    var env = loadEnv(mode, process.cwd());
    return {
        plugins: [react(), tailwindcss()],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
            },
        },
        server: {
            port: 5000,
        },
        define: {
            'process.env': {
                VITE_SERVER_URL: env.VITE_SERVER_URL || 'http://localhost:5001',
            },
        },
    };
});
