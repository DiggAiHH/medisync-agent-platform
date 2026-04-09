/**
 * Health check routes.
 */
import { Router, Request, Response } from 'express';
import { StarfaceHealth } from '../../starface';
import { WhisperLocal } from '../../audio';
import { PiperLocal } from '../../audio';

export interface HealthDependencies {
  starfaceHealth: StarfaceHealth;
  whisper: WhisperLocal;
  piper: PiperLocal;
}

export function createHealthRoutes(deps: HealthDependencies): Router {
  const router = Router();

  /**
   * GET /health
   * Full health check of all services.
   */
  router.get('/', async (_req: Request, res: Response) => {
    const checks = await Promise.allSettled([
      deps.starfaceHealth.quickCheck(),
      deps.whisper.isHealthy(),
      deps.piper.isHealthy(),
    ]);

    const starface = checks[0].status === 'fulfilled' ? checks[0].value : false;
    const whisper = checks[1].status === 'fulfilled' ? checks[1].value : false;
    const piper = checks[2].status === 'fulfilled' ? checks[2].value : false;

    const allHealthy = starface && whisper && piper;

    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        starface: { healthy: starface },
        whisper: { healthy: whisper },
        piper: { healthy: piper },
      },
    });
  });

  /**
   * GET /health/ready
   * Lightweight readiness probe.
   */
  router.get('/ready', (_req: Request, res: Response) => {
    res.status(200).json({ ready: true });
  });

  return router;
}
