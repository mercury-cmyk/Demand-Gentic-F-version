import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const toEmail = process.argv[2];

  if (!toEmail) {
    console.error('Please provide the recipient email address as an argument.');
    console.error('Usage: npx tsx scripts/send-argyle-email.ts ');
    process.exit(1);
  }

  // SMTP Configuration
  const smtpConfig = {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  };

  // Check if SMTP is configured
  if (!smtpConfig.host || !smtpConfig.auth.user || !smtpConfig.auth.pass) {
    console.error('SMTP configuration missing in .env file.');
    console.error('Please ensure SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS are set.');
    
    // Fallback check for Mailgun variables if user wants to use those with some other transport
    if (process.env.MAILGUN_API_KEY) {
        console.log('Detected MAILGUN_API_KEY. If you intended to use Mailgun SMTP, please set:');
        console.log('SMTP_HOST=smtp.mailgun.org');
        console.log('SMTP_USER=postmaster@' + process.env.MAILGUN_DOMAIN);
        console.log('SMTP_PASS=');
    }
    process.exit(1);
  }

  // Read the template
  const templatePath = path.join(__dirname, '../templates/emails/argyle-demo.html');
  let htmlContent: string;

  try {
    htmlContent = fs.readFileSync(templatePath, 'utf-8');
  } catch (err) {
    console.error('Error reading template file:', err);
    process.exit(1);
  }

  // Create transporter
  const transporter = nodemailer.createTransport(smtpConfig);

  // Send email
  try {
    console.log(`Sending email to ${toEmail}...`);
    
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || `"DemandGentic AI" `,
      to: toEmail,
      subject: 'DemandGentic AI Demo Access - For Paul Price',
      html: htmlContent,
      text: `Hi Paul, I have created a demo campaign for you to review... (Please view HTML version)` // Fallback text
    });

    console.log('Message sent: %s', info.messageId);
    console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
  } catch (error) {
    console.error('Error sending email:', error);
    process.exit(1);
  }
}

main();