import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    // host: true expõe o servidor na rede local (acesso pelo celular via Wi-Fi)
    server: {
        host: true,
        port: 5173,
    },
    preview: {
        host: true,
        port: 4173,
    },
});
