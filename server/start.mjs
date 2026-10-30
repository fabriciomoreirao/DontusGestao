import { attachRealtimeProxy } from './realtime-proxy.mjs';

// Match vinext's production dotenv precedence before importing the app build.
for (const file of ['.env.production.local', '.env.local', '.env.production', '.env']) {
  try { process.loadEnvFile(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const args = process.argv.slice(2);
const { startProdServer } = await import('vinext/server/prod-server');
const option = (...names) => { const i = args.findIndex(arg => names.includes(arg)); return i < 0 ? undefined : args[i + 1]; };
const { server } = await startProdServer({ port: Number(option('--port', '-p') ?? process.env.PORT ?? 3000), host: option('--host', '--hostname', '-H') ?? process.env.HOST ?? '0.0.0.0' });
attachRealtimeProxy(server);
