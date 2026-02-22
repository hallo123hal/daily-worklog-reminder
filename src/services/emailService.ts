import sgMail from '@sendgrid/mail';
import { getSendGridApiKey } from './configService';

interface LowWorklogUser {
  name: string;
  email: string;
  totalLoggedHours: number;
}

interface EmailData {
  executionDate: string;
  threshold: number;
  users: LowWorklogUser[];
}

export async function sendWorklogReminderEmail(
  recipients: string[],
  data: EmailData
): Promise<void> {
  const apiKey = await getSendGridApiKey();
  
  if (!apiKey) {
    throw new Error('SendGrid API key not configured. Please set it in admin settings.');
  }

  // Set SendGrid API key
  sgMail.setApiKey(apiKey);

  // Build email content
  const subject = `Daily Worklog Reminder - ${data.executionDate}`;
  
  const userListHtml = data.users.length > 0
    ? data.users.map(user => 
        `<tr>
          <td>${user.name}</td>
          <td>${user.email}</td>
          <td>${user.totalLoggedHours.toFixed(2)} hours</td>
        </tr>`
      ).join('')
    : '<tr><td colspan="3">No users below threshold</td></tr>';

  const htmlContent = `
    <html>
      <body style="font-family: Arial, sans-serif;">
        <h2>Daily Worklog Reminder Report</h2>
        <p><strong>Execution Date:</strong> ${data.executionDate}</p>
        <p><strong>Threshold:</strong> ${data.threshold} hours</p>
        
        <h3>Users Below Threshold:</h3>
        <table border="1" cellpadding="10" cellspacing="0" style="border-collapse: collapse;">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Total Logged Hours</th>
            </tr>
          </thead>
          <tbody>
            ${userListHtml}
          </tbody>
        </table>
      </body>
    </html>
  `;

  const textContent = `
Daily Worklog Reminder Report
Execution Date: ${data.executionDate}
Threshold: ${data.threshold} hours

Users Below Threshold:
${data.users.map(user => 
  `- ${user.name} (${user.email}): ${user.totalLoggedHours.toFixed(2)} hours`
).join('\n')}
  `;

  // Send email to all recipients
  const messages = recipients.map(recipient => ({
    to: recipient,
    from: {
      email: 'tungns@biplus.com.vn',
      name: 'Jira Worklog Reminder'
    },
    subject,
    text: textContent,
    html: htmlContent
  }));

  try {
    await sgMail.send(messages);
    console.log(`Successfully sent worklog reminder emails to ${recipients.length} recipients`);
  } catch (error: any) {
    console.error('Error sending email:', error);
    if (error.response) {
      console.error('SendGrid error details:', error.response.body);
    }
    throw error;
  }
}