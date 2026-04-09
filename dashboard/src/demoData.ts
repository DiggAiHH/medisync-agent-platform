import type { Job, JobStats } from './types';

export const demoJobs: Job[] = [
  {
    id: 'job-demo-001',
    userId: 'praxis-nord',
    prompt: 'Erstelle eine priorisierte Einsatzplanung fuer eingehende Patientenanfragen.',
    status: 'completed',
    result:
      'Die Anfragen wurden nach Dringlichkeit, Wartezeit und Ressourcenbedarf priorisiert. Zwei Faelle wurden fuer eine direkte Rueckmeldung markiert.',
    createdAt: '2026-04-09T08:10:00.000Z',
    updatedAt: '2026-04-09T08:12:30.000Z',
  },
  {
    id: 'job-demo-002',
    userId: 'mvz-sued',
    prompt: 'Analysiere die heutigen Rueckstaende und schlage einen Ablauf fuer das Team vor.',
    status: 'processing',
    result:
      'Eingehende Auswertung: Die Terminlage wird gegen freie Teamkapazitaeten abgeglichen. Ein angepasster Ablaufplan wird vorbereitet.',
    createdAt: '2026-04-09T08:40:00.000Z',
    updatedAt: '2026-04-09T08:43:10.000Z',
  },
  {
    id: 'job-demo-003',
    userId: 'labor-west',
    prompt: 'Fuehre einen Qualitaetscheck fuer die letzten Import-Jobs durch.',
    status: 'failed',
    error:
      'Der Datenimport wurde gestoppt, weil ein Pflichtfeld im eingehenden CSV-Format gefehlt hat.',
    createdAt: '2026-04-09T07:55:00.000Z',
    updatedAt: '2026-04-09T08:01:45.000Z',
  },
  {
    id: 'job-demo-004',
    userId: 'klinik-mitte',
    prompt: 'Bereite eine Tageszusammenfassung fuer das Operative Team vor.',
    status: 'pending',
    createdAt: '2026-04-09T08:48:00.000Z',
    updatedAt: '2026-04-09T08:48:00.000Z',
  },
];

export const demoStats: JobStats = {
  total: demoJobs.length,
  active: demoJobs.filter((job) => job.status === 'processing').length,
  completed: demoJobs.filter((job) => job.status === 'completed').length,
  failed: demoJobs.filter((job) => job.status === 'failed').length,
};

export function getDemoJob(id: string): Job | undefined {
  return demoJobs.find((job) => job.id === id);
}

export function getDemoStreamContent(id: string): string {
  if (id === 'job-demo-002') {
    return [
      'Stream-Session gestartet',
      '',
      '1. Backlog nach Wartezeit gruppiert.',
      '2. Rueckfragen fuer dringende Faelle markiert.',
      '3. Vorschlag fuer Team-Aufteilung wird erzeugt...',
    ].join('\n');
  }

  const job = getDemoJob(id);
  return job?.result || job?.error || 'Keine Stream-Daten verfuegbar.';
}