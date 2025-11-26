import { initDB } from './db/db';

export const initializeDatabase = async (useInMemory: boolean = false) => {
  try {
    await initDB(useInMemory);
    console.log('Database initialized with fresh tables');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
};
