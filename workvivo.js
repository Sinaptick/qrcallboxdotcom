// Workvivo messaging service for store 1458
const WORKVIVO_BOT_URL = 'http://34.45.52.250:5002/send';

/**
 * Send a message to store 1458 via the Workvivo bot
 * @param {string} message - The message to send
 * @returns {Promise<boolean>} - True if message was queued successfully
 */
export async function sendToStore1458(message) {
    try {
        const response = await fetch(WORKVIVO_BOT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message })
        });

        if (response.ok) {
            console.log(`Message queued for store 1458: ${message}`);
            return true;
        } else {
            console.error(`Failed to send message: ${response.status} ${response.statusText}`);
            return false;
        }
    } catch (error) {
        console.error('Error sending message to Workvivo:', error);
        return false;
    }
}

/**
 * Check if the Workvivo bot is running
 * @returns {Promise<boolean>} - True if bot is available
 */
export async function checkWorkvivoBotStatus() {
    try {
        const response = await fetch(WORKVIVO_BOT_URL, {
            method: 'GET'
        });
        return response.ok;
    } catch (error) {
        console.error('Workvivo bot not available:', error);
        return false;
    }
}