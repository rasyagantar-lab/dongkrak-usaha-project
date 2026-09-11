const axios = require('axios');
const cheerio = require('cheerio');

async function testConnection() {
  try {
    const res = await axios.get('https://dongkrakusaha.com/panelMember/', { timeout: 10000 });
    console.log('Status:', res.status);
    console.log('Cookies:', res.headers['set-cookie']);
    const $ = cheerio.load(res.data);
    console.log('Form Action:', $('form').attr('action'));
    console.log('Inputs:', $('form input').map((i, el) => $(el).attr('name')).get());
  } catch (err) {
    console.error('Error:', err.message);
  }
}
testConnection();
