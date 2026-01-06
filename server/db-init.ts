import { storage } from './storage';
import { hashPassword } from './auth';

/**
 * Initialize database with default admin user for production
 * Only runs if no users exist in the database
 */
export async function initializeDatabase() {
  try {
    console.log('[DB-INIT] Checking database initialization status...');
    
    // Check if any users exist
    const users = await storage.getUsers();
    
    if (users.length > 0) {
      console.log('[DB-INIT] Database already initialized with', users.length, 'users');
      return;
    }

    console.log('[DB-INIT] No users found. Initializing with default admin user...');

    // Get admin credentials from environment or use defaults
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@crm.local';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
    const adminFirstName = process.env.ADMIN_FIRST_NAME || 'Admin';
    const adminLastName = process.env.ADMIN_LAST_NAME || 'User';

    // Hash password
    const hashedPassword = await hashPassword(adminPassword);

    // Create admin user
    const adminUser = await storage.createUser({
      username: adminUsername,
      email: adminEmail,
      password: hashedPassword,
      role: 'admin',
      firstName: adminFirstName,
      lastName: adminLastName,
    });

    // Assign admin role in multi-role system
    await storage.assignUserRole(adminUser.id, 'admin', adminUser.id);

    console.log('[DB-INIT] ✅ Default admin user created successfully');
    console.log('[DB-INIT] Username:', adminUsername);
    console.log('[DB-INIT] Email:', adminEmail);
    console.log('[DB-INIT] Use the credentials you configured to log in');

  } catch (error) {
    console.error('[DB-INIT] ❌ Failed to initialize database:', error);
    // Don't throw - let the app continue even if init fails
  }
}
