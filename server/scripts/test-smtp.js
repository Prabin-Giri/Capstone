const nodemailer = require('nodemailer');
require('dotenv').config();

async function testSmtp() {
  const targetEmail = process.argv[2] || process.env.SMTP_USER;
  if (!targetEmail) {
    console.error('Usage: node test-smtp.js <recipient-email>');
    process.exit(1);
  }

  console.log('--- SMTP Diagnostic Tool ---');
  console.log('Host:', process.env.SMTP_HOST || 'smtp.gmail.com');
  console.log('Port:', process.env.SMTP_PORT || '587');
  console.log('User:', process.env.SMTP_USER);
  console.log('Secure:', process.env.SMTP_SECURE === 'true');
  console.log('----------------------------');

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    logger: true,
    debug: true,
  });

  try {
    console.log('Verifying SMTP connection...');
    await transporter.verify();
    console.log('✓ Connection verified successfully.');

    console.log(`Sending test email to: ${targetEmail}...`);
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || `Agnos <${process.env.SMTP_USER}>`,
      to: targetEmail,
      subject: 'Agnos SMTP Diagnostic Test',
      text: 'This is a test email from the Agnos diagnostic script.',
      html: '<b>This is a test email from the Agnos diagnostic script.</b>',
    });

    console.log('✓ Email sent successfully!');
    console.log('Response:', info.response);
    console.log('Message ID:', info.messageId);
  } catch (err) {
    console.error('✗ SMTP Error:', err.message);
    if (err.code === 'EAUTH') {
      console.error('HINT: Authentication failed. If using Gmail, make sure you have generated an APP PASSWORD.');
    } else if (err.code === 'ESOCKET') {
      console.error('HINT: Socket error. Check host, port, and security settings.');
    }
    console.error('Full Error:', err);
  }
}

testSmtp();
