import { initDB } from './db/db';

export const initializeDatabase = async (useInMemory: boolean = false) => {
  try {
    await initDB(useInMemory);
    console.log('Datenbank mit neuen Tabellen initialisiert');
  } catch (error) {
    console.error('Fehler beim Initialisieren der Datenbank:', error);
    process.exit(1);
  }
};
