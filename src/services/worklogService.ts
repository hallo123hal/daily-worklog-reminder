import api, { route } from '@forge/api';
import { AppConfig } from './configService';
import { WorklogScanResult, LowWorklogUser } from '../types';
import { getTodayDateString, secondsToHours } from '../utils/dateUtils';

/**
 * Scans worklogs for all active users for today and identifies users below the threshold
 * 
 * This function:
 * 1. Fetches all active users in the Jira instance
 * 2. For each user, fetches their worklogs for today
 * 3. Aggregates total time spent per user
 * 4. Filters users whose total logged time is below the configured threshold
 * 5. Returns a summary with users below threshold
 * 
 * @param config - Application configuration containing threshold and excluded users
 * @returns WorklogScanResult with users below threshold
 */
export async function scanWorklogs(config: AppConfig): Promise<WorklogScanResult> {
  const executionDate = getTodayDateString();
  const threshold = config.thresholdHours;
  
  console.log(`Starting worklog scan for ${executionDate} with threshold: ${threshold} hours`);
  
  try {
    // Step 1: Fetch all active users
    // We use the Jira User Search API to get all users
    // Note: This requires read:jira-user permission which we have in manifest
    const users = await fetchAllActiveUsers();
    console.log(`Found ${users.length} active users to scan`);
    
    // Step 2: Filter out excluded users
    const usersToScan = users.filter(user => 
      !config.excludedUsers.includes(user.accountId)
    );
    console.log(`Scanning ${usersToScan.length} users (${users.length - usersToScan.length} excluded)`);
    
    // Step 3: Fetch worklogs for each user and aggregate time
    const userWorklogMap = new Map<string, number>(); // accountId -> total hours
    
    // Process users in batches to respect rate limits
    const batchSize = 10; // Process 10 users at a time
    for (let i = 0; i < usersToScan.length; i += batchSize) {
      const batch = usersToScan.slice(i, i + batchSize);
      
      // Fetch worklogs for all users in this batch in parallel
      const batchPromises = batch.map(async (user) => {
        try {
          const totalSeconds = await fetchUserWorklogForToday(user.accountId);
          const totalHours = secondsToHours(totalSeconds);
          userWorklogMap.set(user.accountId, totalHours);
          return { accountId: user.accountId, hours: totalHours, user };
        } catch (error: any) {
          console.error(`Error fetching worklog for user ${user.accountId}:`, error.message);
          // If we can't fetch worklog, assume 0 hours
          userWorklogMap.set(user.accountId, 0);
          return { accountId: user.accountId, hours: 0, user };
        }
      });
      
      await Promise.all(batchPromises);
      
      // Small delay between batches to respect rate limits
      if (i + batchSize < usersToScan.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Step 4: Identify users below threshold
    const usersBelowThreshold: LowWorklogUser[] = [];
    
    for (const user of usersToScan) {
      const totalHours = userWorklogMap.get(user.accountId) || 0;
      
      if (totalHours < threshold) {
        usersBelowThreshold.push({
          accountId: user.accountId,
          name: user.displayName || user.accountId,
          email: user.emailAddress || '',
          totalLoggedHours: totalHours
        });
      }
    }
    
    console.log(`Scan completed. Found ${usersBelowThreshold.length} users below threshold out of ${usersToScan.length} scanned`);
    
    return {
      executionDate,
      threshold,
      usersBelowThreshold,
      totalUsersScanned: usersToScan.length,
      executionStatus: 'success'
    };
    
  } catch (error: any) {
    console.error('Error during worklog scan:', error);
    return {
      executionDate,
      threshold,
      usersBelowThreshold: [],
      totalUsersScanned: 0,
      executionStatus: 'error',
      errorMessage: error.message
    };
  }
}

/**
 * Fetches all active users from Jira
 * Uses pagination to handle large user lists
 * 
 * @returns Array of user objects with accountId, displayName, and emailAddress
 */
async function fetchAllActiveUsers(): Promise<Array<{accountId: string, displayName?: string, emailAddress?: string}>> {
  const users: Array<{accountId: string, displayName?: string, emailAddress?: string}> = [];
  let startAt = 0;
  const maxResults = 50; // Jira API default max results per page
  
  while (true) {
    try {
      // Use asApp() since this is called from a scheduled trigger (no user context)
      // The User Search API endpoint: /rest/api/3/users/search
      // Build URL with query parameters using route helper
      const userSearchUrl = route`/rest/api/3/users/search?startAt=${startAt}&maxResults=${maxResults}&active=true`;
      const response = await api.asApp().requestJira(userSearchUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch users: ${response.status} ${errorText}`);
      }
      
      const userBatch = await response.json();
      
      if (userBatch.length === 0) {
        break; // No more users
      }
      
      // Add users to our list
      users.push(...userBatch.map((user: any) => ({
        accountId: user.accountId,
        displayName: user.displayName,
        emailAddress: user.emailAddress
      })));
      
      // If we got fewer results than maxResults, we've reached the end
      if (userBatch.length < maxResults) {
        break;
      }
      
      startAt += maxResults;
      
    } catch (error: any) {
      console.error(`Error fetching users batch (startAt: ${startAt}):`, error);
      // If we've already fetched some users, return what we have
      // Otherwise, throw the error
      if (users.length === 0) {
        throw error;
      }
      break;
    }
  }
  
  return users;
}

/**
 * Fetches total worklog time for a specific user for today
 * 
 * Strategy: Since Jira doesn't have a direct API to get worklogs by user and date,
 * we search for issues updated today and then check their worklogs.
 * This is more reliable than trying to use JQL with worklogDate (which may not be supported).
 * 
 * @param accountId - The user's account ID
 * @returns Total time spent in seconds for today
 */
async function fetchUserWorklogForToday(accountId: string): Promise<number> {
  try {
    const today = getTodayDateString();
    const todayStart = `${today}T00:00:00.000+0000`;
    
    // Strategy: Search for issues updated today (worklogs update the issue's updated date)
    // Then fetch worklogs for those issues and filter by author and date
    // This is more reliable than using worklogDate in JQL which may not be supported
    
    // Search for issues updated today - this will catch issues with recent worklogs
    // We'll then check the worklogs of these issues
    const jql = `updated >= "${todayStart}"`;
    
    let totalSeconds = 0;
    let startAt = 0;
    const maxResults = 50;
    const processedIssues = new Set<string>(); // Track issues we've already processed
    
    // Search for recently updated issues and check their worklogs
    while (true) {
      try {
        // Use the new /rest/api/3/search/jql endpoint (POST method)
        // The old /rest/api/3/search GET endpoint has been deprecated
        const searchUrl = route`/rest/api/3/search/jql`;
        const requestBody = {
          jql: jql,
          startAt: startAt,
          maxResults: maxResults,
          fields: ['key']
        };
        const searchResponse = await api.asApp().requestJira(searchUrl, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });
        
        if (!searchResponse.ok) {
          const errorText = await searchResponse.text();
          console.warn(`Issue search failed for user ${accountId}: ${errorText}`);
          break;
        }
        
        const searchData = await searchResponse.json();
        const issues = searchData.issues || [];
        
        if (issues.length === 0) {
          break;
        }
        
        // Process worklogs for each issue
        const worklogPromises = issues.map(async (issue: any) => {
          const issueKey = issue.key;
          
          // Skip if we've already processed this issue
          if (processedIssues.has(issueKey)) {
            return 0;
          }
          processedIssues.add(issueKey);
          
          try {
            // Fetch worklogs for this issue using route helper
            const worklogUrl = route`/rest/api/3/issue/${issueKey}/worklog`;
            const worklogResponse = await api.asApp().requestJira(worklogUrl, {
              method: 'GET',
              headers: {
                'Accept': 'application/json'
              }
            });
            
            if (!worklogResponse.ok) {
              return 0;
            }
            
            const worklogData = await worklogResponse.json();
            const worklogs = worklogData.worklogs || [];
            
            // Filter worklogs by author and date, sum up time
            let issueTotalSeconds = 0;
            for (const worklog of worklogs) {
              const worklogDate = worklog.started?.substring(0, 10); // Get YYYY-MM-DD part
              if (worklog.author.accountId === accountId && worklogDate === today) {
                issueTotalSeconds += worklog.timeSpentSeconds || 0;
              }
            }
            
            return issueTotalSeconds;
          } catch (error) {
            // Continue with next issue if one fails
            console.warn(`Error fetching worklog for issue ${issueKey}:`, error);
            return 0;
          }
        });
        
        const batchResults = await Promise.all(worklogPromises);
        totalSeconds += batchResults.reduce((sum: number, seconds: number) => sum + seconds, 0);
        
        // If we got fewer results than maxResults, we've reached the end
        if (issues.length < maxResults || startAt + maxResults >= (searchData.total || 0)) {
          break;
        }
        
        startAt += maxResults;
        
        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 50));
        
      } catch (error: any) {
        console.error(`Error in worklog search batch (startAt: ${startAt}):`, error);
        // If we've processed some issues, return what we have
        break;
      }
    }
    
    return totalSeconds;
    
  } catch (error: any) {
    console.error(`Error fetching worklog for user ${accountId}:`, error);
    // Return 0 if we can't fetch worklog (better than failing the entire scan)
    return 0;
  }
}

