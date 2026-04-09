/**
 * German Language Configuration for Audio AI.
 * Medical vocabulary hints and prompts for Whisper STT.
 */

/**
 * Initial prompt for Whisper to improve German medical transcription accuracy.
 * Contains common medical terms, drug names, and practice-specific vocabulary.
 */
export const GERMAN_MEDICAL_WHISPER_PROMPT = [
  // Common greetings and practice context
  'Guten Tag, hier ist die Arztpraxis.',
  'Ich hätte gerne einen Termin.',
  'Ich brauche ein Rezept.',

  // Medical terms
  'Überweisung, Befund, Laborwerte, Blutbild, Blutzucker, Blutdruck,',
  'Cholesterin, Schilddrüse, EKG, Ultraschall, Röntgen, MRT, CT,',
  'Impfung, Vorsorgeuntersuchung, Gesundheitscheck,',

  // Common symptoms
  'Kopfschmerzen, Rückenschmerzen, Fieber, Husten, Schnupfen, Übelkeit,',
  'Schwindel, Atemnot, Brustschmerzen, Bauchschmerzen, Gelenkschmerzen,',
  'Müdigkeit, Schlafstörungen, Hautausschlag,',

  // Common medications
  'Ibuprofen, Paracetamol, Aspirin, Metformin, Ramipril, Amlodipin,',
  'L-Thyroxin, Pantoprazol, Omeprazol, Simvastatin, Metoprolol,',
  'Bisoprolol, Candesartan, Torasemid,',

  // Insurance and administrative
  'Versichertenkarte, Gesundheitskarte, Krankenkasse, Arbeitsunfähigkeit,',
  'Krankmeldung, AU-Bescheinigung, Privatpatient, Kassenpatient,',

  // ICD-10 context
  'Diagnose, ICD-10, Abrechnungsziffer,',

  // Practice-specific
  'Sprechstunde, Wartezeit, Hausbesuch, Notdienst, Bereitschaftsdienst,',
].join(' ');

/**
 * Get language-specific Whisper configuration.
 */
export function getGermanWhisperConfig(): {
  language: string;
  initialPrompt: string;
} {
  return {
    language: 'de',
    initialPrompt: GERMAN_MEDICAL_WHISPER_PROMPT,
  };
}

/**
 * Common German phone conversation patterns for intent detection.
 */
export const GERMAN_PHONE_PATTERNS = {
  APPOINTMENT: [
    'termin', 'termine', 'anmelden', 'sprechstunde', 'vorbeikommen',
    'wann kann ich kommen', 'nächster freier',
  ],
  PRESCRIPTION: [
    'rezept', 'verschreibung', 'medikament', 'tabletten', 'nachbestellen',
    'folgerezept', 'wiederholungsrezept',
  ],
  REFERRAL: [
    'überweisung', 'facharzt', 'spezialist', 'weiterleitung',
  ],
  RESULTS: [
    'befund', 'ergebnis', 'laborwerte', 'blutbild', 'auswertung',
    'ergebnisse', 'blutwerte',
  ],
  EMERGENCY: [
    'notfall', 'sofort', 'dringend', 'starke schmerzen', 'atemnot',
    'brustschmerzen', 'bewusstlos', 'krankenwagen', 'blutung',
  ],
  SICK_NOTE: [
    'krankmeldung', 'arbeitsunfähigkeit', 'krankschreibung', 'au-bescheinigung',
    'krank geschrieben',
  ],
} as const;
