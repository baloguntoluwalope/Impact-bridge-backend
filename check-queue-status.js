#!/usr/bin/env node
/**
 * check-queue-status.js
 * 
 * View all pending jobs in BullMQ queues
 * Run: node check-queue-status.js
 */

require('dotenv').config();
const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const redisUrl = process.env.REDIS_URL 
  || `redis://${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || 6379}`;

const isTLS = redisUrl.startsWith('rediss://');
const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  ...(isTLS && { tls: { rejectUnauthorized: false } }),
});

const queueNames = ['email', 'sms', 'push', 'notification', 'payment', 'report', 'reconciliation', 'dead-letter'];

(async () => {
  console.log('\n📊 BullMQ Queue Status\n');
  console.log('='.repeat(60));

  let totalJobs = 0;

  for (const queueName of queueNames) {
    const queue = new Queue(queueName, { connection, prefix: '{bull}' });

    try {
      const counts = await queue.getJobCounts();
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      
      if (total > 0) {
        console.log(`\n📋 ${queueName.toUpperCase()}`);
        console.log(`   Waiting:   ${counts.waiting || 0} jobs`);
        console.log(`   Active:    ${counts.active || 0} jobs`);
        console.log(`   Delayed:   ${counts.delayed || 0} jobs`);
        console.log(`   Failed:    ${counts.failed || 0} jobs`);
        console.log(`   Completed: ${counts.completed || 0} jobs`);
        
        totalJobs += total;

        // Show waiting jobs
        if (counts.waiting > 0) {
          const waitingJobs = await queue.getWaiting(0, 5);
          console.log(`\n   📌 First 5 waiting jobs:`);
          waitingJobs.forEach(job => {
            console.log(`      - ${job.name} (ID: ${job.id})`);
          });
          if (counts.waiting > 5) {
            console.log(`      ... and ${counts.waiting - 5} more`);
          }
        }
      }

      await queue.close();
    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n✅ Total jobs across all queues: ${totalJobs}\n`);

  if (totalJobs > 0) {
    console.log('📍 Action: Start the worker with: npm run worker\n');
  }

  connection.disconnect();
  process.exit(0);
})().catch(err => {
  console.error('Error:', err.message);
  connection.disconnect();
  process.exit(1);
});
