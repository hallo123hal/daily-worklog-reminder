import { handler as resolverHandler } from './resolvers';
import { dailyScanHandler } from './handlers/dailyScan';

// Export resolver handler for admin page
export const handler = resolverHandler;

// Export daily scan handler for scheduled trigger
export { dailyScanHandler };

// Test function (can be called manually for testing)
export async function testHandler() {
  console.log('Test handler called at:', new Date().toISOString());
  return { status: 'ok', message: 'Test successful' };
}