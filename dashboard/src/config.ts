const apiUrl = (import.meta.env.VITE_API_URL || '').trim();
const wsUrl = (import.meta.env.VITE_WS_URL || '').trim();
const demoModeOverride = import.meta.env.VITE_DEMO_MODE;
const hasRemoteDataSource = Boolean(apiUrl || wsUrl);

export const appConfig = {
  apiUrl,
  wsUrl,
  basePath: import.meta.env.BASE_URL || '/',
  isDemoMode: demoModeOverride ? demoModeOverride === 'true' : !hasRemoteDataSource,
};