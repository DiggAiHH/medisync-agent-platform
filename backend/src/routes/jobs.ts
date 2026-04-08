import { Router, Request, Response } from 'express';
import { 
  createAgentJob, 
  getJobStatus, 
  getAllJobs,
  updateJobStatus 
} from '../queue/agentQueue';
import { broadcastJobUpdate } from '../websocket/streaming';
import { CreateJobRequest, JobResponse, JobsListResponse } from '../types';
import { 
  validateRequest, 
  validateRequestCombined,
  createJobSchema, 
  jobIdParamSchema,
  jobListQuerySchema,
  VALIDATION_LIMITS,
} from '../middleware/validation';
import { logger } from '../utils/logger';

const router = Router();

// POST /api/jobs - Neuen Job erstellen
router.post(
  '/',
  validateRequest(createJobSchema),
  async (req: Request, res: Response) => {

    try {
      const request: CreateJobRequest = {
        prompt: req.body.prompt,
        userId: req.body.userId,
        sessionId: req.body.sessionId
      };

      const job = await createAgentJob(request);

      // WebSocket Broadcast für neue Jobs
      broadcastJobUpdate(job);

      const response: JobResponse = {
        success: true,
        data: job
      };

      res.status(201).json(response);
    } catch (error) {
      logger.error('Fehler beim Erstellen des Jobs', { error });
      const response: JobResponse = {
        success: false,
        error: 'Interner Serverfehler beim Erstellen des Jobs'
      };
      res.status(500).json(response);
    }
  }
);

// GET /api/jobs/:id - Job-Status abrufen
router.get(
  '/:id',
  validateRequestCombined({ params: jobIdParamSchema }),
  async (req: Request, res: Response) => {

    try {
      const jobId = req.params.id;
      const job = await getJobStatus(jobId);

      if (!job) {
        const response: JobResponse = {
          success: false,
          error: `Job mit ID ${jobId} nicht gefunden`
        };
        return res.status(404).json(response);
      }

      const response: JobResponse = {
        success: true,
        data: job
      };

      res.json(response);
    } catch (error) {
      logger.error('Fehler beim Abrufen des Jobs', { error, jobId: req.params.id });
      const response: JobResponse = {
        success: false,
        error: 'Interner Serverfehler beim Abrufen des Jobs'
      };
      res.status(500).json(response);
    }
  }
);

// GET /api/jobs - Alle Jobs auflisten
router.get('/', 
  validateRequestCombined({ query: jobListQuerySchema }),
  async (req: Request, res: Response) => {
  try {
    const { limit, status, userId, sessionId } = req.query as any;

    let jobs = await getAllJobs(limit);

    // Optional: Nach Status filtern
    if (status) {
      jobs = jobs.filter(job => job.status === status);
    }
    
    // Optional: Nach User filtern (nur eigene Jobs)
    if (userId) {
      jobs = jobs.filter(job => job.userId === userId);
    }
    
    // Optional: Nach Session filtern
    if (sessionId) {
      jobs = jobs.filter(job => job.sessionId === sessionId);
    }

    const response: JobsListResponse = {
      success: true,
      data: jobs,
      count: jobs.length
    };

    res.json(response);
  } catch (error) {
    console.error('Fehler beim Abrufen der Jobs:', error);
    const response: JobResponse = {
      success: false,
      error: 'Interner Serverfehler beim Abrufen der Jobs'
    };
    res.status(500).json(response);
  }
});

// DELETE /api/jobs/:id - Job löschen (nur pending oder failed)
router.delete(
  '/:id',
  validateRequestCombined({ params: jobIdParamSchema }),
  async (req: Request, res: Response) => {

    try {
      const jobId = req.params.id;
      const job = await getJobStatus(jobId);

      if (!job) {
        return res.status(404).json({
          success: false,
          error: `Job mit ID ${jobId} nicht gefunden`
        });
      }

      // Nur pending oder failed Jobs können gelöscht werden
      if (job.status !== 'pending' && job.status !== 'failed') {
        return res.status(400).json({
          success: false,
          error: 'Nur pending oder failed Jobs können gelöscht werden'
        });
      }

      await updateJobStatus(jobId, 'cancelled');

      res.json({
        success: true,
        message: `Job ${jobId} wurde gelöscht`
      });
    } catch (error) {
      logger.error('Fehler beim Löschen des Jobs', { error, jobId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Interner Serverfehler beim Löschen des Jobs'
      });
    }
  }
);

// POST /api/jobs/:id/retry - Job wiederholen
router.post(
  '/:id/retry',
  validateRequestCombined({ params: jobIdParamSchema }),
  async (req: Request, res: Response) => {

    try {
      const jobId = req.params.id;
      const job = await getJobStatus(jobId);

      if (!job) {
        return res.status(404).json({
          success: false,
          error: `Job mit ID ${jobId} nicht gefunden`
        });
      }

      // Nur failed Jobs können wiederholt werden
      if (job.status !== 'failed') {
        return res.status(400).json({
          success: false,
          error: 'Nur failed Jobs können wiederholt werden'
        });
      }

      // Neuen Job mit gleichen Daten erstellen
      const newJob = await createAgentJob({
        prompt: job.prompt,
        userId: job.userId,
        sessionId: job.sessionId
      });

      // Alten Job als cancelled markieren
      await updateJobStatus(jobId, 'cancelled');

      broadcastJobUpdate(newJob);

      res.json({
        success: true,
        data: newJob,
        message: `Job wurde als ${newJob.id} neu erstellt`
      });
    } catch (error) {
      logger.error('Fehler beim Wiederholen des Jobs', { error, jobId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Interner Serverfehler beim Wiederholen des Jobs'
      });
    }
  }
);

export default router;
