const puppeteer = require('puppeteer');
const fetch = require('node-fetch');

const INVITE_URL = 'https://app.sophon.xyz/invite/';

function randomString(length = 10) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for(let i=0; i<length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Create temp email from 1secmail API
function createTempEmail() {
  const user = randomString(10);
  const domain = '1secmail.com';
  const email = `${user}@${domain}`;
  return { user, domain, email };
}

// Get list of messages for temp email
async function getMessages(user, domain) {
  const url = `https://www.1secmail.com/api/v1/?action=getMessages&login=${user}&domain=${domain}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    return data;
  } catch {
    return [];
  }
}

// Read single message content
async function readMessage(user, domain, id) {
  const url = `https://www.1secmail.com/api/v1/?action=readMessage&login=${user}&domain=${domain}&id=${id}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}

// Extract verification code from email body (6 digit code)
async function getVerificationCode(user, domain, waitTime = 120000) {
  const pattern = /Enter the code below on the login screen to continue:\s*(\d{6})/;
  const start = Date.now();

  while(Date.now() - start < waitTime) {
    const messages = await getMessages(user, domain);
    for(const msg of messages) {
      const messageData = await readMessage(user, domain, msg.id);
      if(messageData) {
        const body = (messageData.body || '') + ' ' + (messageData.textBody || '');
        // console.log('[DEBUG] Email body:', body);
        const match = body.match(pattern);
        if(match) {
          return match[1];
        }
      }
    }
    // wait 5 seconds before retrying
    await new Promise(r => setTimeout(r, 5000));
  }
  return null;
}

async function createAccount(inviteCode, index) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    const { user, domain, email } = createTempEmail();
    console.log(`[${index}] 📧 Using temp email: ${email}`);

    await page.goto(INVITE_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    // fill email input
    const emailSelector = '#email_field, input[type="email"]';
    await page.waitForSelector(emailSelector, { timeout: 15000 });
    await page.focus(emailSelector);
    await page.evaluate((selector) => {
      document.querySelector(selector).value = '';
    }, emailSelector);
    await page.type(emailSelector, email, { delay: 100 });

    // fill invite code
    const inviteSelector = 'input[name="inviteCode"], input[type="text"]';
    await page.waitForSelector(inviteSelector, { timeout: 15000 });
    await page.focus(inviteSelector);
    await page.evaluate((selector) => {
      document.querySelector(selector).value = '';
    }, inviteSelector);
    await page.type(inviteSelector, inviteCode, { delay: 100 });

    // Click the submit button
    const buttonSelector = 'button';
    await page.waitForSelector(buttonSelector, { timeout: 15000 });
    await page.click(buttonSelector);

    console.log(`[${index}] 📨 Email & invite code submitted. Waiting for verification code...`);

    // wait a few seconds for email to arrive
    await new Promise(r => setTimeout(r, 5000));

    const code = await getVerificationCode(user, domain);

    if(!code) {
      console.log(`[${index}] ❌ Verification code not received.`);
      await browser.close();
      return;
    }

    console.log(`[${index}] ✅ Verification code received: ${code}`);

    // fill verification code input
    const codeSelector = 'input[type="number"], input[name="verificationCode"]';
    await page.waitForSelector(codeSelector, { timeout: 15000 });
    await page.focus(codeSelector);
    await page.evaluate((selector) => {
      document.querySelector(selector).value = '';
    }, codeSelector);
    await page.type(codeSelector, code, { delay: 100 });

    // Submit verification code
    await page.click(buttonSelector);

    console.log(`[${index}] 🎉 Account #${index} created successfully!`);

  } catch (error) {
    console.log(`[${index}] ❌ Error: ${error.message || error}`);
  } finally {
    await browser.close();
  }
}

(async () => {
  const args = process.argv.slice(2);
  if(args.length < 2) {
    console.log('Usage: node script.js <INVITE_CODE> <NUMBER_OF_ACCOUNTS>');
    process.exit(1);
  }
  const inviteCode = args[0];
  const total = parseInt(args[1], 10);

  for(let i=1; i<=total; i++) {
    await createAccount(inviteCode, i);
    // random delay between 5-8 seconds
    await new Promise(r => setTimeout(r, 5000 + Math.random() * 3000));
  }
})();
