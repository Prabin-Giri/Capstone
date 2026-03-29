const crypto = require('crypto');
const nodemailer = require('nodemailer');

let _smtpTransporter = null;
const emailLogStore = [];

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function generateOTP() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function hasPlaceholderSmtpConfig() {
    return !process.env.SMTP_USER
        || !process.env.SMTP_PASS
        || process.env.SMTP_USER.includes('your-email@gmail.com')
        || process.env.SMTP_PASS.includes('your-app-password');
}

function hasResendConfig() {
    return !!(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim());
}

function getEmailProvider() {
    const configuredProvider = (process.env.EMAIL_PROVIDER || 'auto').trim().toLowerCase();

    if (configuredProvider === 'auto') {
        if (hasResendConfig()) return 'resend';
        if (!hasPlaceholderSmtpConfig()) return 'smtp';
        return process.env.NODE_ENV === 'production' ? 'unconfigured' : 'log';
    }

    if (configuredProvider === 'resend' || configuredProvider === 'smtp' || configuredProvider === 'log') {
        return configuredProvider;
    }

    const error = new Error(`Unsupported EMAIL_PROVIDER "${configuredProvider}". Use "auto", "resend", "smtp", or "log".`);
    error.code = 'EEMAILPROVIDER';
    throw error;
}

function getFromAddress(provider) {
    const genericFrom = (process.env.EMAIL_FROM || '').trim();
    if (genericFrom) {
        return genericFrom;
    }

    if (provider === 'resend') {
        if (process.env.NODE_ENV !== 'production') {
            return 'AutoGrade <onboarding@resend.dev>';
        }
        const error = new Error('EMAIL_FROM is required when using Resend in production.');
        error.code = 'ERESENDFROM';
        throw error;
    }

    const configuredFrom = (process.env.SMTP_FROM || '').trim();
    if (configuredFrom && !configuredFrom.includes('your-email@gmail.com')) {
        return configuredFrom;
    }

    return process.env.SMTP_USER ? `"AutoGrade" <${process.env.SMTP_USER}>` : '"AutoGrade" <no-reply@localhost>';
}

function normalizeMailError(error) {
    const wrapped = new Error('Failed to send email.');
    wrapped.code = error && error.code;

    if (wrapped.code === 'EEMAILPROVIDER') {
        wrapped.message = error.message;
        return wrapped;
    }
    if (wrapped.code === 'ERESENDFROM') {
        wrapped.message = 'EMAIL_FROM is required when using Resend.';
        return wrapped;
    }
    if (wrapped.code === 'ERESENDCONFIG') {
        wrapped.message = 'RESEND_API_KEY is missing. Set RESEND_API_KEY and EMAIL_FROM for deployment.';
        return wrapped;
    }
    if (wrapped.code === 'ERESENDAPI') {
        wrapped.message = error.message || 'Resend API rejected the email request.';
        return wrapped;
    }
    if (wrapped.code === 'EPLACEHOLDER') {
        wrapped.message = 'SMTP credentials are still placeholders in .env. Set real SMTP_* values or use RESEND_API_KEY.';
        return wrapped;
    }
    if (wrapped.code === 'EEMAILCONFIG') {
        wrapped.message = error.message || 'No email provider is configured.';
        return wrapped;
    }
    if (wrapped.code === 'EAUTH') {
        wrapped.message = 'SMTP authentication failed. Update SMTP_USER and SMTP_PASS in .env.';
        return wrapped;
    }
    if (wrapped.code === 'ENOTFOUND' || wrapped.code === 'EDNS') {
        wrapped.message = 'SMTP host could not be resolved. Check SMTP_HOST in .env.';
        return wrapped;
    }
    if (wrapped.code === 'ECONNREFUSED') {
        wrapped.message = 'SMTP server refused the connection. Check SMTP_HOST, SMTP_PORT, and network access.';
        return wrapped;
    }
    if (wrapped.code === 'ETIMEDOUT') {
        wrapped.message = 'SMTP connection timed out. Check network access or firewall settings.';
        return wrapped;
    }

    wrapped.message = error && error.message ? `Failed to send email: ${error.message}` : 'Failed to send email.';
    return wrapped;
}

function recordEmailLog({ provider, from, to, subject, debug }) {
    emailLogStore.unshift({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        provider,
        from,
        to: String(to || '').trim().toLowerCase(),
        subject,
        otp: debug && debug.otp ? String(debug.otp) : null,
        link: debug && debug.link ? String(debug.link) : null,
        createdAt: new Date().toISOString(),
    });

    if (emailLogStore.length > 25) {
        emailLogStore.length = 25;
    }
}

function getRecentEmailLogs(email) {
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const logs = normalizedEmail
        ? emailLogStore.filter((entry) => entry.to === normalizedEmail)
        : emailLogStore;

    return logs.slice(0, 10);
}

function getSmtpTransporter() {
    if (hasPlaceholderSmtpConfig()) {
        const error = new Error('SMTP credentials are still placeholders in .env. Set real SMTP_* values or use RESEND_API_KEY.');
        error.code = 'EPLACEHOLDER';
        throw error;
    }

    if (!_smtpTransporter) {
        _smtpTransporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '587', 10),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
            // Enable detailed logging for production diagnostics
            logger: true,
            debug: true,
        });
    }

    return _smtpTransporter;
}

async function sendViaSmtp({ from, to, subject, html }) {
    const transporter = getSmtpTransporter();
    await transporter.sendMail({ from, to, subject, html });
    return { provider: 'smtp' };
}

async function sendViaResend({ from, to, subject, html }) {
    if (!hasResendConfig()) {
        const error = new Error('RESEND_API_KEY is missing. Set RESEND_API_KEY and EMAIL_FROM for deployment.');
        error.code = 'ERESENDCONFIG';
        throw error;
    }

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from,
            to: [to],
            subject,
            html,
        }),
    });

    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = payload && payload.message ? payload.message : `Resend API request failed with status ${response.status}.`;
        const error = new Error(message);
        error.code = 'ERESENDAPI';
        throw error;
    }

    return { provider: 'resend' };
}

async function sendViaLog({ to, subject, debug }) {
    console.log('\n[AutoGrade email:log]');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    if (debug && debug.otp) console.log(`OTP: ${debug.otp}`);
    if (debug && debug.link) console.log(`Link: ${debug.link}`);
    console.log('[AutoGrade email:log] End\n');
    return { provider: 'log' };
}

async function deliverEmail({ to, subject, html, debug }) {
    const provider = getEmailProvider();
    const from = getFromAddress(provider);

    try {
        let result;
        if (provider === 'smtp') {
            result = await sendViaSmtp({ from, to, subject, html });
        } else if (provider === 'resend') {
            result = await sendViaResend({ from, to, subject, html });
        } else if (provider === 'log') {
            result = await sendViaLog({ to, subject, debug });
        } else {
            const error = new Error('No email provider is configured. Set RESEND_API_KEY and EMAIL_FROM for deploy, or SMTP_* credentials.');
            error.code = 'EEMAILCONFIG';
            throw error;
        }

        recordEmailLog({
            provider: result.provider,
            from,
            to,
            subject,
            debug,
        });

        return result;
    } catch (error) {
        throw normalizeMailError(error);
    }
}

async function sendVerificationEmail(toEmail, userName, token, otp) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const verifyLink = `${frontendUrl}/verify-email?token=${token}`;

    return deliverEmail({
        to: toEmail,
        subject: 'Verify Your Email - AutoGrade',
        debug: { otp, link: verifyLink },
        html: `
            <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 20px;">
                <div style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border: 1px solid #e1e4e8;">
                    <div style="background: linear-gradient(135deg, #840029 0%, #a00032 100%); padding: 32px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; text-transform: uppercase;">AutoGrade</h1>
                        <div style="height: 3px; width: 40px; background-color: #FDB913; margin: 12px auto 0; border-radius: 2px;"></div>
                    </div>
                    
                    <div style="padding: 40px 32px;">
                        <h2 style="color: #1a1d23; margin: 0 0 16px; font-size: 22px; font-weight: 700;">Verify your email address</h2>
                        <p style="color: #4b5563; line-height: 1.6; margin: 0 0 24px; font-size: 16px;">Hi ${userName},</p>
                        <p style="color: #4b5563; line-height: 1.6; margin: 0 0 32px; font-size: 16px;">Welcome to the next generation of automated grading. To get started, please verify your email address using the code or link below.</p>

                        <div style="background-color: #f3f4f6; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 32px; border: 1px solid #e5e7eb;">
                            <p style="color: #6b7280; font-size: 12px; font-weight: 700; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 1.5px;">Verification Code</p>
                            <p style="color: #840029; font-size: 36px; font-weight: 800; margin: 0; letter-spacing: 12px; font-family: 'Courier New', Courier, monospace;">${otp}</p>
                        </div>

                        <div style="text-align: center;">
                            <a href="${verifyLink}" style="display: inline-block; background-color: #840029; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 6px rgba(132, 0, 41, 0.2); transition: background-color 0.2s;">Verify Email Address</a>
                            <p style="color: #9ca3af; font-size: 14px; margin-top: 24px;">Button not working? Use the link below.</p>
                        </div>
                    </div>

                    <div style="padding: 24px 32px; background-color: #fcfcfc; border-top: 1px solid #f0f0f0; text-align: center;">
                        <p style="color: #9ca3af; font-size: 13px; line-height: 1.5; margin: 0;">This code expires in 10 minutes. If you didn't create an account, you can safely ignore this email.</p>
                        <p style="margin-top: 16px; word-break: break-all; font-size: 12px; color: #840029; opacity: 0.7;">
                            <a href="${verifyLink}" style="color: #840029; text-decoration: underline;">${verifyLink}</a>
                        </p>
                    </div>
                </div>
                <div style="text-align: center; margin-top: 20px;">
                    <p style="color: #9ca3af; font-size: 12px;">&copy; 2026 AutoGrade. All rights reserved.</p>
                </div>
            </div>
        `,
    });
}

async function sendPasswordResetEmail(toEmail, userName, token) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;

    return deliverEmail({
        to: toEmail,
        subject: 'Password Reset Request - AutoGrade',
        debug: { link: resetLink },
        html: `
            <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 20px;">
                <div style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border: 1px solid #e1e4e8;">
                    <div style="background: linear-gradient(135deg, #840029 0%, #a00032 100%); padding: 32px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; text-transform: uppercase;">AutoGrade</h1>
                        <div style="height: 3px; width: 40px; background-color: #FDB913; margin: 12px auto 0; border-radius: 2px;"></div>
                    </div>
                    
                    <div style="padding: 40px 32px;">
                        <h2 style="color: #1a1d23; margin: 0 0 16px; font-size: 22px; font-weight: 700;">Password Reset Request</h2>
                        <p style="color: #4b5563; line-height: 1.6; margin: 0 0 24px; font-size: 16px;">Hi ${userName},</p>
                        <p style="color: #4b5563; line-height: 1.6; margin: 0 0 32px; font-size: 16px;">We received a request to reset your password for your AutoGrade account. If you made this request, please click the button below to set a new password.</p>

                        <div style="text-align: center; margin-bottom: 32px;">
                            <a href="${resetLink}" style="display: inline-block; background-color: #840029; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 6px rgba(132, 0, 41, 0.2); transition: background-color 0.2s;">Reset Password</a>
                            <p style="color: #9ca3af; font-size: 14px; margin-top: 24px;">This link will expire in 1 hour.</p>
                        </div>
                    </div>

                    <div style="padding: 24px 32px; background-color: #fcfcfc; border-top: 1px solid #f0f0f0; text-align: center;">
                        <p style="color: #9ca3af; font-size: 13px; line-height: 1.5; margin: 0;">If you didn't request a password reset, you can safely ignore this email. No changes will be made to your account.</p>
                        <p style="margin-top: 16px; word-break: break-all; font-size: 12px; color: #840029; opacity: 0.7;">
                            <a href="${resetLink}" style="color: #840029; text-decoration: underline;">${resetLink}</a>
                        </p>
                    </div>
                </div>
                <div style="text-align: center; margin-top: 20px;">
                    <p style="color: #9ca3af; font-size: 12px;">&copy; 2026 AutoGrade. All rights reserved.</p>
                </div>
            </div>
        `,
    });
}

module.exports = { generateToken, generateOTP, sendVerificationEmail, sendPasswordResetEmail, getRecentEmailLogs };
