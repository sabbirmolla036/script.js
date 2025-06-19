const puppeteer = require('puppeteer');
const axios = require('axios');

// CONFIG
const INVITE_URL = "https://app.sophon.xyz/invite/";
const DOMAIN = "1secmail.com"; // আপনার টেম্প মেইল ডোমেইন

function generateRandomString(length = 10) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return [...Array(length)].map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
}

async function getVerificationCode(login, waitTime = 120000) {
    const start = Date.now();
    const checkInterval = 5000;
    const regex = /Enter the code below on the login screen to continue:\s*(\d{6})/;

    while (Date.now() - start < waitTime) {
        try {
            const inbox = await axios.get(`https://www.1secmail.com/api/v1/?action=getMessages&login=${login}&domain=${DOMAIN}`);
            if (inbox.data.length > 0) {
                const msgId = inbox.data[0].id;
                const message = await axios.get(`https://www.1secmail.com/api/v1/?action=readMessage&login=${login}&domain=${DOMAIN}&id=${msgId}`);
                const body = message.data.body || message.data.textBody;
                const match = body.match(regex);
                if (match) return match[1];
            }
        } catch (err) {
            console.log("⏳ Waiting for email...");
        }
        await new Promise(r => setTimeout(r, checkInterval));
    }
    return null;
}

async function createAccount(inviteCode, index) {
    const login = generateRandomString(10);
    const email = `${login}@${DOMAIN}`;
    console.log(`[${index}] 📧 Using temp email: ${email}`);

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    try {
        await page.goto(INVITE_URL, { waitUntil: 'networkidle2' });

        await page.waitForSelector("input[type='email'], #email_field", { timeout: 10000 });
        const emailInput = await page.$("input[type='email'], #email_field");
        await emailInput.type(email);

        const textInputs = await page.$$("input[type='text']");
        if (textInputs.length > 0) {
            await textInputs[0].type(inviteCode);
        }

        const button = await page.$("button");
        await button.click();

        console.log(`[${index}] 📨 Waiting for verification code...`);
        const code = await getVerificationCode(login);
        if (!code) {
            console.log(`[${index}] ❌ Code not received.`);
            return;
        }

        console.log(`[${index}] ✅ Received code: ${code}`);
        await page.waitForSelector("input[type='number']", { timeout: 10000 });
        await page.type("input[type='number']", code);
        await page.click("button");

        console.log(`[${index}] 🎉 Account created!`);
    } catch (err) {
        console.error(`[${index}] ❌ Error: ${err.message}`);
    } finally {
        await browser.close();
    }
}

(async () => {
    const inviteCode = process.argv[2];
    const total = parseInt(process.argv[3]) || 1;

    if (!inviteCode) {
        console.log("❗ Usage: node script.js <INVITE_CODE> <NUMBER_OF_ACCOUNTS>");
        process.exit(1);
    }

    for (let i = 1; i <= total; i++) {
        await createAccount(inviteCode, i);
        await new Promise(r => setTimeout(r, 5000 + Math.random() * 3000));
    }
})();
