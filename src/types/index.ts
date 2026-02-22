export interface AppConfig {
    thresholdHours: number;
    scanTime: string; // HH:mm format
    excludedUsers: string[]; // accountIds
    emailRecipients: string[];
    enabled: boolean;
    lastExecution?: {
      date: string;
      usersFound: number;
      status: 'success' | 'error';
      errorMessage?: string;
    };
  }
  
  export interface LowWorklogUser {
    accountId: string;
    name: string;
    email: string;
    totalLoggedHours: number;
  }
  
  export interface WorklogScanResult {
    executionDate: string;
    threshold: number;
    usersBelowThreshold: LowWorklogUser[];
    totalUsersScanned: number;
    executionStatus: 'success' | 'error';
    errorMessage?: string;
  }