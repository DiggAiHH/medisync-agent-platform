/**
 * Triage routes.
 * REST endpoints for triage results and call processing.
 */
import { Router, Request, Response } from 'express';
import { CallRouter } from '../callRouter';

export interface TriageDependencies {
  callRouter: CallRouter;
}

export function createTriageRoutes(deps: TriageDependencies): Router {
  const router = Router();

  /**
   * GET /triage/calls
   * List active calls with their current state.
   */
  router.get('/calls', (_req: Request, res: Response) => {
    const calls = deps.callRouter.getActiveCalls();
    res.json({ calls, count: calls.length });
  });

  /**
   * GET /triage/calls/:callId
   * Get a specific call by ID.
   */
  router.get('/calls/:callId', (req: Request, res: Response) => {
    const call = deps.callRouter.getCall(req.params.callId);
    if (!call) {
      res.status(404).json({ error: 'Call not found' });
      return;
    }
    res.json(call);
  });

  /**
   * POST /triage/process/:callId
   * Manually trigger triage processing for a completed call.
   */
  router.post('/process/:callId', async (req: Request, res: Response) => {
    const call = deps.callRouter.getCall(req.params.callId);
    if (!call) {
      res.status(404).json({ error: 'Call not found' });
      return;
    }

    try {
      const result = await deps.callRouter.processCompletedCall(call);
      if (result) {
        res.json(result);
      } else {
        res.status(422).json({ error: 'Call could not be processed (no recording or no consent)' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  return router;
}
