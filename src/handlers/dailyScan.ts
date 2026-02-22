import { getAppConfig, saveAppConfig } from '../services/configService';
import { scanWorklogs } from '../services/worklogService';
import { sendWorklogReminderEmail } from '../services/emailService';
import { format } from 'date-fns';

export async function dailyScanHandler(event: any) {
  console.log('Daily worklog scan triggered at:', new Date().toISOString());
  
  try {
    // Load configuration
    const config = await getAppConfig();
    if (!config) {
      throw new Error('App configuration not found. Please configure the app in admin settings.');
    }

    if (!config.enabled) {
      console.log('Worklog reminder is disabled. Skipping scan.');
      return { status: 'skipped', reason: 'disabled' };
    }

    if (!config.emailRecipients || config.emailRecipients.length === 0) {
      console.log('No email recipients configured. Skipping scan.');
      return { status: 'skipped', reason: 'no_recipients' };
    }

    // Perform worklog scan
    const scanResult = await scanWorklogs(config);
    
    // Send email if users found below threshold
    if (scanResult.usersBelowThreshold.length > 0) {
      await sendWorklogReminderEmail(config.emailRecipients, {
        executionDate: scanResult.executionDate,
        threshold: scanResult.threshold,
        users: scanResult.usersBelowThreshold
      });
    }

    // Update last execution status
    await saveAppConfig({
      ...config,
      lastExecution: {
        date: scanResult.executionDate,
        usersFound: scanResult.usersBelowThreshold.length,
        status: 'success'
      }
    });

    console.log(`Scan completed. Found ${scanResult.usersBelowThreshold.length} users below threshold.`);
    
    return {
      status: 'success',
      usersFound: scanResult.usersBelowThreshold.length,
      totalScanned: scanResult.totalUsersScanned
    };
  } catch (error: any) {
    console.error('Error during daily worklog scan:', error);
    
    // Try to update config with error status
    try {
      const config = await getAppConfig();
      if (config) {
        await saveAppConfig({
          ...config,
          lastExecution: {
            date: format(new Date(), 'yyyy-MM-dd'),
            usersFound: 0,
            status: 'error',
            errorMessage: error.message
          }
        });
      }
    } catch (configError) {
      console.error('Failed to update config with error status:', configError);
    }

    return {
      status: 'error',
      error: error.message
    };
  }
}